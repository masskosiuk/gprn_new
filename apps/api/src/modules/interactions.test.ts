import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { prisma } from "@gprn/db";
import { InteractionsService } from "./interactions.service.js";
import { PlatformService } from "./platform.service.js";
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
const a = "de000002-0000-4000-8000-000000000001",
  b = "de000002-0000-4000-8000-000000000002",
  id = "de000002-0000-4000-8000-000000000003";
const actor = (userId = a) =>
  ({
    id: userId,
    roles: [],
    profile: {
      displayName: userId === a ? "Alice" : "Bob",
      username: userId === a ? "alice" : "bob",
    },
  }) as unknown as CurrentUser;
const member = (userId: string) => ({
  id: userId,
  status: "ACTIVE",
  profile: {
    displayName: userId,
    username: userId,
    avatarAssetKey: null,
    deletedAt: null,
  },
});
function fixture(t: TestContext) {
  const replace = (object: object, key: string, value: unknown) => {
    const record = object as Record<string, unknown>,
      old = record[key];
    record[key] = value;
    t.after(() => {
      record[key] = old;
    });
  };
  const state = {
    thread: {
      id,
      initiatorId: a,
      recipientId: b,
      topic: "SHOOT",
      status: "OPEN",
      createdAt: new Date(),
      updatedAt: new Date(),
      initiatorReadAt: null,
      recipientReadAt: null,
      initiator: member(a),
      recipient: member(b),
      messages: [] as {
        id: string;
        authorId: string;
        body: string;
        createdAt: Date;
      }[],
    },
    exists: true,
    quota: 0,
    writes: 0,
    notifications: [] as Record<string, unknown>[],
    where: [] as Record<string, unknown>[],
    reads: [] as unknown[],
  };
  const allowed = (where: Record<string, any>) =>
    !where.OR ||
    where.OR.some((clause: any) =>
      clause.initiatorId ? clause.initiatorId === a : clause.recipientId === b,
    );
  replace(prisma, "$transaction", async (callback: (tx: unknown) => unknown) =>
    callback(prisma),
  );
  replace(prisma, "$executeRaw", async (...values: unknown[]) => {
    state.reads.push(values);
    return 1;
  });
  replace(prisma.user, "findFirst", async () => ({ id: b }));
  replace(
    prisma.interactionThread,
    "findFirst",
    async ({ where }: { where: Record<string, any> }) => {
      state.where.push(where);
      return state.exists && allowed(where) ? state.thread : null;
    },
  );
  replace(prisma.interactionThread, "findUnique", async () =>
    state.exists ? state.thread : null,
  );
  replace(
    prisma.interactionThread,
    "findMany",
    async ({ where }: { where: Record<string, any> }) => {
      state.where.push(where);
      return [state.thread];
    },
  );
  replace(prisma.interactionThread, "count", async () => 1);
  replace(
    prisma.interactionThread,
    "create",
    async ({ data }: { data: Record<string, unknown> }) => {
      Object.assign(state.thread, data);
      state.exists = true;
      return state.thread;
    },
  );
  replace(
    prisma.interactionThread,
    "update",
    async ({ data }: { data: Record<string, unknown> }) => {
      state.writes++;
      Object.assign(state.thread, data);
      return state.thread;
    },
  );
  replace(
    prisma.interactionMessage,
    "count",
    async ({ where }: { where: Record<string, unknown> }) =>
      where.authorId ? state.quota : state.thread.messages.length,
  );
  replace(
    prisma.interactionMessage,
    "create",
    async ({ data }: { data: { authorId: string; body: string } }) => {
      const message = { ...data, id, createdAt: new Date() };
      state.thread.messages.unshift(message);
      return message;
    },
  );
  replace(prisma.interactionMessage, "findMany", async () => [
    ...state.thread.messages,
  ]);
  replace(
    prisma.notification,
    "create",
    async ({ data }: { data: Record<string, unknown> }) => {
      state.notifications.push(data);
      return data;
    },
  );
  return state;
}
const http = (status: number) => (e: unknown) =>
  (e as { getStatus(): number }).getStatus() === status;
