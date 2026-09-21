import { loadRuntimeEnv } from "@gprn/config";
import { prisma, type Prisma } from "@gprn/db";
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";

import type { CurrentUser } from "./auth.service.js";
import { publicAssetUrl } from "./serialization.js";
import {
  asRecord,
  optionalEnum,
  optionalString,
  requiredString,
} from "./validation.js";

const paymentMethods = ["card", "crypto"] as const;
const promotionPlacements = ["HOME", "MARKETPLACE", "BATTLES"] as const;
const serviceActions = [
  "accept",
  "decline",
  "start",
  "submit",
  "complete",
  "cancel",
] as const;
const serviceActionStatuses: Record<
  (typeof serviceActions)[number],
  readonly string[]
> = {
  accept: ["PENDING"],
  cancel: ["PENDING", "ACCEPTED", "IN_PROGRESS"],
  complete: ["SUBMITTED"],
  decline: ["PENDING"],
  start: ["ACCEPTED"],
  submit: ["IN_PROGRESS"],
};
const reviewCriteria = [
  "composition",
  "lighting",
  "technicalQuality",
  "storytelling",
  "originality",
  "color",
  "emotionalImpact",
] as const;
const reviewProviderTiers = new Set(["EXPERIENCED", "PROFESSIONAL", "STAR"]);
const detailedReviewTiers = new Set(["PROFESSIONAL", "STAR"]);
const promotionPrices = {
  BATTLES: 1900,
  HOME: 4900,
  MARKETPLACE: 2900,
} as const;

@Injectable()
export class PlatformService {
  private readonly env = loadRuntimeEnv();

  async dashboard(user: CurrentUser) {
    const [wallet, requests, promotions, donations, bookmarks, moodboards] =
      await Promise.all([
        this.ensureWallet(user.id),
        prisma.serviceRequest.findMany({
          include: {
            customer: { include: { profile: true } },
            provider: { include: { profile: true } },
            ratings: true,
          },
          orderBy: { updatedAt: "desc" },
          take: 50,
          where: { OR: [{ customerId: user.id }, { providerId: user.id }] },
        }),
        prisma.promotion.findMany({
          orderBy: { createdAt: "desc" },
          take: 50,
          where: { ownerId: user.id },
        }),
        prisma.donation.findMany({
          orderBy: { createdAt: "desc" },
          take: 50,
          where: { OR: [{ senderId: user.id }, { recipientId: user.id }] },
        }),
        prisma.savedPhoto.findMany({
          orderBy: { createdAt: "desc" },
          where: { userId: user.id },
        }),
        prisma.moodboard.findMany({
          include: { items: true },
          orderBy: { createdAt: "asc" },
          where: { ownerId: user.id },
        }),
      ]);

    const transactions = await prisma.walletTransaction.findMany({
      orderBy: { createdAt: "desc" },
      take: 100,
      where: { walletId: wallet.id },
    });

    return {
      bookmarks: bookmarks.map((item) => item.photoId),
      donations: donations.map(serializeMoneyRecord),
      moodboards,
      promotions: promotions.map(serializeMoneyRecord),
      requests: requests.map((request) => ({
        ...serializeMoneyRecord(request),
        customer: request.customer.profile?.displayName ?? "Customer",
        provider: request.provider.profile?.displayName ?? "Photographer",
        ratings: request.ratings,
      })),
      wallet: {
        balanceMinor: wallet.balanceMinor.toString(),
        currency: wallet.currency,
        transactions: transactions.map(serializeMoneyRecord),
      },
    };
  }

  async topUp(user: CurrentUser, body: unknown) {
    const record = asRecord(body);
    const amountMinor = requiredPositiveMinor(
      record.amountMinor,
      "amountMinor",
    );
    const method = optionalEnum(record, "method", paymentMethods) ?? "card";

    const result = await prisma.$transaction(async (tx) => {
      const wallet = await tx.wallet.upsert({
        create: { balanceMinor: 0, currency: "USD", userId: user.id },
        update: {},
        where: { userId: user.id },
      });
      const updated = await tx.wallet.update({
        data: { balanceMinor: { increment: amountMinor } },
        where: { id: wallet.id },
      });
      const transaction = await tx.walletTransaction.create({
        data: {
          amountMinor,
          currency: wallet.currency,
          metadata: { adapter: "sandbox", method },
          note: `Top up via ${method}`,
          status: "COMPLETED",
          type: "DEPOSIT",
          walletId: wallet.id,
        },
      });
      return { transaction, wallet: updated };
    });

    return {
      transaction: serializeMoneyRecord(result.transaction),
      wallet: {
        balanceMinor: result.wallet.balanceMinor.toString(),
        currency: result.wallet.currency,
      },
    };
  }

