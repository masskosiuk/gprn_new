import assert from "node:assert/strict";
import test from "node:test";
import { prisma } from "@gprn/db";
import { S3ObjectStorage } from "@gprn/storage";
import { PhotoCommerceService } from "./photo-commerce.service.js";
import { serializePhotoSale } from "./photo-sale.js";
import { DigitalProductsService } from "./digital-products.service.js";
import type { CurrentUser } from "./auth.service.js";

Object.assign(process.env, {
  NODE_ENV: "test",
  APP_ENV: "local",
  APP_URL: "https://site.invalid",
  API_URL: "https://api.invalid",
  DATABASE_URL: "postgresql://test:test@127.0.0.1:1/test",
  REDIS_URL: "redis://127.0.0.1:1",
  S3_ENDPOINT: "https://storage.invalid",
  S3_REGION: "test",
  S3_ACCESS_KEY: "test",
  S3_SECRET_KEY: "test",
  S3_BUCKET_PUBLIC: "public",
  S3_BUCKET_PRIVATE: "private",
  ENCRYPTION_KEY: "test",
  SESSION_SECRET: "test",
});
const actor = {
  id: "author",
  profile: { tier: "PROFESSIONAL" },
} as CurrentUser;
const buyer = { id: "buyer" } as CurrentUser;
const terms = "Personal use only; no redistribution.";
const fixture = () => ({
  id: "photo",
  ownerId: "author",
  title: "Morning",
  categoryId: "landscape",
  status: "PUBLISHED",
  moderationStatus: "APPROVED",
  visibility: "PUBLIC",
  deletedAt: null,
  appliedProductId: null,
  owner: {
    status: "ACTIVE",
    profile: {
      visibility: "PUBLIC",
      deletedAt: null,
      displayName: "Author",
      username: "author",
      presetSalesEnabled: true,
      lutSalesEnabled: true,
    },
  },
  provenance: { originType: "DIRECT_UPLOAD" },
  assets: [
    {
      type: "ORIGINAL",
      deletedAt: null,
      storageVisibility: "PRIVATE",
      bucket: "private",
      storageKey: "photos/original/work.jpg",
    },
  ],
  marketplaceProduct: {
    id: "product",
    sellerId: "seller",
    priceMinor: 2500n,
    currency: "USD",
    status: "PUBLISHED",
    digitalKind: null,
    isDemo: false,
    filesJson: { licenseTerms: terms },
    seller: {
      status: "ACTIVE",
      user: {
        status: "ACTIVE",
        profile: { visibility: "PUBLIC", deletedAt: null },
      },
    },
  },
});
async function mocked(
  run: (photo: any, tx: any, writes: any[]) => Promise<void>,
) {
  const photo: any = fixture();
  const writes: any[] = [];
  const restore: (() => void)[] = [];
  const stub = (object: any, key: string, value: any) => {
    const before = object[key];
    object[key] = value;
    restore.push(() => (object[key] = before));
  };
  const tx: any = {
    $executeRaw: async () => 1,
    photo: {
      findUnique: async () => photo,
      update: async ({ data }: any) => Object.assign(photo, data),
    },
    marketplaceProduct: {
      findFirst: async () => null,
      upsert: async ({ update }: any) => {
        writes.push(update);
        Object.assign(photo.marketplaceProduct, update);
        return photo.marketplaceProduct;
      },
      updateMany: async ({ data }: any) => {
        Object.assign(photo.marketplaceProduct, data);
        return { count: 1 };
      },
      update: async () => ({}),
    },
    sellerProfile: {
      upsert: async () => ({ id: "seller", status: "ACTIVE" }),
      update: async () => ({}),
    },
    auditLog: { create: async () => ({}) },
    marketplaceOrder: {
      findFirst: async () => null,
      create: async ({ data }: any) => {
        writes.push(data);
        return { id: "order" };
      },
    },
    wallet: {
      upsert: async ({ where }: any) => ({ id: where.userId, currency: "USD" }),
      updateMany: async () => ({ count: 1 }),
      update: async () => ({}),
    },
    walletTransaction: {
      createMany: async ({ data }: any) => {
        writes.push(data);
      },
    },
    payment: { create: async () => ({}) },
    notification: { create: async () => ({}) },
  };
  stub(prisma, "$transaction", async (run: any) => run(tx));
  stub(prisma.photo, "findUnique", async () => photo);
  stub(prisma.marketplaceProduct, "findFirst", async () => ({
    photoId: "photo",
  }));
  stub(prisma.marketplaceProduct, "findMany", async () => []);
  stub(prisma.marketplaceOrderItem, "findFirst", async () => null);
  try {
    await run(photo, tx, writes);
  } finally {
    restore.reverse().forEach((fn) => fn());
  }
}
const code = (expected: string) => (error: any) =>
  error.getResponse().code === expected;
