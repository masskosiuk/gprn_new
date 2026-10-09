ALTER TABLE "marketplace_products"
  ADD COLUMN "digitalKind" TEXT,
  ADD COLUMN "palette" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "isDemo" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "marketplace_products" ADD CONSTRAINT "digital_product_kind_check"
  CHECK ("digitalKind" IS NULL OR "digitalKind" IN ('PRESET', 'LUT'));

CREATE INDEX "marketplace_products_digitalKind_status_idx"
  ON "marketplace_products" ("digitalKind", "status");
