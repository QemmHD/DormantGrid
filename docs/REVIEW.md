# DORMANT GRID — independent product review (2026-11-04)

Reviewed build: `main` @ `03343de` (v0.2.0, worldgen v2), the same code deployed to https://dormant-grid.dg-server.workers.dev.
Branch: `review/2026-11-04`. Review only: no game code, asset or deploy changes.

## How to read this

**Evidence labels**
- `shots/…` is a screenshot in `docs/review/shots/`.
- `controls*.json`, `session.json` and `content.json` are measured outputs in `docs/review/`.
- `path:line` is source code.

**Every number comes from headless Chromium with SwiftShader, not an iPhone.**
- Frame times are CPU-rendered. Use them only to compare tiers, never as phone performance.
- Anything that needs hands on glass is marked **needs real device**. Those items are in `docs/review/DEVICE_FEEL_TEST.md`.

**Reproduce**: every script is under `tools/review/`.
- `shots.mjs` and `shots-weather.mjs`: screenshots
- `controls.mjs` and `controls2.mjs`: feel measurements
- `session.mjs`: first-30-minutes bot
- `content.mjs`: content counts
- `weather-hours.mjs`: weather schedule

## Verdict

**4.5 / 10 today.** It is a technically solid, well-tested prototype with a real hook (reboot a district and watch it change). It is not yet a game that looks, feels or pays off like a studio survival title.

**Biggest gaps**
1. **The look reads as a blocky toy.**
   - Characters are built from about 24 bevelled boxes (`render/character.ts:69-140`). Smoke is opaque cubes (`render/fx.ts:55-57,157`).
   - Surfaces are flat plastic. The owner's own read is "looks like Roblox".
2. **The payoff loop is thin.** Restoring a district changes a wall tint and some window glow, and nothing else (`shots/desktop-05` vs `desktop-06`).
   - Progression has no visible spine: perks and endings exist in data but cannot be reached.
3. **The first ten minutes stall.** The tutorial's first salvage (a crate) gives no scrap, but the next step (crowbar) needs 6 scrap (`data/loot.ts:40`, `data/recipes.ts:25`).

## Scores at a glance

| | Area | Score | Feel part: headless / device |
|---|---|---|---|
| A | Visual quality and art direction | 3.5 | — / needs device |
| B | Atmosphere | 4 | — / needs device (sound) |
| C | Controls and game feel | 6 | 6 / needs device |
| D | Clarity | 5 | 5 / needs device |
| E | Core loop | 4 | 4 / needs device |
| F | Retention hooks | 3 | — / needs device |
| G | Player motivation | 4 | |
| H | Systems coherence | 4 | |
| I | Content volume | 5 | |
| J | Technical | 6.5 | — / needs device (iPhone) |
| | **Average** | **4.5** | |

## Rubric

Feel-based items get two scores: **measured headless** / **needs real device**. "—" means I could not measure it.

### A. Visual quality and art direction — 3.5 / 10 (feel part: — / needs device)

**Characters**
- They are assembled from bevelled boxes. The head is a 0.20 × 0.24 × 0.22 m box with two 3.6 cm slit "eyes" (`render/character.ts:89-96`).
- There are no hands, no clothing folds and no face. At gameplay distance they read as blocky avatars, not weathered survivors (`shots/desktop-03-spawn-after-intro.png`). This is the main source of the "Roblox" read.

**Materials**
- Everything is flat vertex color on Lambert, so props and characters look like smooth plastic.
- Saturated orange cones and a bright red car sit on an otherwise muted palette (`shots/desktop-05`, `desktop-09`).
- The new facade patterns help at 5–15 m: brick, siding, corrugated (`shots/desktop-08-building-closeup-apartment.png`; corrugated: `docs/quality/buildings-v2/industrial.png`).
- Doorways and unlit windows are flat black voids with no depth or frame shading (`shots/desktop-08`, `desktop-10`).

**Art direction ("muted, gritty, stylized; restored warmer")**
- Muted: met.
- Gritty: not met. No grime on props, no decals on the ground, and the ground at Haven is a flat grey plane (`shots/iphone-04-haven-overview.png`).
- Restored warmer: met only as a wall tint shift (`shots/desktop-14` vs `desktop-15` at night: restored windows glow warm, a real improvement).

