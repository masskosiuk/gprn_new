# API Architecture

The backend API is versioned under `/api/v1` and is the single business interface for the web client and future mobile applications.

## Initial Modules

- `auth`
- `users`
- `profiles`
- `photos`
- `uploads`
- `provenance`
- `categories`
- `discover`
- `geo`
- `battles`
- `votes`
- `ratings`
- `leaderboards`
- `seasons`
- `challenges`
- `achievements`
- `marketplace`
- `experts`
- `notifications`
- `reports`
- `admin`
- `feature-flags`
- `health`

## Response Rules

- Use stable JSON error codes.
- Return translation keys for user-facing errors where applicable.
- Use cursor or page-based pagination consistently per endpoint family.
- Validate all input on the API.
- Enforce authorization server-side.

## Disabled Future Features

Marketplace, expert reviews, payments and AI may expose metadata or disabled states, but must not return fake successful purchases, fake AI analysis, fake payouts or fake verification.