  async createServiceRequest(user: CurrentUser, body: unknown) {
    const record = asRecord(body);
    const providerUsername = requiredString(
      record,
      "providerUsername",
    ).toLowerCase();
    const provider = await prisma.user.findFirst({
      include: { profile: true },
      where: { profile: { username: providerUsername }, status: "ACTIVE" },
    });
    if (!provider?.profile)
      throw new NotFoundException({
        code: "PROVIDER_NOT_FOUND",
        message: "Photographer does not exist.",
      });
    if (provider.id === user.id)
      throw new ConflictException({
        code: "SELF_ORDER",
        message: "You cannot order your own service.",
      });
    if (
      !provider.profile.availableForHire ||
      provider.profile.tier === "VIEWER"
    ) {
      throw new ConflictException({
        code: "PROVIDER_UNAVAILABLE",
        message: "This author is not accepting service requests.",
      });
    }

    const priceMinor = requiredPositiveMinor(
      record.priceMinor ?? 15000,
      "priceMinor",
    );
    const request = await prisma.serviceRequest.create({
      data: {
        attachmentKeys: parseStringArray(record.attachmentKeys),
        customerId: user.id,
        message: requiredString(record, "message").slice(0, 5000),
        platformFeeMinor: Math.round(priceMinor * 0.05),
        priceMinor,
        providerId: provider.id,
        referenceUrl: optionalString(record, "referenceUrl")?.slice(0, 1000),
        title: (
          optionalString(record, "title") ?? "Photography service request"
        ).slice(0, 140),
      },
    });
    await prisma.notification.create({
      data: {
        payload: { requestId: request.id },
        type: "service_request_received",
        userId: provider.id,
      },
    });
    return { request: serializeMoneyRecord(request) };
  }

  async updateServiceRequest(
    user: CurrentUser,
    requestId: string,
    body: unknown,
  ) {
    const record = asRecord(body);
    const action = optionalEnum(record, "action", serviceActions);
    if (!action)
      throw new BadRequestException({
        code: "ACTION_REQUIRED",
        message: "Choose a service request action.",
      });
    const request = await prisma.serviceRequest.findUnique({
      where: { id: requestId },
    });
    if (!request)
      throw new NotFoundException({
        code: "REQUEST_NOT_FOUND",
        message: "Service request does not exist.",
      });
    if (!serviceActionStatuses[action].includes(request.status))
      throw new ConflictException({
        code: "INVALID_STATUS_TRANSITION",
        message: `Cannot ${action} an order with status ${request.status}.`,
      });

    const providerAction = new Set(["accept", "decline", "start", "submit"]);
    if (providerAction.has(action) && request.providerId !== user.id)
      throw new ForbiddenException({
        code: "PROVIDER_ONLY",
        message: "Only the provider can perform this action.",
      });
    if (action === "complete" && request.customerId !== user.id)
      throw new ForbiddenException({
        code: "CUSTOMER_ONLY",
        message: "Only the customer can complete this order.",
      });
    if (
      action === "cancel" &&
      request.customerId !== user.id &&
      request.providerId !== user.id
    )
      throw new ForbiddenException({
        code: "REQUEST_FORBIDDEN",
        message: "You are not part of this order.",
      });

    const nextStatus = {
      accept: "ACCEPTED",
      cancel: "CANCELLED",
      complete: "COMPLETED",
      decline: "DECLINED",
      start: "IN_PROGRESS",
      submit: "SUBMITTED",
    }[action] as
      | "ACCEPTED"
      | "CANCELLED"
      | "COMPLETED"
      | "DECLINED"
      | "IN_PROGRESS"
      | "SUBMITTED";

    const updated = await prisma.$transaction(async (tx) => {
      if (action === "complete") await settleServiceOrder(tx, request);
      const saved = await tx.serviceRequest.update({
        data: {
          acceptedAt: action === "accept" ? new Date() : undefined,
          completedAt: action === "complete" ? new Date() : undefined,
          providerComment: optionalString(record, "comment")?.slice(0, 2000),
          status: nextStatus,
          submittedAt: action === "submit" ? new Date() : undefined,
        },
        where: { id: request.id },
      });
      if (action === "complete") {
        await Promise.all([
          tx.profile.update({
            data: { completedAsCustomer: { increment: 1 } },
            where: { userId: request.customerId },
          }),
          tx.profile.update({
            data: { completedAsProvider: { increment: 1 } },
            where: { userId: request.providerId },
          }),
        ]);
      }
      await tx.notification.create({
        data: {
          payload: {
            action,
            comment: saved.providerComment,
            requestId: saved.id,
          },
          type: `service_request_${action}`,
          userId:
            user.id === request.customerId
              ? request.providerId
              : request.customerId,
        },
      });
      return saved;
    });
    return { request: serializeMoneyRecord(updated) };
  }

