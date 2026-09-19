CREATE TYPE "WalletTransactionType" AS ENUM (
  'DEPOSIT', 'PURCHASE', 'SALE', 'PLATFORM_FEE', 'DONATION_SENT',
  'DONATION_RECEIVED', 'REFUND', 'ADMIN_ADJUSTMENT'
);
CREATE TYPE "WalletTransactionStatus" AS ENUM ('PENDING', 'COMPLETED', 'FAILED', 'CANCELLED');
CREATE TYPE "ServiceRequestStatus" AS ENUM (
  'PENDING', 'ACCEPTED', 'DECLINED', 'IN_PROGRESS', 'SUBMITTED',
  'COMPLETED', 'CANCELLED', 'DISPUTED'
);
CREATE TYPE "ServiceRequestKind" AS ENUM ('SERVICE', 'PHOTO_REVIEW');
CREATE TYPE "PromotionPlacement" AS ENUM ('HOME', 'MARKETPLACE', 'BATTLES');
CREATE TYPE "PromotionStatus" AS ENUM (
  'DRAFT', 'PENDING_PAYMENT', 'ACTIVE', 'COMPLETED', 'CANCELLED', 'REJECTED'
);

ALTER TABLE "profiles"
ADD COLUMN "serviceRatingAverage" DECIMAL(3,2),
ADD COLUMN "serviceRatingsCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "completedAsProvider" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "completedAsCustomer" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "profiles" ALTER COLUMN "tier" SET DEFAULT 'VIEWER';

