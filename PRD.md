# PRD: AGI Temperature

**Status:** Approved — decisions resolved via design interview on 2026-06-11
**Repo:** `agi-temperature` (Worker: `agi-temperature-worker/`, frontend: `web/`)

---

## 1. Overview

AGI Temperature turns Hacker News AI hype into a single weather reading. Every 5 minutes, a Cloudflare Worker fetches the top 100 HN stories, classifies each title as AI-related or not, computes a rank-weighted hype score, and maps it onto **[−89.2 °C, 56.7 °C]** — the coldest and hottest temperatures ever recorded on Earth. A React frontend renders the current temperature inside a continuously morphing, temperature-driven animated scene (frozen datacenters and icebergs at the cold end; token rain and heat shimmer at the hot end), with historical trends, all-time records, and a "receipts" page listing the headlines behind the number.

**Design principle (load-bearing):** every fetched title is persisted with its rank, engagement stats, and classification decision — not just the matches — so the classifier and scoring formula can be re-run against full history later without losing anything.

## 2. Goals & non-goals

### Goals
1. A trustworthy 5-minute ingestion pipeline that never double-writes and degrades gracefully when upstream APIs flake.
2. A current reading that is explainable: users can see exactly which headlines, at which ranks, produced today's temperature.
3. A frontend whose visual centerpiece — the temperature-reactive scene — makes the number feel like weather.
4. Replayability: raw inputs stored such that any future classifier/scoring version can recompute history.
5. Zero-cost operation on Cloudflare's free tier, with monitoring that catches a silently dead cron.

### Non-goals (v1)
- Backfill/replay tooling (forward-only versioning; the data model guarantees backfill is *possible* later).
- Sources beyond Hacker News top stories; analysis of comment text or article bodies.
- LLM-based classification (the schema supports upgrading later).
- User accounts, alerts/notifications, embeds, or a public API contract for third parties.
- Retention/rollup machinery (storage headroom ≈ 2 years; revisit when needed).

## 3. Decision log

Decisions resolved in the design interview, with rationale. Each is binding unless superseded by a versioned change.

| # | Decision | Choice | Rationale |
|---|---|---|---|
| D1 | Classifier | Keyword/regex list, versioned in code | Deterministic, free, zero latency, re-runnable on stored history |
| D2 | Classifier scope | **Maximal**: core AI terms + companies/models + adjacent tech (GPU, NVIDIA, datacenter…) | Thermometer tracks the whole AI-industrial complex; accepted false-positive cost |
| D3 | Rank weighting | Linear: `weight(rank) = 101 − rank` | #1 ≈ 100× the #100 story without single-story dominance; easy to explain |
| D4 | Score → temperature | Power curve `score^γ`, γ tunable, initial **γ = 0.25** | Typical days land in a believable mid-range; one versioned knob, recalibratable from stored raw scores |
| D5 | Story row fields | Add `points` + `num_comments` (migration 0002) | Enables future engagement-weighted scoring without losing history |
| D6 | Retention | Keep all raw rows indefinitely | ~1.5–2 GB/yr vs 5 GB D1 free tier; replayability is the point |
| D7 | API surface | `/api/current` + `/api/history` + `/api/summary` (+ existing `/api/health`) | Each independently cacheable per the edge-caching guardrail |
| D8 | Health semantics | `503` when newest reading > 15 min old | Any dumb uptime checker alerts on status code alone |
| D9 | Chart rendering | Recharts | Tooltips/axes/responsiveness for free; bundle cost acceptable |
| D10 | Frontend v1 features | Animated temperature scene (front page), thermometer visual, °F toggle, all-time extremes, trend chart with 24h/7d/30d/all range switcher, AI headlines on a **separate page** | Per interview; headlines are receipts, scene is the product |
| D11 | Scene technology | **Spike both**: CSS/SVG + canvas particles *and* WebGL shaders; same scene, bake-off, then pick | User wants examples of both routes before committing |
| D12 | Scene structure | **One continuous scene** — every parameter interpolates with temperature; no discrete bands | Scene never jumps; 31° visibly differs from 36° |
| D13 | Routing | react-router (`/`, `/headlines`) + Pages SPA fallback | Real shareable URLs |
| D14 | Worker deploys | GitHub Action on push to `main` (`cloudflare/wrangler-action@v3`) | Removes "forgot to deploy" as a failure mode |
| D15 | Version migration | Forward-only: new `classifier_version`/`scoring_version` apply from deploy onward | YAGNI on backfill tooling; raw data keeps the option open |

## 4. System spec

### 4.1 Ingestion (cron, every 5 minutes)