  async addServiceMessage(user: CurrentUser, requestId: string, body: unknown) {
    const request = await prisma.serviceRequest.findUnique({
      where: { id: requestId },
    });
    if (
      !request ||
      (request.customerId !== user.id && request.providerId !== user.id)
    ) {
      throw new NotFoundException({
        code: "REQUEST_NOT_FOUND",
        message: "Service request does not exist.",
      });
    }
    const record = asRecord(body);
    const message = await prisma.serviceMessage.create({
      data: {
        attachments: parseStringArray(record.attachments),
        authorId: user.id,
        body: requiredString(record, "message").slice(0, 5000),
        requestId,
      },
    });
    await prisma.notification.create({
      data: {
        payload: { requestId },
        type: "service_message",
        userId:
          user.id === request.customerId
            ? request.providerId
            : request.customerId,
      },
    });
    return { message };
  }

  async rateService(user: CurrentUser, requestId: string, body: unknown) {
    const request = await prisma.serviceRequest.findUnique({
      where: { id: requestId },
    });
    if (!request || request.status !== "COMPLETED")
      throw new ConflictException({
        code: "ORDER_NOT_COMPLETED",
        message: "Complete the order before rating it.",
      });
    if (request.customerId !== user.id && request.providerId !== user.id)
      throw new ForbiddenException({
        code: "REQUEST_FORBIDDEN",
        message: "You are not part of this order.",
      });
    const record = asRecord(body);
    const stars = requiredInteger(record.stars, "stars", 1, 5);
    const subjectId =
      user.id === request.customerId ? request.providerId : request.customerId;
    const rating = await prisma.$transaction(async (tx) => {
      const saved = await tx.serviceRating.create({
        data: {
          authorId: user.id,
          comment: optionalString(record, "comment")?.slice(0, 2000),
          requestId,
          stars,
          subjectId,
        },
      });
      const aggregate = await tx.serviceRating.aggregate({
        _avg: { stars: true },
        _count: true,
        where: { subjectId },
      });
      await tx.profile.update({
        data: {
          serviceRatingAverage: aggregate._avg.stars ?? undefined,
          serviceRatingsCount: aggregate._count,
        },
        where: { userId: subjectId },
      });
      return saved;
    });
    return { rating };
  }

  async donate(user: CurrentUser, body: unknown) {
    const record = asRecord(body);
    const recipientUsername = requiredString(
      record,
      "recipientUsername",
    ).toLowerCase();
    const recipient = await prisma.user.findFirst({
      include: { profile: true },
      where: { profile: { username: recipientUsername }, status: "ACTIVE" },
    });
    if (!recipient?.profile)
      throw new NotFoundException({
        code: "RECIPIENT_NOT_FOUND",
        message: "Author does not exist.",
      });
    if (recipient.id === user.id)
      throw new ConflictException({
        code: "SELF_DONATION",
        message: "You cannot donate to yourself.",
      });
    const amountMinor = requiredPositiveMinor(
      record.amountMinor,
      "amountMinor",
    );

    const donation = await prisma.$transaction(async (tx) => {
      const sender = await ensureWalletWithTx(tx, user.id);
      if (sender.balanceMinor < BigInt(amountMinor))
        throw new ConflictException({
          code: "INSUFFICIENT_FUNDS",
          message: "Wallet balance is too low.",
        });
      const receiver = await ensureWalletWithTx(tx, recipient.id);
      const saved = await tx.donation.create({
        data: {
          amountMinor,
          message: optionalString(record, "message")?.slice(0, 500),
          recipientId: recipient.id,
          senderId: user.id,
          status: "SUCCEEDED",
        },
      });
      await Promise.all([
        tx.wallet.update({
          data: { balanceMinor: { decrement: amountMinor } },
          where: { id: sender.id },
        }),
        tx.wallet.update({
          data: { balanceMinor: { increment: amountMinor } },
          where: { id: receiver.id },
        }),
        tx.walletTransaction.create({
          data: {
            amountMinor: -amountMinor,
            currency: sender.currency,
            referenceId: saved.id,
            referenceType: "donation",
            type: "DONATION_SENT",
            walletId: sender.id,
          },
        }),
        tx.walletTransaction.create({
          data: {
            amountMinor,
            currency: receiver.currency,
            referenceId: saved.id,
            referenceType: "donation",
            type: "DONATION_RECEIVED",
            walletId: receiver.id,
          },
        }),
        tx.notification.create({
          data: {
            payload: { amountMinor, donationId: saved.id },
            type: "donation_received",
            userId: recipient.id,
          },
        }),
      ]);
      return saved;
    });
    return { donation: serializeMoneyRecord(donation) };
  }

