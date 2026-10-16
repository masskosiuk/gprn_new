import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { demoCommunityPosts } from "./demo-community-catalog.js";

test("the video discussion invites a creative critique without questioning authorship", () => {
  const post = demoCommunityPosts.find(
    (post) => post.key === "video-authorship",
  )!;
  assert.equal(
    post.title,
    "Как сделать короткое видео выразительным без дорогой техники?",
  );
  assert.equal(post.kind, "DISCUSSION");
  assert.match(post.body, /стоковый пример Mixkit/);
  assert.equal(
    "sourceId" in post && post.sourceId,
    "de000005-0000-4000-8000-000000000001",
  );
});

test("the content migration only refreshes the exact unedited demo and never removes replies or covers", () => {
  const sql = readFileSync(
    new URL(
      "../../../../packages/db/prisma/migrations/0016_refresh_demo_discussion/migration.sql",
      import.meta.url,
    ),
    "utf8",
  );
  assert.match(sql, /"demoKey" = 'community-v1-video-authorship'/);
  assert.match(
    sql,
    /AND "title" = 'А действительно ли это автор данного видео\?'/,
  );
  assert.match(sql, /AND "body" =/);
  assert.match(sql, /AND "deletedAt" IS NULL/);
  assert.doesNotMatch(
    sql,
    /DELETE FROM|"coverAssetKey"\s*=|"authorId"\s*=|"moderationStatus"\s*=/,
  );
});
