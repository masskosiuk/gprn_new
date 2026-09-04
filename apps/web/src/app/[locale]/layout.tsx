import { isSupportedLocale, supportedLocales, type SupportedLocale } from "@gprn/i18n";
import type { Metadata } from "next";

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

export const metadata: Metadata = {
  description: "Global competitive photography platform.",
  title: "Global Photographer Reputation Network"
};

export default async function LocaleLayout({ children, params }: LocaleLayoutProps): Promise<React.ReactNode> {
  const { locale: requestedLocale } = await params;
  const locale = isSupportedLocale(requestedLocale) ? requestedLocale : "en";

  return (
    <html lang={locale}>
      <body>{children}</body>
    </html>
  );
}
