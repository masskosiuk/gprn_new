import type { Prisma } from "@gprn/db";
import { BadRequestException } from "@nestjs/common";
import { requireUuid } from "./community-policy.js";
import { mediaCatalogFilter } from "./media-catalog.js";

export const feedPageSize = 48;
type FeedAnchor = {
  id: string;
  feedPosition: number | null;
  publishedAt: Date | null;
};
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
export function encodeFeedCursor(photo: FeedAnchor) {
  return Buffer.from(
    JSON.stringify({
      id: photo.id,
      position: photo.feedPosition,
      date: photo.publishedAt?.toISOString() ?? null,
    }),
  ).toString("base64url");
}
export function afterFeedCursor(cursor: string): Prisma.PhotoWhereInput {
  if (!/^[\w-]{1,300}$/.test(cursor)) throw invalid();
  let input: { id: string; position: number | null; date: string | null };
  try {
    input = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
  } catch {
    throw invalid();
  }
  if (
    !input ||
    typeof input.id !== "string" ||
    (input.position !== null &&
      (!Number.isInteger(input.position) ||
        input.position < 0 ||
        input.position > 2147483647)) ||
    (input.date !== null && typeof input.date !== "string")
  )
    throw invalid();
  requireUuid(input.id);
  // PostgreSQL's descending date order puts null dates first, matching feedPhotoOrder.
  const followingDate: Prisma.PhotoWhereInput =
    input.date === null
      ? {
          OR: [
            { publishedAt: { not: null } },
            { publishedAt: null, id: { gt: input.id } },
          ],
        }
      : {
          OR: [
            { publishedAt: { lt: date(input.date) } },
            { publishedAt: date(input.date), id: { gt: input.id } },
          ],
        };
  return input.position === null
    ? { feedPosition: null, ...followingDate }
    : {
        OR: [
          { feedPosition: { gt: input.position } },
          { feedPosition: null },
          { feedPosition: input.position, ...followingDate },
        ],
      };
}
export function discoverQuery(
  mediaType: string | undefined,
  query: Record<string, unknown>,
) {
  const media = mediaCatalogFilter(mediaType);
  const cursor = text(query, "cursor", 300);
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
    cursor,
    pageWhere: cursor ? { AND: [where, afterFeedCursor(cursor)] } : where,
  };
}
