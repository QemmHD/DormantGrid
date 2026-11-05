# Round 4 tasks — make progress pay off (survives compaction)

Source: docs/REVIEW.md + docs/review/PLAN.md. Work on build/main-line, merge to main after each green step.
Acceptance: `node tools/review/accept.mjs` — must pass this round: P2 (pixel-based), P8, P9, P10, P12, plus new P15 restoration before/after.
Out of scope: P11 enemy variety, P13 recorded audio, co-op.

- [ ] 1. Restoration payoff: lit street lamps (+ light pools), new props/plants, hazards cleared, ambient walkers, warmer light, birdsong, cinematic beat on reboot; measurable check tools/review/restore-check.mjs → P15
- [ ] 2. Progression: XP from play (grantXp), perk screen (32 perks, tiers, points, progress bar), perk effects wired; campaign plumbing (choice UI for toll/core, trader sets talk:guild_factor, Grid Core entrance, ending screen using sim ENDINGS + client epilogues), journal shows next step + ending paths → P8, P12
- [ ] 3. Power/water: needsPower checked (stations, turret, floodlight), Haven powered once any district is Powered, irrigation from restored Waterworks → P9, P10
- [ ] 4. Visual leftovers: soft flickering flames, ground grime/cracks/wear, Haven sign not mirrored, stronger contact shadows on high
- [ ] 5. "Check your pack" tutorial step: human vs bot — diagnose + fix
- [ ] 6. P2 asserts rendered pixels (smoke soft, non-cubic)
- [ ] 7. Save schema 3 migration (retroactive XP for old saves) + test that a v2 save loads
- [ ] 8. Before/after shots (items 1, 4) → docs/review/after/ WebP
- [ ] 9. Gates green, budgets, CI deploy, live smoke both URLs; PLAN.md updated; final reply

## Findings while reading (round 4)
- awardXp/grantXp exists (sim rank.ts:43) but the client never calls it → XP/perk points never accrue; quest reward.xp ignored (game.ts updateQuests).
- No UI sets choice:toll / choice:core; trader talk doesn't set talk:guild_factor; nothing sets talk:grid_core → campaign cannot finish.
- Client ENDINGS (content/campaign.ts, 3 epilogues) vs sim ENDINGS (data/quests.ts, 6 endings + resolveEnding) are not connected.
