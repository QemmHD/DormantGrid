# PROGRESS — DORMANT GRID

## ☀️ Morning report

### Live URL
**None yet. Deploy is blocked on two settings only the owner can change.**
- `main` is green in CI: every push runs `npm run check` (typecheck, lint with 0 warnings, 159 unit tests, build, bundle budget, secret scan) and it passes.
- The Cloudflare deploy step is **skipped** because `CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID` are not set as repo secrets.
- The GitHub Pages fallback **fails with 404** because Pages is not enabled for the repo.

To get a URL, do either one (details in `docs/TEST_PLAN_IPHONE.md` §0):
1. **Full game.** Add both Cloudflare secrets (the token needs *Workers Scripts: Edit*; the account needs a workers.dev subdomain), then re-run **Deploy (Cloudflare)**. The URL will be `https://dormant-grid.<your-subdomain>.workers.dev`.
2. **Offline-only quick look.** Settings → Pages → Source: **GitHub Actions**, then re-run **Deploy fallback (GitHub Pages)**. The URL will be `https://qemmhd.github.io/DormantGrid/`.

To run it locally instead: `npm ci && npm run build && cd apps/game && npx vite preview` (offline), or `cd apps/server && npx wrangler dev` (game + API).

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
| Draw calls, medium tier at spawn (iPhone default) | 37–41 | 150 / 250 peak |
| Draw calls, high tier (desktop) | ~80 | — |
| Triangles, medium (incl. shadow pass) | ~200k | ≤ 300k |
| Triangles, high | ~490k (desktop only) | — |
| Texture memory | ≈ 0 MB (vertex colors only; shadow map + a 19×19 data texture) | ≤ 150 MB |
| Initial payload | 0.54 MB gzip (baseline raised on purpose for the worker; DECISIONS #17) | ≤ 12 MB |
| Chunk mesh build | off-thread in a Web Worker; worst main-thread sync build 32 ms (spawn/teleport only) | — |
| Memory walk (48 waypoints across the town) | geometries ≤ 75, textures 5, colliders ≤ 5.3k; heap returns to ~60 MB; world hash stable `9cf52650` | stable, no leaks |

Untested on a device: fps, real GPU memory, iOS memory kill and context-loss recovery, touch feel, audio unlock, and PWA install/update on iOS.

### Gates (latest run)
| Gate | Result |
|---|---|
| 1. `npm run check` | **PASS** (locally and in CI) |
| 2. `npm run smoke` (load, enter, move, salvage, inventory UI, save → reload → restore, zero console errors) | **PASS** |
| 3. Screenshot review (menu, Haven day/night, phone layout, town overview, trade, grid defend/online, intro) | **DONE**; fixes applied |
| 4. Bundle budget | **PASS** |
| 5. Counters vs. budgets | **PASS** (headless) |
| 6. Memory walk (`node tests/walk.mjs`) | **PASS** |
| 7. Determinism (sim tests + in-browser hash) | **PASS** |
| 8. Save round-trip, migration, corruption fuzz (sim + net tests) | **PASS** |
| 9. Accessibility | **PARTIAL**: text size, colorblind, reduce-shake, left-handed, subtitles and ≥44 pt targets are implemented; no automated contrast checker |
| Independent review subagent | **DONE**; 15 findings, all fixed |
| Server security self-review | **DONE** by the server track |
| Visual regression references, CI bot playthrough, Lighthouse PWA audit | **SKIPPED** (not built yet) |
| Live-URL smoke | **SKIPPED** (no deploy) |

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
| 9 Combat | 🟡 Melee, dodge, ranged weapons (projectiles, ammo, aim assist), 5 enemy types, drone alerts, **telegraphed raids** on Haven (`node tests/raid-flow.mjs`). Stealth and trap triggers are not done |
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
1. Raids: survivor guards fight in-world, and raiders damage placed pieces (outcome is currently stock/injury only).
2. Ranged enemies (raider sniper) shooting back.
3. Stealth (crouch, noise/light visibility) and traps triggering on enemies.
4. Livestock pens (coop/pen) and the hunting/butchering loop in the client.
5. Contracts UI with the Guild and Reavers, faction events, and an endings sequence for Act IV (Core).
6. Two-client co-op in-world Playwright test against `wrangler dev`.
7. Visual regression reference screenshots plus a bot playthrough in CI.
8. Photo mode with postcard export, and a daily Town Board popup on waking (generator exists: `townBoard`).
9. Survivor pathing via the sim nav grid (currently straight-line steering with collision push-out).
10. Stairs inside enterable ruins; upper floors.
11. Lighthouse PWA audit; automated contrast checks.
12. After the first device report: tune DPR steps, the detail radius, and shadow size per tier.
