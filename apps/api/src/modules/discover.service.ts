import { loadRuntimeEnv } from "@gprn/config";
import { prisma } from "@gprn/db";
import { Injectable } from "@nestjs/common";
import { feedPhotoOrder } from "./gallery-order.js";
import {
  discoverQuery,
  encodeFeedCursor,
  feedPageSize,
} from "./discover-query.js";
import { photoSaleInclude, serializePhotoSale } from "./photo-sale.js";
import {
  photoEngagementInclude,
  photoEngagementResponse,
} from "./photo-engagement.js";

import {
  dateToIso,
  publicAssetUrl,
  mediaAssetResponse,
} from "./serialization.js";

@Injectable()
export class DiscoverService {
  private readonly env = loadRuntimeEnv();

  async getOverview(mediaType?: string, query: Record<string, unknown> = {}) {
    const { where, pageWhere, cursor } = discoverQuery(mediaType, query);
    const [batch, total, photographers] = await Promise.all([
      prisma.photo.findMany({
        include: {
          ...photoEngagementInclude,
          ...photoSaleInclude,
          assets: true,
          category: true,
          location: { include: { city: true } },
          owner: {
            include: {
              profile: true,
            },
          },
          provenance: true,
        },
        orderBy: feedPhotoOrder,
        take: feedPageSize + 1,
        where: pageWhere,
      }),
      prisma.photo.count({ where }),
      cursor
        ? []
        : prisma.profile.findMany({
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
    const photos = batch.slice(0, feedPageSize);

    return {
      total,
      nextCursor:
        batch.length > feedPageSize
          ? encodeFeedCursor(photos[photos.length - 1]!)
          : null,
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
        return {
          categorySlug: photo.category?.slug ?? null,
          ...photoEngagementResponse(photo),
          ...mediaAssetResponse(this.env, photo.assets),
          id: photo.id,
          sale: serializePhotoSale(photo),
          ownerId: photo.ownerId,
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
          title: photo.title,
        };
      }),
    };
  }
}
