export const marketplacePageSize = 48;

export interface MarketplaceDemoWork {
  readonly id: string;
  readonly kind: "PHOTO" | "VIDEO";
  readonly title: string;
  readonly imageUrl: string;
  readonly videoUrl?: string;
  readonly genre: string;
  readonly seller: { readonly username: string; readonly displayName: string };
}

export function selectMarketplaceDemos(
  works: readonly MarketplaceDemoWork[],
  filters: {
    kind: string;
    genre: string;
    search: string;
    page: number;
    selected: string | null;
  },
  listedPhotoIds: readonly (string | undefined)[],
  locale: string,
) {
  if (
    filters.page !== 1 ||
    filters.selected ||
    !["ALL", "PHOTO", "VIDEO"].includes(filters.kind)
  )
    return [];
  const listed = new Set(listedPhotoIds);
  const search = filters.search.trim().toLocaleLowerCase(locale);
  return works.filter(
    (work) =>
      !listed.has(work.id) &&
      (filters.kind === "ALL" || work.kind === filters.kind) &&
      (!filters.genre || work.genre === filters.genre) &&
      (!search ||
        `${work.title} ${work.seller.displayName} ${work.seller.username}`
          .toLocaleLowerCase(locale)
          .includes(search)),
  );
}
