# Scene tech bake-off — decision record (PRD D11)

**Date:** 2026-06-11 · **Winner: Route B** (three.js WebGL, shader-driven atmosphere) — **picked by the user** after reviewing both routes at u = 0.1/0.5/0.9: "i much prefer the webgl look."

Both routes implemented the identical composition against the same `SceneParams`
contract ([sceneParams.ts](sceneParams.ts)), built in parallel and adversarially
reviewed. Measurements on a 1440×900 viewport, system Chrome, M-series Mac:

| Criterion | Route A (CSS/SVG/canvas) | Route B (three.js WebGL) |
|---|---|---|
| Lazy-chunk size | 12.4 kB / 4.8 kB gzip | **538.4 kB / 138.6 kB gzip** |
| Dependencies | none | three (+@types/three) |
| FPS at u = 0.1 / 0.5 / 0.9 | 60 / 60 / 60 | 60 / 60 / 60 |
| Console errors | none | none |
| Battery/CPU surface | 2D canvas, no GL context | WebGL context + shader pipeline |
| Effort per new effect | medium (hand-drawn canvas) | low-medium once in shader-land |
| Visual richness | illustrated, flat-charm | **more cinematic (water glitter, true UV shimmer)** |

Rationale: the assistant recommendation was Route A on bundle/battery grounds,
but visual richness is the product (the scene *is* the centerpiece, PRD goal 3)
and the user preferred the WebGL look. The 138.6 kB gzip cost is accepted and
mitigated by lazy-loading the scene chunk. Route B's adversarial review fixed
per-frame allocations and added `forceContextLoss()` on unmount before it
graduated.

- Production scene: [ProductionScene.tsx](ProductionScene.tsx) (Route B, graduated from the spike)
- Parked prototype: [spike/RouteA.tsx](spike/RouteA.tsx), still scrubbable at `/spike?route=A`
