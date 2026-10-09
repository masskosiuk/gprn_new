import assert from "node:assert/strict";
import test from "node:test";
import type { Prisma, prisma } from "@gprn/db";
import { demoBattleAuthors, demoChallengeWorks } from "@gprn/domain";
import type { DemoWorkAsset } from "./demo-challenge-seed.js";
import {
  demoVideoRefreshStatus,
  refreshDemoChallengeVideo,
  replacementVideo,
  replacementVideoRevision,
} from "./demo-challenge-refresh.js";

const legacySource =
  "https://mixkit.co/free-stock-video/elegant-woman-waiting-in-a-kiosk-2399/";
type RefreshPhoto = NonNullable<Parameters<typeof demoVideoRefreshStatus>[0]>;

function legacyPhoto(): RefreshPhoto {
  return {
    id: replacementVideo.id,
    ownerId: demoBattleAuthors.find((author) => author.key === "lucas")!.id,
    owner: { email: "lucas@demo.gprn.invalid" },
    title: "Waiting after dark",
    description: `Stock demo example, not the demo master's original work. Edgar Fernandez / Mixkit. Mixkit Stock Video Free License. Source: ${legacySource}`,
    categoryId: "documentary",
    status: "PUBLISHED",
    moderationStatus: "APPROVED",
    visibility: "PUBLIC",
    deletedAt: null,
    metadata: {
      exifJson: {
        mediaType: "VIDEO",
        sourcePage: legacySource,
        custom: "kept",
      },
    },
    provenance: { sourceProvider: "stock-demo", status: "UNVERIFIED" },
    assets: [
      {
        id: "display-id",
        type: "DISPLAY",
        contentType: "video/mp4",
        storageKey: `demo/challenges/v1/${replacementVideo.id}/display.mp4`,
        deletedAt: null,
      },
      {
        id: "poster-id",
        type: "THUMBNAIL",
        contentType: "image/webp",
        storageKey: `demo/challenges/v1/${replacementVideo.id}/thumbnail.webp`,
        deletedAt: null,
      },
    ],
    challengeEntries: [{ id: "existing-entry", moderationStatus: "APPROVED" }],
    likes: [{ userId: "viewer" }],
  } as unknown as RefreshPhoto;
}

const assets: DemoWorkAsset[] = (["DISPLAY", "THUMBNAIL"] as const).map(
  (type) => ({
    sourceId: replacementVideo.id,
    type,
    contentType: type === "DISPLAY" ? "video/mp4" : "image/webp",
    bucket: "public",
    storageKey: `demo/challenges/${replacementVideoRevision}/${replacementVideo.id}/${type === "DISPLAY" ? "display.mp4" : "thumbnail.webp"}`,
    publicUrl: "https://cdn.test/replacement",
    byteSize: 1234,
    width: 1280,
    height: 720,
    checksumSha256: "new-checksum",
    durationSeconds: type === "DISPLAY" ? 11.386 : undefined,
  }),
);

function database() {
  let photo = legacyPhoto();
  let writes = 0;
  const otherWork = { id: demoChallengeWorks[0]!.id, title: "Untouched" };
  const tx = {
    photo: {
      async findUnique(input: { where: { id: string } }) {
        assert.equal(input.where.id, photo.id);
        return photo;
      },
      async update(input: {
        where: { id: string };
        data: Record<string, unknown>;
      }) {
        assert.equal(input.where.id, photo.id);
        const { metadata, assets: updatedAssets, ...fields } = input.data;
        Object.assign(photo, fields);
        Object.assign(photo.metadata!, (metadata as { update: object }).update);
        for (const asset of (
          updatedAssets as { update: { where: { id: string }; data: object }[] }
        ).update) {
          Object.assign(
            photo.assets.find((item) => item.id === asset.where.id)!,
            asset.data,
          );
        }
        writes += 1;
        return photo;
      },
    },
  };
  const client = {
    async $transaction<T>(
      run: (tx: Prisma.TransactionClient) => Promise<T>,
      options: { isolationLevel: string },
    ) {
      assert.equal(options.isolationLevel, "Serializable");
      const before = structuredClone(photo);
      try {
        return await run(tx as unknown as Prisma.TransactionClient);
      } catch (error) {
        photo = before;
        throw error;
      }
    },
  } as unknown as Pick<typeof prisma, "$transaction">;
  return {
    client,
    get photo() {
      return photo;
    },
    get writes() {
      return writes;
    },
    otherWork,
  };
}

test("the replacement uses a different stock shoot from Mika's kiosk scene", () => {
  const first = demoChallengeWorks.find((work) => work.author === "mika")!;
  assert.notEqual(first.url, replacementVideo.url);
  assert.notEqual(first.sourcePage, replacementVideo.sourcePage);
  assert(replacementVideo.sourcePage.includes("terrace-of-a-cozy"));
});

