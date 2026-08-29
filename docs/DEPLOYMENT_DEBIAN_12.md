# Production deployment on Debian 12

This application must be deployed as its own Docker Compose project. It does
not alter an existing FiveM service or image server. Docker gives the project
its own network and named volumes; only two new loopback ports are used by the
host Caddy: `13000` for the web app and `14000` for the API.

## Before starting

- Point a free subdomain, such as `photos.example.com`, at the server's public
  IP address.
- This server uses Caddy on port 80. Keep Caddy as the only public reverse
  proxy; do not start an Nginx proxy container for this project.
- Ensure Docker Engine and the Compose plugin are available:

  ```bash
  docker --version
  docker compose version
  ```

  Docker is not currently installed on this server. Install Docker Engine and
  the Compose plugin from Docker's official Debian repository before
  continuing. The official instructions support Debian 12 and include the
  `docker-ce`, Buildx, and Compose plugin packages.

## Install

1. Copy the repository to a dedicated location and make a production env file:

   ```bash
   sudo mkdir -p /opt/gprn
   sudo chown "$USER":"$USER" /opt/gprn
   # Upload the project with WinSCP, then place its files in /opt/gprn.
   cd /opt/gprn
   cp .env.production.example .env.production
   chmod 600 .env.production
   ```

2. Edit `.env.production`. Replace `photos.example.com` with the real domain.
   Generate secrets on the Debian server, then put the output in the matching
   fields. Use the same generated hexadecimal database password in
   `POSTGRES_PASSWORD` and `DATABASE_URL`.

   ```bash
   openssl rand -hex 32
   openssl rand -base64 48
   ```

3. Start the stack. The `migrate` one-shot container applies committed Prisma
   migrations before the API starts; it is safe to run again on updates.

   ```bash
   docker compose --env-file .env.production -f docker-compose.production.yml up -d --build
   docker compose --env-file .env.production -f docker-compose.production.yml ps
   curl -fsS http://127.0.0.1:14000/api/v1/health
   ```

   Do not run the development seed in production. The included migration
   creates the schema without sample data.

## Caddy and TLS

1. View the existing Caddy configuration first. It may already contain entries
   for the image server or FiveM-related web services; leave those blocks
   unchanged.

   ```bash
   sudo sed -n '1,240p' /etc/caddy/Caddyfile
   ```

2. Copy the block from `infra/caddy/Caddyfile.example` to the end of
   `/etc/caddy/Caddyfile`, replacing `photos.example.com` with the real
   subdomain. Validate and reload it:

   ```bash
   sudo caddy validate --config /etc/caddy/Caddyfile
   sudo systemctl reload caddy
   ```

Caddy automatically obtains and renews the TLS certificate once the subdomain
resolves to the server and ports 80 and 443 are reachable from the Internet.
Set `APP_URL` and `API_URL` in `.env.production` to the final HTTPS address and
restart the three application services if the address changed:

```bash
docker compose --env-file .env.production -f docker-compose.production.yml up -d --force-recreate api worker web
```

## Updates and routine operations

```bash
cd /opt/gprn
# Replace project files using git pull or WinSCP, then:
docker compose --env-file .env.production -f docker-compose.production.yml up -d --build
docker compose --env-file .env.production -f docker-compose.production.yml logs -f api
```

Never use `docker compose down -v` on the production stack: the `-v` flag
deletes the PostgreSQL, Redis and MinIO volumes.

Database and photo storage need backups. At minimum, schedule a `pg_dump` to a
separate machine/storage location and back up the Docker `minio-data` volume.
Test restoring both before treating the service as production-ready.

## Port and service map

| Component | Server access | Purpose |
| --- | --- | --- |
| Caddy | 80/443 public | Existing host proxy, routes the photo app by domain |
| GPRN web | `127.0.0.1:13000` | Next.js application |
| GPRN API | `127.0.0.1:14000` | API and `/api/docs` |
| MinIO API/console | `127.0.0.1:19000/19001` | Private administration only |
| PostgreSQL / Redis | Docker network only | Never publicly exposed |

The loopback bindings keep this project separate from FiveM and the existing
image server. If any listed loopback port is in use, change the matching
`*_BIND_PORT` setting in `.env.production` and the corresponding Caddy
upstream.
