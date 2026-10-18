import { prisma, Prisma } from "@gprn/db";
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from "@nestjs/common";
import type { CurrentUser } from "./auth.service.js";
import { requireUuid } from "./community-policy.js";
import { asRecord } from "./validation.js";

export const portfolioPhotoOrder = [
  { portfolioPosition: { sort: "asc", nulls: "last" } },
  { createdAt: "desc" },
  { id: "asc" },
] satisfies Prisma.PhotoOrderByWithRelationInput[];

export const feedPhotoOrder = [
  { feedPosition: { sort: "asc", nulls: "last" } },
  { publishedAt: "desc" },
  { id: "asc" },
] satisfies Prisma.PhotoOrderByWithRelationInput[];

export function parseGalleryMove(body: unknown) {
  const input = asRecord(body);
  if (
    (input.scope !== "PORTFOLIO" && input.scope !== "FEED") ||
    (input.placement !== "before" && input.placement !== "after") ||
    typeof input.photoId !== "string" ||
    typeof input.targetId !== "string"
  )
    throw new BadRequestException({ code: "GALLERY_MOVE_INVALID" });
  requireUuid(input.photoId);
  requireUuid(input.targetId);
  if (input.photoId === input.targetId)
    throw new BadRequestException({ code: "GALLERY_MOVE_INVALID" });
  return {
    scope: input.scope,
    placement: input.placement,
    photoId: input.photoId,
    targetId: input.targetId,
  };
}

export async function moveGalleryPhoto(
  user: CurrentUser,
  body: unknown,
  client: Pick<typeof prisma, "$transaction"> = prisma,
) {
  const move = parseGalleryMove(body);
  if (
    move.scope === "FEED" &&
    !user.roles.some((role) => role === "ADMIN" || role === "SUPER_ADMIN")
  )
    throw new ForbiddenException({ code: "GALLERY_ORDER_FORBIDDEN" });
  const field = move.scope === "FEED" ? "feedPosition" : "portfolioPosition";
  return client.$transaction(
    async (tx) => {
      const lock =
        move.scope === "FEED" ? "gallery:feed" : `gallery:portfolio:${user.id}`;
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${lock}))`;
      const photos = await tx.photo.findMany({
        select: { id: true, feedPosition: true, portfolioPosition: true },
        where: {
          deletedAt: null,
          NOT: { title: { startsWith: "__profile_" } },
          ...(move.scope === "PORTFOLIO"
            ? { ownerId: user.id }
            : {
                status: "PUBLISHED",
                visibility: "PUBLIC",
                moderationStatus: "APPROVED",
                owner: {
                  status: "ACTIVE",
                  profile: { visibility: "PUBLIC", deletedAt: null },
                },
              }),
        },
        orderBy: move.scope === "FEED" ? feedPhotoOrder : portfolioPhotoOrder,
        take: 10001,
      });
      if (photos.length > 10000)
        throw new BadRequestException({ code: "GALLERY_ORDER_LIMIT" });
      if (
        !photos.some((photo) => photo.id === move.photoId) ||
        !photos.some((photo) => photo.id === move.targetId)
      )
        throw new NotFoundException({ code: "GALLERY_WORK_UNAVAILABLE" });
      const ids = photos
        .map((photo) => photo.id)
        .filter((id) => id !== move.photoId);
      ids.splice(
        ids.indexOf(move.targetId) + (move.placement === "after" ? 1 : 0),
        0,
        move.photoId,
      );
      const positions = new Map(
        photos.map((photo) => [photo.id, photo[field]]),
      );
      const changed = ids
        .map((id, position) => ({ id, position }))
        .filter(({ id, position }) => positions.get(id) !== position);
      if (changed.length) {
        // Field names are selected above, while all IDs and positions remain SQL parameters.
        await tx.$executeRaw(Prisma.sql`
        UPDATE "photos" SET ${Prisma.raw(`"${field}"`)} = CASE "id"
          ${Prisma.join(
            changed.map(
              ({ id, position }) =>
                Prisma.sql`WHEN ${id}::uuid THEN ${position}::integer`,
            ),
            " ",
          )}
          END
        WHERE "id" IN (${Prisma.join(changed.map(({ id }) => Prisma.sql`${id}::uuid`))})
      `);
        await tx.auditLog.create({
          data: {
            actorUserId: user.id,
            action: "gallery_order_changed",
            targetType: "gallery",
            targetId: move.scope === "FEED" ? "feed" : user.id,
            next: move,
          },
        });
      }
      return { scope: move.scope, photoIds: ids };
    },
    { timeout: 15000 },
  );
}
