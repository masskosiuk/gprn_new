import { loadRuntimeEnv } from "@gprn/config";
import { prisma } from "@gprn/db";
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";

import type { CurrentUser } from "./auth.service.js";
import { publicAssetUrl } from "./serialization.js";
import { asRecord, optionalString, requiredString } from "./validation.js";

type PrismaTx = Omit<
  typeof prisma,
  "$connect" | "$disconnect" | "$extends" | "$on" | "$transaction" | "$use"
>;

const reportStatuses = new Set([
  "OPEN",
  "UNDER_REVIEW",
  "RESOLVED",
  "DISMISSED",
]);
const disputeStatuses = new Set([
  "OPEN",
  "EVIDENCE_REQUESTED",
  "UNDER_REVIEW",
  "RESOLVED",
  "CANCELLED",
]);
const moderationStatuses = new Set([
  "PENDING",
  "APPROVED",
  "REJECTED",
  "UNDER_REVIEW",
]);
const userStatuses = new Set([
  "ACTIVE",
  "SUSPENDED",
  "DELETION_REQUESTED",
  "DELETED",
]);
const profileTiers = new Set([
  "VIEWER",
  "AMATEUR",
  "BEGINNER",
  "EXPERIENCED",
  "PROFESSIONAL",
  "STAR",
]);
const promotionStatuses = new Set([
  "DRAFT",
  "PENDING_PAYMENT",
  "ACTIVE",
  "COMPLETED",
  "CANCELLED",
  "REJECTED",
]);
const battleStatuses = new Set(["DRAFT", "OPEN", "CLOSED", "CANCELLED"]);
const challengeStatuses = new Set([
  "DRAFT",
  "UPCOMING",
  "ACTIVE",
  "COMPLETED",
  "CANCELLED",
]);
const seasonStatuses = new Set([
  "DRAFT",
  "UPCOMING",
  "ACTIVE",
  "COMPLETED",
  "ARCHIVED",
]);

@Injectable()
export class AdminService {
  private readonly env = loadRuntimeEnv();

  async overview() {
    const [
      users,
      photos,
      publishedPhotos,
      battles,
      challenges,
      seasons,
      openReports,
      openDisputes,
      moderationPending,
      battleModerationPending,
      challengeModerationPending,
      flags,
    ] = await Promise.all([
      prisma.user.count(),
      prisma.photo.count({ where: { deletedAt: null } }),
      prisma.photo.count({ where: { deletedAt: null, status: "PUBLISHED" } }),
      prisma.battle.count(),
      prisma.challenge.count(),
      prisma.season.count(),
      prisma.report.count({
        where: { status: { in: ["OPEN", "UNDER_REVIEW"] } },
      }),
      prisma.copyrightDispute.count({
        where: {
          status: { in: ["OPEN", "EVIDENCE_REQUESTED", "UNDER_REVIEW"] },
        },
      }),
      prisma.photo.count({
        where: {
          battleEntries: {
            none: { moderationStatus: { in: ["PENDING", "UNDER_REVIEW"] } },
          },
          challengeEntries: {
            none: { moderationStatus: { in: ["PENDING", "UNDER_REVIEW"] } },
          },
          moderationStatus: { in: ["PENDING", "UNDER_REVIEW"] },
        },
      }),
      prisma.battleEntry.count({
        where: { moderationStatus: { in: ["PENDING", "UNDER_REVIEW"] } },
      }),
      prisma.challengeEntry.count({
        where: { moderationStatus: { in: ["PENDING", "UNDER_REVIEW"] } },
      }),
      prisma.featureFlag.findMany({ orderBy: { key: "asc" } }),
    ]);

    return {
      counts: {
        battles,
        challenges,
        moderationPending:
          moderationPending +
          battleModerationPending +
          challengeModerationPending,
        openDisputes,
        openReports,
        photos,
        publishedPhotos,
        seasons,
        users,
      },
      featureFlags: flags,
    };
  }

  async competitionCovers() {
    const [challenges, seasons] = await Promise.all([
      prisma.challenge.findMany({
        orderBy: [{ startsAt: "desc" }, { createdAt: "desc" }],
        select: {
          coverUrl: true,
          id: true,
          slug: true,
          status: true,
          title: true,
          titleKey: true,
        },
      }),
      prisma.season.findMany({
        orderBy: [{ startsAt: "desc" }, { createdAt: "desc" }],
        select: {
          coverUrl: true,
          id: true,
          name: true,
          nameKey: true,
          slug: true,
          status: true,
        },
      }),
    ]);

    return { challenges, seasons };
  }

