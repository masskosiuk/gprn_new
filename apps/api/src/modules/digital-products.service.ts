import { loadRuntimeEnv } from "@gprn/config";
import { prisma, type Prisma } from "@gprn/db";
import { S3ObjectStorage } from "@gprn/storage";
import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { demoDigitalProducts } from "@gprn/domain";
import type { CurrentUser } from "./auth.service.js";
import { asRecord, requiredString } from "./validation.js";
import { publicAssetUrl } from "./serialization.js";
import { mediaAssetResponse } from "./serialization.js";
import { mediaCatalogFilter } from "./media-catalog.js";
import { boundedText, requireUuid } from "./community-policy.js";
import {
  createProductCover,
  decodeProductUpload,
  invalidProduct,
  productInclude,
  readProductFiles,
  validateProductFile,
  type DigitalKind,
  type ProductFile,
} from "./digital-product-assets.js";

export type DigitalProductRecord = Prisma.MarketplaceProductGetPayload<{
  include: typeof productInclude;
}>;

export function serializeDigitalProduct(
  product: DigitalProductRecord,
  env: ReturnType<typeof loadRuntimeEnv>,
) {
  const files = readProductFiles(product.filesJson);
  const demo = product.isDemo
    ? demoDigitalProducts.find(
        (offer) => product.slug === `demo-product-${offer.id}`,
      )
    : undefined;
  return {
    id: product.id,
    kind: product.digitalKind,
    genre: product.genre,
    seller: {
      username: product.seller.user.profile?.username,
      displayName:
        product.seller.user.profile?.displayName ?? product.seller.displayName,
    },
    title: product.title,
    titleKey: demo?.title === product.title ? demo.titleKey : undefined,
    description: product.description,
    priceMinor: Number(product.priceMinor),
    imageUrl: product.previewAssetKey
      ? publicAssetUrl(env, product.previewAssetKey)
      : null,
    colors: product.palette,
    status: product.status,
    isDemo: product.isDemo,
    files: files.map(({ id, name, format, size }) => ({
      id,
      name,
      format,
      size,
    })),
  };
}

@Injectable()
export class DigitalProductsService {
  private readonly env = loadRuntimeEnv();
  private readonly storage = new S3ObjectStorage({
    accessKeyId: this.env.S3_ACCESS_KEY,
    secretAccessKey: this.env.S3_SECRET_KEY,
    endpoint: this.env.S3_ENDPOINT,
    region: this.env.S3_REGION,
    forcePathStyle: this.env.S3_FORCE_PATH_STYLE,
  });

