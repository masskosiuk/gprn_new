import { prisma } from "@gprn/db";
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";

import type { CurrentUser } from "./auth.service.js";
import { asRecord, optionalString, requiredString } from "./validation.js";

const reportStatuses = new Set([
  "OPEN",
  "UNDER_REVIEW",
  "RESOLVED",
  "DISMISSED",
]);
const disputeStatuses = new Set([
  "OPEN",
  "EVIDENCE_REQUESTED",
  "UNDER_REVIEW",
  "RESOLVED",
  "CANCELLED",
]);
const moderationStatuses = new Set([
  "PENDING",
  "APPROVED",
  "REJECTED",
  "UNDER_REVIEW",
]);
const userStatuses = new Set([
  "ACTIVE",
  "SUSPENDED",
  "DELETION_REQUESTED",
  "DELETED",
]);
const profileTiers = new Set([
  "VIEWER",
  "AMATEUR",
  "BEGINNER",
  "EXPERIENCED",
  "PROFESSIONAL",
  "STAR",
]);
const promotionStatuses = new Set([
  "DRAFT",
  "PENDING_PAYMENT",
  "ACTIVE",
  "COMPLETED",
  "CANCELLED",
  "REJECTED",
]);

@Injectable()
export class AdminService {
  async overview() {
    const [
      users,
      photos,
      publishedPhotos,
      battles,
      challenges,
      seasons,
      openReports,
      openDisputes,
      moderationPending,
      flags,
    ] = await Promise.all([
      prisma.user.count(),
      prisma.photo.count({ where: { deletedAt: null } }),
      prisma.photo.count({ where: { deletedAt: null, status: "PUBLISHED" } }),
      prisma.battle.count(),
      prisma.challenge.count(),
      prisma.season.count(),
      prisma.report.count({
        where: { status: { in: ["OPEN", "UNDER_REVIEW"] } },
      }),
      prisma.copyrightDispute.count({
        where: {
          status: { in: ["OPEN", "EVIDENCE_REQUESTED", "UNDER_REVIEW"] },
        },
      }),
      prisma.photo.count({
        where: { moderationStatus: { in: ["PENDING", "UNDER_REVIEW"] } },
      }),
      prisma.featureFlag.findMany({ orderBy: { key: "asc" } }),
    ]);

    return {
      counts: {
        battles,
        challenges,
        moderationPending,
        openDisputes,
        openReports,
        photos,
        publishedPhotos,
        seasons,
        users,
      },
      featureFlags: flags,
    };
  }

  async moderationQueue() {
    const [photos, reports, disputes] = await Promise.all([
      prisma.photo.findMany({
        include: { owner: { include: { profile: true } }, provenance: true },
        orderBy: { updatedAt: "asc" },
        take: 100,
        where: {
          moderationStatus: { in: ["PENDING", "UNDER_REVIEW"] },
          deletedAt: null,
        },
      }),
      prisma.report.findMany({
        include: { photo: true, reporter: { include: { profile: true } } },
        orderBy: { createdAt: "asc" },
        take: 100,
        where: { status: { in: ["OPEN", "UNDER_REVIEW"] } },
      }),
      prisma.copyrightDispute.findMany({
        include: { subjectPhoto: true },
        orderBy: { createdAt: "asc" },
        take: 100,
        where: {
          status: { in: ["OPEN", "EVIDENCE_REQUESTED", "UNDER_REVIEW"] },
        },
      }),
    ]);

    return { disputes, photos, reports };
  }

  async updateReport(actor: CurrentUser, reportId: string, body: unknown) {
    const record = asRecord(body);
    const status = requiredString(record, "status");
    const reason = optionalString(record, "reason")?.slice(0, 2000);
    if (!reportStatuses.has(status)) {
      throw invalidStatus();
    }

    return prisma.$transaction(async (tx) => {
      const previous = await tx.report.findUnique({ where: { id: reportId } });
      if (!previous)
        throw notFound("REPORT_NOT_FOUND", "Report does not exist.");
      const report = await tx.report.update({
        data: { status: status as typeof previous.status },
        where: { id: reportId },
      });
      await tx.auditLog.create({
        data: {
          action: "report.status_changed",
          actorUserId: actor.id,
          next: { status },
          previous: { status: previous.status },
          reason,
          targetId: reportId,
          targetType: "report",
        },
      });
      return { report };
    });
  }

