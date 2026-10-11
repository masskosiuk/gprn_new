import { demoBattleAuthors, demoExpertUsernames } from "@gprn/domain";

export function canonicalProfileUsername(identifier: string): string {
  const normalized = identifier.trim().toLowerCase();
  const demo = demoBattleAuthors.find((author) =>
    [author.key, author.id, author.username, author.username.slice(5)].includes(
      normalized,
    ),
  );
  if (demo) return demo.username;
  for (const [key, username] of Object.entries(demoExpertUsernames)) {
    if ([key, username, username.slice(5)].includes(normalized))
      return username;
  }
  return normalized;
}

export function recoverableProfileImages(
  profile: { email: string; avatarUrl?: string; coverUrl?: string },
  saved: unknown,
): { avatarUrl?: string; coverUrl?: string } | null {
  if (
    !saved ||
    typeof saved !== "object" ||
    !("email" in saved) ||
    saved.email !== profile.email
  )
    return null;
  const images = {
    avatarUrl:
      !profile.avatarUrl &&
      "avatarUrl" in saved &&
      typeof saved.avatarUrl === "string"
        ? saved.avatarUrl
        : undefined,
    coverUrl:
      !profile.coverUrl &&
      "coverUrl" in saved &&
      typeof saved.coverUrl === "string"
        ? saved.coverUrl
        : undefined,
  };
  return images.avatarUrl || images.coverUrl ? images : null;
}
