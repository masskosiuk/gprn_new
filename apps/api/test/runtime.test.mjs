import "reflect-metadata";

import assert from "node:assert/strict";
import test from "node:test";
import { NestFactory } from "@nestjs/core";
import { FastifyAdapter } from "@nestjs/platform-fastify";
import { prisma } from "@gprn/db";
import exifr from "exifr";
import sharp from "sharp";

// Native Node must resolve the compiled imports, without tsx interop helpers.
import { AppModule } from "../dist/modules/app.module.js";
import { AuthService } from "../dist/modules/auth.service.js";

test("compiled API starts under native ESM and serves health and Google availability", async (t) => {
  Object.assign(process.env, {
    NODE_ENV: "test",
    APP_ENV: "local",
    APP_URL: "http://127.0.0.1:3000",
    API_URL: "http://127.0.0.1:4000",
    DATABASE_URL: "postgresql://test:test@127.0.0.1:1/runtime_test",
    REDIS_URL: "redis://127.0.0.1:1",
    S3_ENDPOINT: "http://127.0.0.1:1",
    S3_REGION: "us-east-1",
    S3_ACCESS_KEY: "runtime-test",
    S3_SECRET_KEY: "runtime-test",
    S3_BUCKET_PUBLIC: "runtime-test-public",
    S3_BUCKET_PRIVATE: "runtime-test-private",
    ENCRYPTION_KEY: "runtime-test-only",
    SESSION_SECRET: "runtime-test-only",
    GOOGLE_CLIENT_ID: "runtime-test-only",
    GOOGLE_CLIENT_SECRET: "runtime-test-only",
  });
  const app = await NestFactory.create(AppModule, new FastifyAdapter(), {
    logger: false,
  });
  try {
    app.setGlobalPrefix("api/v1");
    await app.listen({ host: "127.0.0.1", port: 0 });
    const base = await app.getUrl();
    const health = await fetch(`${base}/api/v1/health`);
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), {
      service: "gprn-api",
      status: "ok",
    });
    const providers = await fetch(`${base}/api/v1/auth/providers`);
    assert.equal(providers.status, 200);
    const body = await providers.json();
    assert.equal(
      body.providers.find(({ id }) => id === "google").status,
      "AVAILABLE",
    );
    assert.equal(JSON.stringify(body).includes("runtime-test-only"), false);
    await t.test(
      "notification read-all accepts the browser request and persists reads over HTTP",
      async (t) => {
        const endpoint = `${base}/api/v1/notifications`;
        const anonymous = await fetch(`${endpoint}/read-all`, {
          method: "PATCH",
          keepalive: true,
          signal: AbortSignal.timeout(5000),
        });
        assert.equal(anonymous.status, 401);
        assert.equal((await anonymous.json()).code, "AUTH_REQUIRED");
        const emptyChunked = await app
          .getHttpAdapter()
          .getInstance()
          .inject({
            method: "PATCH",
            url: "/api/v1/notifications/read-all",
            headers: { "transfer-encoding": "chunked" },
          });
        assert.equal(emptyChunked.statusCode, 415);

        const ownerId = "de000001-0000-4000-8000-000000000001";
        const oldDate = new Date(Date.now() - 60000);
        const rows = Array.from({ length: 150 }, (_, index) => ({
          id: `notification-${index}`,
          userId: ownerId,
          type: "photo_moderation_approved",
          status: "UNREAD",
          createdAt: oldDate,
          readAt: null,
          payload: null,
        }));
        rows.push({ ...rows[0], id: "other", userId: "someone-else" });
        t.mock.method(
          app.get(AuthService),
          "requireUserFromRequest",
          async () => ({ id: ownerId }),
        );
        const previousUpdate = prisma.notification.updateMany;
        const previousFind = prisma.notification.findMany;
        t.after(() => {
          prisma.notification.updateMany = previousUpdate;
          prisma.notification.findMany = previousFind;
        });
        prisma.notification.updateMany = async ({ where, data }) => {
          let count = 0;
          for (const row of rows) {
            if (
              row.userId === where.userId &&
              row.status === where.status &&
              row.createdAt <= where.createdAt.lte
            ) {
              Object.assign(row, data);
              count++;
            }
          }
          return { count };
        };
        prisma.notification.findMany = async ({ where, take }) =>
          rows.filter((row) => row.userId === where.userId).slice(0, take);
        const initial = await fetch(endpoint, {
          signal: AbortSignal.timeout(5000),
        });
        assert.equal(initial.headers.get("cache-control"), "private, no-store");
        assert.equal((await initial.json()).unreadCount, 100);
        const marked = await fetch(`${endpoint}/read-all`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({}),
          keepalive: true,
          signal: AbortSignal.timeout(5000),
        });
        assert.equal(marked.status, 200);
        const confirmed = await marked.json();
        assert.equal(confirmed.count, 150);
        assert(Number.isFinite(Date.parse(confirmed.readAt)));
        const reloaded = await fetch(endpoint, {
          signal: AbortSignal.timeout(5000),
        });
        const notifications = await reloaded.json();
        assert.equal(notifications.unreadCount, 0);
        assert(
          notifications.notifications.every((item) => item.status === "READ"),
        );
        assert.equal(rows.at(-1).status, "UNREAD");
        const jsonChunked = await app
          .getHttpAdapter()
          .getInstance()
          .inject({
            method: "PATCH",
            url: "/api/v1/notifications/read-all",
            headers: {
              "transfer-encoding": "chunked",
              "content-type": "application/json",
            },
            payload: JSON.stringify({}),
          });
        assert.equal(jsonChunked.statusCode, 200);
        assert.equal(jsonChunked.json().count, 0);
      },
    );
  } finally {
    await app.close();
    await prisma.$disconnect();
  }
});

test("the Node-compatible exifr import still reads real GPS tags", async () => {
  const tiff = Buffer.alloc(128);
  tiff.write("II", 0, "ascii");
  tiff.writeUInt16LE(42, 2);
  tiff.writeUInt32LE(8, 4);
  tiff.writeUInt16LE(1, 8);
  tiff.writeUInt16LE(0x8825, 10);
  tiff.writeUInt16LE(4, 12);
  tiff.writeUInt32LE(1, 14);
  tiff.writeUInt32LE(26, 18);
  tiff.writeUInt16LE(4, 26);

  // The GPS IFD has two references and two three-rational coordinate values.
  for (const [index, tag, type, count, value] of [
    [0, 1, 2, 2, "N"],
    [1, 2, 5, 3, 80],
    [2, 3, 2, 2, "E"],
    [3, 4, 5, 3, 104],
  ]) {
    const offset = 28 + index * 12;
    tiff.writeUInt16LE(tag, offset);
    tiff.writeUInt16LE(type, offset + 2);
    tiff.writeUInt32LE(count, offset + 4);
    if (typeof value === "string") tiff.write(value, offset + 8, "ascii");
    else tiff.writeUInt32LE(value, offset + 8);
  }
  for (const [index, value] of [12, 30, 0, 34, 15, 0].entries()) {
    tiff.writeUInt32LE(value, 80 + index * 8);
    tiff.writeUInt32LE(1, 84 + index * 8);
  }
  const gps = await exifr.gps(tiff);
  assert.equal(gps.latitude, 12.5);
  assert.equal(gps.longitude, 34.25);
});

test("an image without GPS metadata does not invent a location", async () => {
  const jpeg = await sharp({
    create: { width: 8, height: 8, channels: 3, background: "#123456" },
  })
    .jpeg()
    .toBuffer();
  assert.equal(await exifr.gps(jpeg), undefined);
});
