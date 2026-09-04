import type { SupportedLocale } from "@gprn/i18n";

export const sectionIds = [
  "home",
  "discover",
  "battles",
  "challenges",
  "leaderboard",
  "map",
  "marketplace",
  "experts",
  "profile"
] as const;

export const routedSectionIds = [
  "discover",
  "battles",
  "challenges",
  "leaderboard",
  "map",
  "marketplace",
  "experts",
  "profile"
] as const;

export type SectionId = (typeof sectionIds)[number];
export type RoutedSectionId = (typeof routedSectionIds)[number];

export function isSectionId(value: string): value is SectionId {
  return sectionIds.includes(value as SectionId);
}

export function isRoutedSectionId(value: string): value is RoutedSectionId {
  return routedSectionIds.includes(value as RoutedSectionId);
}

export function getSectionHref(locale: SupportedLocale, sectionId: SectionId): string {
  return sectionId === "home" ? `/${locale}` : `/${locale}/${sectionId}`;
}
