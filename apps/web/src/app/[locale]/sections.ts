import type { SupportedLocale } from "@gprn/i18n";

export const sectionIds = [
  "home",
  "discover",
  "video",
  "models",
  "studios",
  "battles",
  "challenges",
  "leaderboard",
  "marketplace",
  "experts",
  "profile",
  "admin",
] as const;

export const routedSectionIds = [
  "discover",
  "video",
  "models",
  "studios",
  "battles",
  "challenges",
  "leaderboard",
  "marketplace",
  "experts",
  "profile",
  "admin",
] as const;

export type SectionId = (typeof sectionIds)[number];
export type RoutedSectionId = (typeof routedSectionIds)[number];

export function isSectionId(value: string): value is SectionId {
  return sectionIds.includes(value as SectionId);
}

export function isRoutedSectionId(value: string): value is RoutedSectionId {
  return routedSectionIds.includes(value as RoutedSectionId);
}

export function getSectionHref(
  locale: SupportedLocale,
  sectionId: SectionId,
): string {
  return sectionId === "home" ? `/${locale}` : `/${locale}/${sectionId}`;
}
