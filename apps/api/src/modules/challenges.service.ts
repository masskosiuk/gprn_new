import { loadRuntimeEnv } from "@gprn/config";
import { prisma } from "@gprn/db";
import {
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";

import type { CurrentUser } from "./auth.service.js";
import { dateToIso, publicAssetUrl } from "./serialization.js";
import { asRecord, requiredString } from "./validation.js";

const challengeInclude = {
  _count: {
    select: {
      entries: { where: { moderationStatus: "APPROVED" as const } },
    },
  },
  category: true,
  entries: {
    include: {
      photo: {
        include: {
          assets: true,
          owner: { include: { profile: true } },
        },
      },
    },
    orderBy: { submittedAt: "desc" as const },
    take: 12,
    where: {
      moderationStatus: "APPROVED" as const,
      photo: {
        is: {
          deletedAt: null,
          status: "PUBLISHED" as const,
          visibility: "PUBLIC" as const,
        },
      },
    },
  },
  season: true,
} as const;

interface ChallengeRecord {
  readonly _count: {
    readonly entries: number;
  };
  readonly category: {
    readonly nameKey: string;
    readonly slug: string;
  } | null;
  readonly descriptionKey: string | null;
  readonly coverUrl: string | null;
  readonly endsAt: Date | null;
  readonly entries: readonly {
    readonly id: string;
    readonly submittedAt: Date;
    readonly photo: {
      readonly id: string;
      readonly title: string;
      readonly assets: readonly {
        readonly storageKey: string;
        readonly type: string;
      }[];
      readonly owner: {
        readonly profile: {
          readonly displayName: string;
          readonly username: string;
        } | null;
      };
    };
  }[];
  readonly id: string;
  readonly season: {
    readonly name: string | null;
    readonly nameKey: string;
    readonly slug: string;
  } | null;
  readonly slug: string;
  readonly startsAt: Date | null;
  readonly status: string;
  readonly title: string | null;
  readonly titleKey: string;
}

@Injectable()
export class ChallengesService {
  private readonly env = loadRuntimeEnv();

  async list(): Promise<{
    challenges: ReturnType<ChallengesService["toChallengeResponse"]>[];
  }> {
    const challenges = await prisma.challenge.findMany({
      include: challengeInclude,
      orderBy: [
        {
          startsAt: "asc",
        },
        {
          createdAt: "desc",
        },
      ],
      take: 50,
      where: {
        status: {
          in: ["ACTIVE", "UPCOMING"],
        },
      },
    });

    return {
      challenges: challenges
        .sort(
          (left, right) =>
            challengeStatusOrder(left.status) -
            challengeStatusOrder(right.status),
        )
        .map((challenge) => this.toChallengeResponse(challenge)),
    };
  }

  async joinCurrentSeason(user: CurrentUser): Promise<{
    participant: {
      readonly joinedAt: string;
      readonly seasonSlug: string;
      readonly userId: string;
    };
    season: ReturnType<ChallengesService["toSeasonResponse"]>;
  }> {
    const season = await prisma.season.findFirst({
      orderBy: {
        startsAt: "asc",
      },
      where: {
        status: "ACTIVE",
      },
    });

    if (!season) {
      throw new NotFoundException({
        code: "SEASON_NOT_ACTIVE",
        message: "No active season is available.",
      });
    }

    const participant = await prisma.$transaction(async (tx) => {
      const savedParticipant = await tx.seasonParticipant.upsert({
        create: {
          seasonId: season.id,
          userId: user.id,
        },
        update: {},
        where: {
          seasonId_userId: {
            seasonId: season.id,
            userId: user.id,
          },
        },
      });

      await tx.analyticsEvent.create({
        data: {
          eventName: "season_joined",
          payload: {
            seasonId: season.id,
            seasonSlug: season.slug,
          },
          userId: user.id,
        },
      });

      await tx.notification.create({
        data: {
          payload: {
            seasonSlug: season.slug,
          },
          type: "season_joined",
          userId: user.id,
        },
      });

      const seasonAchievement = await tx.achievement.upsert({
        create: {
          descriptionKey: "achievement.season_entrant.description",
          key: "season_entrant",
          nameKey: "achievement.season_entrant.name",
        },
        update: {},
        where: { key: "season_entrant" },
      });
      await tx.userAchievement.upsert({
        create: { achievementId: seasonAchievement.id, userId: user.id },
        update: {},
        where: {
          userId_achievementId: {
            achievementId: seasonAchievement.id,
            userId: user.id,
          },
        },
      });

      return savedParticipant;
    });

    return {
      participant: {
        joinedAt: participant.joinedAt.toISOString(),
        seasonSlug: season.slug,
        userId: participant.userId,
      },
      season: this.toSeasonResponse(season),
    };
  }

  async mine(user: CurrentUser): Promise<{
    entries: readonly {
      readonly challengeId: string;
      readonly challengeSlug: string;
      readonly moderationStatus: string;
      readonly photoId: string;
      readonly submittedAt: string;
    }[];
    seasonJoined: boolean;
  }> {
    const [entries, membership] = await Promise.all([
      prisma.challengeEntry.findMany({
        include: { challenge: true, photo: true },
        orderBy: { submittedAt: "desc" },
        where: { userId: user.id },
      }),
      prisma.seasonParticipant.findFirst({
        where: {
          season: { status: "ACTIVE" },
          userId: user.id,
        },
      }),
    ]);

    return {
      entries: entries.map((entry) => ({
        challengeId: entry.challengeId,
        challengeSlug: entry.challenge.slug,
        moderationStatus: entry.moderationStatus,
        photoId: entry.photoId,
        submittedAt: entry.submittedAt.toISOString(),
      })),
      seasonJoined: Boolean(membership),
    };
  }

  async submit(
    user: CurrentUser,
    challengeIdOrSlug: string,
    body: unknown,
  ): Promise<{
    entry: {
      readonly challengeSlug: string;
      readonly photoId: string;
      readonly submittedAt: string;
      readonly userId: string;
    };
  }> {
    const photoId = requiredString(asRecord(body), "photoId");

    const result = await prisma.$transaction(async (tx) => {
      const challenge = await tx.challenge.findFirst({
        include: challengeInclude,
        where: isUuid(challengeIdOrSlug)
          ? {
              OR: [
                {
                  id: challengeIdOrSlug,
                },
                {
                  slug: challengeIdOrSlug,
                },
              ],
            }
          : {
              slug: challengeIdOrSlug,
            },
      });

      if (!challenge) {
        throw new NotFoundException({
          code: "CHALLENGE_NOT_FOUND",
          message: "Challenge does not exist.",
        });
      }

      if (challenge.status !== "ACTIVE") {
        throw new ConflictException({
          code: "CHALLENGE_NOT_ACTIVE",
          message: "This challenge is not accepting submissions.",
        });
      }

      const photo = await tx.photo.findUnique({
        select: {
          deletedAt: true,
          id: true,
          moderationStatus: true,
          ownerId: true,
          status: true,
          title: true,
          visibility: true,
        },
        where: {
          id: photoId,
        },
      });

      if (!photo || photo.deletedAt || photo.ownerId !== user.id) {
        throw new NotFoundException({
          code: "PHOTO_NOT_FOUND",
          message: "Use one of your own photos for this challenge.",
        });
      }

      if (
        !["READY", "UNDER_REVIEW", "PUBLISHED"].includes(photo.status) ||
        photo.moderationStatus === "REJECTED"
      ) {
        throw new ConflictException({
          code: "CHALLENGE_PHOTO_NOT_ELIGIBLE",
          message: "This work cannot be submitted to a challenge.",
        });
      }

      const existingUserEntry = await tx.challengeEntry.findFirst({
        where: {
          challengeId: challenge.id,
          userId: user.id,
        },
      });

      if (existingUserEntry) {
        throw new ConflictException({
          code: "CHALLENGE_ALREADY_SUBMITTED",
          message: "You already submitted a photo to this challenge.",
        });
      }

      const entry = await tx.challengeEntry.create({
        data: {
          challengeId: challenge.id,
          photoId: photo.id,
          userId: user.id,
        },
      });

      if (photo.moderationStatus !== "APPROVED") {
        await tx.photo.update({
          data: {
            moderationStatus: "UNDER_REVIEW",
            status: "UNDER_REVIEW",
            visibility: "PUBLIC",
          },
          where: { id: photo.id },
        });
        if (photo.moderationStatus !== "UNDER_REVIEW") {
          await tx.notification.create({
            data: {
              payload: { photoId: photo.id, title: photo.title },
              type: "photo_moderation_submitted",
              userId: user.id,
            },
          });
        }
      }

      await tx.analyticsEvent.createMany({
        data: [
          {
            eventName: "challenge_joined",
            payload: {
              challengeId: challenge.id,
              challengeSlug: challenge.slug,
            },
            userId: user.id,
          },
          {
            eventName: "challenge_photo_submitted",
            payload: {
              challengeId: challenge.id,
              photoId: photo.id,
            },
            userId: user.id,
          },
        ],
      });

      await tx.notification.create({
        data: {
          payload: {
            challengeSlug: challenge.slug,
            photoId: photo.id,
          },
          type: "challenge_submitted",
          userId: user.id,
        },
      });

      const challengeAchievement = await tx.achievement.upsert({
        create: {
          descriptionKey: "achievement.first_challenge.description",
          key: "first_challenge",
          nameKey: "achievement.first_challenge.name",
        },
        update: {},
        where: { key: "first_challenge" },
      });
      await tx.userAchievement.upsert({
        create: { achievementId: challengeAchievement.id, userId: user.id },
        update: {},
        where: {
          userId_achievementId: {
            achievementId: challengeAchievement.id,
            userId: user.id,
          },
        },
      });

      return {
        challenge,
        entry,
      };
    });

    return {
      entry: {
        challengeSlug: result.challenge.slug,
        photoId: result.entry.photoId,
        submittedAt: result.entry.submittedAt.toISOString(),
        userId: result.entry.userId,
      },
    };
  }

  async withdraw(user: CurrentUser, challengeIdOrSlug: string) {
    const entry = await prisma.challengeEntry.findFirst({
      include: { challenge: true },
      where: {
        challenge: isUuid(challengeIdOrSlug)
          ? { id: challengeIdOrSlug }
          : { slug: challengeIdOrSlug },
        userId: user.id,
      },
    });
    if (!entry) {
      throw new NotFoundException({
        code: "CHALLENGE_ENTRY_NOT_FOUND",
        message: "Challenge submission does not exist.",
      });
    }

    await prisma.$transaction(async (tx) => {
      await tx.challengeEntry.delete({ where: { id: entry.id } });
      await tx.notification.create({
        data: {
          payload: {
            challengeSlug: entry.challenge.slug,
            photoId: entry.photoId,
          },
          type: "challenge_withdrawn",
          userId: user.id,
        },
      });
    });

    return { challengeSlug: entry.challenge.slug, ok: true };
  }

  private toChallengeResponse(challenge: ChallengeRecord) {
    return {
      category: challenge.category
        ? {
            nameKey: challenge.category.nameKey,
            slug: challenge.category.slug,
          }
        : null,
      descriptionKey: challenge.descriptionKey,
      coverUrl: challenge.coverUrl,
      endsAt: dateToIso(challenge.endsAt),
      entriesCount: challenge._count.entries,
      entries: challenge.entries.flatMap((entry) => {
        const displayAsset =
          entry.photo.assets.find((asset) => asset.type === "DISPLAY") ??
          entry.photo.assets.find((asset) => asset.type === "THUMBNAIL");
        if (!displayAsset) return [];

        return [
          {
            id: entry.id,
            owner: {
              displayName:
                entry.photo.owner.profile?.displayName ?? "Photographer",
              username: entry.photo.owner.profile?.username ?? "photographer",
            },
            photo: {
              displayUrl: publicAssetUrl(this.env, displayAsset.storageKey),
              id: entry.photo.id,
              title: entry.photo.title,
            },
            submittedAt: entry.submittedAt.toISOString(),
          },
        ];
      }),
      id: challenge.id,
      season: challenge.season
        ? {
            name: challenge.season.name,
            nameKey: challenge.season.nameKey,
            slug: challenge.season.slug,
          }
        : null,
      slug: challenge.slug,
      startsAt: dateToIso(challenge.startsAt),
      status: challenge.status,
      title: challenge.title,
      titleKey: challenge.titleKey,
    };
  }

  private toSeasonResponse(season: {
    readonly coverUrl: string | null;
    readonly descriptionKey: string | null;
    readonly endsAt: Date;
    readonly name: string | null;
    readonly nameKey: string;
    readonly slug: string;
    readonly startsAt: Date;
    readonly status: string;
  }) {
    return {
      coverUrl: season.coverUrl,
      descriptionKey: season.descriptionKey,
      endsAt: season.endsAt.toISOString(),
      name: season.name,
      nameKey: season.nameKey,
      slug: season.slug,
      startsAt: season.startsAt.toISOString(),
      status: season.status,
    };
  }
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

function challengeStatusOrder(status: string): number {
  if (status === "ACTIVE") return 0;
  if (status === "UPCOMING") return 1;
  return 2;
}