**Specific defects**
- Smoke puffs are grey cubes floating above every fire (`shots/iphone-02`, `iphone-03`, `iphone-20`).
- Interiors have no ceiling from the third-person camera, and the exterior brick pattern continues inside (`shots/desktop-10-interior.png`).
- Lit shop windows read as beige cardboard in daylight (`shots/desktop-09`).

**What a 9 looks like**: characters with readable faces, hands and layered clothing silhouettes. Props with wear and decals. A ground plane with breakup. Restoration that visibly repaints streets.

### B. Atmosphere — 4 / 10

**Lighting and night**
- Night is the strongest moment: fire barrels, string lights and warm restored windows give Haven a lived-in glow (`shots/desktop-13-night-haven.png`, `desktop-15`).
- A dormant district at night is just dark, with no tension cues such as flicker, sparks or distant drone lights (`shots/desktop-14`).

**Weather**
- Fog reads well (`shots/desktop-w-fog.png`).
- Rain is thin white streaks, while the road stays dry and the sun still casts hard shadows (`shots/desktop-w-rain.png`). Sun intensity only drops to 45% at full cloud (`render/sky.ts:224`).
- On the iPhone tier the storm shot showed no rain streaks (`shots/iphone-w-storm.png`; unconfirmed, single frame).

**Sound**
- Every sound is synthesized, with no recordings: 36 SFX cases and generative music (`content.json` → `audio`).
- Whether that sounds alive: **needs real device** (the feel test checks it).

**Life**
- 3 survivors at Haven (`session.json` → `end.survivors`). Restored downtown has nobody in it (`shots/desktop-06`).

**What a 9 looks like**: ambient beds per district state (wind, birds returning, a radio), wet surfaces and dimmed sun in rain, and visible townsfolk moving into restored streets.

### C. Controls and game feel — 6 / 10 measured headless · — needs real device

**Responsiveness**
- Keyboard input reaches motion in **2 frames** in all 5 trials (`controls.json` → `keyboard`).
- Touch takes **5–8 frames**, but this includes CDP dispatch of two touch events per gesture (`controls.json` → `touch`). The real on-device figure is unconfirmed.
- Acceleration reaches 90% of walk speed in **0.16 s** and stops in **0.13 s** (analytic: `game/player.ts:86`; measured 8 and 6 frames). That is snappy.

**Camera**
- Touch turns **0.34°/px** on a slow drag and **0.47°/px** on a flick (`controls.json`). That is within the range of comfortable phone shooters.
- The mouse turns 0.22°/count and only after pointer lock (`input/input.ts:373`).

**Movement robustness**
- 48 wall-approach probes found **0 stuck, 0 sliding over 0.5 m, 0 falling through the ground** (`controls.json` → `probes`).

**Camera vs walls**
- With the player 0.8 m from a wall, 24 of 30 full camera spins pushed the camera behind the wall for about a third of the turn (`controls2.json` → `summary.wallSpin`). The minimum camera distance is 0.9 m (`game/camera.ts:109`).
- It renders cleanly because back faces are culled, but **the player model vanishes** (`shots/desktop-28-camera-wall-side.png`).
- Bushes and cars between camera and player neither fade nor block the camera (`shots/iphone-04`, `desktop-09`).

**Targeting**
- Standing 2 m from a prop and looking straight at it, the prompt picked a different object **17 of 60 times (28%)**.
- The wrong picks were floor or wall pieces at 0–0.3 m beside the player, and props up to 82° off-center (`controls2.json` → `ahead2m`).
- The score `d*(1.6-dot)` (`game/game.ts:832`) lets an object 0.6 m directly behind beat one 3 m directly ahead.

**Juice** (hitstop, shake, particles, sound): implemented per earlier passes. How it feels on glass: **needs real device**.

**What a 9 looks like**: a camera that never loses the player, a prompt that always names what you are looking at, and touch latency equal to keyboard latency.

### D. Clarity — 5 / 10 measured headless · — needs real device

**Strengths**
- An always-visible objective with Next? and Help (`shots/iphone-04`).
- Named meters and contextual action buttons (BREAK, TALK, LOOT).
- An off-screen arrow and a world marker.