const quote = { accepted: true, priceMinor: 2500, licenseTerms: terms };

test("prices appear only on explicit public approved real listings with usage terms", () => {
  assert.deepEqual(serializePhotoSale(fixture()), {
    id: "product",
    priceMinor: 2500,
    currency: "USD",
  });
  for (const patch of [
    { status: "HIDDEN" },
    { isDemo: true },
    { filesJson: {} },
    { digitalKind: "PRESET" },
  ]) {
    const photo = fixture();
    Object.assign(photo.marketplaceProduct, patch);
    assert.equal(serializePhotoSale(photo), null);
  }
  for (const patch of [
    { visibility: "PRIVATE" },
    { status: "READY" },
    { moderationStatus: "REJECTED" },
    { deletedAt: new Date() },
  ]) {
    const photo = fixture();
    Object.assign(photo, patch);
    assert.equal(serializePhotoSale(photo), null);
  }
});
test("listing persists author price and terms and disabling sales does not touch orders", async () =>
  mocked(async (photo, tx, writes) => {
    const service = new PhotoCommerceService();
    const result = await service.save(actor, "photo", {
      enabled: true,
      priceMinor: 3450,
      licenseTerms: terms,
      rightsConfirmed: true,
      appliedProductId: null,
    });
    assert.equal(result.sale?.priceMinor, 3450);
    assert.equal(writes[0].priceMinor, 3450n);
    assert.equal(writes[0].filesJson.licenseTerms, terms);
    tx.marketplaceOrder.create = () =>
      assert.fail("Changing settings must not create orders");
    const hidden = await service.save(actor, "photo", { enabled: false });
    assert.equal(hidden.sale, null);
    assert.equal(photo.marketplaceProduct.status, "HIDDEN");
  }));
test("another user cannot change sales or attach a preset", async () =>
  mocked(async () => {
    await assert.rejects(
      new PhotoCommerceService().save(buyer, "photo", {
        enabled: false,
        appliedProductId: "foreign",
      }),
      code("PHOTO_FORBIDDEN"),
    );
  }));
test("stock demos, missing originals and private or unapproved works cannot be listed", async () => {
  for (const patch of [
    { assets: [] },
    { provenance: { originType: "STOCK_DEMO" } },
    { visibility: "PRIVATE" },
    { moderationStatus: "PENDING" },
  ])
    await mocked(async (photo) => {
      Object.assign(photo, patch);
      await assert.rejects(
        new PhotoCommerceService().save(actor, "photo", {
          enabled: true,
          priceMinor: 100,
          licenseTerms: terms,
          rightsConfirmed: true,
        }),
        code("SALE_ORIGINAL_REQUIRED"),
      );
    });
});
test("invalid prices, short terms and missing rights confirmation are rejected before writes", async () =>
  mocked(async (_photo, _tx, writes) => {
    for (const patch of [
      { priceMinor: 0 },
      { priceMinor: 1.5 },
      { priceMinor: 1000001 },
      { licenseTerms: "" },
      { rightsConfirmed: false },
    ])
      await assert.rejects(
        new PhotoCommerceService().save(actor, "photo", {
          enabled: true,
          priceMinor: 100,
          licenseTerms: terms,
          rightsConfirmed: true,
          ...patch,
        }),
        code("SALE_SETTINGS_INVALID"),
      );
    assert.equal(writes.length, 0);
  }));
test("a work can only link an actual available product owned by its author", async () =>
  mocked(async (photo, tx) => {
    const service = new PhotoCommerceService();
    await assert.rejects(
      service.save(actor, "photo", {
        enabled: false,
        appliedProductId: "foreign",
      }),
      code("APPLIED_PRODUCT_INVALID"),
    );
    tx.marketplaceProduct.findFirst = async ({ where }: any) => {
      assert.equal(where.seller.userId, actor.id);
      assert.equal(where.status, "PUBLISHED");
      return {
        id: "preset",
        digitalKind: "PRESET",
        filesJson: [
          {
            id: "file",
            key: "private/preset",
            name: "preset.xmp",
            size: 10,
            format: ".XMP",
          },
        ],
      };
    };
    await service.save(actor, "photo", {
      enabled: false,
      appliedProductId: "preset",
    });
    assert.equal(photo.appliedProductId, "preset");
  }));
