import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { Prisma } from "@gprn/db";
import type { FeedSort } from "@gprn/domain";
import {
  afterFeedCursor,
  discoverQuery,
  encodeFeedCursor,
  feedPageSize,
  newestPhotoOrder,
  bestPhotoOrder,
} from "./discover-query.js";

const id = (n: number) =>
  `de000002-0000-4000-8000-${String(n).padStart(12, "0")}`;
type Work = {
  id: string;
  feedPosition: number | null;
  publishedAt: Date | null;
  reviewScore: string | null;
};
function matches(work: Work, where: any): boolean {
  return Object.entries(where).every(([key, value]: [string, any]) => {
    if (key === "OR") return value.some((part: any) => matches(work, part));
    if (key === "AND") return value.every((part: any) => matches(work, part));
    const actual = work[key as keyof Work];
    if (key === "reviewScore" && actual !== null && value !== null) {
      if (typeof value === "string") return Number(actual) === Number(value);
      if ("lt" in value) return Number(actual) < Number(value.lt);
    }
    if (value === null || value instanceof Date || typeof value !== "object")
      return Number.isNaN(Number(value))
        ? actual === value
        : Number(actual) === Number(value) &&
            (actual === null) === (value === null);
    if ("not" in value) return actual !== value.not;
    if ("gt" in value) return actual !== null && actual > value.gt;
    if ("lt" in value) return actual !== null && actual < value.lt;
    throw new Error("Unexpected cursor filter");
  });
}
function ordered(works: Work[], sort: FeedSort = "newest") {
  return [...works].sort(
    (a, b) =>
      (sort === "best"
        ? (b.reviewScore === null ? -1 : Number(b.reviewScore)) -
          (a.reviewScore === null ? -1 : Number(a.reviewScore))
        : 0) ||
      (b.publishedAt?.getTime() ?? -Infinity) -
        (a.publishedAt?.getTime() ?? -Infinity) ||
      a.id.localeCompare(b.id),
  );
}
const works = Array.from({ length: 145 }, (_, n): Work => ({
  id: id(n + 1),
  feedPosition: n < 7 ? Math.floor(n / 2) : null,
  publishedAt:
    n % 13 === 0 ? null : new Date(1760000000000 - Math.floor(n / 3) * 1000),
  reviewScore: n % 4 === 0 ? null : (((n % 21) + 49) / 7).toFixed(6),
}));

for (const sort of ["newest", "best"] as const) {
  test(`${sort} feed cursors follow scores, nulls and timestamp ties without offsets or manual positions`, () => {
    const sorted = ordered(works, sort);
    for (let n = 0; n < sorted.length; n++) {
      const following = afterFeedCursor(
        encodeFeedCursor(sorted[n]!, sort),
        sort,
      );
      assert.deepEqual(
        sorted
          .filter((work) => matches(work, following))
          .map((work) => work.id),
        sorted.slice(n + 1).map((work) => work.id),
      );
    }
  });
  test(`${sort} infinite pagination visits every work exactly once, including unrated photos`, () => {
    const sorted = ordered(works, sort);
    let remaining = sorted;
    const ids: string[] = [];
    while (remaining.length) {
      const page = remaining.slice(0, feedPageSize);
      ids.push(...page.map((work) => work.id));
      const cursor = encodeFeedCursor(page.at(-1)!, sort);
      remaining = sorted.filter((work) =>
        matches(work, afterFeedCursor(cursor, sort)),
      );
      assert(ids.length <= works.length);
    }
    assert.deepEqual(
      ids,
      sorted.map((work) => work.id),
    );
    assert.equal(new Set(ids).size, works.length);
  });
}

