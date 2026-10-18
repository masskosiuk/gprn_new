import assert from "node:assert/strict";
import test from "node:test";
import { applyGalleryOrder, moveGalleryItem } from "./gallery-order.ts";

const photos = ["a", "b", "c", "d"].map((id) => ({ id, likes: 1 }));

test("gallery moves insert before or after the target without dropping filtered-out works", () => {
  assert.deepEqual(
    moveGalleryItem(photos, {
      photoId: "a",
      targetId: "c",
      placement: "after",
    }).map((photo) => photo.id),
    ["b", "c", "a", "d"],
  );
  assert.deepEqual(
    moveGalleryItem(photos, {
      photoId: "d",
      targetId: "b",
      placement: "before",
    }).map((photo) => photo.id),
    ["a", "d", "b", "c"],
  );
  assert.deepEqual(
    photos.map((photo) => photo.id),
    ["a", "b", "c", "d"],
  );
});

test("server order and rollback preserve fresh engagement values and unknown new uploads", () => {
  const current = [
    { id: "b", likes: 12 },
    { id: "a", likes: 4 },
    { id: "new", likes: 0 },
  ];
  assert.deepEqual(applyGalleryOrder(current, ["a", "b"]), [
    current[1],
    current[0],
    current[2],
  ]);
  assert.deepEqual(applyGalleryOrder(current, []), current);
});

test("missing and identical move targets never alter the gallery", () => {
  for (const move of [
    { photoId: "a", targetId: "a", placement: "before" as const },
    { photoId: "missing", targetId: "b", placement: "after" as const },
    { photoId: "a", targetId: "missing", placement: "after" as const },
  ])
    assert.deepEqual(moveGalleryItem(photos, move), photos);
});
