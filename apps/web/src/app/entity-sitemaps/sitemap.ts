import { isSupportedLocale, supportedLocales } from "@gprn/i18n";
import type { MetadataRoute } from "next";
import { notFound } from "next/navigation";
import { publicRequest } from "../../lib/public-api";
import { pageAlternates, pagePath, siteUrl, sitemapUrl } from "../../lib/seo";

export const dynamic = "force-dynamic";
export function generateSitemaps() {
  return supportedLocales.map((locale) => ({ id: locale }));
}
export default async function sitemap({
  id,
}: {
  id: string;
}): Promise<MetadataRoute.Sitemap> {
  if (!isSupportedLocale(id)) notFound();
  const origin = siteUrl();
  const index = await publicRequest<{
    entries: {
      section: string;
      query: Record<string, string>;
      updatedAt: string;
    }[];
  }>("/seo/index");
  // Split by language so reciprocal hreflang links do not exceed the XML size limit.
  return (index?.entries ?? []).map((entry) => ({
    url: sitemapUrl(origin + pagePath(id, entry.section, entry.query)),
    ...(Number.isFinite(Date.parse(entry.updatedAt))
      ? { lastModified: entry.updatedAt }
      : {}),
    alternates: {
      languages: Object.fromEntries(
        Object.entries(
          pageAlternates(id, entry.section, entry.query).languages,
        ).map(([language, path]) => [language, sitemapUrl(origin + path)]),
      ),
    },
  }));
}
