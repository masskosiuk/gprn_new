#!/usr/bin/env bash
set -euo pipefail

cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.."

domain="${1:-}"
if [[ ! "$domain" =~ ^[a-zA-Z0-9]([a-zA-Z0-9.-]*[a-zA-Z0-9])?$ ]] || [[ "$domain" != *.* ]]; then
  printf '%s\n' 'Usage: bash infra/deploy/init-env.sh photoapp.metarp.top' >&2
  exit 1
fi

if [[ -e .env.production ]]; then
  printf '%s\n' '.env.production already exists; existing secrets were not changed.' >&2
  exit 1
fi

command -v openssl >/dev/null || { printf '%s\n' 'Install openssl first.' >&2; exit 1; }
umask 077
db_password="$(openssl rand -hex 32)"
storage_password="$(openssl rand -hex 32)"
session_secret="$(openssl rand -base64 48 | tr -d '\n')"
encryption_key="$(openssl rand -base64 32 | tr -d '\n')"

# Noclobber also protects an env file created after the initial check.
set -o noclobber
cat > .env.production <<EOF
NODE_ENV=production
APP_ENV=production
APP_URL=https://${domain}
API_URL=https://${domain}
NEXT_PUBLIC_SITE_URL=https://${domain}
POSTGRES_PASSWORD=${db_password}
DATABASE_URL=postgresql://gprn:${db_password}@postgres:5432/gprn?schema=public
REDIS_URL=redis://redis:6379
SESSION_SECRET=${session_secret}
ENCRYPTION_KEY=${encryption_key}
S3_ENDPOINT=http://minio:9000
S3_REGION=eu-central-1
S3_BUCKET_PUBLIC=gprn-public
S3_BUCKET_PRIVATE=gprn-private
S3_ACCESS_KEY=gprnadmin
S3_SECRET_KEY=${storage_password}
S3_FORCE_PATH_STYLE=true
CDN_PUBLIC_URL=https://${domain}/media
EMAIL_PROVIDER=disabled
AI_ENABLED=false
MARKETPLACE_ENABLED=false
EXPERT_REVIEWS_ENABLED=false
PAYMENTS_ENABLED=false
ADVANCED_PROVENANCE_ENABLED=false
FACEBOOK_CLIENT_ID=
FACEBOOK_CLIENT_SECRET=
INSTAGRAM_CLIENT_ID=
INSTAGRAM_CLIENT_SECRET=
META_GRAPH_API_VERSION=v26.0
WEB_BIND_PORT=13000
API_BIND_PORT=14000
MINIO_API_BIND_PORT=19000
MINIO_CONSOLE_BIND_PORT=19001
EOF
printf '%s\n' '.env.production created with new secrets and owner-only permissions.'
printf '%s\n' 'Keep this file on the server. Do not replace it during updates.'
