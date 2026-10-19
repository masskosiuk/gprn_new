import { loadRuntimeEnv } from "@gprn/config";
import { prisma } from "@gprn/db";
import { EloRatingEngine } from "@gprn/domain";
import { createHash } from "node:crypto";
import {
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
} from "@nestjs/common";

import type { CurrentUser } from "./auth.service.js";
import { battlePage, battlePageQuery } from "./battle-pagination.js";
import {
  finalizeBattleSeason,
  lockBattleSeason,
  matchSeasonRounds,
  ROUND_VOTES_TO_ADVANCE,
} from "./battle-rounds.js";
import type { CookieRequest } from "./http.types.js";
import {
  dateToIso,
  isPrismaErrorCode,
  publicAssetUrl,
} from "./serialization.js";
import { asRecord, requiredString } from "./validation.js";

type PrismaTx = Omit<
  typeof prisma,
  "$connect" | "$disconnect" | "$extends" | "$on" | "$transaction" | "$use"
>;

const battleInclude = {
  category: true,
  entries: {
    include: {
      photo: {
        include: {
          assets: true,
          category: true,
          location: true,
          owner: {
            include: {
              profile: true,
              ratings: {
                where: {
                  scope: "GLOBAL",
                  scopeKey: "global",
                },
              },
            },
          },
          provenance: true,
        },
      },
    },
    orderBy: {
      slot: "asc",
    },
  },
  season: true,
  votes: true,
} as const;

interface BattleRecord {
  readonly id: string;
  readonly status: string;
  readonly seasonId?: string | null;
  readonly startsAt: Date | null;
  readonly endsAt: Date | null;
  readonly category: {
    readonly slug: string;
    readonly nameKey: string;
  } | null;
  readonly season: {
    readonly name: string | null;
    readonly slug: string;
    readonly nameKey: string;
  } | null;
  readonly entries: readonly {
    readonly id: string;
    readonly moderationStatus: string;
    readonly slot: string;
    readonly round?: number;
    readonly userId: string;
    readonly photo: {
      readonly id: string;
      readonly moderationStatus: string;
      readonly title: string;
      readonly assets: readonly {
        readonly type: string;
        readonly storageKey: string;
      }[];
      readonly location: {
        readonly publicLabel: string | null;
        readonly visibility: string;
      } | null;
      readonly owner: {
        readonly id: string;
        readonly profile: {
          readonly displayName: string;
          readonly username: string;
        } | null;
        readonly ratings: readonly {
          readonly rating: number;
        }[];
      };
      readonly provenance: {
        readonly status: string;
      } | null;
    };
  }[];
  readonly votes: readonly {
    readonly createdAt: Date;
    readonly selectedEntryId: string;
    readonly voterId: string;
    readonly weightMinor: number;
  }[];
}

@Injectable()
export class BattlesService {
  private readonly env = loadRuntimeEnv();
  private readonly ratingEngine = new EloRatingEngine();

  async listOpen(
    viewerId?: string,
    cursor?: string,
  ): Promise<{
    battles: ReturnType<BattlesService["toBattleResponse"]>[];
    nextCursor: string | null;
  }> {
    const expired = await prisma.season.findMany({
      where: {
        battleFinalizedAt: null,
        battleProgress: { some: {} },
        OR: [
          {
            endsAt: { lte: new Date() },
            status: { in: ["ACTIVE", "COMPLETED", "ARCHIVED"] },
          },
          { status: { in: ["COMPLETED", "ARCHIVED"] } },
        ],
      },
      select: { id: true },
      orderBy: [{ endsAt: "asc" }, { id: "asc" }],
      take: 1,
    });
    for (const season of expired)
      await prisma.$transaction(
        async (tx) => {
          await lockBattleSeason(tx, season.id);
          await finalizeBattleSeason(tx, season.id);
        },
        { timeout: 15000 },
      );
    const rows = await prisma.battle.findMany({
      ...battlePageQuery(cursor),
      include: battleInclude,
      where: {
        status: { in: ["DRAFT", "OPEN"] },
        OR: [
          { seasonId: null },
          {
            season: {
              status: "ACTIVE",
              startsAt: { lte: new Date() },
              endsAt: { gt: new Date() },
              battleFinalizedAt: null,
            },
          },
        ],
        ...(!viewerId
          ? {
              entries: {
                every: {
                  moderationStatus: "APPROVED" as const,
                  photo: {
                    deletedAt: null,
                    status: "PUBLISHED" as const,
                    moderationStatus: "APPROVED" as const,
                    visibility: "PUBLIC" as const,
                    owner: {
                      status: "ACTIVE" as const,
                      profile: {
                        deletedAt: null,
                        visibility: "PUBLIC" as const,
                      },
                    },
                  },
                },
              },
            }
          : {}),
      },
    });
    const { items: battles, nextCursor } = battlePage(rows);

    return {
      nextCursor,
      battles: battles
        .filter(
          (battle) =>
            battle.status === "OPEN" ||
            battle.entries.every(
              (entry) =>
                entry.moderationStatus === "APPROVED" &&
                entry.photo.moderationStatus === "APPROVED",
            ) ||
            battle.entries.some((entry) => entry.userId === viewerId),
        )
        .map((battle) => this.toBattleResponse(battle, viewerId)),
    };
  }

