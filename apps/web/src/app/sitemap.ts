import { supportedLocales } from "@gprn/i18n";
import type { MetadataRoute } from "next";

const sectionSlugs = ["", "discover", "battles", "challenges", "leaderboard", "map", "marketplace", "experts", "profile"] as const;
const legalSlugs = ["privacy", "terms", "cookie", "copyright", "dispute", "community"] as const;

export default function sitemap(): MetadataRoute.Sitemap {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const now = new Date();

  return supportedLocales.flatMap((locale) => {
    const sectionUrls = sectionSlugs.map((section) => ({
      changeFrequency: "weekly" as const,
      lastModified: now,
      priority: section ? 0.8 : 1,
      url: `${siteUrl}/${locale}${section ? `/${section}` : ""}`
    }));
    const legalUrls = legalSlugs.map((policy) => ({
      changeFrequency: "monthly" as const,
      lastModified: now,
      priority: 0.3,
      url: `${siteUrl}/${locale}/legal/${policy}`
    }));

    return [...sectionUrls, ...legalUrls];
  });
}
