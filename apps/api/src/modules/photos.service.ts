import { loadRuntimeEnv } from "@gprn/config";
import { prisma } from "@gprn/db";
import { S3ObjectStorage } from "@gprn/storage";
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException
} from "@nestjs/common";
import { createHash, randomUUID } from "node:crypto";
import sharp, { type Metadata } from "sharp";

import type { CurrentUser } from "./auth.service.js";
import { bigintToString, dateToIso, publicAssetUrl } from "./serialization.js";
import { asRecord, optionalEnum, optionalString, requiredString } from "./validation.js";

const allowedMimeTypes = [
  "image/avif",
  "image/heic",
  "image/heif",
  "image/jpeg",
  "image/png",
  "image/tiff",
  "image/webp"
] as const;

const allowedVisibility = ["PUBLIC", "FOLLOWERS", "PRIVATE"] as const;
const allowedLocationVisibility = ["EXACT", "APPROXIMATE", "CITY", "COUNTRY", "HIDDEN"] as const;
const maxUploadBytes = 18 * 1024 * 1024;

type PrismaTx = Omit<
  typeof prisma,
  "$connect" | "$disconnect" | "$extends" | "$on" | "$transaction" | "$use"
>;

interface AddPhotoInput {
  readonly categorySlug?: string;
  readonly dataUrl: string;
  readonly description?: string;
  readonly fileName: string;
  readonly locationLabel?: string;
  readonly locationVisibility: (typeof allowedLocationVisibility)[number];
  readonly mimeType: (typeof allowedMimeTypes)[number];
  readonly title: string;
  readonly visibility: (typeof allowedVisibility)[number];
}

interface PublishPhotoInput {
  readonly locationVisibility?: (typeof allowedLocationVisibility)[number];
  readonly visibility: (typeof allowedVisibility)[number];
}

interface PhotoRecord {
  readonly _count?: {
    readonly battleEntries: number;
    readonly challengeEntries: number;
    readonly disputesAsSubject: number;
  };
  readonly id: string;
  readonly categoryId: string | null;
  readonly title: string;
  readonly description: string | null;
  readonly status: string;
  readonly visibility: string;
  readonly moderationStatus: string;
  readonly publishedAt: Date | null;
  readonly createdAt: Date;
  readonly category: {
    readonly slug: string;
    readonly nameKey: string;
  } | null;
  readonly owner: {
    readonly id: string;
    readonly profile: {
      readonly username: string;
      readonly displayName: string;
    } | null;
  };
  readonly assets: readonly {
    readonly type: string;
    readonly storageKey: string;
    readonly byteSize: bigint;
    readonly width: number | null;
    readonly height: number | null;
  }[];
  readonly metadata: {
    readonly cameraMake: string | null;
    readonly cameraModel: string | null;
    readonly lensModel: string | null;
    readonly capturedAt: Date | null;
    readonly exifJson: unknown;
  } | null;
  readonly location: {
    readonly publicLabel: string | null;
    readonly visibility: string;
    readonly precision: string;
  } | null;
  readonly provenance: {
    readonly status: string;
    readonly originalFileDetected: boolean;
    readonly metadataDetected: boolean;
    readonly captureDateDetected: boolean;
    readonly gpsDetected: boolean;
    readonly duplicateCheckStatus: string | null;
  } | null;
}

interface ImageRenditions {
  readonly display: {
    readonly buffer: Buffer;
    readonly height?: number;
    readonly width?: number;
  };
  readonly hasExif: boolean;
  readonly height?: number;
  readonly metadataSummary: Record<string, unknown>;
  readonly perceptualHash: string;
  readonly sha256: string;
  readonly thumbnail: {
    readonly buffer: Buffer;
    readonly height?: number;
    readonly width?: number;
  };
  readonly width?: number;
}

const photoInclude = {
  _count: {
    select: {
      battleEntries: true,
      challengeEntries: true,
      disputesAsSubject: true
    }
  },
  assets: true,
  category: true,
  location: true,
  metadata: true,
  owner: {
    include: {
      profile: true
    }
  },
  provenance: true
} as const;

@Injectable()
export class PhotosService {
  private readonly env = loadRuntimeEnv();
  private readonly storage = new S3ObjectStorage({
    accessKeyId: this.env.S3_ACCESS_KEY,
    endpoint: this.env.S3_ENDPOINT,
    forcePathStyle: this.env.S3_FORCE_PATH_STYLE,
    region: this.env.S3_REGION,
    secretAccessKey: this.env.S3_SECRET_KEY
  });

