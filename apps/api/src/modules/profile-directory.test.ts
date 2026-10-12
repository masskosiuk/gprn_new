import "reflect-metadata";
import assert from "node:assert/strict";
import test from "node:test";
import { prisma } from "@gprn/db";
import type { RuntimeEnv } from "@gprn/config";
import { HEADERS_METADATA } from "@nestjs/common/constants.js";
import {
  directoryQuery,
  listPublicCreators,
  publicCreatorWhere,
} from "./profile-directory.js";
import { ProfilesController } from "./profiles.controller.js";
import { LeaderboardsService } from "./leaderboards.service.js";

test("directory searches all public creators in the database, with AND filters and bounded pagination", () => {
  const result = directoryQuery({
    search: "  MIKA  ",
    category: "portrait",
    country: "japan",
    city: "de000001-0000-4000-8000-000000000001",
    minRating: "4.8",
    page: "2",
  });
  assert.equal(result.page, 2);
  assert.equal(result.take, 24);
  assert.equal(result.where.AND.length, 6);
  assert.deepEqual(result.where.AND[0], publicCreatorWhere);
  const search = JSON.stringify(result.where.AND[1]);
  assert(search.includes('"contains":"MIKA"'));
  assert(search.includes('"mode":"insensitive"'));
  assert(!search.includes("email"));
  assert.match(JSON.stringify(result.where.AND[4]), /APPROVED.*PUBLIC/);
});

test("directory rejects malformed page, rating, city and multi-valued search filters", () => {
  for (const query of [
    { page: "0" },
    { page: "1.5" },
    { page: "Infinity" },
    { page: "10001" },
    { minRating: "100" },
    { city: "not-a-uuid" },
    { search: ["Mika"] },
  ]) {
    assert.throws(() => directoryQuery(query));
  }
  assert.equal(directoryQuery({}).page, 1);
});

test("directory returns more than three canonical server profiles without leaking user records", async () => {
  const original = {
    profiles: prisma.profile.findMany,
    count: prisma.profile.count,
    countries: prisma.country.findMany,
    cities: prisma.city.findMany,
    categories: prisma.category.findMany,
  };
  let profileQuery: any;
  prisma.profile.findMany = (async (query: any) => {
    profileQuery = query;
    return Array.from({ length: 10 }, (_, i) => ({
      userId: String(i),
      username: `author.${i}`,
      displayName: `Author ${i}`,
      bio: "Saved biography",
      avatarAssetKey: "avatars/saved.webp",
      coverAssetKey: null,
      tier: "PROFESSIONAL",
      serviceRatingAverage: null,
      serviceRatingsCount: 0,
      city: null,
      country: null,
      user: {
        email: "private@example.invalid",
        passwordHash: "private",
        expertProfile: {
          status: "DISABLED",
          headline: "Hidden service",
          languages: ["fr"],
          ratingAverage: 5,
          reviewsCompleted: 999,
        },
        ratings: [{ rating: 1500 }],
        photos: [],
      },
    }));
  }) as unknown as typeof prisma.profile.findMany;
  prisma.profile.count = (async () => 40) as typeof prisma.profile.count;
  prisma.country.findMany = (async () => []) as typeof prisma.country.findMany;
  prisma.city.findMany = (async () => []) as typeof prisma.city.findMany;
  prisma.category.findMany =
    (async () => []) as typeof prisma.category.findMany;
  try {
    const result = await listPublicCreators(
      {
        S3_ENDPOINT: "https://storage.invalid",
        S3_BUCKET_PUBLIC: "public",
      } as RuntimeEnv,
      { page: "2" },
    );
    assert.equal(result.entries.length, 10);
    assert.equal(result.total, 40);
    assert.equal(profileQuery.skip, 24);
    assert.equal(profileQuery.take, 24);
    assert.deepEqual(profileQuery.where.AND[0], publicCreatorWhere);
    assert.equal(
      result.entries[0]?.avatarUrl,
      "https://storage.invalid/public/avatars/saved.webp",
    );
    assert.equal(result.entries[0]?.isVerifiedExpert, false);
    assert.equal(result.entries[0]?.headline, "Saved biography");
    assert.equal(result.entries[0]?.rating, null);
    assert.equal(result.entries[0]?.reputation, 1500);
    assert(!JSON.stringify(result).includes("private"));
    const headers = Reflect.getMetadata(
      HEADERS_METADATA,
      ProfilesController.prototype.directory,
    );
    assert(
      headers.some(
        (header: any) =>
          header.name === "Cache-Control" && header.value === "no-store",
      ),
    );
  } finally {
    prisma.profile.findMany = original.profiles;
    prisma.profile.count = original.count;
    prisma.country.findMany = original.countries;
    prisma.city.findMany = original.cities;
    prisma.category.findMany = original.categories;
  }
});

test("leaderboard takes ten actual scores with stable ordering and only public active profiles", async () => {
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
  const original = prisma.rating.findMany;
  let requested = false;
  prisma.rating.findMany = (async (query: any) => {
    requested = true;
    assert.equal(query.take, 10);
    assert.deepEqual(query.orderBy, [
      { rating: "desc" },
      { wins: "desc" },
      { id: "asc" },
    ]);
    assert.deepEqual(query.where.user, {
      status: "ACTIVE",
      deletedAt: null,
      profile: { visibility: "PUBLIC", deletedAt: null },
    });
    return Array.from({ length: 10 }, (_, i) => ({
      rating: 1600 - i,
      wins: i,
      losses: 0,
      battles: i,
      user: {
        profile: {
          username: `author.${i}`,
          displayName: `Author ${i}`,
          avatarAssetKey: "saved.webp",
          city: null,
        },
      },
    }));
  }) as unknown as typeof prisma.rating.findMany;
  try {
    const result = await new LeaderboardsService().global();
    assert(requested);
    assert.equal(result.entries.length, 10);
    assert.equal(result.entries[9]?.rank, 10);
    assert.equal(result.entries[9]?.rating, 1591);
    assert.equal(
      result.entries[0]?.avatarUrl,
      "https://storage.invalid/public/saved.webp",
    );
  } finally {
    prisma.rating.findMany = original;
  }
});
