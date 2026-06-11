# 006 — Scene spike: SceneParams + Route A (CSS/SVG/canvas) vs Route B (WebGL)

**Status:** open
**Slice:** `SceneParams` interface from u∈[0,1]; both prototype routes rendering the same reference scene; bake-off **with user** (explicit check-in point, PRD D11).

## Tasks
- [ ] `sceneParams.ts`: pure mapping u → palette/particles/props/wind/sun (unit-testable, continuous, no bands)
- [ ] Route A: layered SVG/CSS + one canvas particle layer (zero deps)
- [ ] Route B: WebGL shader atmosphere (three.js or OGL)
- [ ] Screenshot both at u ≈ 0.1 / 0.5 / 0.9; measure bundle size + rough FPS
- [ ] **Check in with user**: present screenshots + numbers, get the pick
- [ ] Record decision in `web/src/scene/DECISION.md`; loser parked in `web/src/scene/spike/`
