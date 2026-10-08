import type { RuntimeEnv } from "@gprn/config";

export interface AssetLike {
  readonly storageKey: string;
}

export function mediaAssetResponse(
  env: RuntimeEnv,
  assets: readonly { storageKey: string; type: string; contentType?: string }[],
) {
  const display =
    assets.find((asset) => asset.type === "DISPLAY") ??
    assets.find((asset) => asset.type === "THUMBNAIL");
  const thumbnail = assets.find((asset) => asset.type === "THUMBNAIL");
  const isVideo = display?.contentType?.startsWith("video/") ?? false;
  const preview = isVideo ? thumbnail : display;
  return {
    mediaType: isVideo ? ("VIDEO" as const) : ("PHOTO" as const),
    displayUrl: preview ? publicAssetUrl(env, preview.storageKey) : null,
    thumbnailUrl: thumbnail
      ? publicAssetUrl(env, thumbnail.storageKey)
      : preview
        ? publicAssetUrl(env, preview.storageKey)
        : null,
    videoUrl:
      isVideo && display ? publicAssetUrl(env, display.storageKey) : null,
  };
}
export function publicAssetUrl(env: RuntimeEnv, storageKey: string): string {
  const base =
    env.CDN_PUBLIC_URL?.replace(/\/$/, "") ??
    `${env.S3_ENDPOINT.replace(/\/$/, "")}/${env.S3_BUCKET_PUBLIC}`;

  return `${base}/${storageKey
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/")}`;
}

export function dateToIso(value: Date | null | undefined): string | null {
  return value ? value.toISOString() : null;
}

export function bigintToString(value: bigint | number): string {
  return typeof value === "bigint" ? value.toString() : String(value);
}

export function isPrismaErrorCode(error: unknown, code: string): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { readonly code?: unknown }).code === code
  );
}
