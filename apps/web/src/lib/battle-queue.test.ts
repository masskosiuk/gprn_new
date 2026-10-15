import assert from "node:assert/strict";
import test from "node:test";
import { battleQueue } from "./battle-queue.ts";

const pair = (id: string, scope = "global") => ({
  id,
  scope,
  status: "OPEN",
  entries: [{ isMine: false }, { isMine: false }],
});

test("the next unvoted pair follows a skip without changing votes or source order", () => {
  const battles = [pair("one"), pair("two"), pair("three")];
  const votes = {};
  assert.equal(battleQueue(battles, "all", votes, [])[0]?.id, "one");
  assert.equal(battleQueue(battles, "all", votes, ["one"])[0]?.id, "two");
  assert.deepEqual(votes, {});
  assert.deepEqual(
    battles.map((b) => b.id),
    ["one", "two", "three"],
  );
});

test("confirmed votes and skipped pairs cannot reappear in the current queue", () => {
  assert.deepEqual(
    battleQueue([pair("one"), pair("two"), pair("three")], "all", { one: {} }, [
      "two",
    ]).map((b) => b.id),
    ["three"],
  );
});

test("only complete open pairs without the current photographer are offered", () => {
  const battles = [
    pair("open"),
    { ...pair("draft"), status: "DRAFT" },
    { ...pair("closed"), status: "CLOSED" },
    { ...pair("waiting"), entries: [{}] },
    { ...pair("mine"), entries: [{ isMine: true }, {}] },
    { ...pair("server-mine"), viewerParticipates: true },
  ];
  assert.deepEqual(
    battleQueue(battles, "all", {}, []).map((b) => b.id),
    ["open"],
  );
});

test("scope filtering preserves global skip and vote history", () => {
  const battles = [
    pair("one"),
    pair("season-one", "season"),
    pair("season-two", "season"),
  ];
  assert.deepEqual(
    battleQueue(battles, "season", {}, ["season-one"]).map((b) => b.id),
    ["season-two"],
  );
  assert.deepEqual(battleQueue(battles, "global", { one: {} }, []), []);
});

test("restarting skipped pairs never resets confirmed votes", () => {
  const battles = [pair("one"), pair("two")];
  assert.deepEqual(battleQueue(battles, "all", { one: {} }, ["two"]), []);
  assert.deepEqual(
    battleQueue(battles, "all", { one: {} }, []).map((b) => b.id),
    ["two"],
  );
});

test("another server page is appended without changing the next eligible pair", () => {
  assert.equal(
    battleQueue([pair("old"), pair("new")], "all", { old: {} }, [])[0]?.id,
    "new",
  );
});
