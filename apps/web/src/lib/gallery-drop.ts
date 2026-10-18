export type DropEdge = "top" | "right" | "bottom" | "left";
export function galleryDropPoint(
  point: { x: number; y: number },
  rect: { left: number; top: number; width: number; height: number },
) {
  const right = rect.left + rect.width;
  const bottom = rect.top + rect.height;
  const edges: [DropEdge, number][] = [
    ["left", Math.abs(point.x - rect.left)],
    ["right", Math.abs(point.x - right)],
    ["top", Math.abs(point.y - rect.top)],
    ["bottom", Math.abs(point.y - bottom)],
  ];
  const edge = edges.sort((a, b) => a[1] - b[1])[0]![0];
  const dx = Math.max(rect.left - point.x, 0, point.x - right);
  const dy = Math.max(rect.top - point.y, 0, point.y - bottom);
  return {
    edge,
    placement:
      edge === "left" || edge === "top"
        ? ("before" as const)
        : ("after" as const),
    distance: dx * dx + dy * dy,
  };
}
