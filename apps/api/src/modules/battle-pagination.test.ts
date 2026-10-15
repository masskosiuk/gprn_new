import assert from "node:assert/strict";
import test from "node:test";
import { battlePage, battlePageQuery } from "./battle-pagination.js";

test("open battle pages use a bounded stable order with a lookahead row", () => {
  assert.deepEqual(battlePageQuery(), {
    take: 21,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
  });
  assert.deepEqual(battlePageQuery("last-id").cursor, { id: "last-id" });
  assert.equal(battlePageQuery("last-id").skip, 1);
});

test("the next cursor is the last visible battle, never the lookahead row", () => {
  const rows = Array.from({ length: 21 }, (_, i) => ({ id: String(i) }));
  assert.equal(battlePage(rows).items.length, 20);
  assert.equal(battlePage(rows).nextCursor, "19");
  assert.equal(rows.length, 21);
});

test("empty and final pages terminate pagination", () => {
  assert.deepEqual(battlePage([]), { items: [], nextCursor: null });
  assert.equal(battlePage([{ id: "last" }]).nextCursor, null);
  assert.equal(
    battlePage(Array.from({ length: 20 }, (_, i) => ({ id: String(i) })))
      .nextCursor,
    null,
  );
});
