# DORMANT GRID — standing rules for every Claude session

Read PROGRESS.md (NEXT ACTIONS) first, then continue exactly where the last session stopped.

## What this is
Third-person stylized open-world survival + town-rebuilding game for iPhone Safari (Home Screen PWA, landscape) and desktop. Three.js + TypeScript + Vite client, deterministic TS sim core, Cloudflare Workers + Durable Objects backend. Full spec: docs/GDD.md. Decisions: docs/DECISIONS.md.

## Repo layout (npm workspaces)
- `packages/shared` — contracts only (types, message schemas, RNG). No `any`. Change here first, then consumers.
- `packages/sim` — pure deterministic sim: worldgen, items/recipes, inventory, survival, survivors, farming, grid, factions, save migrations. NO DOM, NO three.js imports.
- `apps/game` — client (renderer, input, UI, audio, streaming, saves, PWA).
- `apps/server` — Cloudflare Worker + Durable Objects (AccountRegistry, PlayerVault, WorldRoom).
- `tools/` asset ingest + CI checks, `tests/` Playwright smoke/visual, `docs/`, `assets/{incoming,source,processed}`.

## Operating rules
1. Never ask the owner questions mid-run. Decide, log in docs/DECISIONS.md, continue.
2. Work on `build/main-line`; merge to `main` only when gates pass. `main` must always build, deploy and be playable. Tag finished phases `phase-N`.
3. Commit small and often; push at least every 30–45 minutes. Update PROGRESS.md after every phase (done / in progress / next / known issues / morning test list, plus NEXT ACTIONS ≥ 10 items).
4. Never put secrets, tokens or player data in the repo, logs or chat. Deploy creds only via GitHub Actions secrets (CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID).
5. Verify, never assume: run builds, tests, headless screenshots, and look at them critically. Never claim iPhone testing that did not happen. Never describe a stub as a feature. Skipped gates are reported as skipped.
6. Check installed package types/docs instead of remembered APIs.
7. If a spec number conflicts with measurement, trust measurement, pick the safer iPhone option, log it.
8. Time-box systems; ship the simplest version that feels good; log cuts in PROGRESS.md.
9. Priority if time runs short: Phases 0–5 (vertical slice) → 6 saves → 7 survivors → 10 Grid → rest.

## iPhone budgets (hard)
Texture memory ≤150 MB, textures ≤1024 px (UI/sky ≤2048). Draw calls 150 typical / 250 peak. ≤300k visible tris. Pixel ratio 0.6–1.5 adaptive (cap 2). Initial download ≤12 MB compressed. Never resize canvas repeatedly. Handle webglcontextlost/restored. Dispose on chunk unload; pool objects; no per-frame allocations in hot loops. Audio ≤24 voices, unlock on first tap. touch-action manipulation, no overscroll, safe-area insets, no text selection/callout.

## Quality gates before merging to main
1. `npm run check` (typecheck, lint with 0 warnings, unit tests, build, bundle budget, secret scan).
2. `npm run smoke` (Playwright: load, enter world, move, interact, save, reload, restore; zero console errors).
3. Screenshot review against docs/STYLE_BIBLE.md; fix the 5 worst problems.
4. Deterministic counters vs budgets (draw calls, tris, texture MB, chunk build ms) — not fps.
5. Determinism (same seed → same world hash) and save round-trip/migration tests.
6. Accessibility: text size, colorblind mode, reduce-shake, ≥44pt touch targets.

## Definition of done (per feature)
Works by touch AND keyboard; has sound + visual feedback; survives save/reload; within budgets; handles errors/offline; has a test; has a hint where needed; no console errors.

## Polish rules
Every action: visual + audio (+ camera where fitting) feedback. Hitstop 2–4 frames scaled by weight; shake scaled by importance (respect reduce-shake); pooled particles; tween UI in/out; layered pitch-varied SFX; input buffering + generous touch ranges. All player-facing strings live in apps/game/src/ui/strings.ts.
