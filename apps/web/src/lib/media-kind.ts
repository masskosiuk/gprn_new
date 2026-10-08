interface MediaWork {
  readonly id?: string;
  readonly mediaType?: "PHOTO" | "VIDEO";
  readonly videoSrc?: string;
  readonly contentType?: string;
  readonly src?: string;
}

export function isVideoWork(work: MediaWork): boolean {
  return (
    work.mediaType === "VIDEO" ||
    Boolean(work.videoSrc) ||
    Boolean(work.contentType?.toLowerCase().startsWith("video/")) ||
    sourceIsVideo(work.src)
  );
}

function sourceIsVideo(src?: string): boolean {
  if (!src) return false;
  if (/^data:video\//i.test(src)) return true;
  try {
    return /\.(mp4|webm)$/i.test(
      new URL(src, "https://media.invalid").pathname,
    );
  } catch {
    return false;
  }
}

export function mergeMediaWorks<T extends MediaWork & { readonly id: string }>(
  works: readonly T[],
): T[] {
  const byId = new Map<string, T>();
  for (const work of works) {
    const existing = byId.get(work.id);
    byId.set(
      work.id,
      existing
        ? {
            ...work,
            ...existing,
            mediaType:
              isVideoWork(existing) || isVideoWork(work) ? "VIDEO" : "PHOTO",
            videoSrc: existing.videoSrc || work.videoSrc,
          }
        : work,
    );
  }
  return [...byId.values()];
}