**Fetch — 3 subrequests nominal, ≈40 worst case** (free-tier limit: 50/invocation; a subrequest is any `fetch()` *or* call to a Cloudflare service, including D1 — so the budget is 2 fetches + 1 D1 batch nominal, 2 + 35 + 1 worst case):
1. `GET https://hacker-news.firebaseio.com/v0/topstories.json` → take the first 100 IDs. Position in this list **is** the rank (1–100).
2. One bulk Algolia request for titles + engagement: `GET https://hn.algolia.com/api/v1/search?hitsPerPage=100&tags=story,(story_<id1>,story_<id2>,…)` using the OR-tag filter for all 100 IDs.
3. **Fallback:** stories missing from the Algolia response (indexing lag on very fresh posts) are fetched individually from `https://hacker-news.firebaseio.com/v0/item/<id>.json`, capped at 35 to preserve subrequest margin; beyond the cap, or on fetch failure, the story is skipped. Fallback items still carry engagement data — map Firebase `score` → `points` and `descendants` → `num_comments`; the columns are nullable only defensively, for edge-case items missing those fields.
4. If fewer than 100 stories resolve, proceed with what exists — the score normalizes by actual total weight (§4.3), so partial snapshots stay comparable.
5. If the Firebase top-stories call itself fails, the run aborts with an error log; no row is written for that bucket (visible as a gap, caught by health monitoring if persistent).

**Classify** (§4.2), **score** (§4.3), then **persist** (§4.4).

**Idempotency:** `recorded_at = floor(scheduledTime_ms / 1000 / 300) × 300` (unix seconds bucketed to the 5-minute mark). Before fetching anything, the run checks `SELECT 1 FROM readings WHERE recorded_at = ?` and exits if the bucket already exists — this prevents a late duplicate fire from mixing stories from a *second* fetch into an existing snapshot (plain `INSERT OR IGNORE` alone would backfill rank gaps with rows inconsistent with the stored score). All writes then execute in a **single `env.DB.batch()`** (atomic in D1) using `INSERT OR IGNORE` against the primary keys as a second line of defense against a concurrent double-fire. A duplicate cron fire is a no-op; a failed batch leaves no torn snapshot. *(M1 verification item: confirm via `wrangler tail` that one `batch()` of 101 statements is metered as a single subrequest.)*

### 4.2 Classifier — `classifier.ts`, `CLASSIFIER_VERSION = "c1"`

A pure function `isAI(title: string): boolean`. Single versioned module; the term list is the policy.

