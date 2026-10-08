import assert from "node:assert/strict";
import test from "node:test";
import { assetMediaType } from "@gprn/domain";
import { mediaCatalogFilter } from "./media-catalog.js";
import { mediaAssetResponse } from "./serialization.js";
import type { RuntimeEnv } from "@gprn/config";

test("photo and video catalog queries enforce different asset types on the server", () => {
  const photos = mediaCatalogFilter("PHOTO");
  const videos = mediaCatalogFilter("VIDEO");
  assert.equal(photos.assets?.some.contentType.startsWith, "image/");
  assert.deepEqual(photos.NOT?.assets, videos.assets);
  assert.equal(videos.assets?.some.contentType.startsWith, "video/");
  assert.deepEqual(mediaCatalogFilter(), {});
  assert.throws(() => mediaCatalogFilter("anything"));
});

test("a video with an image poster stays in the video catalog even without a playback rendition", () => {
  const assets = [
    { type: "ORIGINAL", contentType: "VIDEO/MP4", storageKey: "private.mp4" },
    { type: "DISPLAY", contentType: "image/webp", storageKey: "still.webp" },
    { type: "THUMBNAIL", contentType: "image/webp", storageKey: "poster.webp" },
  ];
  assert.equal(assetMediaType(assets), "VIDEO");
  const env = {
    CDN_PUBLIC_URL: "https://cdn.invalid",
    S3_ENDPOINT: "https://storage.invalid",
    S3_BUCKET_PUBLIC: "public",
  } as RuntimeEnv;
  assert.deepEqual(mediaAssetResponse(env, assets), {
    mediaType: "VIDEO",
    displayUrl: "https://cdn.invalid/poster.webp",
    thumbnailUrl: "https://cdn.invalid/poster.webp",
    videoUrl: null,
  });
  const renamedImage = [
    { type: "ORIGINAL", contentType: "image/png", storageKey: "renamed.mp4" },
  ];
  assert.equal(assetMediaType(renamedImage), "PHOTO");
});
