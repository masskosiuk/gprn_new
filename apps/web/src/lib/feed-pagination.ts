import type { FeedFilters } from "./feed-filter";

export function mergeFeedPage<T extends { id: string }>(
  current: readonly T[],
  incoming: readonly T[],
): T[] {
  const byId = new Map(current.map((item) => [item.id, item]));
  for (const item of incoming) byId.set(item.id, item);
  return [...byId.values()];
}

export function feedQueryString(
  filters: FeedFilters,
  saleOnly: boolean,
  searchCities: readonly string[] = [],
) {
  const query = new URLSearchParams();
  if (filters.sort === "best") query.set("sort", filters.sort);
  if (filters.kind !== "ALL") query.set("mediaType", filters.kind);
  if (filters.category !== "all") query.set("category", filters.category);
  if (filters.location !== "all") query.set("location", filters.location);
  if (filters.search.trim()) query.set("search", filters.search.trim());
  if (filters.from)
    query.set("from", new Date(filters.from + "T00:00:00").toISOString());
  if (filters.to)
    query.set("to", new Date(filters.to + "T23:59:59.999").toISOString());
  if (saleOnly) query.set("saleOnly", "true");
  if (filters.search.trim() && searchCities.length)
    query.set("searchCities", searchCities.join(","));
  return query.toString();
}
