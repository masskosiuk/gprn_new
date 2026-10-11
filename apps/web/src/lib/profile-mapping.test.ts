import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { canonicalProfileUsername } from "./profile-source.ts";

const source = ts.createSourceFile(
  "home-client.tsx",
  readFileSync(
    new URL("../app/[locale]/home-client.tsx", import.meta.url),
    "utf8",
  ),
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TSX,
);
const names = [
  "mapServerProfileToAccount",
  "mapServerPublicProfile",
  "getPhotoAuthorId",
  "normalizeServerTier",
];
const functions = source.statements
  .filter(
    (node) =>
      ts.isFunctionDeclaration(node) && names.includes(node.name?.text ?? ""),
  )
  .map((node) => node.getText(source))
  .join("\n");
const mapped = runInNewContext(
  ts.transpileModule(`${functions}\n({ ${names.join(", ")} });`, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.None,
    },
  }).outputText,
  {
    canonicalProfileUsername,
    getMessage: () => "Default biography",
    getServerProfileLocation: () => "Kyiv",
    getServerProfileLocationSelection: () => undefined,
    inferLocationId: () => undefined,
    sampleImages: { accountDefault: "wrong-avatar", street: "wrong-cover" },
  },
);
const profile = {
  username: "author",
  avatarUrl: "https://cdn.test/author-avatar.webp",
  coverUrl: "https://cdn.test/author-cover.webp",
  availableForHire: true,
  displayName: "Author",
  bio: "Author bio",
  followers: 7,
  following: 2,
  tier: "PROFESSIONAL",
  websiteUrl: null,
  digitalProducts: [],
  ratings: [
    { scope: "GLOBAL", scopeKey: "global", rating: 1574, wins: 3, battles: 9 },
  ],
};
const user = { email: "author@example.invalid" };

test("owner and guest use the same server images and reputation", () => {
  const mine = mapped.mapServerProfileToAccount(user, profile, "ru");
  const guest = mapped.mapServerPublicProfile(profile, "ru");
  for (const field of [
    "avatarUrl",
    "coverUrl",
    "followers",
    "rating",
    "wins",
    "username",
  ]) {
    assert.equal(mine[field], guest[field]);
  }
});

test("missing server images never use browser leftovers or another person's pictures", () => {
  const empty = { ...profile, avatarUrl: null, coverUrl: null };
  const mine = mapped.mapServerProfileToAccount(user, empty, "ru", {
    avatarUrl: "old-local-avatar",
    coverUrl: "old-local-cover",
  });
  const guest = mapped.mapServerPublicProfile(empty, "ru");
  assert.equal(mine.avatarUrl, undefined);
  assert.equal(mine.coverUrl, undefined);
  assert.equal(guest.avatarUrl, "");
  assert.equal(guest.coverUrl, "");
});

test("sharing your own work uses the author's permanent username, never me", () => {
  assert.equal(
    mapped.getPhotoAuthorId({ isMine: true, authorUsername: "author" }),
    "author",
  );
  assert.equal(
    mapped.getPhotoAuthorId({ isMine: false, authorUsername: "author" }),
    "author",
  );
  assert.equal(
    mapped.getPhotoAuthorId({ isMine: false, authorKey: "data.author.mika" }),
    "demo.mika.tanaka",
  );
});

test("server scores ignore demo reviews but reflect freshly loaded server reviews", () => {
  let scoring: ts.FunctionDeclaration | undefined;
  function visit(node: ts.Node) {
    if (
      ts.isFunctionDeclaration(node) &&
      node.name?.text === "getPhotoCriterionScores"
    )
      scoring = node;
    ts.forEachChild(node, visit);
  }
  visit(source);
  assert(scoring);
  const context = {
    photoReviews: {} as Record<string, { scores: { color: number } }[]>,
    samplePhotoReviews: { photo: [{ scores: { color: 9 } }] },
    battleCriteria: [{ id: "color" }],
  };
  const score = runInNewContext(
    ts.transpileModule(`${scoring.getText(source)}\ngetPhotoCriterionScores;`, {
      compilerOptions: { target: ts.ScriptTarget.ES2022 },
    }).outputText,
    context,
  );
  const photo = {
    id: "photo",
    serverBacked: true,
    score: 99,
    criterionScores: null,
  };
  assert.equal(score(photo), null);
  assert.equal(score({ ...photo, criterionScores: { color: 4 } }).color, 4);
  context.photoReviews.photo = [
    { scores: { color: 6 } },
    { scores: { color: 8 } },
  ];
  assert.equal(score(photo).color, 7);
});