CREATE TABLE "wallets" (
  "id" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "balanceMinor" BIGINT NOT NULL DEFAULT 0,
  "currency" CHAR(3) NOT NULL DEFAULT 'USD',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "wallets_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "wallets_userId_key" ON "wallets"("userId");

CREATE TABLE "wallet_transactions" (
  "id" UUID NOT NULL,
  "walletId" UUID NOT NULL,
  "actorUserId" UUID,
  "type" "WalletTransactionType" NOT NULL,
  "status" "WalletTransactionStatus" NOT NULL DEFAULT 'COMPLETED',
  "amountMinor" BIGINT NOT NULL,
  "currency" CHAR(3) NOT NULL,
  "referenceType" TEXT,
  "referenceId" TEXT,
  "note" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "wallet_transactions_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "wallet_transactions_walletId_createdAt_idx" ON "wallet_transactions"("walletId", "createdAt");
CREATE INDEX "wallet_transactions_referenceType_referenceId_idx" ON "wallet_transactions"("referenceType", "referenceId");

CREATE TABLE "moodboards" (
  "id" UUID NOT NULL,
  "ownerId" UUID NOT NULL,
  "title" TEXT NOT NULL DEFAULT 'Moodboard',
  "isPublic" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "moodboards_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "moodboards_ownerId_title_key" ON "moodboards"("ownerId", "title");
CREATE INDEX "moodboards_ownerId_isPublic_idx" ON "moodboards"("ownerId", "isPublic");

CREATE TABLE "moodboard_items" (
  "id" UUID NOT NULL,
  "moodboardId" UUID NOT NULL,
  "photoId" UUID NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "moodboard_items_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "moodboard_items_moodboardId_photoId_key" ON "moodboard_items"("moodboardId", "photoId");
CREATE INDEX "moodboard_items_photoId_idx" ON "moodboard_items"("photoId");

CREATE TABLE "photo_reviews" (
  "id" UUID NOT NULL,
  "photoId" UUID NOT NULL,
  "reviewerId" UUID NOT NULL,
  "reviewerTier" "ProfileTier" NOT NULL,
  "composition" INTEGER NOT NULL,
  "lighting" INTEGER NOT NULL,
  "technicalQuality" INTEGER NOT NULL,
  "storytelling" INTEGER NOT NULL,
  "originality" INTEGER NOT NULL,
  "color" INTEGER NOT NULL,
  "emotionalImpact" INTEGER NOT NULL,
  "averageMinor" INTEGER NOT NULL,
  "comment" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "photo_reviews_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "photo_reviews_photoId_reviewerId_key" ON "photo_reviews"("photoId", "reviewerId");
CREATE INDEX "photo_reviews_photoId_createdAt_idx" ON "photo_reviews"("photoId", "createdAt");

CREATE TABLE "service_requests" (
  "id" UUID NOT NULL,
  "customerId" UUID NOT NULL,
  "providerId" UUID NOT NULL,
  "reviewPhotoId" UUID,
  "kind" "ServiceRequestKind" NOT NULL DEFAULT 'SERVICE',
  "status" "ServiceRequestStatus" NOT NULL DEFAULT 'PENDING',
  "title" TEXT NOT NULL,
  "message" TEXT NOT NULL,
  "referenceUrl" TEXT,
  "attachmentKeys" JSONB,
  "priceMinor" BIGINT NOT NULL,
  "platformFeeMinor" BIGINT NOT NULL DEFAULT 0,
  "currency" CHAR(3) NOT NULL DEFAULT 'USD',
  "providerComment" TEXT,
  "acceptedAt" TIMESTAMP(3),
  "submittedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "service_requests_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "service_requests_customerId_status_idx" ON "service_requests"("customerId", "status");
CREATE INDEX "service_requests_providerId_status_idx" ON "service_requests"("providerId", "status");
CREATE INDEX "service_requests_reviewPhotoId_idx" ON "service_requests"("reviewPhotoId");

CREATE TABLE "service_messages" (
  "id" UUID NOT NULL,
  "requestId" UUID NOT NULL,
  "authorId" UUID NOT NULL,
  "body" TEXT NOT NULL,
  "attachments" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "service_messages_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "service_messages_requestId_createdAt_idx" ON "service_messages"("requestId", "createdAt");

CREATE TABLE "service_ratings" (
  "id" UUID NOT NULL,
  "requestId" UUID NOT NULL,
  "authorId" UUID NOT NULL,
  "subjectId" UUID NOT NULL,
  "stars" INTEGER NOT NULL,
  "comment" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "service_ratings_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "service_ratings_requestId_authorId_key" ON "service_ratings"("requestId", "authorId");
CREATE INDEX "service_ratings_subjectId_createdAt_idx" ON "service_ratings"("subjectId", "createdAt");

CREATE TABLE "donations" (
  "id" UUID NOT NULL,
  "senderId" UUID NOT NULL,
  "recipientId" UUID NOT NULL,
  "amountMinor" BIGINT NOT NULL,
  "currency" CHAR(3) NOT NULL DEFAULT 'USD',
  "status" "PaymentStatus" NOT NULL DEFAULT 'SUCCEEDED',
  "message" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "donations_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "donations_senderId_createdAt_idx" ON "donations"("senderId", "createdAt");
CREATE INDEX "donations_recipientId_createdAt_idx" ON "donations"("recipientId", "createdAt");

CREATE TABLE "promotions" (
  "id" UUID NOT NULL,
  "ownerId" UUID NOT NULL,
  "photoId" UUID NOT NULL,
  "placement" "PromotionPlacement" NOT NULL,
  "status" "PromotionStatus" NOT NULL DEFAULT 'PENDING_PAYMENT',
  "priceMinor" BIGINT NOT NULL,
  "currency" CHAR(3) NOT NULL DEFAULT 'USD',
  "startsAt" TIMESTAMP(3),
  "endsAt" TIMESTAMP(3),
  "impressions" INTEGER NOT NULL DEFAULT 0,
  "clicks" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "promotions_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "promotions_placement_status_startsAt_endsAt_idx" ON "promotions"("placement", "status", "startsAt", "endsAt");
CREATE INDEX "promotions_ownerId_createdAt_idx" ON "promotions"("ownerId", "createdAt");

ALTER TABLE "payments" ADD COLUMN "serviceRequestId" UUID;
CREATE INDEX "payments_serviceRequestId_idx" ON "payments"("serviceRequestId");

ALTER TABLE "marketplace_products" ADD COLUMN "photoId" UUID;
CREATE UNIQUE INDEX "marketplace_products_photoId_key" ON "marketplace_products"("photoId");

ALTER TABLE "wallets" ADD CONSTRAINT "wallets_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "wallet_transactions" ADD CONSTRAINT "wallet_transactions_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES "wallets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "wallet_transactions" ADD CONSTRAINT "wallet_transactions_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "moodboards" ADD CONSTRAINT "moodboards_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "moodboard_items" ADD CONSTRAINT "moodboard_items_moodboardId_fkey" FOREIGN KEY ("moodboardId") REFERENCES "moodboards"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "moodboard_items" ADD CONSTRAINT "moodboard_items_photoId_fkey" FOREIGN KEY ("photoId") REFERENCES "photos"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "photo_reviews" ADD CONSTRAINT "photo_reviews_photoId_fkey" FOREIGN KEY ("photoId") REFERENCES "photos"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "photo_reviews" ADD CONSTRAINT "photo_reviews_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "service_requests" ADD CONSTRAINT "service_requests_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "service_requests" ADD CONSTRAINT "service_requests_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "service_requests" ADD CONSTRAINT "service_requests_reviewPhotoId_fkey" FOREIGN KEY ("reviewPhotoId") REFERENCES "photos"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "marketplace_products" ADD CONSTRAINT "marketplace_products_photoId_fkey" FOREIGN KEY ("photoId") REFERENCES "photos"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "service_messages" ADD CONSTRAINT "service_messages_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "service_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "service_messages" ADD CONSTRAINT "service_messages_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "service_ratings" ADD CONSTRAINT "service_ratings_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "service_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "service_ratings" ADD CONSTRAINT "service_ratings_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "service_ratings" ADD CONSTRAINT "service_ratings_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "donations" ADD CONSTRAINT "donations_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "donations" ADD CONSTRAINT "donations_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "promotions" ADD CONSTRAINT "promotions_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "promotions" ADD CONSTRAINT "promotions_photoId_fkey" FOREIGN KEY ("photoId") REFERENCES "photos"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "payments" ADD CONSTRAINT "payments_serviceRequestId_fkey" FOREIGN KEY ("serviceRequestId") REFERENCES "service_requests"("id") ON DELETE SET NULL ON UPDATE CASCADE;
