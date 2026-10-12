-- The product seed originally created these demo profiles without a global rating.
-- Initialize only missing ratings; preserve every existing score and battle count.
INSERT INTO "ratings" ("id", "userId", "scope", "scopeKey", "rating", "battles", "wins", "losses", "updatedAt")
SELECT gen_random_uuid(), u."id", 'GLOBAL', 'global', 1500, 0, 0, 0, CURRENT_TIMESTAMP
FROM "users" u
JOIN "profiles" p ON p."userId" = u."id"
WHERE (u."id", u."email", p."username") IN (
  ('de000001-0000-4000-8000-000000000007'::uuid, 'iryna@demo.gprn.invalid', 'demo.iryna.melnyk'),
  ('de000001-0000-4000-8000-000000000008'::uuid, 'marcus@demo.gprn.invalid', 'demo.marcus.reed'),
  ('de000001-0000-4000-8000-000000000009'::uuid, 'sofia@demo.gprn.invalid', 'demo.sofia.rossi')
)
ON CONFLICT ("userId", "scope", "scopeKey") DO NOTHING;
