import { createHash } from "node:crypto";
import type { prisma } from "@gprn/db";
import { demoBattleAuthors } from "@gprn/domain";
import type { PhotoReviewScores } from "../modules/photo-engagement.js";

export const demoPhotoReviewComment =
  "Demo review for a stock/sample image. Illustrative scores, not an actual expert assessment.";

export function demoPhotoReviewScores(
  photoId: string,
  reviewerId: string,
): PhotoReviewScores {
  const hash = createHash("sha256").update(`${photoId}:${reviewerId}`).digest();
  const levels = [6, 7, 7, 8, 8, 8, 9, 9, 10];
  return {
    composition: levels[hash[0]! % levels.length]!,
    lighting: levels[hash[1]! % levels.length]!,
    technicalQuality: levels[hash[2]! % levels.length]!,
    storytelling: levels[hash[3]! % levels.length]!,
    originality: levels[hash[4]! % levels.length]!,
    color: levels[hash[5]! % levels.length]!,
    emotionalImpact: levels[hash[6]! % levels.length]!,
  };
}

export async function seedDemoPhotoReviews(
  client: Pick<typeof prisma, "$transaction">,
) {
  return client.$transaction(
    async (tx) => {
      const users = await tx.user.findMany({
        where: { id: { in: demoBattleAuthors.map((author) => author.id) } },
        select: {
          id: true,
          email: true,
          passwordHash: true,
          status: true,
          deletedAt: true,
          profile: { select: { username: true, tier: true, deletedAt: true } },
        },
      });
      for (const user of users) {
        const expected = demoBattleAuthors.find(
          (author) => author.id === user.id,
        )!;
        if (
          user.email !== `${expected.key}@demo.gprn.invalid` ||
          user.profile?.username !== expected.username ||
          user.passwordHash !== null
        ) {
          throw new Error(
            "Demo account ownership changed. No reviews were modified.",
          );
        }
      }
      const active = users.filter(
        (user) =>
          user.status === "ACTIVE" &&
          !user.deletedAt &&
          !user.profile?.deletedAt,
      );
      const reviewers = active.filter(
        (user) =>
          user.profile?.tier === "PROFESSIONAL" ||
          user.profile?.tier === "STAR",
      );
      if (reviewers.length < 2)
        throw new Error("Seed the demo photographers before their reviews.");

      const photos = await tx.photo.findMany({
        where: {
          ownerId: { in: active.map((user) => user.id) },
          deletedAt: null,
          status: "PUBLISHED",
          visibility: "PUBLIC",
          moderationStatus: "APPROVED",
          provenance: { sourceProvider: { in: ["demo", "stock-demo"] } },
          assets: {
            some: { type: "DISPLAY", contentType: { startsWith: "image/" } },
          },
        },
        select: {
          id: true,
          ownerId: true,
          _count: { select: { reviews: true } },
        },
      });
      const unrated = photos.filter((photo) => photo._count.reviews === 0);
      const data = unrated.flatMap((photo) =>
        reviewers
          .filter((user) => user.id !== photo.ownerId)
          .slice(0, 3)
          .map((reviewer) => {
            const scores = demoPhotoReviewScores(photo.id, reviewer.id);
            return {
              ...scores,
              photoId: photo.id,
              reviewerId: reviewer.id,
              reviewerTier: reviewer.profile!.tier,
              averageMinor: Math.round(
                (Object.values(scores).reduce((sum, score) => sum + score, 0) /
                  7) *
                  100,
              ),
              comment: demoPhotoReviewComment,
            };
          }),
      );
      const created = data.length
        ? (await tx.photoReview.createMany({ data, skipDuplicates: true }))
            .count
        : 0;
      return {
        created,
        photos: unrated.length,
        preserved: photos.length - unrated.length,
      };
    },
    { isolationLevel: "Serializable", timeout: 30_000 },
  );
}
