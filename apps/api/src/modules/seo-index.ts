import { demoBattleAuthors, demoExpertUsernames } from "@gprn/domain";
import type { Prisma } from "@gprn/db";

export const demoSeoUsernames = [
  ...new Set([
    ...demoBattleAuthors.map((author) => author.username),
    ...Object.values(demoExpertUsernames),
  ]),
];
export const demoSeoUserIds = [
  ...demoBattleAuthors.map((author) => author.id),
  ...[7, 8, 9].map(
    (id) => `de000001-0000-4000-8000-${String(id).padStart(12, "0")}`,
  ),
];
export const indexableProfile = {
  visibility: "PUBLIC",
  deletedAt: null,
  userId: { notIn: demoSeoUserIds },
  username: { notIn: demoSeoUsernames },
  user: { status: "ACTIVE" },
} satisfies Prisma.ProfileWhereInput;
export const indexablePhoto = {
  visibility: "PUBLIC",
  status: "PUBLISHED",
  moderationStatus: "APPROVED",
  deletedAt: null,
  NOT: { title: { startsWith: "__profile_" } },
  owner: { status: "ACTIVE", profile: indexableProfile },
} satisfies Prisma.PhotoWhereInput;
export const indexablePost = {
  deletedAt: null,
  moderationStatus: "APPROVED",
  demoKey: null,
  kind: { in: ["EVENT", "DISCUSSION", "CASTING"] },
  author: { status: "ACTIVE", profile: indexableProfile },
} satisfies Prisma.CommunityPostWhereInput;

export type SeoIndexEntry = {
  section: string;
  query: Record<string, string>;
  updatedAt: string;
};
export function seoEntry(
  section: string,
  query: Record<string, string>,
  updatedAt: Date,
): SeoIndexEntry {
  return { section, query, updatedAt: updatedAt.toISOString() };
}
