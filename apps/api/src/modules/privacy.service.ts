import { prisma } from "@gprn/db";
import { Injectable, NotFoundException } from "@nestjs/common";

import type { CurrentUser } from "./auth.service.js";

@Injectable()
export class PrivacyService {
  async exportMine(user: CurrentUser) {
    const [account, photos, achievements, connections, notifications, battleVotes, challengeEntries, seasons, reports, disputes] =
      await Promise.all([
        prisma.user.findUnique({
          select: {
            createdAt: true,
            email: true,
            emailVerifiedAt: true,
            id: true,
            profile: { include: { city: true, country: true, region: true } },
            ratings: true,
            roles: { include: { role: true } },
            status: true,
            updatedAt: true
          },
          where: { id: user.id }
        }),
        prisma.photo.findMany({
          include: {
            assets: true,
            category: true,
            hashes: true,
            location: true,
            metadata: true,
            provenance: true,
            provenanceEvents: true,
            versions: true
          },
          orderBy: { createdAt: "desc" },
          where: { ownerId: user.id }
        }),
        prisma.userAchievement.findMany({ include: { achievement: true }, where: { userId: user.id } }),
        prisma.externalConnection.findMany({
          select: {
            connectionType: true,
            createdAt: true,
            disconnectedAt: true,
            id: true,
            provider: true,
            scopes: true,
            updatedAt: true
          },
          where: { userId: user.id }
        }),
        prisma.notification.findMany({ orderBy: { createdAt: "desc" }, where: { userId: user.id } }),
        prisma.battleVote.findMany({ orderBy: { createdAt: "desc" }, where: { voterId: user.id } }),
        prisma.challengeEntry.findMany({ orderBy: { submittedAt: "desc" }, where: { userId: user.id } }),
        prisma.seasonParticipant.findMany({ orderBy: { joinedAt: "desc" }, where: { userId: user.id } }),
        prisma.report.findMany({ orderBy: { createdAt: "desc" }, where: { reporterId: user.id } }),
        prisma.copyrightDispute.findMany({ orderBy: { createdAt: "desc" }, where: { claimantUserId: user.id } })
      ]);

    if (!account) {
      throw new NotFoundException({ code: "USER_NOT_FOUND", message: "User does not exist." });
    }

    return {
      account,
      achievements,
      battleVotes,
      challengeEntries,
      connections,
      disputes,
      exportedAt: new Date().toISOString(),
      notifications,
      photos: photos.map((photo) => ({
        ...photo,
        assets: photo.assets.map((asset) => ({ ...asset, byteSize: asset.byteSize.toString() }))
      })),
      reports,
      seasons
    };
  }

  async requestDeletion(user: CurrentUser) {
    const updated = await prisma.$transaction(async (tx) => {
      const saved = await tx.user.update({ data: { status: "DELETION_REQUESTED" }, where: { id: user.id } });
      await tx.auditLog.create({
        data: {
          action: "account.deletion_requested",
          actorUserId: user.id,
          next: { status: saved.status },
          previous: { status: user.status },
          targetId: user.id,
          targetType: "user"
        }
      });
      await tx.notification.create({ data: { type: "account_deletion_requested", userId: user.id } });
      return saved;
    });

    return { requestedAt: updated.updatedAt.toISOString(), status: updated.status };
  }

  async listConnections(user: CurrentUser) {
    return {
      connections: await prisma.externalConnection.findMany({
        select: {
          connectionType: true,
          createdAt: true,
          disconnectedAt: true,
          id: true,
          provider: true,
          scopes: true
        },
        where: { userId: user.id }
      })
    };
  }

  async disconnect(user: CurrentUser, connectionId: string) {
    const result = await prisma.externalConnection.updateMany({
      data: { disconnectedAt: new Date(), encryptedAccessToken: null, encryptedRefreshToken: null },
      where: { disconnectedAt: null, id: connectionId, userId: user.id }
    });

    if (result.count === 0) {
      throw new NotFoundException({ code: "CONNECTION_NOT_FOUND", message: "Connected source does not exist." });
    }

    return { disconnected: true, id: connectionId, importedPhotosPreserved: true };
  }
}
