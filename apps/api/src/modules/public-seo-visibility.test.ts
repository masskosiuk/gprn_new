import assert from "node:assert/strict";
import test from "node:test";
import { prisma } from "@gprn/db";
import { BattlesService } from "./battles.service.js";
import { ChallengesService } from "./challenges.service.js";

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
test("anonymous battle rendering cannot include private or moderated-away works, without changing signed-in queues", async () => {
  const original = prisma.battle.findMany;
  const originalSeasons = prisma.season.findMany;
  const calls: any[] = [];
  try {
    prisma.season.findMany = (async () => []) as typeof originalSeasons;
    prisma.battle.findMany = (async (query: unknown) => {
      calls.push(query);
      return [];
    }) as typeof original;
    const service = new BattlesService();
    await service.listOpen();
    await service.listOpen("signed-in-member");
    const entry = calls[0].where.entries.every;
    assert.equal(entry.moderationStatus, "APPROVED");
    assert.equal(entry.photo.deletedAt, null);
    assert.equal(entry.photo.visibility, "PUBLIC");
    assert.equal(entry.photo.status, "PUBLISHED");
    assert.equal(entry.photo.owner.status, "ACTIVE");
    assert.equal(entry.photo.owner.profile.visibility, "PUBLIC");
    assert.equal(calls[1].where.entries, undefined);
  } finally {
    prisma.battle.findMany = original;
    prisma.season.findMany = originalSeasons;
  }
});
test("challenge entries and participant counts use the same public active owner filter", async () => {
  const original = prisma.challenge.findMany;
  let query: any;
  try {
    prisma.challenge.findMany = (async (value: unknown) => {
      query = value;
      return [];
    }) as typeof original;
    await new ChallengesService().list();
    const filter = query.include.entries.where.photo.is.owner;
    assert.deepEqual(filter, {
      status: "ACTIVE",
      profile: { deletedAt: null, visibility: "PUBLIC" },
    });
    assert.deepEqual(
      query.include._count.select.entries.where.photo.is.owner,
      filter,
    );
  } finally {
    prisma.challenge.findMany = original;
  }
});
