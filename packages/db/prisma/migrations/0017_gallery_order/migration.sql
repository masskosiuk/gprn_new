ALTER TABLE "photos"
  ADD COLUMN "portfolioPosition" INTEGER,
  ADD COLUMN "feedPosition" INTEGER;

CREATE INDEX "photos_ownerId_portfolioPosition_createdAt_idx"
  ON "photos"("ownerId", "portfolioPosition", "createdAt" DESC);
CREATE INDEX "photos_feedPosition_publishedAt_idx"
  ON "photos"("feedPosition", "publishedAt" DESC);
