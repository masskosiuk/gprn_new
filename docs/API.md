# API Architecture

The backend is versioned under `/api/v1`. OpenAPI documentation is served at `/api/docs`.

## Implemented Endpoints

### Authentication

- `POST /auth/register`
- `POST /auth/login`
- `POST /auth/logout`
- `GET /auth/me`
- `GET /auth/providers`
- `POST /auth/request-email-verification`
- `POST /auth/verify-email`
- `POST /auth/request-password-reset`
- `POST /auth/reset-password`

Email delivery is adapter-ready. Development may return a token, but production never exposes it.

### Profiles and photos

- `GET /profiles/me`
- `PATCH /profiles/me`
- `GET /profiles/:username`
- `GET /photos/import-sources`
- `GET /photos/mine`
- `POST /photos/add-from-device`
- `POST /photos/:photoId/publish`
- `GET /discover`
- `GET /categories`

Device upload is active. External imports are returned as `COMING_SOON` until their provider adapters are configured.

### Competition

- `GET /battles/open`
- `POST /battles/join`
- `POST /battles/:battleId/vote`
- `GET /challenges`
- `POST /challenges/:challengeId/submit`
- `GET /seasons/current`
- `POST /seasons/current/join`
- `GET /leaderboards/global`

Battle voting blocks self-votes and duplicate votes, records hashed anti-abuse signals, and rate-limits abnormal frequency. Rating updates are written as immutable rating events when a battle reaches a valid result.

### Account safety and operations

- `GET /notifications`
- `PATCH /notifications/:notificationId/read`
- `GET /reports/mine`
- `POST /reports`
- `POST /reports/copyright-disputes`
- `GET /privacy/export`
- `POST /privacy/account-deletion`
- `GET /privacy/connections`
- `DELETE /privacy/connections/:connectionId`
- `GET /social-connections/providers`
- `GET /social-connections`
- `GET /social-connections/:provider/start`
- `GET /social-connections/:provider/callback`
- `DELETE /social-connections/:provider`
- `POST /analytics/events`
- `GET /admin/overview`
- `GET /admin/moderation`
- `PATCH /admin/reports/:reportId`
- `PATCH /admin/disputes/:disputeId`
- `PATCH /admin/photos/:photoId/moderation`

Admin and moderation routes enforce RBAC and write audit records for state changes.

### Platform state

- `GET /health`
- `GET /feature-flags`
- `GET /marketplace`
- `GET /experts`
- `GET /ai/photo-analysis`

Facebook and professional Instagram profile OAuth become available when their server credentials are configured. External photo-source OAuth, marketplace, expert reviews, payments and AI analysis remain disabled; unsupported capabilities do not return fake successful operations.

## Response Rules

- Stable JSON error codes are returned for client handling.
- Protected routes verify the session and required permission server-side.
- Exact GPS, password hashes, session tokens and provider tokens are never included in public responses.
- Lists have bounded result counts; cursor pagination can be added without changing resource contracts.
- Monetary values use integer minor units and ISO 4217 currency codes.
