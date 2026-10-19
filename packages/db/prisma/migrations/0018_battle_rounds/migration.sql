ALTER TABLE "seasons" ADD COLUMN "battleFinalizedAt" TIMESTAMP(3);
ALTER TABLE "battle_entries" ADD COLUMN "round" INTEGER NOT NULL DEFAULT 1;
CREATE INDEX "battle_entries_photoId_idx" ON "battle_entries"("photoId");
CREATE INDEX "battle_votes_selectedPhotoId_battleId_idx" ON "battle_votes"("selectedPhotoId", "battleId");

CREATE TABLE "battle_progress" (
  "id" UUID NOT NULL,
  "seasonId" UUID NOT NULL,
  "photoId" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "categoryId" UUID,
  "currentBattleId" UUID,
  "round" INTEGER NOT NULL DEFAULT 1,
  "votes" INTEGER NOT NULL DEFAULT 0,
  "wonRounds" INTEGER NOT NULL DEFAULT 0,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "battle_progress_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "battle_progress_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "seasons"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "battle_progress_photoId_fkey" FOREIGN KEY ("photoId") REFERENCES "photos"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "battle_progress_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "battle_progress_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "battle_progress_currentBattleId_fkey" FOREIGN KEY ("currentBattleId") REFERENCES "battles"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "battle_progress_nonnegative" CHECK ("round" > 0 AND "votes" >= 0 AND "wonRounds" >= 0)
);
CREATE UNIQUE INDEX "battle_progress_seasonId_photoId_key" ON "battle_progress"("seasonId", "photoId");
CREATE INDEX "battle_progress_userId_createdAt_id_idx" ON "battle_progress"("userId", "createdAt" DESC, "id" DESC);
CREATE INDEX "battle_progress_seasonId_categoryId_status_votes_idx" ON "battle_progress"("seasonId", "categoryId", "status", "votes");
CREATE INDEX "battle_progress_currentBattleId_idx" ON "battle_progress"("currentBattleId");

-- Preserve existing participation and actual votes; never create synthetic votes.
WITH history AS (
  SELECT e."photoId", b."seasonId", p."ownerId" AS "userId", p."categoryId",
    MIN(e."createdAt") AS "joinedAt",
    COUNT(*) FILTER (WHERE b."status" = 'CLOSED')::INTEGER AS "completed",
    COUNT(*) FILTER (WHERE b."status" = 'CLOSED' AND b."winnerPhotoId" = e."photoId")::INTEGER AS "wins",
    (ARRAY_AGG(b."id" ORDER BY CASE WHEN b."status" IN ('DRAFT', 'OPEN') THEN 0 ELSE 1 END, b."createdAt" DESC, b."id" DESC))[1] AS "currentBattleId"
  FROM "battle_entries" e
  JOIN "battles" b ON b."id" = e."battleId"
  JOIN "photos" p ON p."id" = e."photoId"
  WHERE b."seasonId" IS NOT NULL
  GROUP BY e."photoId", b."seasonId", p."ownerId", p."categoryId"
)
INSERT INTO "battle_progress" ("id", "seasonId", "photoId", "userId", "categoryId", "currentBattleId", "round", "votes", "wonRounds", "status", "createdAt", "updatedAt")
SELECT gen_random_uuid(), h."seasonId", h."photoId", h."userId", h."categoryId", h."currentBattleId",
  h."completed" + 1,
  (SELECT COUNT(*)::INTEGER FROM "battle_votes" v JOIN "battles" vb ON vb."id" = v."battleId"
    WHERE v."selectedPhotoId" = h."photoId" AND vb."seasonId" = h."seasonId"),
  h."wins",
  CASE WHEN p."deletedAt" IS NOT NULL OR p."moderationStatus" = 'REJECTED' THEN 'UNAVAILABLE'
       WHEN b."status" = 'OPEN' THEN 'ACTIVE'
       WHEN b."status" = 'CANCELLED' THEN 'WITHDRAWN'
       WHEN b."status" = 'DRAFT' THEN 'PENDING'
       ELSE 'WAITING' END,
  h."joinedAt", CURRENT_TIMESTAMP
FROM history h JOIN "photos" p ON p."id" = h."photoId" JOIN "battles" b ON b."id" = h."currentBattleId";

WITH rounds AS (
  SELECT e."id", ROW_NUMBER() OVER (PARTITION BY b."seasonId", e."photoId" ORDER BY b."createdAt", b."id")::INTEGER AS n
  FROM "battle_entries" e JOIN "battles" b ON b."id" = e."battleId"
  WHERE b."seasonId" IS NOT NULL AND b."status" <> 'CANCELLED'
)
UPDATE "battle_entries" e SET "round" = r.n FROM rounds r WHERE e."id" = r."id";
