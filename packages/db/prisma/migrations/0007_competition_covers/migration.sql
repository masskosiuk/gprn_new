ALTER TABLE "seasons" ADD COLUMN "coverUrl" TEXT;
ALTER TABLE "challenges" ADD COLUMN "coverUrl" TEXT;

UPDATE "seasons"
SET "coverUrl" = '/images/challenges/city-night.png'
WHERE "coverUrl" IS NULL;

UPDATE "challenges"
SET "coverUrl" = CASE
  WHEN "slug" = 'street-stories' THEN '/images/challenges/city-night.png'
  WHEN "slug" = 'available-light-portrait' THEN '/images/challenges/available-light-portrait.png'
  WHEN "slug" = 'weather-and-land' THEN '/images/challenges/wild-weather.png'
  ELSE "coverUrl"
END;
