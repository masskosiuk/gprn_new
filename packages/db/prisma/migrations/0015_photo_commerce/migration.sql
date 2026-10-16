ALTER TABLE "photos" ADD COLUMN "appliedProductId" UUID;
ALTER TABLE "photos" ADD CONSTRAINT "photos_appliedProductId_fkey"
  FOREIGN KEY ("appliedProductId") REFERENCES "marketplace_products"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "photos_appliedProductId_idx" ON "photos"("appliedProductId");
ALTER TABLE "marketplace_order_items" ADD COLUMN "licenseTerms" TEXT;
