import assert from "node:assert/strict";
import test from "node:test";
import {
  checkPublicationAccess,
  parseCommunityPost,
  parseInquiry,
  publicationIntervalMs,
  requireUuid,
} from "./community-policy.js";
const now = new Date("2026-10-09T12:00:00Z");
const post = {
  kind: "DISCUSSION",
  title: "A question",
  body: "Why this framing?",
  location: "Paris",
  language: "en",
  startsAt: now.toISOString(),
};
const status = (value: unknown, expected: number) =>
  Boolean(
    value &&
    typeof value === "object" &&
    "getStatus" in value &&
    (value.getStatus as () => number)() === expected,
  );

test("events require a current subscription, not the photographer's rank", () => {
  assert.throws(
    () => checkPublicationAccess("EVENT", null, undefined, now),
    (e) => status(e, 403),
  );
  assert.throws(
    () => checkPublicationAccess("EVENT", now, undefined, now),
    (e) => status(e, 403),
  );
  assert.doesNotThrow(() =>
    checkPublicationAccess(
      "EVENT",
      new Date(now.getTime() + 1000),
      undefined,
      now,
    ),
  );
});
test("72-hour publication limits have an exact boundary and Pro bypass", () => {
  for (const kind of ["DISCUSSION", "CASTING"] as const) {
    assert.throws(
      () =>
        checkPublicationAccess(
          kind,
          null,
          new Date(now.getTime() - publicationIntervalMs + 1),
          now,
        ),
      (e) => status(e, 429),
    );
    assert.doesNotThrow(() =>
      checkPublicationAccess(
        kind,
        null,
        new Date(now.getTime() - publicationIntervalMs),
        now,
      ),
    );
    assert.doesNotThrow(() =>
      checkPublicationAccess(kind, new Date(now.getTime() + 1000), now, now),
    );
  }
});
test("posts validate kinds, text limits, language and date ranges", () => {
  assert.equal(parseCommunityPost(post).title, post.title);
  for (const invalid of [
    { kind: "OTHER" },
    { title: "x".repeat(181) },
    { body: "" },
    { startsAt: "invalid" },
    { language: "<en>" },
    { endsAt: "2020-01-01" },
  ])
    assert.throws(
      () => parseCommunityPost({ ...post, ...invalid }),
      (e) => status(e, 400),
    );
  assert.equal(
    parseCommunityPost({
      ...post,
      sourceType: "PHOTO",
      sourceId: "de000002-0000-4000-8000-000000000001",
    }).sourceType,
    "PHOTO",
  );
  assert.throws(
    () => parseCommunityPost({ ...post, sourceType: "PRIVATE_FILE" }),
    (e) => status(e, 400),
  );
});
test("discussion card sources are accepted without trusting client covers or links", () => {
  for (const sourceType of [
    "PROFILE",
    "MODEL",
    "STUDIO",
    "BATTLE",
    "CHALLENGE",
  ]) {
    const parsed = parseCommunityPost({
      ...post,
      sourceType,
      sourceId: "source",
      sourcePath: "https://untrusted.invalid",
      sourceCoverUrl: "https://untrusted.invalid/cover.jpg",
    });
    assert.equal(parsed.sourceType, sourceType);
    assert.equal("sourcePath" in parsed, false);
    assert.equal("sourceCoverUrl" in parsed, false);
  }
});

test("reports cannot send administrators to an external or authenticated URL", () => {
  const report = {
    kind: "REPORT",
    body: "Concern",
    targetType: "PHOTO",
    targetId: "photo",
  };
  assert.equal(
    parseInquiry({ ...report, targetPath: "/ru/profile?author=demo" })
      .targetPath,
    "/ru/profile?author=demo",
  );
  for (const targetPath of [
    "https://evil.invalid",
    "//evil.invalid",
    "/ru/../admin",
    "/ru/profile\\evil",
    "javascript:alert(1)",
  ])
    assert.throws(
      () => parseInquiry({ ...report, targetPath }),
      (e) => status(e, 400),
    );
  assert.throws(
    () => parseInquiry({ kind: "REPORT", body: "missing target" }),
    (e) => status(e, 400),
  );
  assert.equal(parseInquiry({ body: "An idea" }).kind, "SUGGESTION");
});
test("only canonical UUID identifiers reach database queries", () => {
  assert.equal(
    requireUuid("de000002-0000-4000-8000-000000000001"),
    "de000002-0000-4000-8000-000000000001",
  );
  assert.throws(
    () => requireUuid("not-a-uuid"),
    (e) => status(e, 400),
  );
});
