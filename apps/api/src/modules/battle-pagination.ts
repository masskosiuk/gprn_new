export const battlePageSize = 20;

export function battlePageQuery(cursor?: string) {
  return {
    orderBy: [{ createdAt: "desc" as const }, { id: "desc" as const }],
    take: battlePageSize + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  };
}

export function battlePage<T extends { readonly id: string }>(
  rows: readonly T[],
) {
  const items = rows.slice(0, battlePageSize);
  return {
    items,
    nextCursor: rows.length > battlePageSize ? items.at(-1)!.id : null,
  };
}
