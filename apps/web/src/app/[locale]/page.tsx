import { isSupportedLocale } from "@gprn/i18n";

import { HomeClient } from "./home-client";
import { headers } from "next/headers";
import { loadPublicPage } from "../../lib/public-api";
import { jsonLd, pageMetadata } from "../../lib/seo";
import { publicPageSchema } from "../../lib/public-metadata";

export const dynamic = "force-dynamic";
export async function generateMetadata({ params }: HomePageProps) {
  const { locale } = await params;
  return pageMetadata(isSupportedLocale(locale) ? locale : "en");
}

interface HomePageProps {
  readonly params: Promise<{
    readonly locale: string;
  }>;
}

export default async function HomePage({
  params,
}: HomePageProps): Promise<React.ReactNode> {
  const { locale: requestedLocale } = await params;
  const locale = isSupportedLocale(requestedLocale) ? requestedLocale : "en";

  const data = await loadPublicPage("home");
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  return (
    <>
      <script
        nonce={nonce}
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: jsonLd(publicPageSchema(locale, "home", {}, data)),
        }}
      />
      <HomeClient
        initialPublicData={data}
        initialSection="home"
        locale={locale}
      />
    </>
  );
}
