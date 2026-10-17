import type {
  DiscoverResponse,
  ServerProfilePayload,
  ServerBattlePayload,
  ServerChallengePayload,
} from "../app/[locale]/home-client";
import type { Post, Kind } from "../app/[locale]/community";
import type { Directory, Leader } from "../app/[locale]/server-experts";
import type { Product } from "../app/[locale]/server-marketplace";

export type PublicPageData = {
  discover?: DiscoverResponse;
  profile?: ServerProfilePayload;
  battles?: {
    battles: readonly ServerBattlePayload[];
    nextCursor?: string | null;
  };
  challenges?: { challenges: readonly ServerChallengePayload[] };
  season?: { coverUrl: string | null; name: string | null } | null;
  board?: {
    post?: Post;
    posts?: Post[];
    total?: number;
    locations?: string[];
    languages?: string[];
  };
  highlights?: { groups: Record<Kind, Post[]> };
  directory?: Directory;
  leaders?: { entries: Leader[] };
  marketplace?: { products: Product[]; total: number };
};

export type PublicPageQuery = Partial<
  Record<
    | "author"
    | "photo"
    | "post"
    | "battle"
    | "challenge"
    | "product"
    | "studio"
    | "model",
    string
  >
>;
