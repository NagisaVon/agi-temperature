# agi-temperature

Can you feel the AGI tonight?

A tiny weather station for AI hype: every 5 minutes a Cloudflare Worker reads
the Hacker News front page, decides which headlines are feeding the furnace,
and maps the rank-weighted result onto **−89.2 °C … +56.7 °C** — the coldest
and hottest temperatures ever recorded on Earth. A React frontend renders the
reading inside a continuously morphing scene: frozen datacenters and icebergs
at the cold end, raining tokens at the hot end.

- **Spec:** [PRD.md](PRD.md) · **Task log:** [issues/](issues/) · **Scene bake-off:** [web/src/scene/DECISION.md](web/src/scene/DECISION.md)
- **Worker** (cron + API + D1): [agi-temperature-worker/](agi-temperature-worker/)
- **Frontend** (Vite + React, Cloudflare Pages): [web/](web/)

## Local development

```bash
# Worker: migrate local D1, start dev server, fire the cron once
cd agi-temperature-worker
npm ci
npx wrangler d1 migrations apply agi-temperature --local
npm run dev                                   # :8787
curl "http://localhost:8787/__scheduled?cron=*/5+*+*+*+*"

# Optional: seed ~35 days of plausible history for charts/records
node scripts/seed-local-history.mjs > /tmp/seed.sql
npx wrangler d1 execute agi-temperature --local --file=/tmp/seed.sql

# Frontend (talks to :8787 via web/.env.development)
cd ../web
npm ci
npm run dev                                   # :5173
```

`/spike` (not in the nav) scrubs the scene across the full temperature range
and compares the production renderer against the parked WebGL prototype.

## Tests & QA

```bash
cd agi-temperature-worker && npm test   # Miniflare + Vitest: ingestion, scoring, classifier, APIs
cd web && npm test                      # scene-params continuity (the no-banding guarantee)
cd web && node scripts/qa.mjs           # Playwright sweep: desktop/phone/reduced-motion, all pages
```

## API

| Endpoint | Cache | Notes |
|---|---|---|
| `GET /api/current` | 60 s | reading + the AI headlines behind it |
| `GET /api/history?range=24h\|7d\|30d\|all` | 300 s | 5m/1h/1d buckets |
| `GET /api/summary` | 300 s | all-time records, 7-day mean |
| `GET /api/health` | 60 s | **503 when stale >15 min** — point your uptime checker here |

## Deploy

Merges to `main` deploy the Worker via GitHub Actions (`CLOUDFLARE_API_TOKEN`
secret required) and the frontend via Cloudflare Pages. First-time bring-up
steps live in [issues/008-ship-observe.md](issues/008-ship-observe.md).