  async updateDispute(actor: CurrentUser, disputeId: string, body: unknown) {
    const record = asRecord(body);
    const status = requiredString(record, "status");
    const reason = optionalString(record, "reason")?.slice(0, 2000);
    if (!disputeStatuses.has(status)) {
      throw invalidStatus();
    }

    return prisma.$transaction(async (tx) => {
      const previous = await tx.copyrightDispute.findUnique({
        where: { id: disputeId },
      });
      if (!previous)
        throw notFound(
          "DISPUTE_NOT_FOUND",
          "Copyright dispute does not exist.",
        );
      const dispute = await tx.copyrightDispute.update({
        data: {
          decision: reason ? { reason } : undefined,
          status: status as typeof previous.status,
        },
        where: { id: disputeId },
      });
      await tx.auditLog.create({
        data: {
          action: "copyright_dispute.status_changed",
          actorUserId: actor.id,
          next: { status },
          previous: { status: previous.status },
          reason,
          targetId: disputeId,
          targetType: "copyright_dispute",
        },
      });
      return { dispute };
    });
  }

  async moderatePhoto(actor: CurrentUser, photoId: string, body: unknown) {
    const record = asRecord(body);
    const moderationStatus = requiredString(record, "moderationStatus");
    const reason = optionalString(record, "reason")?.slice(0, 2000);
    if (!moderationStatuses.has(moderationStatus)) {
      throw invalidStatus();
    }

    return prisma.$transaction(async (tx) => {
      const previous = await tx.photo.findUnique({ where: { id: photoId } });
      if (!previous) throw notFound("PHOTO_NOT_FOUND", "Photo does not exist.");
      const nextPhotoStatus =
        moderationStatus === "REJECTED"
          ? "REJECTED"
          : moderationStatus === "UNDER_REVIEW"
            ? "UNDER_REVIEW"
            : previous.status === "UNDER_REVIEW"
              ? "READY"
              : previous.status;
      const photo = await tx.photo.update({
        data: {
          moderationStatus:
            moderationStatus as typeof previous.moderationStatus,
          status: nextPhotoStatus,
        },
        where: { id: photoId },
      });
      await tx.auditLog.create({
        data: {
          action: "photo.moderated",
          actorUserId: actor.id,
          next: { moderationStatus, status: nextPhotoStatus },
          previous: {
            moderationStatus: previous.moderationStatus,
            status: previous.status,
          },
          reason,
          targetId: photoId,
          targetType: "photo",
        },
      });
      await tx.notification.create({
        data: {
          payload: { moderationStatus, photoId, reason },
          type: "photo_moderated",
          userId: previous.ownerId,
        },
      });
      return { photo };
    });
  }

  async auditLogs() {
    const logs = await prisma.auditLog.findMany({
      orderBy: { createdAt: "desc" },
      take: 250,
    });
    return { logs };
  }

  async paymentHistory() {
    const [payments, walletTransactions, donations] = await Promise.all([
      prisma.payment.findMany({ orderBy: { createdAt: "desc" }, take: 250 }),
      prisma.walletTransaction.findMany({
        orderBy: { createdAt: "desc" },
        take: 250,
      }),
      prisma.donation.findMany({ orderBy: { createdAt: "desc" }, take: 250 }),
    ]);
    return {
      donations: donations.map(serializeMoney),
      payments: payments.map(serializeMoney),
      walletTransactions: walletTransactions.map(serializeMoney),
    };
  }

