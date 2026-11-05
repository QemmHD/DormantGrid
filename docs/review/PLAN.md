# Ranked fix plan (from docs/REVIEW.md)

**Order:** impact on a new player first, then cost. Items 1–6 are cheap and fix the first 10 minutes. Items 7–10 fix the "looks like Roblox" read and the payoff. Items 11+ are depth.

**Acceptance checks are runnable.**
- Automated checks: `node tools/review/accept.mjs <id>`.
- Before running them, refresh the evidence: `node tools/review/session.mjs 10` (or `30`) and `node tools/review/controls2.mjs`.
- Visual checks name the exact screenshot command and what must be true in the image. Device checks name the item in `DEVICE_FEEL_TEST.md` and the rating needed.
- Baseline at review (2026-11-04): **0/13 pass**.
- **After round 3 (2026-11-05): 7/13 pass.** P1–P7 pass; P8–P13 were out of scope this round. Output is in "Round 3 status" below.

| Rank | Fix | Findings | Effort | Acceptance check (must pass) |
|---|---|---|---|---|
| 1 | ✅ DONE r3 — **Unblock the first craft.** The marked first crate becomes a scrap source: add `mat.scrap 3–4` to crate yields or point the marker at a barrel. The craft step's hint says where scrap is ("barrels, signs, car panels"). The craft screen surfaces the tutorial recipe first. | #3, #22 | S | `accept.mjs P1-tutorial-scrap`: first craft ≤ 90 s in `session.mjs 10`. Also `shots.mjs` → `iphone-22-screen-craft.png` shows Crowbar as the first row while that tutorial step is active. |
| 2 | ✅ DONE r3 — **Real smoke.** Pool smoke as camera-facing soft sprites (transparent, depthWrite off, alpha fade over life), separate from the opaque debris box pool. | #2 | S | `accept.mjs P2-smoke`. Also `shots.mjs` → `iphone-03-spawn-after-intro.png` shows no grey boxes above the cookfire. Device item 9 rated ≥ 4. |
| 3 | ✅ DONE r3 — **Target what I'm looking at.** Score candidates by angle first (reject > 60° off camera forward, and anything behind), then distance. Building pieces only win when they're the closest thing within ±20° of the crosshair. | #4 | S | `accept.mjs P3-targeting`: wrong target ≤ 5% of 60 in `controls2.mjs`. Device item 7 rated ≥ 4. |
| 4 | 🟡 PARTIAL r3 (first threat; raid spawn distance/arrows not done) — **Threats you can see.** Raiders spawn at 25–35 m inside a cone toward the player, with a red edge-of-screen arrow per raider and a horn. First threat by minute 10: a scripted drone fly-by over Haven at dusk on day 1, plus one weak hound pack on the route to the first node. | #12, #15 | S | `accept.mjs P5-threat-timing`: first threat ≤ 600 s in `session.mjs 30`. Also `shots.mjs` → `iphone-20-raid.png` shows at least 1 raider or a threat arrow. |
| 5 | ✅ DONE r3 — **The camera never loses the player.** Allow the camera to come to 0.5 m (not 0.9) and raise its height when pressed against a wall. Fade small props (no collider) that cross the camera→player segment. Keep the player visible above 25% opacity. | #5, #6 | M | `accept.mjs P4-camera-wall`: camera behind a wall ≤ 2% of spin frames. Also `shots.mjs` → `iphone-04-haven-overview.png` shows the player unobstructed. Device item 5 rated ≥ 4. |
| 6 | ✅ DONE r3 (finding #29 was the bot, not the game) — **Fix building in camp, and the shelter by minute 7.** Diagnose finding #29 (the bot's 6/6 placements failed): check the ghost validity reason near camp props. Show the real reason ("Need 2 more Scrap", "Blocked by tent"). Give each piece its own icon. | #21, #29 | S | `accept.mjs P7-first-build`: first placed piece ≤ 420 s in `session.mjs 10`. Also `shots.mjs` → `iphone-19-build-mode.png` shows a specific reason and 9 distinct icons. |
| 7 | **iPhone legibility pass.** Fit the menu title in the safe area. Make the clock subtitle at least 4.5:1 contrast. Make the map fill the screen height with labels ≥ 12 pt, add fog of war, and show a player arrow. Shrink the tutorial card to its title plus one line, expandable. | #13, #19, #20, #36, #37 | S | `shots.mjs` → `iphone-01-menu.png` shows the full title. `iphone-23-screen-map.png` map ≥ 300 CSS px tall with labels ≥ 12 px (measure in the DOM: `getComputedStyle` font-size on the map labels). Device item 8 rated ≥ 4. |
| 8 | ✅ DONE r3 (procedural rebuild; GLB path still open) — **Characters stop reading as toys.** Rebuild the humanoid: a tapered torso, separate hands (mitten blocks), a face with brow, nose and jaw planes, layered clothing (jacket hem, collar, pockets), 3 body types, and hair silhouettes. Or import the `char.*` GLBs from the registry and drive them with the procedural rig. | #1 | L | Device item 18 (style) rated ≥ 4, plus a side-by-side `shots.mjs` → `desktop-03-spawn-after-intro.png` reviewed against STYLE_BIBLE: face visible, hands present, clothing silhouette differs per survivor. |
| 9 | 🟡 PARTIAL r3 (muted props, sheen, contact shadows; no ground decals yet) — **Materials and grime.** Add world-space grime and edge-wear on props and characters (the facade shader approach, reused), ground decals (oil, cracks, leaves), and desaturate the toy-bright props. | #1, #25 | M | `shots.mjs` → `desktop-05-downtown-street-dormant.png` shows ground breakup and no fully saturated props. Device item 18 ≥ 4. |
| 10 | **Restoration you can see.** Each state adds:<br>• **Stabilized:** cleared debris and patched windows<br>• **Powered:** street lights on, at night too<br>• **Inhabited:** survivors walking the restored streets, laundry lines, market stalls<br>• **Thriving:** planters, painted facades and music. | #7 | L | `shots.mjs` → `desktop-05` vs `desktop-06` differ in at least 4 visible ways (people, lights, props, plants). Count NPCs within 30 m in a restored district (state 4) ≥ 3. Add an assertion to `tools/review/shots.mjs` scene 6. |
| 11 | **Power means something.** Enforce `needsPower` for the Grid Workshop and turrets (powered district or generator), wire irrigation from restored Waterworks, and show the chain in the Ledger. | #11, #16 | S | `accept.mjs P9-power-gating` and `accept.mjs P10-irrigation`. |
| 12 | **A visible spine.** Add a perk screen (one point per level, 4 tracks) and a Town Rank bar listing the next 3 named unlocks. Show the 3 ending paths in the Journal as soon as the factions are met. | #8, #9 | M | `accept.mjs P8-perks-reachable` and `accept.mjs P12-endings-reachable`. Also `shots.mjs` → `screen-journal` lists Act IV choices. |
| 13 | ✅ DONE r3 (scripted first arrival at 8:00) — **The town grows early.** Guarantee the first survivor arrival by minute 10–15 (an injured stranger event at the gate), then one per in-game day while beds exist. | #14 | M | `accept.mjs P6-new-survivor`: first new survivor ≤ 900 s in `session.mjs 30`. |
| 14 | **Enemy variety from existing data.** Give scout, brute, sniper and leader distinct silhouettes and behaviors (flank, tank, ranged, buff). Make the heavy a distinct machine and the boar a charging animal. | #10 | M | `accept.mjs P11-enemy-variety`: at least 9 client kinds. Device item 14 rated ≥ 4. |
| 15 | **Interiors.** Draw ceilings when the camera is inside, use interior wall materials (plaster or wallpaper), add a warm or dark interior light, and add 3 clutter props per room. | #18, #17 | M | `shots.mjs` → `desktop-10-interior.png` shows a ceiling, a non-brick inner wall and clutter. |
| 16 | **Sound of a place.** Add recorded or curated ambience beds per district state (wind, birds returning, distant machinery) and real impact layers for wood, metal and glass, alongside the synthesized ones. | #28 | M | `accept.mjs P13-recorded-audio`: at least 10 files ingested via `npm run assets:ingest`. Device item 11 rated ≥ 4. |
| 17 | **Weather that changes the world.** Rain darkens and adds sheen to ground and roads, sun shadows fade at full cloud (sun ≤ 20%), and puddle decals appear. Check that rain streaks render on medium. | #23, #24 | S | `shots-weather.mjs` → `desktop-w-rain.png` shows darker ground and no hard shadows. `iphone-w-storm.png` shows streaks. |
| 18 | **Shadow cost on medium.** Measure on device; if needed, use cascaded or limited-range shadows, or shadows for characters and props only. | #32 | M | `node tests/budget-tris.mjs` stays green, and the device report at medium downtown shows ≥ 55 fps p50 (device item 12). |
| 19 | **Small polish.** Mirror-safe sign text, survivor avoidance around the player, no allocations in `scanTargets`, mouse look hint before pointer lock, and daylight-suppressed window emission. | #26, #27, #34, #35, #25 | S each | `shots.mjs` → `iphone-04` shows the sign readable or blank from behind. Code review: `grep -n "new THREE.Vector3" apps/game/src/game/game.ts` shows no hits inside `scanTargets` (`game.ts:823-880`). |
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