  getImportSources(): {
    sources: readonly {
      readonly id: string;
      readonly label: string;
      readonly status: "AVAILABLE" | "COMING_SOON";
    }[];
  } {
    return {
      sources: [
        {
          id: "device",
          label: "Upload from Device",
          status: "AVAILABLE"
        },
        {
          id: "google-drive",
          label: "Google Drive",
          status: "COMING_SOON"
        },
        {
          id: "dropbox",
          label: "Dropbox",
          status: "COMING_SOON"
        },
        {
          id: "adobe",
          label: "Adobe",
          status: "COMING_SOON"
        },
        {
          id: "onedrive",
          label: "OneDrive",
          status: "COMING_SOON"
        },
        {
          id: "flickr",
          label: "Flickr",
          status: "COMING_SOON"
        },
        {
          id: "500px",
          label: "500px",
          status: "COMING_SOON"
        },
        {
          id: "behance",
          label: "Behance",
          status: "COMING_SOON"
        },
        {
          id: "connected-source",
          label: "Connected Source",
          status: "COMING_SOON"
        }
      ]
    };
  }

  async addFromDevice(user: CurrentUser, body: unknown): Promise<{
    duplicate: "NO_MATCH" | "EXACT_MATCH";
    photo: ReturnType<PhotosService["toPhotoResponse"]>;
    provenance: ReturnType<PhotosService["toProvenanceSummary"]>;
  }> {
    const input = parseAddPhotoInput(body);
    const decoded = decodeDataUrl(input.dataUrl, input.mimeType);

    if (decoded.byteLength > maxUploadBytes) {
      throw new BadRequestException({
        code: "PHOTO_TOO_LARGE",
        message: "The selected image is too large for the MVP upload limit."
      });
    }

    const category = input.categorySlug
      ? await prisma.category.findUnique({
          where: {
            slug: input.categorySlug
          }
        })
      : null;

    if (input.categorySlug && !category) {
      throw new BadRequestException({
        code: "CATEGORY_NOT_FOUND",
        message: "Selected category does not exist."
      });
    }

    const renditions = await createImageRenditions(decoded);
    const existingHash = await prisma.photoHash.findFirst({
      where: {
        algorithm: "SHA256",
        value: renditions.sha256
      }
    });
    const duplicateStatus = existingHash ? "EXACT_MATCH" : "NO_MATCH";
    const photoId = randomUUID();
    const storageKeys = createPhotoStorageKeys(user.id, photoId, input.fileName);

    await Promise.all([
      this.storage.putObject({
        body: decoded,
        bucket: this.env.S3_BUCKET_PRIVATE,
        contentType: input.mimeType,
        key: storageKeys.original
      }),
      this.storage.putObject({
        body: renditions.display.buffer,
        bucket: this.env.S3_BUCKET_PUBLIC,
        contentType: "image/webp",
        key: storageKeys.display
      }),
      this.storage.putObject({
        body: renditions.thumbnail.buffer,
        bucket: this.env.S3_BUCKET_PUBLIC,
        contentType: "image/webp",
        key: storageKeys.thumbnail
      })
    ]);

    const photo = await prisma.$transaction(async (tx) => {
      await this.ensurePhotographerFoundation(tx, user.id);

      const createdPhoto = await tx.photo.create({
        data: {
          assets: {
            create: [
              {
                bucket: this.env.S3_BUCKET_PRIVATE,
                byteSize: BigInt(decoded.byteLength),
                checksumSha256: renditions.sha256,
                contentType: input.mimeType,
                height: renditions.height,
                storageKey: storageKeys.original,
                storageVisibility: "PRIVATE",
                type: "ORIGINAL",
                width: renditions.width
              },
              {
                bucket: this.env.S3_BUCKET_PUBLIC,
                byteSize: BigInt(renditions.display.buffer.byteLength),
                checksumSha256: sha256(renditions.display.buffer),
                contentType: "image/webp",
                height: renditions.display.height,
                storageKey: storageKeys.display,
                storageVisibility: "PUBLIC",
                type: "DISPLAY",
                width: renditions.display.width
              },
              {
                bucket: this.env.S3_BUCKET_PUBLIC,
                byteSize: BigInt(renditions.thumbnail.buffer.byteLength),
                checksumSha256: sha256(renditions.thumbnail.buffer),
                contentType: "image/webp",
                height: renditions.thumbnail.height,
                storageKey: storageKeys.thumbnail,
                storageVisibility: "PUBLIC",
                type: "THUMBNAIL",
                width: renditions.thumbnail.width
              }
            ]
          },
          categoryId: category?.id,
          description: input.description,
          hashes: {
            create: [
              {
                algorithm: "SHA256",
                value: renditions.sha256
              },
              {
                algorithm: "PHASH",
                value: renditions.perceptualHash
              }
            ]
          },
          id: photoId,
          location: {
            create: {
              precision: input.locationLabel ? "CITY" : "UNKNOWN",
              publicLabel: input.locationLabel,
              source: input.locationLabel ? "USER_ENTERED" : undefined,
              visibility: input.locationVisibility
            }
          },
          metadata: {
            create: {
              exifJson: JSON.parse(JSON.stringify(renditions.metadataSummary)),
              orientation: stringifyMetadataValue(renditions.metadataSummary.orientation)
            }
          },
          moderationStatus: duplicateStatus === "EXACT_MATCH" ? "UNDER_REVIEW" : "APPROVED",
          ownerId: user.id,
          provenance: {
            create: {
              captureDateDetected: false,
              duplicateCheckStatus: duplicateStatus,
              gpsDetected: false,
              metadataDetected: renditions.hasExif,
              originalFileDetected: true,
              originType: "DIRECT_UPLOAD",
              publicSummaryKey:
                duplicateStatus === "EXACT_MATCH"
                  ? "provenance.summary.exact_match"
                  : "provenance.summary.original_preserved",
              status:
                duplicateStatus === "EXACT_MATCH"
                  ? "UNDER_REVIEW"
                  : renditions.hasExif
                    ? "PROVENANCE_SUPPORTED"
                    : "ORIGINAL_FILE_SUPPORTED"
            }
          },
          provenanceEvents: {
            create: [
              {
                eventType: "ORIGINAL_FILE_RECEIVED",
                evidence: {
                  byteSize: decoded.byteLength,
                  fileName: input.fileName,
                  mimeType: input.mimeType
                },
                actorUserId: user.id
              },
              {
                eventType: "HASHES_CREATED",
                evidence: {
                  algorithms: ["SHA256", "PHASH"],
                  duplicateStatus
                },
                actorUserId: user.id
              }
            ]
          },
          status: duplicateStatus === "EXACT_MATCH" ? "UNDER_REVIEW" : "READY",
          title: input.title,
          versions: {
            create: {
              changeSummary: "Original upload stored and analyzed for MVP provenance.",
              changeType: "ORIGINAL_UPLOAD",
              versionNumber: 1
            }
          },
          visibility: "PRIVATE"
        },
        include: photoInclude
      });

      await tx.analyticsEvent.create({
        data: {
          eventName: "photo_uploaded",
          payload: {
            duplicateStatus,
            hasExif: renditions.hasExif
          },
          userId: user.id
        }
      });

      return createdPhoto as PhotoRecord;
    });

    return {
      duplicate: duplicateStatus,
      photo: this.toPhotoResponse(photo),
      provenance: this.toProvenanceSummary(photo)
    };
  }

