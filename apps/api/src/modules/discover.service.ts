import { loadRuntimeEnv } from "@gprn/config";
import { prisma } from "@gprn/db";
import { Injectable } from "@nestjs/common";

import { dateToIso, publicAssetUrl } from "./serialization.js";

const reviewCriteria = [
  "composition",
  "lighting",
  "technicalQuality",
  "storytelling",
  "originality",
  "color",
  "emotionalImpact",
] as const;

@Injectable()
export class DiscoverService {
  private readonly env = loadRuntimeEnv();

  async getOverview() {
    const [photos, photographers] = await Promise.all([
      prisma.photo.findMany({
        include: {
          _count: {
            select: {
              likes: true,
              moodboardItems: true,
              reviews: true,
              savedBy: true,
            },
          },
          assets: true,
          category: true,
          location: { include: { city: true } },
          owner: {
            include: {
              profile: true,
            },
          },
          provenance: true,
          reviews: {
            select: {
              color: true,
              composition: true,
              emotionalImpact: true,
              lighting: true,
              originality: true,
              storytelling: true,
              technicalQuality: true,
            },
          },
        },
        orderBy: {
          publishedAt: "desc",
        },
        take: 48,
        where: {
          deletedAt: null,
          moderationStatus: "APPROVED",
          status: "PUBLISHED",
          visibility: "PUBLIC",
        },
      }),
      prisma.profile.findMany({
        include: {
          user: {
            include: {
              _count: {
                select: {
                  photos: {
                    where: {
                      status: "PUBLISHED",
                      visibility: "PUBLIC",
                    },
                  },
                },
              },
              ratings: {
                where: {
                  scope: "GLOBAL",
                  scopeKey: "global",
                },
              },
            },
          },
        },
        orderBy: {
          createdAt: "desc",
        },
        take: 24,
        where: {
          deletedAt: null,
          user: { status: "ACTIVE" },
          visibility: "PUBLIC",
        },
      }),
    ]);

    return {
      photographers: photographers.map((profile) => ({
        avatarUrl: profile.avatarAssetKey
          ? publicAssetUrl(this.env, profile.avatarAssetKey)
          : null,
        displayName: profile.displayName,
        photoCount: profile.user._count.photos,
        rating: profile.user.ratings[0]?.rating ?? 1500,
        tier: profile.tier,
        username: profile.username,
      })),
      photos: photos.map((photo) => {
        const displayAsset =
          photo.assets.find((asset) => asset.type === "DISPLAY") ??
          photo.assets.find((asset) => asset.type === "THUMBNAIL");

        return {
          categorySlug: photo.category?.slug ?? null,
          counts: {
            bookmarks: photo._count.savedBy,
            likes: photo._count.likes,
            moodboards: photo._count.moodboardItems,
            reviews: photo._count.reviews,
          },
          displayUrl: displayAsset
            ? publicAssetUrl(this.env, displayAsset.storageKey)
            : null,
          id: photo.id,
          location: photo.location
            ? {
                city: photo.location.city
                  ? { slug: photo.location.city.slug }
                  : null,
                publicLabel: photo.location.publicLabel,
                publicLatitude:
                  photo.location.visibility === "HIDDEN" ||
                  photo.location.publicLatitude === null
                    ? null
                    : Number(photo.location.publicLatitude),
                publicLongitude:
                  photo.location.visibility === "HIDDEN" ||
                  photo.location.publicLongitude === null
                    ? null
                    : Number(photo.location.publicLongitude),
                source: photo.location.source,
                visibility: photo.location.visibility,
              }
            : null,
          locationLabel:
            photo.location?.visibility === "HIDDEN"
              ? null
              : (photo.location?.publicLabel ?? null),
          ownerName: photo.owner.profile?.displayName ?? "Photographer",
          ownerTier: photo.owner.profile?.tier ?? "VIEWER",
          ownerUsername: photo.owner.profile?.username ?? "photographer",
          provenanceStatus: photo.provenance?.status ?? null,
          publishedAt: dateToIso(photo.publishedAt),
          reviewScores:
            photo.reviews.length > 0
              ? (Object.fromEntries(
                  reviewCriteria.map((criterion) => [
                    criterion,
                    photo.reviews.reduce(
                      (total, review) => total + review[criterion],
                      0,
                    ) / photo.reviews.length,
                  ]),
                ) as Record<(typeof reviewCriteria)[number], number>)
              : null,
          title: photo.title,
        };
      }),
    };
  }
}
