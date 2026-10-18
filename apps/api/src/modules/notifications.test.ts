import assert from "node:assert/strict";
import test from "node:test";
import { prisma } from "@gprn/db";
import { NotificationsService } from "./notifications.service.js";
import type { CurrentUser } from "./auth.service.js";

test("mark all read persists one scoped update for every unread notification, not just the first 100", async (t) => {
  const target = prisma.notification as unknown as Record<string, unknown>;
  const previous = target.updateMany;
  const calls: any[] = [];
  target.updateMany = async (args: any) => {
    calls.push(args);
    return { count: 350 };
  };
  t.after(() => {
    target.updateMany = previous;
  });
  const result = await new NotificationsService().markAllRead({
    id: "current-user",
  } as CurrentUser);
  assert.equal(result.count, 350);
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].where, {
    userId: "current-user",
    status: "UNREAD",
    createdAt: { lte: calls[0].data.readAt },
  });
  assert.equal(calls[0].data.status, "READ");
  assert.equal(result.readAt, calls[0].data.readAt.toISOString());
});
test("a failed read-all write is not reported as a successful read", async (t) => {
  const target = prisma.notification as unknown as Record<string, unknown>;
  const previous = target.updateMany;
  target.updateMany = async () => {
    throw new Error("Storage unavailable");
  };
  t.after(() => {
    target.updateMany = previous;
  });
  await assert.rejects(
    new NotificationsService().markAllRead({ id: "user" } as CurrentUser),
  );
});
