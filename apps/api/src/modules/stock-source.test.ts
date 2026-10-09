import assert from "node:assert/strict";
import test from "node:test";
import { stockSourceResponse } from "./stock-source.js";

test("stock attribution follows stored media rather than a newer demo definition", () => {
  const old = {
    credit: "Edgar Fernandez / Mixkit",
    sourcePage:
      "https://mixkit.co/free-stock-video/elegant-woman-waiting-in-a-kiosk-2399/",
    privateMetadata: "never exposed",
  };
  assert.deepEqual(stockSourceResponse("stock-demo", old), {
    credit: old.credit,
    sourcePage: old.sourcePage,
  });
  const replacement = {
    credit: "Mixkit",
    sourcePage:
      "https://mixkit.co/free-stock-video/a-young-man-sitting-at-the-terrace-of-a-cozy-99905/",
  };
  assert.deepEqual(stockSourceResponse("stock-demo", replacement), replacement);
  assert.equal(stockSourceResponse("upload", old), null);
});

test("malformed and unsafe stock source links are not exposed", () => {
  for (const sourcePage of [
    "javascript:alert(1)",
    "not-a-link",
    "https://username:password@example.test/",
  ]) {
    assert.equal(
      stockSourceResponse("stock-demo", { credit: "Stock", sourcePage }),
      null,
    );
  }
  for (const metadata of [
    null,
    [],
    {},
    { credit: "", sourcePage: "https://example.test/" },
  ])
    assert.equal(stockSourceResponse("stock-demo", metadata), null);
});
