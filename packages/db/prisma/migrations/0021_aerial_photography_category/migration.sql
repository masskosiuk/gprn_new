INSERT INTO "categories" (
  "id",
  "slug",
  "nameKey",
  "isActive",
  "sortOrder",
  "createdAt"
)
VALUES (
  'ca210000-0000-4000-8000-000000000001'::uuid,
  'aerial',
  'category.aerial.name',
  true,
  15,
  CURRENT_TIMESTAMP
)
ON CONFLICT ("slug") DO NOTHING;
