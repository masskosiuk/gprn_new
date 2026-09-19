import { prisma } from "@gprn/db";
import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";

import type { CurrentUser } from "./auth.service.js";
import { asRecord, optionalString, requiredString } from "./validation.js";

@Injectable()
export class ReportsService {
  async listMine(user: CurrentUser) {
    const [reports, disputes] = await Promise.all([
      prisma.report.findMany({ orderBy: { createdAt: "desc" }, take: 100, where: { reporterId: user.id } }),
      prisma.copyrightDispute.findMany({
        orderBy: { createdAt: "desc" },
        take: 100,
        where: { claimantUserId: user.id }
      })
    ]);

    return { disputes, reports };
  }

  async create(user: CurrentUser, body: unknown) {
    const record = asRecord(body);
    const photoId = optionalString(record, "photoId");
    const targetUserId = optionalString(record, "targetUserId");
    const type = requiredString(record, "type").slice(0, 80);
    const reason = optionalString(record, "reason")?.slice(0, 2000);

    if (!photoId && !targetUserId) {
      throw new BadRequestException({
        code: "REPORT_TARGET_REQUIRED",
        message: "A photoId or targetUserId is required."
      });
    }

    if (photoId && !(await prisma.photo.findUnique({ select: { id: true }, where: { id: photoId } }))) {
      throw new NotFoundException({ code: "PHOTO_NOT_FOUND", message: "Photo does not exist." });
    }

    if (targetUserId && !(await prisma.user.findUnique({ select: { id: true }, where: { id: targetUserId } }))) {
      throw new NotFoundException({ code: "USER_NOT_FOUND", message: "User does not exist." });
    }

    const report = await prisma.$transaction(async (tx) => {
      const saved = await tx.report.create({
        data: { photoId, reason, reporterId: user.id, targetUserId, type }
      });

      await tx.analyticsEvent.create({
        data: { eventName: "report_created", payload: { reportId: saved.id, type }, userId: user.id }
      });

      return saved;
    });

    return { report };
  }

  async createCopyrightDispute(user: CurrentUser, body: unknown) {
    const record = asRecord(body);
    const subjectPhotoId = requiredString(record, "subjectPhotoId");
    const claimSummary = requiredString(record, "claimSummary").slice(0, 4000);
    const evidence = record.evidence;

    const photo = await prisma.photo.findUnique({ select: { id: true }, where: { id: subjectPhotoId } });
    if (!photo) {
      throw new NotFoundException({ code: "PHOTO_NOT_FOUND", message: "Photo does not exist." });
    }

    const dispute = await prisma.$transaction(async (tx) => {
      const saved = await tx.copyrightDispute.create({
        data: {
          claimSummary,
          claimantUserId: user.id,
          evidence: evidence && typeof evidence === "object" && !Array.isArray(evidence) ? evidence : undefined,
          subjectPhotoId
        }
      });

      await tx.photo.update({
        data: { moderationStatus: "UNDER_REVIEW", status: "UNDER_REVIEW" },
        where: { id: subjectPhotoId }
      });
      await tx.auditLog.create({
        data: {
          action: "copyright_dispute.created",
          actorUserId: user.id,
          next: { disputeId: saved.id, status: saved.status },
          targetId: subjectPhotoId,
          targetType: "photo"
        }
      });

      return saved;
    });

    return { dispute };
  }
}
