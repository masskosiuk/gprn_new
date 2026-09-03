import { loadRuntimeEnv } from "@gprn/config";
import { prisma, type Prisma } from "@gprn/db";
import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";

import type { CurrentUser } from "./auth.service.js";
import { isPrismaErrorCode, publicAssetUrl } from "./serialization.js";
import { asRecord, optionalEnum, optionalString } from "./validation.js";

const visibilities = ["PUBLIC", "FOLLOWERS", "PRIVATE"] as const;

type ProfileRecord = Prisma.ProfileGetPayload<{
  include: {
    city: true;
    country: true;
    region: true;
    user: {
      include: {
        _count: { select: { followers: true; following: true } };
        achievements: { include: { achievement: true } };
        photos: { include: { assets: true; category: true; location: true; provenance: true } };
        ratings: true;
      };
    };
  };
}>;

@Injectable()
export class ProfilesService {
  private readonly env = loadRuntimeEnv();

  async getPublic(username: string) {
    const profile = await prisma.profile.findUnique({
      include: {
        city: true,
        country: true,
        region: true,
        user: {
          include: {
            _count: { select: { followers: true, following: true } },
            achievements: { include: { achievement: true }, orderBy: { unlockedAt: "desc" } },
            photos: {
              include: { assets: true, category: true, location: true, provenance: true },
              orderBy: { publishedAt: "desc" },
              where: {
                deletedAt: null,
                moderationStatus: "APPROVED",
                status: "PUBLISHED",
                visibility: "PUBLIC"
              }
            },
            ratings: { orderBy: { rating: "desc" } }
          }
        }
      },
      where: { username }
    });

    if (!profile || profile.deletedAt || profile.visibility !== "PUBLIC" || profile.user.status !== "ACTIVE") {
      throw new NotFoundException({ code: "PROFILE_NOT_FOUND", message: "Profile does not exist." });
    }

    return { profile: this.serializeProfile(profile) };
  }

  async getMine(user: CurrentUser) {
    const profile = await prisma.profile.findUnique({
      include: {
        city: true,
        country: true,
        region: true,
        user: {
          include: {
            _count: { select: { followers: true, following: true } },
            achievements: { include: { achievement: true }, orderBy: { unlockedAt: "desc" } },
            photos: {
              include: { assets: true, category: true, location: true, provenance: true },
              orderBy: { createdAt: "desc" },
              where: { deletedAt: null }
            },
            ratings: { orderBy: { rating: "desc" } }
          }
        }
      },
      where: { userId: user.id }
    });

    if (!profile) throw new NotFoundException({ code: "PROFILE_NOT_FOUND", message: "Profile does not exist." });
    return { profile: this.serializeProfile(profile) };
  }

  async updateMine(user: CurrentUser, body: unknown) {
    const record = asRecord(body);
    const displayName = optionalString(record, "displayName")?.slice(0, 80);
    const username = optionalString(record, "username")?.toLowerCase();
    const bio = optionalString(record, "bio")?.slice(0, 1000);
    const websiteUrl = optionalString(record, "websiteUrl")?.slice(0, 500);
    const visibility = optionalEnum(record, "visibility", visibilities);
    const avatarPhotoId = optionalString(record, "avatarPhotoId");

    if (username && !/^[a-z0-9][a-z0-9-]{2,31}$/.test(username)) {
      throw new BadRequestException({
        code: "PROFILE_INVALID_USERNAME",
        message: "Username must contain 3-32 lowercase letters, numbers or hyphens."
      });
    }

    let avatarAssetKey: string | undefined;
    if (avatarPhotoId) {
      const photo = await prisma.photo.findFirst({
        include: { assets: true },
        where: { deletedAt: null, id: avatarPhotoId, ownerId: user.id }
      });
      const avatarAsset = photo?.assets.find((asset) => asset.type === "THUMBNAIL" || asset.type === "DISPLAY");
      if (!avatarAsset) {
        throw new BadRequestException({ code: "PROFILE_AVATAR_INVALID", message: "Choose one of your processed photos." });
      }
      avatarAssetKey = avatarAsset.storageKey;
    }

    try {
      const profile = await prisma.$transaction(async (tx) => {
        const previous = await tx.profile.findUniqueOrThrow({ where: { userId: user.id } });
        const saved = await tx.profile.update({
          data: { avatarAssetKey, bio, displayName, username, visibility, websiteUrl },
          where: { userId: user.id }
        });
        await tx.auditLog.create({
          data: {
            action: "profile.updated",
            actorUserId: user.id,
            next: { displayName: saved.displayName, username: saved.username, visibility: saved.visibility },
            previous: { displayName: previous.displayName, username: previous.username, visibility: previous.visibility },
            targetId: saved.id,
            targetType: "profile"
          }
        });
        return saved;
      });

      return { profile };
    } catch (error) {
      if (isPrismaErrorCode(error, "P2002")) {
        throw new ConflictException({ code: "PROFILE_USERNAME_TAKEN", message: "This username is already taken." });
      }
      throw error;
    }
  }

  private serializeProfile(profile: ProfileRecord) {
    return {
      achievements: profile.user.achievements.map((item) => ({
        key: item.achievement.key,
        nameKey: item.achievement.nameKey,
        unlockedAt: item.unlockedAt.toISOString()
      })),
      avatarUrl: profile.avatarAssetKey ? publicAssetUrl(this.env, profile.avatarAssetKey) : null,
      bio: profile.bio,
      displayName: profile.displayName,
      followers: profile.user._count.followers,
      following: profile.user._count.following,
      id: profile.id,
      location: {
        city: profile.city ? { nameKey: profile.city.nameKey, slug: profile.city.slug } : null,
        country: profile.country ? { iso2: profile.country.iso2, nameKey: profile.country.nameKey } : null,
        region: profile.region ? { nameKey: profile.region.nameKey, slug: profile.region.slug } : null
      },
      photos: profile.user.photos.map((photo) => {
        const asset = photo.assets.find((candidate) => candidate.type === "DISPLAY") ?? photo.assets.find((candidate) => candidate.type === "THUMBNAIL");
        return {
          category: photo.category ? { nameKey: photo.category.nameKey, slug: photo.category.slug } : null,
          createdAt: photo.createdAt.toISOString(),
          displayUrl: asset ? publicAssetUrl(this.env, asset.storageKey) : null,
          id: photo.id,
          locationLabel: photo.location?.visibility === "HIDDEN" ? null : photo.location?.publicLabel ?? null,
          provenanceStatus: photo.provenance?.status ?? null,
          publishedAt: photo.publishedAt?.toISOString() ?? null,
          status: photo.status,
          title: photo.title,
          visibility: photo.visibility
        };
      }),
      ratings: profile.user.ratings,
      username: profile.username,
      visibility: profile.visibility,
      websiteUrl: profile.websiteUrl
    };
  }
}
