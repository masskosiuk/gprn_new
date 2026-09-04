CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "postgis";

-- The full initial schema is represented in prisma/schema.prisma.
-- This migration anchors the clean-install process and enables UUID/PostGIS
-- before Prisma creates the relational model in the first migration pass.
