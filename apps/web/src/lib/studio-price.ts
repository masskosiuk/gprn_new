export type StudioPriceOrder = "default" | "asc" | "desc";
export function filterStudioPrices<T extends { hourlyRateMinor: number }>(
  studios: readonly T[],
  min: string,
  max: string,
  order: StudioPriceOrder,
): T[] {
  const lower = min.trim() ? Math.round(Number(min) * 100) : 0;
  const upper = max.trim() ? Math.round(Number(max) * 100) : Infinity;
  const result = studios.filter(
    (studio) =>
      studio.hourlyRateMinor >= lower && studio.hourlyRateMinor <= upper,
  );
  return order === "default"
    ? result
    : result.sort((a, b) =>
        order === "asc"
          ? a.hourlyRateMinor - b.hourlyRateMinor
          : b.hourlyRateMinor - a.hourlyRateMinor,
      );
}