  async listMine(user: CurrentUser): Promise<{ photos: ReturnType<PhotosService["toPhotoResponse"]>[] }> {
    const photos = await prisma.photo.findMany({
      include: photoInclude,
      orderBy: {
        createdAt: "desc"
      },
      where: {
        deletedAt: null,
        ownerId: user.id
      }
    });

    return {
      photos: photos.map((photo) => this.toPhotoResponse(photo))
    };
  }

  async listPublic(): Promise<{ photos: ReturnType<PhotosService["toPhotoResponse"]>[] }> {
    const photos = await prisma.photo.findMany({
      include: photoInclude,
      orderBy: {
        publishedAt: "desc"
      },
      take: 48,
      where: {
        deletedAt: null,
        moderationStatus: "APPROVED",
        status: "PUBLISHED",
        visibility: "PUBLIC"
      }
    });

    return {
      photos: photos.map((photo) => this.toPhotoResponse(photo))
    };
  }

  async publish(
    user: CurrentUser,
    photoId: string,
    body: unknown
  ): Promise<{
    battleCreated: boolean;
    photo: ReturnType<PhotosService["toPhotoResponse"]>;
    provenance: ReturnType<PhotosService["toProvenanceSummary"]>;
  }> {
    const input = parsePublishPhotoInput(body);

    const result = await prisma.$transaction(async (tx) => {
      const existing = await tx.photo.findUnique({
        include: {
          provenance: true
        },
        where: {
          id: photoId
        }
      });

      if (!existing || existing.deletedAt) {
        throw new NotFoundException({
          code: "PHOTO_NOT_FOUND",
          message: "Photo does not exist."
        });
      }

      if (existing.ownerId !== user.id) {
        throw new ForbiddenException({
          code: "PHOTO_FORBIDDEN",
          message: "You can publish only your own photos."
        });
      }

      if (existing.provenance?.duplicateCheckStatus === "EXACT_MATCH") {
        throw new ConflictException({
          code: "PHOTO_DUPLICATE_REVIEW_REQUIRED",
          message: "This photo needs moderation review before publication."
        });
      }

      if (!["READY", "PUBLISHED"].includes(existing.status)) {
        throw new ConflictException({
          code: "PHOTO_NOT_READY",
          message: "This photo is not ready to publish."
        });
      }

      const updated = await tx.photo.update({
        data: {
          location: {
            update: {
              visibility: input.locationVisibility
            }
          },
          moderationStatus: "APPROVED",
          publishedAt: existing.publishedAt ?? new Date(),
          status: "PUBLISHED",
          visibility: input.visibility
        },
        include: photoInclude,
        where: {
          id: photoId
        }
      });

      await tx.analyticsEvent.create({
        data: {
          eventName: "photo_published",
          payload: {
            visibility: input.visibility
          },
          userId: user.id
        }
      });

      const battleCreated = input.visibility === "PUBLIC" ? await this.tryCreateBattle(tx, updated) : false;

      return {
        battleCreated,
        photo: updated
      };
    });

    return {
      battleCreated: result.battleCreated,
      photo: this.toPhotoResponse(result.photo),
      provenance: this.toProvenanceSummary(result.photo)
    };
  }