  async battles() {
    const battles = await prisma.battle.findMany({
      include: {
        category: true,
        entries: {
          include: {
            photo: {
              include: { assets: true, owner: { include: { profile: true } } },
            },
          },
          orderBy: { slot: "asc" },
        },
        season: true,
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    });

    return {
      battles: battles.map((battle) => ({
        category: battle.category
          ? { nameKey: battle.category.nameKey, slug: battle.category.slug }
          : null,
        createdAt: battle.createdAt.toISOString(),
        endsAt: battle.endsAt?.toISOString() ?? null,
        entries: battle.entries.map((entry) => {
          const asset =
            entry.photo.assets.find((item) => item.type === "THUMBNAIL") ??
            entry.photo.assets.find((item) => item.type === "DISPLAY");
          return {
            displayUrl: asset
              ? publicAssetUrl(this.env, asset.storageKey)
              : null,
            id: entry.id,
            moderationStatus: entry.moderationStatus,
            ownerName:
              entry.photo.owner.profile?.displayName ?? entry.photo.owner.email,
            photoId: entry.photoId,
            slot: entry.slot,
            title: entry.photo.title,
          };
        }),
        id: battle.id,
        season: battle.season
          ? {
              id: battle.season.id,
              name: battle.season.name,
              nameKey: battle.season.nameKey,
              slug: battle.season.slug,
            }
          : null,
        startsAt: battle.startsAt?.toISOString() ?? null,
        status: battle.status,
      })),
    };
  }

  async updateChallenge(
    actor: CurrentUser,
    challengeId: string,
    body: unknown,
  ) {
    const record = asRecord(body);
    const title = requiredString(record, "title").slice(0, 160);
    const coverUrl = parseCoverUrl(body);
    const status = optionalString(record, "status");
    if (status && !challengeStatuses.has(status)) throw invalidStatus();

    return prisma.$transaction(async (tx) => {
      const previous = await tx.challenge.findUnique({
        where: { id: challengeId },
      });
      if (!previous) {
        throw notFound("CHALLENGE_NOT_FOUND", "Challenge does not exist.");
      }
      const challenge = await tx.challenge.update({
        data: {
          coverUrl,
          status: status ? (status as typeof previous.status) : undefined,
          title,
        },
        where: { id: challengeId },
      });
      await tx.auditLog.create({
        data: {
          action: "challenge.updated",
          actorUserId: actor.id,
          next: { coverUrl, status: challenge.status, title },
          previous: {
            coverUrl: previous.coverUrl,
            status: previous.status,
            title: previous.title,
          },
          targetId: challengeId,
          targetType: "challenge",
        },
      });
      return { challenge };
    });
  }

  async updateSeason(actor: CurrentUser, seasonId: string, body: unknown) {
    const record = asRecord(body);
    const name = requiredString(record, "name").slice(0, 160);
    const coverUrl = parseCoverUrl(body);
    const status = optionalString(record, "status");
    if (status && !seasonStatuses.has(status)) throw invalidStatus();

    return prisma.$transaction(async (tx) => {
      const previous = await tx.season.findUnique({ where: { id: seasonId } });
      if (!previous) {
        throw notFound("SEASON_NOT_FOUND", "Season does not exist.");
      }
      const season = await tx.season.update({
        data: {
          coverUrl,
          name,
          status: status ? (status as typeof previous.status) : undefined,
        },
        where: { id: seasonId },
      });
      await tx.auditLog.create({
        data: {
          action: "season.updated",
          actorUserId: actor.id,
          next: { coverUrl, name, status: season.status },
          previous: {
            coverUrl: previous.coverUrl,
            name: previous.name,
            status: previous.status,
          },
          targetId: seasonId,
          targetType: "season",
        },
      });
      return { season };
    });
  }

  async updateBattle(actor: CurrentUser, battleId: string, body: unknown) {
    const record = asRecord(body);
    const status = requiredString(record, "status");
    const categorySlug = requiredString(record, "categorySlug");
    const seasonId =
      typeof record.seasonId === "string" && record.seasonId.trim()
        ? record.seasonId.trim()
        : null;
    if (!battleStatuses.has(status)) throw invalidStatus();

    return prisma.$transaction(async (tx) => {
      const previous = await tx.battle.findUnique({
        include: { entries: { include: { photo: true } } },
        where: { id: battleId },
      });
      if (!previous)
        throw notFound("BATTLE_NOT_FOUND", "Battle does not exist.");
      const category = await tx.category.findUnique({
        where: { slug: categorySlug },
      });
      if (!category)
        throw notFound("CATEGORY_NOT_FOUND", "Category does not exist.");
      if (seasonId) {
        const season = await tx.season.findUnique({ where: { id: seasonId } });
        if (!season)
          throw notFound("SEASON_NOT_FOUND", "Season does not exist.");
      }
      if (
        status === "OPEN" &&
        (previous.entries.length !== 2 ||
          previous.entries.some(
            (entry) =>
              entry.moderationStatus !== "APPROVED" ||
              entry.photo.moderationStatus !== "APPROVED",
          ))
      ) {
        throw new BadRequestException({
          code: "BATTLE_ENTRIES_NOT_APPROVED",
          message: "Both battle entries must be approved before opening.",
        });
      }
      const battle = await tx.battle.update({
        data: {
          categoryId: category.id,
          endsAt:
            status === "OPEN"
              ? (previous.endsAt ?? new Date(Date.now() + 3 * 86_400_000))
              : previous.endsAt,
          seasonId,
          startsAt:
            status === "OPEN"
              ? (previous.startsAt ?? new Date())
              : previous.startsAt,
          status: status as typeof previous.status,
        },
        where: { id: battleId },
      });
      await tx.auditLog.create({
        data: {
          action: "battle.updated",
          actorUserId: actor.id,
          next: { categoryId: category.id, seasonId: battle.seasonId, status },
          previous: {
            categoryId: previous.categoryId,
            seasonId: previous.seasonId,
            status: previous.status,
          },
          targetId: battleId,
          targetType: "battle",
        },
      });
      return { battle };
    });
  }

  async updateChallengeCover(
    actor: CurrentUser,
    challengeId: string,
    body: unknown,
  ) {
    const coverUrl = parseCoverUrl(body);
    return prisma.$transaction(async (tx) => {
      const previous = await tx.challenge.findUnique({
        where: { id: challengeId },
      });
      if (!previous) {
        throw notFound("CHALLENGE_NOT_FOUND", "Challenge does not exist.");
      }
      const challenge = await tx.challenge.update({
        data: { coverUrl },
        where: { id: challengeId },
      });
      await tx.auditLog.create({
        data: {
          action: "challenge.cover_updated",
          actorUserId: actor.id,
          next: { coverUrl },
          previous: { coverUrl: previous.coverUrl },
          targetId: challengeId,
          targetType: "challenge",
        },
      });
      return { challenge };
    });
  }

  async updateSeasonCover(actor: CurrentUser, seasonId: string, body: unknown) {
    const coverUrl = parseCoverUrl(body);
    return prisma.$transaction(async (tx) => {
      const previous = await tx.season.findUnique({ where: { id: seasonId } });
      if (!previous) {
        throw notFound("SEASON_NOT_FOUND", "Season does not exist.");
      }
      const season = await tx.season.update({
        data: { coverUrl },
        where: { id: seasonId },
      });
      await tx.auditLog.create({
        data: {
          action: "season.cover_updated",
          actorUserId: actor.id,
          next: { coverUrl },
          previous: { coverUrl: previous.coverUrl },
          targetId: seasonId,
          targetType: "season",
        },
      });
      return { season };
    });
  }

  async users(query: unknown) {
    const record = asRecord(query);
    const search = optionalString(record, "search")?.trim().slice(0, 120);
    const status = optionalString(record, "status");
    const tier = optionalString(record, "tier");

    if (status && !userStatuses.has(status)) throw invalidStatus();
    if (tier && !profileTiers.has(tier)) throw invalidStatus();

    const users = await prisma.user.findMany({
      include: {
        _count: { select: { photos: true } },
        profile: true,
        ratings: {
          orderBy: { updatedAt: "desc" },
        },
        roles: { include: { role: true } },
        wallet: true,
      },
      orderBy: { createdAt: "desc" },
      take: 100,
      where: {
        ...(search
          ? {
              OR: [
                { email: { contains: search, mode: "insensitive" as const } },
                {
                  profile: {
                    is: {
                      displayName: {
                        contains: search,
                        mode: "insensitive" as const,
                      },
                    },
                  },
                },
                {
                  profile: {
                    is: {
                      username: {
                        contains: search,
                        mode: "insensitive" as const,
                      },
                    },
                  },
                },
              ],
            }
          : {}),
        ...(status
          ? {
              status: status as
                "ACTIVE" | "SUSPENDED" | "DELETION_REQUESTED" | "DELETED",
            }
          : {}),
        ...(tier
          ? {
              profile: {
                is: {
                  tier: tier as
                    | "VIEWER"
                    | "AMATEUR"
                    | "BEGINNER"
                    | "EXPERIENCED"
                    | "PROFESSIONAL"
                    | "STAR",
                },
              },
            }
          : {}),
      },
    });

    return {
      users: users.map((user) => {
        const rating =
          user.ratings.find(
            (item) => item.scope === "GLOBAL" && item.scopeKey === "global",
          ) ?? user.ratings[0];

        return {
          createdAt: user.createdAt,
          email: user.email,
          id: user.id,
          photoCount: user._count.photos,
          profile: user.profile
            ? {
                avatarAssetKey: user.profile.avatarAssetKey,
                displayName: user.profile.displayName,
                tier: user.profile.tier,
                username: user.profile.username,
              }
            : null,
          rating: rating
            ? {
                battles: rating.battles,
                id: rating.id,
                losses: rating.losses,
                rating: rating.rating,
                wins: rating.wins,
              }
            : null,
          roles: user.roles.map(({ role }) => role.key),
          status: user.status,
          wallet: user.wallet
            ? {
                balanceMinor: user.wallet.balanceMinor.toString(),
                currency: user.wallet.currency,
              }
            : null,
        };
      }),
    };
  }

  async moderationQueue() {
    const [photos, battleEntries, challengeEntries, reports, disputes] =
      await Promise.all([
        prisma.photo.findMany({
          include: {
            assets: true,
            battleEntries: { include: { battle: true } },
            category: true,
            challengeEntries: { include: { challenge: true } },
            owner: { include: { profile: true } },
            provenance: true,
          },
          orderBy: { updatedAt: "asc" },
          take: 100,
          where: {
            battleEntries: {
              none: { moderationStatus: { in: ["PENDING", "UNDER_REVIEW"] } },
            },
            challengeEntries: {
              none: { moderationStatus: { in: ["PENDING", "UNDER_REVIEW"] } },
            },
            moderationStatus: { in: ["PENDING", "UNDER_REVIEW"] },
            deletedAt: null,
          },
        }),
        prisma.battleEntry.findMany({
          include: {
            battle: { include: { category: true, season: true } },
            photo: {
              include: {
                assets: true,
                category: true,
                owner: { include: { profile: true } },
              },
            },
          },
          orderBy: { createdAt: "asc" },
          take: 100,
          where: {
            moderationStatus: { in: ["PENDING", "UNDER_REVIEW"] },
            photo: { deletedAt: null },
          },
        }),
        prisma.challengeEntry.findMany({
          include: {
            challenge: { include: { category: true, season: true } },
            photo: {
              include: {
                assets: true,
                category: true,
                owner: { include: { profile: true } },
              },
            },
          },
          orderBy: { submittedAt: "asc" },
          take: 100,
          where: {
            moderationStatus: { in: ["PENDING", "UNDER_REVIEW"] },
            photo: { deletedAt: null },
          },
        }),
        prisma.report.findMany({
          include: { photo: true, reporter: { include: { profile: true } } },
          orderBy: { createdAt: "asc" },
          take: 100,
          where: { status: { in: ["OPEN", "UNDER_REVIEW"] } },
        }),
        prisma.copyrightDispute.findMany({
          include: { subjectPhoto: true },
          orderBy: { createdAt: "asc" },
          take: 100,
          where: {
            status: { in: ["OPEN", "EVIDENCE_REQUESTED", "UNDER_REVIEW"] },
          },
        }),
      ]);

    return {
      disputes,
      photos: photos.map((photo) => {
        const displayAsset =
          photo.assets.find((asset) => asset.type === "DISPLAY") ??
          photo.assets.find((asset) => asset.type === "THUMBNAIL");

        return {
          category: photo.category
            ? { nameKey: photo.category.nameKey, slug: photo.category.slug }
            : null,
          contexts: {
            battles: photo.battleEntries.map((entry) => ({
              battleId: entry.battleId,
              status: entry.battle.status,
            })),
            challenges: photo.challengeEntries.map((entry) => ({
              challengeId: entry.challengeId,
              slug: entry.challenge.slug,
              status: entry.challenge.status,
            })),
          },
          createdAt: photo.createdAt.toISOString(),
          displayUrl: displayAsset
            ? publicAssetUrl(this.env, displayAsset.storageKey)
            : null,
          id: photo.id,
          moderationStatus: photo.moderationStatus,
          owner: {
            displayName: photo.owner.profile?.displayName ?? photo.owner.email,
            email: photo.owner.email,
            id: photo.owner.id,
            username: photo.owner.profile?.username ?? null,
          },
          provenanceStatus: photo.provenance?.status ?? null,
          status: photo.status,
          title: photo.title,
        };
      }),
      reports,
      submissions: [
        ...battleEntries.map((entry) =>
          this.toCompetitionModerationItem(
            "battle",
            entry.id,
            entry.moderationStatus,
            entry.createdAt,
            entry.photo,
            {
              id: entry.battleId,
              label: entry.battle.category?.nameKey ?? "battle",
              status: entry.battle.status,
            },
          ),
        ),
        ...challengeEntries.map((entry) =>
          this.toCompetitionModerationItem(
            "challenge",
            entry.id,
            entry.moderationStatus,
            entry.submittedAt,
            entry.photo,
            {
              id: entry.challengeId,
              label: entry.challenge.title ?? entry.challenge.titleKey,
              status: entry.challenge.status,
            },
          ),
        ),
      ].sort((left, right) => left.createdAt.localeCompare(right.createdAt)),
    };
  }

  private toCompetitionModerationItem(
    kind: "battle" | "challenge",
    entryId: string,
    moderationStatus: string,
    createdAt: Date,
    photo: {
      readonly assets: readonly {
        readonly storageKey: string;
        readonly type: string;
      }[];
      readonly category: {
        readonly nameKey: string;
        readonly slug: string;
      } | null;
      readonly id: string;
      readonly owner: {
        readonly email: string;
        readonly id: string;
        readonly profile: {
          readonly displayName: string;
          readonly username: string;
        } | null;
      };
      readonly title: string;
    },
    competition: {
      readonly id: string;
      readonly label: string;
      readonly status: string;
    },
  ) {
    const displayAsset =
      photo.assets.find((asset) => asset.type === "DISPLAY") ??
      photo.assets.find((asset) => asset.type === "THUMBNAIL");
    return {
      category: photo.category
        ? { nameKey: photo.category.nameKey, slug: photo.category.slug }
        : null,
      competition,
      createdAt: createdAt.toISOString(),
      displayUrl: displayAsset
        ? publicAssetUrl(this.env, displayAsset.storageKey)
        : null,
      entryId,
      kind,
      moderationStatus,
      owner: {
        displayName: photo.owner.profile?.displayName ?? photo.owner.email,
        email: photo.owner.email,
        id: photo.owner.id,
        username: photo.owner.profile?.username ?? null,
      },
      photoId: photo.id,
      title: photo.title,
    };
  }

  async updateReport(actor: CurrentUser, reportId: string, body: unknown) {
    const record = asRecord(body);
    const status = requiredString(record, "status");
    const reason = optionalString(record, "reason")?.slice(0, 2000);
    if (!reportStatuses.has(status)) {
      throw invalidStatus();
    }

    return prisma.$transaction(async (tx) => {
      const previous = await tx.report.findUnique({ where: { id: reportId } });
      if (!previous)
        throw notFound("REPORT_NOT_FOUND", "Report does not exist.");
      const report = await tx.report.update({
        data: { status: status as typeof previous.status },
        where: { id: reportId },
      });
      await tx.auditLog.create({
        data: {
          action: "report.status_changed",
          actorUserId: actor.id,
          next: { status },
          previous: { status: previous.status },
          reason,
          targetId: reportId,
          targetType: "report",
        },
      });
      return { report };
    });
  }

  async updateDispute(actor: CurrentUser, disputeId: string, body: unknown) {
    const record = asRecord(body);
    const status = requiredString(record, "status");
    const reason = optionalString(record, "reason")?.slice(0, 2000);
    if (!disputeStatuses.has(status)) {
      throw invalidStatus();
    }

    return prisma.$transaction(async (tx) => {
      const previous = await tx.copyrightDispute.findUnique({
        where: { id: disputeId },
      });
      if (!previous)
        throw notFound(
          "DISPUTE_NOT_FOUND",
          "Copyright dispute does not exist.",
        );
      const dispute = await tx.copyrightDispute.update({
        data: {
          decision: reason ? { reason } : undefined,
          status: status as typeof previous.status,
        },
        where: { id: disputeId },
      });
      await tx.auditLog.create({
        data: {
          action: "copyright_dispute.status_changed",
          actorUserId: actor.id,
          next: { status },
          previous: { status: previous.status },
          reason,
          targetId: disputeId,
          targetType: "copyright_dispute",
        },
      });
      return { dispute };
    });
  }

  async moderatePhoto(actor: CurrentUser, photoId: string, body: unknown) {
    const record = asRecord(body);
    const moderationStatus = requiredString(record, "moderationStatus");
    const reason = optionalString(record, "reason")?.slice(0, 2000);
    const categorySlug = optionalString(record, "categorySlug");
    if (!moderationStatuses.has(moderationStatus)) {
      throw invalidStatus();
    }
    if (moderationStatus === "REJECTED" && (!reason || reason.length < 3)) {
      throw new BadRequestException({
        code: "MODERATION_REASON_REQUIRED",
        message: "A rejection reason of at least 3 characters is required.",
      });
    }

    return prisma.$transaction(async (tx) => {
      const previous = await tx.photo.findUnique({ where: { id: photoId } });
      if (!previous) throw notFound("PHOTO_NOT_FOUND", "Photo does not exist.");
      const category = categorySlug
        ? await tx.category.findUnique({ where: { slug: categorySlug } })
        : null;
      if (categorySlug && !category) {
        throw notFound("CATEGORY_NOT_FOUND", "Category does not exist.");
      }
      const nextPhotoStatus =
        moderationStatus === "REJECTED"
          ? "REJECTED"
          : moderationStatus === "UNDER_REVIEW"
            ? "UNDER_REVIEW"
            : moderationStatus === "APPROVED"
              ? "PUBLISHED"
              : "READY";
      const photo = await tx.photo.update({
        data: {
          categoryId: category?.id,
          moderationStatus:
            moderationStatus as typeof previous.moderationStatus,
          publishedAt:
            moderationStatus === "APPROVED"
              ? (previous.publishedAt ?? new Date())
              : undefined,
          status: nextPhotoStatus,
          visibility: moderationStatus === "APPROVED" ? "PUBLIC" : undefined,
        },
        where: { id: photoId },
      });

      const battleEntries = await tx.battleEntry.findMany({
        select: { battleId: true },
        where: { photoId },
      });
      const battleIds = [
        ...new Set(battleEntries.map((entry) => entry.battleId)),
      ];

      if (moderationStatus === "REJECTED") {
        await tx.challengeEntry.updateMany({
          data: {
            moderatedAt: new Date(),
            moderationReason: reason ?? null,
            moderationStatus: "REJECTED",
          },
          where: { photoId },
        });
        await tx.battleEntry.updateMany({
          data: {
            moderatedAt: new Date(),
            moderationReason: reason ?? null,
            moderationStatus: "REJECTED",
          },
          where: { photoId },
        });
      }

      for (const battleId of battleIds) {
        const battle = await tx.battle.findUnique({
          include: { entries: { include: { photo: true } } },
          where: { id: battleId },
        });
        if (!battle) continue;
        if (battle.entries.length === 0) {
          await tx.battle.delete({ where: { id: battle.id } });
          continue;
        }

        const readyToOpen =
          battle.entries.length === 2 &&
          battle.entries.every(
            (entry) =>
              entry.photo.moderationStatus === "APPROVED" &&
              entry.moderationStatus === "APPROVED",
          );
        if (!readyToOpen) {
          await tx.battleVote.deleteMany({ where: { battleId: battle.id } });
        }
        await tx.battle.update({
          data: readyToOpen
            ? {
                endsAt:
                  battle.endsAt ??
                  new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
                startsAt: battle.startsAt ?? new Date(),
                status: "OPEN",
              }
            : { endsAt: null, startsAt: null, status: "DRAFT" },
          where: { id: battle.id },
        });
      }
      await tx.auditLog.create({
        data: {
          action: "photo.moderated",
          actorUserId: actor.id,
          next: {
            categoryId: category?.id ?? previous.categoryId,
            moderationStatus,
            status: nextPhotoStatus,
          },
          previous: {
            moderationStatus: previous.moderationStatus,
            status: previous.status,
          },
          reason,
          targetId: photoId,
          targetType: "photo",
        },
      });
      await tx.notification.create({
        data: {
          payload: {
            categorySlug: category?.slug ?? null,
            moderationStatus,
            photoId,
            reason,
            title: previous.title,
          },
          type:
            moderationStatus === "APPROVED"
              ? "photo_moderation_approved"
              : moderationStatus === "REJECTED"
                ? "photo_moderation_rejected"
                : "photo_moderation_updated",
          userId: previous.ownerId,
        },
      });
      return { photo };
    });
  }

  async moderateCompetitionEntry(
    actor: CurrentUser,
    kind: "battle" | "challenge",
    entryId: string,
    body: unknown,
  ) {
    const record = asRecord(body);
    const moderationStatus = requiredString(record, "moderationStatus");
    const reason = optionalString(record, "reason")?.slice(0, 2000);
    const categorySlug = optionalString(record, "categorySlug");
    if (
      !moderationStatuses.has(moderationStatus) ||
      moderationStatus === "PENDING"
    ) {
      throw invalidStatus();
    }
    if (moderationStatus === "REJECTED" && (!reason || reason.length < 3)) {
      throw new BadRequestException({
        code: "MODERATION_REASON_REQUIRED",
        message: "A rejection reason of at least 3 characters is required.",
      });
    }

    return prisma.$transaction(async (tx) => {
      const category = categorySlug
        ? await tx.category.findUnique({ where: { slug: categorySlug } })
        : null;
      if (categorySlug && !category) {
        throw notFound("CATEGORY_NOT_FOUND", "Category does not exist.");
      }

      if (kind === "battle") {
        const entry = await tx.battleEntry.findUnique({
          include: { battle: true, photo: true },
          where: { id: entryId },
        });
        if (!entry) {
          throw notFound(
            "BATTLE_ENTRY_NOT_FOUND",
            "Battle entry does not exist.",
          );
        }

        await tx.battleEntry.update({
          data: {
            moderatedAt: new Date(),
            moderationReason: reason ?? null,
            moderationStatus: moderationStatus as typeof entry.moderationStatus,
          },
          where: { id: entry.id },
        });
        await this.updateCompetitionPhoto(
          tx,
          entry.photo,
          moderationStatus,
          category?.id,
        );

        const battle = await tx.battle.findUnique({
          include: { entries: { include: { photo: true } } },
          where: { id: entry.battleId },
        });
        if (battle) {
          const readyToOpen =
            battle.entries.length === 2 &&
            battle.entries.every(
              (item) =>
                item.moderationStatus === "APPROVED" &&
                item.photo.moderationStatus === "APPROVED",
            );
          await tx.battle.update({
            data: readyToOpen
              ? {
                  endsAt:
                    battle.endsAt ?? new Date(Date.now() + 3 * 86_400_000),
                  startsAt: battle.startsAt ?? new Date(),
                  status: "OPEN",
                }
              : { endsAt: null, startsAt: null, status: "DRAFT" },
            where: { id: battle.id },
          });
        }

        await tx.auditLog.create({
          data: {
            action: "battle_entry.moderated",
            actorUserId: actor.id,
            next: {
              categoryId: category?.id ?? entry.photo.categoryId,
              moderationStatus,
            },
            previous: { moderationStatus: entry.moderationStatus },
            reason,
            targetId: entry.id,
            targetType: "battle_entry",
          },
        });
        await tx.notification.create({
          data: {
            payload: { reason, title: entry.photo.title },
            type: competitionNotificationType(kind, moderationStatus),
            userId: entry.userId,
          },
        });
        return { entryId, kind, moderationStatus };
      }

      const entry = await tx.challengeEntry.findUnique({
        include: { challenge: true, photo: true },
        where: { id: entryId },
      });
      if (!entry) {
        throw notFound(
          "CHALLENGE_ENTRY_NOT_FOUND",
          "Challenge entry does not exist.",
        );
      }
      await tx.challengeEntry.update({
        data: {
          moderatedAt: new Date(),
          moderationReason: reason ?? null,
          moderationStatus: moderationStatus as typeof entry.moderationStatus,
        },
        where: { id: entry.id },
      });
      await this.updateCompetitionPhoto(
        tx,
        entry.photo,
        moderationStatus,
        category?.id,
      );
      await tx.auditLog.create({
        data: {
          action: "challenge_entry.moderated",
          actorUserId: actor.id,
          next: {
            categoryId: category?.id ?? entry.photo.categoryId,
            moderationStatus,
          },
          previous: { moderationStatus: entry.moderationStatus },
          reason,
          targetId: entry.id,
          targetType: "challenge_entry",
        },
      });
      await tx.notification.create({
        data: {
          payload: { reason, title: entry.photo.title },
          type: competitionNotificationType(kind, moderationStatus),
          userId: entry.userId,
        },
      });
      return { entryId, kind, moderationStatus };
    });
  }

  private async updateCompetitionPhoto(
    tx: PrismaTx,
    photo: {
      readonly categoryId: string | null;
      readonly id: string;
      readonly moderationStatus: string;
      readonly publishedAt: Date | null;
    },
    moderationStatus: string,
    categoryId: string | undefined,
  ) {
    if (moderationStatus === "APPROVED") {
      await tx.photo.update({
        data: {
          categoryId,
          moderationStatus: "APPROVED",
          publishedAt: photo.publishedAt ?? new Date(),
          status: "PUBLISHED",
          visibility: "PUBLIC",
        },
        where: { id: photo.id },
      });
    } else if (
      moderationStatus === "UNDER_REVIEW" &&
      photo.moderationStatus !== "APPROVED"
    ) {
      await tx.photo.update({
        data: {
          categoryId,
          moderationStatus: "UNDER_REVIEW",
          status: "UNDER_REVIEW",
        },
        where: { id: photo.id },
      });
    }
  }

  async auditLogs() {
    const logs = await prisma.auditLog.findMany({
      orderBy: { createdAt: "desc" },
      take: 250,
    });
    return { logs };
  }

  async paymentHistory() {
    const [payments, walletTransactions, donations] = await Promise.all([
      prisma.payment.findMany({ orderBy: { createdAt: "desc" }, take: 250 }),
      prisma.walletTransaction.findMany({
        orderBy: { createdAt: "desc" },
        take: 250,
      }),
      prisma.donation.findMany({ orderBy: { createdAt: "desc" }, take: 250 }),
    ]);
    return {
      donations: donations.map(serializeMoney),
      payments: payments.map(serializeMoney),
      walletTransactions: walletTransactions.map(serializeMoney),
    };
  }

  async adjustWallet(actor: CurrentUser, userId: string, body: unknown) {
    const record = asRecord(body);
    const amountMinor = record.amountMinor;
    if (
      typeof amountMinor !== "number" ||
      !Number.isInteger(amountMinor) ||
      amountMinor === 0
    ) {
      throw new BadRequestException({
        code: "INVALID_AMOUNT",
        message: "amountMinor must be a non-zero integer.",
      });
    }
    const reason = requiredString(record, "reason").slice(0, 1000);
    return prisma.$transaction(async (tx) => {
      const target = await tx.user.findUnique({ where: { id: userId } });
      if (!target) throw notFound("USER_NOT_FOUND", "User does not exist.");
      const wallet = await tx.wallet.upsert({
        create: { balanceMinor: 0, currency: "USD", userId },
        update: {},
        where: { userId },
      });
      if (wallet.balanceMinor + BigInt(amountMinor) < 0n) {
        throw new BadRequestException({
          code: "NEGATIVE_BALANCE",
          message: "Adjustment would make the balance negative.",
        });
      }
      const updated = await tx.wallet.update({
        data: { balanceMinor: { increment: amountMinor } },
        where: { id: wallet.id },
      });
      const transaction = await tx.walletTransaction.create({
        data: {
          actorUserId: actor.id,
          amountMinor,
          currency: wallet.currency,
          note: reason,
          type: "ADMIN_ADJUSTMENT",
          walletId: wallet.id,
        },
      });
      await tx.auditLog.create({
        data: {
          action: "wallet.adjusted",
          actorUserId: actor.id,
          next: { amountMinor, balanceMinor: updated.balanceMinor.toString() },
          reason,
          targetId: userId,
          targetType: "user",
        },
      });
      return {
        balanceMinor: updated.balanceMinor.toString(),
        transaction: serializeMoney(transaction),
      };
    });
  }

  async updateUser(actor: CurrentUser, userId: string, body: unknown) {
    const record = asRecord(body);
    const status = optionalString(record, "status");
    const tier = optionalString(record, "tier");
    const reason = requiredString(record, "reason").slice(0, 1000);
    if (status && !userStatuses.has(status)) throw invalidStatus();
    if (tier && !profileTiers.has(tier)) throw invalidStatus();
    if (userId === actor.id && status && status !== "ACTIVE") {
      throw new BadRequestException({
        code: "ADMIN_SELF_LOCKOUT",
        message: "Administrators cannot suspend or delete their own account.",
      });
    }
    return prisma.$transaction(async (tx) => {
      const previous = await tx.user.findUnique({
        include: { profile: true },
        where: { id: userId },
      });
      if (!previous) throw notFound("USER_NOT_FOUND", "User does not exist.");
      const user = await tx.user.update({
        data: { status: status as typeof previous.status | undefined },
        where: { id: userId },
      });
      const profile = tier
        ? await tx.profile.update({
            data: {
              tier: tier as NonNullable<typeof previous.profile>["tier"],
            },
            where: { userId },
          })
        : previous.profile;
      await tx.auditLog.create({
        data: {
          action: "user.updated",
          actorUserId: actor.id,
          next: { status: user.status, tier: profile?.tier },
          previous: { status: previous.status, tier: previous.profile?.tier },
          reason,
          targetId: userId,
          targetType: "user",
        },
      });
      return { profile, user };
    });
  }

  async updateRating(actor: CurrentUser, ratingId: string, body: unknown) {
    const record = asRecord(body);
    const rating = record.rating;
    const reason = requiredString(record, "reason").slice(0, 1000);
    if (
      typeof rating !== "number" ||
      !Number.isInteger(rating) ||
      rating < 0 ||
      rating > 10000
    ) {
      throw new BadRequestException({
        code: "INVALID_RATING",
        message: "rating must be an integer from 0 to 10000.",
      });
    }
    return prisma.$transaction(async (tx) => {
      const previous = await tx.rating.findUnique({ where: { id: ratingId } });
      if (!previous)
        throw notFound("RATING_NOT_FOUND", "Rating does not exist.");
      const updated = await tx.rating.update({
        data: { rating },
        where: { id: ratingId },
      });
      await tx.ratingEvent.create({
        data: {
          algorithm: "admin_adjustment",
          delta: rating - previous.rating,
          ratingAfter: rating,
          ratingBefore: previous.rating,
          reason,
          scope: previous.scope,
          scopeKey: previous.scopeKey,
          userId: previous.userId,
        },
      });
      await tx.auditLog.create({
        data: {
          action: "rating.adjusted",
          actorUserId: actor.id,
          next: { rating },
          previous: { rating: previous.rating },
          reason,
          targetId: ratingId,
          targetType: "rating",
        },
      });
      return { rating: updated };
    });
  }

  async updatePromotion(
    actor: CurrentUser,
    promotionId: string,
    body: unknown,
  ) {
    const record = asRecord(body);
    const status = requiredString(record, "status");
    const reason = requiredString(record, "reason").slice(0, 1000);
    if (!promotionStatuses.has(status)) throw invalidStatus();
    return prisma.$transaction(async (tx) => {
      const previous = await tx.promotion.findUnique({
        where: { id: promotionId },
      });
      if (!previous)
        throw notFound("PROMOTION_NOT_FOUND", "Promotion does not exist.");
      const promotion = await tx.promotion.update({
        data: { status: status as typeof previous.status },
        where: { id: promotionId },
      });
      await tx.auditLog.create({
        data: {
          action: "promotion.updated",
          actorUserId: actor.id,
          next: { status },
          previous: { status: previous.status },
          reason,
          targetId: promotionId,
          targetType: "promotion",
        },
      });
      return { promotion: serializeMoney(promotion) };
    });
  }

  async deletePhoto(actor: CurrentUser, photoId: string, body: unknown) {
    const reason = requiredString(asRecord(body), "reason").slice(0, 1000);
    return prisma.$transaction(async (tx) => {
      const previous = await tx.photo.findUnique({ where: { id: photoId } });
      if (!previous) throw notFound("PHOTO_NOT_FOUND", "Photo does not exist.");
      const battleEntries = await tx.battleEntry.findMany({
        select: { battleId: true },
        where: { photoId },
      });
      const photo = await tx.photo.update({
        data: { deletedAt: new Date(), status: "DELETED" },
        where: { id: photoId },
      });
      await tx.promotion.updateMany({
        data: { status: "CANCELLED" },
        where: { photoId },
      });
      await tx.marketplaceProduct.updateMany({
        data: { status: "ARCHIVED" },
        where: { photoId },
      });
      if (battleEntries.length > 0) {
        await tx.battle.updateMany({
          data: { status: "CANCELLED" },
          where: {
            id: { in: battleEntries.map((entry) => entry.battleId) },
          },
        });
      }
      await tx.auditLog.create({
        data: {
          action: "photo.deleted",
          actorUserId: actor.id,
          previous: { status: previous.status },
          reason,
          targetId: photoId,
          targetType: "photo",
        },
      });
      return { photo };
    });
  }

  async deleteUser(actor: CurrentUser, userId: string, body: unknown) {
    if (userId === actor.id) {
      throw new BadRequestException({
        code: "ADMIN_SELF_DELETE",
        message: "Administrators cannot delete their own account.",
      });
    }
    const reason = requiredString(asRecord(body), "reason").slice(0, 1000);
    return prisma.$transaction(async (tx) => {
      const previous = await tx.user.findUnique({ where: { id: userId } });
      if (!previous) throw notFound("USER_NOT_FOUND", "User does not exist.");
      const battleEntries = await tx.battleEntry.findMany({
        select: { battleId: true },
        where: { userId },
      });
      const user = await tx.user.update({
        data: { deletedAt: new Date(), status: "DELETED" },
        where: { id: userId },
      });
      await tx.session.updateMany({
        data: { revokedAt: new Date() },
        where: { userId },
      });
      await tx.photo.updateMany({
        data: { deletedAt: new Date(), status: "DELETED" },
        where: { ownerId: userId },
      });
      await tx.promotion.updateMany({
        data: { status: "CANCELLED" },
        where: { ownerId: userId },
      });
      await tx.marketplaceProduct.updateMany({
        data: { status: "ARCHIVED" },
        where: { seller: { userId } },
      });
      if (battleEntries.length > 0) {
        await tx.battle.updateMany({
          data: { status: "CANCELLED" },
          where: {
            id: { in: battleEntries.map((entry) => entry.battleId) },
          },
        });
      }
      await tx.auditLog.create({
        data: {
          action: "user.deleted",
          actorUserId: actor.id,
          previous: { status: previous.status },
          reason,
          targetId: userId,
          targetType: "user",
        },
      });
      return { user };
    });
  }
}

function invalidStatus(): BadRequestException {
  return new BadRequestException({
    code: "INVALID_STATUS",
    message: "Status is not supported.",
  });
}

function competitionNotificationType(
  kind: "battle" | "challenge",
  moderationStatus: string,
): string {
  const outcome =
    moderationStatus === "APPROVED"
      ? "approved"
      : moderationStatus === "REJECTED"
        ? "rejected"
        : "reviewing";
  return `${kind}_entry_${outcome}`;
}

function parseCoverUrl(body: unknown): string | null {
  const coverUrl = optionalString(asRecord(body), "coverUrl");
  if (!coverUrl) return null;
  if (
    coverUrl.length > 2048 ||
    (!coverUrl.startsWith("/") && !/^https?:\/\//i.test(coverUrl))
  ) {
    throw new BadRequestException({
      code: "INVALID_COVER_URL",
      message: "coverUrl must be a root-relative or HTTP(S) URL.",
    });
  }
  return coverUrl;
}

function notFound(code: string, message: string): NotFoundException {
  return new NotFoundException({ code, message });
}

function serializeMoney<T extends Record<string, unknown>>(record: T) {
  return Object.fromEntries(
    Object.entries(record).map(([key, value]) => [
      key,
      typeof value === "bigint" ? value.toString() : value,
    ]),
  );
}
