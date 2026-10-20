export const FEED_SORTS = ["newest", "best"] as const;
export type FeedSort = (typeof FEED_SORTS)[number];
export const DEFAULT_FEED_SORT: FeedSort = "newest";
