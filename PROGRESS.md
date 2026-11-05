# PROGRESS — DORMANT GRID

## ☀️ Morning report

### Live URLs
- **Full game (accounts, cloud saves, co-op): https://dormant-grid.dg-server.workers.dev**, running the **current code**.
  - Deployed by CI on 2026-11-04 after the secret was fixed. Run 17 (manual) deployed version `a3e3750e`; run 18 (push, LATEST_CLIENT fix) also succeeded. Gates → deploy → retrying live smoke passed on attempt 1/3 both times; no rollback.
  - Full live smoke from the session: **14/14**.
    - HTTP: shell, manifest, sw.js, all 46 referenced assets 200; claim, whoami, cloud save PUT→GET round trip; duplicate claim rejected (409); `/api/version` returns `minClient 0.2.0, latest 0.2.0`.
    - Browser: SW registered, game boots, local save survives reload, zero console errors.
  - In-browser: the live world is worldgen v2 (hash `ff749351`, 21,370 props, save schema 2).
- **Offline build (local saves only): https://qemmhd.github.io/DormantGrid/**. `tools/live-smoke-retry.mjs --offline` → PASS on attempt 1/3.

### BLOCKERS (owner)
- None for deploys: the Cloudflare secrets work and CI deploys on every push to `main`.
- Reminder: rotate the Cloudflare API token that was pasted in chat earlier, if you haven't already, then re-save the secret.

To run it locally instead: `npm ci && npm run build && cd apps/game && npx vite preview` (offline), or `cd apps/server && npx wrangler dev` (game + API).

### Round 6 (2026-11-05): reliable, fair first hour — done
- **Done** (details: `docs/review/PLAN.md` "Round 6 status"):
  - Reboot guidance: beacon, minimap, "Reboot node", explainer.
  - Fair first two raids: sized to preparation, warning card, checklist, soft loss and recovery. Difficulty setting Relaxed / Standard / Hard.
  - Deaths: Haven safe zone, gear kept, marked satchel, death recap with one tip.
  - First crop in the tutorial: timer, harvest reminder, seasons card.
  - Odile introduced early, with a free first trade.
  - Act I: four residents.
  - iPhone landscape layout fixes.
  - Save schema v4.
- **Checks:**
  - accept 12/13 (P13 audio is out of scope).
  - 6 new checks pass: `tools/review/{reboot,raid,death,farm,trader,layout}-check.mjs`.
  - Pacing re-measured (`docs/review/pacing-r6.json`).
- **Known issues:**
  - The first harvest takes ~1.7 h of play.
  - The first node defence vs drones is untested by a person.
  - Act I for a person is estimated at ~20–32 min (unconfirmed).
  - The `tests/smoke.mjs` salvage step can't finish in this container (~2 fps software GPU; round-5 build fails it identically).
- **Morning test list:**
  1. First 45 min on iPhone: is Odile met early? Is the crop planted?
  2. When do you finish Act I?
  3. Take a pipe into the first raid.
  4. Reboot the first downtown node: are the drones too much?
  5. Read the death recap.
  6. Check the SE / 13 / 15 Pro Max layout: Jump vs. slot 4, clock, objective card.

### This round (2026-11-04, "Next round") — status
1. **Save safety + worldgen v2 — done.**
   - Saves store `world.seed`, `world.genVersion` and deltas only (removed prop/piece ids, placed pieces, drops, crops, survivors, player). A test asserts no generated props or buildings are in a save.
   - `WORLDGEN_VERSION = 2`. v1 is frozen: hash `9cf52650` is asserted. v2 = v1 plus appended street dressing (hash `ff749351`), so every old id still names the same prop (tested prop by prop).
   - Save schema 1 → 2 migration sets `genVersion: 1`. On load, `upgradeWorldGen` moves old saves to v2 and clears any *new* prop that would land on the player's pieces, drops, bed, survivors or position. A future-version save is refused, not loaded.
   - Streets: +4,683 props (16,687 → 21,370). That's curb-parked cars and vans, clutter clusters, debris, arterial barrier checkpoints with cones, corner signs, weeds, planters, and bushes against walls. New kinds: cone, barrier, planter, weeds.
   - Tests: `packages/sim/test/worldgen-version.test.ts` (11 tests). Screenshots: `docs/quality/props-v2/`.
