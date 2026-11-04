# Ranked fix plan (from docs/REVIEW.md)

**Order:** impact on a new player first, then cost. Items 1–6 are cheap and fix the first 10 minutes. Items 7–10 fix the "looks like Roblox" read and the payoff. Items 11+ are depth.

**Acceptance checks are runnable.**
- Automated checks: `node tools/review/accept.mjs <id>`.
- Before running them, refresh the evidence: `node tools/review/session.mjs 10` (or `30`) and `node tools/review/controls2.mjs`.
- Visual checks name the exact screenshot command and what must be true in the image. Device checks name the item in `DEVICE_FEEL_TEST.md` and the rating needed.
- Baseline today: **13/13 automated checks FAIL** (`node tools/review/accept.mjs`).

| Rank | Fix | Findings | Effort | Acceptance check (must pass) |
|---|---|---|---|---|
| 1 | **Unblock the first craft.** The marked first crate becomes a scrap source: add `mat.scrap 3–4` to crate yields or point the marker at a barrel. The craft step's hint says where scrap is ("barrels, signs, car panels"). The craft screen surfaces the tutorial recipe first. | #3, #22 | S | `accept.mjs P1-tutorial-scrap`: first craft ≤ 90 s in `session.mjs 10`. Also `shots.mjs` → `iphone-22-screen-craft.png` shows Crowbar as the first row while that tutorial step is active. |
| 2 | **Real smoke.** Pool smoke as camera-facing soft sprites (transparent, depthWrite off, alpha fade over life), separate from the opaque debris box pool. | #2 | S | `accept.mjs P2-smoke`. Also `shots.mjs` → `iphone-03-spawn-after-intro.png` shows no grey boxes above the cookfire. Device item 9 rated ≥ 4. |
| 3 | **Target what I'm looking at.** Score candidates by angle first (reject > 60° off camera forward, and anything behind), then distance. Building pieces only win when they're the closest thing within ±20° of the crosshair. | #4 | S | `accept.mjs P3-targeting`: wrong target ≤ 5% of 60 in `controls2.mjs`. Device item 7 rated ≥ 4. |
| 4 | **Threats you can see.** Raiders spawn at 25–35 m inside a cone toward the player, with a red edge-of-screen arrow per raider and a horn. First threat by minute 10: a scripted drone fly-by over Haven at dusk on day 1, plus one weak hound pack on the route to the first node. | #12, #15 | S | `accept.mjs P5-threat-timing`: first threat ≤ 600 s in `session.mjs 30`. Also `shots.mjs` → `iphone-20-raid.png` shows at least 1 raider or a threat arrow. |
| 5 | **The camera never loses the player.** Allow the camera to come to 0.5 m (not 0.9) and raise its height when pressed against a wall. Fade small props (no collider) that cross the camera→player segment. Keep the player visible above 25% opacity. | #5, #6 | M | `accept.mjs P4-camera-wall`: camera behind a wall ≤ 2% of spin frames. Also `shots.mjs` → `iphone-04-haven-overview.png` shows the player unobstructed. Device item 5 rated ≥ 4. |
| 6 | **Fix building in camp, and the shelter by minute 7.** Diagnose finding #29 (the bot's 6/6 placements failed): check the ghost validity reason near camp props. Show the real reason ("Need 2 more Scrap", "Blocked by tent"). Give each piece its own icon. | #21, #29 | S | `accept.mjs P7-first-build`: first placed piece ≤ 420 s in `session.mjs 10`. Also `shots.mjs` → `iphone-19-build-mode.png` shows a specific reason and 9 distinct icons. |
| 7 | **iPhone legibility pass.** Fit the menu title in the safe area. Make the clock subtitle at least 4.5:1 contrast. Make the map fill the screen height with labels ≥ 12 pt, add fog of war, and show a player arrow. Shrink the tutorial card to its title plus one line, expandable. | #13, #19, #20, #36, #37 | S | `shots.mjs` → `iphone-01-menu.png` shows the full title. `iphone-23-screen-map.png` map ≥ 300 CSS px tall with labels ≥ 12 px (measure in the DOM: `getComputedStyle` font-size on the map labels). Device item 8 rated ≥ 4. |
| 8 | **Characters stop reading as toys.** Rebuild the humanoid: a tapered torso, separate hands (mitten blocks), a face with brow, nose and jaw planes, layered clothing (jacket hem, collar, pockets), 3 body types, and hair silhouettes. Or import the `char.*` GLBs from the registry and drive them with the procedural rig. | #1 | L | Device item 18 (style) rated ≥ 4, plus a side-by-side `shots.mjs` → `desktop-03-spawn-after-intro.png` reviewed against STYLE_BIBLE: face visible, hands present, clothing silhouette differs per survivor. |
| 9 | **Materials and grime.** Add world-space grime and edge-wear on props and characters (the facade shader approach, reused), ground decals (oil, cracks, leaves), and desaturate the toy-bright props. | #1, #25 | M | `shots.mjs` → `desktop-05-downtown-street-dormant.png` shows ground breakup and no fully saturated props. Device item 18 ≥ 4. |
| 10 | **Restoration you can see.** Each state adds:<br>• **Stabilized:** cleared debris and patched windows<br>• **Powered:** street lights on, at night too<br>• **Inhabited:** survivors walking the restored streets, laundry lines, market stalls<br>• **Thriving:** planters, painted facades and music. | #7 | L | `shots.mjs` → `desktop-05` vs `desktop-06` differ in at least 4 visible ways (people, lights, props, plants). Count NPCs within 30 m in a restored district (state 4) ≥ 3. Add an assertion to `tools/review/shots.mjs` scene 6. |
| 11 | **Power means something.** Enforce `needsPower` for the Grid Workshop and turrets (powered district or generator), wire irrigation from restored Waterworks, and show the chain in the Ledger. | #11, #16 | S | `accept.mjs P9-power-gating` and `accept.mjs P10-irrigation`. |
| 12 | **A visible spine.** Add a perk screen (one point per level, 4 tracks) and a Town Rank bar listing the next 3 named unlocks. Show the 3 ending paths in the Journal as soon as the factions are met. | #8, #9 | M | `accept.mjs P8-perks-reachable` and `accept.mjs P12-endings-reachable`. Also `shots.mjs` → `screen-journal` lists Act IV choices. |
| 13 | **The town grows early.** Guarantee the first survivor arrival by minute 10–15 (an injured stranger event at the gate), then one per in-game day while beds exist. | #14 | M | `accept.mjs P6-new-survivor`: first new survivor ≤ 900 s in `session.mjs 30`. |
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
