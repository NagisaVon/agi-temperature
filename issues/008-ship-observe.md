# 008 — Ship & observe (M5)

**Status:** blocked on Cloudflare auth (everything else is ready)
**Blocker:** `wrangler whoami` → not logged in on this machine, and the CI deploy
job needs a `CLOUDFLARE_API_TOKEN` repo secret. Check-in question was dismissed;
steps below are ready to run the moment auth exists.

## Done already
- [x] CI: `worker-ci.yml` runs typecheck+tests on PR **and** push to main, then deploys via `cloudflare/wrangler-action@v3` (push only, needs test job)
- [x] CI: `web-ci.yml` typechecks, tests, and builds the frontend
- [x] Frontend prod env already points at `https://agi-temperature-worker.nagisavon.workers.dev` (web/.env.production)
- [x] Health endpoint returns 503-on-stale (D8) so any dumb uptime checker can alert

## Remaining — exact bring-up steps (~10 min once authed)

1. **Auth (pick one):**
   - `cd agi-temperature-worker && npx wrangler login` (browser flow), or
   - create an API token (template "Edit Cloudflare Workers" + D1 edit) and `export CLOUDFLARE_API_TOKEN=...`
2. **Remote migrations:** `cd agi-temperature-worker && npx wrangler d1 migrations apply agi-temperature --remote`
3. **First deploy:** `npx wrangler deploy`
4. **Verify cron writes:** wait ≤5 min, then
   `curl https://agi-temperature-worker.nagisavon.workers.dev/api/health` → expect `200 {"status":"ok", ...}` with a fresh `last_recorded_at`; `npx wrangler tail` to watch a live run.
5. **CI secret:** GitHub repo → Settings → Secrets → Actions → add `CLOUDFLARE_API_TOKEN` (same token). Subsequent merges to main deploy automatically.
6. **Pages env var:** confirm `VITE_API_BASE=https://agi-temperature-worker.nagisavon.workers.dev` is set in the Cloudflare Pages project (production env). Pages auto-deploys `web/` from GitHub.
7. **UptimeRobot** (free tier, needs an account): HTTP monitor on `GET /api/health`, alert on non-200, 5-min interval.
8. **Forced-stale alert test:** temporarily disable the cron trigger in the Cloudflare dashboard (or comment out `crons` and deploy), wait >15 min → health flips 503 → UptimeRobot alerts → re-enable.
9. **γ calibration checkpoint:** ~2 weeks post-launch (target ≈ 2026-06-25), review score distribution: `SELECT MIN(score), AVG(score), MAX(score) FROM readings` — if typical readings don't sit in a satisfying range, tune γ → `scoring_version s2` (PRD §4.3; temperatures recompute from stored raw scores, no replay needed).
