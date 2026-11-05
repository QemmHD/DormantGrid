# Round 5 tasks — variety, depth, co-op readiness (survives compaction)

Source: docs/review/PLAN.md + docs/REVIEW.md on main. Work on build/main-line; merge to main after green steps.
Before: 11/13 (P11 enemy variety and P13 recorded audio fail). P13 stays failing on purpose this round.
Out of scope: new maps, content packs, 3D model integration, monetization.

- [x] 1. Enemy variety (P11): all 11 sim types as distinct client kinds — silhouette (readable at 30 m), behaviour, counter; raids/ambient escalate by district + threat tier; measured check (silhouette IoU + behaviour signatures) → tools/review/enemies-check.mjs; re-measure budgets
- [x] 2. Dead perks: implement or replace the 6 (Quiet Work, Patch Job, Site Foreman, Gridwright, Tracker, Warden); check that no perk is dead
- [x] 3. Town Rank bar: progress + next 3 unlocks on HUD and Journal, iPhone-readable; check
- [ ] 4. Real-play pacing: bot plays collect/build steps for real; timestamps (first perk, first reboot, first faction contact, first raid repelled, first harvest, first night, end of act 1); targets + measured table in PLAN.md; flag <30 s or >10 min
- [x] 5. Audio pipeline: file-driven by stable ID via ingest (AAC/MP3, size/duration budgets, loudness normalisation), synth fallback; docs/asset-requests/audio-sfx.md (60) + audio-music.md (6); P13 left failing honestly
- [x] 6. Co-op readiness: (a) local Worker (wrangler dev / miniflare) + 2 headless clients: join, disconnect/reconnect, duplicate join, old client refused — check; (b) diagnostics overlay (state, RTT, snapshot age, desync count, copy report) toggled in Settings; (c) docs/review/COOP_TEST.md
- [x] 7. Saves: migration if data changed + previous-version load test
- [ ] 8. Gates, budgets, CI deploy, live smoke both URLs; PLAN.md; final reply

## Findings (round 5)
- P11 passes on a measured check (tools/review/enemies-check.mjs): silhouettes, 11/11 behaviour + counter, escalation 6 → 11 kinds.
- Fixed while testing: sappers stalled against props; hounds circling one camp fire walked into another's light; ground cracks drawn on pale grass.
- Gridwright replaced (no power budget exists); the other 5 dead perks now have systems; salvaging makes noise (new).
- iPhone SE layout: objective card overlapped the quick bar (fixed). NOT fixed: the Jump button overlaps quick slot 4 on SE (pre-existing, logged).
- Pacing bot found: first-node fuse step could stall (fuses only from rare heavies) → Odile sells fuses; quest text fixed.
- Pacing bot's own bugs (not game): pause menu opened by a stray Escape; loop spun in zero game time waiting for the 1.5 s quest tick.
- Co-op (found by tests/coop-local.mjs on workerd): server never completed the close handshake; client had no dead-link detection; a fresh-tab rejoin froze the player for others (seq restart). All fixed.
- Audio: AAC overshoots short transients ~3 dB → peak target -6 dBFS with post-encode correction.
- No save shape change this round; a frozen round-4 (schema 3) save loads (test).
