import assert from "node:assert/strict";
import test from "node:test";
import {
  assetMediaType,
  challengeMediaError,
  challengeMediaType,
  demoChallenges,
  demoChallengeWorks,
} from "@gprn/domain";
import { loadRuntimeEnv } from "@gprn/config";
import { mediaAssetResponse } from "./serialization.js";
import {
  parseVideoProbe,
  isSupportedVideoContainer,
} from "./video-renditions.js";

const image = [
  { type: "DISPLAY", contentType: "image/webp", storageKey: "display.webp" },
];

test("binary container check rejects playlists and arbitrary files", () => {
  assert.equal(
    isSupportedVideoContainer(Buffer.from("#EXTM3U\n/etc/private.mp4")),
    false,
  );
  assert.equal(
    isSupportedVideoContainer(
      Buffer.from("ffconcat version 1.0\nfile /etc/private.mp4"),
    ),
    false,
  );
  assert.equal(isSupportedVideoContainer(Buffer.from("image data")), false);
  assert.equal(
    isSupportedVideoContainer(Buffer.from([0x1a, 0x45, 0xdf, 0xa3])),
    true,
  );
  assert.equal(
    isSupportedVideoContainer(
      Buffer.from([0, 0, 0, 24, 102, 116, 121, 112, 105, 115, 111, 109]),
    ),
    true,
  );
});
const video = [
  { type: "DISPLAY", contentType: "video/mp4", storageKey: "display.mp4" },
  { type: "THUMBNAIL", contentType: "image/webp", storageKey: "poster.webp" },
  { type: "ORIGINAL", contentType: "video/mp4", storageKey: "private.mp4" },
];

test("photo/video challenges enforce asset type rather than file extension or poster", () => {
  assert.equal(challengeMediaType(null), "PHOTO");
  assert.equal(assetMediaType(video), "VIDEO");
  assert.equal(
    challengeMediaError({ mediaType: "PHOTO" }, video, null),
    "TYPE",
  );
  assert.equal(
    challengeMediaError({ mediaType: "VIDEO" }, image, null),
    "TYPE",
  );
  assert.equal(challengeMediaError({}, image, null), null);
});

test("cinema duration comes from processed metadata and must match rules", () => {
  const rules = {
    mediaType: "VIDEO",
    minDurationSeconds: 10,
    maxDurationSeconds: 60,
  };
  for (const durationSeconds of [10, 12, 60])
    assert.equal(challengeMediaError(rules, video, { durationSeconds }), null);
  for (const metadata of [
    null,
    {},
    { durationSeconds: 0 },
    { durationSeconds: 9 },
    { durationSeconds: 61 },
  ])
    assert.equal(challengeMediaError(rules, video, metadata), "DURATION");
});

test("video serialization returns a still preview, public playback and never the original", () => {
  const env = {
    S3_ENDPOINT: "https://storage.test",
    S3_BUCKET_PUBLIC: "public",
    CDN_PUBLIC_URL: "https://cdn.test",
  } as ReturnType<typeof loadRuntimeEnv>;
  assert.deepEqual(mediaAssetResponse(env, video), {
    mediaType: "VIDEO",
    displayUrl: "https://cdn.test/poster.webp",
    thumbnailUrl: "https://cdn.test/poster.webp",
    videoUrl: "https://cdn.test/display.mp4",
  });
  assert.equal(mediaAssetResponse(env, image).videoUrl, null);
  assert.equal(mediaAssetResponse(env, []).displayUrl, null);
});

test("probe rejects missing streams, non-finite/long durations and excessive dimensions", () => {
  const valid = {
    format: { duration: "12.2" },
    streams: [
      { codec_type: "audio" },
      { codec_type: "video", width: 1920, height: 1080 },
    ],
  };
  assert.deepEqual(parseVideoProbe(valid), {
    width: 1920,
    height: 1080,
    durationSeconds: 12.2,
  });
  for (const invalid of [
    null,
    {},
    { ...valid, format: { duration: "NaN" } },
    { ...valid, format: { duration: "61" } },
    { ...valid, streams: [{ codec_type: "video", width: 8000, height: 1080 }] },
  ])
    assert.throws(() => parseVideoProbe(invalid));
});

test("three requested themes contain two matching stock examples each from six demo masters", () => {
  assert.equal(demoChallenges.length, 3);
  assert.equal(new Set(demoChallengeWorks.map((work) => work.author)).size, 6);
  for (const challenge of demoChallenges) {
    const works = demoChallengeWorks.filter(
      (work) => work.challenge === challenge.slug,
    );
    assert.equal(works.length, 2);
    works.forEach((work) => {
      assert.equal(work.mediaType, challenge.mediaType);
      assert(work.sourcePage.startsWith("https://"));
      assert(work.credit);
    });
  }
});
