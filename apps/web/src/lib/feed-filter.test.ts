import assert from "node:assert/strict";
import test from "node:test";
import { matchesFeedFilters, type FeedFilters } from "./feed-filter.ts";
const work = {
  video: false,
  category: "street",
  location: "paris",
  publishedAt: "2026-10-09T12:00:00",
  searchText: "Rain after sunset Elena Paris",
};
const filters: FeedFilters = {
  kind: "PHOTO",
  category: "all",
  location: "all",
  from: "",
  to: "",
  search: "",
};
test("media, genre, location, dates and text all constrain the same feed selection", () => {
  assert(matchesFeedFilters(work, filters, "en"));
  for (const change of [
    { kind: "VIDEO" },
    { category: "portrait" },
    { location: "kyiv" },
    { from: "2026-10-10" },
    { to: "2026-10-08" },
    { search: "other author" },
  ])
    assert.equal(
      matchesFeedFilters(work, { ...filters, ...change } as FeedFilters, "en"),
      false,
    );
  assert(
    matchesFeedFilters(
      work,
      { ...filters, from: "2026-10-09", to: "2026-10-09", search: " ELENA " },
      "en",
    ),
  );
  assert(
    matchesFeedFilters(
      { ...work, video: true },
      { ...filters, kind: "VIDEO" },
      "en",
    ),
  );
});
test("undated works cannot bypass active date filters", () => {
  assert(
    !matchesFeedFilters(
      { ...work, publishedAt: undefined },
      { ...filters, from: "2026-01-01" },
      "en",
    ),
  );
});
