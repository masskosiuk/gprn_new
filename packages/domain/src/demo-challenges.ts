export type ChallengeMediaType = "PHOTO" | "VIDEO";

export function challengeMediaType(rules: unknown): ChallengeMediaType {
  return typeof rules === "object" &&
    rules !== null &&
    "mediaType" in rules &&
    rules.mediaType === "VIDEO"
    ? "VIDEO"
    : "PHOTO";
}

export function assetMediaType(
  assets: readonly { type: string; contentType?: string }[],
): ChallengeMediaType {
  return assets.some(
    (asset) =>
      ["DISPLAY", "ORIGINAL"].includes(asset.type) &&
      asset.contentType?.toLowerCase().startsWith("video/"),
  )
    ? "VIDEO"
    : "PHOTO";
}

export function challengeMediaError(
  rules: unknown,
  assets: readonly { type: string; contentType?: string }[],
  metadata: unknown,
): "TYPE" | "DURATION" | null {
  if (assetMediaType(assets) !== challengeMediaType(rules)) return "TYPE";
  if (challengeMediaType(rules) !== "VIDEO") return null;
  const constraints = rules as {
    minDurationSeconds?: number;
    maxDurationSeconds?: number;
  };
  const duration =
    typeof metadata === "object" &&
    metadata !== null &&
    "durationSeconds" in metadata
      ? Number(metadata.durationSeconds)
      : NaN;
  if (
    !Number.isFinite(duration) ||
    duration <= 0 ||
    (typeof constraints.minDurationSeconds === "number" &&
      duration < constraints.minDurationSeconds) ||
    (typeof constraints.maxDurationSeconds === "number" &&
      duration > constraints.maxDurationSeconds)
  )
    return "DURATION";
  return null;
}

export const demoChallengeWorks = [
  {
    id: "de000005-0000-4000-8000-000000000001",
    author: "mika",
    challenge: "cinema-without-budget",
    mediaType: "VIDEO",
    title: "Late for the scene",
    titleKey: "demo.work.lateScene",
    category: "documentary",
    url: "https://assets.mixkit.co/videos/2400/2400-720.mp4",
    posterUrl: "https://assets.mixkit.co/videos/2400/2400-thumb-720-0.jpg",
    sourcePage:
      "https://mixkit.co/free-stock-video/elegant-couple-in-a-kiosk-2400/",
    credit: "Edgar Fernandez / Mixkit",
    license: "Mixkit Stock Video Free License",
  },
  {
    id: "de000005-0000-4000-8000-000000000002",
    author: "lucas",
    challenge: "cinema-without-budget",
    mediaType: "VIDEO",
    title: "A soundtrack of his own",
    titleKey: "demo.work.soundtrack",
    category: "documentary",
    url: "https://assets.mixkit.co/active_storage/video_items/99905/1717707004/99905-video-720.mp4",
    posterUrl:
      "https://assets.mixkit.co/active_storage/video_items/99905/1717707004/99905-video-thumb-720-0.jpg",
    sourcePage:
      "https://mixkit.co/free-stock-video/a-young-man-sitting-at-the-terrace-of-a-cozy-99905/",
    credit: "Mixkit",
    license: "Mixkit Stock Video Free License",
  },
  {
    id: "de000005-0000-4000-8000-000000000003",
    author: "elena",
    challenge: "one-color",
    mediaType: "PHOTO",
    title: "Green in detail",
    titleKey: "demo.work.green",
    category: "documentary",
    url: "https://isorepublic.com/wp-content/uploads/2022/08/iso-republic-macro-green-forest-leaf-sunlight-1100x735.jpg",
    posterUrl:
      "https://isorepublic.com/wp-content/uploads/2022/08/iso-republic-macro-green-forest-leaf-sunlight-1100x735.jpg",
    sourcePage: "https://isorepublic.com/photo/green-leaf-close-up/",
    credit: "Free Nature Stock / ISO Republic",
    license: "CC0",
  },
  {
    id: "de000005-0000-4000-8000-000000000004",
    author: "anna",
    challenge: "one-color",
    mediaType: "PHOTO",
    title: "Warm wall",
    titleKey: "demo.work.warmWall",
    category: "architecture",
    url: "https://images.pexels.com/photos/319382/pexels-photo-319382.jpeg?auto=compress&cs=tinysrgb&w=1600",
    posterUrl:
      "https://images.pexels.com/photos/319382/pexels-photo-319382.jpeg?auto=compress&cs=tinysrgb&w=1600",
    sourcePage:
      "https://www.pexels.com/photo/orange-and-yellow-painted-wall-319382/",
    credit: "Digital Buggu / Pexels",
    license: "Pexels License",
  },
  {
    id: "de000005-0000-4000-8000-000000000005",
    author: "yusuf",
    challenge: "shadow-protagonist",
    mediaType: "PHOTO",
    title: "Shadow diagonal",
    titleKey: "demo.work.diagonal",
    category: "street",
    url: "https://images.unsplash.com/photo-1695922717643-de5a693afc2c?auto=format&fit=crop&w=1600&q=84",
    posterUrl:
      "https://images.unsplash.com/photo-1695922717643-de5a693afc2c?auto=format&fit=crop&w=1600&q=84",
    sourcePage:
      "https://unsplash.com/photos/a-person-standing-in-front-of-a-brick-wall-ioNy61kgDXM",
    credit: "Maxim Tolchinskiy / Unsplash",
    license: "Unsplash License",
  },
  {
    id: "de000005-0000-4000-8000-000000000006",
    author: "joao",
    challenge: "shadow-protagonist",
    mediaType: "PHOTO",
    title: "Between light and shadow",
    titleKey: "demo.work.between",
    category: "street",
    url: "https://images.unsplash.com/photo-1566660455601-0903dc6ef678?auto=format&fit=crop&w=1600&q=84",
    posterUrl:
      "https://images.unsplash.com/photo-1566660455601-0903dc6ef678?auto=format&fit=crop&w=1600&q=84",
    sourcePage:
      "https://unsplash.com/photos/woman-walking-beside-wall--mjdqpCJQsE",
    credit: "Jon Tyson / Unsplash",
    license: "Unsplash License",
  },
] as const;

export const demoChallenges = [
  {
    id: "de000004-0000-4000-8000-000000000001",
    slug: "cinema-without-budget",
    mediaType: "VIDEO",
    titleKey: "challenge.cinema.title",
    descriptionKey: "challenge.cinema.copy",
    category: "documentary",
    coverWorkId: demoChallengeWorks[0].id,
    durationDays: 30,
  },
  {
    id: "de000004-0000-4000-8000-000000000002",
    slug: "one-color",
    mediaType: "PHOTO",
    titleKey: "challenge.color.title",
    descriptionKey: "challenge.color.copy",
    category: "documentary",
    coverWorkId: demoChallengeWorks[2].id,
    durationDays: 30,
  },
  {
    id: "de000004-0000-4000-8000-000000000003",
    slug: "shadow-protagonist",
    mediaType: "PHOTO",
    titleKey: "challenge.shadow.title",
    descriptionKey: "challenge.shadow.copy",
    category: "street",
    coverWorkId: demoChallengeWorks[4].id,
    durationDays: 30,
  },
] as const;
