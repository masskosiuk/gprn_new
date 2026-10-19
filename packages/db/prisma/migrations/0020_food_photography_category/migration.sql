INSERT INTO "categories" (
  "id",
  "slug",
  "nameKey",
  "isActive",
  "sortOrder",
  "createdAt"
)
VALUES (
  'ca200000-0000-4000-8000-000000000001'::uuid,
  'food',
  'category.food.name',
  true,
  14,
  CURRENT_TIMESTAMP
)
ON CONFLICT ("slug") DO NOTHING;
