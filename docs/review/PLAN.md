# Ranked fix plan (from docs/REVIEW.md)

**Order:** impact on a new player first, then cost. Items 1–6 are cheap and fix the first 10 minutes. Items 7–10 fix the "looks like Roblox" read and the payoff. Items 11+ are depth.

**Acceptance checks are runnable.**
- Automated checks: `node tools/review/accept.mjs <id>`.
- Before running them, refresh the evidence: `node tools/review/session.mjs 10` (or `30`) and `node tools/review/controls2.mjs`.
- Visual checks name the exact screenshot command and what must be true in the image. Device checks name the item in `DEVICE_FEEL_TEST.md` and the rating needed.
- Baseline at review (2026-11-04): **0/13 pass**.
- **After round 3 (2026-11-05): 7/13 pass.** P1–P7 pass; P8–P13 were out of scope this round. Output is in "Round 3 status" below.
- **After round 5 (2026-11-05): 12/13 pass.** P11 passes on a measured enemy check. P13 (recorded audio) fails on purpose: the pipeline is ready but no recorded files exist. New checks: perks, Town Rank, co-op localhost, pacing. Output is in "Round 5 status" below.
- **After round 6 (2026-11-05): 12/13 pass** (P13 waits on recorded audio, out of scope). Six new round-6 checks pass: reboot, raid, death, farm, trader, layout. Output is in "Round 6 status" below.
- **After round 4 (2026-11-05): 11/13 pass** (P1–P10, P12), plus the new P15 restoration check. P11 (enemy variety) and P13 (recorded audio) were out of scope. P2, P8, P9, P10 and P12 now assert measured behaviour (pixels, real UI, unit tests), not grep counts. Output is in "Round 4 status" below.

