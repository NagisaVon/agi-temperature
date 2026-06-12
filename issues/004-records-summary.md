# 004 — Records: `/api/summary` → weather-record banners + °F toggle

**Status:** done
**Slice:** all-time extremes endpoint → record callouts styled like weather alerts; °F display toggle persisted to localStorage.

## Tasks
- [x] TDD: `/api/summary` — all_time_high/low with timestamps, avg_7d_c, reading_count; 503 no_data
- [x] Implement endpoint (+300s cache header)
- [x] Frontend: record banners ("RECORD HYPE: 41.3 °C — hotter than Death Valley felt about Sora 2")
- [x] °F toggle, display-only conversion, localStorage persistence
- [x] Verify: screenshot banners + toggle in both states
