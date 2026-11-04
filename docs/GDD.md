# DORMANT GRID: Game Design Document

Working title: DORMANT GRID. Platforms: iPhone Safari 17+ installed to the Home Screen (landscape PWA) and desktop browsers. Genre: third-person, stylized, open-world survival and town-rebuilding game, with optional 2–4 player co-op.

## 1. Pitch

The city's management system, the Grid, collapsed. Its drones and security machines still patrol the streets, and the human factions fight over its control nodes. You and a growing community of survivors reboot the Grid one district at a time: power, water, roads and lights. Every reboot turns a dangerous ruin into a warm, safer neighborhood that people live in. Survivors live their own lives (they scavenge, farm and build), and you lead them rather than babysit them.

## 2. Design pillars

1. **Restoration you can see and feel.** Each district moves through five states: Ruin, Stabilized, Powered, Inhabited and Thriving. Every state changes the light color, props, plant life, survivor density, music and ambience. Restored areas are safer as well as nicer.
2. **A town that lives without you.** Survivors eat, sleep, socialize, scavenge, farm, build, and react to danger on their own.
3. **A satisfying teardown-to-rebuild loop.** Everything in the ruins can be salvaged, and salvage feeds building. Breaking things feels great.
4. **Readable, tense danger.** Travel and preparation are part of the game. Progress is gated by tangible keys in the world (Grid control nodes), not by arbitrary levels. Failure teaches the player something instead of only punishing them.
5. **Mobile-first polish.** Thumb-friendly, quick to resume, stable within iPhone memory, and still beautiful.

## 3. Core loop

1. Scavenge and deconstruct.
2. Carry the materials home and craft.
3. Build up the base and upgrade the district.
4. Reboot a control node.
5. Unlock tech, safety and new survivors.
6. Push into a harder district and answer faction events.

Then the loop repeats.

**Session shapes**
- A 5-minute session: quick scavenging run, queue crafts, assign survivors, read the Town Board.
- A 30-minute session: an expedition into a new district, a node reboot and defense, then base upgrades.

## 4. Tone

Gritty, with subtle gore: hit sparks and blood decals, no dismemberment. Hopeful whenever you restore something. Restored areas are warm and safe. The outer districts and machine zones are darker and tenser. Writing is specific, human, a little dry, and never generic.

## 5. World

### 5.1 Layout

The town is about 1.2 km × 1.2 km (1,216 m, as 19 × 19 cells of 64 m) and is fully deterministic from its seed. A river and a rail line cut across it.

| District | Danger | Character | Signature loot | Threats |
|---|---|---|---|---|
| Haven Lot | 0 | Starting shelter at the edge of town | Basic salvage | None (tutorial) |
| Outskirts | 1 | Farmland, woods, wildlife | Timber, organics, seeds | Hounds, boar |
| Residential Rows | 1 | Houses, yards, gable roofs | Cloth, food, furniture | Scavenger raiders, drones |
| Market Row | 2 | Shops, stalls, awnings | Food, plastic, trade goods | Raiders, drones |
| Old Downtown | 3 | Offices, apartments, plazas | Wiring, glass, electronics | Guard bots, raiders |
| Hospital Campus | 3 | Clinics and wards | Medicine, chemicals | Crawler swarms |
| Waterworks | 3 | Pumps, tanks, pipes | Pipe, scrap, valves | Guard bots, drones |
| Rail Depot | 3 | Yards, sheds, containers | Steel, scrap | Ashline Reavers |
| Industrial Yard | 4 | Factories and warehouses | Tools, chemicals, heavy parts | Custodian heavies |

### 5.2 Generation pipeline (runs in a worker)

1. Place district regions around the river and rail line.
2. Lay arterial and local roads with jitter, plus parks.
3. Subdivide lots.
4. Place buildings from each district's modular kit.
5. Place props and loot from lot-type tables.
6. Generate the outskirts: fields, woods and wildlife.

### 5.3 Streaming

- Stream a ring of about three cells (64 m each) around the player, with LOD rings and a cheap far skyline beyond.
- Chunk building is time-sliced so it never causes a hitch.
- Static geometry is merged per chunk, and repeated props are instanced.

### 5.4 Interiors

About a third of buildings can be entered. Their interiors come from a few room templates dressed to look lived-in. The other buildings are convincing shells.

### 5.5 Time and weather

- **Day/night:** an in-game day lasts about 24 real minutes (adjustable).
- **Weather:** clear, overcast, rain, fog and storm.
- **Seasons:** spring, summer, autumn and winter, 7 days each by default.

Weather drives atmosphere, farming (rain waters crops, frost damages them, drought dries soil) and survivor mood. There are no temperature or radiation meters.

## 6. Gathering and deconstruction

