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
  NotFoundException
} from "@nestjs/common";

import type { CurrentUser } from "./auth.service.js";
import type { CookieRequest } from "./http.types.js";
import { dateToIso, isPrismaErrorCode, publicAssetUrl } from "./serialization.js";
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
                  scopeKey: "global"
                }
              }
            }
          },
          provenance: true
        }
      }
    },
    orderBy: {
      slot: "asc"
    }
  },
  season: true,
  votes: true
} as const;

interface BattleRecord {
  readonly id: string;
  readonly status: string;
  readonly startsAt: Date | null;
  readonly endsAt: Date | null;
  readonly category: {
    readonly slug: string;
    readonly nameKey: string;
  } | null;
  readonly season: {
    readonly slug: string;
    readonly nameKey: string;
  } | null;
  readonly entries: readonly {
    readonly id: string;
    readonly slot: string;
    readonly userId: string;
    readonly photo: {
      readonly id: string;
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
    readonly selectedEntryId: string;
    readonly weightMinor: number;
  }[];
}

@Injectable()
export class BattlesService {
  private readonly env = loadRuntimeEnv();
  private readonly ratingEngine = new EloRatingEngine();

  async listOpen(): Promise<{ battles: ReturnType<BattlesService["toBattleResponse"]>[] }> {
    const battles = await prisma.battle.findMany({
      include: battleInclude,
      orderBy: {
        createdAt: "desc"
      },
      take: 20,
      where: {
        status: "OPEN"
      }
    });

    return {
      battles: battles.map((battle) => this.toBattleResponse(battle))
    };
  }

  async join(user: CurrentUser, body: unknown): Promise<{ battle: ReturnType<BattlesService["toBattleResponse"]> }> {
    const photoId = requiredString(asRecord(body), "photoId");

    const battleId = await prisma.$transaction(async (tx) => {
      const photo = await tx.photo.findFirst({
        select: { categoryId: true, id: true },
        where: {
          id: photoId,
          moderationStatus: "APPROVED",
          ownerId: user.id,
          status: "PUBLISHED",
          visibility: "PUBLIC"
        }
      });

      if (!photo) {
        throw new ConflictException({
          code: "BATTLE_PHOTO_NOT_ELIGIBLE",
          message: "Choose one of your approved public photos."
        });
      }

      const opponent = await tx.photo.findFirst({
        orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
        select: { id: true, ownerId: true },
        where: {
          categoryId: photo.categoryId,
          id: { not: photo.id },
          moderationStatus: "APPROVED",
          ownerId: { not: user.id },
          status: "PUBLISHED",
          visibility: "PUBLIC"
        }
      });

      if (!opponent) {
        throw new ConflictException({
          code: "BATTLE_OPPONENT_UNAVAILABLE",
          message: "No eligible opponent is available in this category yet."
        });
      }

      const season = await tx.season.findFirst({ select: { id: true }, where: { status: "ACTIVE" } });
      const battle = await tx.battle.create({
        data: {
          categoryId: photo.categoryId,
          endsAt: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
          entries: {
            create: [
              { photoId: photo.id, slot: "A", userId: user.id },
              { photoId: opponent.id, slot: "B", userId: opponent.ownerId }
            ]
          },
          seasonId: season?.id,
          startsAt: new Date(),
          status: "OPEN"
        }
      });

      await tx.analyticsEvent.create({
        data: { eventName: "battle_joined", payload: { battleId: battle.id, photoId }, userId: user.id }
      });
      await tx.notification.create({
        data: { payload: { battleId: battle.id, photoId }, type: "battle_joined", userId: user.id }
      });

      return battle.id;
    });

    const battle = await prisma.battle.findUniqueOrThrow({ include: battleInclude, where: { id: battleId } });
    return { battle: this.toBattleResponse(battle) };
  }

