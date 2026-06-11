# 001 — Walking skeleton: cron → score → `/api/current` → big number on screen

**Status:** open
**Slice:** ingestion core (classifier c1, scoring s1, bucketing, batch write) + `/api/current` + frontend reading display. Touches worker, D1, API, and web so the whole pipe is provably alive.

## Tasks
- [ ] Migration `0002_story_engagement.sql` (points, num_comments, drop redundant indexes)
- [ ] TDD: failing tests for `classifier.ts` (word-boundary matching, c1 term list, false-positive guards like `air`/`maid`)
- [ ] TDD: failing tests for `scoring.ts` (weights, normalization on partial snapshots, γ=0.25 power curve, table from PRD §4.3)
- [ ] TDD: failing tests for `ingest.ts` bucketing (`floor(ms/1000/300)*300`) and idempotent double-fire (bucket-exists short-circuit + INSERT OR IGNORE)
- [ ] Implement: fetch topstories → Algolia bulk → Firebase fallback (cap 35) → classify → score → single `DB.batch()`
- [ ] TDD: failing test for `/api/current` (shape per PRD §4.5, 503 no_data, cache header)
- [ ] Implement `/api/current`
- [ ] Frontend: replace stub App with current reading (°C, big), polling 60s, no-data `—°` state
- [ ] Verify: local cron trigger writes rows; `/api/current` serves them; browser shows the number (screenshot)

## Done when
`curl localhost:8787/__scheduled` then reload the page → a real temperature derived from live HN front page is on screen, twice-fired cron writes once.