**Problems**
- The menu title "DORMANT" is cut off at the top on iPhone landscape (`shots/iphone-01-menu.png`).
- The "Day 1 · Spring" line under the clock is grey on a grey sky and unreadable (every `shots/iphone-*`).
- Map district labels are about 6 CSS px on iPhone, and there is no fog of war (`shots/iphone-23-screen-map.png`).
- Build mode's invalid reason is just "materials", and all nine pieces share one cube icon (`shots/iphone-19-build-mode.png`).
- The craft list shows 2 recipes per screen on iPhone and opens on unaffordable items, not the crowbar the tutorial asks for (`shots/iphone-22-screen-craft.png`).
- During a raid, 14 s after arrival the raiders were not on screen and nothing pointed to them; only the action button turned red (`shots/iphone-20-raid.png`, `shots.json`: raiders 3).

**What a 9 looks like**: every label readable at arm's length, every "can't" saying what to do next, and threats always located on screen.

### E. Core loop — 4 / 10 measured headless · — needs real device

**The loops as built**
- **30 seconds:** walk to a prop, hold to break it (2.1–7.1 s per prop), and 2–6 items fly in (`session.json` → `log`, 18 salvages). The action → reward part is tight, with hitstop, shake, sound and chips. The "progress" part is weak: most props give materials you don't need yet.
- **5 minutes:** gather toward the next craft or piece, craft or build, then the objective advances. In practice this is a materials hunt. The crowbar needs 6 scrap (`data/recipes.ts:25`), but the tutorial's crate gives 0 scrap (`data/loot.ts:40`). By hand, scrap comes mainly from barrels (2–3 each), signs and rubble. The bot needed **3 barrels and 198 s of gathering** for one crowbar (`session.json`).
- **1 hour:** reach a district node, reboot it, defend it, and watch the district warm up, then repeat. The payoff is real at night (`shots/desktop-15`), but it is mostly a tint plus window glow (`shots/desktop-06`). Nothing new to do opens up, because powered stations are not wired (H).

**First-session milestones (bot, sim seconds)**
- The bot plays with real inputs: it holds W toward targets, holds E to salvage, and crafts and builds through the game API.
- Its walking is poor: 0.4 efficiency, with 19 "could not reach" failures. **Walk-heavy times are upper bounds.**

| Milestone | Bot time | Note |
|---|---|---|
| First move | 1 s | |
| First gather (crate) | 121 s | Two crates 14 m and 39 m away were "not reached" first, so a human is likely 10–30 s (estimate) |
| First craft (crowbar) | 320 s | Bottleneck: 6 scrap, and crates give none |
| First reward (quest step) | 321 s | Crafting the crowbar advanced "First Light" |
| First build | **not reached** | 6/6 placement attempts failed at Haven with enough scrap; cause unconfirmed (see Findings 29) |
| First survivor | 3 at start; talked at 1061 s | **No new survivor arrived in 30 min** (`end.survivors: 3`) |
| First threat | 1347 s (~22 min) | A drone at 30 m, only after walking toward the residential node. Haven has none by design |
| First damage | 1579 s | Inventory went 49 → 0 shortly after: the bot almost certainly died near the node (drop pile) |

**Gaps over 60 s with nothing meaningful to do**
- 10 gaps, all walking (`session.json` → `gapsOver60s`): 116, 121, 62, 174, 95, 144, 63, 72, 241 and 324 s.
- Discounting the bot's 0.4 walking efficiency, a human would still face **3–4 gaps of 60–120 s** of pure traversal or searching: finding scrap after the crowbar, the trip to the first node, and the post-death recovery (estimate).
- The bigger gap is structural: at 30 min the objective was "Build a campfire in Haven Lot" and the town had not changed.

**Meaningful decisions per 5 minutes: about 1 (estimate).** I counted choices whose outcome differs: what to craft, where to build, which district to push, survivor jobs. Picking the next prop to break doesn't count. In 30 minutes the bot faced 1 craft choice (crowbar), 3 objective changes, 1 travel choice, and no survivor-job or build trade-offs that mattered. The game does offer job assignment (`shots/iphone-24`), but nothing in the first 30 min makes it matter.

**What a 9 looks like**
- The first crowbar within 60 s, from a guaranteed-scrap first target.
- The first shelter by minute 5.
- The first survivor arrival by minute 10.
- The first node reboot, with something new to do, by minute 30.

### F. Retention hooks — 3 / 10 (feel part: — / needs device)

