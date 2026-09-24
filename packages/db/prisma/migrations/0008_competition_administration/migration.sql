ALTER TABLE "seasons" ADD COLUMN "name" TEXT;
ALTER TABLE "challenges" ADD COLUMN "title" TEXT;

ALTER TABLE "challenge_entries"
  ADD COLUMN "moderationStatus" "ModerationStatus" NOT NULL DEFAULT 'PENDING',
  ADD COLUMN "moderationReason" TEXT,
  ADD COLUMN "moderatedAt" TIMESTAMP(3);

ALTER TABLE "battle_entries"
  ADD COLUMN "moderationStatus" "ModerationStatus" NOT NULL DEFAULT 'PENDING',
  ADD COLUMN "moderationReason" TEXT,
  ADD COLUMN "moderatedAt" TIMESTAMP(3);

UPDATE "challenge_entries" AS entry
SET "moderationStatus" = 'APPROVED', "moderatedAt" = CURRENT_TIMESTAMP
FROM "photos" AS photo
WHERE entry."photoId" = photo."id"
  AND photo."moderationStatus" = 'APPROVED';

UPDATE "battle_entries" AS entry
SET "moderationStatus" = 'APPROVED', "moderatedAt" = CURRENT_TIMESTAMP
FROM "photos" AS photo
WHERE entry."photoId" = photo."id"
  AND photo."moderationStatus" = 'APPROVED';

CREATE INDEX "challenge_entries_moderationStatus_submittedAt_idx"
  ON "challenge_entries"("moderationStatus", "submittedAt");
CREATE INDEX "battle_entries_moderationStatus_createdAt_idx"
  ON "battle_entries"("moderationStatus", "createdAt");