  async listMarketplace() {
    const products = await prisma.marketplaceProduct.findMany({
      include: {
        category: true,
        photo: { include: { assets: true } },
        seller: { include: { user: { include: { profile: true } } } },
      },
      orderBy: { createdAt: "desc" },
      take: 60,
      where: {
        photo: { deletedAt: null },
        seller: { status: "ACTIVE", user: { status: "ACTIVE" } },
        status: "PUBLISHED",
      },
    });
    return {
      products: products.map((product) => {
        const asset =
          product.photo?.assets.find((item) => item.type === "DISPLAY") ??
          product.photo?.assets.find((item) => item.type === "THUMBNAIL");
        return {
          ...serializeMoneyRecord(product),
          category: product.category?.slug ?? null,
          previewUrl: asset
            ? publicAssetUrl(this.env, asset.storageKey)
            : product.previewAssetKey
              ? publicAssetUrl(this.env, product.previewAssetKey)
              : null,
          seller: {
            displayName: product.seller.displayName,
            username: product.seller.user.profile?.username ?? null,
          },
        };
      }),
    };
  }

  async listReviewProviders() {
    const providers = await prisma.expertProfile.findMany({
      include: {
        services: {
          orderBy: { priceMinor: "asc" },
          where: {
            availability: "AVAILABLE",
            serviceType: "PHOTO_REVIEW",
            status: "PUBLISHED",
          },
        },
        user: { include: { profile: true } },
      },
      orderBy: [{ ratingAverage: "desc" }, { reviewsCompleted: "desc" }],
      where: {
        services: {
          some: {
            availability: "AVAILABLE",
            serviceType: "PHOTO_REVIEW",
            status: "PUBLISHED",
          },
        },
        status: "ACTIVE",
        user: {
          profile: {
            deletedAt: null,
            tier: { in: ["EXPERIENCED", "PROFESSIONAL", "STAR"] },
          },
          status: "ACTIVE",
        },
      },
    });

    return {
      providers: providers.map((provider) => ({
        headline: provider.headline,
        languages: provider.languages,
        ratingAverage: provider.ratingAverage,
        reviewsCompleted: provider.reviewsCompleted,
        services: provider.services.map(serializeMoneyRecord),
        profile: provider.user.profile
          ? {
              avatarUrl: provider.user.profile.avatarAssetKey
                ? publicAssetUrl(this.env, provider.user.profile.avatarAssetKey)
                : null,
              availableForHire: provider.user.profile.availableForHire,
              displayName: provider.user.profile.displayName,
              tier: provider.user.profile.tier,
              username: provider.user.profile.username,
            }
          : null,
      })),
    };
  }

  async createMarketplaceListing(user: CurrentUser, body: unknown) {
    if (!user.profile || user.profile.tier === "VIEWER")
      throw new ForbiddenException({
        code: "PHOTOGRAPHER_ONLY",
        message: "Only photographer accounts can list photographs.",
      });
    const record = asRecord(body);
    const photoId = requiredString(record, "photoId");
    const priceMinor = requiredPositiveMinor(record.priceMinor, "priceMinor");
    const photo = await prisma.photo.findFirst({
      include: { assets: true },
      where: {
        deletedAt: null,
        id: photoId,
        ownerId: user.id,
        status: "PUBLISHED",
      },
    });
    if (!photo)
      throw new NotFoundException({
        code: "PHOTO_NOT_FOUND",
        message: "Choose one of your published photos.",
      });
    const preview =
      photo.assets.find((asset) => asset.type === "DISPLAY") ??
      photo.assets.find((asset) => asset.type === "THUMBNAIL");
    const product = await prisma.$transaction(async (tx) => {
      const seller = await tx.sellerProfile.upsert({
        create: {
          displayName: user.profile!.displayName,
          status: "ACTIVE",
          userId: user.id,
        },
        update: {
          displayName: user.profile!.displayName,
          status: "ACTIVE",
        },
        where: { userId: user.id },
      });
      return tx.marketplaceProduct.upsert({
        create: {
          categoryId: photo.categoryId,
          currency: "USD",
          description: optionalString(record, "description")?.slice(0, 2000),
          filesJson: { license: "standard", photoId: photo.id },
          photoId: photo.id,
          previewAssetKey: preview?.storageKey,
          priceMinor,
          sellerId: seller.id,
          slug: `${user.profile!.username}-${photo.id}`,
          status: "PUBLISHED",
          title: (optionalString(record, "title") ?? photo.title).slice(0, 140),
        },
        update: {
          description: optionalString(record, "description")?.slice(0, 2000),
          previewAssetKey: preview?.storageKey,
          priceMinor,
          status: "PUBLISHED",
          title: (optionalString(record, "title") ?? photo.title).slice(0, 140),
        },
        where: { photoId: photo.id },
      });
    });
    return { product: serializeMoneyRecord(product) };
  }

