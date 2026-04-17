# AGI Temperature

## Project Goal

A tiny web app that turns Hacker News AI-hype into a "temperature" reading.

**Ingestion (every 5 minutes):**
1. Fetch the top 100 Hacker News stories.
2. For each story, decide whether the title is AI-related.
3. Compute a score weighted by the story's rank (higher-ranked AI stories contribute more). *The exact scoring formula is a policy decision and is expected to change; keep it in a single versioned module.*
4. Map the aggregate score onto the range **[-89.2 °C, 56.7 °C]** — the coldest and hottest temperatures ever recorded on Earth.
5. Persist the raw score, derived temperature, and **every fetched title with its rank and AI-related decision** (not just the matched ones) so the classifier and scoring can be re-run on history later.

**Frontend:**
- Show the current "AGI temperature" prominently.
- Show historical summaries: past 7 days, all-time highs/lows, trend chart.

**Design principle:** store raw inputs (score, matched titles, ranks) alongside the derived temperature so the mapping and AI-detection logic can be retuned later without losing history.

## Tech Stack

All-in on Cloudflare's free tier. One vendor, one dashboard, one auth flow.

| Layer | Choice | Why |
|---|---|---|
| Scheduled job + API | **Cloudflare Workers** (TypeScript) | Native cron triggers, `fetch()` handler for the API, generous free tier. |
| Database | **Cloudflare D1** (SQLite) | SQL fits time-series + aggregate queries; bound directly to the Worker. |
| Frontend | **Vite + React + TypeScript** on **Cloudflare Pages** | Static SPA, auto-deploys from GitHub. |
| Local dev / deploy | **Wrangler** CLI | `wrangler dev`, `wrangler deploy`, `wrangler d1 migrations apply`. |
| CI/CD | **GitHub → Cloudflare Pages** (auto); Worker deploys via Wrangler (optionally wrapped in a GitHub Action with `cloudflare/wrangler-action@v3`). |

## Repo Layout

```
/                         repo root
├── agi-temperature-worker/   Cloudflare Worker (cron + API)
│   ├── src/index.ts
│   ├── migrations/           D1 schema migrations
│   └── wrangler.toml
├── web/                      Vite + React frontend (deployed to Pages)
└── CLAUDE.md
```

## Key Commands

**Worker:**
- `wrangler dev` — local dev server
- `curl "http://localhost:8787/__scheduled?cron=*/5+*+*+*+*"` — trigger cron locally
- `wrangler d1 migrations apply agi-temperature --local` / `--remote`
- `wrangler deploy`

**Frontend:**
- `npm run dev` (inside `web/`)
- Deploys automatically on push via Cloudflare Pages' GitHub integration.

## Architectural Guardrails

Things to keep in mind as the project grows. Each one is cheap to honor up front and painful to retrofit later.

### Use the Algolia HN API, not 100 individual item fetches
Workers free tier allows only 50 subrequests per invocation, so fetching the top 100 stories one-by-one from `hacker-news.firebaseio.com` will fail. Use `https://hn.algolia.com/api/v1/search?tags=front_page` (or the `/topstories` + bulk approach) to get all titles in a small number of requests.

### Cron is "at-least-once"; make ingestion idempotent
Cloudflare cron triggers can fire late, duplicate, or occasionally skip. Bucket `recorded_at` to the 5-minute mark and write with `INSERT OR IGNORE` against a unique index on the bucket so double-fires don't create double rows.

### Cache API responses at the edge
Every chart render should not hit D1. Use the Workers Cache API (or `cf: { cacheTtl }` on responses):
- current reading: cache ~60s
- history/aggregates: cache ~5 min
This also protects the DB if the site itself gets a traffic spike.

### One source of truth for config and secrets
- **Secrets** (API keys, webhooks) → `wrangler secret put` for Workers, Pages dashboard for the frontend. Never committed.
- **Non-secret config** (scoring constants, classifier version) → `wrangler.toml` vars or a checked-in `config.ts`.
- **Nothing sensitive in `.env` or `.dev.vars` committed to git.**
Decide this before adding the first secret; don't let it drift.

### Observability from day one
Cron will silently stop working at some point. Add:
- a `/api/health` endpoint returning `last_recorded_at` and row count,
- an external uptime check (e.g. UptimeRobot free tier) hitting `/api/health` and alerting if `last_recorded_at` is stale,
- Cloudflare Workers Logpush or `wrangler tail` during development to catch cron errors early.

