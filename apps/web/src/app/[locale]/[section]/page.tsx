import {
  isSupportedLocale,
  supportedLocales,
  type SupportedLocale,
} from "@gprn/i18n";
import { notFound, redirect } from "next/navigation";
import { headers } from "next/headers";

import { HomeClient } from "../home-client";
import { loadPublicPage } from "../../../lib/public-api";
import {
  publicPageMetadata,
  publicPageSchema,
} from "../../../lib/public-metadata";
import { jsonLd } from "../../../lib/seo";
import type { PublicPageQuery } from "../../../lib/public-page-data";
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

export const dynamic = "force-dynamic";
function publicQuery(
  values: Awaited<SectionPageProps["searchParams"]>,
): PublicPageQuery {
  return Object.fromEntries(
    Object.entries(values).filter(
      ([key, value]) =>
        [
          "author",
          "photo",
          "post",
          "battle",
          "challenge",
          "product",
          "model",
          "studio",
        ].includes(key) &&
        typeof value === "string" &&
        value.length <= 200,
    ),
  );
}

export async function generateMetadata({
  params,
  searchParams,
}: SectionPageProps) {
  const { locale: requestedLocale, section } = await params;
  const locale = isSupportedLocale(requestedLocale) ? requestedLocale : "en";
  if (!isRoutedSectionId(section))
    return { robots: { index: false, follow: false } };
  const query = publicQuery(await searchParams);
  return publicPageMetadata(
    locale,
    section,
    query,
    await loadPublicPage(section, JSON.stringify(query)),
  );
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

  const query = publicQuery(await searchParams);
  const data = await loadPublicPage(requestedSection, JSON.stringify(query));
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  return (
    <>
      <script
        nonce={nonce}
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: jsonLd(
            publicPageSchema(locale, requestedSection, query, data),
          ),
        }}
      />
      <HomeClient
        key={`${requestedSection}:${JSON.stringify(query)}`}
        initialPublicData={data}
        initialAuthorId={typeof author === "string" ? author : undefined}
        initialBattleId={typeof battle === "string" ? battle : undefined}
        initialChallengeId={
          typeof challenge === "string" ? challenge : undefined
        }
        initialModelId={typeof model === "string" ? model : undefined}
        initialPhotoId={typeof photo === "string" ? photo : undefined}
        initialPostId={typeof post === "string" ? post : undefined}
        initialProductId={typeof product === "string" ? product : undefined}
        initialSection={requestedSection}
        initialStudioId={typeof studio === "string" ? studio : undefined}
        locale={locale}
      />
    </>
  );
}
