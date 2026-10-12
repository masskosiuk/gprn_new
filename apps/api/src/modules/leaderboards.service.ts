import { prisma } from "@gprn/db";
import { loadRuntimeEnv } from "@gprn/config";
import { Injectable } from "@nestjs/common";
import { publicAssetUrl } from "./serialization.js";

@Injectable()
export class LeaderboardsService {
  private readonly env = loadRuntimeEnv();
  async global(): Promise<{
    entries: readonly {
      readonly battles: number;
      readonly displayName: string;
      readonly losses: number;
      readonly rank: number;
      readonly rating: number;
      readonly username: string;
      readonly wins: number;
      readonly avatarUrl: string | null;
      readonly cityNameKey: string | null;
    }[];
  }> {
    const ratings = await prisma.rating.findMany({
      include: {
        user: {
          include: {
            profile: { include: { city: true } },
          },
        },
      },
      orderBy: [
        {
          rating: "desc",
        },
        {
          wins: "desc",
        },
        { id: "asc" },
      ],
      take: 10,
      where: {
        scope: "GLOBAL",
        scopeKey: "global",
        user: {
          status: "ACTIVE",
          deletedAt: null,
          profile: { visibility: "PUBLIC", deletedAt: null },
        },
      },
    });

    return {
      entries: ratings.map((rating, index) => ({
        battles: rating.battles,
        displayName: rating.user.profile?.displayName ?? "Photographer",
        losses: rating.losses,
        rank: index + 1,
        rating: rating.rating,
        username: rating.user.profile?.username ?? "photographer",
        wins: rating.wins,
        avatarUrl: rating.user.profile?.avatarAssetKey
          ? publicAssetUrl(this.env, rating.user.profile.avatarAssetKey)
          : null,
        cityNameKey: rating.user.profile?.city?.nameKey ?? null,
      })),
    };
  }
}
