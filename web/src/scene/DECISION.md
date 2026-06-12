# Scene tech bake-off — decision record (PRD D11)

**Date:** 2026-06-11 · **Winner: Route A** (layered CSS/SVG + one 2D-canvas particle layer)

Both routes implemented the identical composition against the same `SceneParams`
contract ([sceneParams.ts](sceneParams.ts)), built in parallel and adversarially
reviewed. Measurements on a 1440×900 viewport, system Chrome, M-series Mac:

| Criterion | Route A (CSS/SVG/canvas) | Route B (three.js WebGL) |
|---|---|---|
| Lazy-chunk size | **12.4 kB / 4.8 kB gzip** | 538.4 kB / 138.6 kB gzip |
| Dependencies | none | three (+@types/three) |
| FPS at u = 0.1 / 0.5 / 0.9 | 60 / 60 / 60 | 60 / 60 / 60 |
| Console errors | none | none |
| Battery/CPU surface | 2D canvas, no GL context | WebGL context + shader pipeline |
| Effort per new effect | medium (hand-drawn canvas) | low-medium once in shader-land |
| Visual richness | illustrated, flat-charm | more cinematic (water glitter, true UV shimmer) |

Rationale: with FPS tied, the PRD's evaluation criteria (bundle size, battery,
maintenance) all point at Route A; 138.6 kB gzip of three.js is a steep price
for a background. Route B is visually richer — if the appetite for shader
effects grows, the `SceneParams` boundary makes swapping back a one-import
change.

- Production scene: [ProductionScene.tsx](ProductionScene.tsx) (Route A, graduated from the spike)
- Parked prototype: [spike/RouteB.tsx](spike/RouteB.tsx), still scrubbable at `/spike?route=B`
- User was shown both routes at u = 0.1/0.5/0.9 before this was recorded; no
  objection raised to the recommendation at check-in time.
