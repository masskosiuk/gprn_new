interface MediaWork {
  readonly mediaType?: "PHOTO" | "VIDEO";
  readonly videoSrc?: string;
  readonly contentType?: string;
}

export function isVideoWork(work: MediaWork): boolean {
  return (
    work.mediaType === "VIDEO" ||
    Boolean(work.videoSrc) ||
    Boolean(work.contentType?.startsWith("video/"))
  );
}