  async catalog(query: Record<string, string | undefined>) {
    if (query.id) requireUuid(query.id);
    const kind = query.kind ?? "ALL";
    if (!["ALL", "PHOTO", "VIDEO", "PRESET", "LUT"].includes(kind))
      invalidProduct("PRODUCT_KIND_INVALID");
    const page = Number(query.page ?? 1);
    if (!Number.isInteger(page) || page < 1 || page > 10000)
      invalidProduct("INVALID_PAGE");
    const stock: Prisma.MarketplaceProductWhereInput = {
      digitalKind: null,
      photo: {
        deletedAt: null,
        status: "PUBLISHED",
        moderationStatus: "APPROVED",
        visibility: "PUBLIC",
        ...mediaCatalogFilter(
          kind === "PHOTO" || kind === "VIDEO" ? kind : undefined,
        ),
      },
    };
    const preset: Prisma.MarketplaceProductWhereInput = {
      digitalKind: "PRESET",
      seller: { user: { profile: { presetSalesEnabled: true } } },
    };
    const lut: Prisma.MarketplaceProductWhereInput = {
      digitalKind: "LUT",
      seller: { user: { profile: { lutSalesEnabled: true } } },
    };
    const choices =
      kind === "PRESET"
        ? [preset]
        : kind === "LUT"
          ? [lut]
          : kind === "ALL"
            ? [stock, preset, lut]
            : [stock];
    const where: Prisma.MarketplaceProductWhereInput = {
      ...(query.id ? { id: query.id } : {}),
      status: "PUBLISHED",
      seller: {
        status: "ACTIVE",
        user: {
          status: "ACTIVE",
          profile: { visibility: "PUBLIC", deletedAt: null },
        },
      },
      AND: [
        { OR: choices },
        ...(query.genre
          ? [
              {
                OR: [
                  { genre: boundedText(query.genre, 100) },
                  { category: { slug: query.genre } },
                ],
              },
            ]
          : []),
        ...(query.search
          ? [
              {
                title: {
                  contains: boundedText(query.search, 180),
                  mode: "insensitive" as const,
                },
              },
            ]
          : []),
      ],
    };
    const [products, total] = await Promise.all([
      prisma.marketplaceProduct.findMany({
        where,
        include: {
          ...productInclude,
          category: true,
          photo: { include: { assets: true } },
        },
        take: 24,
        skip: (page - 1) * 24,
        orderBy: [{ createdAt: "desc" }, { id: "asc" }],
      }),
      prisma.marketplaceProduct.count({ where }),
    ]);
    return {
      products: products.map((product) => {
        if (product.digitalKind)
          return serializeDigitalProduct(product, this.env);
        const media = mediaAssetResponse(this.env, product.photo?.assets ?? []);
        return {
          id: product.id,
          kind: media.mediaType,
          title: product.title,
          description: product.description,
          priceMinor: Number(product.priceMinor),
          currency: product.currency,
          genre: product.category?.slug ?? product.genre,
          imageUrl: media.thumbnailUrl ?? media.displayUrl,
          videoUrl: media.videoUrl,
          photoId: product.photoId,
          seller: {
            username: product.seller.user.profile?.username,
            displayName:
              product.seller.user.profile?.displayName ??
              product.seller.displayName,
          },
        };
      }),
      total,
      page,
    };
  }

  async demo(author: string) {
    const slugs = demoDigitalProducts
      .filter((offer) => offer.author === author)
      .map((offer) => `demo-product-${offer.id}`);
    const products = await prisma.marketplaceProduct.findMany({
      include: productInclude,
      orderBy: { createdAt: "asc" },
      where: {
        isDemo: true,
        slug: { in: slugs },
        status: "PUBLISHED",
        seller: {
          status: "ACTIVE",
          user: {
            status: "ACTIVE",
            profile: { visibility: "PUBLIC", deletedAt: null },
          },
        },
      },
    });
    return {
      products: products
        .filter((product) =>
          product.digitalKind === "LUT"
            ? product.seller.user.profile?.lutSalesEnabled
            : product.seller.user.profile?.presetSalesEnabled,
        )
        .map((product) => serializeDigitalProduct(product, this.env)),
    };
  }

  async purchases(user: CurrentUser) {
    const products = await prisma.marketplaceProduct.findMany({
      include: productInclude,
      orderBy: { createdAt: "desc" },
      where: {
        digitalKind: { not: null },
        orderItems: {
          some: { order: { customerId: user.id, status: "COMPLETED" } },
        },
      },
    });
    return {
      products: products.map((product) => ({
        ...serializeDigitalProduct(product, this.env),
        owned: true,
      })),
    };
  }

