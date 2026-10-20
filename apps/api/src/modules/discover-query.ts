import type { Prisma } from "@gprn/db";
import { DEFAULT_FEED_SORT, FEED_SORTS, type FeedSort } from "@gprn/domain";
import { BadRequestException } from "@nestjs/common";
import { requireUuid } from "./community-policy.js";
import { mediaCatalogFilter } from "./media-catalog.js";

export const feedPageSize = 48;
type FeedAnchor = {
  id: string;
  publishedAt: Date | null;
  reviewScore?: { toString(): string } | string | null;
};
export interface FeedCursor {
  id: string;
  date: string | null;
  sort: FeedSort;
  score: string | null;
}
export const newestPhotoOrder = [
  { publishedAt: { sort: "desc", nulls: "last" } },
  { id: "asc" },
] satisfies Prisma.PhotoOrderByWithRelationInput[];
export const bestPhotoOrder = [
  { reviewScore: { sort: "desc", nulls: "last" } },
  ...newestPhotoOrder,
] satisfies Prisma.PhotoOrderByWithRelationInput[];
const invalid = () => new BadRequestException({ code: "INVALID_FEED_QUERY" });
function text(query: Record<string, unknown>, key: string, max = 160) {
  const value = query[key];
  if (value === undefined) return "";
  if (typeof value !== "string" || value.length > max) throw invalid();
  return value.trim();
}
function date(value: string) {
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString() !== value)
    throw invalid();
  return parsed;
}
export function encodeFeedCursor(
  photo: FeedAnchor,
  sort: FeedSort = DEFAULT_FEED_SORT,
) {
  return Buffer.from(
    JSON.stringify({
      id: photo.id,
      sort,
      score: sort === "best" ? (photo.reviewScore?.toString() ?? null) : null,
      date: photo.publishedAt?.toISOString() ?? null,
    }),
  ).toString("base64url");
}
export function decodeFeedCursor(cursor: string, sort: FeedSort): FeedCursor {
  if (!/^[\w-]{1,300}$/.test(cursor)) throw invalid();
  let input: FeedCursor;
  try {
    input = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
  } catch {
    throw invalid();
  }
  if (
    !input ||
    typeof input.id !== "string" ||
    input.sort !== sort ||
    (input.score !== null &&
      (typeof input.score !== "string" ||
        !/^(?:[1-9](?:\.\d{1,6})?|10(?:\.0{1,6})?)$/.test(input.score))) ||
    (sort === "newest" && input.score !== null) ||
    (input.date !== null && typeof input.date !== "string")
  )
    throw invalid();
  requireUuid(input.id);
  if (input.date !== null) date(input.date);
  return input;
}
function afterFeedDate(input: FeedCursor): Prisma.PhotoWhereInput {
  return input.date === null
    ? { publishedAt: null, id: { gt: input.id } }
    : {
        OR: [
          { publishedAt: { lt: date(input.date) } },
          { publishedAt: null },
          { publishedAt: date(input.date), id: { gt: input.id } },
        ],
      };
}
export function afterFeedCursor(
  cursor: string,
  sort: FeedSort = DEFAULT_FEED_SORT,
): Prisma.PhotoWhereInput {
  const input = decodeFeedCursor(cursor, sort);
  const followingDate = afterFeedDate(input);
  if (sort === "newest") return followingDate;
  return input.score === null
    ? { reviewScore: null, ...followingDate }
    : {
        OR: [
          { reviewScore: { lt: input.score } },
          { reviewScore: null },
          { reviewScore: input.score, ...followingDate },
        ],
      };
}
export function discoverQuery(
  mediaType: string | undefined,
  query: Record<string, unknown>,
) {
  const media = mediaCatalogFilter(mediaType);
  const sortValue = text(query, "sort", 16) || DEFAULT_FEED_SORT;
  if (!FEED_SORTS.includes(sortValue as FeedSort)) throw invalid();
  const sort = sortValue as FeedSort;
  const cursor = text(query, "cursor", 300);
  const anchor = cursor ? decodeFeedCursor(cursor, sort) : null;
  const category = text(query, "category", 64);
  const location = text(query, "location", 100);
  const search = text(query, "search");
  const from = text(query, "from", 32);
  const to = text(query, "to", 32);
  const saleOnly = text(query, "saleOnly", 5);
  const cities = text(query, "searchCities", 500).split(",").filter(Boolean);
  if (saleOnly && saleOnly !== "true" && saleOnly !== "false") throw invalid();
  if (from && to && date(from) > date(to)) throw invalid();
  if (
    cities.length > 24 ||
    cities.some((city) => !/^[a-z0-9-]{1,100}$/.test(city))
  )
    throw invalid();
  const contains = (value: string) => ({
    contains: value,
    mode: "insensitive" as const,
  });
  const where: Prisma.PhotoWhereInput = {
    deletedAt: null,
    moderationStatus: "APPROVED",
    status: "PUBLISHED",
    visibility: "PUBLIC",
    owner: {
      status: "ACTIVE",
      profile: { visibility: "PUBLIC", deletedAt: null },
    },
    AND: [media, { NOT: { title: { startsWith: "__profile_" } } }],
    ...(category ? { category: { slug: category } } : {}),
    ...(location
      ? {
          location: { visibility: { not: "HIDDEN" }, city: { slug: location } },
        }
      : {}),
    ...(from || to
      ? {
          publishedAt: {
            ...(from ? { gte: date(from) } : {}),
            ...(to ? { lte: date(to) } : {}),
          },
        }
      : {}),
    ...(saleOnly === "true"
      ? {
          marketplaceProduct: {
            digitalKind: null,
            status: "PUBLISHED",
            filesJson: { path: ["licenseTerms"], string_contains: "" },
            seller: {
              status: "ACTIVE",
              user: {
                status: "ACTIVE",
                profile: { visibility: "PUBLIC", deletedAt: null },
              },
            },
          },
        }
      : {}),
    ...(search
      ? {
          OR: [
            { title: contains(search) },
            {
              owner: {
                profile: {
                  OR: [
                    { displayName: contains(search) },
                    { username: contains(search) },
                  ],
                },
              },
            },
            {
              location: {
                visibility: { not: "HIDDEN" },
                OR: [
                  { publicLabel: contains(search) },
                  {
                    city: {
                      OR: [
                        { nameKey: contains(search) },
                        { slug: contains(search) },
                        ...(cities.length ? [{ slug: { in: cities } }] : []),
                      ],
                    },
                  },
                ],
              },
            },
          ],
        }
      : {}),
  };
  return {
    where,
    sort,
    cursor,
    anchor,
    orderBy: sort === "best" ? bestPhotoOrder : newestPhotoOrder,
    pageWhere: anchor ? { AND: [where, afterFeedCursor(cursor, sort)] } : where,
  };
}
