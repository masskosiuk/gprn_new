ALTER TABLE "profiles"
ADD COLUMN "presetSalesEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "presetTitle" TEXT,
ADD COLUMN "presetPriceMinor" INTEGER,
ADD COLUMN "lutSalesEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "lutTitle" TEXT,
ADD COLUMN "lutPriceMinor" INTEGER;

ALTER TABLE "profiles"
ADD CONSTRAINT "profiles_preset_price_nonnegative"
CHECK ("presetPriceMinor" IS NULL OR "presetPriceMinor" >= 0),
ADD CONSTRAINT "profiles_lut_price_nonnegative"
CHECK ("lutPriceMinor" IS NULL OR "lutPriceMinor" >= 0);
