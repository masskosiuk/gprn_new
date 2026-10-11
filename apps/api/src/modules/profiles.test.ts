import "reflect-metadata";
import assert from "node:assert/strict";
import test from "node:test";
import { prisma } from "@gprn/db";
import { HEADERS_METADATA } from "@nestjs/common/constants.js";
import { ProfilesController } from "./profiles.controller.js";
import { ProfilesService } from "./profiles.service.js";
import type { CurrentUser } from "./auth.service.js";
import type { LocationsService } from "./locations.service.js";

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

test("owner and guest share persisted profile images, metrics and engagement without exposing private works", async () => {
  const findProfile = prisma.profile.findUnique;
  const findProducts = prisma.marketplaceProduct.findMany;
  const base = {
    assets: [],
    category: null,
    location: null,
    provenance: null,
    createdAt: new Date(),
    publishedAt: new Date(),
    status: "PUBLISHED",
    moderationStatus: "APPROVED",
    visibility: "PUBLIC",
    title: "Public work",
    _count: { likes: 12, savedBy: 3, moodboardItems: 2, reviews: 0 },
    reviews: [],
  };
  const photos = [
    { ...base, id: "public-photo" },
    { ...base, id: "private-photo", visibility: "PRIVATE" },
    { ...base, id: "pending-photo", moderationStatus: "PENDING" },
  ];
  prisma.profile.findUnique = (async (query: {
    where: { username?: string };
    include: { user: { include: { photos: { where: unknown } } } };
  }) => {
    if (query.where.username) {
      assert.deepEqual(query.include.user.include.photos.where, {
        deletedAt: null,
        moderationStatus: "APPROVED",
        status: "PUBLISHED",
        visibility: "PUBLIC",
      });
    }
    return {
      id: "profile-id",
      userId: "author",
      username: "author",
      displayName: "Author",
      visibility: "PUBLIC",
      deletedAt: null,
      avatarAssetKey: "avatar.webp",
      coverAssetKey: "cover.webp",
      country: null,
      city: null,
      region: null,
      tier: "PROFESSIONAL",
      serviceRatingsCount: 0,
      user: {
        status: "ACTIVE",
        _count: { followers: 7, following: 2 },
        achievements: [],
        expertProfile: null,
        ratings: [
          { scope: "GLOBAL", scopeKey: "global", rating: 1574, wins: 3 },
        ],
        photos: query.where.username ? [photos[0]] : photos,
      },
    };
  }) as unknown as typeof findProfile;
  prisma.marketplaceProduct.findMany = (async () => []) as typeof findProducts;
  try {
    const service = new ProfilesService({} as LocationsService);
    const guest = (await service.getPublic("author")).profile;
    const mine = (await service.getMine({ id: "author" } as CurrentUser))
      .profile;
    for (const field of [
      "avatarUrl",
      "coverUrl",
      "followers",
      "ratings",
      "publicPhotoCount",
    ] as const) {
      assert.deepEqual(mine[field], guest[field]);
    }
    assert.equal(guest.publicPhotoCount, 1);
    assert.equal(guest.photos.length, 1);
    assert.equal(mine.photos.length, 3);
    assert.deepEqual(mine.photos[0]!.counts, guest.photos[0]!.counts);
    assert.equal(guest.photos[0]!.counts.likes, 12);
  } finally {
    prisma.profile.findUnique = findProfile;
    prisma.marketplaceProduct.findMany = findProducts;
  }
});

test("public and private profile reads explicitly prohibit response caching", () => {
  for (const method of [
    ProfilesController.prototype.getPublic,
    ProfilesController.prototype.mine,
  ]) {
    const headers = Reflect.getMetadata(HEADERS_METADATA, method);
    assert(
      headers.some(
        (header: { name: string; value: string }) =>
          header.name.toLowerCase() === "cache-control" &&
          header.value === "no-store",
      ),
    );
  }
});
