import { prisma } from "@gprn/db";
import { Injectable, NotFoundException } from "@nestjs/common";

import type { CurrentUser } from "./auth.service.js";

@Injectable()
export class NotificationsService {
  async listMine(user: CurrentUser) {
    const notifications = await prisma.notification.findMany({
      orderBy: { createdAt: "desc" },
      take: 100,
      where: {
        status: { not: "ARCHIVED" },
        userId: user.id
      }
    });

    return {
      notifications: notifications.map((notification) => ({
        createdAt: notification.createdAt.toISOString(),
        id: notification.id,
        payload: notification.payload,
        readAt: notification.readAt?.toISOString() ?? null,
        status: notification.status,
        type: notification.type
      })),
      unreadCount: notifications.filter((notification) => notification.status === "UNREAD").length
    };
  }

  async markRead(user: CurrentUser, notificationId: string) {
    const notification = await prisma.notification.findFirst({
      where: { id: notificationId, userId: user.id }
    });

    if (!notification) {
      throw new NotFoundException({ code: "NOTIFICATION_NOT_FOUND", message: "Notification does not exist." });
    }

    const updated = await prisma.notification.update({
      data: { readAt: notification.readAt ?? new Date(), status: "READ" },
      where: { id: notification.id }
    });

    return { id: updated.id, readAt: updated.readAt?.toISOString() ?? null, status: updated.status };
  }
}