| Rank | Fix | Findings | Effort | Acceptance check (must pass) |
|---|---|---|---|---|
| 1 | ✅ DONE r3 — **Unblock the first craft.** The marked first crate becomes a scrap source: add `mat.scrap 3–4` to crate yields or point the marker at a barrel. The craft step's hint says where scrap is ("barrels, signs, car panels"). The craft screen surfaces the tutorial recipe first. | #3, #22 | S | `accept.mjs P1-tutorial-scrap`: first craft ≤ 90 s in `session.mjs 10`. Also `shots.mjs` → `iphone-22-screen-craft.png` shows Crowbar as the first row while that tutorial step is active. |
| 2 | ✅ DONE r3, pixel check r4 — **Real smoke.** Pool smoke as camera-facing soft sprites (transparent, depthWrite off, alpha fade over life), separate from the opaque debris box pool. | #2 | S | `accept.mjs P2-smoke`. Also `shots.mjs` → `iphone-03-spawn-after-intro.png` shows no grey boxes above the cookfire. Device item 9 rated ≥ 4. |
| 3 | ✅ DONE r3 — **Target what I'm looking at.** Score candidates by angle first (reject > 60° off camera forward, and anything behind), then distance. Building pieces only win when they're the closest thing within ±20° of the crosshair. | #4 | S | `accept.mjs P3-targeting`: wrong target ≤ 5% of 60 in `controls2.mjs`. Device item 7 rated ≥ 4. |
| 4 | 🟡 PARTIAL r3 (first threat; raid spawn distance/arrows not done) — **Threats you can see.** Raiders spawn at 25–35 m inside a cone toward the player, with a red edge-of-screen arrow per raider and a horn. First threat by minute 10: a scripted drone fly-by over Haven at dusk on day 1, plus one weak hound pack on the route to the first node. | #12, #15 | S | `accept.mjs P5-threat-timing`: first threat ≤ 600 s in `session.mjs 30`. Also `shots.mjs` → `iphone-20-raid.png` shows at least 1 raider or a threat arrow. |
| 5 | ✅ DONE r3 — **The camera never loses the player.** Allow the camera to come to 0.5 m (not 0.9) and raise its height when pressed against a wall. Fade small props (no collider) that cross the camera→player segment. Keep the player visible above 25% opacity. | #5, #6 | M | `accept.mjs P4-camera-wall`: camera behind a wall ≤ 2% of spin frames. Also `shots.mjs` → `iphone-04-haven-overview.png` shows the player unobstructed. Device item 5 rated ≥ 4. |
| 6 | ✅ DONE r3 (finding #29 was the bot, not the game) — **Fix building in camp, and the shelter by minute 7.** Diagnose finding #29 (the bot's 6/6 placements failed): check the ghost validity reason near camp props. Show the real reason ("Need 2 more Scrap", "Blocked by tent"). Give each piece its own icon. | #21, #29 | S | `accept.mjs P7-first-build`: first placed piece ≤ 420 s in `session.mjs 10`. Also `shots.mjs` → `iphone-19-build-mode.png` shows a specific reason and 9 distinct icons. |
| 7 | **iPhone legibility pass.** Fit the menu title in the safe area. Make the clock subtitle at least 4.5:1 contrast. Make the map fill the screen height with labels ≥ 12 pt, add fog of war, and show a player arrow. Shrink the tutorial card to its title plus one line, expandable. | #13, #19, #20, #36, #37 | S | `shots.mjs` → `iphone-01-menu.png` shows the full title. `iphone-23-screen-map.png` map ≥ 300 CSS px tall with labels ≥ 12 px (measure in the DOM: `getComputedStyle` font-size on the map labels). Device item 8 rated ≥ 4. |
| 8 | ✅ DONE r3 (procedural rebuild; GLB path still open) — **Characters stop reading as toys.** Rebuild the humanoid: a tapered torso, separate hands (mitten blocks), a face with brow, nose and jaw planes, layered clothing (jacket hem, collar, pockets), 3 body types, and hair silhouettes. Or import the `char.*` GLBs from the registry and drive them with the procedural rig. | #1 | L | Device item 18 (style) rated ≥ 4, plus a side-by-side `shots.mjs` → `desktop-03-spawn-after-intro.png` reviewed against STYLE_BIBLE: face visible, hands present, clothing silhouette differs per survivor. |
| 9 | 🟡 PARTIAL r4 (ground grime, cracks, wear in the chunk shader; contact shadows 0.5 on high; prop/character edge-wear still open) — **Materials and grime.** Add world-space grime and edge-wear on props and characters (the facade shader approach, reused), ground decals (oil, cracks, leaves), and desaturate the toy-bright props. | #1, #25 | M | `shots.mjs` → `desktop-05-downtown-street-dormant.png` shows ground breakup and no fully saturated props. Device item 18 ≥ 4. |
| 10 | ✅ DONE r4 (P15: lamps, planters/benches, walkers, cleared hazards, warm light, birdsong, crane beat; laundry lines, market stalls, painted facades and music not done) — **Restoration you can see.** Each state adds:<br>• **Stabilized:** cleared debris and patched windows<br>• **Powered:** street lights on, at night too<br>• **Inhabited:** survivors walking the restored streets, laundry lines, market stalls<br>• **Thriving:** planters, painted facades and music. | #7 | L | `shots.mjs` → `desktop-05` vs `desktop-06` differ in at least 4 visible ways (people, lights, props, plants). Count NPCs within 30 m in a restored district (state 4) ≥ 3. Add an assertion to `tools/review/shots.mjs` scene 6. |
| 11 | ✅ DONE r4 (no generator option: power comes only from restored districts) — **Power means something.** Enforce `needsPower` for the Grid Workshop and turrets (powered district or generator), wire irrigation from restored Waterworks, and show the chain in the Ledger. | #11, #16 | S | `accept.mjs P9-power-gating` and `accept.mjs P10-irrigation`. |
| 12 | ✅ DONE r5 (Town Rank bar with the next 3 unlocks on the HUD and in the Journal; no dead perks) — **A visible spine.** Add a perk screen (one point per level, 4 tracks) and a Town Rank bar listing the next 3 named unlocks. Show the 3 ending paths in the Journal as soon as the factions are met. | #8, #9 | M | `accept.mjs P8-perks-reachable` and `accept.mjs P12-endings-reachable`. Also `shots.mjs` → `screen-journal` lists Act IV choices. |
| 13 | ✅ DONE r3 (scripted first arrival at 8:00) — **The town grows early.** Guarantee the first survivor arrival by minute 10–15 (an injured stranger event at the gate), then one per in-game day while beds exist. | #14 | M | `accept.mjs P6-new-survivor`: first new survivor ≤ 900 s in `session.mjs 30`. |
| 14 | ✅ DONE r5 (all 11 kinds: silhouette, behaviour, counter, escalation; `tools/review/enemies-check.mjs`) — **Enemy variety from existing data.** Give scout, brute, sniper and leader distinct silhouettes and behaviors (flank, tank, ranged, buff). Make the heavy a distinct machine and the boar a charging animal. | #10 | M | `accept.mjs P11-enemy-variety`: at least 9 client kinds. Device item 14 rated ≥ 4. |
| 15 | **Interiors.** Draw ceilings when the camera is inside, use interior wall materials (plaster or wallpaper), add a warm or dark interior light, and add 3 clutter props per room. | #18, #17 | M | `shots.mjs` → `desktop-10-interior.png` shows a ceiling, a non-brick inner wall and clutter. |
| 16 | 🟡 PIPELINE r5 (file-driven audio by stable ID, ingest with loudness and budgets, runtime with synth fallback; no recorded files yet, P13 fails) — **Sound of a place.** Add recorded or curated ambience beds per district state (wind, birds returning, distant machinery) and real impact layers for wood, metal and glass, alongside the synthesized ones. | #28 | M | `accept.mjs P13-recorded-audio`: at least 10 files ingested via `npm run assets:ingest`. Device item 11 rated ≥ 4. |
| 17 | **Weather that changes the world.** Rain darkens and adds sheen to ground and roads, sun shadows fade at full cloud (sun ≤ 20%), and puddle decals appear. Check that rain streaks render on medium. | #23, #24 | S | `shots-weather.mjs` → `desktop-w-rain.png` shows darker ground and no hard shadows. `iphone-w-storm.png` shows streaks. |
| 18 | **Shadow cost on medium.** Measure on device; if needed, use cascaded or limited-range shadows, or shadows for characters and props only. | #32 | M | `node tests/budget-tris.mjs` stays green, and the device report at medium downtown shows ≥ 55 fps p50 (device item 12). |
| 19 | 🟡 PARTIAL r4 (Haven sign readable from both sides; survivor avoidance, scanTargets allocations, mouse-look hint, window emission open) — **Small polish.** Mirror-safe sign text, survivor avoidance around the player, no allocations in `scanTargets`, mouse look hint before pointer lock, and daylight-suppressed window emission. | #26, #27, #34, #35, #25 | S each | `shots.mjs` → `iphone-04` shows the sign readable or blank from behind. Code review: `grep -n "new THREE.Vector3" apps/game/src/game/game.ts` shows no hits inside `scanTargets` (`game.ts:823-880`). |
| 20 | **Depth systems from the GDD** (stealth, hunting, livestock animals). Only after 1–15. | #30, #31 | L | Each gets its own GDD acceptance list; out of scope for this plan. |

**Re-run the whole review after a batch of fixes**

```
npm run build
node tools/review/session.mjs 30
node tools/review/controls2.mjs
node tools/review/shots.mjs
node tools/review/shots-weather.mjs
node tools/review/content.mjs
node tools/review/accept.mjs
```


## Round 3 status (2026-11-05)

`node tools/review/accept.mjs` on the round-3 build:

```
PASS P1-tutorial-scrap: first craft at 10.5 s (target ≤ 90 s; run session.mjs 10)
PASS P2-smoke: smoke uses a non-box pool
PASS P3-targeting: wrong target 0/60 = 0% (target ≤ 5%)
PASS P4-camera-wall: camera behind wall 0/1080 frames = 0.0% (target ≤ 2%)
PASS P5-threat-timing: first threat at 265.3 s (target ≤ 600 s in a 30-min session)
PASS P6-new-survivor: first new survivor at 517 s (target ≤ 900 s)
PASS P7-first-build: first piece placed at 57.6 s (target ≤ 420 s)
FAIL P8-perks-reachable: client references to perks: 0 (target > 0, plus a UI screen)
FAIL P9-power-gating: needsPower checks outside data: 0 (target > 0)
FAIL P10-irrigation: town.ts ctx() does not pass irrigation
FAIL P11-enemy-variety: client enemy kinds: 5 (target ≥ 9 of the 11 sim types)
FAIL P12-endings-reachable: references to ENDINGS outside its definition: 0 (target > 0)
FAIL P13-recorded-audio: recorded audio files: 0 (target ≥ 10 ambience/SFX beds; run content.mjs)
```

### What changed

1. **Opening pace:**
   - A crate now gives 2–3 scrap and you start with 2 scrap.
   - The crowbar costs 4 scrap + 1 timber, so the first crate always completes it. A unit test guards this (`systems.test.ts`).
   - The tutorial recipe is pinned to the top of the craft list.
   - An opening director (`game/opening.ts`) runs only for new games:
     - **3:52:** a survivor warning.
     - **4:00:** one drone scout, in front of the camera.
     - **8:00:** a stranger walks in and joins Haven.
   - Bot milestones (sim s): gather 9.6, craft 10.5, foundation 57.6, threat 265, damaged 270, new survivor 517 (`session.json`).
2. **Targeting:**
   - Candidates more than 70° off the look direction are rejected, so nothing behind the player can win.
   - Score is angle first, distance second. Building pieces are measured from an aim point 1.4 m ahead, and floors/roofs only win when nothing else is in view.
   - Survivor talk and the trader prompt use the same look rule.
3. **Camera:**
   - Shoulder offset collision.
   - The camera can come to 0.55 m with a crane lift.
   - A footprint guard keeps the lens out of buildings the player isn't in (doorway and window gaps had let it through).
   - A dithered occluder cutout in the world/prop shader removes walls, cars and bushes on the lens→player line.
   - The player mesh is hidden only if the lens is inside the head.
4. **Finding #29 (bot couldn't build) was the bot, not the game.**
   - Reproduced by hand: at the bot's spot the game reports `ok: true` and places on Enter.
   - The bot had (a) stopped gathering below the 8 scrap a foundation needs, (b) then tried walls and roof with no foundation ("unsupported"), and (c) tapped quick slots 1–3 blindly, which could leave the crowbar unequipped.
   - Bot fixed: it equips via `selectQuick`, strips cars with the crowbar, logs the game's placement reason, and stops the chain if the foundation fails.
5. **Visuals:**
   - The humanoid is rebuilt: tapered torso, jacket layers (hem, collar, placket, pockets, belt, tape), sleeves and cuffs, hands with thumbs, two-tone boots, and a face (brow, eyes, nose, mouth, ears, beard) with hair, cap and hood. It costs 1,764 tris per character, up from about 1,000.
   - Smoke and dust are soft fading billboards, no longer opaque cubes. Flames are narrower and more translucent.
   - Prop tints are muted (saturation ×0.6, lightness ×0.9).
   - A noise-modulated grazing sheen adds roughness variation.
   - Soft contact shadows sit under characters and props, one draw call.
   - Budgets: medium downtown 292k main-pass tris / 57 calls (was 290k / 55).

### Verification on the merged build (main `9d6a258`)

- **Before/after shots** at the same 6 points: `docs/review/before/` vs `docs/review/after/` (WebP, 205 KB + 131 KB).
- **Gates:**
  - `npm run check` green.
  - smoke, feel, guide, systems, grid, raid, defense, walk, models-flow: no failures.
  - `tests/budget-tris.mjs`: all districts within budget; medium downtown 292k main-pass tris / 57 calls.
  - P3/P4 re-measured on the final build: 0/60, 0/1080.
- **Deploy:** CI "Deploy (Cloudflare)" run 41941545945 succeeded, and its live smoke passed on attempt 1 (no rollback). Pages run 41941546023 succeeded.
- **Live smoke:**
  - Worker: 14/14.
  - Pages (`--offline`): PASS attempt 1/3.
  - Both URLs run the new code: opening director present, starting scrap 2, puff smoke, world `ff749351`.

### Still weak visually (honest)

- The fire-barrel flames are more translucent but still read as cones.
- The ground at Haven is still a flat grey plane: no decals or grime (PLAN 9).
- Contact shadows are subtle on the high tier, where real shadows also render.
- The Haven sign text is still mirrored from behind (PLAN 19).
- No iPhone device check this round; budgets are headless counters only.

### Bugs found this round

- **Fixed:** `camera.syncTargets()` applied a direct yaw change twice (`camera.update` also follows direct writes).
  - The game never calls it; the review harness did. That inflated the review's original 28% wrong-target figure, which therefore mixed a harness bug with the real behind-you scoring flaw.
- **Not fixed (bot only, unconfirmed for humans):** in the fast-clock bot, the onboarding step "Check your pack" never advanced after pressing Tab (`session.json` `end.onbStep: 4`).
  - The 30-min bot's free play includes four walks of 134–301 s toward a district node, its straight-line steering timing out. That is not idle time imposed by the game.

### Remaining (ranked)

1. **4** Raid legibility: spawn raiders at 25–35 m inside a cone, add threat arrows.
2. **7** iPhone legibility (menu title, clock contrast, map size and labels, tutorial card).
3. **10** Restoration you can see.
4. **9** Ground decals and grime.
5. **15** Interiors (ceilings, inner walls).
6. **17** Weather that changes the world.
7. **18** Shadow cost on medium (device report needed).
8. **19** Small polish: mirrored Haven sign, survivor avoidance, `scanTargets` allocations.
9. Out of scope this round: **11** power/water, **12** perks/endings, **14** enemy variety, **16** recorded audio, **20** depth systems.

## Round 4 status (2026-11-05)

Scope: restoration payoff, progression (perks + endings), Grid power and water, visual leftovers, the "Check your pack" step, P2 on pixels. Out of scope: P11 enemy variety, P13 recorded audio, co-op.

`node tools/review/accept.mjs` on the round-4 build:

```
PASS P1-tutorial-scrap: first craft at 10.5 s (target ≤ 90 s; run session.mjs 10)
PASS P2-smoke: smoke covers 0.84% of the frame (≥ 0.5%), hard-edge pixels 0.0% (≤ 8%), box pool adds 0.000% (≤ 0.05%)
PASS P3-targeting: wrong target 0/60 = 0% (target ≤ 5%)
PASS P4-camera-wall: camera behind wall 0/1080 frames = 0.0% (target ≤ 2%)
PASS P5-threat-timing: first threat at 265.3 s (target ≤ 600 s in a 30-min session)
PASS P6-new-survivor: first new survivor at 519.7 s (target ≤ 900 s)
PASS P7-first-build: first piece placed at 57.6 s (target ≤ 420 s)
PASS P8-perks-reachable: real salvage XP 0→2; craft level-up → 1 perk point, ★ badge "1"; Perks screen 4 tracks × 32 perks; Take → 2 learned, carry 40→55
PASS P9-power-gating: 6/6 power+water unit tests pass; client needsPower gates: 5 (stations, turrets, floodlights via sim districtPowered)
PASS P10-irrigation: town ctx passes irrigation = irrigationOn(world); unit test: irrigated crop water ≥ 0.85 and grows faster than a dry one
FAIL P11-enemy-variety: client enemy kinds: 5 (target ≥ 9 of the 11 sim types)
PASS P12-endings-reachable: campaign walked: 25 steps, next step shown in Journal at 25/25; via UI: talk:guild_factor, choice:toll, talk:grid_core, choice:core → ending screen; endings reached through the UI: 6/6 (end.commons, end.fracture, end.guild, end.reavers, end.sleep, end.custodian)
FAIL P13-recorded-audio: recorded audio files: 0 (target ≥ 10 ambience/SFX beds; run content.mjs)
PASS P15-restoration-payoff: lamps 0→72, decor 104, walkers 3, hazards near player 42→10, pixels changed 12.8% (thresholds: lamps 0→≥6, decor ≥10, walkers ≥2, cleared ≥5, pixels ≥12%)

2 failing
```

### What changed

1. **Restoration payoff (P15, new measurable check).** `tools/review/restore-check.mjs` shoots the same downtown street at 22:30, dormant and with every downtown node online.
   - Lit lamps 0 → 72 (glow plus ground pools), 104 planters, bushes and benches.
   - 3 ambient walkers, 165 hazards cleared (42 → 10 within 60 m).
   - 12.8% of screen pixels change luminance by more than 25/255 (threshold 12%).
   - Also: warmer light near online nodes, birdsong by day, and a crane-shot beat with letterbox on every reboot.
2. **Progression (P8).**
   - **XP from play:** salvage, craft, build, harvest, kills, nights survived, new residents, lore, contracts.
   - **Perk points:** one per level, +1 per node, +1 per quest. A full campaign alone grants at least 32 (unit test).
   - **Perks screen** (K or ★, with a badge when points are waiting): 4 tracks × 8 tiers, an XP bar, and how points are earned.
   - **Effects:** 26 of 32 perk effects are wired. The other 6 are labelled "no effect in this build yet" on the screen.
3. **Campaign to every ending (P12).**
   - Odile counts as the Guild factor.
   - The toll decision opens by itself, with reputation effects shown on each option.
   - A Grid Core hatch on a downtown plaza: sealed with its progress shown, then a beacon once it opens.
   - The core choice shows which ending you would get right now and which reputation is short. The ending screen uses the sim endings plus the written epilogues.
   - The Journal's top card always shows the next step. "How this can end" lists all 6 endings with requirements, your current value and how to raise it.
   - `tools/review/progress-check.mjs` walks the whole campaign through the real UI: 25 steps, each shown in the Journal. It reaches all 6 endings from the Journal's "Decide now".
4. **Power and water (P9, P10).**
   - Grid Workshop, turrets and floodlights work only on Grid power. Each shows a status light, and you get a hint when one is dead.
   - Turrets shoot (using rifle rounds). Floodlights light the yard at night.
   - Irrigation starts when a Waterworks pump syncs, and the clinic opens when the Hospital is Powered.
   - The Ledger shows the chain. Unit tests cover all of this: `packages/sim/test/power.test.ts`.
5. **Visual leftovers** (before/after pairs in `docs/review/after/r4-4-*`, both builds shot with `tools/review/visual-pair.mjs`):
   - Flames: soft, flickering additive flame billboards instead of cones.
   - Ground: grime stains, Voronoi slab cracks in broken segments, aggregate grain and scuffed wear on paving.
   - Sign: "HAVEN" in a 5×7 pixel font on both faces. It was "NAUH" from the road and blank from the camp.
   - Contact shadows: 0.32 → 0.5 on high.
6. **"Check your pack": it was the bot, not humans.** `tools/review/pack-step.mjs` passes the step in real time with Tab, I, and a touch tap on the pack icon (iPhone 13 landscape emulation). The bot opened the pack during step 3, before the step was active. The game now also counts a pack opened early.
7. **P2 on pixels.** `tools/review/smoke-check.mjs` freezes a frame and toggles the puff layer and the box pool:
   - The smoke covers ≥ 0.5% of the frame.
   - Rendered alone over the sky it has ≤ 8% hard-edge pixels (measured 0%).
   - The box pool adds ≤ 0.05% (measured 0%).
8. **Saves:** schema 3. v2 saves get one-time credit for past quests and nodes (XP, perk points, quest reputation, Custodian reputation). A frozen v2 save fixture must keep loading.

### Bugs found this round
- **Fixed:**
  - Quest reward reputation and XP were never applied.
  - The Guild quest pointed at a "Market Row, yellow awning" NPC that does not exist.
  - The HUD objective card showed a side quest ahead of the main step.
  - Raiders measured distance to a wall's centre, so at a 4 m wall's end they pushed forever (defense-flow failed 2 of 3 runs on the round-4 build).
  - The Haven sign glyphs read "HAUEH".
- **Fixed in my own new code before merge:**
  - The Grid Core hatch ignored the quest pointer.
  - The core prompt read "Grid Core Grid Core".
  - The first ground-crack shader drew black contour loops.
  - The first wear term drew long bright bands across roads.
- **Not fixed:** the review tools teleport the player and set state for steps whose objective logic is unit-tested (collect, build, reboot, rank…). That a human can get through those steps in a reasonable time was not measured this round.

### Not confirmed without a real iPhone
- Frame cost of the ground shader (about 12 extra noise and hash evaluations per ground fragment; off on low quality) and of the flame billboards on medium or high.
- Readability of the perk screen and the 5-option core dialog at iPhone text sizes.
- The top bar with 8 buttons fits in emulation (iPhone SE and 13 landscape: 44 px buttons, no overlap with the minimap). On the SE it covered the clock, so on screens ≤ 640 px wide the clock now sits under the top bar (0 overlaps measured). Not checked on a device with a notch or Dynamic Island in Home Screen PWA mode.

### Out-of-scope bugs seen (logged, not fixed)
- P11: the client still has 5 enemy kinds of the sim's 11.
- P13: no recorded audio.

### Remaining (ranked)
1. **4** Raid legibility: spawn raiders at 25–35 m inside a cone, add threat arrows and a horn.
2. **7** iPhone legibility (menu title, clock contrast, map size and labels, tutorial card), plus a real device pass over the new perk, Journal and core screens.
3. **14 / P11** Enemy variety from existing data.
4. **12 (rest)** Town Rank bar with the next 3 named unlocks; the 6 perk effects with no system yet (Quiet Work, Patch Job, Site Foreman, Gridwright, Tracker, Warden).
5. **10 (rest)** Inhabited/Thriving extras: laundry lines, market stalls, painted facades, music.
6. **15** Interiors (ceilings, inner walls).
7. **9 (rest)** Edge-wear on props and characters.
8. **16 / P13** Recorded ambience and impact layers.
9. **17** Weather that changes the world.
10. **18** Shadow cost on medium (needs a device report).
11. **19 (rest)** Survivor avoidance, `scanTargets` allocations, mouse-look hint, daylight window emission.
12. **20** Depth systems.

### Deploy (main `ee22979`)
- CI: "Deploy (Cloudflare)" run 23 and "Deploy fallback (GitHub Pages)" run 21 both succeeded.
- Live smoke, Worker (https://dormant-grid.dg-server.workers.dev): 14/14 pass, serving the same `index-oZau0SM8.js` as the local build.
- Live smoke, Pages (https://qemmhd.github.io/DormantGrid, `--offline`; it has no API): pass. Round-4 strings are present in its precached assets.
- Gates on the merged build:
  - `npm run check` (101 sim + 36 + 61 tests, lint 0 warnings, bundle 0.61 MB, secret scan clean).
  - smoke, feel, guide, systems-flow, grid-flow, raid-flow, defense-flow (3/3 after the wall-footprint fix), walk (world hash `ff749351`), models-flow.
  - budget-tris: downtown 292k tris / 58 calls at medium.
  - controls2, session 30, progress-check, pack-step, smoke-check, restore-check.

## Round 5 status (2026-11-05)

Scope: enemy variety (P11), no dead perks, Town Rank bar, real-play pacing, audio pipeline (P13 stays failing until real files exist), co-op readiness. Out of scope: new maps, content packs, 3D model integration, monetization.

`node tools/review/accept.mjs` on the round-5 build:

```
PASS P1-tutorial-scrap: first craft at 10.5 s (target ≤ 90 s; run session.mjs 10)
PASS P2-smoke: smoke covers 1.51% of the frame (≥ 0.5%), hard-edge pixels 0.0% (≤ 8%), box pool adds 0.000% (≤ 0.05%)
PASS P3-targeting: wrong target 0/60 = 0% (target ≤ 5%)
PASS P4-camera-wall: camera behind wall 0/1080 frames = 0.0% (target ≤ 2%)
PASS P5-threat-timing: first threat at 265.2 s (target ≤ 600 s in a 30-min session)
PASS P6-new-survivor: first new survivor at 517.1 s (target ≤ 900 s)
PASS P7-first-build: first piece placed at 57.6 s (target ≤ 420 s)
PASS P8-perks-reachable: real salvage XP 0→2; craft level-up → 1 perk point, ★ badge "1"; Perks screen 4 tracks × 32 perks; Take → 2 learned, carry 40→55
PASS P9-power-gating: 6/6 power+water unit tests pass; client needsPower gates: 5 (stations, turrets, floodlights via sim districtPowered)
PASS P10-irrigation: town ctx passes irrigation = irrigationOn(world); unit test: irrigated crop water ≥ 0.85 and grows faster than a dry one
PASS P11-enemy-variety: client kinds 11/11; behaviour+counter 11/11; silhouettes at 30 m: smallest 92 px, most similar pair scout/sniper IoU 0.548 (≤ 0.8); escalation tier 0 → 4: 6 → 11 kinds
PASS P12-endings-reachable: campaign walked: 25 steps, next step shown in Journal at 25/25; via UI: talk:guild_factor, choice:toll, talk:grid_core, choice:core → ending screen; endings reached through the UI: 6/6 (end.commons, end.fracture, end.guild, end.reavers, end.sleep, end.custodian)
FAIL P13-recorded-audio: recorded audio files shipped and played: 0 (target ≥ 10). Pipeline ready: 66 IDs, 46 with a runtime hook; files needed are listed in docs/asset-requests/audio-sfx.md and audio-music.md
PASS P15-restoration-payoff: lamps 0→72, decor 104, walkers 3, hazards near player 42→10, pixels changed 13.1% (thresholds: lamps 0→≥6, decor ≥10, walkers ≥2, cleared ≥5, pixels ≥12%)
```

### What changed

1. **Enemy variety (P11 now measured).** All 11 sim enemy types are their own client kind:

   | Group | Kind | What it does | Counter |
   |---|---|---|---|
   | Reavers | Grunt (pipe) | Melee | Dodge |
   | | Scout (spear and cape) | Flanks from the side, retreats when hurt | Bear traps pin it twice as long |
   | | Sapper (barrel pack) | Plants charges on buildings while ignoring you | A hit cancels the plant |
   | | Marksman (hat and rifle) | Keeps 13–24 m, red laser telegraph, never fires without a clear line | Cover |
   | | Captain (banner) | Buffs nearby raiders | Its death routs them |
   | Custodians | Drone | Orbits at 3.4 m, out of melee reach; dips to fire | Hit it during the dip, or turrets |
   | | Guard unit (riot shield) | Front hits do ×0.25, turns slowly | Get behind it |
   | | Crawler swarm | Packs of 3–5 | Swings cleave, spikes ×3 |
   | | Heavy | Telegraphed slam ring | Front ×0.5, back core ×2 |
   | Wildlife | Hound pack | Circles in from behind; never steps into firelight or a powered floodlight at night | Light |
   | | Boar | 11 m/s straight charge | Stuns itself on walls and traps |

   - The first sighting of each kind toasts its counter, and the Journal lists the threats you have met.
   - Ambient spawns are chosen by district and threat tier (6 kinds at tier 0, all 11 at tier 4). Raids spawn every sim kind 1:1, escalating by rank from the sim planner.
   - `tools/review/enemies-check.mjs`:
     - Silhouettes rendered alone at 30 m: the most similar pair overlaps 0.55–0.62 IoU (limit 0.8), and the smallest silhouette is 92 px.
     - 11/11 behaviour and counter signatures.
     - Escalation.
2. **No dead perks.**
   - Quiet Work: salvaging is now loud (heard within 16 m, 8 m with the perk). An enemy that hears it investigates for 8 s.
   - Patch Job, Site Foreman and Warden: work in the town simulation.
   - Tracker: hounds and boars appear on the minimap.
   - Gridwright: replaced (no power budget exists) with turrets firing 30% faster and floodlights reaching 50% farther.
   - `tools/review/perks-check.mjs`: a static scan shows every fx key is read; unit tests; a real-salvage noise test.
3. **Town Rank bar** on the HUD (inside the objective card) and in the Journal, listing the next 3 named unlocks. `tools/review/rank-check.mjs` (iPhone SE and 13 emulation): on screen, text ≥ 11 px, no overlaps, updates with points.
4. **Real-play pacing:** `tools/review/pacing.mjs` (the table is below).
5. **Audio pipeline.**
   - `assets/audio-registry.json` has 60 sound IDs and 6 music loops (46 with a runtime hook, 20 pending).
   - Ingest checks budgets and normalises loudness (peak -6 dBFS after AAC for short sounds; EBU R128 for longer ones).
   - At runtime, a recorded variant plays when shipped and the synth otherwise. Ambience beds and music moods crossfade.
   - `tests/audio-flow.mjs` covers this end to end with temporary test tones.
   - **P13 stays failing:** no recorded files ship. The files needed are listed in `docs/asset-requests/audio-sfx.md` and `audio-music.md`.
6. **Co-op readiness.**
   - `tests/coop-local.mjs` runs the real Worker and Durable Objects (`wrangler dev`, workerd) on 127.0.0.1 with two headless clients, 18/18:
     - host and join by code; movement
     - socket drop and resume; silent drop
     - duplicate join (older tab replaced, close 4001)
     - old client refused (update_required, close 4006)
     - overlay and copyable report
   - Settings → **Co-op diagnostics** overlay.
   - `docs/review/COOP_TEST.md` is the two-device checklist.


### Real-play pacing (round 5, item 4)

**How it was measured.** `node tools/review/pacing.mjs 150` plays the campaign through gameplay only:
- walking, held-E salvage, crafting, building with the ghost
- sleeping in a bed, planting, talking and trading with Odile
- defending Haven when a raid is announced, and rebooting a node

It never sets quest state. Times are in-game seconds (fast-sim harness), from a fresh game, at the default 24 real minutes per in-game day. There are two full runs:
- **Run A:** before the round-5 pacing fixes.
- **Run B:** after them (Act I pays chits, the bot defends raids and retreats when hurt).

Flag rule from the brief: ⚠ marks a step under 30 s or over 10 min of bot time.

| Milestone | Target | Why this target | Run A | Run B | Verdict |
|---|---|---|---|---|---|
| First perk chosen | ≤ 5 min | Growth should show in the first session: one level is 100 XP | 1.2 min | 1.2 min | ✅ |
| First faction contact (Odile) | ≤ 15 min | She stands at Haven from minute 1, and the Guild is how fuses and chits work | 35 min | 103 min | ❌ (the bot only talks when the quest asks; a human may talk sooner — **unconfirmed**) |
| First night survived | 20–30 min | Night falls ~12 real minutes in; sleeping through it should be the first big loop | 22 min | 22 min | ✅ |
| End of Act I (Neighbors done) | 30–45 min | The vertical slice: shelter, first neighbours, the first steady loop | 29 min | 103 min | ⚠ (Run B lost ~70 min to 11 bot deaths around Haven) |
| First district reboot | 35–60 min | Act II's climax; it lights the first district and pays perk points | not reached in 150 min | not reached in 150 min | ❌ (Run A: no fuse; Run B: fuse bought at 103 min, but the bot never started the reboot at the node) |
| First raid repelled | day 3–5 (~60–110 min) | Raids start on day 3 by design; the first one should be winnable with basic walls and a fight | none (raids lost, not counted) | 0 of 3 repelled (all lost) | ❌ |
| First crop or livestock harvest | 45–75 min | Potatoes/carrots take 3–4 in-game days; the first harvest should land early in Act II | none | none | ❌ |

**Steps the bot measured** (Journal "next step" to done):

| Step | Run A | Run B | Flag |
|---|---|---|---|
| Strip something for parts (6 scrap) | 22 s | 24 s | ⚠ under 30 s (intended: a tutorial beat) |
| Gather timber (6) | 15 s | 15 s | ⚠ under 30 s (intended) |
| Build a campfire | 30 s | 30 s | |
| Make a crowbar | 2 s | 1 s | ⚠ under 30 s (materials already in hand) |
| Lay four foundations | 3.1 min | 6.2 min | |
| Raise walls and a doorway (6) | 4.9 min | 48 min | ⚠ over 10 min in Run B (deaths) |
| Put a roof on it (4) | 9.1 min | 20 min | ⚠ over 10 min in Run B |
| Build a bed and sleep through the night | 8.1 min | 22 min | ⚠ over 10 min in Run B (bed cloth was slow to find, then waiting for dark) |
| Workbench + 2 farm plots | 2.9 min | 4.9 min | |
| Get a Grid fuse | stalled 2 h (0-chit materials) | 15 s after Act I | fixed: Act I now pays 30 chits |

**What this says** (bot evidence; a human may differ):
1. **Fixed:** the fuse was a hard stall. Basic materials sell for 0 chits; the fix is 30 chits for Neighbors plus a correct hint.
2. **The first raids are lost.** The first raid (Custodians: 1 drone + 8 crawlers, around day 4) beat a new town with walls but no traps or turrets. The raid warning gives hours, but nothing tells the player what to build. Next: a raid-prep hint naming traps and spike strips, or a weaker first raid.
3. **Deaths around Haven** stretch Act I from 29 to 103 minutes when they happen. The bot fights badly, so this is a bot limit as much as a game signal. **Unconfirmed** for humans: measure it in the device test.
4. **Harvest never happens** within 150 minutes. Crops need tending and 3–4 days; the bot planted late and tended rarely. **Unconfirmed** whether a human gets a harvest in the first hour.
5. **Odile is easy to miss.** Contact comes only when the quest points at her.

### Bugs found and fixed this round
- **Co-op server:** `webSocketClose` never completed the close handshake, so a client that closed sat in CLOSING. The old `coop-live` "reconnect" check passed without a reconnect happening.
- **Co-op client:** no dead-link detection (a silent drop could hold a dead socket for minutes); it now resumes after 20 s of silence.
- **Co-op:** a player rejoining from a fresh tab restarts state numbering at 1. Other clients dropped every update as out of order, so that player looked frozen. Fixed on both server and client.
- **Pacing:**
  - The first-node fuse came only from rare heavies → Odile sells fuses.
  - Basic materials sell for 0 chits, so the fuse was still unaffordable → finishing Act I pays 30 chits.
  - The fuse hint was wrong.
- **Enemies:** sappers stalled against props; hounds circling one camp fire walked into another's light.
- **Short landscape phones:** the grown objective card swallowed left-thumb stick drags (`tests/feel.mjs`). Its text now passes touches through, and its buttons sit above the thumb zone.
- **iPhone SE:** the objective card overlapped the quick bar.
- **Visual:** ground cracks were drawn on pale grass.
- **Audio:** AAC overshoots short transients by about 3 dB → peak target -6 dBFS with a post-encode correction.

### Logged, not fixed
- **iPhone SE:** the Jump button overlaps quick slot 4 (it did before this round too).
- **Pacing bot limits:** it fights poorly and dies when it ranges far. Its deaths are not a measure of difficulty.

### Not confirmed without a real iPhone or a live two-device run
- 11 enemy kinds on screen at once on an iPhone. Draw calls and triangles were re-measured headless; frame time was not.
- Touch feel of fighting each enemy kind (dodging the boar, circling the shield, timing the drone dip).
- Co-op over the internet (latency, packet loss, iOS backgrounding): only localhost was tested. `docs/review/COOP_TEST.md` is the checklist for you.
- How recorded audio sounds on iPhone speakers: no files exist yet.

### Remaining (ranked, after round 5)
1. **P13 recorded audio:** deliver files per `docs/asset-requests/audio-sfx.md` and `audio-music.md`, then run `npm run assets:ingest` (the pipeline and runtime are ready).
2. **First raid is lost** by a new town (pacing): a raid-prep hint that names traps and spikes, or a softer first raid; verify on device.
3. **Real-play reboot:** the pacing bot buys the fuse but never starts the node reboot. Check whether a human finds the node and relays in time (device test); improve the node's beacon if not.
4. **First harvest** within the first hour (pacing): crop timing or a tending hint.
5. **Odile contact earlier** (pacing): a first-day nudge toward the trader.
6. **Two-device co-op run** with `docs/review/COOP_TEST.md` (internet latency, iOS backgrounding).
7. **7** iPhone legibility (menu title, clock contrast, map), plus the SE Jump/quick-slot overlap.
8. **4** Raid legibility (spawn cone, threat arrows, horn — the horn sound is in the audio list).
9. **15** Interiors; **9** prop and character edge-wear; **17** weather; **18** shadow cost (device); **19** remaining polish; **20** depth systems.

### Deploy (main `553b27e`)
- CI: "Deploy (Cloudflare)" run 25 and "Deploy fallback (GitHub Pages)" run 23 both succeeded.
- Live smoke, Worker: 14/14 pass, serving the same `index-B7bFGfmd.js` as the local build.
- Live smoke, Pages (`--offline`, no API there): pass.
- Gates on the merged code:
  - `npm run check` (108 sim + 36 + 61 tests, lint 0, bundle 0.62 MB, secret scan clean).
  - smoke, feel, guide, systems-flow, grid-flow, raid-flow, defense-flow, walk, models-flow, audio-flow.
  - budget-tris: downtown 292k tris / 58 calls at medium, unchanged.
  - Review checks: enemies, perks, rank, progress, pack-step, smoke, restore, controls2, session 30.
  - coop-local: 18/18.
- smoke and feel failed once while the pacing bot ran beside them. Both pass alone; the feel failure was the real objective-card bug and is fixed above.

## Round 6 status (2026-11-05)

Scope: make the first hour reliable and fair for real players. Covers the reboot flow, first-raid fairness and a difficulty setting, deaths, the first crop, the trader, Act I pacing and the iPhone layout. The rule this round: **difficulty is not tuned to the bot.** The bot finds dead ends, stalls and unclear steps; human-plausible play sets difficulty. Out of scope: audio files (P13), 3D model integration, new maps or content, monetization.

`node tools/review/accept.mjs` on the round-6 build (evidence refreshed: `session.mjs 30`, `controls2.mjs`, progress/enemies/restore/smoke checks re-run):

```
PASS P1-tutorial-scrap: first craft at 10.5 s (target ≤ 90 s; run session.mjs 10)
PASS P2-smoke: smoke covers 1.04% of the frame (≥ 0.5%), hard-edge pixels 0.0% (≤ 8%), box pool adds 0.000% (≤ 0.05%)
PASS P3-targeting: wrong target 0/60 = 0% (target ≤ 5%)
PASS P4-camera-wall: camera behind wall 0/1080 frames = 0.0% (target ≤ 2%)
PASS P5-threat-timing: first threat at 265.3 s (target ≤ 600 s in a 30-min session)
PASS P6-new-survivor: first new survivor at 509.5 s (target ≤ 900 s)
PASS P7-first-build: first piece placed at 57.6 s (target ≤ 420 s)
PASS P8-perks-reachable: real salvage XP 0→2; craft level-up → 1 perk point, ★ badge "1"; Perks screen 4 tracks × 32 perks; Take → 2 learned, carry 40→55
PASS P9-power-gating: 6/6 power+water unit tests pass; client needsPower gates: 5 (stations, turrets, floodlights via sim districtPowered)
PASS P10-irrigation: town ctx passes irrigation = irrigationOn(world); unit test: irrigated crop water ≥ 0.85 and grows faster than a dry one
PASS P11-enemy-variety: client kinds 11/11; behaviour+counter 11/11; silhouettes at 30 m: smallest 82 px, most similar pair bot/heavy IoU 0.498 (≤ 0.8); escalation tier 0 → 4: 6 → 11 kinds
PASS P12-endings-reachable: campaign walked: 27 steps, next step shown in Journal at 27/27; via UI: talk:guild_factor, talk:guild_factor, choice:toll, talk:grid_core, choice:core → ending screen; endings reached through the UI: 6/6 (end.commons, end.fracture, end.guild, end.reavers, end.sleep, end.custodian)
FAIL P13-recorded-audio: recorded audio files shipped and played: 0 (target ≥ 10). Pipeline ready: 66 IDs, 46 with a runtime hook; files needed are listed in docs/asset-requests/audio-sfx.md and audio-music.md
PASS P15-restoration-payoff: lamps 0→72, decor 104, walkers 3, hazards near player 42→10, pixels changed 13.1% (thresholds: lamps 0→≥6, decor ≥10, walkers ≥2, cleared ≥5, pixels ≥12%)

1 failing
```

P6 first read 929 s. Round 6 removed the auto-respawn so the death recap can be read, and `session.mjs` sat on the death screen while the opening timer (play time) stood still. The bot now presses "Get back up" like a player: 509 s.

### New checks (all pass; output in `docs/review/*.json`)

| Item | Check | What it proves |
|---|---|---|
| 1 Reboot | `node tools/review/reboot-check.mjs` | From Act II, with real inputs: the card, beacon and minimap all lead to Odile for the fuse. Escape closes the trade. They then lead to the node ("Control node", 268 m). The bot walks there on the nav path (100 s). The one-time explainer appears at ~20 m and the prompt reads "Reboot node". E starts the reboot; three relays are routed (held E); sync and defence complete; the node comes online. Health is topped up during the defence: this checks reachability, not combat. |
| 2 First raids | `node tools/review/raid-check.mjs` | Raid #1 with no defences = 2 grunts. The warning card names who, the compass direction and the countdown. The checklist ticks for a wall, a trap and a weapon; a minimap chevron shows the direction; away from Haven, the beacon leads home. Raids #1 and #2 (2 grunts + 1 scout) are repelled with a lead pipe and no top-ups (min HP 75–96). A raid lost while away takes ≤ 10% of stores and hurts nobody; a recovery objective and beacon appear; there is no raid for 60 h. Placing a defence completes the recovery and returns supplies. Settings → Difficulty: Relaxed / Standard (default) / Hard; Relaxed raids are smaller than Hard. |
| 3 Deaths | `node tools/review/death-check.mjs` | The recap names the killer and the place ("Killed by a Reaver Grunt · in Old Downtown, 150 m from Haven") with exactly one tip. Gear is kept (the weapon stays equipped; bandages, fuse, quick-bar food); the haul drops in a satchel. E gets you up at Haven. The satchel is the beacon and minimap target until picked up. Bleed-outs name the hound; starvation is named. The safe zone: an ambient raider never reaches a player in Haven and backs off, while the control case (outside) attacks; 194 ambient spawns, none within 78 m of Haven. |
| 4 First crop | `node tools/review/farm-check.mjs` | Finishing "bed" starts "A first crop": seeds, compost and timber are handed over, and the beacon points at the plot spot. E on the plot plants (the step completes) and the one-time seasons card appears. A growth timer shows on the prompt and the card ("ripe in 4 d 11 h (about 1.8 h of play)"). The crop ripens through the hourly town sim (102 game hours, watered); there is one reminder; the beacon reads "Ripe carrots"; E harvests 9 carrots. |
| 5 Trader | `node tools/review/trader-check.mjs` | Minute 0: Odile's coin is on the minimap, 8.7 m from the spawn. A survivor mentions her once the tutorial reaches crafting, and her coin pulses until the visit. She calls out once within 14 m. E opens trade with a free welcome trade (2 beans, 1 bandage, 6 chits, once). First contact is stamped before minute 15. With the tutorial stalled, the mention still comes by minute 4. |
| 7 Layout | `node tools/review/layout-check.mjs` | iPhone SE 3rd gen 667×375, 13 844×390 and 15 Pro Max 932×430, as a Home Screen PWA with notch / Dynamic Island insets (0 / 47 / 59 px sides, 21 px bottom). Both the plain HUD and a raid warning (the tallest card) show no overlaps, nothing off-screen or outside the safe area, nothing tappable in the stick's thumb zone, and every target ≥ 44 px. Emulation only. |

Unit tests added: early-raid sizing, difficulty scaling, soft loss, grace and compass (`systems.test.ts`); `hoursToRipe`; farmers wait on the player's ripe crop (`soak.test.ts`); v3 → v4 save migration (`campaign.test.ts`).

### What changed
1. **Reboot flow.** *Diagnosis:* both a bot limit and a game gap.
   - **Bot limit:** it walked in straight lines and stuck on props. It now walks `findPath` and replans around blockers.
   - **Game gap:** after the tutorial, quest objectives had no world beacon and no minimap marker. Now the objective drives both. The prompt reads "Reboot node", and a one-time card explains relays, sync, the 14 m defence and the rewards.
   - **Proof in real play:** the round-6 pacing bot started the reboot (round 5 never did).
2. **First raid fairness.**
   - The first two raids are sized to Haven's preparation (walls, traps, turrets, guards, a weapon in hand), with caps.
   - **Warning card:** who, compass direction and a game-time countdown, plus a three-item prep checklist and a red minimap chevron. The beacon leads home if you are away.
   - **Soft failure:** ≤ 10% of stores taken and nobody hurt, plus a recovery objective that returns half and a 24 h grace before the next raid.
   - **Difficulty setting:** Relaxed / Standard / Hard scales raid size and frequency, enemy damage and hunger/thirst.
3. **Deaths.**
   - A 48 m Haven safe zone for ambient enemies.
   - Gear is kept on death; the haul drops in a satchel that is marked on the map.
   - The death recap names the cause and place and gives one tip. Respawn waits for the player.
4. **First crop.**
   - The tutorial gained "A first crop" (seed pouch). Save v4 shifts the tutorial index.
   - A growth timer on the prompt and the objective card.
   - A harvest reminder, and the beacon leads to the ripe plot.
   - A one-time seasons card.
   - Farmers now wait 6 h before harvesting the player's own crop: before, they took it the hour it ripened, so a player never saw a ripe crop.
5. **Trader:** a survivor mentions Odile, her coin is on the minimap, she calls out, and the first visit has a free trade.
6. **Act I pacing:** "three residents" completed itself (three are seeded), so it is now four. Re-measured below.
7. **iPhone layout:**
   - Jump moved above Attack (it was over quick slot 4 on SE).
   - Zoom is now a 45 px target.
   - The clock moved under the top bar.
   - The objective card now sits below the meters, puts its buttons first, passes touches to the stick and is height-capped.

### Real-play pacing (round 6, item 6)

**How it was measured.** `PACING_DIST=<frozen build> node tools/review/pacing.mjs 130 docs/review/pacing-r6.json` plays from a fresh game through gameplay only:
- It never sets quest state.
- It now walks nav paths and reacts to the trader mention like a player following the hint.
- It does not follow the tutorial, so the tutorial crop is covered by `farm-check`, not here.

Times are in-game minutes at the default 24-minute day. **Every bot number is an upper bound:** the bot fights worse than a person (it only swings at targets within 3 m, so it can never hit a drone) and builds slowly. The human column is an **estimate, not a measurement**:
- **Night gate:** sleep is allowed from 19:00, about 11 real minutes after the 08:00 start.
- **Pre-night work:** the shelter and bed need to be done by then.
- **After the night:** the farm plots (one comes from the tutorial), a walk of about 250 m to the Residential Rows and back, and a fourth resident. The newcomer needs a spare bed and food stock, and arrives with a 40% chance per game hour.

| Milestone | Target | Round-5 bot (Run A / Run B) | **Round-6 bot (upper bound)** | Human (estimate, unconfirmed) | Verdict |
|---|---|---|---|---|---|
| First perk chosen | ≤ 5 min | 1.2 / 1.2 min | **1.4 min** | ~1 min | ✅ |
| Trader introduced (survivor mentions Odile) | ≤ 10 min | — | **4.1 min** (minute-4 fallback: the bot skips the tutorial) | 2–4 min (at the crafting step) | ✅ |
| First contact with Odile | ≤ 15 min | 35 / 103 min | **6.0 min** | 3–6 min | ✅ |
| First crop planted | ≤ 20 min | — | not measured (bot skips the tutorial) | ~10–15 min (tutorial step 14 of 18) | ✅ by `farm-check` |
| First night survived | 20–30 min | 22 / 22 min | **22.2 min** | 12–20 min | ✅ |
| **End of Act I** | **25–45 min** | 29 / 103 min | **62.4 min** | **~20–32 min** | ⚠ bot over; human estimate straddles the 25-min floor (see below) |
| First raid repelled | day 3–5 | 0 of 3 repelled | **61.5 min (day 4; wild raid, 4 hounds); 2 raids, 2 repelled, 0 lost** | — | ✅ |
| First district reboot | 35–60 min | not reached | **started at 105 min; not completed** (the bot died to drones 4 times while routing relays) | unconfirmed | ❌ bot (`reboot-check` proves the path; the fight is untested by a person) |
| First harvest | 45–75 min | none | not reached (the bot skips the tutorial crop) | ~100–110 min: the tutorial carrot takes 102 game hours, measured in `farm-check` | ❌ timing (logged below) |

**Steps the bot measured** (round 6; round-5 Run A in brackets):

| Step | Bot time |
|---|---|
| Strip for parts (6 scrap) | 23 s [22 s] |
| Gather timber (6) | 15 s [15 s] |
| Campfire | 35 s [30 s] |
| Crowbar | 4 s [2 s] |
| Lay four foundations | 4.6 min [3.1 min] |
| Raise walls (6) | 15.1 min [4.9 min] |
| Put a roof on it (4) | 18.6 min [9.1 min] |
| Bed + sleep through the night | 6.3 min [8.1 min] |
| Workbench + 2 farm plots | 5.5 min [2.9 min] |
| Reach the Residential Rows | 11.0 min [—] |
| Four residents | 0 s: arrivals had already happened |

**What this says.**
1. Act I's bot time (62 min) is dominated by the bot's building: walls plus roof took 34 min, against 14 min in Run A, because it gathers and re-paths for each piece. That says nothing about a person. The fixed floor for anyone is the night gate at about 11–12 minutes.
2. **Estimate risk:** a fast player who builds the shelter before dusk and gets an early newcomer could finish Act I in about 20 minutes, under the 25-minute floor. The four-resident step adds the spare bed and the arrival roll. **Unconfirmed.** If the device test shows under 25 minutes, the next lever is to make the 4th resident the Residential woman, arriving at the next dawn.
3. **Deaths audit** (15 bot deaths in 130 min; `deathLog` in `pacing-r6.json`):

   | Cause | Deaths | Notes |
   |---|---|---|
   | Patrol drones (8 direct, 2 bleed-outs after drone hits) | 10 | 8 at the downtown node during reboot attempts, 276 m out |
   | Thirst | 2 | The bot only drinks what it carries |
   | Raid units inside Haven | 2 | A crawler and a hound bite → bleed-out |
   | Bleed with no recent attacker | 1 | |

   - **No ambient-enemy death inside the 48 m safe zone.** The two Haven deaths were raid units, which the safe zone exempts by design.
   - The drone deaths are mostly a bot limit (it never attacks a drone).
   - The first node defence with drones is the most likely place a new person dies too. **Unconfirmed;** first item for the device test.

### Bugs found and fixed this round
- **Escape on a dialog** (trade, cards) closed it *and* opened the pause menu, because a raw keydown listener closed the dialog first. Fixed with `Input.consume`; screen hotkeys are consumed once too.
- **Town farmers harvested a crop the hour it ripened.** A player never saw their crop ripe, and a harvest reminder could never land.
- **"Bring Haven to three residents"** completed itself.
- **Quest objectives after the tutorial** had no beacon and no minimap marker.
- **Bundle:** a dynamic `import('three')` pulled in the whole library (+44 KB gzip). It is reverted, and the payload is 0.63 MB.
- **Layout** (measured before the fixes):
  - Jump × quick slot 4 (SE).
  - Meters × objective card (all three phones).
  - Top bar × clock (SE, 15 Pro Max).
  - Zoom target 41 px.
  - Objective buttons in the stick's thumb zone (15 Pro Max).
- **Crop names:** "Potatos" / "Ripe carrot" → a plural helper.

### Logged, not fixed
- **First harvest timing:** the tutorial carrot takes about 102 game hours (≈ 1.7 h of play) even watered. That is far past the 45–75 min target. Crop timings were not part of this round's brief; next lever: a fast tutorial crop, or growth bonuses for a tended first plot.
- **First node defence vs drones** (pacing deaths). Check on device whether a person can hold the node with starter gear; if not, use a smaller first wave or no drones in wave 1.
- **Bot survival:** thirst deaths are bot behaviour. It drinks only from its pack; it never boils water.

### Not confirmed without a real iPhone or human play
- Every layout number is Playwright emulation with emulated safe-area insets. Real notch and Dynamic Island rendering, the Home Screen PWA chrome and thumb comfort were **not** tested on a device.
- The human Act I time, first-node defence difficulty and first-raid difficulty for a person are estimates. The raid bar was set from a lead pipe and no armour; the bot cleared it without top-ups.
- How the death recap, the raid card and the crop line read at arm's length on an SE.

### Verification
- `npm run check`: typecheck; lint with 0 warnings; 112 sim + 37 game + 61 server tests; build; bundle 0.63 MB gzip (baseline 0.61, under the 10% guard); GLB ingest; secret scan clean.
- **Playwright, passing:**
  - feel, guide, systems-flow, grid-flow, raid-flow, defense-flow, walk, models-flow, audio-flow.
  - budget-tris: worst main pass 246k tris / 60 calls at medium (market).
  - Review checks: perks, rank, pack-step, smoke-check, restore, progress, enemies.
  - The six new round-6 checks.
- **`tests/smoke.mjs` fails "salvage a crate" in this container.** The live round-5 build fails it the same way here: this container's software GPU now renders ~2 fps at 1280×720, so a 20 s hold never finishes. All its other steps pass: load, move, clock, inventory, save/reload, draw calls, zero console errors. **The salvage step is unverified this round.** CI's live smoke does not salvage, and salvage is unchanged code (the six new checks salvage and hold E through the same input path in fast-sim time).
- The review checks' screenshot wait went from 30 s to 120 s for the same reason. Their assertions are unchanged.
- **Saves:** schema 4 with a v3 → v4 migration. Test: a frozen round-5 (v3) save loads; the tutorial index shifts only at or past the new step. Difficulty and the new crop fields are optional or already stored, so they need no migration.

### Deploy (main `1ced14f`)
- CI: "Deploy (Cloudflare)" run 27 succeeded: quality gates; Worker deploy; live smoke attempt 1/3 PASS. "Deploy fallback (GitHub Pages)" run 25 succeeded.
- Live smoke from this container:
  - Worker `https://dormant-grid.dg-server.workers.dev`: 14/14 pass, serving `index-LEydreZC.js`, the same as the local build.
  - Pages `https://qemmhd.github.io/DormantGrid` (`--offline`, no API there): 8/8 pass. Its strings bundle contains the round-6 text ("Reboot node", "Welcome trade").
- Saves: schema 4. Round-5 (v3) saves migrate, and the test loads the frozen v3 fixture.

### Remaining (ranked, after round 6)
1. **Device test** (`DEVICE_FEEL_TEST.md`, plus these):
   - Act I time for a person (target 25–45 min).
   - The first node defence vs drones with starter gear.
   - The first raid with a pipe.
   - Layout and legibility of the raid card, recap and crop line on SE / 13 / 15 Pro Max.
2. **First harvest timing:** the tutorial carrot ripens after ~1.7 h of play (target 45–75 min). Options: a quicker tutorial crop, or a tended-plot bonus.
3. **First node defence:** if the device test confirms it is too hard, use a smaller first wave or no drones in wave 1.
4. **P13 recorded audio:** files per `docs/asset-requests/`.
5. **Two-device co-op run** (`docs/review/COOP_TEST.md`).
6. **Bot quality** (review tooling only):
   - Attack drones in their dip.
   - Drink and boil water.
   - Build without re-pathing per piece.