  private async ensurePhotographerFoundation(tx: PrismaTx, userId: string): Promise<void> {
    const photographerRole = await tx.role.upsert({
      create: {
        key: "PHOTOGRAPHER"
      },
      update: {},
      where: {
        key: "PHOTOGRAPHER"
      }
    });

    await tx.userRole.upsert({
      create: {
        roleId: photographerRole.id,
        userId
      },
      update: {},
      where: {
        userId_roleId: {
          roleId: photographerRole.id,
          userId
        }
      }
    });

    await tx.rating.upsert({
      create: {
        rating: 1500,
        scope: "GLOBAL",
        scopeKey: "global",
        userId
      },
      update: {},
      where: {
        userId_scope_scopeKey: {
          scope: "GLOBAL",
          scopeKey: "global",
          userId
        }
      }
    });

    const achievement = await tx.achievement.upsert({
      create: {
        descriptionKey: "achievement.first_upload.description",
        key: "first_upload",
        nameKey: "achievement.first_upload.name"
      },
      update: {},
      where: {
        key: "first_upload"
      }
    });

    await tx.userAchievement.upsert({
      create: {
        achievementId: achievement.id,
        userId
      },
      update: {},
      where: {
        userId_achievementId: {
          achievementId: achievement.id,
          userId
        }
      }
    });
  }

  private async tryCreateBattle(tx: PrismaTx, photo: PhotoRecord): Promise<boolean> {
    const existingEntry = await tx.battleEntry.findFirst({
      where: {
        photoId: photo.id
      }
    });

    if (existingEntry) {
      return false;
    }

      const opponent = await tx.photo.findFirst({
      orderBy: {
        publishedAt: "asc"
      },
      where: {
        categoryId: photo.categoryId ?? undefined,
        deletedAt: null,
        id: {
          not: photo.id
        },
        moderationStatus: "APPROVED",
        ownerId: {
          not: photo.owner.id
        },
        status: "PUBLISHED",
        visibility: "PUBLIC"
      }
    });

    if (!opponent) {
      return false;
    }

    const activeSeason = await tx.season.findFirst({
      orderBy: {
        startsAt: "asc"
      },
      where: {
        status: "ACTIVE"
      }
    });

    await tx.battle.create({
      data: {
        categoryId: photo.categoryId ?? opponent.categoryId ?? undefined,
        entries: {
          create: [
            {
              photoId: opponent.id,
              slot: "A",
              userId: opponent.ownerId
            },
            {
              photoId: photo.id,
              slot: "B",
              userId: photo.owner.id
            }
          ]
        },
        seasonId: activeSeason?.id,
        startsAt: new Date(),
        status: "OPEN"
      }
    });

    return true;
  }

