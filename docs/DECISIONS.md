# Decisions log

Newest last. Each entry: what, why, and what would change it.

1. **TypeScript 6.0, not 7.0.** TS 7 (native) is the latest stable, but typescript-eslint 8.72 supports `<6.1`. Lint is a gate, so 6.0 it is. Revisit when typescript-eslint supports 7.
2. **No Rapier for the player (yet).** The town is made of axis-aligned boxes (buildings rotate in quarter turns), so a kinematic cylinder-vs-AABB controller (`game/collision.ts`, ~200 lines, deterministic) does the job with zero WASM download. Rapier stays the plan for nearby dynamic bodies (debris physics) if we ever need real ones; today debris is pooled particles with simple ground bounce.
3. **No navmesh baking.** Survivors and enemies use the coarse 2 m nav grid + A* from `@dg/sim` (`buildNavGrid`/`findPath`), which the brief allows as the fallback. Cheaper on iPhone, deterministic, shared with the server.
4. **WebGL2 renderer only.** No WebGPU spike was run: we cannot test on a real iPhone tonight, and WebGL2 is the safer default for iOS Safari 17. The renderer sits behind `core/renderer.ts`.
5. **Cheap "post-processing".** No EffectComposer render targets on mobile. Vignette and damage flash are CSS overlays (free). Color grading is done through light colors, ACES tone mapping, fog and the restoration tint. Bloom is faked with emissive vertex attributes and additive sprites.
6. **Conservative iPhone budgets** (from the Phase 0 spike, measured in headless SwiftShader — counters, not fps):
   - Default iPhone tier is `medium`: detail streaming radius 1 cell (3×3 chunks), LOD far city beyond, shadows 1024, DPR ≤ 1.25.
   - Measured on the real town at spawn: medium/low ≈ 37–40 draw calls, ≈ 200k triangles (shadow pass included); high (desktop) ≈ 80 draw calls, ≈ 490k triangles.
   - Texture memory ≈ 0 MB: everything is vertex-colored, and the only textures are the shadow map and a 19×19 data texture.
   - Adaptive DPR moves in coarse steps at most every 4 s, with at most 14 changes per session, because iOS leaks memory on repeated canvas resizes.
7. **Whole-town far mesh.** A single merged mesh holds every building as a block, the ground at 16 m resolution, and trees. Its vertex shader collapses the geometry inside loaded detail cells using a 19×19 "loaded" texture. One draw call for the entire skyline, with no LOD popping seams.
8. **Single Worker serves the game and the API** (Workers Static Assets with `run_worker_first` for `/api/*` and `/ws/*`). Same origin means no CORS and one deploy. See docs/ARCHITECTURE.md.
9. **Co-op authority: host-client.** The first player's phone runs the sim; the WorldRoom Durable Object relays, validates shapes and rates, and persists the event log. A full server-side sim does not fit free-tier DO duration/CPU (≈28 room-hours/day). See ARCHITECTURE.md.
10. **Device token hashes live in PlayerVault**, not the global registry, so each authenticated request touches one DO.
11. **Seasons are 7 in-game days.** A year is 28 days; a day is 24 real minutes by default (adjustable in Settings).
12. **Survivors have no thirst.** Water is folded into food for survivors to keep the town sim legible; the player still has thirst.
13. **Interaction targeting is automatic** (nearest and most in front of the camera within ~3 m), not a precise raycast. This is better for thumbs.
14. **Building grid.** Cells are 4 m and storeys 3 m (logical). Visual storey height is 3.25 m including the floor slab; foundations are 0.4 m.
15. **Title.** Kept *DORMANT GRID*. Alternatives for the owner to consider: *Brownout*, *Restart City*, *Lights On*.
16. **World seed is fixed (1337) for everyone for now.** This keeps co-op and saves simple. Per-save seeds are a later option, since the save already stores `world.seed`.
17. **Bundle baseline raised to ~0.54 MB gzip** (from 0.46 MB). The chunk-mesher Web Worker bundles its own copy of the sim worldgen, three.js math and the mesher. That's an intentional trade of ~80 KB download for zero main-thread mesh hitches. Still 22× under the 12 MB budget.

## 2026-11-04 — Worldgen versioning (save safety)
- Saves store `world.seed`, `world.genVersion` and deltas only (removed prop ids, removed building pieces, placed pieces, drops, crops, survivors, player). Generated props/buildings are never saved; a test asserts the JSON has no `props`/`buildings`.
- `WORLDGEN_VERSION` (shared) = 2. Rule: a new version may only APPEND after the previous version's output, using its own RNG fork, so every older id keeps its meaning. `layout.propMarks[v]` records where each version's props end. v1 hash `9cf52650` is frozen by a test; v2 = `ff749351`.
- Save schema 1 → 2 migration sets `genVersion: 1`. On load, `upgradeWorldGen(save, layout)` moves the save to the latest worldgen and marks any NEW prop that would land on the player's pieces/drops/bed/survivors/player as removed (only new ids). Saves from a future worldgen are refused with `future_version`, not loaded.
- A future non-additive worldgen change must keep older versions reproducible (`generateWorld(seed, v)`) and add an id-remap migration. Logged so nobody "just tweaks" v1.
- The game still runs one fixed seed (1337); `world.seed` is stored for the future, but loading a save with a different seed is not supported yet (all shipped saves are 1337).
- v2 dressing: curb-parked cars/vans, clutter clusters on the building side of sidewalks, road debris everywhere (more in danger), arterial barrier checkpoints with cones, corner signs, sidewalk weeds, downtown/market planters, bushes/weeds against walls, yard ground cover. New kinds: cone, barrier, planter, weeds. +4,683 props (16,687 → 21,370); medium-tier draw calls 89 → 95; heap after GC unchanged (~55–78 MB, precise-memory measurement).
- walk.mjs now forces GC before the final heap read; the earlier 160 MB readings were Chrome's bucketed `performance.memory`, not a leak.

## 2026-11-04 — Building close-ups within iPhone budgets
- Facade detail is shader-side: brick / siding / panels / corrugated / shingles / plaster patterns computed from world position in the chunk material (no textures, no normal maps). The pattern code rides in the existing `aEmit` channel as a negative value, so the mesh worker needed no new arrays. Patterns fade out by screen-space derivative (`fwidth`) to avoid shimmer.
- Baked vertex AO: vertical gradient on facades (darker under each cornice), window glass darker under the head, door recesses darker at the top; plus the existing ground-contact AO.
- Geometry detail is front-face-only plates (2 tris each): window frame, mullions, transom, lintel, door casing. Corner pilasters, gable ridge caps, fascia boards, occasional dormers, parapet coping, roof hatches, skylights, vent stacks and antenna masts. Roof tones vary (rusted, mossy, darker).
- Measurement before this pass showed the iPhone tier at ~300k main-pass tris downtown, already at the budget. The far mesh's 6.5k tree cones went from 5-sided with caps to 4-sided capless (−43k tris). Quoin blocks were cut (pilasters kept). Result: downtown 290k, residential 275k, market 244k main-pass tris at medium. tests/budget-tris.mjs now fails if any district exceeds 300k tris or 150 calls.
- GAME_VERSION 0.2.0, server MIN_CLIENT 0.2.0: worldgen v2 adds prop ids that a 0.1.0 client doesn't have, so mixed co-op rooms are refused and old PWAs are prompted to update. destroyProp ignores unknown ids instead of crashing.
