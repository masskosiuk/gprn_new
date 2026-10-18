export function groupPhotoMapMarkers<
  T extends { latitude: number; longitude: number },
>(markers: readonly T[]): T[][] {
  const groups = new Map<string, T[]>();
  for (const marker of markers) {
    if (!Number.isFinite(marker.latitude) || !Number.isFinite(marker.longitude))
      continue;
    const key = `${marker.latitude.toFixed(4)}:${marker.longitude.toFixed(4)}`;
    const group = groups.get(key);
    if (group) group.push(marker);
    else groups.set(key, [marker]);
  }
  return [...groups.values()];
}