- **Props** break into materials: furniture, cars, signs, trees, rocks, rubble, barrels and more.
- **Tool tiers** gate speed and yield: hands, crowbar, axe, pickaxe, saw, cutting torch. The table below shows what each tool cuts best.

  | Tool | Best at |
  |---|---|
  | Hands | Small props, trash, cloth |
  | Crowbar | Crates, doors, fixtures, cars (panels) |
  | Axe | Trees, timber walls, furniture |
  | Pickaxe | Rock, brick, concrete, rubble |
  | Saw | Beams, floors, roofs (clean timber yield) |
  | Torch | Steel beams, vehicles (full), containers, Grid hardware |

- **Buildings** come apart piece by piece: walls, floors, roofs, doors, windows, beams, pipes and fixtures. Removing a support collapses the pieces that depend on it into debris pickups. This uses simple support rules, not physical fracture.
- **Materials:** scrap metal, timber, brick/concrete, glass, cloth, wiring/electronics, plastic, chemicals and organics. Yields vary by district. Deconstruction can reveal blueprints.
- **Feel:**
  - A hold-to-deconstruct ring.
  - 2–4 frames of hitstop, scaled by weight, plus scaled camera shake.
  - Pooled dust and debris particles.
  - Layered, pitch-varied sound.
  - Materials fly to the player with a magnet pickup and a chime.
- **Safety:** restored and claimed buildings ask for confirmation before teardown.
- **Carrying:** carry weight and an inventory grid. Storage is reachable from nearby stations.

## 7. Crafting and tech

- Workbench tiers 1–3, plus a campfire, kitchen and chem lab. There are 80–120 items at ship, covering tools, weapons, ammo, medicine, food, building parts, traps and defenses.
- Blueprints come from deconstruction, district reboots and faction reputation.
- The crafting UI is searchable and filterable by category, with large tap targets. It shows "can craft", "missing" and "locked" states, and lets you queue crafts.

## 8. Base building

- **Pieces:** modular snap pieces (foundation, wall, doorway, window wall, floor, roof, stairs, fence) and stations (storage, bed, workbench, kitchen, farm plot, water and power hookups, defenses).
- **Placement preview:** a ghost preview tinted green (valid) or red (invalid). Pieces snap to a 2 m grid and to neighboring pieces.
- **Stability (0–100):** foundations on the ground are 100. Each piece connected away from the ground loses stability by tier. Pieces below 10 refuse placement or collapse when their support is removed.
- **Material tiers:** scrap, timber, brick/concrete, reinforced. Higher tiers have more HP, hold up longer spans, and resist raids better.
- **Touch controls:** an aim reticle plus Place, Rotate and Cancel buttons. Placement never requires precise dragging.
- **Survivors** can be assigned to build, repair and haul.

## 9. The Grid (the unique hook)

- Each district has 1–3 control nodes guarded by machines and sometimes by factions.
- **Reboot sequence:**
  1. Clear the guards.
  2. Route power by closing 3 breakers in the right order (the clues are on the node).
  3. Hold-to-sync, which takes about 6 seconds and is interruptible.
  4. Defend the node through a 60–90 second wave.
- **Effects of a reboot:**
  - Lights ripple on street by street, and water pumps start working.
  - Powered stations unlock, and hostile spawns stop inside the district's safe radius.
  - District services open: a clinic, market or workshop.
  - Town Rank rises.
  - The district advances one restoration state.
- **Machines:**
  - Patrol drones spot you and call others.
  - Guard bots are slow and tanky.
  - Swarm crawlers come in packs.
  - Custodian heavies are elite encounters.

## 10. Survivors (autonomous life sim)

- The town holds 12 survivors early on and up to 40 late in the game. Each survivor has:
  - A name, a modular appearance and two traits.
  - Stats from 1 to 10: Strength, Dexterity, Intellect, Charm and Grit.
  - Skills that gain XP: Farming, Scavenging, Building, Cooking, Combat, Medicine and Engineering.
  - Mood, loyalty, a home bed and a daily schedule.
- **They run themselves.** They eat and sleep, and they socialize at fires and tables. They pick jobs by skill and by the town's **Needs Board** (food, materials, defense, construction). The player never has to feed them.
- They go on scavenging runs to safer districts, reveal the map, and make small improvements inside zones the player has approved. They flee or guard when danger appears.
- **Commands:** tap a survivor to assign a job (Farm, Gather, Guard, Build, Haul, Cook, Heal, Scavenge Run). You can also set zone priorities, give a direct order, or take them along as a temporary companion.
- **Simulation:** survivors far from the player use a cheap statistical model. Near the player they path for real. The two reconcile smoothly so nobody pops in.
- **Events:** arrivals, friendships, conflicts, and injuries that need a rescue. Permadeath is off by default and available as a toggle. Survivors bark short lines and have small branching conversations with distinct personalities.

