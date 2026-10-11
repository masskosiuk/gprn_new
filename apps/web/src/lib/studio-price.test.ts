import assert from "node:assert/strict";
import test from "node:test";
import { filterStudioPrices } from "./studio-price.ts";
const studios = [
  { hourlyRateMinor: 16800 },
  { hourlyRateMinor: 8500 },
  { hourlyRateMinor: 10400 },
];
test("studio price bounds are inclusive, dollars are converted to minor units", () => {
  assert.deepEqual(filterStudioPrices(studios, "85", "104", "default"), [
    studios[1],
    studios[2],
  ]);
  assert.deepEqual(filterStudioPrices(studios, "104.01", "168", "asc"), [
    studios[0],
  ]);
  assert.deepEqual(filterStudioPrices(studios, "200", "100", "default"), []);
});
test("studio ordering does not mutate the catalogue and empty bounds include all", () => {
  assert.deepEqual(filterStudioPrices(studios, "", "", "asc"), [
    studios[1],
    studios[2],
    studios[0],
  ]);
  assert.deepEqual(filterStudioPrices(studios, "", "", "desc"), [
    studios[0],
    studios[2],
    studios[1],
  ]);
  assert.equal(studios[0]!.hourlyRateMinor, 16800);
});