  async updateMarketplaceListing(
    user: CurrentUser,
    productId: string,
    body: unknown,
  ) {
    const record = asRecord(body);
    if (typeof record.active !== "boolean")
      throw new BadRequestException({
        code: "INVALID_FIELD",
        field: "active",
        message: "active must be a boolean.",
      });
    const product = await prisma.marketplaceProduct.findFirst({
      include: { seller: true },
      where: { id: productId, seller: { userId: user.id } },
    });
    if (!product)
      throw new NotFoundException({
        code: "PRODUCT_NOT_FOUND",
        message: "Marketplace product does not exist.",
      });
    const saved = await prisma.marketplaceProduct.update({
      data: { status: record.active ? "PUBLISHED" : "HIDDEN" },
      where: { id: product.id },
    });
    return { product: serializeMoneyRecord(saved) };
  }

  async buyMarketplaceProduct(user: CurrentUser, productId: string) {
    const product = await prisma.marketplaceProduct.findFirst({
      include: { seller: true },
      where: {
        id: productId,
        photo: { deletedAt: null },
        seller: { status: "ACTIVE" },
        status: "PUBLISHED",
      },
    });
    if (!product)
      throw new NotFoundException({
        code: "PRODUCT_NOT_FOUND",
        message: "Marketplace product does not exist.",
      });
    if (product.seller.userId === user.id)
      throw new ConflictException({
        code: "SELF_PURCHASE",
        message: "You cannot buy your own listing.",
      });

    const order = await prisma.$transaction(async (tx) => {
      const buyer = await ensureWalletWithTx(tx, user.id);
      if (buyer.balanceMinor < product.priceMinor)
        throw new ConflictException({
          code: "INSUFFICIENT_FUNDS",
          message: "Wallet balance is too low.",
        });
      const seller = await ensureWalletWithTx(tx, product.seller.userId);
      const saved = await tx.marketplaceOrder.create({
        data: {
          currency: product.currency,
          customerId: user.id,
          items: {
            create: {
              currency: product.currency,
              priceMinor: product.priceMinor,
              productId: product.id,
            },
          },
          status: "COMPLETED",
          subtotalMinor: product.priceMinor,
        },
      });
      await Promise.all([
        tx.wallet.update({
          data: { balanceMinor: { decrement: product.priceMinor } },
          where: { id: buyer.id },
        }),
        tx.wallet.update({
          data: { balanceMinor: { increment: product.priceMinor } },
          where: { id: seller.id },
        }),
        tx.walletTransaction.create({
          data: {
            amountMinor: -product.priceMinor,
            currency: product.currency,
            referenceId: saved.id,
            referenceType: "marketplace_order",
            type: "PURCHASE",
            walletId: buyer.id,
          },
        }),
        tx.walletTransaction.create({
          data: {
            amountMinor: product.priceMinor,
            currency: product.currency,
            referenceId: saved.id,
            referenceType: "marketplace_order",
            type: "SALE",
            walletId: seller.id,
          },
        }),
        tx.payment.create({
          data: {
            amountMinor: product.priceMinor,
            currency: product.currency,
            marketplaceOrderId: saved.id,
            provider: "wallet",
            providerPaymentId: saved.id,
            status: "SUCCEEDED",
          },
        }),
        tx.marketplaceProduct.update({
          data: { salesCount: { increment: 1 } },
          where: { id: product.id },
        }),
        tx.sellerProfile.update({
          data: { salesCount: { increment: 1 } },
          where: { id: product.sellerId },
        }),
        tx.notification.create({
          data: {
            payload: { orderId: saved.id, productId: product.id },
            type: "marketplace_sale",
            userId: product.seller.userId,
          },
        }),
      ]);
      return saved;
    });
    return { order: serializeMoneyRecord(order) };
  }

  async createPromotion(user: CurrentUser, body: unknown) {
    const record = asRecord(body);
    const placement = optionalEnum(record, "placement", promotionPlacements);
    if (!placement)
      throw new BadRequestException({
        code: "PLACEMENT_REQUIRED",
        message: "Choose a promotion placement.",
      });
    const photoId = requiredString(record, "photoId");
    const photo = await prisma.photo.findFirst({
      where: { id: photoId, ownerId: user.id, status: "PUBLISHED" },
    });
    if (!photo)
      throw new NotFoundException({
        code: "PHOTO_NOT_FOUND",
        message: "Choose one of your published photos.",
      });
    const priceMinor = promotionPrices[placement];

    const promotion = await prisma.$transaction(async (tx) => {
      const wallet = await ensureWalletWithTx(tx, user.id);
      if (wallet.balanceMinor < BigInt(priceMinor))
        throw new ConflictException({
          code: "INSUFFICIENT_FUNDS",
          message: "Wallet balance is too low.",
        });
      const saved = await tx.promotion.create({
        data: {
          endsAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
          ownerId: user.id,
          photoId,
          placement,
          priceMinor,
          startsAt: new Date(),
          status: "ACTIVE",
        },
      });
      await Promise.all([
        tx.wallet.update({
          data: { balanceMinor: { decrement: priceMinor } },
          where: { id: wallet.id },
        }),
        tx.walletTransaction.create({
          data: {
            amountMinor: -priceMinor,
            currency: wallet.currency,
            referenceId: saved.id,
            referenceType: "promotion",
            type: "PURCHASE",
            walletId: wallet.id,
          },
        }),
      ]);
      return saved;
    });
    return { promotion: serializeMoneyRecord(promotion) };
  }

