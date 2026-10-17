import {
  getMessage,
  supportedLocales,
  type MessageKey,
  type SupportedLocale,
} from "@gprn/i18n";
import type { Metadata } from "next";

export const publicSections = [
  "",
  "feed",
  "events",
  "discussions",
  "search",
  "models",
  "studios",
  "battles",
  "challenges",
  "marketplace",
  "experts",
] as const;
export const privateSections = new Set([
  "admin",
  "interactions",
  "suggestions",
]);

export function siteUrl(): string {
  const value =
    process.env.NEXT_PUBLIC_SITE_URL ||
    (process.env.NODE_ENV === "production"
      ? "https://photoapp.metarp.top"
      : "http://localhost:3000");
  const url = new URL(value);
  if (!/^https?:$/.test(url.protocol) || url.username || url.password)
    throw new Error("Invalid public site URL");
  return url.origin;
}

export function pagePath(
  locale: string,
  section = "",
  query: Record<string, string> = {},
): string {
  const suffix = new URLSearchParams(query).toString();
  return `/${locale}${section ? `/${section}` : ""}${suffix ? `?${suffix}` : ""}`;
}

// Next 15's sitemap serializer interpolates URLs without XML-escaping ampersands.
export function sitemapUrl(value: string): string {
  return value.replace(/&/g, "&amp;");
}

export function pageAlternates(
  locale: SupportedLocale,
  section = "",
  query: Record<string, string> = {},
) {
  return {
    canonical: pagePath(locale, section, query),
    languages: Object.fromEntries([
      ...supportedLocales.map((language) => [
        language,
        pagePath(language, section, query),
      ]),
      ["x-default", pagePath("en", section, query)],
    ]),
  };
}

export function plainDescription(value: string): string {
  return value.replace(/\s+/g, " ").trim().slice(0, 180);
}

export function publicImage(value?: string | null): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value, siteUrl());
    return /^https?:$/.test(url.protocol) && !url.username && !url.password
      ? url.href
      : undefined;
  } catch {
    return undefined;
  }
}

export function pageMetadata(
  locale: SupportedLocale,
  section = "",
  options: {
    title?: string;
    description?: string;
    image?: string | null;
    query?: Record<string, string>;
    noindex?: boolean;
  } = {},
): Metadata {
  const sectionTitle = section
    ? getMessage(locale, `section.${section}.title` as MessageKey)
    : locale === "ru"
      ? "Фотографы, оценка работ и творческое сообщество"
      : locale === "uk"
        ? "Фотографи, оцінка робіт і творча спільнота"
        : "Photography, portfolio reviews and creative community";
  const title = `${options.title || sectionTitle} | GPRN`;
  const intro = section
    ? getMessage(locale, `section.${section}.intro` as MessageKey)
    : locale === "ru"
      ? "GPRN: портфолио фотографов, подробная оценка работ, фотобатлы и творческие челленджи. Находите мастеров, моделей, студии и мероприятия сообщества."
      : locale === "uk"
        ? "GPRN: портфоліо фотографів, докладна оцінка робіт, фотобатли та творчі челенджі. Знаходьте майстрів, моделей, студії та події спільноти."
        : "GPRN brings together photographers, portfolio reviews, photo battles and creative challenges. Discover creators, models, studios and community events.";
  const description = plainDescription(
    options.description ||
      (intro.length < 100
        ? `${intro} ${getMessage(locale, "app.tagline")}`
        : intro),
  );
  const image = publicImage(options.image) || `${siteUrl()}/opengraph-image`;
  const url = pagePath(locale, section, options.query);
  return {
    title,
    description,
    alternates: pageAlternates(locale, section, options.query),
    robots: { index: !options.noindex, follow: true },
    openGraph: {
      title,
      description,
      url,
      locale,
      siteName: "GPRN",
      type: "website",
      images: [{ url: image, alt: options.title || "GPRN" }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [image],
    },
  };
}

export function jsonLd(value: unknown): string {
  // User titles and biographies must never be able to close the script element.
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

export function breadcrumbs(
  locale: SupportedLocale,
  section: string,
  title: string,
  query: Record<string, string> = {},
) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      {
        "@type": "ListItem",
        position: 1,
        name: "GPRN",
        item: siteUrl() + pagePath(locale),
      },
      {
        "@type": "ListItem",
        position: 2,
        name: title,
        item: siteUrl() + pagePath(locale, section, query),
      },
    ],
  };
}