- Matching: case-insensitive, **word-boundary** regex over the title (so `AI` matches, `air`/`maid` don't). Multi-word terms match as phrases.
- Term tiers (one flat list at runtime; tiers are documentation):
  - **Core:** AI, AGI, ASI, LLM(s), GPT, machine learning, deep learning, neural network(s), chatbot, transformer model, generative, diffusion model, prompt(ing), AI agent(s), superintelligence, alignment, RLHF, fine-tun(e/ing), inference, RAG, multimodal…
  - **Companies/models:** OpenAI, Anthropic, Claude, ChatGPT, Gemini, DeepMind, Mistral, Llama, Midjourney, Stable Diffusion, Copilot, Cursor, Grok, Qwen, DeepSeek, Hugging Face, Perplexity, Sora, Waymo…
  - **Adjacent (per D2 maximal scope):** GPU(s), NVIDIA, CUDA, TPU, datacenter/data center (AI-era usage), H100/B200-class accelerator names, foundation model, scaling laws, AI safety, compute cluster…
- The exact list is curated in code review, not in this PRD; any list change bumps `CLASSIFIER_VERSION`.
- Known accepted error modes (D2): "NVIDIA earnings" counts; "Ai Weiwei retrospective" counts. Acceptable for a hype thermometer; fixable later via versioned list edits or an LLM upgrade, since all titles are stored.

### 4.3 Scoring & temperature — `scoring.ts`, `SCORING_VERSION = "s1"`

```
weight(rank)   = 101 − rank                      // rank ∈ 1..100
score          = Σ weight(r) over AI stories ÷ Σ weight(r) over all fetched stories   // ∈ [0, 1]
temperature_c  = −89.2 + 145.9 × score^γ         // γ = 0.25 in s1
```

- With a full 100-story snapshot the denominator is 5050; with fewer stories it is the actual sum, keeping partial snapshots comparable.
- γ = 0.25 is calibrated for the **maximal** classifier scope, where typical AI-weight fractions are expected around 0.20–0.35:

| score | 0.00 | 0.05 | 0.15 | 0.30 | 0.50 | 0.70 | 1.00 |
|---|---|---|---|---|---|---|---|
| temp °C | −89.2 | −20.2 | +1.6 | +18.8 | +33.5 | +44.3 | +56.7 |

- The raw `score` is stored alongside `temperature_c`, so retuning γ (a new `scoring_version`) needs no story replay — temperatures can be recomputed from scores alone.
- **Calibration checkpoint:** after ~2 weeks of production data, review the observed score distribution and adjust γ (→ `s2`) if typical readings don't sit in a satisfying range. This is expected, not exceptional.

### 4.4 Data model (D1)

Existing migration `0001_init.sql` (unchanged):

```sql
readings(recorded_at INTEGER PK, score REAL, temperature_c REAL,
         classifier_version TEXT, scoring_version TEXT)
stories(recorded_at INTEGER, rank INTEGER, hn_id INTEGER, title TEXT,
        is_ai INTEGER, PRIMARY KEY (recorded_at, rank))
```

New migration `0002_story_engagement.sql`:

```sql
ALTER TABLE stories ADD COLUMN points INTEGER;        -- nullable defensively; both Algolia and Firebase fallback supply it
ALTER TABLE stories ADD COLUMN num_comments INTEGER;  -- nullable defensively
DROP INDEX idx_stories_recorded_at;   -- redundant: leftmost prefix of the (recorded_at, rank) PK
DROP INDEX idx_readings_recorded_at;  -- redundant: readings.recorded_at is the rowid PK, already ordered
```

Budget check (D6): D1 meters each index update as an additional row-write, so the raw "101 logical rows × 288 runs ≈ 29k/day" undercounts. With the redundant secondary indexes dropped (above), a snapshot costs ~100 story rows plus their composite-PK autoindex updates and 1 reading row — roughly **30k–60k metered writes/day** depending on autoindex accounting, against the 100k/day free-tier cap (writes fail for the rest of the day if exceeded, so this headroom matters). Storage: ~10.5M story rows/yr ≈ 1.5–2 GB/yr vs the 5 GB cap → revisit retention around year two.

### 4.5 API

All responses: JSON, CORS headers (existing middleware), edge-cached via the Workers Cache API keyed on URL.

| Endpoint | Cache | Response |
|---|---|---|
| `GET /api/current` | 60 s | `{ recorded_at, temperature_c, score, classifier_version, scoring_version, ai_count, total_count, ai_stories: [{ rank, hn_id, title, points, num_comments, weight }] }` — `ai_stories` sorted by rank; this powers both the front page number and the `/headlines` receipts |
| `GET /api/history?range=24h\|7d\|30d\|all` | 300 s | `{ range, bucket: "5m"\|"1h"\|"1d", points: [{ t, avg_c, min_c, max_c, avg_score }] }` — bucketing: 24h → raw 5-min (≤288 pts); 7d/30d → hourly (≤168/≤720); all → daily. `t` = bucket start, unix seconds; 1h/1d buckets align to UTC clock boundaries; the range window is anchored at request time and rolls backward; for 5m buckets `avg_c = min_c = max_c` = the raw reading |
| `GET /api/summary` | 300 s | `{ all_time_high: { temperature_c, recorded_at }, all_time_low: { temperature_c, recorded_at }, avg_7d_c, reading_count }` |
| `GET /api/health` | 60 s | `200 { status:"ok", last_recorded_at, row_count }`; **`503 { status:"stale", … }` when `last_recorded_at` > 15 min old** (3 missed crons) or no rows exist |

**No-data behavior** (guaranteed to occur on first deploy, before the cron's first run): `/api/current` and `/api/summary` return `503 { status: "no_data" }`, mirroring the health semantics; `/api/history` returns `200` with `points: []`. Invalid `range` → `400`. Unknown routes → `404` (existing behavior).

### 4.6 Frontend (`web/`, Cloudflare Pages)

**Routing (D13):** react-router. `/` = main scene; `/headlines` = receipts. Add `web/public/_redirects` with `/* /index.html 200` for SPA fallback.

**`/` — the scene (D10–D12):**
- Full-viewport animated scene driven by the current temperature; the reading (large °C/°F figure) and thermometer visual composited on top.
- **Continuous parameterization (D12):** normalize `u = (t + 89.2) / 145.9 ∈ [0,1]`. A single `SceneParams` object derives from `u`: sky/palette gradient, particle system (type mix and density crossfade — snow/ice wind at low `u`, rain in the middle, **falling tokens** and heat shimmer/embers at high `u`), prop states (icebergs shrink/melt as `u` rises, datacenter racks thaw from frosted to glowing, sun elevation/intensity), wind speed, color temperature. No discrete bands — every degree shifts the scene; band-edge jumps must not exist.
- **Creative direction:** cold = "datacenter freezing in cold wind, icebergs"; hot = "raining tokens"; the in-between states are interpolations art-directed during the spike. Maximize visible variety across the range.
- `prefers-reduced-motion`: particles off, static gradient + props.
- Below/alongside the scene: 7-day trend chart (Recharts, from `/api/history?range=7d`, with range switcher 24h/7d/30d/all) and all-time record callouts (from `/api/summary`) styled like weather-record banners.
- °F toggle (display-only conversion `°F = °C × 9/5 + 32`; −89.2 °C = −128.6 °F), persisted in `localStorage`.
- Data refresh: poll `/api/current` every 60 s (matches edge TTL).
- No-data state (API returns `503 no_data`): reading shows `—°`, scene renders paused at mid-range (`u = 0.5`) with a "warming up" note; no error styling.

**`/headlines` — the receipts:**
- The full list of currently-matched AI stories from `/api/current.ai_stories`: rank, title (linked to `news.ycombinator.com/item?id=<hn_id>`), points, comments, and contribution weight. Sorted by rank. Shows classifier + scoring versions in a footer for transparency.

**Scene tech spike (D11), before production scene work:** implement the *same* reference scene against the *same* `SceneParams` interface twice —
1. **Route A:** layered SVG/CSS scenery + one `<canvas>` particle layer (no dependencies);
2. **Route B:** WebGL (three.js or OGL) with shader-driven atmosphere.

Evaluate at `u ≈ 0.1 / 0.5 / 0.9` on: bundle size, FPS on a mid-range phone, battery/CPU, and effort-per-new-effect. Pick one route for production; the loser's prototype is kept in the repo (`web/src/scene/spike/`) for reference. The `SceneParams` boundary means the rest of the app doesn't care which route wins.

### 4.7 Operations

- **Worker deploy (D14):** extend `.github/workflows/worker-ci.yml`, which today triggers **only on `pull_request`** — add an `on: push: branches: [main]` trigger so typecheck + tests also run on the push event, then add a deploy job (`cloudflare/wrangler-action@v3`) that needs the test job and is conditioned on `github.event_name == 'push'`. Requires `CLOUDFLARE_API_TOKEN` repo secret (the only secret; per the config guardrail it lives in GitHub secrets, never in the repo).
- **Frontend deploy:** unchanged — Cloudflare Pages auto-deploys `web/` on push.
- **Migrations:** applied explicitly via `wrangler d1 migrations apply agi-temperature --remote` (not automated in v1).
- **Monitoring:** external uptime check (UptimeRobot free tier) on `GET /api/health`, alerting on non-200 — which, per D8, fires when the cron has been dead > 15 min. `wrangler tail` for cron debugging during development.
- **Versioning (D15):** classifier/scoring changes bump their version string and apply forward-only. Historical rows keep their original decisions, tagged with the version that made them.

## 5. Milestones

| # | Milestone | Contents | Done when |
|---|---|---|---|
| M1 | Ingestion pipeline | Migration 0002; `classifier.ts` (c1); `scoring.ts` (s1); scheduled handler: fetch → classify → score → batch-write; unit tests for classifier, scoring, bucketing, idempotent double-fire | Local cron trigger writes correct, idempotent rows; CI green |
| M2 | Read APIs | `/api/current`, `/api/history`, `/api/summary`; health 503-on-stale; edge caching; tests per endpoint | All endpoints correct against seeded local D1, with cache headers |
| M3 | Frontend core | react-router + `_redirects`; current reading + thermometer + °F toggle; Recharts trend with range switcher; records callouts; `/headlines` page; no-data state | Renders end-to-end against a **local** Worker (`wrangler dev` + seeded local D1); prod bring-up stays in M5 |
| M4 | Scene spike → scene | `SceneParams` mapping; Route A and Route B prototypes; bake-off decision recorded in repo; production scene built on the winner; reduced-motion support | Scene visibly morphs across the full temperature range with no banding |
| M5 | Ship & observe | Initial prod bring-up (manual `wrangler deploy` + `wrangler d1 migrations apply agi-temperature --remote`, cron verified writing rows); deploy job in CI; UptimeRobot on `/api/health`; γ calibration checkpoint scheduled (~2 weeks post-launch) | Cron running in prod; frontend live against prod Worker; alerting verified by a forced-stale test |

M1 → M2 → M3 are strictly sequential. M4 can start (spike) in parallel with M2/M3. M5 last.

## 6. Open questions (tracked, non-blocking)

1. **γ recalibration (expected):** revisit after ~2 weeks of data; becomes `scoring_version = "s2"`.
2. **Keyword list curation:** the c1 term list is finalized in code review against a sample of recent real HN front pages, not in this PRD.
3. **Scene art direction:** the interpolated middle states (between iceberg-cold and token-rain-hot) get designed during the M4 spike.
4. **Custom domain:** undecided; deferred until after M5.