2. **Deploy check — done.**
   - `tools/live-smoke-retry.mjs` runs the live smoke up to 3 times, 15 s apart, and prints the exact failing checks for each attempt. Only the last attempt decides the outcome. Wired into `deploy.yml`, with an HTTP-only fallback if the Playwright browser can't install.
   - Tested: real URL → PASS on attempt 1; bogus URL → per-attempt FAIL lines, exit 1.
3. **Models — done (procedural).**
   - Building close-ups:
     - shader facade patterns (brick, siding, panels, corrugated, shingles, plaster), off on the low tier
     - baked vertical AO under cornices, in window heads and in door recesses
     - window frames, mullions, transoms and lintels; door casings; corner pilasters
     - gable ridge caps, fascia boards, dormers; parapet coping, hatches, skylights, vents, antenna masts; roof tone variety
   - Animation polish:
     - smoothed idle↔walk↔run blend
     - idle weight shift
     - hip sway, twist and roll with shoulder counter-rotation
     - elbow pump when running, a settle on stop, and a body rock while interacting
     - head and chest look-at: the player looks at the target or where the camera points; survivors, the trader and raiders look at the player
   - Tests: `apps/game/src/render/character.test.ts`. Screenshots: `docs/quality/buildings-v2/`.
4. **Asset pipeline — done for props and the robot; buildings and rigged characters are validated only.**
   - `assets/registry.json` holds 30 stable IDs with iPhone budgets.
   - Ingest checks real size and units (rejects centimeters), pivot, a 90° rotation, rig and clips, and texture MB. There's a new `buildings/` category.
   - The runtime GLB loader replaces prop batches and the robot enemy, with procedural fallback. The loader chunks are lazy and not precached.
   - `docs/asset-requests/models-top30.md` is generated, with ChatGPT-ready prompts: a reference sheet for every model, plus a Blender script prompt for the 12 simple rigid shapes.
   - Tests: `tests/ingest-glb.mjs` (in `npm run check`) and `tests/models-flow.mjs` (end to end).
5. **Gates + fixes found along the way:**
   - The raid arrival was up to 1 game-hour late, and a raid could resolve before its raiders spawned. Both fixed.
   - Test scripts leaked a `vite preview` server per run (31 found). Fixed.
   - The feel and budget checks waited on wall-clock time instead of rendered frames. Fixed.
   - The far-mesh trees are 43k tris lighter.
   - New gate: `tests/budget-tris.mjs`, which checks main-pass tris and calls per district at the iPhone tier.
   - `GAME_VERSION` and `MIN_CLIENT` are now 0.2.0, so old clients can't join v2 rooms.

### What is still weak (honest)
- **Nothing in this round was tested on a real iPhone.** All numbers are SwiftShader/headless.
- **Facade patterns cost fragment time.** Under SwiftShader the medium tier drops from ~6.0 to ~4.3 fps. A real phone GPU should pay much less, but that's unmeasured. They're off on low, and auto quality is the safety net.
- **The medium tier is close to the triangle budget.** Downtown is at 290k of 300k main-pass tris; with the shadow pass it's 487k. Shadows on medium may be the first thing to cut after a device report.
- **The initial payload is 0.59 MB**, about 9% over the 0.54 MB baseline (the gate allows 10%). The next feature that adds eager code will need a deliberate baseline bump or a split.
- **Buildings and characters are still procedural boxes up close.** The patterns and trim help at 5–15 m, but there are no real textures, silhouettes are blocky, and hands and faces are minimal. GLB buildings and rigged characters can't be used in game yet (validated only).
- **Animation is procedural.** It has no foot IK on slopes or stairs, no turn-in-place steps, no attack anticipation beyond the existing wind-up, and no look-at in co-op remote players.
- **The street dressing is random-ish.** There's no hand-authored storytelling (crashed-car pileups, barricaded blocks). Weeds dominate the new prop count, and haven is deliberately sparse.
- **The world seed is fixed (1337).** Saves store it, but loading a different seed isn't supported.
- **A co-op room can't mix worldgen versions**, so the client version gate refuses 0.1.0 clients. Old PWAs must update.
- Still open from before: stealth, livestock and hunting, contracts and endings, survivor guards in raids, stairs in ruins, live two-client co-op verification.

