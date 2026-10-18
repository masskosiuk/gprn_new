import assert from "node:assert/strict";
import test from "node:test";
import {
  afterFeedCursor,
  discoverQuery,
  encodeFeedCursor,
  feedPageSize,
} from "./discover-query.js";

const id = (n: number) =>
  `de000002-0000-4000-8000-${String(n).padStart(12, "0")}`;
type Work = {
  id: string;
  feedPosition: number | null;
  publishedAt: Date | null;
};
function matches(work: Work, where: any): boolean {
  return Object.entries(where).every(([key, value]: [string, any]) => {
    if (key === "OR") return value.some((part: any) => matches(work, part));
    const actual = work[key as keyof Work];
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
function ordered(works: Work[]) {
  return [...works].sort(
    (a, b) =>
      (a.feedPosition ?? Infinity) - (b.feedPosition ?? Infinity) ||
      (b.publishedAt?.getTime() ?? Infinity) -
        (a.publishedAt?.getTime() ?? Infinity) ||
      a.id.localeCompare(b.id),
  );
}
const works = Array.from({ length: 145 }, (_, n): Work => ({
  id: id(n + 1),
  feedPosition: n < 7 ? Math.floor(n / 2) : null,
  publishedAt:
    n % 13 === 0 ? null : new Date(1760000000000 - Math.floor(n / 3) * 1000),
}));

test("feed cursors follow manual order, nulls and timestamp ties without offsets", () => {
  const sorted = ordered(works);
  for (let n = 0; n < sorted.length; n++) {
    const following = afterFeedCursor(encodeFeedCursor(sorted[n]!));
    assert.deepEqual(
      sorted.filter((work) => matches(work, following)).map((work) => work.id),
      sorted.slice(n + 1).map((work) => work.id),
    );
  }
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
    { searchCities: "private' OR true" },
    { from: "2026-10-02T00:00:00.000Z", to: "2026-10-01T00:00:00.000Z" },
  ])
    assert.throws(() => discoverQuery(undefined, query));
});
