import assert from "node:assert/strict";
import test from "node:test";
import type { Prisma } from "@gprn/db";
import {
  pairRoundCandidates,
  voteBand,
  seasonWinnerIds,
  matchSeasonRounds,
  finalizeBattleSeason,
  ROUND_VOTES_TO_ADVANCE,
} from "./battle-rounds.js";

const candidate = (
  id: string,
  votes = 0,
  categoryId: string | null = "street",
  userId = id,
) => ({
  id,
  photoId: id,
  userId,
  votes,
  categoryId,
  round: 1,
  wonRounds: votes >= 11 ? 1 : 0,
});

test("round advancement needs eleven real votes, with inclusive twenty-vote matching bands", () => {
  assert.equal(ROUND_VOTES_TO_ADVANCE, 11);
  assert.deepEqual(
    [0, 1, 10, 20, 21, 40, 41].map(voteBand),
    [0, 0, 0, 0, 1, 1, 2],
  );
});

test("matching stays in the genre and vote band, avoids self matches and every previous opponent", () => {
  const rows = [
    candidate("a", 12),
    candidate("b", 13),
    candidate("c", 14),
    candidate("d", 15, "portrait"),
    candidate("e", 21),
    candidate("f", 12, "street", "a"),
    candidate("g", 11),
  ];
  const pairs = pairRoundCandidates(rows, [["b", "a"]]);
  assert.deepEqual(
    pairs.map((pair) => pair.map((row) => row.id)),
    [
      ["a", "g"],
      ["b", "c"],
    ],
  );
  assert.equal(rows.length, 7);
  assert.equal(
    pairRoundCandidates([candidate("one"), candidate("two", 0, null)], [])
      .length,
    0,
  );
});

test("matching uses the nearest accumulated votes and returns both works only once", () => {
  const pairs = pairRoundCandidates(
    [
      candidate("a", 11),
      candidate("far", 20),
      candidate("near", 12),
      candidate("last", 18),
    ],
    [],
  );
  assert.deepEqual(
    pairs.map((p) => p.map((r) => r.id)),
    [
      ["a", "near"],
      ["far", "last"],
    ],
  );
  assert.equal(new Set(pairs.flat().map((p) => p.id)).size, 4);
});

test("genre winners require a completed winning round, actual votes, and never an arbitrary tie break", () => {
  const rows = [
    candidate("a", 22),
    candidate("b", 22),
    candidate("c", 11),
    candidate("p", 15, "portrait"),
    { ...candidate("new", 100), wonRounds: 0 },
    candidate("zero", 0, "landscape"),
  ];
  assert.deepEqual(seasonWinnerIds(rows), ["a", "b", "p"]);
});

function database() {
  const now = new Date("2026-10-19T12:00:00Z");
  const season = {
    id: "season",
    status: "ACTIVE",
    startsAt: new Date("2026-10-01"),
    endsAt: new Date("2026-11-01"),
    battleFinalizedAt: null as Date | null,
  };
  const rows: any[] = [
    candidate("a", 11),
    candidate("b", 7),
    candidate("c", 12),
    candidate("d", 21),
  ].map((row) => ({
    ...row,
    seasonId: season.id,
    status: "WAITING",
    currentBattleId: null,
    currentBattle: null,
    photo: { categoryId: row.categoryId },
  }));
  const history: any[] = [{ entries: [{ photoId: "a" }, { photoId: "b" }] }];
  const created: any[] = [],
    writes: any[] = [];
  const tx = {
    season: {
      findUnique: async () => season,
      update: async ({ data }: any) => Object.assign(season, data),
    },
    battleProgress: {
      findMany: async ({ where }: any) =>
        rows.filter((row) =>
          typeof where.status === "string"
            ? row.status === where.status
            : where.status.in.includes(row.status),
        ),
      update: async ({ where, data }: any) =>
        Object.assign(
          rows.find((row) => row.id === where.id),
          data,
        ),
      updateMany: async ({ where, data }: any) => {
        writes.push({ where, data });
        for (const row of rows)
          if (
            (!where.id || where.id.in.includes(row.id)) &&
            (!where.status || where.status.in.includes(row.status))
          )
            Object.assign(row, data);
      },
    },
    battle: {
      findMany: async () => history,
      create: async ({ data }: any) => {
        const battle = { id: `round-${created.length}`, ...data };
        created.push(battle);
        return battle;
      },
      updateMany: async (args: any) => {
        writes.push(args);
      },
    },
  } as unknown as Prisma.TransactionClient;
  return { tx, season, rows, history, created, writes, now };
}

