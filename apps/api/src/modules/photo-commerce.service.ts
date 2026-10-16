import { loadRuntimeEnv } from "@gprn/config";
import { prisma } from "@gprn/db";
import { S3ObjectStorage } from "@gprn/storage";
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { CurrentUser } from "./auth.service.js";
import { asRecord } from "./validation.js";
import { productInclude, readProductFiles } from "./digital-product-assets.js";
import { serializeDigitalProduct } from "./digital-products.service.js";
import {
  photoSaleInclude,
  readLicenseTerms,
  serializePhotoSale,
} from "./photo-sale.js";
import { mediaAssetResponse } from "./serialization.js";

const include = {
  ...photoSaleInclude,
  assets: true,
  provenance: true,
  owner: { include: { profile: true } },
} as const;
type Photo = NonNullable<Awaited<ReturnType<typeof findPhoto>>>;
const findPhoto = (id: string) =>
  prisma.photo.findUnique({ where: { id }, include });
function visible(photo: Photo) {
  return (
    !photo.deletedAt &&
    photo.status === "PUBLISHED" &&
    photo.moderationStatus === "APPROVED" &&
    photo.visibility === "PUBLIC" &&
    photo.owner.status === "ACTIVE" &&
    photo.owner.profile?.visibility === "PUBLIC" &&
    !photo.owner.profile.deletedAt
  );
}
function original(photo: Photo, bucket: string) {
  return photo.assets.find(
    (asset) =>
      asset.type === "ORIGINAL" &&
      !asset.deletedAt &&
      asset.storageVisibility === "PRIVATE" &&
      asset.bucket === bucket,
  );
}
function invalid(code: string): never {
  throw new BadRequestException({ code });
}

@Injectable()
export class PhotoCommerceService {
  private readonly env = loadRuntimeEnv();
  private readonly storage = new S3ObjectStorage({
    accessKeyId: this.env.S3_ACCESS_KEY,
    secretAccessKey: this.env.S3_SECRET_KEY,
    endpoint: this.env.S3_ENDPOINT,
    region: this.env.S3_REGION,
    forcePathStyle: this.env.S3_FORCE_PATH_STYLE,
  });

  async get(photoId: string, user: CurrentUser | null) {
    const photo = await findPhoto(photoId);
    if (!photo) throw new NotFoundException({ code: "PHOTO_NOT_FOUND" });
    const isOwner = photo.ownerId === user?.id;
    const order =
      user && photo.marketplaceProduct
        ? await prisma.marketplaceOrderItem.findFirst({
            where: {
              productId: photo.marketplaceProduct.id,
              order: { customerId: user.id, status: "COMPLETED" },
            },
          })
        : null;
    if (!visible(photo) && !isOwner && !order)
      throw new NotFoundException({ code: "PHOTO_NOT_FOUND" });
    const products =
      visible(photo) || isOwner
        ? await prisma.marketplaceProduct.findMany({
            include: productInclude,
            orderBy: { createdAt: "asc" },
            where: {
              status: "PUBLISHED",
              digitalKind: { in: ["PRESET", "LUT"] },
              seller: {
                userId: photo.ownerId,
                status: "ACTIVE",
                user: { status: "ACTIVE" },
              },
            },
          })
        : [];
    const available = products.filter(
      (p) =>
        readProductFiles(p.filesJson).length &&
        (p.digitalKind === "LUT"
          ? photo.owner.profile?.lutSalesEnabled
          : photo.owner.profile?.presetSalesEnabled),
    );
    const listing = photo.marketplaceProduct;
    return {
      sale: serializePhotoSale(photo),
      owned: Boolean(order),
      licenseTerms: order?.licenseTerms ?? readLicenseTerms(listing?.filesJson),
      settings: isOwner
        ? {
            enabled: listing?.status === "PUBLISHED",
            priceMinor: Number(listing?.priceMinor ?? 0),
            licenseTerms: readLicenseTerms(listing?.filesJson),
            appliedProductId: photo.appliedProductId,
          }
        : null,
      appliedProductId: available.some((p) => p.id === photo.appliedProductId)
        ? photo.appliedProductId
        : null,
      authorProducts: available.map((p) =>
        serializeDigitalProduct(p, this.env),
      ),
      authorUsername: photo.owner.profile?.username ?? null,
    };
  }

