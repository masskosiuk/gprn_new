import type { Prisma } from "@gprn/db";

export const ROUND_VOTES_TO_ADVANCE = 11;
export const MATCH_VOTE_BAND = 20;

export interface RoundCandidate {
  id: string;
  photoId: string;
  userId: string;
  categoryId: string | null;
  votes: number;
  round: number;
}

export function voteBand(votes: number): number {
  return votes <= MATCH_VOTE_BAND
    ? 0
    : Math.floor((votes - 1) / MATCH_VOTE_BAND);
}

export function pairRoundCandidates<T extends RoundCandidate>(
  candidates: readonly T[],
  previousPairs: readonly (readonly string[])[],
): [T, T][] {
  const faced = new Set(
    previousPairs
      .filter((p) => p.length === 2)
      .map((p) => [...p].sort().join(":")),
  );
  const remaining = [...candidates];
  const pairs: [T, T][] = [];
  while (remaining.length) {
    const left = remaining.shift()!;
    if (!left.categoryId) continue;
    const index = remaining.reduce((best, right, i) => {
      if (
        right.userId === left.userId ||
        right.photoId === left.photoId ||
        right.categoryId !== left.categoryId ||
        voteBand(right.votes) !== voteBand(left.votes) ||
        faced.has([left.photoId, right.photoId].sort().join(":"))
      )
        return best;
      return best < 0 ||
        Math.abs(right.votes - left.votes) <
          Math.abs(remaining[best]!.votes - left.votes)
        ? i
        : best;
    }, -1);
    if (index >= 0) pairs.push([left, remaining.splice(index, 1)[0]!]);
  }
  return pairs;
}

export function seasonWinnerIds<
  T extends RoundCandidate & { wonRounds: number },
>(rows: readonly T[]): string[] {
  const winners = new Map<string, T[]>();
  for (const row of rows) {
    if (
      !row.categoryId ||
      row.wonRounds < 1 ||
      row.votes < ROUND_VOTES_TO_ADVANCE
    )
      continue;
    const best = winners.get(row.categoryId);
    if (!best || row.votes > best[0]!.votes) winners.set(row.categoryId, [row]);
    else if (row.votes === best[0]!.votes) best.push(row);
  }
  return [...winners.values()].flat().map((row) => row.id);
}

export async function lockBattleSeason(
  tx: Prisma.TransactionClient,
  seasonId: string | null,
) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${"battle-rounds:" + (seasonId ?? "legacy")}, 0))`;
}

export async function lockBattlePhoto(
  tx: Prisma.TransactionClient,
  photoId: string,
) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${"battle-photo:" + photoId}, 0))`;
}

const publicPhoto = {
  deletedAt: null,
  status: "PUBLISHED",
  visibility: "PUBLIC",
  moderationStatus: "APPROVED",
  NOT: { title: { startsWith: "__profile_" } },
  owner: {
    status: "ACTIVE",
    profile: { deletedAt: null, visibility: "PUBLIC" },
  },
  assets: { none: { type: "DISPLAY", contentType: { startsWith: "video/" } } },
} satisfies Prisma.PhotoWhereInput;

