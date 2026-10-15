interface QueueBattle {
  readonly id: string;
  readonly scope: string;
  readonly status?: string;
  readonly viewerParticipates?: boolean;
  readonly entries: readonly { readonly isMine?: boolean }[];
}

export function battleQueue<T extends QueueBattle>(
  battles: readonly T[],
  filter: string,
  votes: Readonly<Record<string, unknown>>,
  skipped: readonly string[],
): T[] {
  const omitted = new Set(skipped);
  return battles.filter(
    (battle) =>
      (filter === "all" || battle.scope === filter) &&
      (!battle.status || battle.status === "OPEN") &&
      battle.entries.length === 2 &&
      !battle.viewerParticipates &&
      !battle.entries.some((entry) => entry.isMine) &&
      !Object.hasOwn(votes, battle.id) &&
      !omitted.has(battle.id),
  );
}
