# Seasonal Photo Battles

- The voting deck and **My battles** are separate views. The private endpoint `GET /api/v1/battles/mine` pages through every owned season participation, including moderation, waiting, active, withdrawn and completed works. It does not reuse the public deck's twenty-item page.
- A round ends when one photograph receives **11 actual votes in that pair**. Account vote weights are not a shortcut to this threshold. The existing Elo adjustment is applied once for the winning photograph's author.
- Both photographs remain in the season and advance their round counters. Season votes never reset. The next opponent must be a different author's photograph in the same genre and accumulated-vote band: 0-20, 21-40, 41-60, etc. Within a band the closest vote total is preferred. A pair that already met in the season cannot repeat.
- A photograph with no eligible opponent waits. A lone photograph does not win early. After the season ends, the highest accumulated vote total among eligible photographs that won at least one full round determines each genre's winner. An exact tie shares the result rather than selecting a random winner.
- Season results are finalized under a database transaction lock on the next public battle request or private participation read after the deadline. No new scheduler or background process is required. Requests after the deadline cannot accept votes or start another pair.
- Initial participation still requires competition moderation. Automatically matched later rounds inherit the approved participation. Re-moderating a work cannot reopen a completed round. Withdrawal and moderation retain vote history.
- Publishing to the feed does not implicitly enroll a photograph or choose an opponent. Participation uses `POST /api/v1/battles/join`, so it cannot bypass the shared season, progress and moderation rules.
- A per-season PostgreSQL advisory transaction lock serializes joining, voting, moderation, withdrawal and matching. Duplicate votes retain the existing unique constraint. Progress is persisted in `battle_progress`; migration `0018_battle_rounds` imports existing season entries and actual votes without deleting or fabricating votes.

## Deployment

Apply the migration before starting the updated API. In the server's SSH terminal:

```bash
cd /opt/gprn
git pull --ff-only
docker compose --env-file .env.production -f docker-compose.production.yml build migrate api web
docker compose --env-file .env.production -f docker-compose.production.yml run --rm migrate
docker compose --env-file .env.production -f docker-compose.production.yml up -d --no-deps api web
```

Normal database backup policy still applies before a schema deployment. No production migration is run by the local test suite.
