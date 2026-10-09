import assert from "node:assert/strict";
import test from "node:test";
import sharp from "sharp";
import { prisma } from "@gprn/db";
import {
  demoDigitalProducts,
  demoProductCovers,
  paletteFromPixels,
} from "@gprn/domain";
import { S3ObjectStorage } from "@gprn/storage";
import {
  createProductCover,
  decodeProductUpload,
  validateProductFile,
} from "./digital-product-assets.js";
import {
  DigitalProductsService,
  serializeDigitalProduct,
  type DigitalProductRecord,
} from "./digital-products.service.js";
import { ProfilesService } from "./profiles.service.js";
import { PlatformService } from "./platform.service.js";
import { demoProductFile } from "../scripts/seed-demo-digital-products.js";
import type { CurrentUser } from "./auth.service.js";
import type { LocationsService } from "./locations.service.js";

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
  profile: { displayName: "Author", tier: "PROFESSIONAL" },
} as CurrentUser;
const dataUrl = (buffer: Buffer) =>
  `data:application/octet-stream;base64,${buffer.toString("base64")}`;
const record = {
  id: "product",
  slug: "product",
  digitalKind: "LUT",
  title: "Forest",
  priceMinor: 1000n,
  currency: "USD",
  status: "PUBLISHED",
  description: null,
  previewAssetKey: "cover.webp",
  palette: ["#112233"],
  isDemo: false,
  sellerId: "seller",
  filesJson: [
    {
      id: "file",
      key: "private/file.cube",
      name: "Forest.cube",
      format: ".CUBE",
      size: 20,
    },
  ],
  seller: {
    id: "seller",
    userId: "author",
    status: "ACTIVE",
    user: {
      status: "ACTIVE",
      profile: {
        lutSalesEnabled: true,
        presetSalesEnabled: true,
        visibility: "PUBLIC",
        deletedAt: null,
      },
    },
  },
} as unknown as DigitalProductRecord;

