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
