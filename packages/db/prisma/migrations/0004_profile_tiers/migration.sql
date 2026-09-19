-- CreateEnum
CREATE TYPE "ProfileTier" AS ENUM (
    'VIEWER',
    'AMATEUR',
    'BEGINNER',
    'EXPERIENCED',
    'PROFESSIONAL',
    'STAR'
);

-- AlterTable
ALTER TABLE "profiles"
ADD COLUMN "tier" "ProfileTier" NOT NULL DEFAULT 'BEGINNER',
ADD COLUMN "availableForHire" BOOLEAN NOT NULL DEFAULT true;
