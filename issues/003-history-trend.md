# 003 — History: `/api/history` bucketing → Recharts trend with range switcher

**Status:** done
**Slice:** time-bucketed history endpoint → trend chart on the front page with 24h/7d/30d/all switcher.

## Tasks
- [x] TDD: `/api/history?range=` — 24h→raw 5m, 7d/30d→hourly, all→daily; UTC bucket alignment; rolling window; `avg_c=min_c=max_c` for 5m; invalid range → 400; empty → 200 `points: []`
- [x] Implement with SQL group-by on `recorded_at` integer division
- [x] Frontend: Recharts area/line chart, range switcher, tooltips with °C/°F awareness
- [x] Verify: seed multi-day local data, screenshot chart at each range
