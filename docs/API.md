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

Battle voting blocks self-votes and duplicate votes, records hashed anti-abuse signals, and rate-limits abnormal frequency. Open results remain hidden until the viewer chooses one of the two photographs:

```json
{
  "selectedEntryId": "battle-entry-uuid"
}
```

New pairings use photographs from the same category and choose the nearest available reputation rating. A regular ballot has weight `1`, a professional ballot has weight `4`, and a superstar ballot has weight `10`. Detailed composition, lighting, technical quality, storytelling, originality, color and emotional-impact reviews are separate from battle voting and require a professional or superstar account. Both professional and superstar reviewers may publish a public comment with the detailed review.

### Wallet, services and creator commerce

- `GET /platform/dashboard`
- `POST /platform/wallet/top-up`
- `POST /platform/service-requests`
- `PATCH /platform/service-requests/:requestId`
- `POST /platform/service-requests/:requestId/messages`
- `POST /platform/service-requests/:requestId/rating`
- `PATCH /platform/paid-review-settings`
- `POST /platform/paid-reviews`
- `POST /platform/donations`
- `GET /platform/marketplace`
- `POST /platform/marketplace/listings`
- `PATCH /platform/marketplace/listings/:productId`
- `POST /platform/marketplace/products/:productId/buy`
- `POST /platform/promotions`
- `GET /platform/promotions`
- `GET /platform/profiles/:username/moodboards`
- `POST /platform/photos/:photoId/like`
- `POST /platform/photos/:photoId/bookmark`
- `POST /platform/photos/:photoId/moodboard`
- `POST /platform/photos/:photoId/review`

Wallet, marketplace and service amounts use integer minor units. Marketplace purchases transfer funds between wallet accounts and create immutable order, payment and wallet-transaction records. Completing a service or paid-review request settles payment to the provider and records the 5% platform fee. Experienced, professional and superstar review providers set their own per-photo published price; customers cannot override it. Promotion prices depend on placement (`HOME`, `MARKETPLACE` or `BATTLES`), and promoted content is explicitly labelled.

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
- `GET /admin/users`
- `GET /admin/moderation`
- `PATCH /admin/reports/:reportId`
- `PATCH /admin/disputes/:disputeId`
- `PATCH /admin/photos/:photoId/moderation`
- `GET /admin/audit-logs`
- `GET /admin/payments`
- `POST /admin/wallets/:userId/adjust`
- `PATCH /admin/users/:userId`
- `PATCH /admin/ratings/:ratingId`
- `PATCH /admin/promotions/:promotionId`
- `DELETE /admin/photos/:photoId`
- `DELETE /admin/users/:userId`

Admin and moderation routes enforce RBAC and write audit records for state changes.

Create or promote the first administrator after migrations and seed data are ready:

```powershell
$env:GPRN_ADMIN_EMAIL="admin@example.com"
$env:GPRN_ADMIN_PASSWORD="replace-with-a-strong-password"
pnpm admin:create
```

The command defaults to `SUPER_ADMIN`; set `GPRN_ADMIN_ROLE=ADMIN` for a restricted administrator.

### Platform state

- `GET /health`
- `GET /feature-flags`
- `GET /marketplace`
- `GET /experts`
- `GET /ai/photo-analysis`

Facebook and professional Instagram profile OAuth become available when their server credentials are configured. External photo-source OAuth and AI analysis remain disabled. Card and crypto top-ups currently use the explicit sandbox adapter and must be replaced with production payment-provider adapters before accepting real funds.

## Response Rules

- Stable JSON error codes are returned for client handling.
- Protected routes verify the session and required permission server-side.
- Exact GPS, password hashes, session tokens and provider tokens are never included in public responses.
- Lists have bounded result counts; cursor pagination can be added without changing resource contracts.
- Monetary values use integer minor units and ISO 4217 currency codes.
