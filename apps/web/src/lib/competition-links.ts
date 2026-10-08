export type CompetitionKind = "battle" | "challenge";

export function competitionPath(
  locale: string,
  kind: CompetitionKind,
  id: string,
): string {
  const section = kind === "battle" ? "battles" : "challenges";
  return `/${locale}/${section}?${new URLSearchParams({ [kind]: id })}`;
}

export function sharedCompetitionId(
  requested: string | undefined,
  competitions: readonly { id: string }[],
): string | null {
  return (
    competitions.find((competition) => competition.id === requested)?.id ?? null
  );
}
