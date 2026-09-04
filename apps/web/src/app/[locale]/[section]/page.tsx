import { isSupportedLocale, supportedLocales, type SupportedLocale } from "@gprn/i18n";
import { notFound } from "next/navigation";

import { HomeClient } from "../home-client";
import { isRoutedSectionId, routedSectionIds, type RoutedSectionId } from "../sections";

interface SectionPageProps {
  readonly params: Promise<{
    readonly locale: string;
    readonly section: string;
  }>;
}

export function generateStaticParams(): Array<{ locale: SupportedLocale; section: RoutedSectionId }> {
  return supportedLocales.flatMap((locale) => routedSectionIds.map((section) => ({ locale, section })));
}

export default async function SectionPage({ params }: SectionPageProps): Promise<React.ReactNode> {
  const { locale: requestedLocale, section: requestedSection } = await params;

  if (!isRoutedSectionId(requestedSection)) {
    notFound();
  }

  const locale = isSupportedLocale(requestedLocale) ? requestedLocale : "en";

  return <HomeClient initialSection={requestedSection} locale={locale} />;
}
