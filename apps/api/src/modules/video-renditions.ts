import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { promisify } from "node:util";
import sharp from "sharp";

const run = promisify(execFile);
let activeJobs = 0;

export function isSupportedVideoContainer(buffer: Buffer): boolean {
  return (
    (buffer.length >= 12 && buffer.toString("ascii", 4, 8) === "ftyp") ||
    (buffer.length >= 4 && buffer.readUInt32BE(0) === 0x1a45dfa3)
  );
}

export function parseVideoProbe(input: unknown) {
  const probe = input as {
    format?: { duration?: string };
    streams?: { codec_type?: string; width?: number; height?: number }[];
  };
  const video = probe?.streams?.find((stream) => stream.codec_type === "video");
  const duration = Number(probe?.format?.duration);
  if (
    !video?.width ||
    !video.height ||
    video.width > 4096 ||
    video.height > 4096 ||
    !Number.isFinite(duration) ||
    duration <= 0 ||
    duration > 60
  ) {
    throw new Error(
      "Use a video up to 60 seconds, with dimensions no larger than 4096 pixels.",
    );
  }
  return {
    width: video.width,
    height: video.height,
    durationSeconds: duration,
  };
}

export async function createVideoRenditions(buffer: Buffer) {
  // Accept binary containers only, never playlists capable of referencing other files.
  if (!isSupportedVideoContainer(buffer))
    throw new Error("Use an MP4 or WebM video container.");
  if (activeJobs >= 2)
    throw new Error("Video processing is busy. Try again shortly.");
  activeJobs += 1;
  let directory: string | undefined;
  try {
    directory = await mkdtemp(join(tmpdir(), "gprn-video-"));
    const input = join(directory, "input");
    const output = join(directory, "display.mp4");
    const poster = join(directory, "poster.webp");
    await writeFile(input, buffer);
    const { stdout } = await run(
      process.env.FFPROBE_PATH ?? "ffprobe",
      [
        "-v",
        "error",
        "-protocol_whitelist",
        "file,pipe",
        "-show_streams",
        "-show_format",
        "-of",
        "json",
        input,
      ],
      { timeout: 15_000, maxBuffer: 1024 * 1024 },
    );
    const metadata = parseVideoProbe(JSON.parse(stdout));
    await run(
      process.env.FFMPEG_PATH ?? "ffmpeg",
      [
        "-nostdin",
        "-v",
        "error",
        "-protocol_whitelist",
        "file,pipe",
        "-i",
        input,
        "-map",
        "0:v:0",
        "-map",
        "0:a:0?",
        "-map_metadata",
        "-1",
        "-vf",
        "scale=1280:720:force_original_aspect_ratio=decrease:force_divisible_by=2",
        "-c:v",
        "libx264",
        "-threads",
        "2",
        "-preset",
        "veryfast",
        "-crf",
        "24",
        "-pix_fmt",
        "yuv420p",
        "-c:a",
        "aac",
        "-b:a",
        "128k",
        "-movflags",
        "+faststart",
        "-t",
        "60",
        output,
      ],
      { timeout: 90_000, maxBuffer: 1024 * 1024 },
    );
    await run(
      process.env.FFMPEG_PATH ?? "ffmpeg",
      [
        "-nostdin",
        "-v",
        "error",
        "-i",
        output,
        "-frames:v",
        "1",
        "-threads",
        "1",
        poster,
      ],
      { timeout: 15_000, maxBuffer: 1024 * 1024 },
    );
    const videoBuffer = await readFile(output);
    if (videoBuffer.length > 24 * 1024 * 1024)
      throw new Error("Processed video is too large.");
    const posterBuffer = await readFile(poster);
    const dimensions = await sharp(posterBuffer).metadata();
    const pixels = await sharp(posterBuffer)
      .resize(8, 8, { fit: "fill" })
      .greyscale()
      .raw()
      .toBuffer();
    const average =
      pixels.reduce((sum, pixel) => sum + pixel, 0) / pixels.length;
    const bits = [...pixels]
      .map((pixel) => (pixel >= average ? "1" : "0"))
      .join("");
    return {
      display: {
        buffer: videoBuffer,
        width: dimensions.width,
        height: dimensions.height,
      },
      thumbnail: {
        buffer: posterBuffer,
        width: dimensions.width,
        height: dimensions.height,
      },
      width: metadata.width,
      height: metadata.height,
      hasExif: false,
      gps: undefined,
      metadataSummary: { ...metadata, mediaType: "VIDEO", hasExif: false },
      sha256: createHash("sha256").update(buffer).digest("hex"),
      perceptualHash: BigInt(`0b${bits}`).toString(16).padStart(16, "0"),
    };
  } finally {
    activeJobs -= 1;
    if (
      directory &&
      resolve(dirname(directory)) === resolve(tmpdir()) &&
      directory.includes("gprn-video-")
    )
      await rm(directory, { recursive: true, force: true });
  }
}