### Rework pass (from the owner's iPhone test) — status
Full before/after write-up: `docs/quality/REPORT.md`. The audit is in `docs/QUALITY_AUDIT.md`; screenshots are in `docs/quality/{before,phase1,phase3,phase4,after}/`.
- **Feel:** smoothed touch look with an acceleration curve and dead zone, pinch/button/wheel zoom, labelled thumb-sized controls, jump moved out of the look path, oriented colliders, thick camera collision with near-fade, stamina cues, surface footsteps. Verified by `tests/feel.mjs`.
- **Interaction:** type-coloured highlight, world marker, off-screen arrow, contextual primary button, floating pickups, blocked reasons.
- **Guidance:** objective tracker, beacon, Next?, Help, skippable and replayable tutorial, first-use tips, labelled meters, toast de-dup. Verified by `tests/guide.mjs`.
- **Graphics:** lighting rebalance, facade and ground detail, restoration-driven meshing, smoke.
- **Systems:**
  - Fixed the **runaway clock** (critical).
  - Town Stockpile, survivor talk and jobs, livestock output, Guild contracts, deferred name claim.
  - Two-client co-op verified against local `wrangler dev`.
  - Verified by `tests/systems-flow.mjs` and `tests/coop-live.mjs`.

### What's playable now — a 5-minute tour
1. **Main menu** sits over a live, slowly orbiting town. Tap **New Game**.
   - A cinematic swoop runs from high above the dead city down to Haven Lot, with the Act I card.
   - Then the username claim appears (Cloudflare build only).
2. **Haven camp** has tents, a cookfire, fire barrels and string lights. Three survivors with their own schedules walk around and bark lines when you approach.
3. **Hints guide the first ten minutes:**
   1. Break a crate (hold the hand button): you get hitstop, shake, debris, and material chips that fly into your pack with a chime.
   2. Open the inventory.
   3. Craft a **crowbar**.
   4. Pry a door or wall off a ruin. Anything resting on it collapses.
   5. Build mode: foundation → walls → roof → bed.
   6. Sleep through the night.
4. **Trade.** Talk to **Odile** (Meridian Guild) at the tarp table to sell salvage for chits and buy seeds and batteries.
5. **Farm plots.** Plant seeds, water, fertilize and harvest. Each crop has 4 distinct visual stages.
6. **Reboot a Grid node.** Open the map; red dots are offline nodes. Walk into Old Downtown; drones, crawlers and raiders may engage you, and you can melee and dodge them.
   1. At a node, tap to start the reboot.
   2. Hold at the 3 relays to route power.
   3. Hold at the node to sync.
   4. Survive 3 machine waves.
   - Result: a cyan beam, a music swell and the district banner, then windows light up street by street outward from the node.
7. **The town runs without you.** The Ledger shows the Needs Board, survivor jobs and Town Rank; the Journal shows quests and lore; read cyan **Grid terminals** for lore.
8. **Day/night, weather and audio.** Rain, fog and storms with lightning. A 24-minute day by default (adjustable). Adaptive generative music that warms up in restored areas.

