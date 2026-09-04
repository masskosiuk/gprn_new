import { getMessage, isSupportedLocale, supportedLocales, type SupportedLocale } from "@gprn/i18n";
import type { Metadata } from "next";

import "leaflet/dist/leaflet.css";
import "./globals.css";

interface LocaleLayoutProps {
  readonly children: React.ReactNode;
  readonly params: Promise<{
    readonly locale: string;
  }>;
}

export function generateStaticParams(): Array<{ locale: SupportedLocale }> {
  return supportedLocales.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: LocaleLayoutProps): Promise<Metadata> {
  const { locale: requestedLocale } = await params;
  const locale = isSupportedLocale(requestedLocale) ? requestedLocale : "en";
  const title = getMessage(locale, "app.name");
  const description = getMessage(locale, "app.tagline");
  const languages = Object.fromEntries(supportedLocales.map((supportedLocale) => [supportedLocale, `/${supportedLocale}`]));

  return {
    alternates: {
      canonical: `/${locale}`,
      languages
    },
    description,
    metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"),
    openGraph: {
      description,
      locale,
      siteName: title,
      title,
      type: "website",
      url: `/${locale}`
    },
    title,
    twitter: {
      card: "summary_large_image",
      description,
      title
    }
  };
}

export default async function LocaleLayout({ children, params }: LocaleLayoutProps): Promise<React.ReactNode> {
  const { locale: requestedLocale } = await params;
  const locale = isSupportedLocale(requestedLocale) ? requestedLocale : "en";

  return (
    <html lang={locale}>
      <body>{children}</body>
    </html>
  );
}
