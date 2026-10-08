import { BadRequestException, ForbiddenException } from "@nestjs/common";
import type { CurrentUser } from "./auth.service.js";
import { asRecord, requiredString } from "./validation.js";

export function parsePhotoTitle(body: unknown): string {
  const title = requiredString(asRecord(body), "title");
  if (title.length > 140 || title.startsWith("__profile_")) {
    throw new BadRequestException({
      code: "INVALID_PHOTO_TITLE",
      message: "Use a title of 1 to 140 characters.",
    });
  }
  return title;
}

export function requirePhotoTitleAccess(
  user: Pick<CurrentUser, "id" | "roles">,
  photo: { readonly ownerId: string; readonly title: string },
): void {
  const administrator = user.roles.some(
    (role) => role === "ADMIN" || role === "SUPER_ADMIN",
  );
  if (photo.ownerId !== user.id && !administrator) {
    throw new ForbiddenException({
      code: "PHOTO_FORBIDDEN",
      message: "Only the author or an administrator can rename this work.",
    });
  }
  if (photo.title.startsWith("__profile_")) {
    throw new BadRequestException({
      code: "PROFILE_ASSET_TITLE",
      message: "Profile images cannot be renamed as portfolio works.",
    });
  }
}