test("checkout snapshots terms and price and uses a conditional wallet debit", async () =>
  mocked(async (_photo, tx, writes) => {
    tx.wallet.updateMany = async ({ where, data }: any) => {
      assert.equal(where.balanceMinor.gte, 2500n);
      assert.equal(data.balanceMinor.decrement, 2500n);
      return { count: 1 };
    };
    assert.deepEqual(
      await new PhotoCommerceService().purchase(buyer, "product", quote),
      { orderId: "order" },
    );
    assert.equal(writes[0].items.create.licenseTerms, terms);
    assert.equal(writes[0].items.create.priceMinor, 2500n);
    assert.equal(writes[1][0].amountMinor, -2500n);
    assert.equal(writes[1][1].amountMinor, 2500n);
  }));
test("repeat checkout returns the existing order without a second debit", async () =>
  mocked(async (_photo, tx, writes) => {
    tx.marketplaceOrder.findFirst = async () => ({ id: "prior" });
    tx.wallet.upsert = () =>
      assert.fail("Repeat checkout must not touch wallets");
    assert.deepEqual(
      await new PhotoCommerceService().purchase(buyer, "product", quote),
      { orderId: "prior" },
    );
    assert.equal(writes.length, 0);
  }));
test("price or terms changes, self purchase and insufficient balance never create an order", async () =>
  mocked(async (_photo, tx, writes) => {
    const service = new PhotoCommerceService();
    await assert.rejects(
      service.purchase(buyer, "product", { ...quote, priceMinor: 1 }),
      code("SALE_QUOTE_CHANGED"),
    );
    await assert.rejects(
      service.purchase(buyer, "product", { ...quote, licenseTerms: "changed" }),
      code("SALE_QUOTE_CHANGED"),
    );
    await assert.rejects(
      service.purchase(actor, "product", quote),
      code("SELF_PURCHASE"),
    );
    tx.wallet.updateMany = async () => ({ count: 0 });
    await assert.rejects(
      service.purchase(buyer, "product", quote),
      code("INSUFFICIENT_FUNDS"),
    );
    assert.equal(writes.length, 0);
  }));
test("unlisted work cannot be bought and a private work cannot be inspected by a guest", async () =>
  mocked(async (photo) => {
    photo.visibility = "PRIVATE";
    await assert.rejects(
      new PhotoCommerceService().purchase(buyer, "product", quote),
      code("PRODUCT_NOT_FOUND"),
    );
    await assert.rejects(
      new PhotoCommerceService().get("photo", null),
      code("PHOTO_NOT_FOUND"),
    );
  }));
test("originals require a completed purchase and remain downloadable after unlisting", async () =>
  mocked(async (photo) => {
    const service = new PhotoCommerceService();
    await assert.rejects(
      service.download(buyer, "photo"),
      code("PRODUCT_PURCHASE_REQUIRED"),
    );
    const before = prisma.marketplaceOrderItem.findFirst;
    const read = S3ObjectStorage.prototype.readObject;
    prisma.marketplaceOrderItem.findFirst = (async () => ({
      licenseTerms: terms,
    })) as any;
    S3ObjectStorage.prototype.readObject = async (bucket, key) => {
      assert.equal(bucket, "private");
      assert.equal(key, "photos/original/work.jpg");
      return Buffer.from("original");
    };
    try {
      photo.marketplaceProduct.status = "HIDDEN";
      assert.equal(
        (await service.download(buyer, "photo")).buffer.toString(),
        "original",
      );
      assert.equal((await service.get("photo", buyer)).owned, true);
    } finally {
      prisma.marketplaceOrderItem.findFirst = before;
      S3ObjectStorage.prototype.readObject = read;
    }
  }));
test("catalog validates price bounds and sorts using server price, not local demo data", async () => {
  const find = prisma.marketplaceProduct.findMany;
  const count = prisma.marketplaceProduct.count;
  prisma.marketplaceProduct.findMany = (async (query: any) => {
    assert.equal(query.where.priceMinor.gte, 1000n);
    assert.equal(query.where.priceMinor.lte, 5000n);
    assert.equal(query.orderBy[0].priceMinor, "asc");
    assert.match(JSON.stringify(query.where.AND[0]), /DIRECT_UPLOAD/);
    return [];
  }) as any;
  prisma.marketplaceProduct.count = (async () => 0) as any;
  try {
    const service = new DigitalProductsService();
    await service.catalog({
      kind: "MEDIA",
      minPrice: "1000",
      maxPrice: "5000",
      sort: "price-asc",
    });
    for (const query of [
      { minPrice: "-1" },
      { maxPrice: "1.2" },
      { minPrice: "200", maxPrice: "100" },
      { sort: "random" },
    ])
      await assert.rejects(service.catalog(query));
  } finally {
    prisma.marketplaceProduct.findMany = find;
    prisma.marketplaceProduct.count = count;
  }
});
