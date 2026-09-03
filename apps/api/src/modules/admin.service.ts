import { prisma } from "@gprn/db";
import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";

import type { CurrentUser } from "./auth.service.js";
import { asRecord, optionalString, requiredString } from "./validation.js";

const reportStatuses = new Set(["OPEN", "UNDER_REVIEW", "RESOLVED", "DISMISSED"]);
const disputeStatuses = new Set(["OPEN", "EVIDENCE_REQUESTED", "UNDER_REVIEW", "RESOLVED", "CANCELLED"]);
const moderationStatuses = new Set(["PENDING", "APPROVED", "REJECTED", "UNDER_REVIEW"]);

@Injectable()
export class AdminService {
  async overview() {
    const [users, photos, publishedPhotos, battles, challenges, seasons, openReports, openDisputes, moderationPending, flags] =
      await Promise.all([
        prisma.user.count(),
        prisma.photo.count({ where: { deletedAt: null } }),
        prisma.photo.count({ where: { deletedAt: null, status: "PUBLISHED" } }),
        prisma.battle.count(),
        prisma.challenge.count(),
        prisma.season.count(),
        prisma.report.count({ where: { status: { in: ["OPEN", "UNDER_REVIEW"] } } }),
        prisma.copyrightDispute.count({ where: { status: { in: ["OPEN", "EVIDENCE_REQUESTED", "UNDER_REVIEW"] } } }),
        prisma.photo.count({ where: { moderationStatus: { in: ["PENDING", "UNDER_REVIEW"] } } }),
        prisma.featureFlag.findMany({ orderBy: { key: "asc" } })
      ]);

    return {
      counts: { battles, challenges, moderationPending, openDisputes, openReports, photos, publishedPhotos, seasons, users },
      featureFlags: flags
    };
  }

  async moderationQueue() {
    const [photos, reports, disputes] = await Promise.all([
      prisma.photo.findMany({
        include: { owner: { include: { profile: true } }, provenance: true },
        orderBy: { updatedAt: "asc" },
        take: 100,
        where: { moderationStatus: { in: ["PENDING", "UNDER_REVIEW"] }, deletedAt: null }
      }),
      prisma.report.findMany({
        include: { photo: true, reporter: { include: { profile: true } } },
        orderBy: { createdAt: "asc" },
        take: 100,
        where: { status: { in: ["OPEN", "UNDER_REVIEW"] } }
      }),
      prisma.copyrightDispute.findMany({
        include: { subjectPhoto: true },
        orderBy: { createdAt: "asc" },
        take: 100,
        where: { status: { in: ["OPEN", "EVIDENCE_REQUESTED", "UNDER_REVIEW"] } }
      })
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
      if (!previous) throw notFound("REPORT_NOT_FOUND", "Report does not exist.");
      const report = await tx.report.update({ data: { status: status as typeof previous.status }, where: { id: reportId } });
      await tx.auditLog.create({
        data: {
          action: "report.status_changed",
          actorUserId: actor.id,
          next: { status },
          previous: { status: previous.status },
          reason,
          targetId: reportId,
          targetType: "report"
        }
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
      const previous = await tx.copyrightDispute.findUnique({ where: { id: disputeId } });
      if (!previous) throw notFound("DISPUTE_NOT_FOUND", "Copyright dispute does not exist.");
      const dispute = await tx.copyrightDispute.update({
        data: { decision: reason ? { reason } : undefined, status: status as typeof previous.status },
        where: { id: disputeId }
      });
      await tx.auditLog.create({
        data: {
          action: "copyright_dispute.status_changed",
          actorUserId: actor.id,
          next: { status },
          previous: { status: previous.status },
          reason,
          targetId: disputeId,
          targetType: "copyright_dispute"
        }
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
        data: { moderationStatus: moderationStatus as typeof previous.moderationStatus, status: nextPhotoStatus },
        where: { id: photoId }
      });
      await tx.auditLog.create({
        data: {
          action: "photo.moderated",
          actorUserId: actor.id,
          next: { moderationStatus, status: nextPhotoStatus },
          previous: { moderationStatus: previous.moderationStatus, status: previous.status },
          reason,
          targetId: photoId,
          targetType: "photo"
        }
      });
      await tx.notification.create({
        data: { payload: { moderationStatus, photoId, reason }, type: "photo_moderated", userId: previous.ownerId }
      });
      return { photo };
    });
  }
}

function invalidStatus(): BadRequestException {
  return new BadRequestException({ code: "INVALID_STATUS", message: "Status is not supported." });
}

function notFound(code: string, message: string): NotFoundException {
  return new NotFoundException({ code, message });
}
