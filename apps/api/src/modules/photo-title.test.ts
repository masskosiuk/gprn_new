import assert from "node:assert/strict";
import test from "node:test";
import { prisma } from "@gprn/db";
import {
  generateMediaTitle,
  isTechnicalMediaTitle,
  titleFromFilename,
} from "@gprn/domain";
import { parsePhotoTitle, requirePhotoTitleAccess } from "./photo-title.js";
import { PhotosService } from "./photos.service.js";
import type { CurrentUser } from "./auth.service.js";
import type { LocationsService } from "./locations.service.js";

test("generated photo and video titles are readable, localized and change on successive uploads", () => {
  for (const locale of ["en", "ru", "uk"]) {
    for (const kind of ["PHOTO", "VIDEO"] as const) {
      const titles = Array.from({ length: 144 }, (_, sequence) =>
        generateMediaTitle(locale, kind, sequence),
      );
      assert.equal(new Set(titles).size, titles.length);
      assert(
        titles.every(
          (title) => title.length <= 140 && !isTechnicalMediaTitle(title),
        ),
      );
      assert(
        titles.every(
          (title, index) => index === 0 || title !== titles[index - 1],
        ),
      );
    }
  }
  assert.equal(generateMediaTitle("ru", "PHOTO", 0), "Один момент");
  assert.equal(generateMediaTitle("ru", "PHOTO", 1), "Впечатление");
  assert.notEqual(
    generateMediaTitle("ru", "PHOTO", 0),
    generateMediaTitle("ru", "VIDEO", 0),
  );
  assert.equal(generateMediaTitle("fr", "PHOTO", 0), "One moment");
});

test("only technical filename titles are candidates for repair", () => {
  for (const title of [
    "f113409024",
    "f110262528",
    "IMG 20261009 120002",
    "dsc 00422",
    "f95ab245018ce022dabbcc44",
  ])
    assert(isTechnicalMediaTitle(title));
  for (const title of [
    "Crosswalk after rain",
    "Маленькая история",
    "Лето 2026",
    "__profile_avatar_123456",
  ])
    assert(!isTechnicalMediaTitle(title));
  assert.equal(titleFromFilename("f113409024.jpg"), "f113409024");
});

test("renaming accepts trimmed titles and rejects blank, oversized and reserved titles", () => {
  assert.equal(
    parsePhotoTitle({ title: "  Мой новый кадр  " }),
    "Мой новый кадр",
  );
  for (const body of [
    null,
    {},
    { title: 123 },
    { title: "   " },
    { title: "x".repeat(141) },
    { title: "__profile_avatar_test" },
  ])
    assert.throws(() => parsePhotoTitle(body));
});

test("only an author or administrator can rename a portfolio work", () => {
  const photo = { ownerId: "author", title: "One moment" };
  requirePhotoTitleAccess({ id: "author", roles: ["PHOTOGRAPHER"] }, photo);
  requirePhotoTitleAccess({ id: "admin", roles: ["ADMIN"] }, photo);
  requirePhotoTitleAccess({ id: "super", roles: ["SUPER_ADMIN"] }, photo);
  assert.throws(() =>
    requirePhotoTitleAccess({ id: "other", roles: ["PHOTOGRAPHER"] }, photo),
  );
  assert.throws(() =>
    requirePhotoTitleAccess({ id: "moderator", roles: ["MODERATOR"] }, photo),
  );
  assert.throws(() =>
    requirePhotoTitleAccess(
      { id: "author", roles: ["ADMIN"] },
      { ...photo, title: "__profile_cover_1" },
    ),
  );
});

test("rename persists only the title and an audit entry without changing assets or publication", async () => {
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
  const service = new PhotosService({} as LocationsService);
  const actor = {
    id: "author",
    roles: ["PHOTOGRAPHER"],
  } as unknown as CurrentUser;
  const record = {
    id: "work",
    ownerId: "author",
    title: "One moment",
    deletedAt: null,
    createdAt: new Date(),
    publishedAt: new Date(),
    status: "PUBLISHED",
    moderationStatus: "APPROVED",
    visibility: "PUBLIC",
    description: null,
    category: null,
    owner: {
      id: "author",
      profile: { displayName: "Author", username: "author" },
    },
    assets: [
      {
        type: "DISPLAY",
        contentType: "image/webp",
        storageKey: "work.webp",
        byteSize: 100n,
      },
    ],
    location: null,
    metadata: null,
    provenance: null,
  };
  const writes: unknown[] = [];
  const audits: unknown[] = [];
  const tx = {
    photo: {
      findUnique: async () => record,
      update: async (input: { data: { title: string } }) => {
        writes.push(input.data);
        return { ...record, ...input.data };
      },
    },
    auditLog: {
      create: async (input: unknown) => {
        audits.push(input);
      },
    },
  };
  const original = prisma.$transaction;
  prisma.$transaction = (async (callback: (value: typeof tx) => unknown) =>
    callback(tx)) as unknown as typeof original;
  try {
    const response = await service.rename(actor, "work", {
      title: "  Мимолётный взгляд  ",
    });
    assert.deepEqual(writes, [{ title: "Мимолётный взгляд" }]);
    assert.equal(response.photo.title, "Мимолётный взгляд");
    assert.equal(response.photo.status, "PUBLISHED");
    assert.equal(response.photo.moderationStatus, "APPROVED");
    assert.equal(
      response.photo.displayUrl,
      "https://storage.invalid/public/work.webp",
    );
    assert.equal(audits.length, 1);
    await assert.rejects(() =>
      service.rename({ ...actor, id: "other" }, "work", { title: "Not mine" }),
    );
    assert.equal(writes.length, 1);
    const adminResponse = await service.rename(
      { ...actor, id: "admin", roles: ["ADMIN"] },
      "work",
      { title: "Admin title" },
    );
    assert.equal(adminResponse.photo.title, "Admin title");
    record.deletedAt = new Date() as unknown as null;
    await assert.rejects(() =>
      service.rename(actor, "work", { title: "Deleted work" }),
    );
    assert.equal(writes.length, 2);
  } finally {
    prisma.$transaction = original;
  }
});
