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

test("compiled API starts under native ESM and serves health and Google availability", async () => {
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