  async vote(
    user: CurrentUser,
    battleId: string,
    body: unknown,
    request: CookieRequest
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
      const result = await prisma.$transaction(async (tx) => {
        const battle = await tx.battle.findUnique({
          include: battleInclude,
          where: {
            id: battleId
          }
        });

        if (!battle) {
          throw new NotFoundException({
            code: "BATTLE_NOT_FOUND",
            message: "Battle does not exist."
          });
        }

        if (battle.status !== "OPEN") {
          throw new ConflictException({
            code: "BATTLE_CLOSED",
            message: "This battle is already closed."
          });
        }

        const selectedEntry = battle.entries.find((entry) => entry.id === selectedEntryId);
        const losingEntry = battle.entries.find((entry) => entry.id !== selectedEntryId);

        if (!selectedEntry || !losingEntry) {
          throw new NotFoundException({
            code: "BATTLE_ENTRY_NOT_FOUND",
            message: "Selected photo is not part of this battle."
          });
        }

        if (battle.entries.some((entry) => entry.userId === user.id)) {
          throw new ForbiddenException({
            code: "BATTLE_SELF_VOTE_BLOCKED",
            message: "You cannot vote in your own battle."
          });
        }

        const recentVoteCount = await tx.battleVote.count({
          where: { createdAt: { gte: new Date(Date.now() - 60 * 60 * 1000) }, voterId: user.id }
        });
        if (recentVoteCount >= 60) {
          throw new HttpException(
            { code: "BATTLE_RATE_LIMITED", message: "Voting is temporarily limited for this account." },
            HttpStatus.TOO_MANY_REQUESTS
          );
        }

        const weightMinor = user.roles.includes("EXPERT_JUDGE") ? 150 : 100;
        const ipHash = hashSignal(getClientIp(request));
        const deviceHash = hashSignal(getHeader(request, "x-device-id") ?? getHeader(request, "user-agent") ?? "unknown");

        await tx.battleVote.create({
          data: {
            battleId: battle.id,
            deviceHash,
            ipHash,
            selectedEntryId: selectedEntry.id,
            selectedPhotoId: selectedEntry.photo.id,
            suspiciousFlag: recentVoteCount >= 20,
            voterId: user.id,
            weightMinor
          }
        });

        const votes = [...battle.votes, { selectedEntryId: selectedEntry.id, weightMinor }];
        const totals = battle.entries.map((entry) => ({
          entry,
          weight: votes
            .filter((vote) => vote.selectedEntryId === entry.id)
            .reduce((sum, vote) => sum + vote.weightMinor, 0)
        }));
        totals.sort((left, right) => right.weight - left.weight);

        let ratingEvents: Awaited<ReturnType<BattlesService["applyBattleRating"]>> = [];
        if (votes.length >= 5 && totals[0] && totals[1] && totals[0].weight > totals[1].weight) {
          ratingEvents = await this.applyBattleRating(tx, battle.id, totals[0].entry, totals[1].entry);
          await tx.battle.update({
            data: { endsAt: new Date(), status: "CLOSED", winnerPhotoId: totals[0].entry.photo.id },
            where: { id: battle.id }
          });
          await tx.notification.createMany({
            data: battle.entries.map((entry) => ({
              payload: { battleId: battle.id, winnerPhotoId: totals[0]?.entry.photo.id },
              type: "battle_completed",
              userId: entry.userId
            }))
          });
          await this.unlockBattleAchievements(tx, totals[0].entry.userId, totals[1].entry.userId);
        }

        await tx.analyticsEvent.create({
          data: {
            eventName: "battle_vote_cast",
            payload: {
              battleId: battle.id,
              selectedPhotoId: selectedEntry.photo.id
            },
            userId: user.id
          }
        });

        return {
          ratingEvents
        };
      });

      const battle = await prisma.battle.findUniqueOrThrow({
        include: battleInclude,
        where: {
          id: battleId
        }
      });

      return {
        battle: this.toBattleResponse(battle),
        ratingEvents: result.ratingEvents
      };
    } catch (error) {
      if (isPrismaErrorCode(error, "P2002")) {
        throw new ConflictException({
          code: "BATTLE_DUPLICATE_VOTE",
          message: "You have already voted in this battle."
        });
      }

      throw error;
    }
  }

