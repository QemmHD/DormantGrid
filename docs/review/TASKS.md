# Review tasks (2026-11-04) — survives context compaction

Branch: `review/2026-11-04` (never main). Review only: no game code / asset / deploy changes.

- [x] 1. Read GDD promises; count shipped content (tools/review/content.mjs) → docs/review/content.json
- [x] 2. Screenshots at fixed points (tools/review/shots.mjs) → docs/review/shots/
- [ ] 3. Controls + frame-time measurements (tools/review/controls.mjs) → docs/review/controls.json
- [ ] 4. Scripted first-session bot with milestone timestamps + idle gaps (tools/review/session.mjs) → docs/review/session.json
- [x] 5. Unreachable features (grep sim exports vs client usage) → docs/review/unreachable.md
- [ ] 6. Look at every screenshot critically; findings list
- [ ] 7. docs/REVIEW.md (rubric A–J, loops, gap analysis, findings ranked)
- [x] 8. docs/review/DEVICE_FEEL_TEST.md
- [ ] 9. docs/review/PLAN.md (ranked, runnable acceptance checks)
- [ ] 10. Commit + push branch; final reply

## Notes / decisions
- No bot playthrough existed (PROGRESS: "not built yet"); a scripted one is written in tools/review/session.mjs.
- Headless = SwiftShader CPU rendering: frame times are relative only, never iPhone numbers.
- Weather shots in shots.mjs captured transitions (sky.ts:204 smoothing, 4 s sim time constant); re-shot steady-state with tools/review/shots-weather.mjs.
- Controls (tools/review/controls.mjs) running → docs/review/controls.log/json. Session bot written (tools/review/session.mjs), run after controls.
- Findings so far (screenshots looked at 1-26 iphone + key desktop): smoke = opaque cubes (fx.ts:55,157); menu title clipped on iPhone; Day/season subtitle unreadable; props (bush/car) between camera and player not faded; doors/dark windows black voids; interiors roofless + exterior brick inside; restored district = tint + lit windows only, no life; map labels ~6 CSS px on iPhone, no fog of war; build invalid reason just "materials", identical piece icons; craft list 2 rows on iPhone, unaffordable first; raid: raiders not visible after 14 s, no direction cue; Haven sign mirrored from behind; survivor walks through player.
- Unreachable: perks (32 defined, no client UI: grep -ri perk apps/game/src → 0), endings (content/campaign.ts ENDINGS unused), stealth (0 refs), hunting/boar (boar → hound visual raids.ts:24), livestock only as coop/pen dawn output (town.ts:142), raider types collapsed to one 'raider' (raids.ts:23).
- Owner feedback (chat): "Looks like roblox" → treat as art-direction evidence in A; causes: box-segment characters with no faces (render/character.ts), plastic Lambert flat colors, saturated toy props, cube smoke, flat ground, weak contact shadow/AO.
