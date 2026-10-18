import assert from "node:assert/strict";
import test from "node:test";
import type { Prisma, prisma } from "@gprn/db";
import {
  demoBattleAuthors,
  demoBattlePhotos,
  demoChallengeWorks,
} from "@gprn/domain";
import {
  demoPhotoSales,
  demoPhotoSaleTerms,
} from "../modules/demo-photo-sales.js";
import { seedDemoPhotoSales } from "./demo-photo-sale-seed.js";

function database() {
  const photos = demoPhotoSales.map((offer) => {
    const source = [...demoBattlePhotos, ...demoChallengeWorks].find(
      (work) => work.id === offer.photoId,
    )!;
    const author = demoBattleAuthors.find(
      (user) => user.key === source.author,
    )!;
    return {
      id: offer.photoId as string,
      ownerId: author.id as string,
      title: source.title,
      categoryId: source.category,
      status: "PUBLISHED",
      visibility: "PUBLIC",
      moderationStatus: "APPROVED",
      deletedAt: null as Date | null,
      owner: {
        email: `${author.key}@demo.gprn.invalid`,
        passwordHash: null as string | null,
        status: "ACTIVE",
        deletedAt: null,
        profile: {
          username: author.username as string,
          displayName: author.name,
          visibility: "PUBLIC",
          deletedAt: null,
        },
      },
      provenance: { sourceProvider: "demo" },
      assets: [
        { type: "DISPLAY", storageVisibility: "PUBLIC", deletedAt: null },
      ],
      marketplaceProduct: null as any,
    };
  });
  const listings: any[] = [];
  const tx = {
    $executeRaw: async () => 1,
    photo: {
      findUnique: async ({ where }: any) =>
        photos.find((photo) => photo.id === where.id),
    },
    sellerProfile: {
      upsert: async ({ where, update }: any) => {
        assert.deepEqual(update, {});
        return { id: where.userId, status: "ACTIVE" };
      },
    },
    marketplaceProduct: {
      create: async ({ data }: any) => {
        listings.push(data);
        photos.find((photo) => photo.id === data.photoId)!.marketplaceProduct =
          {
            ...data,
            digitalKind: null,
            seller: { userId: data.sellerId },
          };
        return data;
      },
    },
  };
  const client = {
    $transaction: async (
      run: (tx: Prisma.TransactionClient) => unknown,
      options: unknown,
    ) => {
      assert.deepEqual(options, { timeout: 30_000 });
      return run(tx as unknown as Prisma.TransactionClient);
    },
  } as unknown as Pick<typeof prisma, "$transaction">;
  return { client, photos, listings };
}

test("seven labelled examples reuse existing works without creating uploads or originals", async () => {
  const db = database();
  assert.deepEqual(await seedDemoPhotoSales(db.client), {
    created: 7,
    existing: 0,
    unavailable: 0,
  });
  assert.equal(new Set(db.listings.map((offer) => offer.photoId)).size, 7);
  for (const listing of db.listings) {
    assert.equal(listing.isDemo, true);
    assert.equal(listing.currency, "USD");
    assert.equal(
      listing.genre,
      [...demoBattlePhotos, ...demoChallengeWorks].find(
        (work) => work.id === listing.photoId,
      )!.category,
    );
    assert.equal(listing.filesJson.licenseTerms, demoPhotoSaleTerms);
    assert.equal(
      listing.priceMinor,
      BigInt(
        demoPhotoSales.find((offer) => offer.photoId === listing.photoId)!
          .priceMinor,
      ),
    );
    assert.equal(listing.previewAssetKey, undefined);
  }
});

test("repeat seeds preserve prices, hidden listings, photographs and moderation", async () => {
  const db = database();
  await seedDemoPhotoSales(db.client);
  db.photos[0]!.marketplaceProduct.priceMinor = 9900n;
  db.photos[1]!.marketplaceProduct.status = "HIDDEN";
  const before = structuredClone(db.photos);
  assert.deepEqual(await seedDemoPhotoSales(db.client), {
    created: 0,
    existing: 7,
    unavailable: 0,
  });
  assert.deepEqual(db.photos, before);
  assert.equal(db.listings.length, 7);
});

test("private, rejected, deleted and disabled demo works are not revived", async () => {
  const db = database();
  db.photos[0]!.visibility = "PRIVATE";
  db.photos[1]!.moderationStatus = "REJECTED";
  db.photos[2]!.deletedAt = new Date();
  db.photos[3]!.owner.status = "SUSPENDED";
  db.photos[4]!.assets = [];
  const before = structuredClone(db.photos.slice(0, 5));
  assert.deepEqual(await seedDemoPhotoSales(db.client), {
    created: 2,
    existing: 0,
    unavailable: 5,
  });
  assert.deepEqual(db.photos.slice(0, 5), before);
});

test("changed ownership, real credentials or custom listings are never overwritten", async () => {
  for (const field of [
    "owner",
    "email",
    "username",
    "password",
    "source",
    "listing",
  ]) {
    const db = database();
    const photo = db.photos[0]!;
    if (field === "owner") photo.ownerId = "real-user";
    if (field === "email") photo.owner.email = "real@example.invalid";
    if (field === "username") photo.owner.profile.username = "real-user";
    if (field === "password") photo.owner.passwordHash = "private-hash";
    if (field === "source") photo.provenance.sourceProvider = "upload";
    if (field === "listing") photo.marketplaceProduct = { isDemo: false };
    await assert.rejects(
      seedDemoPhotoSales(db.client),
      /No listings were modified/,
    );
    assert.equal(db.listings.length, 0);
  }
});
