import assert from "node:assert/strict";
import test from "node:test";
import type { Prisma, prisma } from "@gprn/db";
import { demoBattleAuthors, demoBattlePhotos } from "@gprn/domain";
import {
  demoPhotoReviewComment,
  demoPhotoReviewScores,
  seedDemoPhotoReviews,
} from "./demo-photo-review-seed.js";

function database() {
  const users = demoBattleAuthors.map((author) => ({
    id: author.id as string,
    email: `${author.key}@demo.gprn.invalid`,
    passwordHash: null as string | null,
    status: "ACTIVE",
    deletedAt: null,
    profile: {
      username: author.username as string,
      tier: author.tier,
      deletedAt: null,
    },
  }));
  const photos = demoBattlePhotos.map((photo) => ({
    id: photo.id as string,
    ownerId: demoBattleAuthors.find((author) => author.key === photo.author)!
      .id as string,
    status: "PUBLISHED",
    visibility: "PUBLIC",
    moderationStatus: "APPROVED",
    deletedAt: null as Date | null,
    source: "demo",
    contentType: "image/jpeg",
  }));
  const reviews = new Map<string, Record<string, any>>();
  const tx = {
    user: { findMany: async () => users },
    photo: {
      findMany: async ({ where }: any) => {
        assert.deepEqual(where.provenance.sourceProvider.in, [
          "demo",
          "stock-demo",
        ]);
        assert.equal(where.assets.some.type, "DISPLAY");
        return photos
          .filter(
            (photo) =>
              where.ownerId.in.includes(photo.ownerId) &&
              photo.deletedAt === where.deletedAt &&
              photo.status === where.status &&
              photo.visibility === where.visibility &&
              photo.moderationStatus === where.moderationStatus &&
              where.provenance.sourceProvider.in.includes(photo.source) &&
              photo.contentType.startsWith(
                where.assets.some.contentType.startsWith,
              ),
          )
          .map((photo) => ({
            id: photo.id,
            ownerId: photo.ownerId,
            _count: {
              reviews: [...reviews.values()].filter(
                (review) => review.photoId === photo.id,
              ).length,
            },
          }));
      },
    },
    photoReview: {
      createMany: async ({ data, skipDuplicates }: any) => {
        assert.equal(skipDuplicates, true);
        let count = 0;
        for (const review of data) {
          const key = review.photoId + ":" + review.reviewerId;
          if (!reviews.has(key)) {
            reviews.set(key, review);
            count++;
          }
        }
        return { count };
      },
    },
  };
  const client = {
    $transaction: async (
      run: (tx: Prisma.TransactionClient) => unknown,
      options: unknown,
    ) => {
      assert.deepEqual(options, {
        isolationLevel: "Serializable",
        timeout: 30_000,
      });
      return run(tx as unknown as Prisma.TransactionClient);
    },
  } as unknown as Pick<typeof prisma, "$transaction">;
  return { client, users, photos, reviews };
}

test("demo photos receive three labelled, valid and non-self reviews", async () => {
  const db = database();
  assert.deepEqual(await seedDemoPhotoReviews(db.client), {
    created: 30,
    photos: 10,
    preserved: 0,
  });
  for (const review of db.reviews.values()) {
    assert.notEqual(
      review.reviewerId,
      db.photos.find((photo) => photo.id === review.photoId)!.ownerId,
    );
    assert.equal(review.comment, demoPhotoReviewComment);
    assert(["PROFESSIONAL", "STAR"].includes(review.reviewerTier));
    const scores = demoPhotoReviewScores(review.photoId, review.reviewerId);
    Object.values(scores).forEach((value) =>
      assert(Number.isInteger(value) && value >= 6 && value <= 10),
    );
    assert.equal(
      review.averageMinor,
      Math.round(
        (Object.values(scores).reduce((sum, score) => sum + score, 0) / 7) *
          100,
      ),
    );
  }
});

test("repeat runs and photos with real reviews preserve every existing review", async () => {
  const db = database();
  db.reviews.set("real", {
    photoId: db.photos[0]!.id,
    reviewerId: "real-user",
    composition: 3,
  });
  assert.equal((await seedDemoPhotoReviews(db.client)).created, 27);
  const before = structuredClone(db.reviews);
  assert.deepEqual(await seedDemoPhotoReviews(db.client), {
    created: 0,
    photos: 0,
    preserved: 10,
  });
  assert.deepEqual(db.reviews, before);
});

test("custom uploads, private, deleted, unapproved and video works are excluded", async () => {
  const db = database();
  db.photos[0]!.source = "upload";
  db.photos[1]!.visibility = "PRIVATE";
  db.photos[2]!.deletedAt = new Date();
  db.photos[3]!.moderationStatus = "REJECTED";
  db.photos[4]!.status = "DRAFT";
  db.photos[5]!.contentType = "video/mp4";
  db.photos[6]!.ownerId = "real-user";
  assert.deepEqual(await seedDemoPhotoReviews(db.client), {
    created: 9,
    photos: 3,
    preserved: 0,
  });
});

test("changed email, username or credentials block all writes without exposing secrets", async () => {
  for (const field of ["email", "username", "password"]) {
    const db = database();
    if (field === "email") db.users[0]!.email = "private@example.invalid";
    if (field === "username") db.users[0]!.profile.username = "real-user";
    if (field === "password") db.users[0]!.passwordHash = "private-hash";
    await assert.rejects(
      seedDemoPhotoReviews(db.client),
      /^Error: Demo account ownership changed\. No reviews were modified\.$/,
    );
    assert.equal(db.reviews.size, 0);
  }
});

test("illustrative scores are deterministic and vary across photos and reviewers", () => {
  assert.deepEqual(
    demoPhotoReviewScores("one", "reviewer"),
    demoPhotoReviewScores("one", "reviewer"),
  );
  assert.notDeepEqual(
    demoPhotoReviewScores("one", "reviewer"),
    demoPhotoReviewScores("two", "reviewer"),
  );
  assert.notDeepEqual(
    demoPhotoReviewScores("one", "reviewer"),
    demoPhotoReviewScores("one", "another"),
  );
});

test("disabled demo accounts cannot own or author new seeded reviews", async () => {
  const db = database();
  db.users[0]!.status = "DISABLED";
  await seedDemoPhotoReviews(db.client);
  for (const review of db.reviews.values()) {
    assert.notEqual(review.reviewerId, db.users[0]!.id);
    assert.notEqual(
      db.photos.find((photo) => photo.id === review.photoId)!.ownerId,
      db.users[0]!.id,
    );
  }
});
