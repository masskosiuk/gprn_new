export const photoMapMarkerSize = 40;
export type PhotoMapSlots = Map<string, Map<string, number>>;

export function layoutPhotoMapMarkers<
  T extends { photoId: string; latitude: number; longitude: number },
>(markers: readonly T[], slots: PhotoMapSlots, selectedPhoto?: T | null) {
  const visible =
    selectedPhoto &&
    !markers.some((photo) => photo.photoId === selectedPhoto.photoId)
      ? [...markers, selectedPhoto]
      : markers;
  return visible.flatMap((photo) => {
    if (!Number.isFinite(photo.latitude) || !Number.isFinite(photo.longitude))
      return [];
    const key = `${photo.latitude.toFixed(4)}:${photo.longitude.toFixed(4)}`;
    let location = slots.get(key);
    if (!location) {
      location = new Map();
      slots.set(key, location);
    }
    let slot = location.get(photo.photoId);
    if (slot === undefined) {
      slot = location.size;
      location.set(photo.photoId, slot);
    }
    return [{ photo, offset: markerOffset(slot) }];
  });
}

function markerOffset(slot: number) {
  if (slot === 0) return { x: 0, y: 0 };
  let ring = 1;
  let remaining = slot - 1;
  while (remaining >= 6 * ring) {
    remaining -= 6 * ring;
    ring++;
  }
  // Hexagonal rings keep individual thumbnails apart without changing their GPS coordinates.
  const directions = [
    [-1, 1],
    [-1, 0],
    [0, -1],
    [1, -1],
    [1, 0],
    [0, 1],
  ] as const;
  let q = ring;
  let r = 0;
  for (const [dq, dr] of directions) {
    const steps = Math.min(remaining, ring);
    q += dq * steps;
    r += dr * steps;
    remaining -= steps;
    if (remaining === 0) break;
  }
  const spacing = photoMapMarkerSize + 6;
  return { x: spacing * (q + r / 2), y: ((spacing * Math.sqrt(3)) / 2) * r };
}