  async save(user: CurrentUser, photoId: string, body: unknown) {
    const input = asRecord(body);
    if (typeof input.enabled !== "boolean") invalid("SALE_SETTINGS_INVALID");
    const enabled = input.enabled;
    const terms =
      typeof input.licenseTerms === "string" ? input.licenseTerms.trim() : "";
    if (
      enabled &&
      (!Number.isSafeInteger(input.priceMinor) ||
        Number(input.priceMinor) < 1 ||
        Number(input.priceMinor) > 1_000_000 ||
        terms.length < 10 ||
        terms.length > 2000 ||
        input.rightsConfirmed !== true)
    )
      invalid("SALE_SETTINGS_INVALID");
    if (
      input.appliedProductId !== null &&
      input.appliedProductId !== undefined &&
      typeof input.appliedProductId !== "string"
    )
      invalid("APPLIED_PRODUCT_INVALID");
    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`photo-commerce:${photoId}`}))`;
      const photo = await tx.photo.findUnique({
        where: { id: photoId },
        include,
      });
      if (!photo || photo.deletedAt)
        throw new NotFoundException({ code: "PHOTO_NOT_FOUND" });
      if (photo.ownerId !== user.id)
        throw new ForbiddenException({ code: "PHOTO_FORBIDDEN" });
      if (
        enabled &&
        (!visible(photo) ||
          photo.title.startsWith("__profile_") ||
          !original(photo, this.env.S3_BUCKET_PRIVATE) ||
          photo.provenance?.originType !== "DIRECT_UPLOAD")
      )
        throw new ConflictException({ code: "SALE_ORIGINAL_REQUIRED" });
      if (input.appliedProductId) {
        const applied = await tx.marketplaceProduct.findFirst({
          include: productInclude,
          where: {
            id: String(input.appliedProductId),
            digitalKind: { in: ["PRESET", "LUT"] },
            status: "PUBLISHED",
            seller: { userId: user.id, status: "ACTIVE" },
          },
        });
        if (
          !applied ||
          !readProductFiles(applied.filesJson).length ||
          !(applied.digitalKind === "LUT"
            ? photo.owner.profile?.lutSalesEnabled
            : photo.owner.profile?.presetSalesEnabled)
        )
          invalid("APPLIED_PRODUCT_INVALID");
      }
      if (input.appliedProductId !== undefined)
        await tx.photo.update({
          where: { id: photoId },
          data: { appliedProductId: input.appliedProductId as string | null },
        });
      if (enabled) {
        const seller = await tx.sellerProfile.upsert({
          where: { userId: user.id },
          create: {
            userId: user.id,
            displayName: photo.owner.profile!.displayName,
            status: "ACTIVE",
          },
          update: { displayName: photo.owner.profile!.displayName },
        });
        if (seller.status !== "ACTIVE")
          throw new ForbiddenException({ code: "SELLER_UNAVAILABLE" });
        const data = {
          title: photo.title,
          priceMinor: BigInt(Number(input.priceMinor)),
          currency: "USD",
          status: "PUBLISHED" as const,
          categoryId: photo.categoryId,
          description: terms,
          filesJson: { licenseTerms: terms },
          previewAssetKey: photo.assets.find((a) => a.type === "DISPLAY")
            ?.storageKey,
        };
        await tx.marketplaceProduct.upsert({
          where: { photoId },
          create: {
            ...data,
            photoId,
            sellerId: seller.id,
            slug: `photo-${photoId}`,
          },
          update: data,
        });
      } else
        await tx.marketplaceProduct.updateMany({
          where: { photoId, digitalKind: null },
          data: { status: "HIDDEN" },
        });
      await tx.auditLog.create({
        data: {
          actorUserId: user.id,
          action: "photo_commerce_updated",
          targetType: "photo",
          targetId: photoId,
          next: { enabled, appliedProductId: input.appliedProductId ?? null },
        },
      });
    });
    return this.get(photoId, user);
  }

  async purchase(user: CurrentUser, productId: string, quote?: unknown) {
    // Resolve only the identifier here; eligibility and price are rechecked under the lock.
    const candidate = await prisma.marketplaceProduct.findFirst({
      where: { id: productId, digitalKind: null },
      select: { photoId: true },
    });
    if (!candidate?.photoId)
      throw new NotFoundException({ code: "PRODUCT_NOT_FOUND" });
    const input = asRecord(quote ?? {});
    const orderId = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`photo-commerce:${candidate.photoId}`}))`;
      const photo = await tx.photo.findUnique({
        where: { id: candidate.photoId! },
        include,
      });
      const product = photo?.marketplaceProduct;
      if (!photo || !product || product.id !== productId)
        throw new NotFoundException({ code: "PRODUCT_NOT_FOUND" });
      if (photo.ownerId === user.id)
        throw new ConflictException({ code: "SELF_PURCHASE" });
      const prior = await tx.marketplaceOrder.findFirst({
        where: {
          customerId: user.id,
          status: "COMPLETED",
          items: { some: { productId } },
        },
      });
      if (prior) return prior.id;
      if (
        !serializePhotoSale(photo) ||
        !visible(photo) ||
        !original(photo, this.env.S3_BUCKET_PRIVATE) ||
        photo.provenance?.originType !== "DIRECT_UPLOAD"
      )
        throw new NotFoundException({ code: "PRODUCT_NOT_FOUND" });
      const terms = readLicenseTerms(product.filesJson);
      if (
        input.priceMinor !== Number(product.priceMinor) ||
        input.licenseTerms !== terms ||
        input.accepted !== true
      )
        throw new ConflictException({ code: "SALE_QUOTE_CHANGED" });
      for (const id of [user.id, photo.ownerId].sort())
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`wallet:${id}`}))`;
      const buyer = await tx.wallet.upsert({
        where: { userId: user.id },
        create: { userId: user.id, currency: "USD" },
        update: {},
      });
      const seller = await tx.wallet.upsert({
        where: { userId: photo.ownerId },
        create: { userId: photo.ownerId, currency: "USD" },
        update: {},
      });
      if (
        buyer.currency !== product.currency ||
        seller.currency !== product.currency
      )
        throw new ConflictException({ code: "CURRENCY_MISMATCH" });
      const debit = await tx.wallet.updateMany({
        where: { id: buyer.id, balanceMinor: { gte: product.priceMinor } },
        data: { balanceMinor: { decrement: product.priceMinor } },
      });
      if (!debit.count)
        throw new ConflictException({ code: "INSUFFICIENT_FUNDS" });
      const order = await tx.marketplaceOrder.create({
        data: {
          customerId: user.id,
          currency: product.currency,
          status: "COMPLETED",
          subtotalMinor: product.priceMinor,
          items: {
            create: {
              productId,
              currency: product.currency,
              priceMinor: product.priceMinor,
              licenseTerms: terms,
            },
          },
        },
      });
      await tx.wallet.update({
        where: { id: seller.id },
        data: { balanceMinor: { increment: product.priceMinor } },
      });
      await tx.walletTransaction.createMany({
        data: [
          {
            walletId: buyer.id,
            currency: product.currency,
            amountMinor: -product.priceMinor,
            type: "PURCHASE",
            referenceType: "marketplace_order",
            referenceId: order.id,
          },
          {
            walletId: seller.id,
            currency: product.currency,
            amountMinor: product.priceMinor,
            type: "SALE",
            referenceType: "marketplace_order",
            referenceId: order.id,
          },
        ],
      });
      await tx.payment.create({
        data: {
          amountMinor: product.priceMinor,
          currency: product.currency,
          marketplaceOrderId: order.id,
          provider: "wallet",
          providerPaymentId: order.id,
          status: "SUCCEEDED",
        },
      });
      await tx.marketplaceProduct.update({
        where: { id: productId },
        data: { salesCount: { increment: 1 } },
      });
      await tx.sellerProfile.update({
        where: { id: product.sellerId },
        data: { salesCount: { increment: 1 } },
      });
      await tx.notification.create({
        data: {
          type: "marketplace_sale",
          userId: photo.ownerId,
          payload: { orderId: order.id, productId },
        },
      });
      return order.id;
    });
    return { orderId };
  }

  async purchases(user: CurrentUser) {
    const items = await prisma.marketplaceOrderItem.findMany({
      where: {
        order: { customerId: user.id, status: "COMPLETED" },
        product: { digitalKind: null, photoId: { not: null } },
      },
      include: {
        product: { include: { photo: { include: { assets: true } } } },
      },
      orderBy: { order: { createdAt: "desc" } },
    });
    return {
      purchases: items.map((item) => ({
        photoId: item.product.photoId!,
        title: item.product.title,
        priceMinor: Number(item.priceMinor),
        currency: item.currency,
        licenseTerms: item.licenseTerms,
        ...mediaAssetResponse(this.env, item.product.photo?.assets ?? []),
      })),
    };
  }

  async download(user: CurrentUser, photoId: string) {
    const photo = await findPhoto(photoId);
    if (!photo) throw new NotFoundException({ code: "PHOTO_NOT_FOUND" });
    const purchase =
      photo.marketplaceProduct &&
      (await prisma.marketplaceOrderItem.findFirst({
        where: {
          productId: photo.marketplaceProduct.id,
          order: { customerId: user.id, status: "COMPLETED" },
        },
      }));
    if (photo.ownerId !== user.id && !purchase)
      throw new ForbiddenException({ code: "PRODUCT_PURCHASE_REQUIRED" });
    const file = original(photo, this.env.S3_BUCKET_PRIVATE);
    if (!file) throw new NotFoundException({ code: "ORIGINAL_NOT_FOUND" });
    return {
      name: file.storageKey
        .split("/")
        .pop()!
        .replace(/[\x00-\x1f\x7f]/g, ""),
      buffer: await this.storage.readObject(
        file.bucket,
        file.storageKey,
        64 * 1024 * 1024,
      ),
    };
  }
}
