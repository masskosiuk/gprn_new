import { BadRequestException } from "@nestjs/common";

export function mediaCatalogFilter(mediaType?: string) {
  if (mediaType && mediaType !== "PHOTO" && mediaType !== "VIDEO") {
    throw new BadRequestException({
      code: "INVALID_MEDIA_TYPE",
      message: "Choose PHOTO or VIDEO.",
    });
  }
  const video = {
    some: {
      type: { in: ["DISPLAY" as const, "ORIGINAL" as const] },
      contentType: { startsWith: "video/", mode: "insensitive" as const },
    },
  };
  if (mediaType === "VIDEO") return { assets: video };
  if (mediaType === "PHOTO")
    return {
      NOT: { assets: video },
      assets: {
        some: {
          type: { in: ["DISPLAY" as const, "ORIGINAL" as const] },
          contentType: { startsWith: "image/", mode: "insensitive" as const },
        },
      },
    };
  return {};
}
