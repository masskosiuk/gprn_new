ALTER TABLE "profiles" ADD COLUMN "proUntil" TIMESTAMP(3);
CREATE TABLE "community_posts" (
  "id" UUID NOT NULL,
  "authorId" UUID NOT NULL,
  "kind" TEXT NOT NULL CHECK ("kind" IN ('EVENT', 'DISCUSSION', 'CASTING')),
  "title" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "location" TEXT NOT NULL,
  "language" TEXT NOT NULL,
  "startsAt" TIMESTAMP(3) NOT NULL,
  "endsAt" TIMESTAMP(3),
  "coverAssetKey" TEXT,
  "moderationStatus" "ModerationStatus" NOT NULL DEFAULT 'PENDING',
  "moderationReason" TEXT,
  "demoKey" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "deletedAt" TIMESTAMP(3),
  CONSTRAINT "community_posts_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "community_posts_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "community_posts_dates_check" CHECK ("endsAt" IS NULL OR "endsAt" >= "startsAt")
);
CREATE UNIQUE INDEX "community_posts_demoKey_key" ON "community_posts"("demoKey");
CREATE INDEX "community_posts_kind_moderationStatus_startsAt_idx" ON "community_posts"("kind", "moderationStatus", "startsAt");
CREATE INDEX "community_posts_authorId_kind_createdAt_idx" ON "community_posts"("authorId", "kind", "createdAt");
ALTER TABLE "community_posts" ADD COLUMN "sourceType" TEXT, ADD COLUMN "sourceId" TEXT, ADD COLUMN "sourcePath" TEXT;

CREATE TABLE "community_inquiries" (
  "id" UUID NOT NULL,
  "authorId" UUID NOT NULL,
  "kind" TEXT NOT NULL CHECK ("kind" IN ('SUGGESTION', 'REPORT')),
  "body" TEXT NOT NULL,
  "attachmentKey" TEXT,
  "targetType" TEXT,
  "targetId" TEXT,
  "targetPath" TEXT,
  "status" "ReportStatus" NOT NULL DEFAULT 'OPEN',
  "reply" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "community_inquiries_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "community_inquiries_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "community_inquiries_kind_status_createdAt_idx" ON "community_inquiries"("kind", "status", "createdAt");
CREATE INDEX "community_inquiries_authorId_createdAt_idx" ON "community_inquiries"("authorId", "createdAt");
ALTER TABLE "comments" ALTER COLUMN "photoId" DROP NOT NULL;
ALTER TABLE "comments" ADD COLUMN "postId" UUID;
ALTER TABLE "comments" ADD CONSTRAINT "comments_postId_fkey" FOREIGN KEY ("postId") REFERENCES "community_posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "comments" ADD CONSTRAINT "comments_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "comments" ADD CONSTRAINT "comments_single_target_check" CHECK (("photoId" IS NOT NULL)::int + ("postId" IS NOT NULL)::int = 1);
CREATE INDEX "comments_postId_createdAt_idx" ON "comments"("postId", "createdAt");
ALTER TABLE "marketplace_products" ADD COLUMN "genre" TEXT;
