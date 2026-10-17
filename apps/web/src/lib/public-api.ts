import "server-only";
import { cache } from "react";
import { unstable_rethrow } from "next/navigation";
import type { PublicPageData, PublicPageQuery } from "./public-page-data";
import { canonicalProfileUsername } from "./profile-source";

function apiRoot(): string {
  const url = new URL(
    process.env.INTERNAL_API_URL ||
      process.env.NEXT_PUBLIC_API_URL ||
      "http://127.0.0.1:4000/api/v1",
  );
  if (!/^https?:$/.test(url.protocol) || url.username || url.password)
    throw new Error("Invalid public API URL");
  return url.href.replace(/\/$/, "");
}

export const publicRequest = cache(
  async <T>(path: string): Promise<T | undefined> => {
    try {
      // Only explicit public endpoints are used. Never forward cookies or authorization.
      const response = await fetch(apiRoot() + path, {
        cache: "no-store",
        credentials: "omit",
        signal: AbortSignal.timeout(2500),
      });
      if (!response.ok) return undefined;
      return (await response.json()) as T;
    } catch (error) {
      unstable_rethrow(error);
      return undefined;
    }
  },
);

export const loadPublicPage = cache(
  async (section: string, serializedQuery = "{}"): Promise<PublicPageData> => {
    const query = JSON.parse(serializedQuery) as PublicPageQuery;
    const data: PublicPageData = {};
    const jobs: Promise<void>[] = [];
    if (["home", "feed"].includes(section))
      jobs.push(
        publicRequest<PublicPageData["discover"]>("/discover").then((value) => {
          data.discover = value;
        }),
      );
    if (section === "home" || section === "battles")
      jobs.push(
        publicRequest<PublicPageData["battles"]>("/battles/open").then(
          (value) => {
            data.battles = value;
          },
        ),
      );
    if (section === "home" || section === "challenges") {
      jobs.push(
        publicRequest<PublicPageData["challenges"]>("/challenges").then(
          (value) => {
            data.challenges = value;
          },
        ),
      );
      jobs.push(
        publicRequest<{ season: PublicPageData["season"] }>(
          "/seasons/current",
        ).then((value) => {
          data.season = value?.season;
        }),
      );
    }
    if (section === "profile" && query.author)
      jobs.push(
        publicRequest<{ profile: NonNullable<PublicPageData["profile"]> }>(
          `/profiles/${encodeURIComponent(canonicalProfileUsername(query.author))}`,
        ).then((value) => {
          data.profile = value?.profile;
        }),
      );
    const kind = (
      { events: "EVENT", discussions: "DISCUSSION", search: "CASTING" } as const
    )[section as "events"];
    if (kind)
      jobs.push(
        publicRequest<PublicPageData["board"]>(
          query.post
            ? `/community/posts/${encodeURIComponent(query.post)}`
            : `/community/posts?kind=${kind}&page=1`,
        ).then((value) => {
          data.board = value;
        }),
      );
    if (section === "home")
      jobs.push(
        publicRequest<PublicPageData["highlights"]>(
          "/community/highlights",
        ).then((value) => {
          data.highlights = value;
        }),
      );
    if (section === "experts") {
      jobs.push(
        publicRequest<PublicPageData["directory"]>("/profiles?page=1").then(
          (value) => {
            data.directory = value;
          },
        ),
      );
      jobs.push(
        publicRequest<PublicPageData["leaders"]>("/leaderboards/global").then(
          (value) => {
            data.leaders = value;
          },
        ),
      );
    }
    if (section === "marketplace")
      jobs.push(
        publicRequest<PublicPageData["marketplace"]>(
          `/digital-products?kind=${query.product ? "ALL" : "MEDIA"}&page=1&pageSize=48${query.product ? `&id=${encodeURIComponent(query.product)}` : ""}`,
        ).then((value) => {
          data.marketplace = value;
        }),
      );
    await Promise.all(jobs);
    return data;
  },
);
