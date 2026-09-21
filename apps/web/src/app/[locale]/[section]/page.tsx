import {
  isSupportedLocale,
  supportedLocales,
  type SupportedLocale,
} from "@gprn/i18n";
import { notFound } from "next/navigation";

import { HomeClient } from "../home-client";
import {
  isRoutedSectionId,
  routedSectionIds,
  type RoutedSectionId,
} from "../sections";

interface SectionPageProps {
  readonly params: Promise<{
    readonly locale: string;
    readonly section: string;
  }>;
  readonly searchParams: Promise<{
    readonly author?: string | string[];
    readonly model?: string | string[];
    readonly studio?: string | string[];
  }>;
}

export function generateStaticParams(): Array<{
  locale: SupportedLocale;
  section: RoutedSectionId;
}> {
  return supportedLocales.flatMap((locale) =>
    routedSectionIds.map((section) => ({ locale, section })),
  );
}

export default async function SectionPage({
  params,
  searchParams,
}: SectionPageProps): Promise<React.ReactNode> {
  const { locale: requestedLocale, section: requestedSection } = await params;
  const { author, model, studio } = await searchParams;

  if (!isRoutedSectionId(requestedSection)) {
    notFound();
  }

  const locale = isSupportedLocale(requestedLocale) ? requestedLocale : "en";

  return (
    <HomeClient
      initialAuthorId={typeof author === "string" ? author : undefined}
      initialModelId={typeof model === "string" ? model : undefined}
      initialSection={requestedSection}
      initialStudioId={typeof studio === "string" ? studio : undefined}
      locale={locale}
    />
  );
}
