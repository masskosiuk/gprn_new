import assert from "node:assert/strict";
import test from "node:test";
import type { prisma, Prisma } from "@gprn/db";
import type { CurrentUser } from "./auth.service.js";
import {
  feedPhotoOrder,
  portfolioPhotoOrder,
  moveGalleryPhoto,
  parseGalleryMove,
} from "./gallery-order.js";

const ids = [1, 2, 3, 4].map(
  (n) => `de000002-0000-4000-8000-${String(n).padStart(12, "0")}`,
);
const author: CurrentUser = {
  id: "author",
  roles: ["PHOTOGRAPHER"],
  email: "author@example.invalid",
  emailVerified: true,
  profile: null,
  ratings: [],
  status: "ACTIVE",
};
const admin: CurrentUser = { ...author, id: "admin", roles: ["ADMIN"] };
const code = (expected: string) => (error: any) =>
  error.getResponse().code === expected;

function database() {
  const photos = ids.map((id, index) => ({
    id,
    ownerId: index === 3 ? "other" : "author",
    portfolioPosition: null as number | null,
    feedPosition: null as number | null,
    status: "PUBLISHED",
    visibility: "PUBLIC",
    moderationStatus: "APPROVED",
    deletedAt: null as Date | null,
    title: "Work",
    active: true,
  }));
  const writes: any[] = [];
  const audits: any[] = [];
  const queries: any[] = [];
  const tx = {
    $executeRaw: async (query: any) => {
      if (Array.isArray(query)) return 1;
      assert.match(
        query.sql,
        /UPDATE "photos" SET "(portfolioPosition|feedPosition)" = CASE "id"/,
      );
      assert(!query.sql.includes(ids[0]!));
      assert(
        !/status|visibility|moderationStatus|ownerId|updatedAt/.test(query.sql),
      );
      writes.push(query);
      const field = query.sql.includes('"feedPosition"')
        ? "feedPosition"
        : "portfolioPosition";
      const count = query.values.length / 3;
      for (let i = 0; i < count; i++) {
        const photo = photos.find((photo) => photo.id === query.values[i * 2]);
        if (photo) photo[field] = query.values[i * 2 + 1];
      }
      return count;
    },
    photo: {
      findMany: async (query: any) => {
        queries.push(query);
        const field = query.where.ownerId
          ? "portfolioPosition"
          : "feedPosition";
        assert.deepEqual(
          query.orderBy,
          field === "feedPosition" ? feedPhotoOrder : portfolioPhotoOrder,
        );
        return photos
          .filter(
            (photo) =>
              !photo.deletedAt &&
              !photo.title.startsWith("__profile_") &&
              (query.where.ownerId
                ? photo.ownerId === query.where.ownerId
                : photo.active &&
                  photo.status === "PUBLISHED" &&
                  photo.visibility === "PUBLIC" &&
                  photo.moderationStatus === "APPROVED"),
          )
          .sort((a, b) => (a[field] ?? 100000) - (b[field] ?? 100000));
      },
    },
    auditLog: {
      create: async ({ data }: any) => {
        audits.push(data);
      },
    },
  };
  const client = {
    $transaction: async (
      run: (tx: Prisma.TransactionClient) => unknown,
      options: unknown,
    ) => {
      assert.deepEqual(options, { timeout: 15000 });
      return run(tx as unknown as Prisma.TransactionClient);
    },
  } as unknown as Pick<typeof prisma, "$transaction">;
  return { client, photos, writes, audits, queries, tx };
}

test("portfolio reorder is durable across requests and only changes the owner's positions", async () => {
  const db = database();
  const body = {
    scope: "PORTFOLIO",
    photoId: ids[2],
    targetId: ids[0],
    placement: "before",
  };
  assert.deepEqual((await moveGalleryPhoto(author, body, db.client)).photoIds, [
    ids[2],
    ids[0],
    ids[1],
  ]);
  assert.deepEqual(
    (
      await moveGalleryPhoto(
        author,
        { ...body, photoId: ids[1], targetId: ids[0], placement: "after" },
        db.client,
      )
    ).photoIds,
    [ids[2], ids[0], ids[1]],
  );
  assert.equal(db.writes.length, 1);
  assert.equal(db.photos[3]!.portfolioPosition, null);
  assert(db.photos.every((photo) => photo.feedPosition === null));
  assert.equal(db.audits[0].actorUserId, author.id);
});

