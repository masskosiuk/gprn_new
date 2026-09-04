import { loadRuntimeEnv } from "@gprn/config";
import { prisma } from "@gprn/db";
import { Injectable } from "@nestjs/common";

import { dateToIso, publicAssetUrl } from "./serialization.js";

@Injectable()
export class DiscoverService {
  private readonly env = loadRuntimeEnv();

  async getOverview(): Promise<{
    photographers: readonly {
      readonly displayName: string;
      readonly photoCount: number;
      readonly rating: number;
      readonly username: string;
    }[];
    photos: readonly {
      readonly categorySlug: string | null;
      readonly displayUrl: string | null;
      readonly id: string;
      readonly locationLabel: string | null;
      readonly ownerName: string;
      readonly provenanceStatus: string | null;
      readonly publishedAt: string | null;
      readonly title: string;
    }[];
  }> {
    const [photos, photographers] = await Promise.all([
      prisma.photo.findMany({
        include: {
          assets: true,
          category: true,
          location: true,
          owner: {
            include: {
              profile: true
            }
          },
          provenance: true
        },
        orderBy: {
          publishedAt: "desc"
        },
        take: 24,
        where: {
          deletedAt: null,
          moderationStatus: "APPROVED",
          status: "PUBLISHED",
          visibility: "PUBLIC"
        }
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
                      visibility: "PUBLIC"
                    }
                  }
                }
              },
              ratings: {
                where: {
                  scope: "GLOBAL",
                  scopeKey: "global"
                }
              }
            }
          }
        },
        orderBy: {
          createdAt: "desc"
        },
        take: 12,
        where: {
          visibility: "PUBLIC"
        }
      })
    ]);

    return {
      photographers: photographers.map((profile) => ({
        displayName: profile.displayName,
        photoCount: profile.user._count.photos,
        rating: profile.user.ratings[0]?.rating ?? 1500,
        username: profile.username
      })),
      photos: photos.map((photo) => {
        const displayAsset =
          photo.assets.find((asset) => asset.type === "DISPLAY") ??
          photo.assets.find((asset) => asset.type === "THUMBNAIL");

        return {
          categorySlug: photo.category?.slug ?? null,
          displayUrl: displayAsset ? publicAssetUrl(this.env, displayAsset.storageKey) : null,
          id: photo.id,
          locationLabel:
            photo.location?.visibility === "HIDDEN" ? null : photo.location?.publicLabel ?? null,
          ownerName: photo.owner.profile?.displayName ?? "Photographer",
          provenanceStatus: photo.provenance?.status ?? null,
          publishedAt: dateToIso(photo.publishedAt),
          title: photo.title
        };
      })
    };
  }
}

