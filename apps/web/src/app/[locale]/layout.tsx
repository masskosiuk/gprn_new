import {
  getMessage,
  isSupportedLocale,
  supportedLocales,
  type SupportedLocale,
} from "@gprn/i18n";
import type { Metadata } from "next";
import { siteUrl } from "../../lib/seo";

import "leaflet/dist/leaflet.css";
import "./globals.css";
import "./community.css";
import "./photo-gallery.css";
import "./battle-deck.css";

interface LocaleLayoutProps {
  readonly children: React.ReactNode;
  readonly params: Promise<{
    readonly locale: string;
  }>;
}

// A per-request CSP nonce cannot be baked into shared static HTML.
export const dynamic = "force-dynamic";

export function generateStaticParams(): Array<{ locale: SupportedLocale }> {
  return supportedLocales.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: LocaleLayoutProps): Promise<Metadata> {
  const { locale: requestedLocale } = await params;
  const locale = isSupportedLocale(requestedLocale) ? requestedLocale : "en";
  const title = getMessage(locale, "app.name");
  const description = getMessage(locale, "app.tagline");
  return {
    description,
    icons: {
      apple: [{ url: "/apple-icon.png", sizes: "180x180", type: "image/png" }],
      icon: [
        {
          type: "image/svg+xml",
          url: "/icon.svg",
        },
      ],
      shortcut: "/icon.svg",
    },
    metadataBase: new URL(siteUrl()),
    openGraph: {
      description,
      locale,
      siteName: title,
      title,
      type: "website",
      url: `/${locale}`,
    },
    title,
    twitter: {
      card: "summary_large_image",
      description,
      title,
    },
  };
}

export default async function LocaleLayout({
  children,
  params,
}: LocaleLayoutProps): Promise<React.ReactNode> {
  const { locale: requestedLocale } = await params;
  const locale = isSupportedLocale(requestedLocale) ? requestedLocale : "en";

  return (
    <html lang={locale}>
      <body>{children}</body>
    </html>
  );
}