test("new contact persists both conversation and message, not just a notification", async (t) => {
  const s = fixture(t);
  s.exists = false;
  const result = await new InteractionsService().contact(actor(), "bob", {
    topic: "SHOOT",
    body: "Portrait session",
  });
  assert.equal(result.threadId, id);
  assert.equal(s.thread.messages[0]!.body, "Portrait session");
  assert.equal(s.notifications[0]!.userId, b);
  assert.equal(
    (s.notifications[0]!.payload as Record<string, unknown>).threadId,
    id,
  );
});
test("recipient can reply to the same thread; messages return after a new service instance", async (t) => {
  const s = fixture(t);
  await new InteractionsService().send(actor(b), id, {
    body: "Available Friday",
  });
  const data = await new InteractionsService().detail(actor(), id);
  assert.equal(data.messages[0]!.body, "Available Friday");
  assert.equal(data.thread.unread, false);
  assert.equal(data.thread.peer.id, b);
  assert.equal(s.notifications[0]!.userId, a);
});
test("outsiders, including admins, cannot read, send or change a private conversation", async (t) => {
  fixture(t);
  const outsider = {
    ...actor("de000002-0000-4000-8000-000000000099"),
    roles: ["ADMIN"],
  } as CurrentUser;
  const service = new InteractionsService();
  await assert.rejects(service.detail(outsider, id), http(404));
  await assert.rejects(
    service.send(outsider, id, { body: "attack" }),
    http(404),
  );
  await assert.rejects(
    service.update(outsider, id, { action: "close" }),
    http(404),
  );
});
test("only the recipient can accept a request; status changes never settle money or grant reputation", async (t) => {
  const s = fixture(t),
    service = new InteractionsService();
  await assert.rejects(
    service.update(actor(), id, { action: "accept" }),
    http(409),
  );
  await service.update(actor(b), id, { action: "accept" });
  assert.equal(s.thread.status, "ACCEPTED");
  await assert.rejects(
    service.update(actor(b), id, { action: "accept" }),
    http(409),
  );
  assert.equal(s.thread.messages.length, 0);
});
test("closed threads reject replies but preserve history when starting a new request; quota runs before writes", async (t) => {
  const s = fixture(t),
    service = new InteractionsService();
  s.thread.status = "CLOSED";
  await assert.rejects(service.send(actor(), id, { body: "hello" }), http(409));
  await service.contact(actor(), "bob", { topic: "SHOOT", body: "hello" });
  assert.equal(s.thread.messages[0]!.body, "hello");
  const previousWrites = s.writes;
  s.thread.status = "OPEN";
  s.quota = 60;
  await assert.rejects(service.send(actor(), id, { body: "hello" }), http(429));
  assert.equal(s.writes, previousWrites);
});
test("conversation lists are scoped to the authenticated account and request type", async (t) => {
  const s = fixture(t);
  await new InteractionsService().list(actor(), { requests: "true" });
  assert.deepEqual(s.where[0], {
    OR: [{ initiatorId: a }, { recipientId: a }],
    topic: { not: "MESSAGE" },
  });
});
test("reading does not write updatedAt or reorder the conversation", async (t) => {
  const s = fixture(t);
  s.thread.messages.push({
    id,
    authorId: b,
    body: "Hello",
    createdAt: new Date(),
  });
  await new InteractionsService().detail(actor(), id);
  assert.equal(s.writes, 0);
  assert(
    s.reads.some((values) =>
      String((values as unknown[])[0]).includes('"initiatorReadAt" = GREATEST'),
    ),
  );
});
test("order detail checks membership before exposing messages", async (t) => {
  const delegate = prisma.serviceRequest as unknown as Record<string, unknown>;
  const previous = delegate.findFirst;
  delegate.findFirst = async () => null;
  t.after(() => {
    delegate.findFirst = previous;
  });
  await assert.rejects(
    new PlatformService().requestDetail(actor(), id),
    http(404),
  );
});
