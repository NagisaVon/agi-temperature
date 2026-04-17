# AGI Temperature

## Project Goal

A tiny web app that turns Hacker News AI-hype into a "temperature" reading.

**Ingestion (every 5 minutes):**
1. Fetch the top 100 Hacker News stories.
2. For each story, decide whether the title is AI-related.
3. Compute a score weighted by the story's rank (higher-ranked AI stories contribute more).
4. Map the aggregate score onto the range **[-89.2 °C, 56.7 °C]** — the coldest and hottest temperatures ever recorded on Earth.
5. Persist the raw score, derived temperature, and matched titles to the database.

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

