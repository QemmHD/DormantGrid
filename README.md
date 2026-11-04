# DORMANT GRID

Third-person stylized survival and town-rebuilding game for iPhone Safari (Home Screen PWA) and desktop browsers. Three.js + TypeScript + Vite client, deterministic TS sim core, and a Cloudflare Workers + Durable Objects backend.

## Run locally
```sh
npm ci
npm run dev            # game at http://localhost:5173 (offline: no /api)
npm run check          # typecheck, lint, unit tests, build, bundle budget, secret scan
npm run smoke          # Playwright smoke test against the built game
node tests/grid-flow.mjs   # scripted Grid reboot test
cd apps/server && npx wrangler dev   # local API + game (same origin) for account/save/co-op testing
```
Debug URL params: `?perf` (overlay), `?autostart&fresh` (skip menu, new game), `?quality=low|medium|high`, `?h=21` (hour), `?x=..&z=..` (teleport), `?spike` (Phase 0 stress scene), `?ui=harness&screen=craft` (UI harness).

## Deploy
Pushes to `main` run `.github/workflows/deploy.yml`:
- **With** the `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` secrets: one Worker serves both the game (static assets) and `/api` + `/ws`, followed by a live smoke test and automatic rollback.
- **Without** them: `pages-fallback.yml` publishes an offline-only build to GitHub Pages. Enable Settings → Pages → Source: GitHub Actions first.

## Layout
`packages/shared` contracts · `packages/sim` deterministic sim · `apps/game` client · `apps/server` Worker/DOs · `tools/` asset ingest and gates · `docs/` design docs · `tests/` smoke and flow tests.

Start with `PROGRESS.md` and `CLAUDE.md`.
