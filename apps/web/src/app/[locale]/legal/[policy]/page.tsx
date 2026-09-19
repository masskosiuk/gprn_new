import { getMessage, isSupportedLocale, supportedLocales, type MessageKey, type SupportedLocale } from "@gprn/i18n";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

const policyKeys = {
  community: "legal.community",
  cookie: "legal.cookie",
  copyright: "legal.copyright",
  dispute: "legal.dispute",
  privacy: "legal.privacy",
  terms: "legal.terms"
} as const;

interface LegalPageProps {
  readonly params: Promise<{
    readonly locale: string;
    readonly policy: string;
  }>;
}

export function generateStaticParams(): Array<{ locale: SupportedLocale; policy: keyof typeof policyKeys }> {
  return supportedLocales.flatMap((locale) =>
    Object.keys(policyKeys).map((policy) => ({
      locale,
      policy: policy as keyof typeof policyKeys
    }))
  );
}

export async function generateMetadata({ params }: LegalPageProps): Promise<Metadata> {
  const { locale: requestedLocale, policy } = await params;
  const locale = isSupportedLocale(requestedLocale) ? requestedLocale : "en";
  const key = policyKeys[policy as keyof typeof policyKeys];

  return {
    title: key ? getMessage(locale, `${key}.title` as MessageKey) : getMessage(locale, "app.name")
  };
}

export default async function LegalPage({ params }: LegalPageProps): Promise<React.ReactNode> {
  const { locale: requestedLocale, policy } = await params;
  const locale = isSupportedLocale(requestedLocale) ? requestedLocale : "en";
  const key = policyKeys[policy as keyof typeof policyKeys];

  if (!key) {
    notFound();
  }

  return (
    <main className="legal-page">
      <a className="brand" href={`/${locale}`}>
        {getMessage(locale, "app.name")}
      </a>
      <article className="legal-document">
        <p className="eyebrow">{getMessage(locale, "legal.draft")}</p>
        <h1>{getMessage(locale, `${key}.title` as MessageKey)}</h1>
        <p>{getMessage(locale, `${key}.body` as MessageKey)}</p>
      </article>
    </main>
  );
}