### What to test on iPhone first
Follow `docs/TEST_PLAN_IPHONE.md`. In short:
1. Add to Home Screen and launch. Check landscape and the rotate screen.
2. Claim a username, force-quit, relaunch. There should be no login screen.
3. Settings → **Show performance overlay**. Walk to downtown, then tap **Copy device report** and send it back.
4. Run the 20–30 minute slice (salvage → craft → build → sleep).
5. Background and foreground the app; force-quit and use Continue.

### Measured counters vs. budgets
All headless Chromium/SwiftShader. **Nothing has been measured on a real iPhone.**

| Counter | Measured | Budget |
|---|---|---|
| Draw calls, medium tier (iPhone default), main pass, densest districts | 46–73 (with shadow pass 69–99) | 150 / 250 peak |
| Triangles, medium, main pass: downtown / residential / market / industrial / haven | 290k / 275k / 244k / 201k / 194k (`tests/budget-tris.mjs`) | ≤ 300k |
| Triangles, medium incl. shadow pass, downtown | 487k | — |
| Triangles, high | 500–670k main pass (desktop only) | — |
| Texture memory | ≈ 0 MB (vertex colors only; shadow map + a 19×19 data texture) | ≤ 150 MB |
| Initial payload | 0.59 MB gzip (baseline 0.54 MB; GLB loader chunks are on-demand and not precached) | ≤ 12 MB |
| Chunk mesh build | off-thread in a Web Worker; worst main-thread sync build 32 ms (spawn/teleport only) | — |
| Memory walk (48 waypoints across the town) | geometries ≤ 82, textures 7, colliders ≤ 5.4k; heap after GC 48–55 MB; world hash stable `ff749351` (v2) | stable, no leaks |
| Props in the world | 21,370 (v2; v1 had 16,687) | — |

Untested on a device: fps, real GPU memory, iOS memory kill and context-loss recovery, touch feel, audio unlock, and PWA install/update on iOS.

### Gates (latest run)
| Gate | Result |
|---|---|
| 1. `npm run check` | **PASS** (locally and in CI) |
| 2. `npm run smoke` (load, enter, move, salvage, inventory UI, save → reload → restore, zero console errors) | **PASS** |
| 3. Screenshot review (menu, Haven day/night, phone layout, town overview, trade, grid defend/online, intro) | **DONE**; fixes applied |
| 4. Bundle budget | **PASS** |
| 5. Counters vs. budgets | **PASS** (headless; `tests/budget-tris.mjs` per district) |
| 6. Memory walk (`node tests/walk.mjs`) | **PASS** |
| 7. Determinism (sim tests + in-browser hash) | **PASS** |
| 8. Save round-trip, migration, corruption fuzz (sim + net tests) | **PASS** |
| 9. Accessibility | **PARTIAL**: text size, colorblind, reduce-shake, left-handed, subtitles and ≥44 pt targets are implemented; no automated contrast checker |
| Independent review subagent | **DONE**; 15 findings, all fixed |
| Server security self-review | **DONE** by the server track |
| Visual regression references, CI bot playthrough, Lighthouse PWA audit | **SKIPPED** (not built yet) |
| Browser flows: smoke, feel, guide, systems, grid, raid, defense, walk, models-flow | **PASS** (2026-11-04) |
| GLB ingest test (`tests/ingest-glb.mjs`, in `npm run check`) | **PASS** |
| Live-URL smoke | see Live URLs above |

### Phase status (honest)
No `phase-N` tags were created, because the Phase 0 acceptance line (deploys to a public URL) is blocked on the secrets.

