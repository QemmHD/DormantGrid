# Rework pass — before/after report

All captures were taken headless (Chromium on SwiftShader).
- **iPhone:** the Playwright "iPhone 14 Pro landscape" profile (852×393, touch, mobile).
- **Desktop:** 1280×720.

Folders:
- `before/`: the live build at the start of this pass.
- `phase1/`, `phase3/`, `phase4/`: intermediate captures.
- `after/`: final.

Re-capture with `node tests/quality-shots.mjs <label>`.

**No real iPhone was used.** Frame-time and latency numbers below are logical (frames between input and response), not measured on hardware.

## 1. Look and movement feel
| Before | After |
|---|---|
| Raw touch deltas went straight to yaw/pitch, so tiny taps nudged the camera. | 5 px dead zone per touch, plus an acceleration curve (slow drags are precise, flicks turn fast), separate vertical sensitivity, and ≈30 ms smoothing. The camera responds **within 1 frame** of a touch move (`tests/feel.mjs`). |
| No zoom. | Pinch on the look side, a **Zoom** button (near/mid/far) and the mouse wheel; limits 2.4–8 m. |
| A big unlabelled **jump** button sat in the look-drag area. | Jump is small and bottom-left of the cluster, out of the drag path. Every control is labelled (Swing, Roll, Run, Jump, Zoom). All touch targets are ≥40 px (checked); the primary button is ≈94 px. |
| Rotated cars and props used oversized AABBs (invisible walls). | Oriented-box colliders (unit-tested). The player stops within 0.02 m of releasing the stick (no sliding). |
| The camera ray ignored props, sat 0.6 m from walls and clipped. | A thick 5-ray probe against everything; minimum 0.9 m; the player model fades when the camera is pressed against them. |
| No stamina cue. | Hysteresis (once empty, no sprint until 30%), breathing sound, a cold vignette pulse and a one-line explanation. |
| One footstep sound. | Grass, dirt, hard ground, wood floor, metal/rail and wet variants; dust kicks on dirt when running. |
| No bob or sway. | Subtle bob and sway while moving, scaled down further by *Reduce screen shake*. |

## 2. Interaction clarity
| Before | After |
|---|---|
| No highlight in the world; the prompt said "E" even on touch. | The target gets a **tinted silhouette or box** in its type colour, plus a floating icon and verb ("Loot · hold: break apart"). The touch prompt no longer shows keyboard keys. |
| Separate interact and attack buttons. | **One primary action button** whose label and colour follow the target (Loot, Break, Salvage, Talk, Trade, Craft, Plant, Harvest, Sleep, Reboot, Sync…). It shows "Locked" with the reason when blocked, and swings when there's nothing to interact with. |
| No off-screen cue. | An edge arrow in the type colour when the target is off-screen or behind you. |
| Corner toasts only. | Floating "+3 Timber" text at the source, plus the toast. |
| Colour language: none. | Loot amber · Break white · Craft green · Talk blue · Door violet · Use/Grid cyan · Farm lime · Combat red. The legend is in Help. |

## 3. Guidance
| Before | After |
|---|---|
| Hints, district banner, Town Board and toasts all overlapped at top-centre. | An **objective tracker** under the meters; tutorial and tips moved to the bottom; banners trimmed on phones; toasts de-duplicated (×N) and capped at 3 on phones. |
| No marker. | A **world beacon** with distance, and an edge arrow when off-screen. |
| Meters were F/W/S/R. | Icons plus plain labels (Health, Food, Water, Stamina, Rest). Tapping them opens Help, which explains each one. |
| No help. | A **Help** screen with device-specific controls, meter explanations, the colour legend, every tutorial step, the core loop, and *Replay the tutorial*. |
| — | **Next?** picks the next best action (tutorial step → heal → drink/eat → sleep → feed the town → workbench → farm → assign a survivor → nearest offline node) and points the beacon at it. |
| — | **Skip tutorial**, re-readable steps, and first-use tips (stamina, weight, bleeding, fracture, sickness, drones, nodes, full pack). |

## 4. Graphics
| Before | After |
|---|---|
| Downtown street read as near-black in the morning. | Exposure 1.32, a warmer and brighter bounce fill, sun trimmed. Ruins read cold and grey; Haven reads warm. |
| Flat facades. | Per-floor tone, rain streaks under sills, shop sign boards (lit once the district is powered). |
| Bare streets. | Sidewalk slab joints, cracks, litter, curb debris piles, cones and sandbags. None of it is interactive, so none of it is highlighted. |
| Restored districts looked the same. | Restoration now changes the mesh: scrubbed and warmed walls, planter boxes, flowerbeds, no litter, lit signs and windows. Loaded chunks re-mesh off-thread when the state changes. |
| Few particles. | Camp smoke columns, footstep dust, plus the existing hit sparks and debris. |

## 5. Systems and back end
| Before | After |
|---|---|
| **Runaway clock.** After the first in-game hour, town catch-up re-advanced the world clock every frame, so time raced (43.7 h in 6 s). Survivors starved in minutes, raid warnings spammed, and the season changed on day one. | **Fixed** (`town.advance` rewinds before the sim step). The smoke test asserts the clock rate: before 43.72 h in 6 s, after 0.66 h. |
| The player could not feed the town. | **Town Stockpile** at the camp: deposit and withdraw. Survivors eat and build from it. Day-one stock covers about two days. |
| Survivors could only be managed from the Ledger. | **Talk** to any survivor to see their mood and hunger and assign a job. |
| Coop and pen pieces did nothing. | They produce eggs and milk into the stockpile every dawn. |
| Guild trade only. | **Guild delivery contracts** at Odile (deliver → chits + reputation). |
| Account claim popped up right after the intro. | Asked after the player has crafted their first tool, or after 4 minutes. |
| Co-op had never run with two real clients. | Two real browser clients against the real Worker and Durable Objects (`wrangler dev`): host, join, presence, interpolated movement, shared prop removal, ping, and reconnect after a dropped socket — **all pass**. Fixed remote characters re-syncing every frame and sliding in from the world origin. |

## Gates at the end of the pass
- `npm run check`: PASS (162 unit tests including the new collision tests; lint 0 warnings; 0.56 MB payload; secret scan).
- Smoke (now including the clock-rate check), feel, guide, systems-flow, grid-flow, raid-flow, defense-flow and the memory walk: all PASS.

## Still weak (honest)
- **Not tested on a real iPhone.** Touch feel, 60 fps, input latency and thermal behaviour are unverified on hardware. Headless SwiftShader runs at single-digit fps, so it only proves logic (frames, not milliseconds).
- **Character animation** is still procedural: no real idle variations, no run cycle with weight, no hit/death animations beyond a flinch and fall.
- **Graphics:** no true ambient occlusion or bloom (cost on iPhone). Props still come from the original worldgen density (more would change the world hash and break saves). Downtown is moody, but still mostly grey boxes up close.
- **Outlines** are a tinted back-face silhouette, not a screen-space outline. Thin props (signs, fences) highlight less clearly.
- **Not reachable in play:** stealth, hunting as a dedicated loop, cooking quality, faction events and the Act IV endings. Raids still don't have survivor guards fighting in-world.
- **Live co-op over the public URL** remains unverified from this sandbox (WebSockets are blocked by its proxy). It was verified on the same code locally.
- The tutorial's later steps (walls/roof/bed) assume the build menu flow; they haven't been play-tested end-to-end by a human.
