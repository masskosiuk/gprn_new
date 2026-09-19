import { prisma } from "@gprn/db";
import { BadRequestException, Injectable } from "@nestjs/common";

import type { CurrentUser } from "./auth.service.js";
import { asRecord, requiredString } from "./validation.js";

const allowedEvents = new Set([
  "app_opened",
  "battle_viewed",
  "challenge_viewed",
  "discover_filter_changed",
  "language_changed",
  "photo_shared",
  "profile_viewed",
  "season_viewed"
]);

@Injectable()
export class AnalyticsService {
  async track(user: CurrentUser | null, body: unknown) {
    const record = asRecord(body);
    const eventName = requiredString(record, "eventName");

    if (!allowedEvents.has(eventName)) {
      throw new BadRequestException({ code: "ANALYTICS_EVENT_NOT_ALLOWED", message: "This event name is not allowed." });
    }

    const payload = record.payload;
    const event = await prisma.analyticsEvent.create({
      data: {
        eventName,
        payload: payload && typeof payload === "object" && !Array.isArray(payload) ? payload : undefined,
        userId: user?.id
      }
    });

    return { accepted: true, eventId: event.id };
  }
}
