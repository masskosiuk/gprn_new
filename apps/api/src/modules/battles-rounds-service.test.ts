import assert from "node:assert/strict";
import test from "node:test";
import { prisma } from "@gprn/db";
import { BattlesService } from "./battles.service.js";
import type { CurrentUser } from "./auth.service.js";
import type { CookieRequest } from "./http.types.js";

Object.assign(process.env, {
  NODE_ENV: "test",
  APP_ENV: "local",
  APP_URL: "https://site.invalid",
  API_URL: "https://api.invalid",
  DATABASE_URL: "postgresql://test:test@127.0.0.1:1/test",
  REDIS_URL: "redis://127.0.0.1:1",
  S3_ENDPOINT: "https://storage.invalid",
  S3_REGION: "test",
  S3_ACCESS_KEY: "test",
  S3_SECRET_KEY: "test",
  S3_BUCKET_PUBLIC: "public",
  S3_BUCKET_PRIVATE: "private",
  ENCRYPTION_KEY: "test",
  SESSION_SECRET: "test",
});

const voter = (id: string) =>
  ({ id, profile: { tier: "STAR" } }) as CurrentUser;
const request = { headers: {}, ip: "127.0.0.1" } as CookieRequest;

function fixture(t: { after(fn: () => void): void }, initialVotes = 9) {
  const season = {
    id: "season",
    status: "ACTIVE",
    startsAt: new Date("2020-01-01"),
    endsAt: new Date("2099-01-01"),
    battleFinalizedAt: null,
  };
  const entries = ["a", "b"].map((id) => ({
    id,
    photoId: id,
    userId: `owner-${id}`,
    slot: id === "a" ? "A" : "B",
    round: 1,
    moderationStatus: "APPROVED",
    photo: {
      id,
      title: id,
      categoryId: "street",
      moderationStatus: "APPROVED",
      status: "PUBLISHED",
      visibility: "PUBLIC",
      deletedAt: null,
      assets: [],
      location: null,
      provenance: null,
      owner: {
        id: `owner-${id}`,
        status: "ACTIVE",
        profile: {
          displayName: id,
          username: id,
          visibility: "PUBLIC",
          deletedAt: null,
        },
        ratings: [],
      },
    },
  }));
  const battle = {
    id: "battle",
    seasonId: season.id,
    season: { ...season, name: "Test", slug: "test", nameKey: "test" },
    category: null,
    categoryId: "street",
    status: "OPEN",
    startsAt: new Date(),
    endsAt: season.endsAt,
    entries,
    votes: Array.from({ length: initialVotes + 3 }, (_, i) => ({
      createdAt: new Date(),
      selectedEntryId: i < initialVotes ? "a" : "b",
      voterId: `old-${i}`,
      weightMinor: 1000,
    })),
  };
  const progress = ["a", "b"].map((id) => ({
    id,
    photoId: id,
    seasonId: season.id,
    userId: `owner-${id}`,
    categoryId: "street",
    currentBattleId: battle.id,
    currentBattle: null,
    status: "ACTIVE",
    round: 1,
    votes: id === "a" ? initialVotes : 3,
    wonRounds: 0,
    photo: { categoryId: "street" },
  }));
  const writes: any[] = [];
  let ratings = 0;
  const tx = {
    $executeRaw: async () => 1,
    battle: {
      findUnique: async () => structuredClone(battle),
      findMany: async () => [
        { entries: entries.map((e) => ({ photoId: e.photoId })) },
      ],
      update: async ({ data }: any) => Object.assign(battle, data),
      create: async () => {
        throw new Error("A previous pair must never be repeated");
      },
    },
    season: { findUnique: async () => season },
    battleVote: {
      count: async () => 0,
      create: async ({ data }: any) => {
        if (battle.votes.some((vote) => vote.voterId === data.voterId))
          throw { code: "P2002" };
        battle.votes.push({ ...data, createdAt: new Date() });
      },
    },
    battleEntry: {
      findFirst: async ({ where }: any) => {
        const entry = entries.find((entry) => entry.userId === where.userId);
        return entry ? { ...entry, battle: structuredClone(battle) } : null;
      },
    },
    battleProgress: {
      findUnique: async ({ where }: any) =>
        progress.find((row) => row.photoId === where.seasonId_photoId.photoId),
      findMany: async ({ where }: any) =>
        progress.filter((p) => p.status === where.status),
      findFirst: async ({ where }: any) =>
        progress.find(
          (p) =>
            p.userId === where.userId &&
            p.photoId === where.photoId &&
            p.currentBattleId === where.currentBattleId &&
            where.status.in.includes(p.status),
        ),
      update: async ({ where, data }: any) =>
        Object.assign(
          progress.find((p) => p.id === where.id)!,
          data,
        ),
      updateMany: async ({ where, data }: any) => {
        writes.push({ where, data });
        const matches = progress.filter((p: any) =>
          Object.entries(where).every(([key, value]: any) =>
            typeof value === "object"
              ? value.in
                ? value.in.includes(p[key])
                : p[key] !== value.not
              : value === p[key],
          ),
        );
        for (const row of matches)
          for (const [key, value] of Object.entries(data))
            (row as any)[key] =
              typeof value === "object"
                ? (row as any)[key] + (value as any).increment
                : value;
        return { count: matches.length };
      },
    },
    notification: {
      createMany: async () => ({ count: 2 }),
      create: async () => ({}),
    },
    analyticsEvent: { create: async () => ({}) },
  };
  const original = prisma.$transaction,
    read = prisma.battle.findUniqueOrThrow;
  let tail = Promise.resolve();
  (prisma as any).$transaction = (fn: any) => {
    const result = tail.then(() => fn(tx));
    tail = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  };
  (prisma.battle as any).findUniqueOrThrow = async () =>
    structuredClone(battle);
  t.after(() => {
    prisma.$transaction = original;
    prisma.battle.findUniqueOrThrow = read;
  });
  const service = new BattlesService();
  (service as any).applyBattleRating = async () => {
    ratings++;
    return [];
  };
  (service as any).unlockBattleAchievements = async () => {};
  return { service, battle, progress, writes, season, ratings: () => ratings };
}

