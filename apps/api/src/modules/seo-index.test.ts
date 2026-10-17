import assert from "node:assert/strict";
import test from "node:test";
import {
  indexablePhoto,
  indexablePost,
  indexableProfile,
  demoSeoUsernames,
  seoEntry,
} from "./seo-index.js";
import { prisma } from "@gprn/db";
import { SeoController } from "./seo.controller.js";

test("SEO index requires public, active, approved, undeleted content and excludes demo accounts", () => {
  assert.equal(indexableProfile.visibility, "PUBLIC");
  assert.equal(indexableProfile.deletedAt, null);
  assert.equal(indexableProfile.user.status, "ACTIVE");
  assert.ok(demoSeoUsernames.includes("demo.mika.tanaka"));
  assert.ok(demoSeoUsernames.includes("demo.iryna.melnyk"));
  assert.ok(
    indexableProfile.userId.notIn.includes(
      "de000001-0000-4000-8000-000000000001",
    ),
  );
  assert.equal(indexablePhoto.status, "PUBLISHED");
  assert.equal(indexablePhoto.moderationStatus, "APPROVED");
  assert.deepEqual(indexablePhoto.NOT, { title: { startsWith: "__profile_" } });
  assert.equal(indexablePost.demoKey, null);
  assert.deepEqual(
    seoEntry("profile", { author: "author" }, new Date("2026-10-10T12:00:00Z")),
    {
      section: "profile",
      query: { author: "author" },
      updatedAt: "2026-10-10T12:00:00.000Z",
    },
  );
});
test("sitemap source exposes only entity identity and real modification dates with bounded DB queries", async () => {
  const models = [
    prisma.profile,
    prisma.photo,
    prisma.communityPost,
    prisma.challenge,
  ];
  const originals = models.map((model) => model.findMany);
  const calls: any[] = [];
  const date = new Date("2026-10-12T12:00:00Z");
  const rows = [
    [{ username: "author", updatedAt: date }],
    [
      {
        id: "photo",
        updatedAt: date,
        owner: { profile: { username: "author" } },
      },
    ],
    [{ id: "post", kind: "EVENT", updatedAt: date }],
    [{ slug: "challenge", updatedAt: date }],
  ];
  try {
    for (const [index, model] of models.entries())
      (model as any).findMany = async (query: unknown) => {
        calls.push(query);
        return rows[index];
      };
    const result = await new SeoController().index();
    assert.equal(result.entries.length, 4);
    assert.equal(result.entries[2]?.section, "events");
    assert.ok(
      calls.every(
        (query) => query.take <= 1000 && query.select && !query.include,
      ),
    );
    assert.ok(!JSON.stringify(result).includes("email"));
    assert.ok(!JSON.stringify(result).includes("storageKey"));
    assert.ok(!JSON.stringify(result).includes("password"));
  } finally {
    models.forEach((model, index) => {
      (model as any).findMany = originals[index];
    });
  }
});