  private toPhotoResponse(photo: PhotoRecord) {
    const displayAsset =
      photo.assets.find((asset) => asset.type === "DISPLAY") ??
      photo.assets.find((asset) => asset.type === "THUMBNAIL");
    const thumbnailAsset = photo.assets.find((asset) => asset.type === "THUMBNAIL") ?? displayAsset;

    return {
      assets: {
        displayUrl: displayAsset ? publicAssetUrl(this.env, displayAsset.storageKey) : null,
        thumbnailUrl: thumbnailAsset ? publicAssetUrl(this.env, thumbnailAsset.storageKey) : null
      },
      category: photo.category
        ? {
            nameKey: photo.category.nameKey,
            slug: photo.category.slug
          }
        : null,
      createdAt: dateToIso(photo.createdAt),
      counts: {
        battles: photo._count?.battleEntries ?? 0,
        challenges: photo._count?.challengeEntries ?? 0,
        disputes: photo._count?.disputesAsSubject ?? 0
      },
      description: photo.description,
      id: photo.id,
      location: photo.location
        ? {
            precision: photo.location.precision,
            publicLabel: photo.location.publicLabel,
            visibility: photo.location.visibility
          }
        : null,
      metadata: photo.metadata
        ? {
            cameraMake: photo.metadata.cameraMake,
            cameraModel: photo.metadata.cameraModel,
            capturedAt: dateToIso(photo.metadata.capturedAt),
            hasExif:
              typeof photo.metadata.exifJson === "object" &&
              photo.metadata.exifJson !== null &&
              "hasExif" in photo.metadata.exifJson
                ? Boolean((photo.metadata.exifJson as { readonly hasExif?: unknown }).hasExif)
                : false,
            lensModel: photo.metadata.lensModel
          }
        : null,
      moderationStatus: photo.moderationStatus,
      owner: {
        displayName: photo.owner.profile?.displayName ?? "Photographer",
        id: photo.owner.id,
        username: photo.owner.profile?.username ?? "photographer"
      },
      provenance: photo.provenance
        ? {
            captureDateDetected: photo.provenance.captureDateDetected,
            duplicateCheckStatus: photo.provenance.duplicateCheckStatus,
            gpsDetected: photo.provenance.gpsDetected,
            metadataDetected: photo.provenance.metadataDetected,
            originalFileDetected: photo.provenance.originalFileDetected,
            status: photo.provenance.status
          }
        : null,
      publishedAt: dateToIso(photo.publishedAt),
      status: photo.status,
      storage: {
        displayBytes: displayAsset ? bigintToString(displayAsset.byteSize) : null
      },
      title: photo.title,
      visibility: photo.visibility
    };
  }

  private toProvenanceSummary(photo: PhotoRecord) {
    return {
      checks: [
        {
          key: "original",
          passed: Boolean(photo.provenance?.originalFileDetected),
          status: photo.provenance?.originalFileDetected ? "SUPPORTED" : "UNAVAILABLE"
        },
        {
          key: "metadata",
          passed: Boolean(photo.provenance?.metadataDetected),
          status: photo.provenance?.metadataDetected ? "SUPPORTED" : "UNAVAILABLE"
        },
        {
          key: "capture_date",
          passed: Boolean(photo.provenance?.captureDateDetected),
          status: photo.provenance?.captureDateDetected ? "SUPPORTED" : "UNAVAILABLE"
        },
        {
          key: "gps",
          passed: Boolean(photo.provenance?.gpsDetected),
          status: photo.provenance?.gpsDetected ? "SUPPORTED" : "UNAVAILABLE"
        },
        {
          key: "duplicate",
          passed: photo.provenance?.duplicateCheckStatus === "NO_MATCH",
          status: photo.provenance?.duplicateCheckStatus ?? "NOT_CHECKED"
        }
      ],
      legalNoteKey: "provenance.legal_note",
      status: photo.provenance?.status ?? "UNVERIFIED"
    };
  }
}

