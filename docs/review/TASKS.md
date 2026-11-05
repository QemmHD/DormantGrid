# Round 6 tasks — reliable, fair first hour (survives compaction)

Source: docs/review/PLAN.md (pacing table), REVIEW.md, COOP_TEST.md on main. Before: 12/13 (P13 waits on audio files; out of scope).
Rule: do NOT tune difficulty to the bot; bot = dead ends / stalls / unclear steps; human-plausible play sets difficulty.

- [x] 1. Reboot flow → `tools/review/reboot-check.mjs` PASS (docs/review/reboot.json)
- [x] 2. First raid fairness + difficulty → `tools/review/raid-check.mjs` PASS (docs/review/raid.json)
- [x] 3. Deaths: safe zone, gear kept, satchel, recap → `tools/review/death-check.mjs` PASS (audit: from the pacing re-run's deathLog)
- [~] 4. Farming → `tools/review/farm-check.mjs` (fixes in: season card on game tick, priority beacon in tutorial, farmers wait 6 h on the player's crop) — re-running
- [x] 5. Trader → `tools/review/trader-check.mjs` PASS (bot minute of contact comes from pacing.mjs)
- [~] 6. Act I pacing: population 3 → 4 (three are seeded, so the step completed itself); re-run pacing.mjs (frozen dist via PACING_DIST); PLAN.md table
- [~] 7. iPhone layout → `tools/review/layout-check.mjs` (PWA full-screen 667×375 / 844×390 / 932×430 + insets) — SE passing after CSS block; 13 / 15 PM re-running
- [ ] 8. Saves: schema v4 migration (tutorial index) + test DONE; gates; budgets; merge; CI; live smoke both URLs; PLAN.md; final reply

## Findings (round 6)
- Reboot "never started" = bot navigation (straight-line walking stuck on props) + a game gap: after the tutorial, quest objectives had no world beacon and no minimap marker. Fixed (objective target system); bot now walks nav paths.
- Real bug: Escape on a dialog closed it AND opened the pause menu (a raw keydown listener closed the dialog first, then ui.update saw Escape with nothing open). Fixed with Input.consume.
- Real bug: town farmers harvested a crop the same hour it ripened, so the player never saw a ripe crop. Farmers now leave the player's own crop for 6 game hours (player-planted crops only; the 30-day soak starves if all crops wait).
- Real gap: "Bring Haven to three residents" completed itself (three survivors are seeded at start).
- Layout (before fixes): SE Jump × slot 4 and Jump × slot 3 (568 px Safari size), meters × objective card on all phones, top bar × clock (SE, 15 Pro Max), Zoom target 41 px (< 44), objective buttons in the stick zone.
- Note: Playwright "iPhone SE landscape" = 1st-gen 568×320 Safari tab; layout-check uses full-screen PWA sizes.