  async adjustWallet(actor: CurrentUser, userId: string, body: unknown) {
    const record = asRecord(body);
    const amountMinor = record.amountMinor;
    if (
      typeof amountMinor !== "number" ||
      !Number.isInteger(amountMinor) ||
      amountMinor === 0
    ) {
      throw new BadRequestException({
        code: "INVALID_AMOUNT",
        message: "amountMinor must be a non-zero integer.",
      });
    }
    const reason = requiredString(record, "reason").slice(0, 1000);
    return prisma.$transaction(async (tx) => {
      const target = await tx.user.findUnique({ where: { id: userId } });
      if (!target) throw notFound("USER_NOT_FOUND", "User does not exist.");
      const wallet = await tx.wallet.upsert({
        create: { balanceMinor: 0, currency: "USD", userId },
        update: {},
        where: { userId },
      });
      if (wallet.balanceMinor + BigInt(amountMinor) < 0n) {
        throw new BadRequestException({
          code: "NEGATIVE_BALANCE",
          message: "Adjustment would make the balance negative.",
        });
      }
      const updated = await tx.wallet.update({
        data: { balanceMinor: { increment: amountMinor } },
        where: { id: wallet.id },
      });
      const transaction = await tx.walletTransaction.create({
        data: {
          actorUserId: actor.id,
          amountMinor,
          currency: wallet.currency,
          note: reason,
          type: "ADMIN_ADJUSTMENT",
          walletId: wallet.id,
        },
      });
      await tx.auditLog.create({
        data: {
          action: "wallet.adjusted",
          actorUserId: actor.id,
          next: { amountMinor, balanceMinor: updated.balanceMinor.toString() },
          reason,
          targetId: userId,
          targetType: "user",
        },
      });
      return {
        balanceMinor: updated.balanceMinor.toString(),
        transaction: serializeMoney(transaction),
      };
    });
  }

  async updateUser(actor: CurrentUser, userId: string, body: unknown) {
    const record = asRecord(body);
    const status = optionalString(record, "status");
    const tier = optionalString(record, "tier");
    const reason = requiredString(record, "reason").slice(0, 1000);
    if (status && !userStatuses.has(status)) throw invalidStatus();
    if (tier && !profileTiers.has(tier)) throw invalidStatus();
    return prisma.$transaction(async (tx) => {
      const previous = await tx.user.findUnique({
        include: { profile: true },
        where: { id: userId },
      });
      if (!previous) throw notFound("USER_NOT_FOUND", "User does not exist.");
      const user = await tx.user.update({
        data: { status: status as typeof previous.status | undefined },
        where: { id: userId },
      });
      const profile = tier
        ? await tx.profile.update({
            data: {
              tier: tier as NonNullable<typeof previous.profile>["tier"],
            },
            where: { userId },
          })
        : previous.profile;
      await tx.auditLog.create({
        data: {
          action: "user.updated",
          actorUserId: actor.id,
          next: { status: user.status, tier: profile?.tier },
          previous: { status: previous.status, tier: previous.profile?.tier },
          reason,
          targetId: userId,
          targetType: "user",
        },
      });
      return { profile, user };
    });
  }

  async updateRating(actor: CurrentUser, ratingId: string, body: unknown) {
    const record = asRecord(body);
    const rating = record.rating;
    const reason = requiredString(record, "reason").slice(0, 1000);
    if (
      typeof rating !== "number" ||
      !Number.isInteger(rating) ||
      rating < 0 ||
      rating > 10000
    ) {
      throw new BadRequestException({
        code: "INVALID_RATING",
        message: "rating must be an integer from 0 to 10000.",
      });
    }
    return prisma.$transaction(async (tx) => {
      const previous = await tx.rating.findUnique({ where: { id: ratingId } });
      if (!previous)
        throw notFound("RATING_NOT_FOUND", "Rating does not exist.");
      const updated = await tx.rating.update({
        data: { rating },
        where: { id: ratingId },
      });
      await tx.ratingEvent.create({
        data: {
          algorithm: "admin_adjustment",
          delta: rating - previous.rating,
          ratingAfter: rating,
          ratingBefore: previous.rating,
          reason,
          scope: previous.scope,
          scopeKey: previous.scopeKey,
          userId: previous.userId,
        },
      });
      await tx.auditLog.create({
        data: {
          action: "rating.adjusted",
          actorUserId: actor.id,
          next: { rating },
          previous: { rating: previous.rating },
          reason,
          targetId: ratingId,
          targetType: "rating",
        },
      });
      return { rating: updated };
    });
  }

