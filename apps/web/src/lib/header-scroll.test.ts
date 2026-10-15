import assert from "node:assert/strict";
import test from "node:test";
import { initialHeaderScroll, updateHeaderScroll } from "./header-scroll.ts";

test("the header stays visible at the top and during initial scrolling", () => {
  let state = initialHeaderScroll();
  for (const y of [12, 40, 80, 120]) {
    state = updateHeaderScroll(state, y, 110);
    assert.equal(state.hidden, false);
  }
  assert.equal(updateHeaderScroll(state, 152, 110).hidden, true);
});

test("small downward movements accumulate before hiding", () => {
  let state = initialHeaderScroll(200);
  for (const y of [205, 214, 226, 231]) {
    state = updateHeaderScroll(state, y, 110);
    assert.equal(state.hidden, false);
  }
  assert.equal(updateHeaderScroll(state, 232, 110).hidden, true);
});

test("upward scrolling reveals the header before returning to the top", () => {
  let state = updateHeaderScroll(initialHeaderScroll(300), 340, 110);
  state = updateHeaderScroll(state, 334, 110);
  assert.equal(state.hidden, true);
  state = updateHeaderScroll(state, 324, 110);
  assert.equal(state.hidden, false);
  assert.equal(state.lastY, 324);
});

test("minor direction changes cannot repeatedly toggle visibility", () => {
  let state = updateHeaderScroll(initialHeaderScroll(300), 340, 110);
  for (const y of [339, 341, 338, 343, 340, 344]) {
    state = updateHeaderScroll(state, y, 110);
    assert.equal(state.hidden, true);
  }
  assert.equal(updateHeaderScroll(state, 328, 110).hidden, false);
});

test("an open menu or keyboard focus pins the header and resets travel", () => {
  const hidden = updateHeaderScroll(initialHeaderScroll(300), 340, 110);
  const pinned = updateHeaderScroll(hidden, 800, 110, true);
  assert.deepEqual(pinned, initialHeaderScroll(800));
  assert.equal(updateHeaderScroll(pinned, 810, 110).hidden, false);
});

test("top-edge overscroll and returning to the top always reveal the header", () => {
  const hidden = updateHeaderScroll(initialHeaderScroll(300), 340, 110);
  assert.deepEqual(updateHeaderScroll(hidden, -20, 110), initialHeaderScroll());
  assert.equal(updateHeaderScroll(hidden, 10, 110).hidden, false);
});

test("stationary scroll events do not change state and travel is bounded", () => {
  const state = initialHeaderScroll(200);
  assert.equal(updateHeaderScroll(state, 200, 110), state);
  let next = updateHeaderScroll(state, 10000, 110);
  next = updateHeaderScroll(next, 20000, 110);
  assert.equal(next.travel, 32);
});
