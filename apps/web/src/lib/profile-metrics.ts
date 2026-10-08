export interface ProfileMetricValues {
  readonly rating: number;
  readonly photos: number;
  readonly wins: number;
  readonly followers: number;
}

export function visibleProfileMetrics(values: ProfileMetricValues) {
  return [
    { value: values.rating, key: "common.rating" as const },
    { value: values.photos, key: "profile.photos" as const },
    { value: values.wins, key: "profile.wins" as const },
    { value: values.followers, key: "profile.followers" as const },
  ].filter(({ value }) => Number.isFinite(value) && value > 0);
}
