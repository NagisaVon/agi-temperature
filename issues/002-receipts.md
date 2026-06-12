# 002 — Receipts: every story stored → `ai_stories` in API → `/headlines` page

**Status:** done
**Slice:** full story persistence with engagement (points/num_comments) → `ai_stories` array in `/api/current` → react-router + `/headlines` receipts page.

## Tasks
- [x] TDD: ingest stores **all** fetched titles with rank/is_ai/points/num_comments (not just matches)
- [x] TDD: `/api/current.ai_stories` sorted by rank with `{rank, hn_id, title, points, num_comments, weight}`
- [x] react-router (`/`, `/headlines`) + `web/public/_redirects` SPA fallback
- [x] `/headlines`: ranked list linking to `news.ycombinator.com/item?id=<hn_id>`, points, comments, weight; classifier/scoring versions in footer
- [x] Humor pass: receipts framing ("the evidence", weight as "blame share")
- [x] Verify: browser screenshot of /headlines against seeded local D1

## Done when
Clicking "headlines" shows the actual HN titles that produced the current number, each with its blame share.