  async listMine(user: CurrentUser, cursor?: string) {
    const now = new Date();
    const seasons = await prisma.season.findMany({
      where: {
        battleFinalizedAt: null,
        battleProgress: { some: { userId: user.id } },
      },
      orderBy: [{ endsAt: "asc" }, { id: "asc" }],
      take: 20,
      select: { id: true },
    });
    for (const season of seasons)
      await prisma.$transaction(
        async (tx) => {
          await lockBattleSeason(tx, season.id);
          await finalizeBattleSeason(tx, season.id, now);
          await matchSeasonRounds(tx, season.id, now);
        },
        { timeout: 15000 },
      );
    const rows = await prisma.battleProgress.findMany({
      where: {
        userId: user.id,
        photo: {
          deletedAt: null,
          NOT: { title: { startsWith: "__profile_" } },
        },
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 25,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      include: {
        photo: { include: { assets: true } },
        category: true,
        season: true,
        currentBattle: { include: battleInclude },
      },
    });
    const items = rows.slice(0, 24);
    return {
      nextCursor: rows.length > 24 ? items.at(-1)!.id : null,
      works: items.map((row) => {
        const asset =
          row.photo.assets.find(
            (asset) => asset.type === "DISPLAY" && !asset.deletedAt,
          ) ??
          row.photo.assets.find(
            (asset) => asset.type === "THUMBNAIL" && !asset.deletedAt,
          );
        const current = row.currentBattle;
        const round =
          current?.status === "OPEN" || current?.status === "DRAFT"
            ? current
            : null;
        const entry = round?.entries.find(
          (entry) => entry.photoId === row.photoId,
        );
        return {
          id: row.id,
          photoId: row.photoId,
          title: row.photo.title,
          displayUrl: asset ? publicAssetUrl(this.env, asset.storageKey) : null,
          category: row.category
            ? { slug: row.category.slug, nameKey: row.category.nameKey }
            : null,
          season: {
            id: row.season.id,
            name: row.season.name,
            nameKey: row.season.nameKey,
            endsAt: row.season.endsAt.toISOString(),
          },
          round: row.round,
          votes: row.votes,
          wonRounds: row.wonRounds,
          status:
            row.photo.moderationStatus === "REJECTED"
              ? "UNAVAILABLE"
              : row.photo.moderationStatus !== "APPROVED" &&
                  !["WITHDRAWN", "COMPLETED", "WINNER"].includes(row.status)
                ? "PENDING"
                : row.status,
          roundVotes: entry
            ? round!.votes.filter((vote) => vote.selectedEntryId === entry.id)
                .length
            : 0,
          votesToAdvance: ROUND_VOTES_TO_ADVANCE,
          battle: round ? this.toBattleResponse(round, user.id) : null,
        };
      }),
    };
  }

  async join(
    user: CurrentUser,
    body: unknown,
  ): Promise<{ battle: ReturnType<BattlesService["toBattleResponse"]> }> {
    const photoId = requiredString(asRecord(body), "photoId");

    const battleId = await prisma.$transaction(
      async (tx) => {
        const now = new Date();
        const season = await tx.season.findFirst({
          where: {
            status: "ACTIVE",
            startsAt: { lte: now },
            endsAt: { gt: now },
            battleFinalizedAt: null,
          },
          orderBy: [{ startsAt: "desc" }, { id: "desc" }],
        });
        if (!season)
          throw new ConflictException({
            code: "BATTLE_NO_ACTIVE_SEASON",
            message: "There is no active battle season.",
          });
        await lockBattleSeason(tx, season.id);
        const photo = await tx.photo.findFirst({
          select: {
            categoryId: true,
            assets: { select: { type: true, contentType: true } },
            id: true,
            moderationStatus: true,
            status: true,
            title: true,
            visibility: true,
          },
          where: {
            deletedAt: null,
            id: photoId,
            ownerId: user.id,
          },
        });

        if (
          !photo ||
          !photo.categoryId ||
          photo.title.startsWith("__profile_") ||
          !["READY", "UNDER_REVIEW", "PUBLISHED"].includes(photo.status) ||
          photo.moderationStatus === "REJECTED" ||
          photo.assets.some(
            (asset) =>
              asset.type === "DISPLAY" &&
              asset.contentType.startsWith("video/"),
          )
        ) {
          throw new ConflictException({
            code: "BATTLE_PHOTO_NOT_ELIGIBLE",
            message: "Choose one of your approved public photos.",
          });
        }

        const existingEntry = await tx.battleEntry.findFirst({
          select: { battleId: true },
          where: {
            battle: { seasonId: season.id, status: { in: ["DRAFT", "OPEN"] } },
            moderationStatus: { in: ["PENDING", "UNDER_REVIEW", "APPROVED"] },
            photoId: photo.id,
          },
        });
        if (existingEntry) return existingEntry.battleId;
        const progress = await tx.battleProgress.findUnique({
          where: {
            seasonId_photoId: { seasonId: season.id, photoId: photo.id },
          },
        });
        if (
          progress &&
          !["WITHDRAWN", "UNAVAILABLE"].includes(progress.status) &&
          progress.currentBattleId
        )
          return progress.currentBattleId;

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

        const battle = await tx.battle.create({
          data: {
            categoryId: photo.categoryId,
            entries: {
              create: {
                photoId: photo.id,
                slot: "A",
                userId: user.id,
                round: progress?.round ?? 1,
              },
            },
            seasonId: season.id,
            status: "DRAFT",
          },
        });
        await tx.battleProgress.upsert({
          where: {
            seasonId_photoId: { seasonId: season.id, photoId: photo.id },
          },
          create: {
            seasonId: season.id,
            photoId: photo.id,
            userId: user.id,
            categoryId: photo.categoryId,
            currentBattleId: battle.id,
          },
          update: {
            status: "PENDING",
            categoryId: photo.categoryId,
            currentBattleId: battle.id,
          },
        });

        await tx.analyticsEvent.create({
          data: {
            eventName: "battle_joined",
            payload: { battleId: battle.id, photoId },
            userId: user.id,
          },
        });
        await tx.notification.create({
          data: {
            payload: { battleId: battle.id, photoId },
            type: "battle_joined",
            userId: user.id,
          },
        });

        return battle.id;
      },
      { timeout: 15000 },
    );

    const battle = await prisma.battle.findUniqueOrThrow({
      include: battleInclude,
      where: { id: battleId },
    });
    return { battle: this.toBattleResponse(battle, user.id) };
  }

  async vote(
    user: CurrentUser,
    battleId: string,
    body: unknown,
    request: CookieRequest,
  ): Promise<{
    battle: ReturnType<BattlesService["toBattleResponse"]>;
    ratingEvents: readonly {
      readonly delta: number;
      readonly displayName: string;
      readonly ratingAfter: number;
      readonly ratingBefore: number;
      readonly userId: string;
    }[];
  }> {
    const selectedEntryId = requiredString(asRecord(body), "selectedEntryId");

    try {
      const result = await prisma.$transaction(
        async (tx) => {
          const identity = await tx.battle.findUnique({
            where: { id: battleId },
            select: { seasonId: true },
          });
          await lockBattleSeason(tx, identity?.seasonId ?? null);
          const battle = await tx.battle.findUnique({
            include: battleInclude,
            where: {
              id: battleId,
            },
          });

          if (!battle) {
            throw new NotFoundException({
              code: "BATTLE_NOT_FOUND",
              message: "Battle does not exist.",
            });
          }

          if (battle.status !== "OPEN") {
            throw new ConflictException({
              code: "BATTLE_CLOSED",
              message: "This battle is already closed.",
            });
          }
          if (battle.seasonId) {
            const season = await tx.season.findUnique({
              where: { id: battle.seasonId },
            });
            if (
              !season ||
              season.status !== "ACTIVE" ||
              season.endsAt <= new Date() ||
              season.startsAt > new Date() ||
              season.battleFinalizedAt
            ) {
              throw new ConflictException({
                code: "BATTLE_SEASON_FINISHED",
                message: "Voting in this season has ended.",
              });
            }
          }
          if (
            battle.entries.length !== 2 ||
            battle.entries.some(
              (entry) =>
                entry.moderationStatus !== "APPROVED" ||
                entry.photo.moderationStatus !== "APPROVED" ||
                (battle.categoryId !== null &&
                  entry.photo.categoryId !== battle.categoryId),
            )
          ) {
            throw new ConflictException({
              code: "BATTLE_NOT_READY",
              message: "Both photographs must be approved.",
            });
          }
          if (
            battle.entries.some(
              (entry) =>
                entry.photo.deletedAt ||
                entry.photo.status !== "PUBLISHED" ||
                entry.photo.visibility !== "PUBLIC" ||
                entry.photo.title.startsWith("__profile_") ||
                entry.photo.owner.status !== "ACTIVE" ||
                entry.photo.owner.profile?.visibility !== "PUBLIC" ||
                entry.photo.owner.profile?.deletedAt,
            )
          ) {
            throw new ConflictException({
              code: "BATTLE_NOT_READY",
              message: "Both photographs must remain publicly available.",
            });
          }

          const selectedEntry = battle.entries.find(
            (entry) => entry.id === selectedEntryId,
          );
          const losingEntry = battle.entries.find(
            (entry) => entry.id !== selectedEntryId,
          );

          if (!selectedEntry || !losingEntry) {
            throw new NotFoundException({
              code: "BATTLE_ENTRY_NOT_FOUND",
              message: "Selected photo is not part of this battle.",
            });
          }

          if (battle.entries.some((entry) => entry.userId === user.id)) {
            throw new ForbiddenException({
              code: "BATTLE_SELF_VOTE_BLOCKED",
              message: "You cannot vote in your own battle.",
            });
          }

          if (battle.seasonId)
            for (const entry of battle.entries) {
              const progress = await tx.battleProgress.findUnique({
                where: {
                  seasonId_photoId: {
                    seasonId: battle.seasonId,
                    photoId: entry.photo.id,
                  },
                },
              });
              if (!progress) {
                const [votes, wonRounds] = await Promise.all([
                  tx.battleVote.count({
                    where: {
                      selectedPhotoId: entry.photo.id,
                      battle: { seasonId: battle.seasonId },
                    },
                  }),
                  tx.battle.count({
                    where: {
                      seasonId: battle.seasonId,
                      status: "CLOSED",
                      winnerPhotoId: entry.photo.id,
                    },
                  }),
                ]);
                await tx.battleProgress.create({
                  data: {
                    seasonId: battle.seasonId,
                    photoId: entry.photo.id,
                    userId: entry.userId,
                    categoryId: entry.photo.categoryId,
                    currentBattleId: battle.id,
                    round: entry.round,
                    votes,
                    wonRounds,
                    status: "ACTIVE",
                  },
                });
              } else if (
                progress.currentBattleId !== battle.id ||
                progress.status !== "ACTIVE"
              ) {
                throw new ConflictException({
                  code: "BATTLE_ROUND_CHANGED",
                  message:
                    "This photograph has already moved to another round.",
                });
              }
            }

          const recentVoteCount = await tx.battleVote.count({
            where: {
              createdAt: { gte: new Date(Date.now() - 60 * 60 * 1000) },
              voterId: user.id,
            },
          });
          if (recentVoteCount >= 60) {
            throw new HttpException(
              {
                code: "BATTLE_RATE_LIMITED",
                message: "Voting is temporarily limited for this account.",
              },
              HttpStatus.TOO_MANY_REQUESTS,
            );
          }

          const weightMinor =
            user.profile?.tier === "STAR"
              ? 1000
              : user.profile?.tier === "PROFESSIONAL"
                ? 400
                : 100;
          const ipHash = hashSignal(getClientIp(request));
          const deviceHash = hashSignal(
            getHeader(request, "x-device-id") ??
              getHeader(request, "user-agent") ??
              "unknown",
          );

          await tx.battleVote.create({
            data: {
              battleId: battle.id,
              deviceHash,
              ipHash,
              selectedEntryId: selectedEntry.id,
              selectedPhotoId: selectedEntry.photo.id,
              suspiciousFlag: recentVoteCount >= 20,
              voterId: user.id,
              weightMinor,
            },
          });
          if (battle.seasonId)
            await tx.battleProgress.updateMany({
              where: {
                seasonId: battle.seasonId,
                photoId: selectedEntry.photo.id,
                currentBattleId: battle.id,
                status: "ACTIVE",
              },
              data: { votes: { increment: 1 } },
            });

          const votes = [
            ...battle.votes,
            {
              createdAt: new Date(),
              selectedEntryId: selectedEntry.id,
              voterId: user.id,
              weightMinor,
            },
          ];
          const totals = battle.entries.map((entry) => ({
            entry,
            weight: votes.filter((vote) => vote.selectedEntryId === entry.id)
              .length,
          }));
          totals.sort((left, right) => right.weight - left.weight);

          let ratingEvents: Awaited<
            ReturnType<BattlesService["applyBattleRating"]>
          > = [];
          if (
            totals[0] &&
            totals[1] &&
            totals[0].weight >= ROUND_VOTES_TO_ADVANCE &&
            totals[0].weight > totals[1].weight
          ) {
            ratingEvents = await this.applyBattleRating(
              tx,
              battle.id,
              totals[0].entry,
              totals[1].entry,
            );
            await tx.battle.update({
              data: {
                endsAt: new Date(),
                status: "CLOSED",
                winnerPhotoId: totals[0].entry.photo.id,
              },
              where: { id: battle.id },
            });
            await tx.notification.createMany({
              data: battle.entries.map((entry) => ({
                payload: {
                  battleId: battle.id,
                  winnerPhotoId: totals[0]?.entry.photo.id,
                },
                type: "battle_completed",
                userId: entry.userId,
              })),
            });
            if (battle.seasonId) {
              await tx.battleProgress.updateMany({
                where: {
                  seasonId: battle.seasonId,
                  currentBattleId: battle.id,
                  status: "ACTIVE",
                },
                data: { round: { increment: 1 }, status: "WAITING" },
              });
              await tx.battleProgress.updateMany({
                where: {
                  seasonId: battle.seasonId,
                  photoId: totals[0].entry.photo.id,
                },
                data: { wonRounds: { increment: 1 } },
              });
              await matchSeasonRounds(tx, battle.seasonId);
            }
            await this.unlockBattleAchievements(
              tx,
              totals[0].entry.userId,
              totals[1].entry.userId,
            );
          }

          await tx.analyticsEvent.create({
            data: {
              eventName: "battle_vote_cast",
              payload: {
                battleId: battle.id,
                selectedPhotoId: selectedEntry.photo.id,
              },
              userId: user.id,
            },
          });

          return {
            ratingEvents,
          };
        },
        { timeout: 15000 },
      );

      const battle = await prisma.battle.findUniqueOrThrow({
        include: battleInclude,
        where: {
          id: battleId,
        },
      });

      return {
        battle: this.toBattleResponse(battle, user.id),
        ratingEvents: result.ratingEvents,
      };
    } catch (error) {
      if (isPrismaErrorCode(error, "P2002")) {
        throw new ConflictException({
          code: "BATTLE_DUPLICATE_VOTE",
          message: "You have already voted in this battle.",
        });
      }

      throw error;
    }
  }

  async withdraw(user: CurrentUser, battleId: string) {
    await prisma.$transaction(
      async (tx) => {
        const identity = await tx.battle.findUnique({
          where: { id: battleId },
          select: { seasonId: true },
        });
        await lockBattleSeason(tx, identity?.seasonId ?? null);
        const entry = await tx.battleEntry.findFirst({
          include: { battle: true },
          where: { battleId, userId: user.id },
        });
        if (!entry)
          throw new NotFoundException({
            code: "BATTLE_ENTRY_NOT_FOUND",
            message: "Battle participation does not exist.",
          });
        const progress = await tx.battleProgress.findFirst({
          where: {
            currentBattleId: battleId,
            photoId: entry.photoId,
            userId: user.id,
            status: { in: ["ACTIVE", "PENDING", "WAITING"] },
          },
        });
        if (entry.battle.status === "CLOSED" && !progress)
          throw new ConflictException({
            code: "BATTLE_ALREADY_CLOSED",
            message: "A completed battle cannot be withdrawn.",
          });
        if (progress)
          await tx.battleProgress.update({
            where: { id: progress.id },
            data: { status: "WITHDRAWN" },
          });
        if (["DRAFT", "OPEN"].includes(entry.battle.status)) {
          await tx.battle.update({
            where: { id: battleId },
            data: { status: "CANCELLED", endsAt: new Date() },
          });
          await tx.battleProgress.updateMany({
            where: {
              currentBattleId: battleId,
              userId: { not: user.id },
              status: "ACTIVE",
            },
            data: { status: "WAITING", round: { increment: 1 } },
          });
        }

        if (entry.battle.seasonId)
          await matchSeasonRounds(tx, entry.battle.seasonId);
        await tx.notification.create({
          data: {
            payload: { battleId, photoId: entry.photoId },
            type: "battle_withdrawn",
            userId: user.id,
          },
        });
      },
      { timeout: 15000 },
    );

    return { battleId, ok: true };
  }

  private async applyBattleRating(
    tx: PrismaTx,
    battleId: string,
    winnerEntry: BattleRecord["entries"][number],
    loserEntry: BattleRecord["entries"][number],
  ): Promise<
    {
      readonly delta: number;
      readonly displayName: string;
      readonly ratingAfter: number;
      readonly ratingBefore: number;
      readonly userId: string;
    }[]
  > {
    const [winnerRating, loserRating] = await Promise.all([
      getOrCreateGlobalRating(tx, winnerEntry.userId),
      getOrCreateGlobalRating(tx, loserEntry.userId),
    ]);
    const change = this.ratingEngine.calculateBattleWin({
      loserRating: loserRating.rating,
      winnerRating: winnerRating.rating,
    });

    await Promise.all([
      tx.rating.update({
        data: {
          battles: {
            increment: 1,
          },
          rating: change.winnerRating,
          wins: {
            increment: 1,
          },
        },
        where: {
          id: winnerRating.id,
        },
      }),
      tx.rating.update({
        data: {
          battles: {
            increment: 1,
          },
          losses: {
            increment: 1,
          },
          rating: change.loserRating,
        },
        where: {
          id: loserRating.id,
        },
      }),
      tx.ratingEvent.createMany({
        data: [
          {
            algorithm: "elo_v1",
            battleId,
            delta: change.winnerDelta,
            photoId: winnerEntry.photo.id,
            ratingAfter: change.winnerRating,
            ratingBefore: winnerRating.rating,
            reason: "battle_win",
            scope: "GLOBAL",
            scopeKey: "global",
            userId: winnerEntry.userId,
          },
          {
            algorithm: "elo_v1",
            battleId,
            delta: change.loserDelta,
            photoId: loserEntry.photo.id,
            ratingAfter: change.loserRating,
            ratingBefore: loserRating.rating,
            reason: "battle_loss",
            scope: "GLOBAL",
            scopeKey: "global",
            userId: loserEntry.userId,
          },
        ],
      }),
      tx.battleEntry.update({
        data: {
          ratingAfter: change.winnerRating,
          ratingBefore: winnerRating.rating,
        },
        where: {
          id: winnerEntry.id,
        },
      }),
      tx.battleEntry.update({
        data: {
          ratingAfter: change.loserRating,
          ratingBefore: loserRating.rating,
        },
        where: {
          id: loserEntry.id,
        },
      }),
    ]);

    return [
      {
        delta: change.winnerDelta,
        displayName:
          winnerEntry.photo.owner.profile?.displayName ?? "Photographer",
        ratingAfter: change.winnerRating,
        ratingBefore: winnerRating.rating,
        userId: winnerEntry.userId,
      },
      {
        delta: change.loserDelta,
        displayName:
          loserEntry.photo.owner.profile?.displayName ?? "Photographer",
        ratingAfter: change.loserRating,
        ratingBefore: loserRating.rating,
        userId: loserEntry.userId,
      },
    ];
  }

  private async unlockBattleAchievements(
    tx: PrismaTx,
    winnerId: string,
    loserId: string,
  ): Promise<void> {
    const [firstBattle, firstWin] = await Promise.all([
      tx.achievement.upsert({
        create: {
          descriptionKey: "achievement.first_battle.description",
          key: "first_battle",
          nameKey: "achievement.first_battle.name",
        },
        update: {},
        where: {
          key: "first_battle",
        },
      }),
      tx.achievement.upsert({
        create: {
          descriptionKey: "achievement.first_win.description",
          key: "first_win",
          nameKey: "achievement.first_win.name",
        },
        update: {},
        where: {
          key: "first_win",
        },
      }),
    ]);

    await Promise.all([
      tx.userAchievement.upsert({
        create: {
          achievementId: firstBattle.id,
          userId: winnerId,
        },
        update: {},
        where: {
          userId_achievementId: {
            achievementId: firstBattle.id,
            userId: winnerId,
          },
        },
      }),
      tx.userAchievement.upsert({
        create: {
          achievementId: firstBattle.id,
          userId: loserId,
        },
        update: {},
        where: {
          userId_achievementId: {
            achievementId: firstBattle.id,
            userId: loserId,
          },
        },
      }),
      tx.userAchievement.upsert({
        create: {
          achievementId: firstWin.id,
          userId: winnerId,
        },
        update: {},
        where: {
          userId_achievementId: {
            achievementId: firstWin.id,
            userId: winnerId,
          },
        },
      }),
    ]);
  }

  private toBattleResponse(battle: BattleRecord, viewerId?: string) {
    const viewerVote = viewerId
      ? battle.votes.find((vote) => vote.voterId === viewerId)
      : undefined;

    return {
      category: battle.category
        ? {
            nameKey: battle.category.nameKey,
            slug: battle.category.slug,
          }
        : null,
      endsAt: dateToIso(battle.endsAt),
      entries: battle.entries
        .filter(
          (entry) =>
            entry.moderationStatus === "APPROVED" || entry.userId === viewerId,
        )
        .map((entry) => {
          const displayAsset =
            entry.photo.assets.find((asset) => asset.type === "DISPLAY") ??
            entry.photo.assets.find((asset) => asset.type === "THUMBNAIL");
          return {
            id: entry.id,
            moderationStatus: entry.moderationStatus,
            locationLabel:
              entry.photo.location?.visibility === "HIDDEN"
                ? null
                : (entry.photo.location?.publicLabel ?? null),
            owner: {
              displayName:
                entry.photo.owner.profile?.displayName ?? "Photographer",
              id: entry.photo.owner.id,
              rating: entry.photo.owner.ratings[0]?.rating ?? 1500,
              username: entry.photo.owner.profile?.username ?? "photographer",
            },
            photo: {
              displayUrl: displayAsset
                ? publicAssetUrl(this.env, displayAsset.storageKey)
                : null,
              id: entry.photo.id,
              moderationStatus: entry.photo.moderationStatus,
              provenanceStatus: entry.photo.provenance?.status ?? null,
              title: entry.photo.title,
            },
            slot: entry.slot,
            round: entry.round ?? 1,
            votes: battle.votes.filter(
              (vote) => vote.selectedEntryId === entry.id,
            ).length,
          };
        }),
      id: battle.id,
      season: battle.season
        ? {
            name: battle.season.name,
            nameKey: battle.season.nameKey,
            slug: battle.season.slug,
          }
        : null,
      startsAt: dateToIso(battle.startsAt),
      status: battle.status,
      viewerParticipates: Boolean(
        viewerId && battle.entries.some((entry) => entry.userId === viewerId),
      ),
      viewerVote: viewerVote
        ? {
            selectedEntryId: viewerVote.selectedEntryId,
            submittedAt: viewerVote.createdAt.toISOString(),
          }
        : null,
      votesCount: battle.votes.length,
    };
  }
}

function getHeader(request: CookieRequest, name: string): string | undefined {
  const value = request.headers[name];
  return Array.isArray(value) ? value[0] : value;
}

function getClientIp(request: CookieRequest): string {
  const forwarded = getHeader(request, "x-forwarded-for");
  return forwarded?.split(",")[0]?.trim() || request.ip || "unknown";
}

function hashSignal(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

async function getOrCreateGlobalRating(tx: PrismaTx, userId: string) {
  return tx.rating.upsert({
    create: {
      rating: 1500,
      scope: "GLOBAL",
      scopeKey: "global",
      userId,
    },
    update: {},
    where: {
      userId_scope_scopeKey: {
        scope: "GLOBAL",
        scopeKey: "global",
        userId,
      },
    },
  });
}
