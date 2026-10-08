import assert from "node:assert/strict";
import test from "node:test";

import { visibleProfileMetrics } from "./profile-metrics.ts";

test("profile metrics hide zero wins and followers while preserving rating and works", () => {
  assert.deepEqual(
    visibleProfileMetrics({ rating: 1500, photos: 2, wins: 0, followers: 0 }),
    [
      { value: 1500, key: "common.rating" },
      { value: 2, key: "profile.photos" },
    ],
  );
});

test("an empty profile has no empty statistics strip or zero counters", () => {
  assert.deepEqual(
    visibleProfileMetrics({ rating: 0, photos: 0, wins: 0, followers: 0 }),
    [],
  );
});

test("positive counts retain their order and invalid metrics are not displayed", () => {
  assert.deepEqual(
    visibleProfileMetrics({
      rating: 1608,
      photos: 3,
      wins: 27,
      followers: 2130,
    }).map(({ value }) => value),
    [1608, 3, 27, 2130],
  );
  assert.deepEqual(
    visibleProfileMetrics({
      rating: NaN,
      photos: 1,
      wins: -1,
      followers: Infinity,
    }),
    [{ value: 1, key: "profile.photos" }],
  );
});
