import {
  BadRequestException,
  ForbiddenException,
  HttpException,
} from "@nestjs/common";
import {
  asRecord,
  requiredString,
  optionalString,
  optionalEnum,
} from "./validation.js";

export const communityKinds = ["EVENT", "DISCUSSION", "CASTING"] as const;
export type CommunityKind = (typeof communityKinds)[number];
export const publicationIntervalMs = 72 * 60 * 60 * 1000;

export function communityKind(value: unknown): CommunityKind {
  if (
    typeof value !== "string" ||
    !communityKinds.includes(value as CommunityKind)
  )
    throw new BadRequestException({ code: "COMMUNITY_KIND_INVALID" });
  return value as CommunityKind;
}

export function requireUuid(value: string) {
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    )
  )
    throw new BadRequestException({ code: "INVALID_ID" });
  return value;
}

export function boundedText(value: string, max: number) {
  if (value.length > max || /[\u0000\u0008\u000b\u000c]/.test(value))
    throw new BadRequestException({ code: "TEXT_INVALID" });
  return value;
}

export function parseCommunityPost(body: unknown) {
  const record = asRecord(body);
  const kind = communityKind(record.kind);
  const startsAt = new Date(requiredString(record, "startsAt"));
  const end = optionalString(record, "endsAt");
  const endsAt = end ? new Date(end) : null;
  const language = requiredString(record, "language");
  if (
    !/^[a-z]{2,3}(?:-[A-Z]{2})?$/.test(language) ||
    !Number.isFinite(startsAt.getTime()) ||
    (endsAt && (!Number.isFinite(endsAt.getTime()) || endsAt < startsAt))
  )
    throw new BadRequestException({ code: "COMMUNITY_DATES_INVALID" });
  return {
    kind,
    startsAt,
    endsAt,
    language,
    sourceType: optionalEnum(record, "sourceType", [
      "PHOTO",
      "POST",
      "PROFILE",
      "PRODUCT",
    ] as const),
    sourceId: optionalString(record, "sourceId"),
    locale: /^[a-z]{2}$/.test(String(record.locale))
      ? String(record.locale)
      : "en",
    title: boundedText(requiredString(record, "title"), 180),
    body: boundedText(requiredString(record, "body"), 10000),
    location: boundedText(requiredString(record, "location"), 180),
    coverDataUrl: optionalString(record, "coverDataUrl"),
  };
}

export function checkPublicationAccess(
  kind: CommunityKind,
  proUntil: Date | null | undefined,
  lastCreatedAt?: Date,
  now = new Date(),
) {
  const isPro = Boolean(proUntil && proUntil > now);
  if (kind === "EVENT" && !isPro)
    throw new ForbiddenException({ code: "PRO_REQUIRED" });
  if (
    !isPro &&
    lastCreatedAt &&
    now.getTime() - lastCreatedAt.getTime() < publicationIntervalMs
  )
    throw new HttpException(
      {
        code: "COMMUNITY_COOLDOWN",
        nextAllowedAt: new Date(
          lastCreatedAt.getTime() + publicationIntervalMs,
        ).toISOString(),
      },
      429,
    );
}

export function parseInquiry(body: unknown) {
  const record = asRecord(body);
  const kind =
    optionalEnum(record, "kind", ["SUGGESTION", "REPORT"] as const) ??
    "SUGGESTION";
  const targetType = optionalEnum(record, "targetType", [
    "PHOTO",
    "PROFILE",
    "MODEL",
    "STUDIO",
    "POST",
    "PRODUCT",
    "BATTLE",
    "CHALLENGE",
    "COMMENT",
  ] as const);
  const targetId = optionalString(record, "targetId");
  const targetPath = optionalString(record, "targetPath");
  if (kind === "REPORT" && (!targetType || !targetId))
    throw new BadRequestException({ code: "REPORT_TARGET_REQUIRED" });
  if (
    targetPath &&
    (!/^\/[a-z]{2}\/(?:profile|models|studios|discover|video|feed|events|discussions|search|marketplace|battles|challenges)(?:[/?#]|$)/.test(
      targetPath,
    ) ||
      targetPath.includes("\\") ||
      targetPath.length > 500)
  )
    throw new BadRequestException({ code: "REPORT_PATH_INVALID" });
  return {
    kind,
    targetType,
    targetId: targetId ? boundedText(targetId, 160) : undefined,
    targetPath,
    body: boundedText(requiredString(record, "body"), 10000),
    imageDataUrl: optionalString(record, "imageDataUrl"),
  };
}
