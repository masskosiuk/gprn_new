const challengeNames = new Set([
  "city-night",
  "available-light-portrait",
  "human-scale",
  "wild-weather",
]);
export function imageSource(src?: string) {
  const match = src?.match(/^\/images\/challenges\/([a-z-]+)\.(png|webp)$/);
  if (match && challengeNames.has(match[1]!))
    return {
      src: `/images/challenges/${match[1]}.webp`,
      width: 1672,
      height: 941,
      optimized: true,
    };
  try {
    const url = new URL(src || "");
    if (url.hostname === "images.unsplash.com") {
      const width = Number(url.searchParams.get("w"));
      const height = Number(url.searchParams.get("h"));
      if (width > 0 && height > 0)
        return { src, width, height, optimized: false };
    }
  } catch {
    /* Relative and in-memory sources keep their existing dimensions. */
  }
  return { src, optimized: false };
}
