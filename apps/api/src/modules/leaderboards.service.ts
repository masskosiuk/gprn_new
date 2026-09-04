import { prisma } from "@gprn/db";
import { Injectable } from "@nestjs/common";

@Injectable()
export class LeaderboardsService {
  async global(): Promise<{
    entries: readonly {
      readonly battles: number;
      readonly displayName: string;
      readonly losses: number;
      readonly rank: number;
      readonly rating: number;
      readonly username: string;
      readonly wins: number;
    }[];
  }> {
    const ratings = await prisma.rating.findMany({
      include: {
        user: {
          include: {
            profile: true
          }
        }
      },
      orderBy: [
        {
          rating: "desc"
        },
        {
          wins: "desc"
        }
      ],
      take: 100,
      where: {
        scope: "GLOBAL",
        scopeKey: "global",
        user: {
          status: "ACTIVE"
        }
      }
    });

    return {
      entries: ratings.map((rating, index) => ({
        battles: rating.battles,
        displayName: rating.user.profile?.displayName ?? "Photographer",
        losses: rating.losses,
        rank: index + 1,
        rating: rating.rating,
        username: rating.user.profile?.username ?? "photographer",
        wins: rating.wins
      }))
    };
  }
}

