-- CreateTable
CREATE TABLE "battle_vote_scores" (
    "id" UUID NOT NULL,
    "voteId" UUID NOT NULL,
    "entryId" UUID NOT NULL,
    "composition" INTEGER NOT NULL,
    "lighting" INTEGER NOT NULL,
    "technicalQuality" INTEGER NOT NULL,
    "storytelling" INTEGER NOT NULL,
    "originality" INTEGER NOT NULL,
    "color" INTEGER NOT NULL,
    "emotionalImpact" INTEGER NOT NULL,
    "averageMinor" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "battle_vote_scores_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "battle_vote_scores_valid_range" CHECK (
        "composition" BETWEEN 1 AND 10 AND
        "lighting" BETWEEN 1 AND 10 AND
        "technicalQuality" BETWEEN 1 AND 10 AND
        "storytelling" BETWEEN 1 AND 10 AND
        "originality" BETWEEN 1 AND 10 AND
        "color" BETWEEN 1 AND 10 AND
        "emotionalImpact" BETWEEN 1 AND 10 AND
        "averageMinor" BETWEEN 100 AND 1000
    )
);

-- CreateIndex
CREATE UNIQUE INDEX "battle_vote_scores_voteId_entryId_key" ON "battle_vote_scores"("voteId", "entryId");

-- CreateIndex
CREATE INDEX "battle_vote_scores_entryId_createdAt_idx" ON "battle_vote_scores"("entryId", "createdAt");

-- AddForeignKey
ALTER TABLE "battle_vote_scores" ADD CONSTRAINT "battle_vote_scores_voteId_fkey" FOREIGN KEY ("voteId") REFERENCES "battle_votes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "battle_vote_scores" ADD CONSTRAINT "battle_vote_scores_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "battle_entries"("id") ON DELETE CASCADE ON UPDATE CASCADE;
