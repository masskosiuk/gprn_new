import { prisma } from "@gprn/db";
import { Injectable } from "@nestjs/common";

import { dateToIso } from "./serialization.js";

@Injectable()
export class CatalogService {
  async listCategories(): Promise<{
    categories: readonly {
      readonly descriptionKey: string | null;
      readonly nameKey: string;
      readonly slug: string;
    }[];
  }> {
    const categories = await prisma.category.findMany({
      orderBy: [
        {
          sortOrder: "asc"
        },
        {
          slug: "asc"
        }
      ],
      where: {
        isActive: true
      }
    });

    return {
      categories: categories.map((category) => ({
        descriptionKey: category.descriptionKey,
        nameKey: category.nameKey,
        slug: category.slug
      }))
    };
  }

  async getCurrentSeason(): Promise<{
    season: {
      readonly descriptionKey: string | null;
      readonly endsAt: string | null;
      readonly nameKey: string;
      readonly slug: string;
      readonly startsAt: string | null;
      readonly status: string;
    } | null;
  }> {
    const season = await prisma.season.findFirst({
      orderBy: {
        startsAt: "asc"
      },
      where: {
        status: "ACTIVE"
      }
    });

    return {
      season: season
        ? {
            descriptionKey: season.descriptionKey,
            endsAt: dateToIso(season.endsAt),
            nameKey: season.nameKey,
            slug: season.slug,
            startsAt: dateToIso(season.startsAt),
            status: season.status
          }
        : null
    };
  }
}

