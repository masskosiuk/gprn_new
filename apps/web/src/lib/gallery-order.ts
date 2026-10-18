export type GalleryScope = "PORTFOLIO" | "FEED";
export type GalleryMove = {
  photoId: string;
  targetId: string;
  placement: "before" | "after";
};

export function moveGalleryItem<T extends { readonly id: string }>(
  items: readonly T[],
  move: GalleryMove,
): T[] {
  const item = items.find((item) => item.id === move.photoId);
  if (
    !item ||
    move.photoId === move.targetId ||
    !items.some((item) => item.id === move.targetId)
  )
    return [...items];
  const result = items.filter((item) => item.id !== move.photoId);
  result.splice(
    result.findIndex((item) => item.id === move.targetId) +
      (move.placement === "after" ? 1 : 0),
    0,
    item,
  );
  return result;
}

export function applyGalleryOrder<T extends { readonly id: string }>(
  items: readonly T[],
  ids: readonly string[],
): T[] {
  const positions = new Map(ids.map((id, index) => [id, index]));
  return [...items].sort(
    (left, right) =>
      (positions.get(left.id) ?? ids.length) -
      (positions.get(right.id) ?? ids.length),
  );
}
