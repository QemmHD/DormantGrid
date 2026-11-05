# Round 5 tasks — variety, depth, co-op readiness (survives compaction)

Source: docs/review/PLAN.md + docs/REVIEW.md on main. Work on build/main-line; merge to main after green steps.
Before: 11/13 (P11 enemy variety and P13 recorded audio fail). P13 stays failing on purpose this round.
Out of scope: new maps, content packs, 3D model integration, monetization.

- [ ] 1. Enemy variety (P11): all 11 sim types as distinct client kinds — silhouette (readable at 30 m), behaviour, counter; raids/ambient escalate by district + threat tier; measured check (silhouette IoU + behaviour signatures) → tools/review/enemies-check.mjs; re-measure budgets
- [ ] 2. Dead perks: implement or replace the 6 (Quiet Work, Patch Job, Site Foreman, Gridwright, Tracker, Warden); check that no perk is dead
- [ ] 3. Town Rank bar: progress + next 3 unlocks on HUD and Journal, iPhone-readable; check
- [ ] 4. Real-play pacing: bot plays collect/build steps for real; timestamps (first perk, first reboot, first faction contact, first raid repelled, first harvest, first night, end of act 1); targets + measured table in PLAN.md; flag <30 s or >10 min
- [ ] 5. Audio pipeline: file-driven by stable ID via ingest (AAC/MP3, size/duration budgets, loudness normalisation), synth fallback; docs/asset-requests/audio-sfx.md (60) + audio-music.md (6); P13 left failing honestly
- [ ] 6. Co-op readiness: (a) local Worker (wrangler dev / miniflare) + 2 headless clients: join, disconnect/reconnect, duplicate join, old client refused — check; (b) diagnostics overlay (state, RTT, snapshot age, desync count, copy report) toggled in Settings; (c) docs/review/COOP_TEST.md
- [ ] 7. Saves: migration if data changed + previous-version load test
- [ ] 8. Gates, budgets, CI deploy, live smoke both URLs; PLAN.md; final reply

## Findings (round 5)
