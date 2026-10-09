import "dotenv/config";
import { randomUUID } from "node:crypto";
import { loadRuntimeEnv } from "@gprn/config";
import { prisma } from "@gprn/db";
import { demoBattleAuthors } from "@gprn/domain";
import { S3ObjectStorage } from "@gprn/storage";
import { createProductCover } from "../modules/digital-product-assets.js";
import { downloadCover } from "./seed-demo-digital-products.js";
import { demoCommunityPosts } from "./demo-community-catalog.js";

async function main() {
  const env = loadRuntimeEnv();
  const storage = new S3ObjectStorage({
    accessKeyId: env.S3_ACCESS_KEY,
    secretAccessKey: env.S3_SECRET_KEY,
    endpoint: env.S3_ENDPOINT,
    region: env.S3_REGION,
    forcePathStyle: env.S3_FORCE_PATH_STYLE,
  });
  let created = 0;
  let preserved = 0;
  for (const entry of demoCommunityPosts) {
    const demoKey = "community-v1-" + entry.key;
    const prior = await prisma.communityPost.findUnique({ where: { demoKey } });
    const author = demoBattleAuthors.find(
      (candidate) => candidate.key === entry.author,
    )!;
    const user = await prisma.user.findUnique({
      where: { id: author.id },
      include: { profile: true },
    });
    if (
      !user ||
      user.email !== author.key + "@demo.gprn.invalid" ||
      user.profile?.username !== author.username
    )
      throw new Error(
        "Seed demo masters first. Reserved demo identity is missing or belongs to other content.",
      );
    if (prior) {
      if (prior.authorId !== author.id)
        throw new Error("Demo key is already in use.");
      preserved++;
      continue;
    }
    const id = randomUUID();
    let coverAssetKey: string | undefined;
    let uploadedKey: string | undefined;
    let source:
      { sourceId: string; sourceType: string; sourcePath: string } | undefined;
    if ("sourceId" in entry) {
      const photo = await prisma.photo.findFirst({
        where: {
          id: entry.sourceId,
          deletedAt: null,
          status: "PUBLISHED",
          visibility: "PUBLIC",
          moderationStatus: "APPROVED",
        },
        include: { assets: true, owner: { include: { profile: true } } },
      });
      if (!photo || !photo.owner.profile)
        throw new Error("Seed demo battles and challenges before discussions.");
      coverAssetKey =
        photo.assets.find(
          (asset) =>
            asset.type === "THUMBNAIL" &&
            asset.contentType.startsWith("image/"),
        )?.storageKey ??
        photo.assets.find(
          (asset) =>
            asset.type === "DISPLAY" && asset.contentType.startsWith("image/"),
        )?.storageKey;
      source = {
        sourceId: photo.id,
        sourceType: "PHOTO",
        sourcePath:
          "/ru/profile?author=" +
          encodeURIComponent(photo.owner.profile.username) +
          "&photo=" +
          photo.id,
      };
    } else {
      const cover = await createProductCover(await downloadCover(entry.cover));
      uploadedKey = "demo/community/v1/" + entry.key + "/" + id + ".webp";
      await storage.putObject({
        bucket: env.S3_BUCKET_PUBLIC,
        key: uploadedKey,
        body: cover.buffer,
        contentType: "image/webp",
      });
      coverAssetKey = uploadedKey;
    }
    try {
      const startsAt = new Date();
      startsAt.setUTCDate(startsAt.getUTCDate() + entry.days);
      startsAt.setUTCHours(14, 0, 0, 0);
      await prisma.communityPost.create({
        data: {
          id,
          demoKey,
          kind: entry.kind,
          authorId: author.id,
          title: entry.title,
          body: entry.body,
          location: entry.location,
          language: entry.language,
          startsAt,
          coverAssetKey,
          moderationStatus: "APPROVED",
          ...source,
        },
      });
      created++;
    } catch (error) {
      if (uploadedKey)
        await storage
          .deleteObject(env.S3_BUCKET_PUBLIC, uploadedKey)
          .catch(() => undefined);
      throw error;
    }
  }
  console.log(
    "Community demo posts: created " +
      created +
      ", preserved " +
      preserved +
      ". User content was not modified.",
  );
}

main()
  .catch(() => {
    console.error(
      "Community demo preparation failed. Existing posts were preserved. Check prerequisites and retry.",
    );
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
