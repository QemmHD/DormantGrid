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

## Rubric

Feel-based items get two scores: **measured headless** / **needs real device**. "—" means I could not measure it.

### A. Visual quality and art direction — 3.5 / 10 (feel part: — / needs device)

**Characters**
- They are assembled from bevelled boxes. The head is a 0.20 × 0.24 × 0.22 m box with two 3.6 cm slit "eyes" (`render/character.ts:89-96`).
- There are no hands, no clothing folds and no face. At gameplay distance they read as blocky avatars, not weathered survivors (`shots/desktop-03-spawn-after-intro.png`). This is the main source of the "Roblox" read.

**Materials**
- Everything is flat vertex color on Lambert, so props and characters look like smooth plastic.
- Saturated orange cones and a bright red car sit on an otherwise muted palette (`shots/desktop-05`, `desktop-09`).
- The new facade patterns help at 5–15 m: brick, siding, corrugated (`shots/desktop-08-building-closeup-apartment.png`, `iphone-…-industrial`).
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

### E. Core loop — see the session section (measured)

<!-- SESSION -->

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

<!-- FINDINGS -->
