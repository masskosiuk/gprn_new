import assert from "node:assert/strict";
import test from "node:test";
import { demoBattleAuthors, demoExpertUsernames } from "@gprn/domain";
import {
  canonicalProfileUsername,
  recoverableProfileImages,
} from "./profile-source.ts";

test("all legacy demo author links resolve to the same database profile", () => {
  for (const author of demoBattleAuthors) {
    for (const alias of [
      author.key,
      author.id,
      author.username,
      author.username.slice(5),
    ]) {
      assert.equal(canonicalProfileUsername(alias), author.username);
    }
  }
});

test("expert aliases resolve to database profiles too", () => {
  for (const [key, username] of Object.entries(demoExpertUsernames)) {
    for (const alias of [key, username, username.slice(5)]) {
      assert.equal(canonicalProfileUsername(alias), username);
    }
  }
});

test("real usernames are not replaced with demo users or the current viewer", () => {
  assert.equal(canonicalProfileUsername(" Maetoerc "), "maetoerc");
  assert.equal(canonicalProfileUsername("another-author"), "another-author");
});

test("legacy recovery never takes images from another account or overwrites server images", () => {
  const saved = {
    email: "owner@example.invalid",
    avatarUrl: "old-avatar",
    coverUrl: "old-cover",
  };
  assert.equal(
    recoverableProfileImages({ email: "other@example.invalid" }, saved),
    null,
  );
  assert.equal(
    recoverableProfileImages(
      {
        email: saved.email,
        avatarUrl: "server-avatar",
        coverUrl: "server-cover",
      },
      saved,
    ),
    null,
  );
  assert.deepEqual(
    recoverableProfileImages(
      { email: saved.email, avatarUrl: "server-avatar" },
      saved,
    ),
    {
      avatarUrl: undefined,
      coverUrl: "old-cover",
    },
  );
  assert.equal(recoverableProfileImages({ email: saved.email }, null), null);
});
