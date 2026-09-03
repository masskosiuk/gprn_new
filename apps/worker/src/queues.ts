export const queueNames = [
  "photo-processing",
  "provenance",
  "leaderboards",
  "notifications",
  "email",
  "analytics",
  "search-index"
] as const;

export type QueueName = (typeof queueNames)[number];

