export const supportedLocales = [
  "en",
  "uk",
  "ru",
  "pl",
  "de",
  "fr",
  "it",
  "es",
  "pt",
  "nl",
  "tr"
] as const;

export type SupportedLocale = (typeof supportedLocales)[number];

export const defaultLocale: SupportedLocale = "en";

export function isSupportedLocale(locale: string): locale is SupportedLocale {
  return supportedLocales.includes(locale as SupportedLocale);
}