test("admin and super-admin curate the feed independently of every portfolio", async () => {
  const db = database();
  await moveGalleryPhoto(
    author,
    {
      scope: "PORTFOLIO",
      photoId: ids[2],
      targetId: ids[0],
      placement: "before",
    },
    db.client,
  );
  const portfolio = db.photos.map((photo) => photo.portfolioPosition);
  assert.deepEqual(
    (
      await moveGalleryPhoto(
        admin,
        {
          scope: "FEED",
          photoId: ids[3],
          targetId: ids[0],
          placement: "before",
        },
        db.client,
      )
    ).photoIds,
    [ids[3], ids[0], ids[1], ids[2]],
  );
  const superAdmin = { ...admin, roles: ["SUPER_ADMIN"] } as CurrentUser;
  assert.deepEqual(
    (
      await moveGalleryPhoto(
        superAdmin,
        {
          scope: "FEED",
          photoId: ids[1],
          targetId: ids[2],
          placement: "after",
        },
        db.client,
      )
    ).photoIds,
    [ids[3], ids[0], ids[2], ids[1]],
  );
  assert.deepEqual(
    db.photos.map((photo) => photo.portfolioPosition),
    portfolio,
  );
});

test("ordinary users and moderators cannot edit feed order even by calling the API directly", async () => {
  const db = database();
  for (const roles of [["PHOTOGRAPHER"], ["USER"], ["MODERATOR"]]) {
    await assert.rejects(
      moveGalleryPhoto(
        { ...author, roles } as CurrentUser,
        {
          scope: "FEED",
          photoId: ids[0],
          targetId: ids[1],
          placement: "after",
        },
        db.client,
      ),
      code("GALLERY_ORDER_FORBIDDEN"),
    );
  }
  assert.equal(db.queries.length, 0);
  assert.equal(db.writes.length, 0);
});

test("foreign or missing portfolio works never reach a write, including for administrators", async () => {
  const db = database();
  for (const actor of [author, admin])
    await assert.rejects(
      moveGalleryPhoto(
        actor,
        {
          scope: "PORTFOLIO",
          photoId: ids[3],
          targetId: ids[0],
          placement: "before",
        },
        db.client,
      ),
      code("GALLERY_WORK_UNAVAILABLE"),
    );
  assert.equal(db.writes.length, 0);
});

test("feed moves cannot revive private, rejected, deleted, inactive or profile images", async () => {
  for (const patch of [
    { visibility: "PRIVATE" },
    { moderationStatus: "REJECTED" },
    { deletedAt: new Date() },
    { active: false },
    { title: "__profile_avatar" },
  ]) {
    const db = database();
    Object.assign(db.photos[0]!, patch);
    await assert.rejects(
      moveGalleryPhoto(
        admin,
        {
          scope: "FEED",
          photoId: ids[0],
          targetId: ids[1],
          placement: "after",
        },
        db.client,
      ),
      code("GALLERY_WORK_UNAVAILABLE"),
    );
    assert.equal(db.writes.length, 0);
  }
});

test("move validation rejects malformed IDs, arbitrary scopes and same-target requests", () => {
  const input = {
    scope: "PORTFOLIO",
    photoId: ids[0],
    targetId: ids[1],
    placement: "after",
  };
  for (const patch of [
    { photoId: "bad" },
    { targetId: ids[0] },
    { scope: "OTHER" },
    { placement: "middle" },
  ])
    assert.throws(() => parseGalleryMove({ ...input, ...patch }));
  assert.throws(() => parseGalleryMove(null));
});

test("large galleries are bounded before writing a potentially huge SQL statement", async () => {
  const db = database();
  db.tx.photo.findMany = async () =>
    Array.from({ length: 10001 }, () => db.photos[0]!);
  await assert.rejects(
    moveGalleryPhoto(
      admin,
      { scope: "FEED", photoId: ids[0], targetId: ids[1], placement: "after" },
      db.client,
    ),
    code("GALLERY_ORDER_LIMIT"),
  );
  assert.equal(db.writes.length, 0);
});
