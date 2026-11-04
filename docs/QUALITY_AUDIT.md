# Quality audit — rework pass

Sources:
- the owner's hands-on iPhone test of the live build;
- the "before" captures in `docs/quality/before/` (emulated iPhone 14 Pro landscape with touch, plus desktop 1280×720);
- a code read of `input/`, `game/`, `render/`, `world/`, `ui/`, `net/` and `packages/sim`.

Severity: **S1** breaks the experience, **S2** clearly hurts, **S3** polish.

## 1. Look and movement feel (top priority)
| # | Sev | Problem | Where |
|---|---|---|---|
| 1.1 | S1 | Touch look is raw. Each touchmove delta goes straight to yaw/pitch (×1.15 × sensitivity) with no smoothing, no acceleration curve and no dead zone, so it jitters and overshoots. Mouse look has the same issue. | `input.ts` onTouchMove, `camera.look` |
| 1.2 | S1 | Accidental jumps. A large **jump** button sits in the right-thumb look area, and any brush hits it. Jump is rarely needed. | `ui` action cluster |
| 1.3 | S1 | Action buttons are icon-only and ambiguous (lightning = sprint, arrow = jump, ⟲ = dodge, pencil = attack). Players can't tell what they do. | `ui.ts` |
| 1.4 | S2 | No camera zoom (no pinch, no button, no wheel). The camera sits close and low, and the character covers the centre of the screen. | `camera.ts` |
| 1.5 | S2 | Invisible walls and sticking. Rotated props (cars at 30–60°) use the AABB of their rotated box, which can be up to 1.4× wider than the car, so the player catches on air. | `world.ts` prop colliders |
| 1.6 | S2 | Camera clipping. The collision ray ignores props; the minimum distance of 0.6 m plus the 0.1 m near plane still clips into walls when backed against them; and there is no fade of the player when the camera is very close. | `camera.ts` |
| 1.7 | S2 | Camera follow has no look-ahead and no lag on yaw; there is no subtle sway or head-bob; there is no FOV ease when stopping. | `camera.ts` |
| 1.8 | S2 | No stamina feedback beyond a thin bar: no breathing sound, no screen cue, and sprint silently stops when empty. | `game.ts` survival |
| 1.9 | S2 | Footsteps don't depend on the surface. Only wet/run variants exist; road, grass, dirt, wood floor and metal all sound the same. | `player.onStep` |
| 1.10 | S3 | The sensitivity slider exists, but there is no separate vertical sensitivity, no smoothing option, and no zoom control in Settings. | Settings |
| 1.11 | S3 | Desktop needs a click to capture the pointer, with no hint. There is no mouse-wheel zoom. | `input.ts` |

## 2. Interaction clarity
| # | Sev | Problem |
|---|---|---|
| 2.1 | S1 | The target has no highlight or outline in the world; the player can't see which object the prompt means. In the iPhone capture the targeted crate is off to one side and unmarked. |
| 2.2 | S1 | Touch prompts show a keyboard key ("E") and mix tap/hold wording ("Search Crate · hold to salvage"). |
| 2.3 | S1 | Separate **interact** and **attack** buttons, both always visible. There's no single primary button that changes with the target. |
| 2.4 | S2 | No colour or icon language per interaction type (loot, break, build, talk, door, workbench, farm). |
| 2.5 | S2 | No indicator when the nearest interactable is off-screen or behind the camera. |
| 2.6 | S2 | Pickup feedback is a toast in the corner. There's no floating "+3 Timber" at the source. |
| 2.7 | S2 | Blocked reasons are inconsistent: "needs crowbar" shows as a faint subtitle; a full inventory dumps items silently to the ground with a toast. |
| 2.8 | S3 | Nothing shows on an object that has already been searched. |

