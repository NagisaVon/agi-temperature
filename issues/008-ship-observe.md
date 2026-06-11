# 008 — Ship & observe (M5)

**Status:** open
**Blocker:** `wrangler whoami` → not logged in. Needs user to run `wrangler login` or provide `CLOUDFLARE_API_TOKEN` (repo secret for CI; local env var for bring-up).

## Tasks
- [ ] CI: add `push: branches [main]` trigger + deploy job (`cloudflare/wrangler-action@v3`, needs test job, push-only)
- [ ] Prod bring-up: `wrangler d1 migrations apply agi-temperature --remote`, `wrangler deploy`, verify cron rows via `/api/health`
- [ ] Frontend live against prod Worker (Pages env var already points at workers.dev URL)
- [ ] UptimeRobot check on `/api/health` (needs user account or skip with instructions)
- [ ] Forced-stale alert test
- [ ] Schedule γ calibration checkpoint ~2 weeks post-launch