  async listPromotions(placement?: string) {
    const normalized = promotionPlacements.includes(
      placement as (typeof promotionPlacements)[number],
    )
      ? (placement as (typeof promotionPlacements)[number])
      : undefined;
    const promotions = await prisma.promotion.findMany({
      include: {
        owner: { include: { profile: true } },
        photo: { include: { assets: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 24,
      where: {
        placement: normalized,
        status: "ACTIVE",
        endsAt: { gt: new Date() },
      },
    });
    return {
      promotions: promotions.map((item) => ({
        ...serializeMoneyRecord(item),
        author: item.owner.profile?.displayName,
        username: item.owner.profile?.username,
      })),
    };
  }

  async publicMoodboards(username: string) {
    const profile = await prisma.profile.findUnique({
      select: { userId: true },
      where: { username: username.toLowerCase() },
    });
    if (!profile)
      throw new NotFoundException({
        code: "PROFILE_NOT_FOUND",
        message: "Profile does not exist.",
      });
    const moodboards = await prisma.moodboard.findMany({
      include: {
        items: {
          include: { photo: { include: { assets: true } } },
          orderBy: { createdAt: "desc" },
        },
      },
      orderBy: { createdAt: "asc" },
      where: { isPublic: true, ownerId: profile.userId },
    });
    return { moodboards };
  }

  async updatePaidReviewSettings(user: CurrentUser, body: unknown) {
    const tier = user.profile?.tier ?? "VIEWER";
    if (!reviewProviderTiers.has(tier))
      throw new ForbiddenException({
        code: "REVIEW_PROVIDER_ONLY",
        message:
          "Paid reviews are available to experienced, professional and star photographers.",
      });

    const record = asRecord(body);
    const enabled = record.enabled ?? true;
    if (typeof enabled !== "boolean")
      throw new BadRequestException({
        code: "INVALID_FIELD",
        field: "enabled",
        message: "enabled must be a boolean.",
      });
    const priceMinor =
      record.priceMinor === undefined
        ? 3500
        : requiredPositiveMinor(record.priceMinor, "priceMinor");

    const service = await prisma.$transaction(async (tx) => {
      const expert = await tx.expertProfile.upsert({
        create: { languages: ["en"], status: "ACTIVE", userId: user.id },
        update: { status: "ACTIVE" },
        where: { userId: user.id },
      });
      const existing = await tx.expertService.findFirst({
        where: { expertId: expert.id, serviceType: "PHOTO_REVIEW" },
      });
      const data = {
        availability: enabled ? "AVAILABLE" : "UNAVAILABLE",
        currency: "USD",
        estimatedDeliveryDays: 5,
        language: "en",
        photoLimit: 1,
        priceMinor,
        serviceType: "PHOTO_REVIEW",
        status: enabled ? ("PUBLISHED" as const) : ("ARCHIVED" as const),
        title: "Professional photo review",
      };
      return existing
        ? tx.expertService.update({ data, where: { id: existing.id } })
        : tx.expertService.create({ data: { ...data, expertId: expert.id } });
    });

    return { service: serializeMoneyRecord(service) };
  }

  async requestPaidReview(user: CurrentUser, body: unknown) {
    const record = asRecord(body);
    const providerUsername = requiredString(
      record,
      "providerUsername",
    ).toLowerCase();
    const photoId = requiredString(record, "photoId");
    const [provider, photo] = await Promise.all([
      prisma.user.findFirst({
        include: {
          expertProfile: {
            include: {
              services: {
                orderBy: { updatedAt: "desc" },
                take: 1,
                where: {
                  availability: "AVAILABLE",
                  serviceType: "PHOTO_REVIEW",
                  status: "PUBLISHED",
                },
              },
            },
          },
          profile: true,
        },
        where: { profile: { username: providerUsername }, status: "ACTIVE" },
      }),
      prisma.photo.findFirst({ where: { id: photoId, ownerId: user.id } }),
    ]);
    const service = provider?.expertProfile?.services[0];
    if (
      !provider?.profile ||
      !reviewProviderTiers.has(provider.profile.tier) ||
      !service
    )
      throw new ConflictException({
        code: "REVIEW_PROVIDER_UNAVAILABLE",
        message: "This photographer cannot provide paid reviews.",
      });
    if (provider.id === user.id)
      throw new ConflictException({
        code: "SELF_ORDER",
        message: "You cannot order your own review.",
      });
    if (!photo)
      throw new NotFoundException({
        code: "PHOTO_NOT_FOUND",
        message: "Choose one of your photos.",
      });
    const request = await prisma.serviceRequest.create({
      data: {
        customerId: user.id,
        kind: "PHOTO_REVIEW",
        message:
          optionalString(record, "question")?.slice(0, 3000) ??
          "Professional review of the selected photograph.",
        platformFeeMinor: (service.priceMinor * 5n) / 100n,
        priceMinor: service.priceMinor,
        providerId: provider.id,
        reviewPhotoId: photo.id,
        title: "Professional photo review",
      },
    });
    await prisma.notification.create({
      data: {
        payload: { photoId: photo.id, requestId: request.id },
        type: "expert_review_requested",
        userId: provider.id,
      },
    });
    return { request: serializeMoneyRecord(request) };
  }

  async togglePhotoAction(
    user: CurrentUser,
    photoId: string,
    action: "like" | "bookmark" | "moodboard",
  ) {
    const photo = await prisma.photo.findFirst({
      where: { deletedAt: null, id: photoId },
    });
    if (!photo)
      throw new NotFoundException({
        code: "PHOTO_NOT_FOUND",
        message: "Photo does not exist.",
      });
    if (action === "like") {
      const existing = await prisma.photoLike.findUnique({
        where: { photoId_userId: { photoId, userId: user.id } },
      });
      if (existing)
        await prisma.photoLike.delete({ where: { id: existing.id } });
      else
        await prisma.photoLike.create({ data: { photoId, userId: user.id } });
    } else if (action === "bookmark") {
      const existing = await prisma.savedPhoto.findUnique({
        where: { photoId_userId: { photoId, userId: user.id } },
      });
      if (existing)
        await prisma.savedPhoto.delete({ where: { id: existing.id } });
      else
        await prisma.savedPhoto.create({ data: { photoId, userId: user.id } });
    } else {
      const board = await prisma.moodboard.upsert({
        create: { isPublic: true, ownerId: user.id, title: "Moodboard" },
        update: {},
        where: { ownerId_title: { ownerId: user.id, title: "Moodboard" } },
      });
      const existing = await prisma.moodboardItem.findUnique({
        where: { moodboardId_photoId: { moodboardId: board.id, photoId } },
      });
      if (existing)
        await prisma.moodboardItem.delete({ where: { id: existing.id } });
      else
        await prisma.moodboardItem.create({
          data: { moodboardId: board.id, photoId },
        });
    }
    const [likes, bookmarks, moodboards] = await Promise.all([
      prisma.photoLike.count({ where: { photoId } }),
      prisma.savedPhoto.count({ where: { photoId } }),
      prisma.moodboardItem.count({ where: { photoId } }),
    ]);
    return { counts: { bookmarks, likes, moodboards } };
  }

  async reviewPhoto(user: CurrentUser, photoId: string, body: unknown) {
    const tier = user.profile?.tier ?? "VIEWER";
    if (!detailedReviewTiers.has(tier))
      throw new ForbiddenException({
        code: "PROFESSIONAL_ONLY",
        message:
          "Detailed photo ratings are available only to professional and superstar accounts.",
      });
    const record = asRecord(body);
    const scores = Object.fromEntries(
      reviewCriteria.map((criterion) => [
        criterion,
        requiredInteger(record[criterion], criterion, 1, 10),
      ]),
    ) as Record<(typeof reviewCriteria)[number], number>;
    const averageMinor = Math.round(
      (Object.values(scores).reduce((sum, value) => sum + value, 0) /
        reviewCriteria.length) *
        100,
    );
    const comment = optionalString(record, "comment")?.slice(0, 3000);
    const review = await prisma.photoReview.upsert({
      create: {
        ...scores,
        averageMinor,
        comment,
        photoId,
        reviewerId: user.id,
        reviewerTier: tier as "PROFESSIONAL" | "STAR",
      },
      update: {
        ...scores,
        averageMinor,
        comment,
        reviewerTier: tier as "PROFESSIONAL" | "STAR",
      },
      where: { photoId_reviewerId: { photoId, reviewerId: user.id } },
    });
    return { review };
  }

  async photoReviews(photoId: string) {
    const photo = await prisma.photo.findFirst({
      select: { id: true },
      where: { id: photoId, status: "PUBLISHED" },
    });
    if (!photo)
      throw new NotFoundException({
        code: "PHOTO_NOT_FOUND",
        message: "Published photo does not exist.",
      });

    const reviews = await prisma.photoReview.findMany({
      include: {
        reviewer: {
          select: {
            profile: {
              select: { displayName: true, tier: true, username: true },
            },
          },
        },
      },
      orderBy: { createdAt: "desc" },
      where: { photoId },
    });

    return {
      reviews: reviews.map((review) => ({
        average: review.averageMinor / 100,
        comment: review.comment,
        createdAt: review.createdAt,
        reviewer: {
          displayName:
            review.reviewer.profile?.displayName ??
            review.reviewer.profile?.username ??
            "Photographer",
          tier: review.reviewerTier,
          username: review.reviewer.profile?.username ?? null,
        },
        scores: Object.fromEntries(
          reviewCriteria.map((criterion) => [criterion, review[criterion]]),
        ),
      })),
    };
  }

  private async ensureWallet(userId: string) {
    return prisma.wallet.upsert({
      create: { balanceMinor: 0, currency: "USD", userId },
      update: {},
      where: { userId },
    });
  }
}

type TransactionClient = Prisma.TransactionClient;

async function ensureWalletWithTx(tx: TransactionClient, userId: string) {
  return tx.wallet.upsert({
    create: { balanceMinor: 0, currency: "USD", userId },
    update: {},
    where: { userId },
  });
}

async function settleServiceOrder(
  tx: TransactionClient,
  request: {
    id: string;
    customerId: string;
    providerId: string;
    priceMinor: bigint;
    platformFeeMinor: bigint;
    currency: string;
  },
) {
  const customer = await ensureWalletWithTx(tx, request.customerId);
  if (customer.balanceMinor < request.priceMinor)
    throw new ConflictException({
      code: "INSUFFICIENT_FUNDS",
      message: "Wallet balance is too low.",
    });
  const provider = await ensureWalletWithTx(tx, request.providerId);
  const providerAmount = request.priceMinor - request.platformFeeMinor;
  await Promise.all([
    tx.wallet.update({
      data: { balanceMinor: { decrement: request.priceMinor } },
      where: { id: customer.id },
    }),
    tx.wallet.update({
      data: { balanceMinor: { increment: providerAmount } },
      where: { id: provider.id },
    }),
    tx.walletTransaction.create({
      data: {
        amountMinor: -request.priceMinor,
        currency: request.currency,
        referenceId: request.id,
        referenceType: "service_request",
        type: "PURCHASE",
        walletId: customer.id,
      },
    }),
    tx.walletTransaction.create({
      data: {
        amountMinor: request.priceMinor,
        currency: request.currency,
        referenceId: request.id,
        referenceType: "service_request",
        type: "SALE",
        walletId: provider.id,
      },
    }),
    tx.walletTransaction.create({
      data: {
        amountMinor: -request.platformFeeMinor,
        currency: request.currency,
        note: "Platform commission: 5%",
        referenceId: request.id,
        referenceType: "service_request",
        type: "PLATFORM_FEE",
        walletId: provider.id,
      },
    }),
    tx.payment.create({
      data: {
        amountMinor: request.priceMinor,
        currency: request.currency,
        metadata: {
          platformFeeMinor: request.platformFeeMinor.toString(),
        },
        provider: "wallet",
        providerPaymentId: request.id,
        serviceRequestId: request.id,
        status: "SUCCEEDED",
      },
    }),
  ]);
}

function requiredPositiveMinor(value: unknown, field: string): number {
  return requiredInteger(value, field, 1, 100_000_000);
}

function requiredInteger(
  value: unknown,
  field: string,
  minimum: number,
  maximum: number,
): number {
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < minimum ||
    value > maximum
  ) {
    throw new BadRequestException({
      code: "INVALID_FIELD",
      field,
      message: `${field} must be an integer from ${minimum} to ${maximum}.`,
    });
  }
  return value;
}

function parseStringArray(value: unknown): string[] | undefined {
  if (value === undefined || value === null) return undefined;
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new BadRequestException({
      code: "INVALID_FIELD",
      message: "Attachments must be a list of strings.",
    });
  }
  return value.slice(0, 10).map((item) => item.slice(0, 1000));
}

function serializeMoneyRecord<T extends Record<string, unknown>>(record: T) {
  return serializeValue(record) as {
    [Key in keyof T]: T[Key] extends bigint ? string : T[Key];
  };
}

function serializeValue(value: unknown): unknown {
  if (typeof value === "bigint") return value.toString();
  if (Array.isArray(value)) return value.map(serializeValue);
  if (value && typeof value === "object" && !(value instanceof Date)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, serializeValue(item)]),
    );
  }
  return value;
}
