import assert from "node:assert/strict";
import test from "node:test";
import { planMediaTitleRepairs } from "./media-title-repair.js";

const work = (id: string, title: string, fileName = `${title}.jpg`) => ({
  id,
  title,
  ownerId: "author",
  assets: [{ type: "DISPLAY", contentType: "image/webp" }],
  provenanceEvents: [{ evidence: { fileName } }],
});

test("repair replaces only automatically copied technical names and is idempotent", () => {
  const photos = [
    work("one", "f113409024"),
    work("two", "f110262528"),
    work("custom", "Мой первый кадр"),
    work("demo", "Crosswalk after rain"),
  ];
  const repairs = planMediaTitleRepairs(photos, "ru", new Set());
  assert.deepEqual(repairs, [
    { id: "one", previous: "f113409024", title: "Один момент" },
    { id: "two", previous: "f110262528", title: "Впечатление" },
  ]);
  const updated = photos.map((photo) => ({
    ...photo,
    title:
      repairs.find((repair) => repair.id === photo.id)?.title ?? photo.title,
  }));
  assert.deepEqual(planMediaTitleRepairs(updated, "ru", new Set()), []);
});

test("deleted files, profile images, edited titles and unproven filename matches are preserved", () => {
  const photos = [
    { ...work("deleted", "f12345678"), deletedAt: new Date() },
    work("avatar", "__profile_avatar_123456"),
    work("renamed", "f12345679"),
    work("different-name", "f12345680", "other-file.jpg"),
    { ...work("no-evidence", "f12345681"), provenanceEvents: [] },
  ];
  assert.deepEqual(
    planMediaTitleRepairs(photos, "ru", new Set(["renamed"])),
    [],
  );
});

test("repair sequences are per author and video titles describe video works", () => {
  const photos = [
    work("one", "f12345670"),
    {
      ...work("video", "f12345671"),
      ownerId: "other",
      assets: [{ type: "ORIGINAL", contentType: "video/mp4" }],
    },
  ];
  const repairs = planMediaTitleRepairs(photos, "ru", new Set());
  assert.equal(repairs[0]?.title, "Один момент");
  assert.equal(repairs[1]?.title, "История в движении");
});

test("repair recognizes filename UUIDs normalized to spaces", () => {
  const photos = [
    work(
      "uuid",
      "ae716829 cfbb 4d03 a948 785b8618cea1",
      "ae716829-cfbb-4d03-a948-785b8618cea1.jpg",
    ),
  ];
  assert.equal(
    planMediaTitleRepairs(photos, "ru", new Set())[0]?.title,
    "Один момент",
  );
});
