# 004 — Records: `/api/summary` → weather-record banners + °F toggle

**Status:** open
**Slice:** all-time extremes endpoint → record callouts styled like weather alerts; °F display toggle persisted to localStorage.

## Tasks
- [ ] TDD: `/api/summary` — all_time_high/low with timestamps, avg_7d_c, reading_count; 503 no_data
- [ ] Implement endpoint (+300s cache header)
- [ ] Frontend: record banners ("RECORD HYPE: 41.3 °C — hotter than Death Valley felt about Sora 2")
- [ ] °F toggle, display-only conversion, localStorage persistence
- [ ] Verify: screenshot banners + toggle in both states