test("newest is the default and neither mode considers administrator positions or likes", () => {
  assert.equal(discoverQuery(undefined, {}).sort, "newest");
  assert.deepEqual(discoverQuery(undefined, {}).orderBy, newestPhotoOrder);
  assert.deepEqual(
    discoverQuery(undefined, { sort: "best" }).orderBy,
    bestPhotoOrder,
  );
  assert.doesNotMatch(JSON.stringify(bestPhotoOrder), /feedPosition|likes/);
  const score = new Prisma.Decimal("8.142857");
  const cursor = encodeFeedCursor(
    {
      id: id(1),
      publishedAt: new Date("2026-10-20T00:00:00.000Z"),
      reviewScore: score,
    },
    "best",
  );
  assert.equal(
    JSON.parse(Buffer.from(cursor, "base64url").toString()).score,
    "8.142857",
  );
});
test("older demo works remain reachable beyond uploads and a removed cursor anchor", () => {
  const sorted = ordered(works);
  const first = sorted.slice(0, feedPageSize);
  const where = afterFeedCursor(encodeFeedCursor(first.at(-1)!));
  const changed = ordered([
    ...sorted.filter((work) => work.id !== first.at(-1)!.id),
    {
      id: id(999),
      feedPosition: null,
      publishedAt: new Date("2030-01-01T00:00:00Z"),
      reviewScore: null,
    },
  ]);
  assert.deepEqual(
    changed.filter((work) => matches(work, where)).map((work) => work.id),
    sorted.slice(feedPageSize).map((work) => work.id),
  );
});
test("every page and its total enforce public moderation and exclude avatars and covers", () => {
  const query = discoverQuery("PHOTO", {
    cursor: encodeFeedCursor(works[0]!),
    category: "street",
    location: "kyiv",
    search: "Anna",
    saleOnly: "true",
    from: "2026-10-01T00:00:00.000Z",
    to: "2026-10-31T23:59:59.999Z",
  });
  assert.equal(query.where.moderationStatus, "APPROVED");
  assert.equal(query.where.visibility, "PUBLIC");
  assert.equal(query.where.deletedAt, null);
  assert.deepEqual(query.where.owner, {
    status: "ACTIVE",
    profile: { visibility: "PUBLIC", deletedAt: null },
  });
  assert.deepEqual((query.where.AND as any[])[1], {
    NOT: { title: { startsWith: "__profile_" } },
  });
  assert.deepEqual((query.pageWhere.AND as any[])[0], query.where);
  assert.deepEqual(query.where.category, { slug: "street" });
  assert.deepEqual(query.where.location, {
    visibility: { not: "HIDDEN" },
    city: { slug: "kyiv" },
  });
  assert(query.where.marketplaceProduct);
});
test("malformed cursors, repeated query parameters and invalid date filters fail before querying", () => {
  for (const query of [
    { cursor: "!" },
    { cursor: Buffer.from("{}").toString("base64url") },
    { search: ["a", "b"] },
    { from: "garbage" },
    { saleOnly: "yes" },
    { sort: "manual" },
    { sort: ["newest", "best"] },
    { sort: "best", cursor: encodeFeedCursor(works[0]!) },
    { sort: "newest", cursor: encodeFeedCursor(works[0]!, "best") },
    { searchCities: "private' OR true" },
    { from: "2026-10-02T00:00:00.000Z", to: "2026-10-01T00:00:00.000Z" },
  ])
    assert.throws(() => discoverQuery(undefined, query));
});

test("rating cursor inputs reject invalid precision, ranges and injected values", () => {
  for (const score of [
    0,
    "0",
    "10.000001",
    "8.1234567",
    "-1",
    "8' OR TRUE",
    [],
    undefined,
  ]) {
    const cursor = Buffer.from(
      JSON.stringify({ id: id(1), sort: "best", score, date: null }),
    ).toString("base64url");
    assert.throws(() => discoverQuery(undefined, { sort: "best", cursor }));
  }
});

test("ranking migration backfills the seven-criterion score and refreshes inserts, edits, moves and deletions without touching gallery positions", () => {
  const sql = readFileSync(
    new URL(
      "../../../../packages/db/prisma/migrations/0023_photo_feed_ranking/migration.sql",
      import.meta.url,
    ),
    "utf8",
  );
  for (const criterion of [
    "composition",
    "lighting",
    "technicalQuality",
    "storytelling",
    "originality",
    "color",
    "emotionalImpact",
  ]) {
    assert.equal(sql.match(new RegExp(`"${criterion}"`, "g"))?.length, 2);
  }
  assert.match(sql, /GROUP BY "photoId"/);
  assert.match(sql, /AFTER INSERT OR UPDATE OR DELETE/);
  assert.match(sql, /ARRAY\[OLD\."photoId", NEW\."photoId"\]/);
  assert.match(sql, /FOR NO KEY UPDATE/);
  assert.match(sql, /SELECT DISTINCT unnest\(target_ids\) ORDER BY 1/);
  assert.match(sql, /VOLATILE/);
  assert.match(sql, /DESC NULLS LAST/);
  assert.doesNotMatch(
    sql,
    /feedPosition|portfolioPosition|updatedAt|\bDELETE FROM\b|\bDROP\b|\bTRUNCATE\b/,
  );
});