**Goals**
- Short goals are visible: the objective card, with numeric progress such as "(0/6)".
- Mid goals are weak: the next node and district exist on the map, but the objective chain is a 10-quest list. Act IV has a single quest (`content.json` → `quests.byAct`).
- Long goals are invisible:
  - The 6 endings are defined in `content/campaign.ts:63` but never referenced.
  - The 32 perks (`packages/sim/src/data/perks.ts:15`) have no screen: `grep -ri perk apps/game/src` finds nothing.
  - Town Rank exists (ledger: `shots/iphone-24-screen-ledger.png`) but isn't tied to visible unlocks.

**Variable rewards**
- Salvage yields are randomized ranges (`data/loot.ts`).
- Blueprints exist.
- There is no rarity, no surprise loot moment, and no daily event.

**Reasons to return tomorrow**
- Morning chores add eggs and milk to the stockpile (`game/town.ts:142-165`).
- Survivors keep working offline.
- Nothing is time-limited or anticipatory: no "the trader arrives at dawn" or "the raid is coming in 2 days".

**What a 9 looks like**: a visible next-unlock bar (Town Rank → named rewards), a perk choice every level, a daily Town Board with one special event, and an ending you can see on the horizon.

### G. Player motivation — 4 / 10

- **Autonomy:** high in space (go anywhere, salvage anything, build freely) but low in strategy. There are no perks to choose, and raider subtypes are collapsed to one behavior (`game/raids.ts:22-25`), so few tactical choices exist.
- **Mastery:** shallow.
  - Combat is light/heavy/roll against 5 visual enemy kinds (`content.json` → `enemyKindsClient`).
  - Building stability is a skill the game never asks you to test.
- **Purpose and relatedness:**
  - Survivors have names, traits and barks.
  - The Grid reboot is a good purpose beat. Not walked here; per `tests/grid-flow.mjs` it passes: beam, banner, lit windows.
  - The restored street is empty of the people you saved (`shots/desktop-06`).

**What a 9 looks like**: survivors visibly moving into restored districts, perks that change how you play, and enemies that demand different answers.

### H. Systems coherence — 4 / 10

**Links that work**
- Restoration reduces hostile spawns (`game/enemies.ts:259-262`) and raises survivor mood (`game/town.ts:121`).
- Raids take stockpile (`game/raids.ts` resolve).
- Coops and pens feed the stockpile (`game/town.ts:142-165`).
- Crops tick in the town sim.

**Links promised but not wired**
- Grid water → irrigation: the sim supports it (`survivors.ts:85,691`), but the client's context omits it (`game/town.ts:118-123`).
- Grid power → powered stations: `needsPower` on the Grid Workshop and turret (`data/pieces.ts:74,88`) is never checked anywhere (`grep -rn needsPower apps packages`).
- Perks → anything: unreachable.
- Factions → endings: unreachable.

**What a 9 looks like**: every system has an input and an output in another, and the player can see the chain (power → workshop → turret → raid defense).

### I. Content volume — 5 / 10

| Promised (GDD) | Ships (`content.json`) |
|---|---|
| 80–120 items | **109** ✓ |
| Workbench 1–3, campfire, kitchen, chem lab | All 7 stations, **66 recipes** ✓ |
| Snap pieces + stations + defenses | **30 build pieces** ✓ |
| 5 raider types + drones, bots, crawlers, heavies, hounds, boar | 11 enemy defs in the sim; the client renders and behaves as **5 kinds** (`game/enemies.ts:13`, `raids.ts:22-25`) |
| 4 perk tracks × ~8 | **32 defined, 0 reachable** |
| 4-act campaign + endings | **10 quests (3/3/3/1)**, endings unreachable |
| Livestock, hunting | 3 livestock defs. The client only has coop/pen dawn output; **no animals, no hunting** |
| Stealth | **none** (`grep -ri "stealth\|takedown" apps/game/src` → 0) |
| Districts | **9** ✓, 806 buildings (272 enterable), 21,370 props, 15 nodes |
| Audio | **36 synthesized SFX + generative music, 0 recorded files** |
| Tier B art | **0 assets** shipped |

