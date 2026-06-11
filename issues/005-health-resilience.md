# 005 — Resilience: stale-health 503, edge caching, upstream-flake handling

**Status:** open
**Slice:** ops-grade behavior end-to-end: health semantics, cache API, graceful degradation, frontend no-data state.

## Tasks
- [ ] TDD: `/api/health` 503 when newest reading > 15 min old or no rows
- [ ] TDD: ingest aborts cleanly when Firebase topstories fails (no torn rows); partial Algolia + fallback cap 35; <100 stories normalizes correctly
- [ ] Edge caching via Workers Cache API: current 60s, history/summary 300s (verify cache hit on 2nd request in test or via header)
- [ ] Frontend no-data state: `—°`, scene paused at u=0.5, "warming up" note (humorous copy)
- [ ] Verify all with tests + manual curl