  async updatePromotion(
    actor: CurrentUser,
    promotionId: string,
    body: unknown,
  ) {
    const record = asRecord(body);
    const status = requiredString(record, "status");
    const reason = requiredString(record, "reason").slice(0, 1000);
    if (!promotionStatuses.has(status)) throw invalidStatus();
    return prisma.$transaction(async (tx) => {
      const previous = await tx.promotion.findUnique({
        where: { id: promotionId },
      });
      if (!previous)
        throw notFound("PROMOTION_NOT_FOUND", "Promotion does not exist.");
      const promotion = await tx.promotion.update({
        data: { status: status as typeof previous.status },
        where: { id: promotionId },
      });
      await tx.auditLog.create({
        data: {
          action: "promotion.updated",
          actorUserId: actor.id,
          next: { status },
          previous: { status: previous.status },
          reason,
          targetId: promotionId,
          targetType: "promotion",
        },
      });
      return { promotion: serializeMoney(promotion) };
    });
  }

  async deletePhoto(actor: CurrentUser, photoId: string, body: unknown) {
    const reason = requiredString(asRecord(body), "reason").slice(0, 1000);
    return prisma.$transaction(async (tx) => {
      const previous = await tx.photo.findUnique({ where: { id: photoId } });
      if (!previous) throw notFound("PHOTO_NOT_FOUND", "Photo does not exist.");
      const battleEntries = await tx.battleEntry.findMany({
        select: { battleId: true },
        where: { photoId },
      });
      const photo = await tx.photo.update({
        data: { deletedAt: new Date(), status: "DELETED" },
        where: { id: photoId },
      });
      await tx.promotion.updateMany({
        data: { status: "CANCELLED" },
        where: { photoId },
      });
      await tx.marketplaceProduct.updateMany({
        data: { status: "ARCHIVED" },
        where: { photoId },
      });
      if (battleEntries.length > 0) {
        await tx.battle.updateMany({
          data: { status: "CANCELLED" },
          where: {
            id: { in: battleEntries.map((entry) => entry.battleId) },
          },
        });
      }
      await tx.auditLog.create({
        data: {
          action: "photo.deleted",
          actorUserId: actor.id,
          previous: { status: previous.status },
          reason,
          targetId: photoId,
          targetType: "photo",
        },
      });
      return { photo };
    });
  }

  async deleteUser(actor: CurrentUser, userId: string, body: unknown) {
    const reason = requiredString(asRecord(body), "reason").slice(0, 1000);
    return prisma.$transaction(async (tx) => {
      const previous = await tx.user.findUnique({ where: { id: userId } });
      if (!previous) throw notFound("USER_NOT_FOUND", "User does not exist.");
      const battleEntries = await tx.battleEntry.findMany({
        select: { battleId: true },
        where: { userId },
      });
      const user = await tx.user.update({
        data: { deletedAt: new Date(), status: "DELETED" },
        where: { id: userId },
      });
      await tx.session.updateMany({
        data: { revokedAt: new Date() },
        where: { userId },
      });
      await tx.photo.updateMany({
        data: { deletedAt: new Date(), status: "DELETED" },
        where: { ownerId: userId },
      });
      await tx.promotion.updateMany({
        data: { status: "CANCELLED" },
        where: { ownerId: userId },
      });
      await tx.marketplaceProduct.updateMany({
        data: { status: "ARCHIVED" },
        where: { seller: { userId } },
      });
      if (battleEntries.length > 0) {
        await tx.battle.updateMany({
          data: { status: "CANCELLED" },
          where: {
            id: { in: battleEntries.map((entry) => entry.battleId) },
          },
        });
      }
      await tx.auditLog.create({
        data: {
          action: "user.deleted",
          actorUserId: actor.id,
          previous: { status: previous.status },
          reason,
          targetId: userId,
          targetType: "user",
        },
      });
      return { user };
    });
  }
}

function invalidStatus(): BadRequestException {
  return new BadRequestException({
    code: "INVALID_STATUS",
    message: "Status is not supported.",
  });
}

function notFound(code: string, message: string): NotFoundException {
  return new NotFoundException({ code, message });
}

function serializeMoney<T extends Record<string, unknown>>(record: T) {
  return Object.fromEntries(
    Object.entries(record).map(([key, value]) => [
      key,
      typeof value === "bigint" ? value.toString() : value,
    ]),
  );
}