## 3. Guidance
| # | Sev | Problem |
|---|---|---|
| 3.1 | S1 | No always-visible current objective. Onboarding text shares the top-centre slot with the district banner, the Town Board and toasts, and they overlap (see `iphone-02-start.png` and `iphone-05-night.png`). |
| 3.2 | S1 | No world marker or arrow pointing to the next thing to do. |
| 3.3 | S1 | Meters are labelled F/W/S/R with no explanation. |
| 3.4 | S2 | No help screen showing controls for the current device. |
| 3.5 | S2 | No "what do I do next?" button. |
| 3.6 | S2 | Onboarding can't be skipped or re-read, and its steps don't cover survivors, defending or the Grid. |
| 3.7 | S2 | Notification spam. On day 1, three "X has gone hungry all day" toasts plus a raid warning stack over the HUD. |

## 4. Graphics
| # | Sev | Problem |
|---|---|---|
| 4.1 | S2 | Downtown is mostly deep shadow: the sun is low and there isn't enough fill light, so the street reads as black (`desktop-04-downtown.png`). |
| 4.2 | S2 | Facades are flat colour with sparse windows. Walls have no colour variation per floor, no grime gradient and no AO at corners. |
| 4.3 | S2 | Streets are empty: low prop density along sidewalks, no street furniture rhythm, no litter or debris decals. |
| 4.4 | S2 | Ground is a single flat colour per tile type. No variety such as cracks, puddles, grass patches or dirt. |
| 4.5 | S2 | Restored districts barely differ from dormant ones; only the sun tint and lit windows change. |
| 4.6 | S3 | Character animation is procedural walk/run only. Idle is a gentle breath and there's no run lean on the camera. |
| 4.7 | S3 | No smoke columns, chimney smoke, dust motes or sparks from live wires; the only particles are on hits. |
| 4.8 | S3 | Bloom is faked only by emissive colour; no glow halos around lights. |
| 4.9 | S3 | The quality setting exists (Auto/Low/Medium/High) and adaptive DPR exists. Both need verification and a visible label. |

## 5. Systems depth and back end
| # | Sev | Problem |
|---|---|---|
| 5.1 | S1 | **Survivors starve on day 1.** Town stock starts with 6 cans for 3 survivors, nothing restocks it in the first hours, and the player's food never reaches the town. There's no deposit-to-town action. |
| 5.2 | S1 | No way to give food or materials to the town (no Town Stockpile interaction). Survivors, farming and building are disconnected from the player loop. |
| 5.3 | S2 | Time can jump forward (hourly catch-up) and the clock showed "Summer" after a debug hour change. Season and day formatting need a check. |
| 5.4 | S2 | Unreachable in play: livestock (coop/pen exist as pieces but nothing happens), hunting/butchering, cooking quality, contracts, faction events, endings, stealth. |
| 5.5 | S2 | Survivors can't be talked to directly. Job assignment is only in the Ledger. |
| 5.6 | S2 | Thin first hour: the next steps after crowbar → shelter → bed aren't signposted (workbench → axe → farm → node). |
| 5.7 | S2 | Username claim interrupts play right after the intro, with no explanation of why it matters. |
| 5.8 | S2 | Live co-op has never been verified with two real browser clients (the sandbox proxy blocks WebSockets on public URLs). |
| 5.9 | S3 | The Cloudflare CI deploy fails because the token secret holds the wrong value (owner-side). |

## Plan (phases, in order)
1. **Feel.** Smoothed look with curves and dead zones, pinch/wheel/button zoom, no jump in the thumb zone, labelled actions, camera collision against everything with a near-fade, follow lag, subtle bob, stamina cues, surface footsteps, oriented prop colliders.
2. **Interaction.** In-world highlight with a type-coloured marker and icon, one contextual primary button, an off-screen indicator, floating pickups, clear blocked reasons.
3. **Guidance.** Objective tracker with a world marker, a "Next?" button, help screen, meter labels, notification queue and dedupe, skippable and re-readable tutorial covering the full loop.
4. **Graphics.** Lighting balance, facade detail and AO, street dressing, ground variety, restored-area transformation, ambient particles.
5. **Systems.** Town stockpile, food balance, livestock/hunting/cooking hooks, survivor talk and assignment, contracts, first-hour signposting, claim timing, a real two-client co-op run (local `wrangler dev`).
