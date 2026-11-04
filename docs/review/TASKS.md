# Round 3 tasks — first hour playable, readable, good-looking (survives compaction)

Source of truth: docs/REVIEW.md + docs/review/PLAN.md. Work on build/main-line, merge to main after each green step.
Acceptance: `node tools/review/accept.mjs` (13 checks). Scope 1-4 checks must pass: P1, P3, P4, P5, P6, P7. Item 5: P2 + after shots.
Evidence refresh: `npm run build && node tools/review/session.mjs 30 && node tools/review/controls2.mjs`.

- [x] 0. Setup: review docs + tools/review into main; 10 before shots as WebP (205 KB) in docs/review/before/; raw PNGs stay on review/2026-11-04 (docs/review/shots/ gitignored)
- [ ] 1. First 10 min: crate gives scrap / hint / craft list surfaces tutorial recipe; telegraphed early threat ≤10 min; first survivor arrival/rescue ≤15 min; no idle gap
- [ ] 2. Targeting: look-direction first, nothing behind wins (game.ts scanTargets)
- [ ] 3. Camera: never lose the player (wall min distance, fade occluding props/bushes/cars)
- [ ] 4. Building placement at camp: diagnose finding 29 (game bug or bot?) and fix
- [ ] 5. Visuals: character rebuild (hands, face, clothing, silhouette), billboard smoke, desaturate props, roughness variation, contact shadows; within budgets
- [ ] 6. After shots (same 6 points) → docs/review/after/ WebP
- [ ] 7. Gates green, budgets, CI deploy, live smoke both URLs
- [ ] 8. PLAN.md updated; final reply

## Notes
- Before shots (6 points for item 5): desktop-03 spawn-after-intro, desktop-04 haven-overview, desktop-05 downtown-street-dormant, desktop-08 building-closeup, desktop-11 prop-closeup-car, desktop-13 night-haven.