test("replaces the clip and poster atomically without recreating participation or profiles", async () => {
  const db = database();
  const before = structuredClone(db.photo);
  assert.equal(demoVideoRefreshStatus(db.photo), "READY");
  assert.equal(await refreshDemoChallengeVideo(db.client, assets), "REPLACED");
  assert.equal(db.photo.id, before.id);
  assert.equal(db.photo.ownerId, before.ownerId);
  assert.equal(db.photo.title, replacementVideo.title);
  assert(db.photo.description!.includes(replacementVideo.sourcePage));
  for (const key of [
    "owner",
    "status",
    "moderationStatus",
    "visibility",
    "deletedAt",
    "categoryId",
    "provenance",
    "challengeEntries",
    "likes",
  ]) {
    assert.deepEqual(
      (db.photo as unknown as Record<string, unknown>)[key],
      (before as unknown as Record<string, unknown>)[key],
    );
  }
  assert.deepEqual(
    db.photo.assets.map((asset) => asset.id),
    ["display-id", "poster-id"],
  );
  assert(
    db.photo.assets.every((asset) =>
      asset.storageKey.includes(replacementVideoRevision),
    ),
  );
  assert.equal(
    (db.photo.metadata!.exifJson as Prisma.JsonObject).custom,
    "kept",
  );
  assert.equal(
    (db.photo.metadata!.exifJson as Prisma.JsonObject).durationSeconds,
    11.386,
  );
  assert.equal(db.otherWork.title, "Untouched");
  const updated = structuredClone(db.photo);
  assert.equal(await refreshDemoChallengeVideo(db.client, []), "UPDATED");
  assert.equal(db.writes, 1);
  assert.deepEqual(db.photo, updated);
});

test("preserves an administrator's custom title and description", async () => {
  const db = database();
  db.photo.title = "Administrator title";
  db.photo.description = "Administrator description";
  await refreshDemoChallengeVideo(db.client, assets);
  assert.equal(db.photo.title, "Administrator title");
  assert.equal(db.photo.description, "Administrator description");
});

test("new metadata with old media is repaired rather than reported as updated", async () => {
  const db = database();
  db.photo.metadata!.exifJson = {
    sourcePage: replacementVideo.sourcePage,
    credit: replacementVideo.credit,
  };
  assert.equal(demoVideoRefreshStatus(db.photo), "READY");
  assert.equal(await refreshDemoChallengeVideo(db.client, assets), "REPLACED");
  assert(
    db.photo.assets.every((asset) =>
      asset.storageKey.includes(replacementVideoRevision),
    ),
  );
});

test("a partial known revision is repaired but a custom upload is never overwritten", async () => {
  const db = database();
  db.photo.metadata!.exifJson = { sourcePage: replacementVideo.sourcePage };
  db.photo.assets[0]!.storageKey = assets[0]!.storageKey;
  assert.equal(demoVideoRefreshStatus(db.photo), "READY");
  assert.equal(await refreshDemoChallengeVideo(db.client, assets), "REPLACED");
  db.photo.assets[0]!.storageKey = "administrator/custom.mp4";
  assert.throws(() => demoVideoRefreshStatus(db.photo), /edited/);
});

test("deleted, hidden, rejected and pending works stay unavailable", async () => {
  for (const fields of [
    { deletedAt: new Date() },
    { visibility: "PRIVATE" },
    { status: "DRAFT" },
    { moderationStatus: "REJECTED" },
    { moderationStatus: "PENDING" },
  ]) {
    const db = database();
    Object.assign(db.photo, fields);
    const before = structuredClone(db.photo);
    assert.equal(await refreshDemoChallengeVideo(db.client, []), "UNAVAILABLE");
    assert.equal(db.writes, 0);
    assert.deepEqual(db.photo, before);
  }
});

test("missing work, reserved ID collisions and modified sources/assets cannot be overwritten", async () => {
  assert.throws(() => demoVideoRefreshStatus(null), /missing/);
  for (const edit of [
    (photo: RefreshPhoto) => {
      photo.ownerId = "real-author";
    },
    (photo: RefreshPhoto) => {
      photo.owner.email = "real@example.com";
    },
    (photo: RefreshPhoto) => {
      photo.provenance!.sourceProvider = "upload";
    },
    (photo: RefreshPhoto) => {
      photo.metadata!.exifJson = { sourcePage: "https://custom.test" };
    },
    (photo: RefreshPhoto) => {
      photo.assets[0]!.storageKey = "administrator/new-video.mp4";
    },
  ]) {
    const db = database();
    edit(db.photo);
    const before = structuredClone(db.photo);
    await assert.rejects(
      refreshDemoChallengeVideo(db.client, assets),
      /Refusing|edited/,
    );
    assert.equal(db.writes, 0);
    assert.deepEqual(db.photo, before);
  }
});

test("missing poster, old cache keys and invalid duration leave the old clip intact", async () => {
  for (const prepared of [
    assets.filter((asset) => asset.type === "DISPLAY"),
    assets.map((asset) => ({ ...asset, storageKey: "old-cache-key" })),
    assets.map((asset) => ({ ...asset, durationSeconds: 8 })),
  ]) {
    const db = database();
    const before = structuredClone(db.photo);
    await assert.rejects(
      refreshDemoChallengeVideo(db.client, prepared),
      /invalid replacement/,
    );
    assert.equal(db.writes, 0);
    assert.deepEqual(db.photo, before);
  }
});
