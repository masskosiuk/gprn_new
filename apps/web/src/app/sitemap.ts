import { supportedLocales } from "@gprn/i18n";
import type { MetadataRoute } from "next";
import { pageAlternates, pagePath, publicSections, siteUrl } from "../lib/seo";

export const dynamic = "force-dynamic";
const legalSlugs = [
  "privacy",
  "terms",
  "cookie",
  "copyright",
  "dispute",
  "community",
] as const;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const origin = siteUrl();
  const sections = [
    ...publicSections,
    ...legalSlugs.map((policy) => `legal/${policy}`),
  ];
  const staticEntries = supportedLocales.flatMap((locale) =>
    sections.map((section) => ({
      url: origin + pagePath(locale, section),
      alternates: {
        languages: Object.fromEntries(
          Object.entries(pageAlternates(locale, section).languages).map(
            ([language, path]) => [language, origin + path],
          ),
        ),
      },
    })),
  );
  return staticEntries;
}
