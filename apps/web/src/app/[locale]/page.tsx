import { isSupportedLocale } from "@gprn/i18n";

import { HomeClient } from "./home-client";

interface HomePageProps {
  readonly params: Promise<{
    readonly locale: string;
  }>;
}

export default async function HomePage({ params }: HomePageProps): Promise<React.ReactNode> {
  const { locale: requestedLocale } = await params;
  const locale = isSupportedLocale(requestedLocale) ? requestedLocale : "en";

  return <HomeClient initialSection="home" locale={locale} />;
}
