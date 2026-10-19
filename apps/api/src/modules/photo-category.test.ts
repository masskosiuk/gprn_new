import assert from "node:assert/strict";
import test from "node:test";
import { prisma } from "@gprn/db";
import { PhotosService } from "./photos.service.js";
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

function fixture(t: { after(fn: () => void): void }) {
  const categories = [
    {
      id: "old",
      slug: "documentary",
      nameKey: "category.documentary.name",
      isActive: true,
    },
    {
      id: "new",
      slug: "portrait",
      nameKey: "category.portrait.name",
      isActive: true,
    },
  ];
  const photo: any = {
    id: "work",
    ownerId: "author",
    categoryId: "old",
    category: categories[0],
    title: "One moment",
    deletedAt: null,
    createdAt: new Date(),
    publishedAt: new Date(),
    status: "PUBLISHED",
    moderationStatus: "APPROVED",
    visibility: "PUBLIC",
    description: null,
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
  const season: any = {
    id: "season",
    status: "ACTIVE",
    startsAt: new Date("2020-01-01"),
    endsAt: new Date("2099-01-01"),
    battleFinalizedAt: null,
  };
  const battles: any[] = [];
  const progress: any[] = [];
  const writes: any[] = [],
    audits: any[] = [],
    locks: string[] = [];
  const matches = (row: any, where: any): boolean =>
    Object.entries(where).every(([key, value]: any) => {
      if (key === "photo") return true;
      if (value && typeof value === "object")
        return value.in ? value.in.includes(row[key]) : true;
      return row[key] === value;
    });
  const update = (row: any, data: any) => {
    for (const [key, value] of Object.entries(data))
      row[key] =
        value && typeof value === "object" && "increment" in value
          ? row[key] + (value as any).increment
          : value;
    return row;
  };
  const tx = {
    $executeRaw: async (_query: unknown, key: string) => {
      locks.push(key);
      return 1;
    },
    photo: {
      findUnique: async () => photo,
      findUniqueOrThrow: async () => photo,
      update: async ({ data }: any) => {
        writes.push(data);
        Object.assign(photo, data);
        photo.category = categories.find((c) => c.id === photo.categoryId);
        return photo;
      },
    },
    category: {
      findUnique: async ({ where }: any) =>
        categories.find((c) => c.slug === where.slug) ?? null,
    },
    battleEntry: {
      findMany: async () =>
        battles
          .filter((b) => b.entries.some((e: any) => e.photoId === photo.id))
          .map((b) => ({ battleId: b.id, battle: { seasonId: b.seasonId } })),
    },
    battle: {
      findMany: async () => battles,
      updateMany: async ({ where, data }: any) => {
        for (const row of battles.filter((b) => matches(b, where)))
          update(row, data);
      },
      create: async () => {
        throw new Error("Cross-genre photographs cannot be paired");
      },
    },
    battleProgress: {
      findMany: async ({ where }: any) =>
        progress.filter((row) => matches(row, where)),
      update: async ({ where, data }: any) =>
        update(
          progress.find((row) => row.id === where.id),
          data,
        ),
      updateMany: async ({ where, data }: any) => {
        for (const row of progress.filter((p) => matches(p, where)))
          update(row, data);
      },
    },
    season: {
      findUnique: async () => season,
      update: async ({ data }: any) => Object.assign(season, data),
    },
    auditLog: {
      create: async ({ data }: any) => {
        audits.push(data);
      },
    },
  };
  const old = prisma.$transaction;
  (prisma as any).$transaction = async (fn: any) => fn(tx);
  t.after(() => {
    prisma.$transaction = old;
  });
  const service = new PhotosService({} as LocationsService);
  const actor = {
    id: "author",
    roles: ["PHOTOGRAPHER"],
  } as unknown as CurrentUser;
  function activeBattle() {
    const opponent = {
      ...photo,
      id: "opponent",
      ownerId: "other",
      categoryId: "old",
    };
    const battle = {
      id: "battle",
      seasonId: season.id,
      categoryId: "old",
      status: "OPEN",
      votes: [{ selectedPhotoId: "work" }],
      entries: [photo, opponent].map((p) => ({
        photoId: p.id,
        moderationStatus: "APPROVED",
      })),
    };
    battles.push(battle);
    for (const p of [photo, opponent])
      progress.push({
        id: p.id,
        photoId: p.id,
        userId: p.ownerId,
        seasonId: season.id,
        categoryId: "old",
        currentBattleId: battle.id,
        currentBattle: battle,
        photo: p,
        status: "ACTIVE",
        votes: p.id === "work" ? 11 : 3,
        round: 2,
        wonRounds: p.id === "work" ? 1 : 0,
      });
    return battle;
  }
  return {
    service,
    actor,
    photo,
    categories,
    season,
    battles,
    progress,
    writes,
    audits,
    locks,
    activeBattle,
  };
}

test("changing genre persists only the category, preserving publication, assets and ratings", async (t) => {
  const db = fixture(t);
  const result = await db.service.changeCategory(db.actor, "work", {
    categorySlug: " portrait ",
  });
  assert.deepEqual(db.writes, [{ categoryId: "new" }]);
  assert.equal(result.photo.category?.slug, "portrait");
  assert.equal(result.photo.status, "PUBLISHED");
  assert.equal(result.photo.moderationStatus, "APPROVED");
  assert.equal(
    result.photo.displayUrl,
    "https://storage.invalid/public/work.webp",
  );
  assert.equal(db.audits[0].action, "photo.category_changed");
  assert.deepEqual(db.audits[0].previous, { categoryId: "old" });
  assert.deepEqual(db.locks, ["battle-photo:work"]);
});

test("other photographers and moderators cannot change another author's genre; admins can", async (t) => {
  const db = fixture(t);
  for (const roles of [["PHOTOGRAPHER"], ["MODERATOR"]])
    await assert.rejects(
      db.service.changeCategory(
        { ...db.actor, id: "other", roles } as CurrentUser,
        "work",
        { categorySlug: "portrait" },
      ),
      (e: any) => e.getResponse().code === "PHOTO_FORBIDDEN",
    );
  assert.equal(db.writes.length, 0);
  for (const role of ["ADMIN", "SUPER_ADMIN"]) {
    db.photo.categoryId = "old";
    await db.service.changeCategory(
      { ...db.actor, id: "admin", roles: [role] } as CurrentUser,
      "work",
      { categorySlug: "portrait" },
    );
  }
  assert.equal(db.writes.length, 2);
});

test("missing, inactive, invalid genres, deleted works and profile images never reach a write", async (t) => {
  const db = fixture(t);
  for (const body of [
    null,
    {},
    { categorySlug: 1 },
    { categorySlug: " " },
    { categorySlug: "unknown" },
  ])
    await assert.rejects(db.service.changeCategory(db.actor, "work", body));
  db.categories[1]!.isActive = false;
  await assert.rejects(
    db.service.changeCategory(db.actor, "work", { categorySlug: "portrait" }),
  );
  db.categories[1]!.isActive = true;
  db.photo.title = "__profile_avatar__";
  await assert.rejects(
    db.service.changeCategory(db.actor, "work", { categorySlug: "portrait" }),
  );
  db.photo.title = "One moment";
  db.photo.deletedAt = new Date();
  await assert.rejects(
    db.service.changeCategory(db.actor, "work", { categorySlug: "portrait" }),
  );
  assert.equal(db.writes.length, 0);
});

test("saving the same genre is idempotent and cannot cancel or advance a battle", async (t) => {
  const db = fixture(t);
  const battle = db.activeBattle();
  await db.service.changeCategory(db.actor, "work", {
    categorySlug: "documentary",
  });
  assert.equal(db.writes.length, 0);
  assert.equal(db.audits.length, 0);
  assert.equal(battle.status, "OPEN");
  assert.equal(db.progress[0].round, 2);
});

test("active pairs are cancelled without deleting votes, and both photos wait in their actual genres", async (t) => {
  const db = fixture(t);
  const battle = db.activeBattle();
  await db.service.changeCategory(db.actor, "work", {
    categorySlug: "portrait",
  });
  assert.equal(battle.status, "CANCELLED");
  assert.equal(battle.categoryId, "old");
  assert.equal(battle.votes.length, 1);
  assert.deepEqual(
    db.progress.map((p) => [p.categoryId, p.status, p.round, p.votes]),
    [
      ["new", "WAITING", 3, 11],
      ["old", "WAITING", 3, 3],
    ],
  );
  assert.deepEqual(db.locks, ["battle-photo:work", "battle-rounds:season"]);
});

test("ended season winners retain their earned genre when the portfolio genre changes", async (t) => {
  const db = fixture(t);
  db.activeBattle();
  db.season.endsAt = new Date("2020-02-01");
  await db.service.changeCategory(db.actor, "work", {
    categorySlug: "portrait",
  });
  assert.equal(db.photo.categoryId, "new");
  assert.equal(db.progress[0].categoryId, "old");
  assert.equal(db.progress[0].status, "WINNER");
  assert.equal(db.progress[0].votes, 11);
  assert(db.season.battleFinalizedAt);
});
