import type { Prisma } from "@gprn/db";
import { FREE_MEDIA_FILE_LIMIT, isProfileImageTitle } from "@gprn/domain";
import type { S3ObjectStorage, StoredObjectInput } from "@gprn/storage";
import { ConflictException, ServiceUnavailableException } from "@nestjs/common";

export async function requirePhotoUploadCapacity(
  db: Pick<Prisma.TransactionClient, "photo">,
  userId: string,
  title?: string,
) {
  if (isProfileImageTitle(title)) return;
  const used = await db.photo.count({
    where: {
      ownerId: userId,
      deletedAt: null,
      NOT: { title: { startsWith: "__profile_" } },
    },
  });
  if (used >= FREE_MEDIA_FILE_LIMIT)
    throw new ConflictException({
      code: "PHOTO_STORAGE_LIMIT",
      limit: FREE_MEDIA_FILE_LIMIT,
      used,
      message:
        "Your account already contains the maximum number of free media files.",
    });
}

// All keys belong to this new upload. Wait for every write before cleanup, including partial failures.
export async function withPhotoUploads<T>(
  storage: Pick<S3ObjectStorage, "putObject" | "deleteObject">,
  objects: readonly StoredObjectInput[],
  commit: () => Promise<T>,
): Promise<T> {
  try {
    const results = await Promise.allSettled(
      objects.map((object) => storage.putObject(object)),
    );
    const failure = results.find((result) => result.status === "rejected");
    if (failure?.status === "rejected") throw failure.reason;
    return await commit();
  } catch (error) {
    const cleanup = await Promise.allSettled(
      objects.map((object) => storage.deleteObject(object.bucket, object.key)),
    );
    if (cleanup.some((result) => result.status === "rejected"))
      throw new ServiceUnavailableException({
        code: "PHOTO_UPLOAD_CLEANUP_FAILED",
        message: "The upload could not be completed. Please retry later.",
      });
    throw error;
  }
}