test("the next pair is persisted with each photo's round and inherited approval, leaving unmatched photos waiting", async () => {
  const db = database();
  db.rows[0]!.round = 2;
  await matchSeasonRounds(db.tx, db.season.id, db.now);
  assert.equal(db.created.length, 1);
  assert.deepEqual(
    db.created[0].entries.create.map((e: any) => [
      e.photoId,
      e.round,
      e.moderationStatus,
    ]),
    [
      ["a", 2, "APPROVED"],
      ["c", 1, "APPROVED"],
    ],
  );
  assert.equal(db.rows[0].status, "ACTIVE");
  assert.equal(db.rows[2].status, "ACTIVE");
  assert.equal(db.rows[1].status, "WAITING");
  assert.equal(db.rows[3].status, "WAITING");
  assert.equal(db.rows[0].votes, 11);
});

test("a lone eligible photo waits instead of winning early; expired seasons cannot start another round", async () => {
  const db = database();
  db.rows.splice(1);
  await matchSeasonRounds(db.tx, db.season.id, db.now);
  await finalizeBattleSeason(db.tx, db.season.id, db.now);
  assert.equal(db.rows[0].status, "WAITING");
  assert.equal(db.season.battleFinalizedAt, null);
  db.season.endsAt = db.now;
  await matchSeasonRounds(db.tx, db.season.id, db.now);
  assert.equal(db.created.length, 0);
});

test("reclassified waiting photos cannot be matched in their previous genre", async () => {
  const db = database();
  db.rows[0].photo.categoryId = "portrait";
  db.rows[1].photo.categoryId = "portrait";
  db.history.length = 0;
  await matchSeasonRounds(db.tx, db.season.id, db.now);
  assert.equal(db.created.length, 1);
  assert.equal(db.created[0].categoryId, "portrait");
  assert.deepEqual(
    db.created[0].entries.create.map((e: any) => e.photoId),
    ["a", "b"],
  );
  assert.equal(db.rows[0].categoryId, "portrait");
  assert.equal(db.rows[2].status, "WAITING");
});

test("approved entries in an old draft resume matching without losing votes", async () => {
  const db = database();
  db.rows[0].status = "PENDING";
  db.rows[0].currentBattleId = "old-draft";
  db.rows[0].currentBattle = {
    status: "DRAFT",
    entries: [
      { photoId: "a", moderationStatus: "APPROVED" },
      { photoId: "pending", moderationStatus: "PENDING" },
    ],
  };
  await matchSeasonRounds(db.tx, db.season.id, db.now);
  assert.equal(db.created.length, 1);
  assert.equal(db.rows[0].status, "ACTIVE");
  assert.equal(db.rows[0].votes, 11);
  assert.equal(db.rows[0].round, 1);
});

test("season finalization awards the genre result once, preserves scores and never creates new votes", async () => {
  const db = database();
  db.season.endsAt = db.now;
  db.rows[3].photo.categoryId = "portrait";
  db.rows[2].status = "WITHDRAWN";
  await finalizeBattleSeason(db.tx, db.season.id, db.now);
  assert.equal(db.rows[0].status, "WINNER");
  assert.equal(db.rows[1].status, "COMPLETED");
  assert.equal(db.rows[2].status, "WITHDRAWN");
  assert.equal(db.rows[3].status, "WINNER");
  assert.equal(db.rows[3].categoryId, "portrait");
  assert.equal(db.rows[3].votes, 21);
  const writes = db.writes.length;
  await finalizeBattleSeason(db.tx, db.season.id, db.now);
  assert.equal(db.writes.length, writes);
  assert.equal(db.created.length, 0);
});
