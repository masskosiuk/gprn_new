export interface FeedFilters {
  kind: "ALL" | "PHOTO" | "VIDEO";
  category: string;
  location: string;
  from: string;
  to: string;
  search: string;
}
export function matchesFeedFilters(
  work: {
    video: boolean;
    category: string;
    location: string;
    publishedAt?: string;
    searchText: string;
  },
  filters: FeedFilters,
  locale: string,
) {
  if (filters.kind !== "ALL" && work.video !== (filters.kind === "VIDEO"))
    return false;
  if (filters.category !== "all" && work.category !== filters.category)
    return false;
  if (filters.location !== "all" && work.location !== filters.location)
    return false;
  const date = work.publishedAt ? new Date(work.publishedAt) : null;
  if (filters.from && (!date || date < new Date(filters.from + "T00:00:00")))
    return false;
  if (filters.to && (!date || date > new Date(filters.to + "T23:59:59.999")))
    return false;
  const query = filters.search.trim().toLocaleLowerCase(locale);
  return !query || work.searchText.toLocaleLowerCase(locale).includes(query);
}
