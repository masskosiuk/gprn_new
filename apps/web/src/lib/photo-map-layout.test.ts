import assert from "node:assert/strict";
import test from "node:test";
import {
  layoutPhotoMapMarkers,
  photoMapMarkerSize,
  type PhotoMapSlots,
} from "./photo-map-layout.ts";

const photos = Array.from({ length: 130 }, (_, index) => ({
  photoId: `kyiv-${index}`,
  latitude: 50.4501,
  longitude: 30.5234,
}));

test("every same-location photo has its own smaller marker without overlapping thumbnails", () => {
  const layout = layoutPhotoMapMarkers(photos, new Map());
  assert.equal(photoMapMarkerSize, 40);
  assert.equal(layout.length, photos.length);
  assert.deepEqual(
    layout.map(({ photo }) => photo),
    photos,
  );
  for (const [index, marker] of layout.entries()) {
    for (const other of layout.slice(index + 1)) {
      assert(
        Math.hypot(
          marker.offset.x - other.offset.x,
          marker.offset.y - other.offset.y,
        ) >=
          photoMapMarkerSize + 5.9,
      );
    }
  }
});

test("appending, reordering and filtering photos cannot move their existing map slots", () => {
  const slots: PhotoMapSlots = new Map();
  const initial = layoutPhotoMapMarkers(photos.slice(0, 25), slots);
  const appended = layoutPhotoMapMarkers([...photos].reverse(), slots);
  const filtered = layoutPhotoMapMarkers([photos[24]!, photos[2]!], slots);
  for (const marker of [...initial, ...filtered]) {
    assert.deepEqual(
      appended.find(({ photo }) => photo.photoId === marker.photo.photoId)
        ?.offset,
      marker.offset,
    );
  }
});

test("locations keep their real coordinates and independent layouts", () => {
  const paris = { photoId: "paris", latitude: 48.85, longitude: 2.35 };
  const source = [...photos.slice(0, 3), paris];
  const snapshot = structuredClone(source);
  const layout = layoutPhotoMapMarkers(source, new Map());
  assert.deepEqual(source, snapshot);
  assert.deepEqual(layout[0]!.offset, { x: 0, y: 0 });
  assert.deepEqual(layout.at(-1)!.offset, { x: 0, y: 0 });
  assert.deepEqual(layout.at(-1)!.photo, paris);
});

test("invalid coordinates are not passed to Leaflet", () => {
  const layout = layoutPhotoMapMarkers(
    [
      ...photos.slice(0, 1),
      { photoId: "invalid", latitude: NaN, longitude: 30 },
      { photoId: "invalid2", latitude: 50, longitude: Infinity },
    ],
    new Map(),
  );
  assert.equal(layout.length, 1);
});

test("the selected photo stays available across page refreshes without duplicating visible works", () => {
  const slots: PhotoMapSlots = new Map();
  const selected = photos[30]!;
  const initial = layoutPhotoMapMarkers(photos, slots);
  const refreshed = layoutPhotoMapMarkers(photos.slice(0, 25), slots, selected);
  assert.equal(refreshed.length, 26);
  assert.deepEqual(refreshed.at(-1)!.offset, initial[30]!.offset);
  assert.equal(refreshed.at(-1)!.photo.photoId, selected.photoId);
  assert.equal(
    layoutPhotoMapMarkers(photos, slots, selected).length,
    photos.length,
  );
  assert.equal(
    layoutPhotoMapMarkers(photos.slice(0, 25), slots, null).length,
    25,
  );
});
