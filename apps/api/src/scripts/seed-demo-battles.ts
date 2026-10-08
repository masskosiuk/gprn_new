import "dotenv/config";
import { createHash } from "node:crypto";
import { loadRuntimeEnv } from "@gprn/config";
import { prisma } from "@gprn/db";
import { demoBattleAuthors, demoBattlePhotos, demoBattles } from "@gprn/domain";
import { S3ObjectStorage } from "@gprn/storage";
import sharp from "sharp";
import { seedDemoBattles, type DemoImageAsset } from "./demo-battle-seed.js";

async function downloadImage(url: string): Promise<Buffer> {
  const response = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  if (
    !response.ok ||
    !response.headers.get("content-type")?.startsWith("image/") ||
    !response.body
  ) {
    throw new Error(`Could not download demo image: HTTP ${response.status}.`);
  }
  const chunks: Uint8Array[] = [];
  const reader = response.body.getReader();
  let size = 0;
  while (true) {
    const chunk = await reader.read();
    if (chunk.done) break;
    size += chunk.value.byteLength;
    if (size > 20 * 1024 * 1024) {
      await reader.cancel();
      throw new Error("Demo image exceeds the 20 MB download limit.");
    }
    chunks.push(chunk.value);
  }
  return Buffer.concat(chunks);
}

async function main(): Promise<void> {
  const env = loadRuntimeEnv();
  const existingBattles = await prisma.battle.count({
    where: { id: { in: demoBattles.map((battle) => battle.id) } },
  });
  if (existingBattles === demoBattles.length) {
    console.log(
      `All ${existingBattles} demo battles already exist. Votes and moderation were left unchanged.`,
    );
    return;
  }
  const storage = new S3ObjectStorage({
    accessKeyId: env.S3_ACCESS_KEY,
    secretAccessKey: env.S3_SECRET_KEY,
    endpoint: env.S3_ENDPOINT,
    region: env.S3_REGION,
    forcePathStyle: env.S3_FORCE_PATH_STYLE,
  });
  const images = [
    ...demoBattlePhotos.map((photo) => ({ id: photo.id, url: photo.imageUrl })),
    ...demoBattleAuthors.map((author) => ({
      id: author.id,
      url: author.avatarUrl,
    })),
  ];
  const assets: DemoImageAsset[] = [];
  for (const image of images) {
    const storageKey = `demo/battles/v1/${image.id}.jpg`;
    const existing = await prisma.photoAsset.findUnique({
      where: {
        bucket_storageKey: { bucket: env.S3_BUCKET_PUBLIC, storageKey },
      },
    });
    if (
      existing &&
      existing.width &&
      existing.height &&
      existing.checksumSha256
    ) {
      assets.push({
        sourceId: image.id,
        bucket: existing.bucket,
        storageKey,
        byteSize: Number(existing.byteSize),
        width: existing.width,
        height: existing.height,
        checksumSha256: existing.checksumSha256,
      });
      continue;
    }
    const original = await downloadImage(image.url);
    const { data, info } = await sharp(original, {
      limitInputPixels: 40_000_000,
    })
      .rotate()
      .resize({
        width: 1600,
        height: 1600,
        fit: "inside",
        withoutEnlargement: true,
      })
      .jpeg({ quality: 84 })
      .toBuffer({ resolveWithObject: true });
    await storage.putObject({
      body: data,
      bucket: env.S3_BUCKET_PUBLIC,
      contentType: "image/jpeg",
      key: storageKey,
    });
    assets.push({
      sourceId: image.id,
      bucket: env.S3_BUCKET_PUBLIC,
      storageKey,
      byteSize: data.length,
      width: info.width,
      height: info.height,
      checksumSha256: createHash("sha256").update(data).digest("hex"),
    });
    console.log(`Stored demo image ${assets.length}/${images.length}.`);
  }
  const result = await seedDemoBattles(prisma, assets);
  console.log(
    `Demo battles created: ${result.created}; already present: ${result.existing}. No fabricated votes were added.`,
  );
}

main()
  .catch((error: unknown) => {
    console.error(
      error instanceof Error ? error.message : "Demo battle seed failed.",
    );
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