## 11. Player survival

- **Meters:** hunger, thirst, stamina and sleep. Health is separate.
- **Conditions:**
  - Bleeding: treat with a bandage.
  - Fracture, which causes a limp: treat with a splint.
  - Sickness: caused by bad water or spoiled food. Treat with medicine and rest.
  - Infection: caused by dirty wounds. Treat with antiseptic.
  - Buffs: well-fed and rested.
- **Death:** you respawn at your last bed or at Haven. Your carried items stay in a drop pile you can recover, guarded by whatever killed you. It is fair, not cruel, and the death screen tells you what got you and why.

## 12. Farming, food, hunting

- **Crops:**
  - Each crop has a season, soil nutrients and moisture.
  - You plant and water, and crops show 4 visibly distinct growth stages.
  - Fertilizer, crop rotation bonuses and weather effects all matter.
  - Irrigation connects to Grid water.
- **Livestock** (chickens, goats, pigs): feeding, breeding and products (eggs, milk, meat).
- **Hunting:** hunting and trapping in the Outskirts, then butchering.
- **Cooking:** recipes at campfires and kitchens. Food has a quality level and a nutrition group (grain, vegetables, protein, fruit, sweet); a varied diet grants buffs. Preservation (smoking, canning, a root cellar) holds off spoilage timers.

## 13. Combat and threats

- **Melee:** light and heavy attacks, dodge (with i-frames), stagger, and a stamina cost.
- **Ranged:** crafted bow, crossbow, nail gun and scrap rifle, with scarce ammo.
- **Stealth:** noise and light visibility, and takedowns from behind.
- **Traps and defense:** traps, walls, turrets, alarms, and survivor guards.
- **Enemies:**
  - Human raiders in five types (grunt, scout, brute, sniper, raid leader), playing roles: flank, grab loot, retreat.
  - Machines: drones, guard bots, crawlers, heavies.
  - Wildlife: hound packs and charging boars.
- **Raids** are telegraphed: a warning on the Town Board and a horn, then an arrival window. Their targets depend on pressure and reputation, and they resolve fairly.
- **Difficulty:** presets Chill, Standard and Hard, plus individual modifiers.

## 14. Progression and factions

- **Town Rank 1–10:** a composite of population, restored districts, infrastructure and defense. It unlocks tech tiers, recipes, building tiers and the survivor cap.
- **Perks:** four tracks (Scavenger, Builder, Fighter, Provider), about 8 perks each.
- **Factions:**
  - **Hearth Compact:** your survivors and settlers.
  - **Ashline Reavers:** raiders who take by force and sell salvage.
  - **Meridian Guild:** scavenger-engineers who want Grid access for profit. They trade and offer contracts.
  - **The Custodians:** the Grid's remaining machines. They are a threat until the final act.
- **Campaign in four acts:**
  - Ember: survive and establish Haven.
  - Reboot: take the first nodes and meet the factions.
  - Contest: faction conflict and alliances.
  - Core: reach the Grid Core and choose its fate.
- **Endings** depend on reputation and choices. The three main ones are restoring the Grid for the people, handing it to the Guild, or shutting it down.

## 15. Controls and UI

- **Touch:**
  - A floating left stick moves you, and swiping on the right side looks around.
  - Buttons: Attack, contextual Interact/Deconstruct, Dodge, Sprint toggle, 4 quick-slots, Build, Inventory and Map.
  - Gentle aim assist, and a toggle for left- or right-handed layout.
- **Desktop:** WASD, mouse look with pointer lock, and hotkeys (E interact, Space jump, Shift sprint, Q dodge, B build, Tab or I inventory, M map, 1–4 quick-slots).
- **Screens:**
  - Minimal HUD and radial quick menu.
  - Inventory (with weight), crafting, and the build menu.
  - Map with fog of war and district states.
  - Town Ledger: population and the Needs Board.
  - Journal with objectives.
  - Settings: graphics tier, sound, sensitivity, layout, text size, colorblind mode, reduce screen shake, subtitles.
- **Onboarding:** a guided first ten minutes made of contextual prompts, never walls of text. Loading screens show useful tips. All strings live in one place, ready for localization.

## 16. Online

- **Accounts:** you claim a unique username once, with no password. A device token signs you in silently after that, backed by a recovery code and a link-device flow.
- **Saves:** local-first, with cloud sync. Conflicts ask you to choose a save, and saves can be exported and imported.
- **Updates:** service-worker updates never sign you out.
- **Co-op:** 2–4 players join by room code. The world is shared and inventories are personal. There is a ping wheel and emotes, but no voice chat.

## 17. Out of scope

Vehicles, temperature and radiation meters, conveyor or drone automation, real money, and copyrighted characters or brands. Reclaimed maintenance bots as late-game workers are a stretch goal.