function parseAddPhotoInput(body: unknown): AddPhotoInput {
  const record = asRecord(body);
  const mimeType = optionalEnum(record, "mimeType", allowedMimeTypes);

  if (!mimeType) {
    throw new BadRequestException({
      code: "PHOTO_UNSUPPORTED_TYPE",
      message: "Selected file type is not supported."
    });
  }

  return {
    categorySlug: optionalString(record, "categorySlug"),
    dataUrl: requiredString(record, "dataUrl"),
    description: optionalString(record, "description"),
    fileName: requiredString(record, "fileName"),
    locationLabel: optionalString(record, "locationLabel"),
    locationVisibility: optionalEnum(record, "locationVisibility", allowedLocationVisibility) ?? "HIDDEN",
    mimeType,
    title: requiredString(record, "title").slice(0, 140),
    visibility: optionalEnum(record, "visibility", allowedVisibility) ?? "PUBLIC"
  };
}

function parsePublishPhotoInput(body: unknown): PublishPhotoInput {
  const record = asRecord(body);

  return {
    locationVisibility: optionalEnum(record, "locationVisibility", allowedLocationVisibility),
    visibility: optionalEnum(record, "visibility", allowedVisibility) ?? "PUBLIC"
  };
}

function decodeDataUrl(dataUrl: string, expectedMimeType: string): Buffer {
  const match = /^data:([^;]+);base64,(.+)$/s.exec(dataUrl);

  if (!match?.[1] || !match[2]) {
    throw new BadRequestException({
      code: "PHOTO_INVALID_DATA",
      message: "Photo data must be a base64 data URL."
    });
  }

  if (match[1] !== expectedMimeType) {
    throw new BadRequestException({
      code: "PHOTO_MIME_MISMATCH",
      message: "Photo MIME type does not match the uploaded data."
    });
  }

  return Buffer.from(match[2], "base64");
}

async function createImageRenditions(buffer: Buffer): Promise<ImageRenditions> {
  try {
    const metadata = await sharp(buffer, { limitInputPixels: 120_000_000 }).metadata();
    const display = await sharp(buffer, { limitInputPixels: 120_000_000 })
      .rotate()
      .resize({ fit: "inside", height: 1800, withoutEnlargement: true, width: 1800 })
      .webp({ quality: 84 })
      .toBuffer({ resolveWithObject: true });
    const thumbnail = await sharp(buffer, { limitInputPixels: 120_000_000 })
      .rotate()
      .resize({ fit: "cover", height: 640, width: 640 })
      .webp({ quality: 78 })
      .toBuffer({ resolveWithObject: true });

    return {
      display: {
        buffer: display.data,
        height: display.info.height,
        width: display.info.width
      },
      hasExif: Boolean(metadata.exif),
      height: metadata.height,
      metadataSummary: metadataToJson(metadata),
      perceptualHash: await createPerceptualHash(buffer),
      sha256: sha256(buffer),
      thumbnail: {
        buffer: thumbnail.data,
        height: thumbnail.info.height,
        width: thumbnail.info.width
      },
      width: metadata.width
    };
  } catch (error) {
    throw new BadRequestException({
      code: "PHOTO_PROCESSING_FAILED",
      message: "Unable to process this image.",
      reason: error instanceof Error ? error.message : "unknown"
    });
  }
}

async function createPerceptualHash(buffer: Buffer): Promise<string> {
  const pixels = await sharp(buffer, { limitInputPixels: 120_000_000 })
    .resize(8, 8, { fit: "fill" })
    .greyscale()
    .raw()
    .toBuffer();
  const average = pixels.reduce((sum, pixel) => sum + pixel, 0) / pixels.length;
  let bits = "";

  for (const pixel of pixels) {
    bits += pixel >= average ? "1" : "0";
  }

  return BigInt(`0b${bits}`).toString(16).padStart(16, "0");
}

function metadataToJson(metadata: Metadata): Record<string, unknown> {
  return {
    density: metadata.density,
    format: metadata.format,
    hasExif: Boolean(metadata.exif),
    height: metadata.height,
    orientation: metadata.orientation,
    space: metadata.space,
    width: metadata.width
  };
}

function stringifyMetadataValue(value: unknown): string | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }

  return String(value);
}

function createPhotoStorageKeys(userId: string, photoId: string, fileName: string): {
  readonly display: string;
  readonly original: string;
  readonly thumbnail: string;
} {
  const safeFileName = fileName.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 96) || "photo";

  return {
    display: `photos/${userId}/${photoId}/display.webp`,
    original: `photos/${userId}/${photoId}/original/${safeFileName}`,
    thumbnail: `photos/${userId}/${photoId}/thumbnail.webp`
  };
}

function sha256(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}