  private async applyBattleRating(
    tx: PrismaTx,
    battleId: string,
    winnerEntry: BattleRecord["entries"][number],
    loserEntry: BattleRecord["entries"][number]
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
      getOrCreateGlobalRating(tx, loserEntry.userId)
    ]);
    const change = this.ratingEngine.calculateBattleWin({
      loserRating: loserRating.rating,
      winnerRating: winnerRating.rating
    });

    await Promise.all([
      tx.rating.update({
        data: {
          battles: {
            increment: 1
          },
          rating: change.winnerRating,
          wins: {
            increment: 1
          }
        },
        where: {
          id: winnerRating.id
        }
      }),
      tx.rating.update({
        data: {
          battles: {
            increment: 1
          },
          losses: {
            increment: 1
          },
          rating: change.loserRating
        },
        where: {
          id: loserRating.id
        }
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
            userId: winnerEntry.userId
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
            userId: loserEntry.userId
          }
        ]
      }),
      tx.battleEntry.update({
        data: {
          ratingAfter: change.winnerRating,
          ratingBefore: winnerRating.rating
        },
        where: {
          id: winnerEntry.id
        }
      }),
      tx.battleEntry.update({
        data: {
          ratingAfter: change.loserRating,
          ratingBefore: loserRating.rating
        },
        where: {
          id: loserEntry.id
        }
      })
    ]);

    return [
      {
        delta: change.winnerDelta,
        displayName: winnerEntry.photo.owner.profile?.displayName ?? "Photographer",
        ratingAfter: change.winnerRating,
        ratingBefore: winnerRating.rating,
        userId: winnerEntry.userId
      },
      {
        delta: change.loserDelta,
        displayName: loserEntry.photo.owner.profile?.displayName ?? "Photographer",
        ratingAfter: change.loserRating,
        ratingBefore: loserRating.rating,
        userId: loserEntry.userId
      }
    ];
  }

  private async unlockBattleAchievements(tx: PrismaTx, winnerId: string, loserId: string): Promise<void> {
    const [firstBattle, firstWin] = await Promise.all([
      tx.achievement.upsert({
        create: {
          descriptionKey: "achievement.first_battle.description",
          key: "first_battle",
          nameKey: "achievement.first_battle.name"
        },
        update: {},
        where: {
          key: "first_battle"
        }
      }),
      tx.achievement.upsert({
        create: {
          descriptionKey: "achievement.first_win.description",
          key: "first_win",
          nameKey: "achievement.first_win.name"
        },
        update: {},
        where: {
          key: "first_win"
        }
      })
    ]);

    await Promise.all([
      tx.userAchievement.upsert({
        create: {
          achievementId: firstBattle.id,
          userId: winnerId
        },
        update: {},
        where: {
          userId_achievementId: {
            achievementId: firstBattle.id,
            userId: winnerId
          }
        }
      }),
      tx.userAchievement.upsert({
        create: {
          achievementId: firstBattle.id,
          userId: loserId
        },
        update: {},
        where: {
          userId_achievementId: {
            achievementId: firstBattle.id,
            userId: loserId
          }
        }
      }),
      tx.userAchievement.upsert({
        create: {
          achievementId: firstWin.id,
          userId: winnerId
        },
        update: {},
        where: {
          userId_achievementId: {
            achievementId: firstWin.id,
            userId: winnerId
          }
        }
      })
    ]);
  }

  private toBattleResponse(battle: BattleRecord) {
    return {
      category: battle.category
        ? {
            nameKey: battle.category.nameKey,
            slug: battle.category.slug
          }
        : null,
      endsAt: dateToIso(battle.endsAt),
      entries: battle.entries.map((entry) => {
        const displayAsset =
          entry.photo.assets.find((asset) => asset.type === "DISPLAY") ??
          entry.photo.assets.find((asset) => asset.type === "THUMBNAIL");

        return {
          id: entry.id,
          locationLabel:
            entry.photo.location?.visibility === "HIDDEN"
              ? null
              : entry.photo.location?.publicLabel ?? null,
          owner: {
            displayName: entry.photo.owner.profile?.displayName ?? "Photographer",
            rating: entry.photo.owner.ratings[0]?.rating ?? 1500,
            username: entry.photo.owner.profile?.username ?? "photographer"
          },
          photo: {
            displayUrl: displayAsset ? publicAssetUrl(this.env, displayAsset.storageKey) : null,
            id: entry.photo.id,
            provenanceStatus: entry.photo.provenance?.status ?? null,
            title: entry.photo.title
          },
          slot: entry.slot
        };
      }),
      id: battle.id,
      season: battle.season
        ? {
            nameKey: battle.season.nameKey,
            slug: battle.season.slug
          }
        : null,
      startsAt: dateToIso(battle.startsAt),
      status: battle.status,
      votesCount: battle.votes.length
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
      userId
    },
    update: {},
    where: {
      userId_scope_scopeKey: {
        scope: "GLOBAL",
        scopeKey: "global",
        userId
      }
    }
  });
}
