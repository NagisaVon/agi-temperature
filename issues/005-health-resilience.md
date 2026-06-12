# 005 — Resilience: stale-health 503, edge caching, upstream-flake handling

**Status:** done
**Slice:** ops-grade behavior end-to-end: health semantics, cache API, graceful degradation, frontend no-data state.

## Tasks
- [x] TDD: `/api/health` 503 when newest reading > 15 min old or no rows
- [x] TDD: ingest aborts cleanly when Firebase topstories fails (no torn rows); partial Algolia + fallback cap 35; <100 stories normalizes correctly
- [x] Edge caching via Workers Cache API: current 60s, history/summary 300s (verify cache hit on 2nd request in test or via header)
- [x] Frontend no-data state: `—°`, scene paused at u=0.5, "warming up" note (humorous copy)
- [x] Verify all with tests + manual curl
