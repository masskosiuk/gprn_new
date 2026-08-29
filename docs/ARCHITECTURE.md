# Global Photographer Reputation Network Architecture

This project is an API-first, production-oriented MVP foundation for a global photography competition and reputation platform.

## Stack

- Web: Next.js, TypeScript, localized routes.
- API: NestJS with Fastify.
- Workers: BullMQ workers backed by Redis.
- Database: PostgreSQL with PostGIS and Prisma ORM.
- Object storage: S3-compatible abstraction, MinIO locally.
- Images: original/private assets separate from display and thumbnails.
- Localization: 11 MVP locales with no hardcoded user-facing strings.
- Authorization: RBAC plus capability checks.

## Applications

- `apps/web`: browser client. It must consume the API and must not own important business rules.
- `apps/api`: backend API for web and future iOS/Android clients.
- `apps/worker`: asynchronous processing for photos, provenance, leaderboards, notifications and search indexing.

## Packages

- `packages/db`: Prisma schema, seed data and database client.
- `packages/domain`: isolated business logic such as rating engines.
- `packages/rbac`: roles, permissions and capability mapping.
- `packages/storage`: S3-compatible object storage interface.
- `packages/i18n`: locale list and message lookup.
- `packages/config`: environment validation.

## Product Boundaries

The MVP must implement real core foundations: users, profiles, upload, provenance, categories, battles, voting, rating, leaderboards, seasons and localization.

Marketplace, expert reviews, payments and AI are feature-flagged future systems. The architecture and database models exist, but successful payments, AI analysis, external OAuth imports and expert verification must never be faked.

## Photo Pipeline

1. User selects `Add Photo`.
2. Device upload is stored as a private original.
3. A `photo-processing` job extracts metadata, calculates SHA-256, creates image variants and schedules provenance checks.
4. A `provenance` job classifies available evidence.
5. The user sees a simple provenance summary before publishing.
6. Exact GPS and private evidence remain private unless explicitly exposed.

## Database Strategy

The schema is normalized around core product concepts:

- identity and RBAC;
- photo asset, metadata, hash, location and provenance records;
- battle/vote/rating/leaderboard history;
- season and challenge history;
- future marketplace and expert service boundaries;
- feature flags, audit logs and analytics events.

Leaderboards are derived snapshots so common pages do not need full-database recalculation. Money uses integer minor units and a currency code. Important records use soft deletion or restricted deletion where legal, financial, dispute or audit retention matters.

## API Strategy

The API uses `/api/v1` versioning and OpenAPI docs at `/api/docs`.

API responses should use stable error codes and translation keys. The frontend is not trusted for authorization, voting, rating, payments, provenance or ownership decisions.

## Local Services

Docker Compose provides:

- PostgreSQL + PostGIS on `localhost:5432`;
- Redis on `localhost:6379`;
- MinIO on `localhost:9000` and console on `localhost:9001`;
- Mailpit on `localhost:8025`;
- web on `localhost:3000`;
- API on `localhost:4000`.

## Deployment Direction

Use separate local, staging and production environments. Production must have separate database, storage, credentials, CDN, workers, monitoring and backup strategy.

