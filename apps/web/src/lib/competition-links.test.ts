import assert from "node:assert/strict";
import test from "node:test";

import { competitionPath, sharedCompetitionId } from "./competition-links.ts";

test("sharing links to the selected challenge in the current locale", () => {
  for (const locale of ["ru", "uk", "en"]) {
    const path = competitionPath(locale, "challenge", "cinema-123");
    const url = new URL(path, "https://photoapp.metarp.top");
    assert.equal(url.pathname, `/${locale}/challenges`);
    assert.equal(url.searchParams.get("challenge"), "cinema-123");
    assert.equal(
      sharedCompetitionId(url.searchParams.get("challenge")!, [
        { id: "cinema-123" },
      ]),
      "cinema-123",
    );
  }
});

test("the selected card is resolved after server competitions arrive", () => {
  assert.equal(sharedCompetitionId("server-id", []), null);
  assert.equal(
    sharedCompetitionId("server-id", [{ id: "server-id" }]),
    "server-id",
  );
  assert.equal(sharedCompetitionId(undefined, [{ id: "server-id" }]), null);
  assert.equal(sharedCompetitionId("unknown", [{ id: "server-id" }]), null);
});

test("challenge identifiers cannot inject extra query parameters or a fragment", () => {
  const id = "custom&author=other#fragment";
  const url = new URL(
    competitionPath("ru", "challenge", id),
    "https://photoapp.metarp.top",
  );
  assert.equal(url.searchParams.size, 1);
  assert.equal(url.hash, "");
  assert.equal(
    sharedCompetitionId(url.searchParams.get("challenge")!, [{ id }]),
    id,
  );
});

test("home battle links and shared battle links have the same exact target", () => {
  for (const locale of ["ru", "uk", "en"]) {
    const url = new URL(
      competitionPath(locale, "battle", "battle-id"),
      "https://photoapp.metarp.top",
    );
    assert.equal(url.pathname, `/${locale}/battles`);
    assert.equal(url.searchParams.get("battle"), "battle-id");
    assert.equal(
      sharedCompetitionId(url.searchParams.get("battle")!, [
        { id: "battle-id" },
      ]),
      "battle-id",
    );
  }
});