| Phase | Status |
|---|---|
| 0 Foundations + spike (`?spike`) | ✅ Except the live deploy (blocked) |
| 1 Core engine, PWA, menu, settings | ✅ |
| 2 Worldgen, streaming, LOD, day/night, weather, minimap | ✅ No navmesh baking; the A* nav grid is used instead (DECISIONS #3) |
| 3 Salvage, deconstruct, inventory, craft | ✅ 109 items, 66 recipes |
| 4 Base building | ✅ Snap, stability, tiers, stations, storage |
| 5 Survival + onboarding | ✅ Not verified by a 30-minute human playtest |
| 6 Accounts, cloud saves, updates | ✅ Tested against local wrangler; not deployed |
| 7 Survivors | ✅ Autonomous sim + near rendering. The "20 days hands-off" check is a sim soak test, not a client test |
| 8 Farming | 🟡 Plots and crops work. Livestock, hunting and cooking-quality UI are only in the sim |
| 9 Combat | 🟡 Melee, dodge, ranged weapons (projectiles, ammo, aim assist), 5 enemy types, drone alerts, **telegraphed raids** on Haven (`node tests/raid-flow.mjs`). Raiders tear down placed pieces when you're away; bear traps, spike strips and barricades hurt or pin enemies (`node tests/defense-flow.mjs`). Stealth not done |
| 10 Grid | ✅ Reboot sequence and restoration ripple. District services UI is minimal |
| 11 Factions + campaign | 🟡 Quests and journal across 4 acts, Guild trade and lore terminals. Contracts, faction events and the endings flow are not playable yet |
| 12 Co-op | 🟡 Host/join, remote players, shared world events, pings and reconnect exist. Verified end-to-end only against local wrangler by the net track; not verified in-world with two clients |
| 13 Wow pass | 🟡 Intro, restoration ripple, Haven dressing, night lighting. No photo mode yet |
| 14 Hardening | 🟡 Review fixes, leak test, worker meshing |

### Needed from the owner
1. Cloudflare secrets **or** enable GitHub Pages (see above).
2. A real-iPhone device report (`Copy device report`).
3. Optional: art and audio via `docs/asset-requests/` → drop into `assets/incoming/` → `npm run assets:ingest`.
4. Optional: the title decision (DECISIONS #15).

## NEXT ACTIONS
0. **Round 6 follow-ups (do first):**
   - Device-test the morning list above.
   - First harvest within ~60 min (quick tutorial crop or a tended-plot bonus).
   - Soften the first node's drone wave if the device test says so.
   - If Act I is under 25 min for a person, make the 4th resident the Residential woman, arriving at dawn.
   - Bot: attack drones in their dip and boil water (review tooling).
1. **Owner:** rotate the Cloudflare token that was pasted in chat (if not done) and re-save the secret. CI deploys on push to main and retries the live smoke 3× with rollback.
2. **Owner:** an iPhone device report with **Settings → Show performance overlay → Copy device report** in downtown, on medium and on low. Decide whether medium keeps shadows and facade patterns.
3. Wire GLB **buildings**: replace intact landmark buildings (lot + footprint match, scale ±25%) and drop back to procedural pieces on first damage.
4. Drive **rigged GLB characters** with an AnimationMixer (clips from the registry), keeping the procedural rig as the fallback and for look-at layering.
5. Load manifest **images and audio** at runtime (textures, decals, icons, SFX). Only models are live today.
6. Foot IK on slopes and stairs, turn-in-place steps, and look-at for co-op remote players.
7. Authored street set pieces in worldgen v3 (pile-ups, barricaded blocks, collapsed facades), appended per the versioning rule.
8. Raids: survivor guards fight in-world; ranged raiders shoot back.
9. Stealth, livestock and hunting in the client; Guild and Reaver contracts UI; Act IV endings.
10. Two-client co-op over the live URL (`tests/coop-live.mjs`), from a normal machine (the sandbox proxy blocks WebSockets).
11. Visual regression reference screenshots and a bot playthrough in CI; Lighthouse PWA audit; automated contrast checks.
12. Stairs inside enterable ruins; upper floors.
13. If the payload baseline is hit: split `ui` or `services` further, or accept a deliberate baseline bump with a DECISIONS entry.