  async save(user: CurrentUser, body: unknown, productId?: string) {
    if (!user.profile || user.profile.tier === "VIEWER")
      throw new ForbiddenException({ code: "PHOTOGRAPHER_ONLY" });
    const record = asRecord(body);
    const existing = productId
      ? await prisma.marketplaceProduct.findFirst({
          include: productInclude,
          where: {
            id: productId,
            digitalKind: { not: null },
            seller: { userId: user.id },
          },
        })
      : null;
    if (productId && !existing)
      throw new NotFoundException({ code: "PRODUCT_NOT_FOUND" });
    const kind = existing?.digitalKind ?? record.kind;
    if (kind !== "PRESET" && kind !== "LUT") invalidProduct();
    const profile = await prisma.profile.findUnique({
      where: { userId: user.id },
    });
    if (
      !(kind === "LUT" ? profile?.lutSalesEnabled : profile?.presetSalesEnabled)
    )
      throw new ConflictException({ code: "PRODUCT_SECTION_DISABLED" });
    const title = requiredString(record, "title").trim();
    const description =
      typeof record.description === "string" ? record.description.trim() : "";
    if (
      !title ||
      title.length > 140 ||
      description.length > 2000 ||
      !Number.isSafeInteger(record.priceMinor) ||
      Number(record.priceMinor) < 0 ||
      Number(record.priceMinor) > 1_000_000 ||
      typeof record.active !== "boolean"
    )
      invalidProduct();
    const oldFiles = readProductFiles(existing?.filesJson);
    const keepIds = record.keepFileIds;
    if (
      !Array.isArray(keepIds) ||
      keepIds.some(
        (id) =>
          typeof id !== "string" || !oldFiles.some((file) => file.id === id),
      )
    )
      invalidProduct();
    const files: ProductFile[] = oldFiles.filter((file) =>
      keepIds.includes(file.id),
    );
    if (
      !Array.isArray(record.files) ||
      files.length + record.files.length > 20 ||
      files.length + record.files.length < 1
    )
      invalidProduct("PRODUCT_FILES_REQUIRED");
    const uploads = record.files.map((file) =>
      validateProductFile(kind as DigitalKind, file),
    );
    if (
      uploads.reduce((size, file) => size + file.buffer.length, 0) +
        files.reduce((size, file) => size + file.size, 0) >
      12 * 1024 * 1024
    )
      invalidProduct("PRODUCT_FILES_TOO_LARGE");
    const cover = record.coverDataUrl
      ? await createProductCover(
          decodeProductUpload(record.coverDataUrl, 5 * 1024 * 1024),
        )
      : null;
    if (!cover && !existing?.previewAssetKey)
      invalidProduct("PRODUCT_COVER_REQUIRED");
    const id = existing?.id ?? randomUUID();
    const uploaded: { bucket: string; key: string }[] = [];
    let saved: DigitalProductRecord;
    try {
      for (const upload of uploads) {
        const fileId = randomUUID();
        const key = `products/${user.id}/${id}/${fileId}${upload.format.toLowerCase()}`;
        uploaded.push({ bucket: this.env.S3_BUCKET_PRIVATE, key });
        await this.storage.putObject({
          body: upload.buffer,
          bucket: this.env.S3_BUCKET_PRIVATE,
          contentType: "application/octet-stream",
          key,
        });
        files.push({
          id: fileId,
          key,
          name: upload.name,
          format: upload.format,
          size: upload.buffer.length,
        });
      }
      const previewAssetKey = cover
        ? `products/${user.id}/${id}/cover-${randomUUID()}.webp`
        : existing!.previewAssetKey!;
      if (cover) {
        uploaded.push({
          bucket: this.env.S3_BUCKET_PUBLIC,
          key: previewAssetKey,
        });
        await this.storage.putObject({
          body: cover.buffer,
          bucket: this.env.S3_BUCKET_PUBLIC,
          contentType: "image/webp",
          key: previewAssetKey,
        });
      }
      saved = await prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`digital-product:${id}`}))`;
        if (existing) {
          const latest = await tx.marketplaceProduct.findUnique({
            where: { id },
          });
          if (latest?.updatedAt.getTime() !== existing.updatedAt.getTime())
            throw new ConflictException({ code: "PRODUCT_CHANGED" });
        }
        const seller = await tx.sellerProfile.upsert({
          create: {
            userId: user.id,
            displayName: user.profile!.displayName,
            status: "ACTIVE",
          },
          update: { displayName: user.profile!.displayName, status: "ACTIVE" },
          where: { userId: user.id },
        });
        const data = {
          title,
          genre:
            typeof record.genre === "string"
              ? boundedText(record.genre.trim(), 100) || null
              : (existing?.genre ?? null),
          description,
          priceMinor: Number(record.priceMinor),
          status: record.active ? ("PUBLISHED" as const) : ("HIDDEN" as const),
          previewAssetKey,
          palette: cover?.palette ?? existing!.palette,
          filesJson: files as unknown as Prisma.InputJsonValue,
        };
        const product = existing
          ? await tx.marketplaceProduct.update({
              data,
              include: productInclude,
              where: { id },
            })
          : await tx.marketplaceProduct.create({
              data: {
                ...data,
                id,
                slug: `digital-${id}`,
                digitalKind: kind,
                currency: "USD",
                sellerId: seller.id,
              },
              include: productInclude,
            });
        await tx.auditLog.create({
          data: {
            actorUserId: user.id,
            action: existing
              ? "digital_product_updated"
              : "digital_product_created",
            targetType: "marketplace_product",
            targetId: id,
            next: {
              title,
              kind,
              fileCount: files.length,
              priceMinor: Number(record.priceMinor),
              status: data.status,
            },
          },
        });
        return product;
      });
    } catch (error) {
      await Promise.allSettled(
        uploaded.map((object) =>
          this.storage.deleteObject(object.bucket, object.key),
        ),
      );
      throw error;
    }
    const obsolete = oldFiles
      .filter((file) => !files.some((kept) => kept.id === file.id))
      .map((file) => ({ bucket: this.env.S3_BUCKET_PRIVATE, key: file.key }));
    if (cover && existing?.previewAssetKey)
      obsolete.push({
        bucket: this.env.S3_BUCKET_PUBLIC,
        key: existing.previewAssetKey,
      });
    await Promise.allSettled(
      obsolete.map((object) =>
        this.storage.deleteObject(object.bucket, object.key),
      ),
    );
    return { product: serializeDigitalProduct(saved, this.env) };
  }

  async archive(user: CurrentUser, productId: string) {
    const result = await prisma.marketplaceProduct.updateMany({
      data: { status: "ARCHIVED" },
      where: {
        id: productId,
        digitalKind: { not: null },
        seller: { userId: user.id },
      },
    });
    if (!result.count)
      throw new NotFoundException({ code: "PRODUCT_NOT_FOUND" });
    // Purchased files remain available to existing customers after archival.
    return { archived: true };
  }

  async purchase(user: CurrentUser, productId: string) {
    const order = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`digital-product:${productId}`}))`;
      const product = await tx.marketplaceProduct.findFirst({
        include: productInclude,
        where: { id: productId, digitalKind: { not: null } },
      });
      if (!product) throw new NotFoundException({ code: "PRODUCT_NOT_FOUND" });
      if (product.isDemo)
        throw new ConflictException({ code: "DEMO_PRODUCT_NOT_FOR_SALE" });
      const prior = await tx.marketplaceOrder.findFirst({
        where: {
          customerId: user.id,
          status: "COMPLETED",
          items: { some: { productId } },
        },
      });
      if (prior) return prior;
      const enabled =
        product.digitalKind === "LUT"
          ? product.seller.user.profile?.lutSalesEnabled
          : product.seller.user.profile?.presetSalesEnabled;
      if (
        product.status !== "PUBLISHED" ||
        !enabled ||
        product.seller.status !== "ACTIVE" ||
        product.seller.user.status !== "ACTIVE" ||
        product.seller.user.profile?.visibility !== "PUBLIC" ||
        product.seller.user.profile.deletedAt
      )
        throw new NotFoundException({ code: "PRODUCT_NOT_FOUND" });
      if (product.seller.userId === user.id)
        throw new ConflictException({ code: "SELF_PURCHASE" });
      if (!readProductFiles(product.filesJson).length)
        invalidProduct("PRODUCT_FILES_REQUIRED");
      for (const owner of [user.id, product.seller.userId].sort())
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`wallet:${owner}`}))`;
      const buyer = await tx.wallet.upsert({
        create: { userId: user.id, currency: "USD" },
        update: {},
        where: { userId: user.id },
      });
      const seller = await tx.wallet.upsert({
        create: { userId: product.seller.userId, currency: "USD" },
        update: {},
        where: { userId: product.seller.userId },
      });
      if (
        buyer.currency !== product.currency ||
        seller.currency !== product.currency
      )
        throw new ConflictException({ code: "CURRENCY_MISMATCH" });
      const debited = await tx.wallet.updateMany({
        data: { balanceMinor: { decrement: product.priceMinor } },
        where: { id: buyer.id, balanceMinor: { gte: product.priceMinor } },
      });
      if (!debited.count)
        throw new ConflictException({ code: "INSUFFICIENT_FUNDS" });
      const saved = await tx.marketplaceOrder.create({
        data: {
          customerId: user.id,
          currency: product.currency,
          subtotalMinor: product.priceMinor,
          status: "COMPLETED",
          items: {
            create: {
              productId,
              currency: product.currency,
              priceMinor: product.priceMinor,
            },
          },
        },
      });
      if (product.priceMinor > 0n) {
        await tx.wallet.update({
          data: { balanceMinor: { increment: product.priceMinor } },
          where: { id: seller.id },
        });
        await tx.walletTransaction.createMany({
          data: [
            {
              walletId: buyer.id,
              currency: product.currency,
              amountMinor: -product.priceMinor,
              type: "PURCHASE",
              referenceType: "marketplace_order",
              referenceId: saved.id,
            },
            {
              walletId: seller.id,
              currency: product.currency,
              amountMinor: product.priceMinor,
              type: "SALE",
              referenceType: "marketplace_order",
              referenceId: saved.id,
            },
          ],
        });
        await tx.payment.create({
          data: {
            marketplaceOrderId: saved.id,
            amountMinor: product.priceMinor,
            currency: product.currency,
            provider: "wallet",
            providerPaymentId: saved.id,
            status: "SUCCEEDED",
          },
        });
      }
      await tx.marketplaceProduct.update({
        data: { salesCount: { increment: 1 } },
        where: { id: productId },
      });
      await tx.sellerProfile.update({
        data: { salesCount: { increment: 1 } },
        where: { id: product.sellerId },
      });
      return saved;
    });
    return { orderId: order.id };
  }

  async download(user: CurrentUser, productId: string, fileId: string) {
    const product = await prisma.marketplaceProduct.findFirst({
      include: productInclude,
      where: { id: productId, digitalKind: { not: null } },
    });
    if (!product) throw new NotFoundException({ code: "PRODUCT_NOT_FOUND" });
    const enabled =
      product.digitalKind === "LUT"
        ? product.seller.user.profile?.lutSalesEnabled
        : product.seller.user.profile?.presetSalesEnabled;
    const publiclyFree =
      (product.priceMinor === 0n || product.isDemo) &&
      enabled &&
      product.status === "PUBLISHED" &&
      product.seller.status === "ACTIVE" &&
      product.seller.user.status === "ACTIVE" &&
      product.seller.user.profile?.visibility === "PUBLIC" &&
      !product.seller.user.profile.deletedAt;
    const purchased = await prisma.marketplaceOrder.findFirst({
      where: {
        customerId: user.id,
        status: "COMPLETED",
        items: { some: { productId } },
      },
    });
    if (product.seller.userId !== user.id && !publiclyFree && !purchased)
      throw new ForbiddenException({ code: "PRODUCT_PURCHASE_REQUIRED" });
    const file = readProductFiles(product.filesJson).find(
      (candidate) => candidate.id === fileId,
    );
    if (!file) throw new NotFoundException({ code: "PRODUCT_FILE_NOT_FOUND" });
    return {
      file,
      buffer: await this.storage.readObject(
        this.env.S3_BUCKET_PRIVATE,
        file.key,
        8 * 1024 * 1024,
      ),
    };
  }
}