test("ten actual votes cannot finish a round even when STAR vote weights exceed the threshold", async (t) => {
  const db = fixture(t);
  const result = await db.service.vote(
    voter("ten"),
    "battle",
    { selectedEntryId: "a" },
    request,
  );
  assert.equal(result.battle.status, "OPEN");
  assert.equal(result.battle.entries[0]!.votes, 10);
  assert.equal(db.progress[0]!.votes, 10);
  assert.equal(db.ratings(), 0);
});

test("eleven votes close the round once, retain every vote and advance both photographs", async (t) => {
  const db = fixture(t, 10);
  const result = await db.service.vote(
    voter("eleven"),
    "battle",
    { selectedEntryId: "a" },
    request,
  );
  assert.equal(result.battle.status, "CLOSED");
  assert.equal(db.battle.votes.length, 14);
  assert.deepEqual(
    db.progress.map((p) => [p.round, p.votes, p.status, p.wonRounds]),
    [
      [2, 11, "WAITING", 1],
      [2, 3, "WAITING", 0],
    ],
  );
  assert.equal(db.ratings(), 1);
});

test("simultaneous final votes cannot finish or rate the same round twice", async (t) => {
  const db = fixture(t, 10);
  const results = await Promise.allSettled(
    ["first", "second"].map((id) =>
      db.service.vote(voter(id), "battle", { selectedEntryId: "a" }, request),
    ),
  );
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal(db.battle.votes.length, 14);
  assert.equal(db.ratings(), 1);
  assert.equal(db.progress[0]!.round, 2);
});

