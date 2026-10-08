import assert from "node:assert/strict";
import test from "node:test";
import type { Prisma, prisma } from "@gprn/db";
import {
  demoBattleAuthors,
  demoChallenges,
  demoChallengeWorks,
} from "@gprn/domain";
import {
  seedDemoChallenges,
  type DemoWorkAsset,
} from "./demo-challenge-seed.js";

const now = new Date("2026-10-08T12:00:00Z");
const assets: DemoWorkAsset[] = [
  ...demoChallengeWorks.flatMap((work) => [
    {
      id: work.id,
      contentType: work.mediaType === "VIDEO" ? "video/mp4" : "image/webp",
      type: "DISPLAY" as const,
    },
    ...(work.mediaType === "VIDEO"
      ? [{ id: work.id, contentType: "image/webp", type: "THUMBNAIL" as const }]
      : []),
  ]),
  ...demoBattleAuthors.map((author) => ({
    id: author.id,
    contentType: "image/webp",
    type: "DISPLAY" as const,
  })),
].map((asset) => ({
  sourceId: asset.id,
  type: asset.type,
  contentType: asset.contentType,
  bucket: "public",
  storageKey: `${asset.id}/${asset.type}`,
  publicUrl: `https://cdn.test/${asset.id}/${asset.type}`,
  byteSize: 1000,
  width: 1200,
  height: 800,
  checksumSha256: "sample-checksum",
  durationSeconds: asset.contentType === "video/mp4" ? 12 : undefined,
}));

function mockDatabase() {
  const users = new Map<string, Record<string, unknown>>();
  const photos = new Map<string, Record<string, unknown>>();
  const challenges = new Map<string, Record<string, unknown>>();
  const delegate = (rows: Map<string, Record<string, unknown>>) => ({
    async findUnique(input: { where: { id: string } }) {
      return rows.get(input.where.id) ?? null;
    },
    async upsert(input: {
      where: { id: string };
      create: Record<string, unknown>;
      update: Record<string, unknown>;
    }) {
      if (!rows.has(input.where.id))
        rows.set(input.where.id, { deletedAt: null, ...input.create });
      return rows.get(input.where.id);
    },
    async create(input: { data: Record<string, unknown> & { id: string } }) {
      assert(!rows.has(input.data.id));
      rows.set(input.data.id, input.data);
      return input.data;
    },
  });
  const tx = {
    user: delegate(users),
    photo: delegate(photos),
    challenge: delegate(challenges),
    category: {
      async findMany() {
        return ["documentary", "architecture", "street"].map((slug) => ({
          id: slug,
          slug,
        }));
      },
    },
    season: {
      async findFirst() {
        return null;
      },
    },
    city: {
      async findFirst(input: { where: { slug: string } }) {
        return { id: input.where.slug, countryId: "country" };
      },
    },
  };
  const client = {
    async $transaction<T>(run: (tx: Prisma.TransactionClient) => Promise<T>) {
      const snapshots = [users, photos, challenges].map((map) =>
        structuredClone(map),
      );
      try {
        return await run(tx as unknown as Prisma.TransactionClient);
      } catch (error) {
        [users, photos, challenges].forEach((map, index) => {
          map.clear();
          snapshots[index]!.forEach((value, key) => map.set(key, value));
        });
        throw error;
      }
    },
  } as unknown as Pick<typeof prisma, "$transaction">;
  return { client, users, photos, challenges };
}

test("seed creates active challenges, six public approved stock works and non-login demo profiles", async () => {
  const db = mockDatabase();
  assert.deepEqual(await seedDemoChallenges(db.client, assets, now), {
    created: 3,
    existing: 0,
  });
  assert.equal(db.users.size, 6);
  assert.equal(db.photos.size, 6);
  for (const user of db.users.values()) {
    assert.equal(user.passwordHash, null);
    assert(String(user.email).endsWith("@demo.gprn.invalid"));
  }
  for (const photo of db.photos.values()) {
    assert.equal(photo.status, "PUBLISHED");
    assert.equal(photo.moderationStatus, "APPROVED");
    assert(String(photo.description).includes("Source: https://"));
    assert.equal(
      (photo.location as { create: { visibility: string } }).create.visibility,
      "HIDDEN",
    );
  }
  for (const challenge of db.challenges.values()) {
    assert.equal(challenge.status, "ACTIVE");
    assert((challenge.endsAt as Date) > now);
    assert.equal((challenge.entries as { create: unknown[] }).create.length, 2);
  }
});

test("rerun preserves renamed/cancelled challenges, covers, dates, moderation and withdrawals", async () => {
  const db = mockDatabase();
  await seedDemoChallenges(db.client, assets, now);
  const edited = db.challenges.get(demoChallenges[0]!.id)!;
  Object.assign(edited, {
    title: "Custom title",
    coverUrl: "custom-cover",
    status: "CANCELLED",
    entries: { create: [] },
  });
  db.photos.get(demoChallengeWorks[0]!.id)!.moderationStatus = "REJECTED";
  const before = structuredClone([...db.challenges]);
  assert.deepEqual(
    await seedDemoChallenges(db.client, [], new Date("2027-01-01")),
    { created: 0, existing: 3 },
  );
  assert.deepEqual([...db.challenges], before);
  assert.equal(
    db.photos.get(demoChallengeWorks[0]!.id)!.moderationStatus,
    "REJECTED",
  );
});

test("missing poster rolls back the entire database transaction", async () => {
  const db = mockDatabase();
  await assert.rejects(
    seedDemoChallenges(
      db.client,
      assets.filter((asset) => asset.type !== "THUMBNAIL"),
      now,
    ),
    /Missing prepared demo asset/,
  );
  assert.equal(db.users.size, 0);
  assert.equal(db.photos.size, 0);
  assert.equal(db.challenges.size, 0);
});

test("reserved IDs cannot claim another account or someone else's photo", async () => {
  for (const collision of ["user", "photo"]) {
    const db = mockDatabase();
    if (collision === "user")
      db.users.set(demoBattleAuthors[0]!.id, { email: "real@example.com" });
    else db.photos.set(demoChallengeWorks[0]!.id, { ownerId: "real-author" });
    await assert.rejects(
      seedDemoChallenges(db.client, assets, now),
      /belongs to another/,
    );
    assert.equal(db.challenges.size, 0);
  }
});
