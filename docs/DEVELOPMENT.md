# Development

## Requirements

- Node.js 22 or newer.
- pnpm 11.
- Docker Desktop or compatible Docker runtime.

## Setup

1. Copy `.env.example` to `.env`.
2. Start local services:

```bash
docker compose up postgres redis minio create-buckets mailpit
```

3. Install dependencies:

```bash
pnpm install
```

4. Generate Prisma client:

```bash
pnpm db:generate
```

5. Run migrations:

```bash
pnpm db:migrate
```

6. Seed development-safe data:

```bash
pnpm db:seed
```

7. Start all apps:

```bash
pnpm dev
```

## Local URLs

- Web: `http://localhost:3000`
- API: `http://localhost:4000/api/v1/health`
- API docs: `http://localhost:4000/api/docs`
- MinIO console: `http://localhost:9001`
- Mailpit: `http://localhost:8025`

## Checks

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

Do not commit real `.env` files or secrets.

