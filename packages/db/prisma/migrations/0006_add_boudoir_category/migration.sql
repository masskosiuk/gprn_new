INSERT INTO "categories" (
  "id",
  "slug",
  "nameKey",
  "isActive",
  "sortOrder",
  "createdAt"
)
SELECT
  'b0d01f00-0000-4000-8000-000000000001'::uuid,
  'boudoir',
  'category.boudoir.name',
  true,
  10,
  CURRENT_TIMESTAMP
WHERE NOT EXISTS (
  SELECT 1 FROM "categories" WHERE "slug" = 'boudoir'
);