**Exists in code or tests but not reachable in play** (verified by grep or reading the code):
- **Perks** (32): `packages/sim/src/data/perks.ts:15`, no client references.
- **Endings** (6): `content/campaign.ts:63`, never imported.
- **Raider subtypes and the heavy:** `game/raids.ts:22-25` map scout, brute, sniper, leader and heavy onto 2 kinds.
- **Boar:** rendered as a hound (`raids.ts:24`).
- **Irrigation from Grid water:** `survivors.ts:85,691`, not passed by `town.ts:118-123`.
- **Powered stations:** `needsPower` is never checked (`data/pieces.ts:74,88`).
- **Livestock animals, breeding and hunting:** sim data exists (`data/livestock.ts:15,22`); the client only has coop/pen dawn output.
- **Survivor events** (13 kinds, `content.json` → `survivorEventKinds`): they reach the player only as toasts or Town Board lines. *Not verified* whether every kind can trigger in play.
- **Fog of war on the map:** not implemented (`grep -rni "explored\|revealed" apps/game/src` → 0).

**What a 9 looks like**: every promised system reachable in play, about 2× enemy behaviors, a full Act IV, and recorded audio.

### J. Technical — 6.5 / 10 (iPhone: — / needs device)

**Strengths**
- Quality gates and a live smoke test (14/14 on the live URL).
- Versioned saves with migrations and tests.
- A triangle budget gate: medium tier main pass 290k downtown (`tests/budget-tris.mjs`).
- No page errors across 52 screenshots (`shots.json` → `pageErrors: []`).

**Frame time**
- SwiftShader p50/p95/worst in ms: low 233/467/483, medium 367/733/733, high 383/1167/1167 (`controls.json` → `frameMs`).
- These are only relative: medium costs about 1.6× low.
- With the shadow pass, medium downtown is **487k tris** (`budget-tris`), so shadows are the first iPhone risk.

**Co-op**: never verified with two live clients (WebSockets are blocked from this sandbox).

**iPhone**: fps, thermals, memory kills and audio unlock are all **needs real device**.

**What a 9 looks like**: a device report showing a stable 60 fps at medium downtown with no thermal throttle in 20 min, plus a two-phone co-op session.

## Gap analysis (from my knowledge, not measured)

| Game | The one thing it does here that DORMANT GRID does not yet |
|---|---|
| **Valheim** | Each biome changes the threat, materials and music together, so you *feel* stepping up a tier. Here district danger is a spawn-rate number, and the street looks the same. |
| **Subnautica** | Fear and wonder from readable spaces and sound. You hear something before you see it. Here threats are silent and off-screen (`shots/iphone-20-raid.png`). |
| **State of Decay 2** | Survivors are your game pieces: skills, relationships and death matter, and you switch to them. Here survivors are a ledger list with job buttons (`shots/iphone-24`). |
| **Frostpunk** | Every choice has a visible town-wide cost and a tension curve (a storm countdown). Here nothing is scarce enough to force a hard choice in the first 30 min (see session). |
| **RimWorld** | Emergent stories from events colliding (a raid during a sickness). Here the event kinds exist in the sim (`content.json` → `survivorEventKinds`), but they surface as toasts, not situations. |
| **Stardew Valley** | Tomorrow is always better: crops ripen, shops restock, an event is on the calendar. Here there is no calendar and no anticipation hook. |

## Findings (unfiltered, then ranked)

Every issue found, unfiltered. Columns: **Impact** = on a new player (Blocker / Major / Minor). **Effort** = S (≤1 day) / M (≤1 week) / L (more).

