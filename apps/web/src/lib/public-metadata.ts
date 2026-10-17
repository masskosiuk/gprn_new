import { demoBattleAuthors, demoExpertUsernames } from "@gprn/domain";
import { getMessage, type MessageKey, type SupportedLocale } from "@gprn/i18n";
import type { PublicPageData, PublicPageQuery } from "./public-page-data";
import {
  breadcrumbs,
  pageMetadata,
  pagePath,
  privateSections,
  publicImage,
  siteUrl,
} from "./seo.ts";

const demoUsernames = new Set<string>([
  ...demoBattleAuthors.map((author) => author.username),
  ...Object.values(demoExpertUsernames),
]);
export function isDemoProfile(username: string): boolean {
  return demoUsernames.has(username);
}

export function publicPageMetadata(
  locale: SupportedLocale,
  section: string,
  query: PublicPageQuery,
  data: PublicPageData,
) {
  let title: string | undefined;
  let description: string | undefined;
  let image: string | null | undefined;
  let noindex = privateSections.has(section);
  const canonicalQuery: Record<string, string> = {};
  if (section === "profile") {
    noindex =
      !data.profile ||
      Boolean(data.profile.isDemo) ||
      isDemoProfile(data.profile.username);
    if (query.author)
      canonicalQuery.author = data.profile?.username ?? query.author;
    title = data.profile?.displayName;
    description = data.profile?.bio ?? undefined;
    image = data.profile?.coverUrl || data.profile?.avatarUrl;
    if (query.photo) {
      const photo = data.profile?.photos.find(
        (photo) => photo.id === query.photo,
      );
      canonicalQuery.photo = query.photo;
      noindex ||= !photo;
      if (photo) {
        title = `${photo.title} — ${data.profile!.displayName}`;
        image = photo.assets?.displayUrl || photo.displayUrl;
      }
    }
  }
  if (query.post && ["events", "discussions", "search"].includes(section)) {
    const post = data.board?.post;
    canonicalQuery.post = query.post;
    title = post?.title;
    description = post?.body;
    image = post?.coverUrl;
    noindex ||= !post || post.isDemo || isDemoProfile(post.author.username);
  }
  if (section === "challenges" && query.challenge) {
    const challenge = data.challenges?.challenges.find(
      (value) => value.slug === query.challenge || value.id === query.challenge,
    );
    canonicalQuery.challenge = challenge?.slug ?? query.challenge;
    title =
      challenge?.title ||
      (challenge
        ? getMessage(locale, challenge.titleKey as MessageKey)
        : undefined);
    description = challenge?.descriptionKey
      ? getMessage(locale, challenge.descriptionKey as MessageKey)
      : undefined;
    image = challenge?.coverUrl;
    noindex ||= !challenge;
  }
  if (section === "battles" && query.battle) {
    const battle = data.battles?.battles.find(
      (value) => value.id === query.battle,
    );
    canonicalQuery.battle = query.battle;
    title = battle?.entries
      .map((entry) => entry.owner.displayName)
      .join(" vs ");
    image = battle?.entries[0]?.photo.displayUrl;
    noindex ||=
      !battle ||
      battle.entries.some((entry) => isDemoProfile(entry.owner.username));
  }
  if (section === "marketplace" && query.product) {
    const product = data.marketplace?.products.find(
      (value) => value.id === query.product,
    );
    canonicalQuery.product = query.product;
    title = product?.title;
    image = product?.imageUrl;
    noindex ||=
      !product || (product ? isDemoProfile(product.seller.username) : false);
  }
  if (
    (section === "models" && query.model) ||
    (section === "studios" && query.studio)
  ) {
    // These directories currently contain illustrative profiles, not participating businesses.
    const key = section === "models" ? "model" : "studio";
    canonicalQuery[key] = query[key]!;
    noindex = true;
  }
  return pageMetadata(locale, section === "home" ? "" : section, {
    title,
    description,
    image,
    query: canonicalQuery,
    noindex,
  });
}

export function publicPageSchema(
  locale: SupportedLocale,
  section: string,
  query: PublicPageQuery,
  data: PublicPageData,
): unknown[] {
  if (section === "home")
    return [
      {
        "@context": "https://schema.org",
        "@type": "Organization",
        "@id": `${siteUrl()}/#organization`,
        name: "Global Production & Reputation Network",
        alternateName: "GPRN",
        url: siteUrl(),
        logo: `${siteUrl()}/apple-icon.png`,
      },
      {
        "@context": "https://schema.org",
        "@type": "WebSite",
        name: "GPRN",
        url: siteUrl(),
        inLanguage: locale,
        publisher: { "@id": `${siteUrl()}/#organization` },
      },
    ];
  const metadata = publicPageMetadata(locale, section, query, data);
  if (!(
    metadata.robots &&
    typeof metadata.robots === "object" &&
    metadata.robots.index
  ))
    return [];
  const title = String(metadata.title);
  const url = siteUrl() + String(metadata.alternates!.canonical);
  const result: unknown[] = [
    breadcrumbs(
      locale,
      section,
      title,
      Object.fromEntries(new URL(url).searchParams),
    ),
  ];
  if (section === "profile" && data.profile && !query.photo)
    result.push({
      "@context": "https://schema.org",
      "@type": "ProfilePage",
      url,
      inLanguage: locale,
      mainEntity: {
        "@type": "Person",
        name: data.profile.displayName,
        alternateName: data.profile.username,
        description: data.profile.bio || undefined,
        image: publicImage(data.profile.avatarUrl),
        url,
      },
    });
  const post = data.board?.post;
  if (post?.kind === "EVENT")
    result.push({
      "@context": "https://schema.org",
      "@type": "Event",
      name: post.title,
      description: post.body,
      url,
      startDate: post.startsAt,
      endDate: post.endsAt || undefined,
      image: publicImage(post.coverUrl),
      location: { "@type": "Place", name: post.location },
      organizer: {
        "@type": "Person",
        name: post.author.displayName,
        url:
          siteUrl() +
          pagePath(locale, "profile", { author: post.author.username }),
      },
    });
  return result;
}
