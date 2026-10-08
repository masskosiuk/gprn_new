import "dotenv/config";
import { createHash } from "node:crypto";
import { loadRuntimeEnv } from "@gprn/config";
import { prisma } from "@gprn/db";
import {
  demoBattleAuthors,
  demoChallenges,
  demoChallengeWorks,
} from "@gprn/domain";
import { S3ObjectStorage } from "@gprn/storage";
import sharp from "sharp";
import { publicAssetUrl } from "../modules/serialization.js";
import { createVideoRenditions } from "../modules/video-renditions.js";
import {
  seedDemoChallenges,
  type DemoWorkAsset,
} from "./demo-challenge-seed.js";
import {
  demoVideoRefreshStatus,
  refreshDemoChallengeVideo,
  replacementVideo,
  replacementVideoInclude,
  replacementVideoRevision,
} from "./demo-challenge-refresh.js";

async function download(url: string, isVideo = false): Promise<Buffer> {
  const response = await fetch(url, { signal: AbortSignal.timeout(60_000) });
  if (
    !response.ok ||
    !response.body ||
    !(response.headers.get("content-type") ?? "").startsWith(
      isVideo ? "video/" : "image/",
    )
  )
    throw new Error(`Stock download failed (${response.status}): ${url}`);
  const chunks: Uint8Array[] = [];
  let size = 0;
  const reader = response.body.getReader();
  while (true) {
    const chunk = await reader.read();
    if (chunk.done) break;
    size += chunk.value.byteLength;
    if (size > 18 * 1024 * 1024) {
      await reader.cancel();
      throw new Error("Stock asset exceeds 18 MB.");
    }
    chunks.push(chunk.value);
  }
  return Buffer.concat(chunks);
}

async function main() {
  const env = loadRuntimeEnv();
  const refreshVideo = process.argv.includes("--refresh-lucas-video");
  if (refreshVideo) {
    const photo = await prisma.photo.findUnique({
      where: { id: replacementVideo.id },
      include: replacementVideoInclude,
    });
    const status = demoVideoRefreshStatus(photo);
    if (status !== "READY") {
      console.log(
        `Demo video: ${status}. Existing content and moderation were preserved.`,
      );
      return;
    }
  } else {
    const present = await prisma.challenge.count({
      where: { id: { in: demoChallenges.map((challenge) => challenge.id) } },
    });
    if (present === demoChallenges.length) {
      console.log(
        "All three demo challenges already exist. Administrative changes and moderation were preserved.",
      );
      return;
    }
  }
  const storage = new S3ObjectStorage({
    accessKeyId: env.S3_ACCESS_KEY,
    secretAccessKey: env.S3_SECRET_KEY,
    endpoint: env.S3_ENDPOINT,
    region: env.S3_REGION,
    forcePathStyle: env.S3_FORCE_PATH_STYLE,
  });
  const assets: DemoWorkAsset[] = [];
  async function store(
    sourceId: string,
    type: "DISPLAY" | "THUMBNAIL",
    buffer: Buffer,
    contentType: string,
    width: number,
    height: number,
    durationSeconds?: number,
  ) {
    const extension = contentType === "video/mp4" ? "mp4" : "webp";
    const revision =
      sourceId === replacementVideo.id ? replacementVideoRevision : "v1";
    const storageKey = `demo/challenges/${revision}/${sourceId}/${type.toLowerCase()}.${extension}`;
    await storage.putObject({
      body: buffer,
      bucket: env.S3_BUCKET_PUBLIC,
      contentType,
      key: storageKey,
    });
    assets.push({
      sourceId,
      type,
      bucket: env.S3_BUCKET_PUBLIC,
      storageKey,
      contentType,
      byteSize: buffer.length,
      width,
      height,
      checksumSha256: createHash("sha256").update(buffer).digest("hex"),
      publicUrl: publicAssetUrl(env, storageKey),
      durationSeconds,
    });
  }
  for (const work of refreshVideo ? [replacementVideo] : demoChallengeWorks) {
    const original = await download(work.url, work.mediaType === "VIDEO");
    if (work.mediaType === "VIDEO") {
      const media = await createVideoRenditions(original);
      await store(
        work.id,
        "DISPLAY",
        media.display.buffer,
        "video/mp4",
        media.display.width!,
        media.display.height!,
        media.metadataSummary.durationSeconds,
      );
      await store(
        work.id,
        "THUMBNAIL",
        media.thumbnail.buffer,
        "image/webp",
        media.thumbnail.width!,
        media.thumbnail.height!,
      );
    } else {
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
        .webp({ quality: 84 })
        .toBuffer({ resolveWithObject: true });
      await store(
        work.id,
        "DISPLAY",
        data,
        "image/webp",
        info.width,
        info.height,
      );
    }
    console.log(`Prepared stock example: ${work.title}.`);
  }
  if (refreshVideo) {
    const result = await refreshDemoChallengeVideo(prisma, assets);
    console.log(
      `Lucas's demo video: ${result}. Challenge entries, moderation, votes and profiles were preserved.`,
    );
    return;
  }
  for (const author of demoBattleAuthors) {
    const { data, info } = await sharp(await download(author.avatarUrl))
      .rotate()
      .resize(400, 400)
      .webp({ quality: 80 })
      .toBuffer({ resolveWithObject: true });
    await store(
      author.id,
      "DISPLAY",
      data,
      "image/webp",
      info.width,
      info.height,
    );
  }
  const result = await seedDemoChallenges(prisma, assets);
  console.log(
    `Demo challenges created: ${result.created}; existing: ${result.existing}. Six licensed stock examples, no fabricated votes.`,
  );
}

main()
  .catch((error: unknown) => {
    console.error(
      error instanceof Error ? error.message : "Demo challenge seed failed.",
    );
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
