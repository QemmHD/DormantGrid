# PROGRESS — DORMANT GRID

_Last updated by Claude during the overnight build. This is the working memory: read it and continue from NEXT ACTIONS._

## Status
- **Branch:** `build/main-line` → merged to `main` when the gates pass.
- **Deploy:** GitHub Actions `deploy.yml` (Cloudflare Worker serving the game and API) or `pages-fallback.yml` (GitHub Pages, offline-only) when the Cloudflare secrets are missing.

## Done
- **Monorepo.** `packages/shared` (contracts), `packages/sim` (worldgen, nav, building pieces, saves and migrations, items/recipes/pieces/crops/enemies/quests data, inventory, crafting, survival, building stability, survivors town sim, farming, grid, rank, factions, raids, time/weather), `apps/server` (Worker plus AccountRegistry/PlayerVault/WorldRoom DOs), `apps/game` (client).
- **Client engine.** Renderer abstraction with adaptive DPR, quality tiers and context-loss handling. Touch (floating stick, swipe look, buttons) and keyboard/mouse input. Third-person collision-aware camera with shake and FOV kick. Kinematic controller with coyote time, jump buffer and dodge. Procedural skinned characters with procedural animation. Sky/day-night, weather (rain, fog, storm lightning). Procedural Web Audio SFX, ambience and adaptive generative music.
- **World.** A deterministic 1216 m town (806 buildings, ~16.7k props, 9 districts, a river with bridges, rail, outskirts). Time-sliced chunk streaming with instanced props. A whole-town far LOD mesh with shader collapse. Per-piece building colliders.
- **Gameplay.**
  - Hold-to-salvage props and building pieces, with tool tiers, collapse of dependent pieces, hitstop, shake, debris, sparks, dust and magnet flyers with chimes.
  - Container search, inventory, crafting with stations and blueprints, quick slots.
  - Base building with ghost preview, snapping, stability, tiers, stations, storage, beds and farm-plot visuals.
  - Survival meters and conditions, death with a recoverable drop pile, sleep to morning.
  - Guided onboarding, quests/journal, survivors (autonomous hourly town sim, near rendering with no pop, barks, job assignment).
- **UI.** HUD (meters, clock, topbar, action cluster, quick slots, prompt, hold ring, toasts, hints, subtitles, district banner, minimap). Inventory, crafting, build bar, map, ledger, journal, settings, pause, storage, death and main menu screens. Procedural item icons.
- **Accounts / saves / co-op client.** Username claim, silent token login, recovery code, link device, IndexedDB saves with backup, cloud sync with a conflict dialog, SW updater gated on safe moments, co-op client (room host/join, interpolation, reconnect).
- **Docs.** GDD, ARCHITECTURE (with verified Cloudflare free-tier limits), STYLE_BIBLE, ASSET_PIPELINE, asset request sheets, DECISIONS. Asset ingest tool.

## Gates (latest run)
- `npm run check`: PASS (typecheck, eslint with 0 warnings, 159 unit tests, build, payload 0.46 MB gzip, secret scan).
- `npm run smoke`: PASS (load, enter world, move, salvage, inventory, save, reload, restore, zero console errors).
- Screenshot review: done for the menu, spawn, town overview and HUD; fixes are ongoing.
- iPhone: **NOT TESTED** (no device available overnight).

## In progress / next
See NEXT ACTIONS.

## NEXT ACTIONS
1. Grid nodes: in-world node pylons, the reboot sequence (relays → hold-to-sync → defend), district restoration transition showpiece (Phase 10).
2. Enemies: drones, guard bots, crawlers, raiders, hounds; melee hits and decals; raid scheduler hookup (Phase 9).
3. Farming interactions: plant, water, harvest on farm plots (sim exists; client needs the interaction).
4. Co-op in-game hookup: remote player rigs, ping wheel in-world markers.
5. Move worldgen and chunk meshing into Web Workers if iPhone shows hitches.
6. Visual pass: the ground near spawn is flat and empty; add Haven set dressing (tents, tarps, fire barrels, string lights).
7. Lore terminals readable in-world (content exists).
8. Faction traders and contracts UI.
9. Visual regression references and a bot playthrough in CI.
10. Morning test plan for iPhone (docs/TEST_PLAN_IPHONE.md).

## Known issues
See KNOWN_ISSUES.md.
