import assert from "node:assert/strict";
import test from "node:test";
import type { Prisma, prisma } from "@gprn/db";
import { demoBattleAuthors, demoBattlePhotos, demoBattles } from "@gprn/domain";
import { seedDemoBattles, type DemoImageAsset } from "./demo-battle-seed.js";

const now = new Date("2026-10-08T12:00:00Z");
const assets: DemoImageAsset[] = [
  ...demoBattlePhotos,
  ...demoBattleAuthors,
].map((source) => ({
  sourceId: source.id,
  bucket: "public",
  storageKey: `demo/battles/v1/${source.id}.jpg`,
  byteSize: 1000,
  width: 1200,
  height: 800,
  checksumSha256: "sample-checksum",
}));

function mockDatabase() {
  const users = new Map<string, Record<string, unknown>>();
  const photos = new Map<string, Record<string, unknown>>();
  const battles = new Map<string, Record<string, unknown>>();
  const delegate = (rows: Map<string, Record<string, unknown>>) => ({
    async upsert(input: {
      where: { id: string };
      create: Record<string, unknown>;
      update: Record<string, unknown>;
    }) {
      if (!rows.has(input.where.id))
        rows.set(input.where.id, { deletedAt: null, ...input.create });
      return rows.get(input.where.id);
    },
    async findUnique(input: { where: { id: string } }) {
      return rows.get(input.where.id) ?? null;
    },
    async findMany(input: { where: { id: { in: string[] } } }) {
      return input.where.id.in.flatMap((id) =>
        rows.has(id) ? [rows.get(id)] : [],
      );
    },
    async create(input: { data: Record<string, unknown> & { id: string } }) {
      assert(!rows.has(input.data.id));
      const record = { ...input.data, votes: [] };
      rows.set(input.data.id, record);
      return record;
    },
  });
  const transaction = {
    category: {
      async findMany() {
        return ["street", "architecture", "documentary", "wildlife"].map(
          (slug) => ({ id: slug, slug }),
        );
      },
    },
    city: {
      async findMany() {
        return demoBattleAuthors.map((author) => ({
          id: author.city,
          countryId: author.country,
          slug: author.city,
          latitude: 1,
          longitude: 2,
          country: { slug: author.country },
        }));
      },
    },
    user: delegate(users),
    photo: delegate(photos),
    battle: delegate(battles),
  };
  const client = {
    async $transaction<T>(run: (tx: Prisma.TransactionClient) => Promise<T>) {
      const snapshots = [users, photos, battles].map((rows) =>
        structuredClone(rows),
      );
      try {
        return await run(transaction as unknown as Prisma.TransactionClient);
      } catch (error) {
        [users, photos, battles].forEach((rows, index) => {
          rows.clear();
          snapshots[index]!.forEach((value, key) => rows.set(key, value));
        });
        throw error;
      }
    },
  } as unknown as Pick<typeof prisma, "$transaction">;
  return { client, users, photos, battles };
}

test("five pairs use distinct photos from different demo masters in matching categories", () => {
  assert.equal(new Set(demoBattles.map((battle) => battle.id)).size, 5);
  assert.equal(
    new Set(demoBattles.flatMap((battle) => [...battle.photoIds])).size,
    10,
  );
  for (const battle of demoBattles) {
    const entries = battle.photoIds.map((id) =>
      demoBattlePhotos.find((photo) => photo.id === id)!,
    );
    assert.equal(entries.length, 2);
    assert.notEqual(entries[0]!.author, entries[1]!.author);
    entries.forEach((photo) => assert.equal(photo.category, battle.category));
  }
  assert.equal(new Set(demoBattlePhotos.map((photo) => photo.author)).size, 6);
});

test("seed creates approved public photos and open battles without fabricated votes", async () => {
  const db = mockDatabase();
  assert.deepEqual(await seedDemoBattles(db.client, assets, now), {
    created: 5,
    existing: 0,
  });
  assert.equal(db.users.size, 6);
  assert.equal(db.photos.size, 10);
  for (const user of db.users.values()) {
    assert.equal(user.passwordHash, null);
    assert(String(user.email).endsWith("@demo.gprn.invalid"));
  }
  for (const photo of db.photos.values()) {
    assert.equal(photo.status, "PUBLISHED");
    assert.equal(photo.visibility, "PUBLIC");
    assert.equal(photo.moderationStatus, "APPROVED");
  }
  for (const battle of db.battles.values()) {
    assert.equal(battle.status, "OPEN");
    assert((battle.endsAt as Date) > now);
    assert.deepEqual(battle.votes, []);
    const entries = (
      battle.entries as {
        create: { userId: string; slot: string; moderationStatus: string }[];
      }
    ).create;
    assert.deepEqual(
      entries.map((entry) => entry.slot),
      ["A", "B"],
    );
    assert.notEqual(entries[0]!.userId, entries[1]!.userId);
    entries.forEach((entry) =>
      assert.equal(entry.moderationStatus, "APPROVED"),
    );
  }
});

test("repeating the seed preserves votes, closed battles, ratings and moderation", async () => {
  const db = mockDatabase();
  await seedDemoBattles(db.client, assets, now);
  const battle = db.battles.get(demoBattles[0].id)!;
  battle.status = "CLOSED";
  battle.endsAt = now;
  battle.votes = [
    { voterId: "real-user", selectedPhotoId: demoBattlePhotos[0].id },
  ];
  db.photos.get(demoBattlePhotos[0].id)!.moderationStatus = "REJECTED";
  db.users.get(demoBattleAuthors[0].id)!.ratings = { rating: 1630 };
  const before = structuredClone([db.users, db.photos, db.battles]);
  assert.deepEqual(
    await seedDemoBattles(db.client, assets, new Date("2026-12-01")),
    { created: 0, existing: 5 },
  );
  assert.deepEqual([db.users, db.photos, db.battles], before);
});

test("missing images roll back instead of leaving partial demo data", async () => {
  const db = mockDatabase();
  await assert.rejects(
    seedDemoBattles(db.client, assets.slice(0, 11), now),
    /Missing prepared demo image/,
  );
  assert.equal(db.users.size, 0);
  assert.equal(db.photos.size, 0);
  assert.equal(db.battles.size, 0);
});

test("reserved IDs cannot overwrite real users or photos", async () => {
  const db = mockDatabase();
  db.users.set(demoBattleAuthors[0].id, { email: "real@example.com" });
  await assert.rejects(
    seedDemoBattles(db.client, assets, now),
    /belongs to another account/,
  );
  assert.equal(db.users.size, 1);
  assert.equal(db.photos.size, 0);
});

test("rejected demo photos are not silently reapproved for a new battle", async () => {
  const db = mockDatabase();
  await seedDemoBattles(db.client, assets, now);
  db.battles.delete(demoBattles[0].id);
  db.photos.get(demoBattlePhotos[0].id)!.moderationStatus = "REJECTED";
  await assert.rejects(
    seedDemoBattles(db.client, assets, now),
    /unavailable or rejected/,
  );
  assert.equal(db.battles.size, 4);
  assert.equal(
    db.photos.get(demoBattlePhotos[0].id)!.moderationStatus,
    "REJECTED",
  );
});
