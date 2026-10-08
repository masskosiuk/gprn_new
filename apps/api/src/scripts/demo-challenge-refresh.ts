import type { Prisma, prisma } from "@gprn/db";
import { demoBattleAuthors, demoChallengeWorks } from "@gprn/domain";
import type { DemoWorkAsset } from "./demo-challenge-seed.js";

export const replacementVideo = demoChallengeWorks.find(
  (work) => work.author === "lucas" && work.mediaType === "VIDEO",
)!;
export const replacementVideoRevision = "v2-mixkit-99905";
export const replacementVideoInclude = {
  assets: true,
  metadata: true,
  owner: true,
  provenance: true,
} as const;

const legacySource =
  "https://mixkit.co/free-stock-video/elegant-woman-waiting-in-a-kiosk-2399/";
const legacyTitle = "Waiting after dark";
const legacyDescription = `Stock demo example, not the demo master's original work. Edgar Fernandez / Mixkit. Mixkit Stock Video Free License. Source: ${legacySource}`;
const author = demoBattleAuthors.find(
  (candidate) => candidate.key === "lucas",
)!;

type RefreshPhoto = Prisma.PhotoGetPayload<{
  include: typeof replacementVideoInclude;
}>;

export function demoVideoRefreshStatus(
  photo: RefreshPhoto | null,
): "READY" | "UPDATED" | "UNAVAILABLE" {
  if (!photo)
    throw new Error(
      "Lucas's demo work is missing. Run db:seed:demo-challenges first.",
    );
  if (
    photo.id !== replacementVideo.id ||
    photo.ownerId !== author.id ||
    photo.owner.email !== "lucas@demo.gprn.invalid" ||
    photo.provenance?.sourceProvider !== "stock-demo"
  )
    throw new Error(
      "Refusing to replace a work that is not Lucas's reserved stock demo.",
    );
  if (
    photo.deletedAt ||
    photo.status !== "PUBLISHED" ||
    photo.visibility !== "PUBLIC" ||
    photo.moderationStatus !== "APPROVED"
  )
    return "UNAVAILABLE";
  const metadata = photo.metadata?.exifJson;
  const sourcePage =
    metadata && typeof metadata === "object" && !Array.isArray(metadata)
      ? metadata.sourcePage
      : null;
  if (sourcePage === replacementVideo.sourcePage) return "UPDATED";
  if (sourcePage !== legacySource)
    throw new Error(
      "The stock source has been edited; existing content was preserved.",
    );
  // Only the original seeded assets may be replaced, never an administrator's upload.
  for (const [type, filename] of [
    ["DISPLAY", "display.mp4"],
    ["THUMBNAIL", "thumbnail.webp"],
  ]) {
    const matches = photo.assets.filter(
      (asset) => asset.type === type && !asset.deletedAt,
    );
    if (
      matches.length !== 1 ||
      matches[0]!.storageKey !== `demo/challenges/v1/${photo.id}/${filename}`
    )
      throw new Error(
        "The demo assets have been edited; existing content was preserved.",
      );
  }
  return "READY";
}

export async function refreshDemoChallengeVideo(
  client: Pick<typeof prisma, "$transaction">,
  assets: readonly DemoWorkAsset[],
) {
  return client.$transaction(
    async (tx) => {
      const photo = await tx.photo.findUnique({
        where: { id: replacementVideo.id },
        include: replacementVideoInclude,
      });
      const status = demoVideoRefreshStatus(photo);
      if (status !== "READY") return status;
      const prepared = (["DISPLAY", "THUMBNAIL"] as const).map((type) => {
        const asset = assets.find(
          (candidate) =>
            candidate.sourceId === replacementVideo.id &&
            candidate.type === type,
        );
        const contentType = type === "DISPLAY" ? "video/mp4" : "image/webp";
        const filename = type === "DISPLAY" ? "display.mp4" : "thumbnail.webp";
        if (
          !asset ||
          asset.contentType !== contentType ||
          asset.byteSize <= 0 ||
          asset.storageKey !==
            `demo/challenges/${replacementVideoRevision}/${replacementVideo.id}/${filename}` ||
          (type === "DISPLAY" &&
            (!asset.durationSeconds ||
              asset.durationSeconds < 10 ||
              asset.durationSeconds > 60))
        )
          throw new Error(`Missing or invalid replacement asset (${type}).`);
        return asset;
      });
      const metadata = photo!.metadata!.exifJson as Prisma.JsonObject;
      await tx.photo.update({
        where: { id: photo!.id },
        data: {
          ...(photo!.title === legacyTitle
            ? { title: replacementVideo.title }
            : {}),
          ...(photo!.description === legacyDescription
            ? {
                description: `Stock demo example, not the demo master's original work. ${replacementVideo.credit}. ${replacementVideo.license}. Source: ${replacementVideo.sourcePage}`,
              }
            : {}),
          metadata: {
            update: {
              exifJson: {
                ...metadata,
                mediaType: "VIDEO",
                sourcePage: replacementVideo.sourcePage,
                credit: replacementVideo.credit,
                durationSeconds: prepared[0]!.durationSeconds!,
              } as Prisma.InputJsonObject,
            },
          },
          assets: {
            update: prepared.map((asset) => ({
              where: {
                id: photo!.assets.find(
                  (current) =>
                    current.type === asset.type && !current.deletedAt,
                )!.id,
              },
              data: {
                bucket: asset.bucket,
                storageKey: asset.storageKey,
                contentType: asset.contentType,
                byteSize: BigInt(asset.byteSize),
                width: asset.width,
                height: asset.height,
                checksumSha256: asset.checksumSha256,
              },
            })),
          },
        },
      });
      return "REPLACED" as const;
    },
    { isolationLevel: "Serializable", timeout: 30_000 },
  );
}
