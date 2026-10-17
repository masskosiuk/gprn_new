import type { MetadataRoute } from "next";
import { supportedLocales } from "@gprn/i18n";
import { siteUrl } from "../lib/seo";

export default function robots(): MetadataRoute.Robots {
  const origin = siteUrl();

  return {
    rules: {
      allow: "/",
      disallow: "/api/",
      userAgent: "*",
    },
    sitemap: [
      `${origin}/sitemap.xml`,
      ...supportedLocales.map(
        (locale) => `${origin}/entity-sitemaps/sitemap/${locale}.xml`,
      ),
    ],
  };
}
