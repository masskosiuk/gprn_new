import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import type { Prisma } from "@gprn/db";
import { prisma } from "@gprn/db";
import { FREE_MEDIA_FILE_LIMIT } from "@gprn/domain";
import {
  requirePhotoUploadCapacity,
  withPhotoUploads,
} from "./photo-upload-quota.js";
import { PhotosService } from "./photos.service.js";
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

test("forty free media files are available without a tier or subscription distinction", async () => {
  assert.equal(FREE_MEDIA_FILE_LIMIT, 40);
  let used = 39;
  const db = {
    photo: {
      count: async (query: any) => {
        assert.deepEqual(query.where, {
          ownerId: "owner",
          deletedAt: null,
          NOT: { title: { startsWith: "__profile_" } },
        });
        return used;
      },
    },
  } as unknown as Pick<Prisma.TransactionClient, "photo">;
  await requirePhotoUploadCapacity(db, "owner");
  used = 40;
  await assert.rejects(
    requirePhotoUploadCapacity(db, "owner"),
    (error: any) => error.getResponse().code === "PHOTO_STORAGE_LIMIT",
  );
  used = 57;
  await assert.rejects(requirePhotoUploadCapacity(db, "owner"));
  used--;
  assert.equal(used, 56);
  used = 39;
  await requirePhotoUploadCapacity(db, "owner");
});

test("avatars and covers do not consume portfolio capacity, but arbitrary reserved names do not bypass it", async () => {
  const db = { photo: { count: async () => 40 } } as unknown as Pick<
    Prisma.TransactionClient,
    "photo"
  >;
  await requirePhotoUploadCapacity(db, "owner", "__profile_avatar__");
  await requirePhotoUploadCapacity(db, "owner", "__profile_cover__");
  await assert.rejects(
    requirePhotoUploadCapacity(db, "owner", "__profile_anything__"),
  );
});

test("the upload endpoint rejects a full account before decoding, processing or writing objects", async (t) => {
  const old = prisma.photo.count;
  (prisma.photo as any).count = async () => 40;
  t.after(() => {
    prisma.photo.count = old;
  });
  const service = new PhotosService(undefined as any);
  for (const tier of ["VIEWER", "BEGINNER", "PROFESSIONAL", "STAR"]) {
    await assert.rejects(
      service.addFromDevice(
        {
          id: "owner",
          profile: { tier },
          roles: tier === "STAR" ? ["ADMIN"] : [],
        } as unknown as CurrentUser,
        {
          fileName: "test.png",
          mimeType: "image/png",
          dataUrl: "invalid-data",
        },
      ),
      (error: any) => error.getResponse().code === "PHOTO_STORAGE_LIMIT",
    );
  }
});

const objects = (id: string) =>
  ["original", "display", "thumbnail"].map((kind) => ({
    body: Buffer.from("test"),
    bucket: "qa",
    key: `${id}/${kind}`,
    contentType: "image/webp",
  }));

test("parallel uploads competing for the fortieth slot preserve only the successful request's objects", async () => {
  let used = 39,
    tail = Promise.resolve();
  const stored = new Set<string>(),
    removed: string[] = [];
  const db = { photo: { count: async () => used } } as unknown as Pick<
    Prisma.TransactionClient,
    "photo"
  >;
  const storage = {
    putObject: async ({ key }: any) => {
      stored.add(key);
    },
    deleteObject: async (_bucket: string, key: string) => {
      stored.delete(key);
      removed.push(key);
    },
  };
  function commit() {
    const work = tail.then(async () => {
      await requirePhotoUploadCapacity(db, "owner");
      used++;
      return used;
    });
    tail = work.then(
      () => undefined,
      () => undefined,
    );
    return work;
  }
  const results = await Promise.allSettled(
    ["a", "b"].map((id) => withPhotoUploads(storage, objects(id), commit)),
  );
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal(used, 40);
  assert.equal(stored.size, 3);
  assert.deepEqual(removed, ["b/original", "b/display", "b/thumbnail"]);
  assert(stored.has("a/original"));
});

test("partial storage failure waits for late writes before removing every object from this request", async () => {
  let finish!: () => void;
  const stored = new Set<string>();
  let commits = 0,
    writesSettled = false;
  const storage = {
    putObject: async ({ key }: any) => {
      if (key.endsWith("display")) throw new Error("Storage unavailable");
      if (key.endsWith("thumbnail"))
        await new Promise<void>((resolve) => {
          finish = resolve;
        });
      stored.add(key);
    },
    deleteObject: async (_bucket: string, key: string) => {
      assert(writesSettled);
      stored.delete(key);
    },
  };
  const work = withPhotoUploads(storage, objects("a"), async () => {
    commits++;
  });
  writesSettled = true;
  finish();
  await assert.rejects(work);
  assert.equal(commits, 0);
  assert.equal(stored.size, 0);
});

test("capacity is checked again inside the serialized transaction before a photo row is inserted", () => {
  const source = readFileSync(
    new URL("./photos.service.ts", import.meta.url),
    "utf8",
  );
  const lock = source.indexOf("media-title:");
  const check = source.indexOf("requirePhotoUploadCapacity(tx", lock);
  const create = source.indexOf("tx.photo.create", lock);
  assert(lock > 0 && check > lock && create > check);
  assert(
    source.indexOf("requirePhotoUploadCapacity(prisma") <
      source.indexOf("decodeDataUrl(input.dataUrl"),
  );
  assert(!source.includes("tryCreateBattle"));
});
