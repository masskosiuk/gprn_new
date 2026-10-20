INSERT INTO "categories" ("id", "slug", "nameKey", "isActive", "sortOrder", "createdAt")
VALUES
  ('ca220000-0000-4000-8000-000000000001'::uuid, 'nature', 'category.nature.name', true, 16, CURRENT_TIMESTAMP),
  ('ca220000-0000-4000-8000-000000000002'::uuid, 'aiEdited', 'category.aiEdited.name', true, 17, CURRENT_TIMESTAMP),
  ('ca220000-0000-4000-8000-000000000003'::uuid, 'aiGenerated', 'category.aiGenerated.name', true, 18, CURRENT_TIMESTAMP),
  ('ca220000-0000-4000-8000-000000000004'::uuid, 'macro', 'category.macro.name', true, 19, CURRENT_TIMESTAMP),
  ('ca220000-0000-4000-8000-000000000005'::uuid, 'sports', 'category.sports.name', true, 20, CURRENT_TIMESTAMP),
  ('ca220000-0000-4000-8000-000000000006'::uuid, 'astrophotography', 'category.astrophotography.name', true, 21, CURRENT_TIMESTAMP),
  ('ca220000-0000-4000-8000-000000000007'::uuid, 'interior', 'category.interior.name', true, 22, CURRENT_TIMESTAMP),
  ('ca220000-0000-4000-8000-000000000008'::uuid, 'art', 'category.art.name', true, 23, CURRENT_TIMESTAMP),
  ('ca220000-0000-4000-8000-000000000009'::uuid, 'black-and-white', 'category.black-and-white.name', true, 24, CURRENT_TIMESTAMP),
  ('ca220000-0000-4000-8000-000000000010'::uuid, 'still-life', 'category.still-life.name', true, 25, CURRENT_TIMESTAMP)
ON CONFLICT ("slug") DO NOTHING;