| # | Where | What is wrong | How to see / reproduce | Impact | Effort |
|---|---|---|---|---|---|
| 1 | `render/character.ts:69-140` | Characters are about 24 bevelled boxes with slit eyes and no hands or face. Reads as a blocky avatar ("looks like Roblox") | `shots/desktop-03-spawn-after-intro.png` | Major | L |
| 2 | `render/fx.ts:55-57,157` | Smoke uses opaque, lit 0.35–0.6 m boxes, so grey cubes tumble above every fire | `shots/iphone-02`, `iphone-03`, `iphone-20` (cubes near the tent and barrels) | Major | S |
| 3 | `data/loot.ts:40`, `data/recipes.ts:25` | The tutorial's first salvage (crate) gives no scrap, but the next step (crowbar) needs 6, and there is no hint where scrap comes from | `node tools/review/session.mjs 10` → first craft at 320 s after 198 s of gathering | Major | S |
| 4 | `game/game.ts:832` | Target score `d*(1.6-dot)` picks the wrong object 28% of the time; something 0.6 m behind beats something 3 m ahead | `node tools/review/controls2.mjs` → `ahead2m.wrong 17/60` | Major | S |
| 5 | `game/camera.ts:109`, near-fade | With the player within about 1 m of a wall, the camera goes inside it (min 0.9 m) and the player model fades out completely | `controls2.json` wallSpin 24/30; `shots/desktop-28-camera-wall-side.png` | Major | M |
| 6 | Camera collision ignores props without colliders | Bushes, and in one case a car, between camera and player hide the player | `shots/iphone-04-haven-overview.png`, `desktop-09` | Major | M |
| 7 | Restoration visuals | A restored district only changes facade tint, lit windows and planters. No people, props, plants or street lights, against GDD pillar 1 | `shots/desktop-05` vs `desktop-06`; `desktop-14` vs `desktop-15` | Major | L |
| 8 | `packages/sim/src/data/perks.ts:15` | 32 perks are defined; no client screen or code references them, so they are unreachable | `grep -rni perk apps/game/src` → 0 | Major | M |
| 9 | `content/campaign.ts:63` | 6 endings are defined and never referenced. Act IV has 1 quest | `grep -rn "ENDINGS" apps/game/src`; `content.json` quests.byAct | Major | L |
| 10 | `game/raids.ts:22-25`, `game/enemies.ts:13` | 11 sim enemy types collapse to 5 client kinds: scout/brute/sniper/leader all become 'raider', heavy becomes 'bot', boar becomes 'hound' | Read the KIND map; `content.json` | Major | M |
| 11 | `data/pieces.ts:46,74,88` | `needsPower` is never checked, so the Grid doesn't gate the Grid Workshop or turrets ("powered stations unlock" is missing) | `grep -rn needsPower apps packages` → data only | Major | S |
| 12 | Raid spawn (`game/raids.ts:104-128`, radius at :121) | Raiders spawn 45–60 m out; 14 s after arrival none were on screen and nothing pointed to them | `shots/iphone-20-raid.png` (`shots.json`: raiders 3) | Major | S |
| 13 | iPhone map (`shots/iphone-23`) | The map image is about 240 CSS px, district labels about 6 CSS px; unreadable. No fog of war (GDD §15) | Open Map on iPhone | Major | S |
| 14 | Survivors | No new survivor arrived in 30 min; the town doesn't grow early | `session.json` `end.survivors: 3` | Major | M |
| 15 | First threat | About 22 min before any threat (`session.json`), so there's no tension in the first act | Session milestones | Major | S |
| 16 | `game/town.ts:118-123` | Grid water → irrigation is supported by the sim (`survivors.ts:85,691`) but never passed by the client | Read `ctx()` | Minor | S |
| 17 | Doorways and unlit windows | Flat black voids with no depth, frame shading or interior hint | `shots/desktop-08`, `desktop-10` | Minor | S |
| 18 | Interiors | No ceiling from the 3rd-person camera; exterior brick continues inside; lit like outdoors | `shots/desktop-10-interior.png` | Major | M |
| 19 | Menu on iPhone landscape | The "DORMANT" title is cut off at the top | `shots/iphone-01-menu.png` | Minor | S |
| 20 | HUD clock | "Day N · Season" is grey on grey and unreadable | Any `shots/iphone-*` | Minor | S |
| 21 | Build mode | Invalid reason is just "materials"; one cube icon for all 9 pieces; dim cost text; the bar covers about 30% of the screen | `shots/iphone-19-build-mode.png` | Minor | S |
| 22 | Craft screen on iPhone | 2 recipes per screen; opens on unaffordable items; the crowbar isn't surfaced during the crowbar step | `shots/iphone-22-screen-craft.png` | Minor | S |
| 23 | Weather: rain | Road stays dry; hard sun shadows stay (sun 45% at full cloud, `render/sky.ts:224`) | `shots/desktop-w-rain.png` | Minor | S |
| 24 | Weather: storm on medium | No rain streaks visible (unconfirmed, single frame) | `shots/iphone-w-storm.png` | Minor | S |
| 25 | Lit windows in daylight | Read as flat beige boards | `shots/desktop-06`, `desktop-09` | Minor | S |
| 26 | Haven sign | Text renders mirrored from behind ("H3UAH") | `shots/iphone-04` | Minor | S |
| 27 | Survivors vs player | A survivor walks through the player's body (no avoidance) | `shots/iphone-03-spawn-after-intro.png` | Minor | M |
| 28 | Audio content | 0 recorded files; all 36 SFX synthesized, music generative | `content.json` → audio | Major (atmosphere) | M |
| 29 | Build placement in camp | The bot's 6/6 placements at spawn+8 m failed with enough scrap; earlier the build shot showed a red ghost near camp props. Cause unconfirmed | `session.json` log "place … now 0"; `shots/iphone-19` | Major if real for humans (unconfirmed) | S to diagnose |
| 30 | Livestock and hunting | Livestock is only coop/pen dawn eggs and milk (`game/town.ts:142-165`); no animals, feeding or breeding; no hunting | Read the code; `content.json` | Minor | L |
| 31 | Stealth | Not implemented (GDD §13) | `grep -rni "stealth\|takedown" apps/game/src` → 0 | Minor | L |
| 32 | Shadow pass on medium | Downtown 290k main-pass tris become 487k with shadows | `node tests/budget-tris.mjs` | Major risk on device (unconfirmed) | M |
| 33 | Touch latency | 5–8 frames versus keyboard 2 (part is CDP harness overhead; unconfirmed) | `controls.json` touch vs keyboard | Unknown, needs device | — |
| 34 | `game/game.ts:1798`, `scanTargets` | Targets rescan every 0.1 s and allocate a new Vector3 per candidate in the hot path (CLAUDE.md: no per-frame allocations) | Read `scanTargets` (`game.ts:823-880`) | Minor | S |
| 35 | Mouse look | Does nothing until you click for pointer lock (`input/input.ts:373`); fine, but the first second feels dead | Desktop: move the mouse before clicking | Minor | S |
| 36 | Tutorial panel on iPhone | Covers about 25% of the screen at top-left | `shots/iphone-02` | Minor | S |
| 37 | Toast contrast | "Soaked to the skin…" is low-contrast at the right edge | `shots/desktop-w-rain.png` | Minor | S |
| 38 | Weather shown on day 0 | Day 0 is forced clear (`game.ts:1768`), so a first session never sees weather (by design; noted) | `node tools/review/weather-hours.mjs` | Minor | S |
| 39 | Tier B art | 0 assets shipped; the pipeline is unused | `content.json` | Minor (pipeline ready) | — |
| 40 | Co-op | Never verified with two live clients | PROGRESS / KNOWN_ISSUES | Unknown | M |