test("catalog filters stock by real media type and only exposes approved public products", async () => {
  const find = prisma.marketplaceProduct.findMany;
  const count = prisma.marketplaceProduct.count;
  let options: unknown;
  prisma.marketplaceProduct.findMany = (async (args: unknown) => {
    options = args;
    return [];
  }) as typeof find;
  prisma.marketplaceProduct.count = (async () => 0) as typeof count;
  try {
    const service = new DigitalProductsService();
    for (const kind of ["PHOTO", "VIDEO", "PRESET", "LUT"] as const) {
      await service.catalog({ kind, genre: "portrait", page: "2" });
      const query = options as {
        where: { status: string; seller: unknown; AND: unknown[] };
        skip: number;
        take: number;
      };
      assert.equal(query.where.status, "PUBLISHED");
      assert.equal(query.skip, 24);
      assert.equal(query.take, 24);
      assert.match(JSON.stringify(query.where.seller), /PUBLIC/);
      assert.match(JSON.stringify(query.where.AND[1]), /portrait/);
      const choices = JSON.stringify(query.where.AND[0]);
      if (kind === "PHOTO" || kind === "VIDEO") {
        assert.match(choices, /APPROVED/);
        assert.match(choices, /PUBLIC/);
        assert.match(choices, /video\//);
        assert.equal(choices.includes('"NOT"'), kind === "PHOTO");
      } else {
        assert.match(choices, new RegExp(kind));
        assert.match(
          choices,
          new RegExp(kind === "LUT" ? "lutSalesEnabled" : "presetSalesEnabled"),
        );
      }
    }
  } finally {
    prisma.marketplaceProduct.findMany = find;
    prisma.marketplaceProduct.count = count;
  }
});

test("unverified wallet top-ups cannot mint funds", async () => {
  const original = prisma.$transaction;
  let writes = 0;
  prisma.$transaction = (async () => {
    writes++;
    throw new Error("Top-up must not write to the database");
  }) as typeof original;
  try {
    await assert.rejects(
      new PlatformService().topUp(actor, {
        amountMinor: 10000,
        method: "card",
      }),
      (error: unknown) => {
        assert.equal(
          (error as { getResponse(): { code: string } }).getResponse().code,
          "PAYMENT_PROVIDER_UNAVAILABLE",
        );
        return true;
      },
    );
    assert.equal(writes, 0);
  } finally {
    prisma.$transaction = original;
  }
});

test("all 34 demo cards are preserved with distinct cover sources and usable product files", () => {
  assert.equal(demoDigitalProducts.length, 34);
  assert.equal(new Set(demoDigitalProducts.map((offer) => offer.id)).size, 34);
  assert.equal(demoProductCovers.length, 34);
  assert.equal(
    new Set(demoProductCovers.map((cover) => cover.sourcePage)).size,
    34,
  );
  for (const cover of demoProductCovers) {
    assert.equal(
      demoDigitalProducts.find((offer) => offer.id === cover.productId)
        ?.imageUrl,
      cover.imageUrl,
    );
    assert.equal(new URL(cover.imageUrl).hostname, "picsum.photos");
    assert(cover.credit);
  }
  assert.equal(
    new Set(demoDigitalProducts.map((offer) => offer.imageUrl.split("?")[0]))
      .size,
    34,
  );
  for (const offer of demoDigitalProducts) {
    const file = demoProductFile(offer);
    assert.equal(
      validateProductFile(offer.kind, {
        name: file.name,
        dataUrl: dataUrl(file.buffer),
      }).buffer.length,
      file.buffer.length,
    );
  }
});

test("product uploads reject mixed types, renamed executables, broken LUT rows and unsafe XML", () => {
  const lut = demoProductFile(
    demoDigitalProducts.find((offer) => offer.kind === "LUT")!,
  );
  assert.throws(() =>
    validateProductFile("PRESET", {
      name: lut.name,
      dataUrl: dataUrl(lut.buffer),
    }),
  );
  assert.throws(() =>
    validateProductFile("LUT", {
      name: "renamed.cube",
      dataUrl: dataUrl(Buffer.from("MZ executable")),
    }),
  );
  assert.throws(() =>
    validateProductFile("LUT", {
      name: "broken.cube",
      dataUrl: dataUrl(Buffer.from("LUT_3D_SIZE 17\n0 0 0")),
    }),
  );
  assert.throws(() =>
    validateProductFile("PRESET", {
      name: "attack.xmp",
      dataUrl: dataUrl(
        Buffer.from(
          '<!DOCTYPE x [<!ENTITY exploit SYSTEM "file:///etc/passwd">]><rdf:RDF crs:Exposure="1" xmlns:crs="http://ns.adobe.com/camera-raw-settings/"/>',
        ),
      ),
    }),
  );
  assert.throws(() =>
    decodeProductUpload("data:application/octet-stream;base64,!!!!", 100),
  );
  assert.throws(() => decodeProductUpload(dataUrl(Buffer.alloc(101)), 100));
});

test("palettes represent actual image colors, not hardcoded four-color decorations", async () => {
  const pixels = new Uint8Array([
    ...Array.from({ length: 60 }, () => [200, 30, 50]).flat(),
    ...Array.from({ length: 30 }, () => [20, 170, 80]).flat(),
    ...Array.from({ length: 10 }, () => [30, 50, 210]).flat(),
  ]);
  assert.deepEqual(paletteFromPixels(pixels), [
    "#c81e32",
    "#14aa50",
    "#1e32d2",
  ]);
  const image = await sharp({
    create: { width: 240, height: 160, channels: 3, background: "#cc2233" },
  })
    .png()
    .toBuffer();
  const cover = await createProductCover(image);
  assert.equal(cover.palette.length, 1);
  assert(Math.abs(parseInt(cover.palette[0]!.slice(1, 3), 16) - 204) < 8);
  assert.equal((await sharp(cover.buffer).metadata()).format, "webp");
  const avif = await sharp(image).avif({ effort: 0 }).toBuffer();
  assert.equal(
    (await sharp((await createProductCover(avif)).buffer).metadata()).format,
    "webp",
  );
  await assert.rejects(createProductCover(Buffer.from("not an image")));
});

test("public product serialization never exposes private object keys", () => {
  const serialized = serializeDigitalProduct(
    record,
    new DigitalProductsService()["env"],
  );
  assert.equal(serialized.files[0]?.name, "Forest.cube");
  assert(!JSON.stringify(serialized).includes("private/file.cube"));
  assert.equal(serialized.priceMinor, 1000);
});

test("legacy photograph marketplace endpoints exclude digital products", async () => {
  const originalMany = prisma.marketplaceProduct.findMany;
  const originalFirst = prisma.marketplaceProduct.findFirst;
  const queries: { where: { digitalKind: unknown } }[] = [];
  prisma.marketplaceProduct.findMany = (async (query: {
    where: { digitalKind: unknown };
  }) => {
    queries.push(query);
    return [];
  }) as unknown as typeof originalMany;
  prisma.marketplaceProduct.findFirst = (async (query: {
    where: { digitalKind: unknown };
  }) => {
    queries.push(query);
    return null;
  }) as unknown as typeof originalFirst;
  try {
    const service = new PlatformService();
    await service.listMarketplace();
    await assert.rejects(
      service.updateMarketplaceListing(actor, "product", { active: true }),
    );
    await assert.rejects(service.buyMarketplaceProduct(actor, "product"));
    assert.equal(queries.length, 3);
    for (const query of queries) assert.equal(query.where.digitalKind, null);
  } finally {
    prisma.marketplaceProduct.findMany = originalMany;
    prisma.marketplaceProduct.findFirst = originalFirst;
  }
});

test("demo title translation never overrides a customized product name", () => {
  const demo = demoDigitalProducts[0]!;
  const env = new DigitalProductsService()["env"];
  const product = {
    ...record,
    slug: `demo-product-${demo.id}`,
    title: demo.title,
    isDemo: true,
  };
  assert.equal(serializeDigitalProduct(product, env).titleKey, demo.titleKey);
  assert.equal(
    serializeDigitalProduct({ ...product, title: "Custom name" }, env).titleKey,
    undefined,
  );
});

test("purchase history is scoped to completed orders of the signed-in buyer, including archived products", async () => {
  const original = prisma.marketplaceProduct.findMany;
  let query: unknown;
  prisma.marketplaceProduct.findMany = (async (input: unknown) => {
    query = input;
    return [{ ...record, status: "ARCHIVED" }];
  }) as unknown as typeof original;
  try {
    const result = await new DigitalProductsService().purchases({
      ...actor,
      id: "buyer",
    });
    assert.deepEqual((query as { where: unknown }).where, {
      digitalKind: { not: null },
      orderItems: {
        some: { order: { customerId: "buyer", status: "COMPLETED" } },
      },
    });
    assert.equal(result.products[0]?.owned, true);
    assert.equal(result.products[0]?.status, "ARCHIVED");
    assert(!JSON.stringify(result).includes("private/file.cube"));
  } finally {
    prisma.marketplaceProduct.findMany = original;
  }
});

test("profile checkboxes only toggle sections without requiring or creating an offer", async () => {
  const original = prisma.$transaction;
  let writes: Record<string, unknown> | undefined;
  const profile = {
    id: "profile",
    userId: actor.id,
    displayName: "Author",
    username: "author",
    presetSalesEnabled: false,
    lutSalesEnabled: false,
  };
  const tx = {
    profile: {
      findUniqueOrThrow: async () => profile,
      update: async ({ data }: { data: Record<string, unknown> }) => {
        writes = data;
        return { ...profile, ...data };
      },
    },
    auditLog: { create: async () => ({}) },
  };
  prisma.$transaction = (async (fn: (tx: unknown) => unknown) =>
    fn(tx)) as typeof original;
  try {
    await new ProfilesService({} as LocationsService).updateMine(actor, {
      presetSalesEnabled: true,
      lutSalesEnabled: true,
    });
    assert.equal(writes?.presetSalesEnabled, true);
    assert.equal(writes?.lutSalesEnabled, true);
    assert.equal(writes?.presetTitle, undefined);
    assert.equal(writes?.lutPriceMinor, undefined);
  } finally {
    prisma.$transaction = original;
  }
});

test("private downloads require ownership or a completed purchase; free and demo files are available", async () => {
  const originalFind = prisma.marketplaceProduct.findFirst;
  const originalOrder = prisma.marketplaceOrder.findFirst;
  const originalRead = S3ObjectStorage.prototype.readObject;
  let product = record;
  let completed = false;
  let reads = 0;
  prisma.marketplaceProduct.findFirst = (async () =>
    product) as unknown as typeof originalFind;
  prisma.marketplaceOrder.findFirst = (async () =>
    completed ? { id: "order" } : null) as typeof originalOrder;
  S3ObjectStorage.prototype.readObject = async () => {
    reads++;
    return Buffer.from("content");
  };
  const buyer = { ...actor, id: "buyer" };
  const service = new DigitalProductsService();
  try {
    await assert.rejects(
      service.download(buyer, product.id, "file"),
      (error: unknown) =>
        (error as { getStatus(): number }).getStatus() === 403,
    );
    assert.equal(reads, 0);
    await service.download(actor, product.id, "file");
    completed = true;
    product = { ...record, status: "ARCHIVED" };
    await service.download(buyer, product.id, "file");
    completed = false;
    await assert.rejects(service.download(buyer, product.id, "file"));
    product = { ...record, priceMinor: 0n };
    await service.download(buyer, product.id, "file");
    product = { ...record, isDemo: true };
    await service.download(buyer, product.id, "file");
    product = {
      ...product,
      seller: {
        ...product.seller,
        user: {
          ...product.seller.user,
          profile: { ...product.seller.user.profile!, lutSalesEnabled: false },
        },
      },
    };
    await assert.rejects(service.download(buyer, product.id, "file"));
    assert.equal(reads, 4);
  } finally {
    prisma.marketplaceProduct.findFirst = originalFind;
    prisma.marketplaceOrder.findFirst = originalOrder;
    S3ObjectStorage.prototype.readObject = originalRead;
  }
});

test("purchase uses a guarded server debit and reuses completed orders without double charging", async () => {
  const original = prisma.$transaction;
  const writes: unknown[] = [];
  let prior = false;
  let funded = true;
  const tx = {
    $executeRaw: async () => 0,
    marketplaceProduct: {
      findFirst: async () => record,
      update: async () => ({}),
    },
    marketplaceOrder: {
      findFirst: async () => (prior ? { id: "order" } : null),
      create: async () => {
        writes.push("order");
        return { id: "order" };
      },
    },
    wallet: {
      upsert: async ({ where }: { where: { userId: string } }) => ({
        id: where.userId,
        currency: "USD",
      }),
      updateMany: async (input: unknown) => {
        writes.push(input);
        return { count: funded ? 1 : 0 };
      },
      update: async () => ({}),
    },
    walletTransaction: {
      createMany: async (input: unknown) => {
        writes.push(input);
      },
    },
    payment: { create: async () => ({}) },
    sellerProfile: { update: async () => ({}) },
  };
  prisma.$transaction = (async (fn: (tx: unknown) => unknown) =>
    fn(tx)) as typeof original;
  const service = new DigitalProductsService();
  const buyer = { ...actor, id: "buyer" };
  try {
    await service.purchase(buyer, record.id);
    assert.equal(writes.length, 3);
    assert.deepEqual(writes[0], {
      data: { balanceMinor: { decrement: 1000n } },
      where: { id: "buyer", balanceMinor: { gte: 1000n } },
    });
    prior = true;
    await service.purchase(buyer, record.id);
    assert.equal(writes.length, 3);
    prior = false;
    funded = false;
    await assert.rejects(
      service.purchase(buyer, record.id),
      (error: unknown) =>
        (error as { getResponse(): { code: string } }).getResponse().code ===
        "INSUFFICIENT_FUNDS",
    );
    assert.equal(writes.filter((item) => item === "order").length, 1);
  } finally {
    prisma.$transaction = original;
  }
});

test("a card is saved only with actual private files and a cover; failed saves clean newly uploaded objects", async () => {
  const originals = {
    transaction: prisma.$transaction,
    profile: prisma.profile.findUnique,
    find: prisma.marketplaceProduct.findFirst,
    put: S3ObjectStorage.prototype.putObject,
    remove: S3ObjectStorage.prototype.deleteObject,
  };
  const uploaded: { bucket: string; key: string }[] = [];
  const removed: { bucket: string; key: string }[] = [];
  let enabled = true;
  let fail = false;
  let persisted = 0;
  const tx = {
    $executeRaw: async () => 0,
    sellerProfile: { upsert: async () => ({ id: "seller" }) },
    auditLog: { create: async () => ({}) },
    marketplaceProduct: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        if (fail) throw new Error("Simulated DB failure");
        persisted++;
        return {
          ...record,
          ...data,
          priceMinor: BigInt(Number(data.priceMinor)),
        };
      },
    },
  };
  prisma.$transaction = (async (fn: (tx: unknown) => unknown) =>
    fn(tx)) as typeof originals.transaction;
  prisma.profile.findUnique = (async () => ({
    presetSalesEnabled: enabled,
    lutSalesEnabled: enabled,
  })) as unknown as typeof originals.profile;
  prisma.marketplaceProduct.findFirst = (async () =>
    null) as unknown as typeof originals.find;
  S3ObjectStorage.prototype.putObject = async ({ bucket, key }) => {
    uploaded.push({ bucket, key });
  };
  S3ObjectStorage.prototype.deleteObject = async (bucket, key) => {
    removed.push({ bucket, key });
  };
  const image = await sharp({
    create: { width: 240, height: 160, channels: 3, background: "#cc2233" },
  })
    .png()
    .toBuffer();
  const file = demoProductFile(demoDigitalProducts[0]!);
  const input = {
    kind: "PRESET",
    title: "My collection",
    description: "My real file",
    priceMinor: 2500,
    active: true,
    coverDataUrl: dataUrl(image),
    keepFileIds: [],
    files: [{ name: file.name, dataUrl: dataUrl(file.buffer) }],
  };
  const service = new DigitalProductsService();
  try {
    await assert.rejects(service.save(actor, { ...input, files: [] }));
    enabled = false;
    await assert.rejects(service.save(actor, input));
    enabled = true;
    await assert.rejects(service.save(actor, input, "someone-elses-product"));
    assert.equal(uploaded.length, 0);
    const response = await service.save(actor, input);
    assert.equal(response.product.title, "My collection");
    assert.equal(response.product.files.length, 1);
    assert.equal(response.product.colors.length, 1);
    assert.deepEqual(
      uploaded.map((object) => object.bucket),
      ["private", "public"],
    );
    assert.equal(removed.length, 0);
    fail = true;
    await assert.rejects(service.save(actor, input));
    assert.deepEqual(removed, uploaded.slice(2));
    assert.equal(persisted, 1);
  } finally {
    prisma.$transaction = originals.transaction;
    prisma.profile.findUnique = originals.profile;
    prisma.marketplaceProduct.findFirst = originals.find;
    S3ObjectStorage.prototype.putObject = originals.put;
    S3ObjectStorage.prototype.deleteObject = originals.remove;
  }
});
