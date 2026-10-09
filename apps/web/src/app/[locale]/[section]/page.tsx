import {
  isSupportedLocale,
  supportedLocales,
  type SupportedLocale,
} from "@gprn/i18n";
import { notFound, redirect } from "next/navigation";

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
    readonly battle?: string | string[];
    readonly challenge?: string | string[];
    readonly model?: string | string[];
    readonly photo?: string | string[];
    readonly post?: string | string[];
    readonly product?: string | string[];
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
  const { author, battle, challenge, model, photo, post, product, studio } =
    await searchParams;

  if (!isRoutedSectionId(requestedSection)) {
    notFound();
  }

  const locale = isSupportedLocale(requestedLocale) ? requestedLocale : "en";

  if (requestedSection === "discover" || requestedSection === "video") {
    const query = new URLSearchParams({
      media: requestedSection === "video" ? "VIDEO" : "PHOTO",
    });
    for (const [key, value] of Object.entries(await searchParams)) {
      if (typeof value === "string" && key !== "media") query.set(key, value);
    }
    redirect(`/${locale}/feed?${query}`);
  }

  if (requestedSection === "leaderboard") {
    redirect(`/${locale}/experts`);
  }

  return (
    <HomeClient
      initialAuthorId={typeof author === "string" ? author : undefined}
      initialBattleId={typeof battle === "string" ? battle : undefined}
      initialChallengeId={typeof challenge === "string" ? challenge : undefined}
      initialModelId={typeof model === "string" ? model : undefined}
      initialPhotoId={typeof photo === "string" ? photo : undefined}
      initialPostId={typeof post === "string" ? post : undefined}
      initialProductId={typeof product === "string" ? product : undefined}
      initialSection={requestedSection}
      initialStudioId={typeof studio === "string" ? studio : undefined}
      locale={locale}
    />
  );
}