test("duplicates, self votes and voting after the season ends cannot change progress", async (t) => {
  const db = fixture(t);
  await assert.rejects(
    db.service.vote(
      voter("old-0"),
      "battle",
      { selectedEntryId: "a" },
      request,
    ),
  );
  await assert.rejects(
    db.service.vote(
      voter("owner-a"),
      "battle",
      { selectedEntryId: "a" },
      request,
    ),
  );
  db.season.endsAt = new Date("2020-01-01");
  await assert.rejects(
    db.service.vote(voter("late"), "battle", { selectedEntryId: "a" }, request),
  );
  assert.equal(db.progress[0]!.votes, 9);
  assert.equal(db.battle.votes.length, 12);
  assert.equal(db.ratings(), 0);
});

test("a cross-genre pair cannot receive votes after a photograph is reclassified", async (t) => {
  const db = fixture(t);
  db.battle.entries[0]!.photo.categoryId = "portrait";
  await assert.rejects(
    db.service.vote(
      voter("genre-check"),
      "battle",
      { selectedEntryId: "a" },
      request,
    ),
    (error: any) => error.getResponse().code === "BATTLE_NOT_READY",
  );
  assert.equal(db.progress[0]!.votes, 9);
  assert.equal(db.battle.votes.length, 12);
});

test("withdrawing cancels only the current pair and preserves votes while the opponent keeps participating", async (t) => {
  const db = fixture(t);
  await db.service.withdraw(voter("owner-a"), "battle");
  assert.equal(db.battle.status, "CANCELLED");
  assert.equal(db.battle.votes.length, 12);
  assert.equal(db.progress[0]!.status, "WITHDRAWN");
  assert.equal(db.progress[0]!.votes, 9);
  assert.equal(db.progress[1]!.status, "WAITING");
  assert.equal(db.progress[1]!.round, 2);
  assert.equal(db.progress[1]!.votes, 3);
  assert.equal(db.ratings(), 0);
});

test("a different account cannot withdraw another photographer's work", async (t) => {
  const db = fixture(t);
  await assert.rejects(
    db.service.withdraw(voter("not-an-owner"), "battle"),
    (error: any) => error.getResponse().code === "BATTLE_ENTRY_NOT_FOUND",
  );
  assert.equal(db.battle.status, "OPEN");
  assert.equal(db.progress[0]!.status, "ACTIVE");
  assert.equal(db.battle.votes.length, 12);
});

test("my battles paginate all owned photographs, including finished and waiting works, outside the public deck", async (t) => {
  const previousSeasons = prisma.season.findMany,
    previousRows = prisma.battleProgress.findMany;
  (prisma.season as any).findMany = async () => [];
  const calls: any[] = [];
  (prisma.battleProgress as any).findMany = async (query: any) => {
    calls.push(query);
    return query.where.userId === "owner"
      ? Array.from({ length: 25 }, (_, i) => ({
          id: `work-${i}`,
          photoId: `photo-${i}`,
          round: 3,
          votes: 24,
          wonRounds: 1,
          status: i % 2 ? "COMPLETED" : "WAITING",
          photo: {
            title: `Work ${i}`,
            moderationStatus: "APPROVED",
            assets: [],
          },
          category: null,
          currentBattle: null,
          season: {
            id: "season",
            name: "Season",
            nameKey: "season",
            endsAt: new Date("2099-01-01"),
          },
        }))
      : [];
  };
  t.after(() => {
    prisma.season.findMany = previousSeasons;
    prisma.battleProgress.findMany = previousRows;
  });
  const service = new BattlesService();
  const result = await service.listMine({ id: "owner" } as CurrentUser);
  assert.equal(result.works.length, 24);
  assert.equal(result.nextCursor, "work-23");
  assert.equal(result.works[0]!.round, 3);
  assert.equal(result.works[0]!.votes, 24);
  assert.equal(result.works[1]!.status, "COMPLETED");
  assert.deepEqual(
    (await service.listMine({ id: "other" } as CurrentUser)).works,
    [],
  );
  await service.listMine({ id: "owner" } as CurrentUser, "work-23");
  assert.deepEqual(calls[2].cursor, { id: "work-23" });
  assert.equal(calls[2].skip, 1);
  assert.equal(calls[0].where.photo.deletedAt, null);
  assert.equal(calls[0].where.photo.NOT.title.startsWith, "__profile_");
});
