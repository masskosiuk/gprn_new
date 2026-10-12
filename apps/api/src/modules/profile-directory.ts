import type { RuntimeEnv } from "@gprn/config";
import { prisma, type Prisma } from "@gprn/db";
import { BadRequestException } from "@nestjs/common";
import { formatStoredCityLabel } from "./locations.service.js";
import { publicAssetUrl } from "./serialization.js";

export const publicCreatorWhere = {
  deletedAt: null,
  visibility: "PUBLIC",
  tier: { not: "VIEWER" },
  user: { status: "ACTIVE", deletedAt: null },
} satisfies Prisma.ProfileWhereInput;
const publicWorkWhere = {
  deletedAt: null,
  status: "PUBLISHED",
  moderationStatus: "APPROVED",
  visibility: "PUBLIC",
} satisfies Prisma.PhotoWhereInput;

export function directoryQuery(query: Record<string, unknown>) {
  const value = (key: string) => {
    const item = query[key];
    if (item !== undefined && typeof item !== "string")
      throw new BadRequestException({ code: "INVALID_FIELD", field: key });
    return (item as string | undefined)?.trim().slice(0, 120) ?? "";
  };
  const search = value("search"),
    category = value("category"),
    country = value("country"),
    city = value("city");
  const rating = value("minRating"),
    page = Number(value("page") || "1");
  if (
    !Number.isSafeInteger(page) ||
    page < 1 ||
    page > 10000 ||
    (city &&
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        city,
      )) ||
    (rating && !["4", "4.5", "4.8"].includes(rating))
  )
    throw new BadRequestException({ code: "INVALID_FILTER" });
  const filters: Prisma.ProfileWhereInput[] = [publicCreatorWhere];
  if (search)
    filters.push({
      OR: [
        { displayName: { contains: search, mode: "insensitive" } },
        { username: { contains: search, mode: "insensitive" } },
        { bio: { contains: search, mode: "insensitive" } },
        {
          user: {
            expertProfile: {
              status: "ACTIVE",
              headline: { contains: search, mode: "insensitive" },
            },
          },
        },
      ],
    });
  if (country) filters.push({ country: { slug: country } });
  if (city) filters.push({ city: { id: city } });
  if (category)
    filters.push({
      user: {
        photos: {
          some: {
            ...publicWorkWhere,
            category: { slug: category },
          },
        },
      },
    });
  if (rating)
    filters.push({
      OR: [
        {
          AND: [
            { serviceRatingAverage: { gte: Number(rating) } },
            {
              OR: [
                { user: { expertProfile: null } },
                { user: { expertProfile: { status: { not: "ACTIVE" } } } },
                { user: { expertProfile: { ratingAverage: null } } },
              ],
            },
          ],
        },
        {
          user: {
            expertProfile: {
              status: "ACTIVE",
              ratingAverage: { gte: Number(rating) },
            },
          },
        },
      ],
    });
  return {
    where: { AND: filters } satisfies Prisma.ProfileWhereInput,
    page,
    take: 24,
  };
}

export async function listPublicCreators(
  env: RuntimeEnv,
  query: Record<string, unknown>,
) {
  const { where, page, take } = directoryQuery(query);
  const [profiles, total, countries, cities, categories] = await Promise.all([
    prisma.profile.findMany({
      where,
      take,
      skip: (page - 1) * take,
      orderBy: [{ displayName: "asc" }, { id: "asc" }],
      select: {
        userId: true,
        username: true,
        displayName: true,
        bio: true,
        avatarAssetKey: true,
        coverAssetKey: true,
        tier: true,
        serviceRatingAverage: true,
        serviceRatingsCount: true,
        city: { select: { id: true, slug: true, nameKey: true } },
        country: { select: { slug: true, nameKey: true } },
        user: {
          select: {
            expertProfile: {
              select: {
                status: true,
                headline: true,
                languages: true,
                ratingAverage: true,
                reviewsCompleted: true,
              },
            },
            ratings: {
              where: { scope: "GLOBAL", scopeKey: "global" },
              select: { rating: true },
              take: 1,
            },
            photos: {
              where: publicWorkWhere,
              distinct: ["categoryId"],
              take: 16,
              select: { category: { select: { slug: true, nameKey: true } } },
            },
          },
        },
      },
    }),
    prisma.profile.count({ where }),
    prisma.country.findMany({
      where: { profiles: { some: publicCreatorWhere } },
      select: { slug: true, nameKey: true },
      orderBy: { nameKey: "asc" },
      take: 250,
    }),
    prisma.city.findMany({
      where: { profiles: { some: publicCreatorWhere } },
      select: { id: true, nameKey: true, country: { select: { slug: true } } },
      orderBy: [{ nameKey: "asc" }, { id: "asc" }],
      take: 1000,
    }),
    prisma.category.findMany({
      where: {
        isActive: true,
        photos: {
          some: {
            ...publicWorkWhere,
            owner: { profile: publicCreatorWhere },
          },
        },
      },
      select: { slug: true, nameKey: true },
      orderBy: { sortOrder: "asc" },
      take: 100,
    }),
  ]);
  return {
    total,
    page,
    pageSize: take,
    countries,
    cities,
    categories,
    entries: profiles.map((profile) => {
      const expert =
        profile.user.expertProfile?.status === "ACTIVE"
          ? profile.user.expertProfile
          : null;
      return {
        id: profile.userId,
        username: profile.username,
        displayName: profile.displayName,
        headline: expert?.headline ?? profile.bio,
        avatarUrl: profile.avatarAssetKey
          ? publicAssetUrl(env, profile.avatarAssetKey)
          : null,
        coverUrl: profile.coverAssetKey
          ? publicAssetUrl(env, profile.coverAssetKey)
          : null,
        tier: profile.tier,
        isVerifiedExpert: !!expert,
        city: profile.city
          ? {
              ...profile.city,
              label: formatStoredCityLabel(
                profile.city.nameKey,
                profile.city.slug,
                profile.country?.nameKey,
              ),
            }
          : null,
        country: profile.country,
        languages: expert?.languages ?? [],
        rating:
          expert?.ratingAverage?.toString() ??
          profile.serviceRatingAverage?.toString() ??
          null,
        reviews: expert?.reviewsCompleted ?? profile.serviceRatingsCount,
        reputation: profile.user.ratings[0]?.rating ?? null,
        categories: profile.user.photos.flatMap((photo) =>
          photo.category ? [photo.category] : [],
        ),
      };
    }),
  };
}
