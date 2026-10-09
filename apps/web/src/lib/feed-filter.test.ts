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
test("all media includes photos and videos while keeping every other filter", () => {
  const all: FeedFilters = { ...filters, kind: "ALL", category: "street" };
  for (const video of [false, true]) {
    assert(matchesFeedFilters({ ...work, video }, all, "en"));
    assert(
      !matchesFeedFilters({ ...work, video, category: "portrait" }, all, "en"),
    );
    assert(
      !matchesFeedFilters(
        { ...work, video, location: "kyiv" },
        { ...all, location: "paris" },
        "en",
      ),
    );
    assert(
      !matchesFeedFilters(
        { ...work, video },
        { ...all, search: "missing" },
        "en",
      ),
    );
    assert(
      !matchesFeedFilters(
        { ...work, video },
        { ...all, from: "2026-10-10" },
        "en",
      ),
    );
  }
});
