import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { prisma } from "@gprn/db";
import { AdminService } from "./admin.service.js";
import type { CurrentUser } from "./auth.service.js";

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

function replace(t: TestContext, target: object, key: string, value: unknown) {
  const record = target as Record<string, unknown>;
  const previous = record[key];
  record[key] = value;
  t.after(() => {
    record[key] = previous;
  });
}
const actor = {
  id: "de000002-0000-4000-8000-000000000001",
  roles: ["ADMIN"],
} as unknown as CurrentUser;

test("admin overview counts all pending queues without pagination or deleted files", async (t) => {
  const calls: Record<string, { where?: Record<string, unknown> }[]> = {};
  for (const key of [
    "user",
    "photo",
    "battle",
    "challenge",
    "season",
    "report",
    "copyrightDispute",
    "battleEntry",
    "challengeEntry",
    "communityPost",
    "communityInquiry",
  ] as const) {
    calls[key] = [];
    replace(t, prisma[key], "count", async (args = {}) => {
      calls[key]!.push(args);
      return 301 + calls[key]!.length;
    });
  }
  replace(t, prisma.featureFlag, "findMany", async () => []);
  const result = await new AdminService().overview();
  assert.deepEqual(result.pendingCounts, {
    photos: 304,
    battles: 302,
    challenges: 302,
    events: 302,
    discussions: 303,
    castings: 304,
    reports: 302,
    suggestions: 303,
  });
  assert.equal(calls.photo![2]!.where!.deletedAt, null);
  for (const key of ["battleEntry", "challengeEntry"]) {
    assert.deepEqual(calls[key]![0]!.where, {
      moderationStatus: { in: ["PENDING", "UNDER_REVIEW"] },
      photo: { deletedAt: null },
    });
  }
  assert.deepEqual(
    calls.communityPost!.map((call) => call.where),
    ["EVENT", "DISCUSSION", "CASTING"].map((kind) => ({
      kind,
      deletedAt: null,
      moderationStatus: { in: ["PENDING", "UNDER_REVIEW"] },
    })),
  );
  assert.deepEqual(
    calls.communityInquiry!.map((call) => call.where),
    ["REPORT", "SUGGESTION"].map((kind) => ({
      kind,
      status: { in: ["OPEN", "UNDER_REVIEW"] },
    })),
  );
  assert(calls.photo!.every((args) => !("take" in args)));
});

test("rejecting a photo without a reason never starts a transaction", async (t) => {
  replace(t, prisma, "$transaction", () => {
    assert.fail("No write expected");
  });
  for (const reason of ["", "  ", " ab "]) {
    await assert.rejects(
      new AdminService().moderatePhoto(actor, actor.id, {
        moderationStatus: "REJECTED",
        reason,
      }),
      (error: unknown) =>
        (error as { getResponse(): { code: string } }).getResponse().code ===
        "MODERATION_REASON_REQUIRED",
    );
  }
});

test("rejecting a pending avatar saves the decision, audit reason and author notification", async (t) => {
  const prior = {
    id: actor.id,
    ownerId: "author",
    title: "__profile_avatar__",
    moderationStatus: "PENDING",
    status: "READY",
    publishedAt: null,
    categoryId: null,
  };
  let stored = { ...prior };
  const notifications: Record<string, any>[] = [];
  const audits: Record<string, any>[] = [];
  const entries: Record<string, any>[] = [];
  const tx = {
    photo: {
      findUnique: async () => prior,
      update: async ({ data }: { data: typeof prior }) =>
        (stored = { ...stored, ...data }),
    },
    battleEntry: {
      findMany: async () => [],
      updateMany: async (args: Record<string, any>) => entries.push(args),
    },
    challengeEntry: {
      updateMany: async (args: Record<string, any>) => entries.push(args),
    },
    notification: {
      create: async ({ data }: { data: Record<string, any> }) =>
        notifications.push(data),
    },
    auditLog: {
      create: async ({ data }: { data: Record<string, any> }) =>
        audits.push(data),
    },
  };
  replace(
    t,
    prisma,
    "$transaction",
    async (work: (client: typeof tx) => Promise<unknown>) => work(tx),
  );
  await new AdminService().moderatePhoto(actor, prior.id, {
    moderationStatus: "REJECTED",
    reason: "  Image needs review  ",
  });
  assert.equal(stored.moderationStatus, "REJECTED");
  assert.equal(stored.status, "REJECTED");
  assert.equal(audits[0]!.reason, "Image needs review");
  assert.equal(notifications[0]!.type, "photo_moderation_rejected");
  assert.equal(notifications[0]!.userId, "author");
  assert.equal(notifications[0]!.payload.reason, "Image needs review");
  assert(entries.every((entry) => entry.data.moderationStatus === "REJECTED"));
});