### Ranked (by impact on a new player × how cheaply it moves the score)

1. **#3 tutorial scrap gap**: Major, S. The first 5 minutes stall on it.
2. **#2 cube smoke**: Major, S. Visible in the first frame of every session.
3. **#4 wrong target**: Major, S. It undermines the core verb (salvage).
4. **#12 + #15 raid and threat legibility, and threat timing**: Major, S.
5. **#5 + #6 camera loses the player**: Major, M.
6. **#1 characters read as blocky toys**: Major, L. The single biggest "looks like Roblox" cause.
7. **#7 restoration payoff is only a tint**: Major, L. The game's core promise.
8. **#8 + #9 + #11 + #10 unreachable progression and systems** (perks, endings, power gating, enemy variety): Major, M–L.
9. **#13 + #21 + #22 + #19 + #20 iPhone legibility**: Major/Minor, S each.
10. **#14 town doesn't grow early**: Major, M.
11. **#18 interiors**, **#28 audio**, **#23–25 weather and lighting**: Major/Minor, M.
12. Everything else (Minor).

## What I could not confirm

- **Anything on a real iPhone:**
  - fps, thermals, memory kills
  - touch feel and latency
  - audio unlock and quality
  - PWA install and resume
  - These are covered in `docs/review/DEVICE_FEEL_TEST.md`.
- **Why the bot's build placements failed** (#29): I didn't confirm whether a human hits it. Looked at: `session.json` log, `shots/iphone-19`.
- **Human time-to-milestone:** the bot walks at 0.4 efficiency, so its walk-heavy times are upper bounds.
- **Rain on the medium tier** (#24): a single frame.
- **The reboot payoff in motion** (beam, banner, light ripple): not re-walked in this review. `tests/grid-flow.mjs` passed earlier the same day.
- **Co-op**: WebSockets are blocked from this sandbox.