// Call under the season transaction lock, after joining, moderation or a completed round.
export async function matchSeasonRounds(
  tx: Prisma.TransactionClient,
  seasonId: string,
  now = new Date(),
) {
  const season = await tx.season.findUnique({ where: { id: seasonId } });
  if (
    !season ||
    season.status !== "ACTIVE" ||
    season.startsAt > now ||
    season.endsAt <= now ||
    season.battleFinalizedAt
  )
    return;
  const pending = await tx.battleProgress.findMany({
    where: {
      seasonId,
      status: { in: ["PENDING", "ACTIVE", "UNAVAILABLE"] },
      photo: publicPhoto,
    },
    include: {
      currentBattle: { include: { entries: true } },
      photo: { select: { categoryId: true } },
    },
  });
  for (const row of pending) {
    const approved = row.currentBattle?.entries.some(
      (entry) =>
        entry.photoId === row.photoId && entry.moderationStatus === "APPROVED",
    );
    if (
      approved &&
      row.currentBattle?.status === "OPEN" &&
      row.status !== "ACTIVE"
    ) {
      await tx.battleProgress.update({
        where: { id: row.id },
        data: { status: "ACTIVE", categoryId: row.photo.categoryId },
      });
    } else if (
      approved &&
      row.currentBattle &&
      (row.currentBattle.status === "CLOSED" ||
        row.currentBattle.status === "CANCELLED" ||
        row.currentBattle.status === "DRAFT")
    ) {
      await tx.battleProgress.update({
        where: { id: row.id },
        data: {
          status: "WAITING",
          categoryId: row.photo.categoryId,
          ...(row.status === "ACTIVE" ? { round: { increment: 1 } } : {}),
        },
      });
    }
  }
  const waiting = await tx.battleProgress.findMany({
    where: { seasonId, status: "WAITING", photo: publicPhoto },
    orderBy: [{ updatedAt: "asc" }, { id: "asc" }],
    include: {
      currentBattle: { select: { status: true } },
      photo: { select: { categoryId: true } },
    },
  });
  for (const row of waiting) {
    if (row.categoryId === row.photo.categoryId) continue;
    await tx.battleProgress.update({
      where: { id: row.id },
      data: { categoryId: row.photo.categoryId },
    });
    row.categoryId = row.photo.categoryId;
  }
  const history = await tx.battle.findMany({
    where: {
      seasonId,
      status: { in: ["OPEN", "CLOSED", "CANCELLED"] },
      entries: { some: { photoId: { in: waiting.map((row) => row.photoId) } } },
    },
    select: { entries: { select: { photoId: true } } },
  });
  for (const [left, right] of pairRoundCandidates(
    waiting,
    history.map((battle) => battle.entries.map((entry) => entry.photoId)),
  )) {
    const battle = await tx.battle.create({
      data: {
        seasonId,
        categoryId: left.categoryId,
        status: "OPEN",
        startsAt: now,
        endsAt: season.endsAt,
        entries: {
          create: [left, right].map((row, index) => ({
            photoId: row.photoId,
            userId: row.userId,
            round: row.round,
            slot: index ? "B" : "A",
            moderationStatus: "APPROVED",
            moderatedAt: now,
          })),
        },
      },
    });
    await tx.battle.updateMany({
      where: {
        id: {
          in: [left, right].flatMap((row) =>
            row.currentBattleId && row.currentBattle?.status === "DRAFT"
              ? [row.currentBattleId]
              : [],
          ),
        },
        status: "DRAFT",
      },
      data: { status: "CANCELLED", endsAt: now },
    });
    await tx.battleProgress.updateMany({
      where: { id: { in: [left.id, right.id] } },
      data: { currentBattleId: battle.id, status: "ACTIVE" },
    });
  }
}

export async function finalizeBattleSeason(
  tx: Prisma.TransactionClient,
  seasonId: string,
  now = new Date(),
) {
  const season = await tx.season.findUnique({ where: { id: seasonId } });
  if (
    !season ||
    season.battleFinalizedAt ||
    (season.endsAt > now && !["COMPLETED", "ARCHIVED"].includes(season.status))
  )
    return;
  const candidates = await tx.battleProgress.findMany({
    where: {
      seasonId,
      status: { in: ["ACTIVE", "WAITING"] },
      photo: publicPhoto,
    },
    include: { photo: { select: { categoryId: true } } },
  });
  for (const row of candidates) {
    if (row.categoryId === row.photo.categoryId) continue;
    await tx.battleProgress.update({
      where: { id: row.id },
      data: { categoryId: row.photo.categoryId },
    });
    row.categoryId = row.photo.categoryId;
  }
  const winnerIds = seasonWinnerIds(candidates);
  await tx.battleProgress.updateMany({
    where: { seasonId, status: { in: ["ACTIVE", "WAITING", "PENDING"] } },
    data: { status: "COMPLETED" },
  });
  if (winnerIds.length)
    await tx.battleProgress.updateMany({
      where: { id: { in: winnerIds } },
      data: { status: "WINNER" },
    });
  await tx.battle.updateMany({
    where: { seasonId, status: { in: ["DRAFT", "OPEN"] } },
    data: { status: "CANCELLED", endsAt: now },
  });
  await tx.season.update({
    where: { id: seasonId },
    data: { battleFinalizedAt: now },
  });
}
