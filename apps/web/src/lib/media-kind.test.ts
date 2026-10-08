import assert from "node:assert/strict";
import test from "node:test";

import { isVideoWork, mergeMediaWorks } from "./media-kind.ts";

test("explicit video metadata is not mistaken for a photograph when playback is unavailable", () => {
  assert.equal(isVideoWork({ mediaType: "VIDEO" }), true);
  assert.equal(isVideoWork({ mediaType: "PHOTO" }), false);
});

test("older video records are detected by their playback URL or MIME type", () => {
  assert.equal(
    isVideoWork({ videoSrc: "https://example.invalid/display.mp4" }),
    true,
  );
  assert.equal(isVideoWork({ contentType: "video/mp4" }), true);
  assert.equal(isVideoWork({ contentType: "video/webm" }), true);
  assert.equal(isVideoWork({ contentType: "image/webp" }), false);
  assert.equal(isVideoWork({ videoSrc: "" }), false);
  assert.equal(isVideoWork({}), false);
});

test("an image poster does not turn a video into a photograph", () => {
  const work = {
    mediaType: "VIDEO" as const,
    src: "https://example.invalid/thumbnail.webp",
    videoSrc: "https://example.invalid/display.mp4",
  };
  assert.equal(isVideoWork(work), true);
});

test("photo and video galleries partition mixed server data without losing profile works", () => {
  const works = [
    { id: "green", mediaType: "PHOTO" as const },
    { id: "shadow", mediaType: "PHOTO" as const },
    {
      id: "cinema",
      mediaType: "VIDEO" as const,
      videoSrc: "https://example.invalid/display.mp4",
    },
    { id: "legacy-video", contentType: "video/webm" },
    { id: "legacy-photo", contentType: "image/jpeg" },
  ];
  const photos = works.filter((work) => !isVideoWork(work));
  const videos = works.filter(isVideoWork);
  assert.deepEqual(
    photos.map(({ id }) => id),
    ["green", "shadow", "legacy-photo"],
  );
  assert.deepEqual(
    videos.map(({ id }) => id),
    ["cinema", "legacy-video"],
  );
  assert.equal(photos.length + videos.length, works.length);
  assert.equal(works.length, 5);
});

test("legacy playback URLs and case-insensitive MIME types cannot leak into photos", () => {
  assert(isVideoWork({ src: "https://cdn.invalid/clip.MP4?token=example" }));
  assert(isVideoWork({ src: "data:video/webm;base64,AA==" }));
  assert(isVideoWork({ contentType: "VIDEO/MP4" }));
  assert(
    !isVideoWork({ src: "https://cdn.invalid/preview.webp?name=clip.mp4" }),
  );
});

test("old cached photo metadata cannot mask a newer server video record with the same id", () => {
  const works = mergeMediaWorks([
    {
      id: "old",
      mediaType: "PHOTO" as const,
      src: "poster.webp",
      isMine: true,
      title: "My title",
    },
    {
      id: "old",
      mediaType: "VIDEO" as const,
      videoSrc: "clip.mp4",
      isMine: false,
      title: "My title",
    },
    {
      id: "image",
      mediaType: "PHOTO" as const,
      src: "image.webp",
      isMine: false,
      title: "An image",
    },
  ]);
  assert.equal(works.length, 2);
  assert.equal(works[0]?.isMine, true);
  assert.deepEqual(
    works.filter(isVideoWork).map((work) => work.id),
    ["old"],
  );
  assert.deepEqual(
    works.filter((work) => !isVideoWork(work)).map((work) => work.id),
    ["image"],
  );
});
