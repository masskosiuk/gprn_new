export function paletteFromPixels(pixels: Uint8Array): string[] {
  const buckets = new Map<string, { count: number; rgb: number[] }>();
  for (let offset = 0; offset + 2 < pixels.length; offset += 3) {
    const rgb = [pixels[offset]!, pixels[offset + 1]!, pixels[offset + 2]!];
    const key = rgb.map((channel) => channel >> 4).join(",");
    const bucket = buckets.get(key) ?? { count: 0, rgb: [0, 0, 0] };
    bucket.count++;
    rgb.forEach((channel, index) => {
      bucket.rgb[index]! += channel;
    });
    buckets.set(key, bucket);
  }
  const candidates = [...buckets.values()]
    .sort((a, b) => b.count - a.count)
    .map((bucket) =>
      bucket.rgb.map((channel) => Math.round(channel / bucket.count)),
    );
  const selected: number[][] = [];
  for (const rgb of candidates) {
    if (
      selected.every(
        (other) =>
          rgb.reduce(
            (sum, channel, index) => sum + (channel - other[index]!) ** 2,
            0,
          ) >
          40 ** 2,
      )
    )
      selected.push(rgb);
    if (selected.length === 4) break;
  }
  return selected.map(
    (rgb) =>
      `#${rgb.map((channel) => channel.toString(16).padStart(2, "0")).join("")}`,
  );
}
