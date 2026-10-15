import assert from "node:assert/strict";
import test from "node:test";
import {
  marketplacePageSize,
  selectMarketplaceDemos,
  type MarketplaceDemoWork,
} from "./marketplace-catalog.ts";

const works: MarketplaceDemoWork[] = [
  {
    id: "photo",
    kind: "PHOTO",
    title: "Rain",
    imageUrl: "photo.jpg",
    genre: "street",
    seller: { username: "elena", displayName: "Elena" },
  },
  {
    id: "video",
    kind: "VIDEO",
    title: "Night",
    imageUrl: "video.jpg",
    videoUrl: "video.mp4",
    genre: "cinematic",
    seller: { username: "lucas", displayName: "Lucas" },
  },
];
const filters = { kind: "ALL", genre: "", search: "", page: 1, selected: null };
test("marketplace pages contain twice as many products as before", () => {
  assert.equal(marketplacePageSize, 48);
});
test("demo works respect media, genre and author search without mutating sources", () => {
  assert.deepEqual(selectMarketplaceDemos(works, filters, [], "ru"), works);
  assert.deepEqual(
    selectMarketplaceDemos(
      works,
      { ...filters, kind: "VIDEO", genre: "cinematic", search: " LUCAS " },
      [],
      "ru",
    ),
    [works[1]],
  );
  assert.deepEqual(
    selectMarketplaceDemos(
      works,
      { ...filters, kind: "PHOTO", genre: "cinematic" },
      [],
      "ru",
    ),
    [],
  );
  assert.equal(works.length, 2);
});
test("demos never duplicate listings or appear in digital-only and selected-product results", () => {
  assert.deepEqual(selectMarketplaceDemos(works, filters, ["photo"], "ru"), [
    works[1],
  ]);
  for (const change of [
    { page: 2 },
    { kind: "PRESET" },
    { kind: "LUT" },
    { selected: "product" },
  ])
    assert.deepEqual(
      selectMarketplaceDemos(works, { ...filters, ...change }, [], "ru"),
      [],
    );
});
