# DORMANT GRID: Architecture

This doc covers the system, the backend, and what the client is expected to do. Contracts live in `packages/shared/src/{net,save}.ts`. The server code is in `apps/server`.

## 1. System overview

```
 iPhone Safari (Home Screen PWA) / desktop browser
 ┌──────────────────────────────────────────────────────────────┐
 │ apps/game (Vite + Three.js)                                   │
 │  main thread: renderer, input, UI, audio, streaming           │
 │  Web Workers: worldgen + sim (@dg/sim), nav                   │
 │  IndexedDB: device token, local saves (source of truth offline)│
 │  Service worker: versioned precache, safe-moment updates      │
 └───────────────┬───────────────────────────────┬──────────────┘
                 │ HTTPS same-origin /api/*      │ WSS /ws/room/:code
                 ▼                               ▼
 ┌──────────────────────────────────────────────────────────────┐
 │ Cloudflare Worker "dormant-grid"  (apps/server/src/index.ts)  │
 │  • Workers Static Assets serve apps/game/dist (free, unlimited)│
 │  • /api/*, /ws/* run the Worker (run_worker_first)            │
 │  • validation, CORS, per-isolate IP token buckets             │
 └──────┬──────────────────────┬─────────────────────┬──────────┘
        ▼                      ▼                     ▼
  AccountRegistry (1)   PlayerVault (1/username)  WorldRoom (1/room code)
  username uniqueness,  device-token hashes,      2–4 players, relay,
  link-device codes     recovery hash, save +     validation, event log,
                        5 backups                 grace/resume (hibernation)
```

All three Durable Objects are SQLite-backed (`new_sqlite_classes`), which is the only kind the Workers Free plan allows. They use the KV-style `ctx.storage.get/put` API on top of SQLite.

### Deployment decision: one Worker serves the game and the API
Decided 2026-11-04. The game build (`apps/game/dist`) is attached to the API Worker as Workers Static Assets (`apps/server/wrangler.jsonc` → `assets`). Reasons:
- **Same origin.** The client calls relative `/api/...` and `/ws/room/...` URLs. There is no CORS on the hot path, no API URL baked into the build, and nothing to configure per environment.
- **One deploy and one URL**: `https://dormant-grid.<your-subdomain>.workers.dev`. The subdomain is set per account in the Cloudflare dashboard (Workers & Pages → your subdomain).
- **Static asset requests are free and unlimited.** Only `/api/*` and `/ws/*` invoke the Worker and count against the 100k/day request limit.
- `not_found_handling: single-page-application` serves `index.html` for unknown paths, including `?join=CODE` links.

Cloudflare Pages remains optional: set the repo variable `DEPLOY_PAGES=true`. A Pages copy has no same-origin API, so the client must treat it as offline-only unless `VITE_API_URL` points at the Worker. `ALLOWED_ORIGINS` already allows `*.dormant-grid.pages.dev` and localhost.

**Fallback.** When the Cloudflare secrets are missing, `.github/workflows/pages-fallback.yml` builds with `VITE_OFFLINE_ONLY=1` and `VITE_BASE=/<repo>/` and publishes to GitHub Pages. That build is single-player with local saves only. GitHub Pages on a private repo needs a paid GitHub plan.

## 2. Free-tier limits (checked 2026-11-04)

Sources:
- https://developers.cloudflare.com/workers/platform/limits/
- https://developers.cloudflare.com/durable-objects/platform/limits/
- https://developers.cloudflare.com/durable-objects/platform/pricing/
- https://developers.cloudflare.com/workers/static-assets/billing-and-limitations/
- https://developers.cloudflare.com/durable-objects/best-practices/websockets/

| Limit (Workers Free) | Value |
|---|---|
| Worker requests | 100,000 / day (resets 00:00 UTC). Over the limit, `run_worker_first` paths get 429. |
| Static asset requests | Free and unlimited (unless they match `run_worker_first`) |
| Worker CPU per HTTP request | 10 ms |
| Worker memory | 128 MB per isolate |
| Subrequests | 50 per invocation |
| Static assets | 20,000 files per version, 25 MiB per file |
| Worker size | 64 MiB uncompressed |
| DO requests | 100,000 / day. Incoming WebSocket messages are billed at 20:1 (100 messages = 5 requests). Outgoing messages and protocol pings are free. |
| DO duration | 13,000 GB-s / day |
| DO SQLite rows read | 5,000,000 / day |
| DO SQLite rows written | 100,000 / day (**the scarcest resource for us**) |
| DO stored data | 5 GB per account. Per object: 10 GB in the limits table, 1 GB per the FAQ (the docs conflict; we stay far below both). |
| Key + value / row / BLOB size | 2 MB |
| DO CPU per request | 30 s default |
| WebSocket received message size | 32 MiB (we cap at `MAX_WS_MSG_BYTES` = 8 KiB) |
| Hibernation attachment (`serializeAttachment`) | 16 KiB per socket |
| Soft limit per object | ~1,000 requests/s |

When any daily limit is exceeded, further operations of that type fail until 00:00 UTC.

### Budget math, and the rules it implies for the client
- **Room traffic.** One player sending `state` at 10 Hz produces 36,000 messages/hour, which bills as 1,800 DO requests/hour. Four players for 4 hours is about 29k DO requests. That's acceptable for friends-and-family scale.
  - The client SHOULD send `state` at 10 Hz only while moving, drop to ~2 Hz when idle, and send `ping` heartbeats every 10 s.
- **DO duration.** 13,000 GB-s/day at a 128 MB object is roughly 28 object-hours/day of active (non-hibernated) time. A room stays awake while it receives messages, so this caps total co-op play at around 28 room-hours per day.
- **Row writes.** Each world action (`propRemoved`, `piecePlaced`, …) costs 1 row write. Room meta is flushed at most every 30 s. Each save upload costs up to 7 writes (save + 5 backup rotations + 1).
  - The client MUST sync to the cloud no more than every **5 minutes** plus on key events (sleep, node reboot, pagehide). Local IndexedDB autosave every 60 s is unaffected.
- **Abuse.** Auth failures against nonexistent accounts write nothing, so spraying random usernames can't burn the write quota.

## 3. Identity (no passwords)

1. **Claim.** The first launch sends `POST /api/claim {username}`.
   - The registry reserves the lowercase name atomically. Objects process requests one at a time, so get-then-put is atomic.
   - Rules: `USERNAME_RE`, a reserved-name list, and a profanity filter with leetspeak normalization. Short roots only match at the start of the name, which avoids the Scunthorpe problem ("scrapper", "Hancock" and "document" are allowed).
   - Claims are limited to 5 per IP-hash per hour.
2. **Account creation.** The `PlayerVault` for that name creates the account. It generates:
   - a 256-bit **device token** (64 hex chars), and
   - a **recovery code** (`XXXXX-XXXXX-XXXXX-XXXXX`, about 98 bits, from an unambiguous alphabet).

   Only `sha256(salt ‖ token)` and `sha256(salt ‖ 'recovery' ‖ code)` are stored, with a per-user random salt. Raw secrets are returned exactly once.
3. **Silent auth.** Every later request sends `X-DG-User: <username>` and `Authorization: Bearer <token>`.
   - The vault hashes the token and compares it in constant time against every device.
   - Failed attempts are capped at 20 per IP-hash per hour per account, so an attacker locks out only their own IP.
   - `lastSeen` is written at most once a day.
4. **Recovery.** `POST /api/recover {username, recoveryCode}` returns a new token and a **new** recovery code (codes are single-use and rotate). Older device tokens stay valid. There are 10 failed attempts per account per hour.
5. **Link a new device.**
   - The old device calls `POST /api/link/create` (authenticated) and gets a code like `K7Q-4MX`. Codes last 10 minutes, are single-use, and creating a new one invalidates the previous one. Each user can create 6 per hour.
   - The new device calls `POST /api/link/redeem {code}` and gets its own token plus a **rotated** recovery code. The client must show this code again and tell the player that the old code no longer works.
   - Failed redeems are limited to 10 per IP-hash per hour.
6. **Device limit.** An account keeps up to 10 devices. The least recently seen device is dropped.
7. **No personal data.** IPs are only used as `sha256('dg-ip-v1', ip)[:16]` for rate limits. Tokens and codes are never logged; the server logs only error class names.

**Lost token with no recovery or link code means a lost account.** The UI must say so plainly at claim time.

## 4. Saves and sync

- **Local first.** The client saves to IndexedDB every 60 s, after key events, and on `visibilitychange`/`pagehide`. Each local save bumps `GameSave.rev`.
- **Cloud format.** `data` is base64 of the deflate-compressed (fflate) JSON `GameSave`, at most `MAX_SAVE_BYTES` = 512 KiB of base64.
- `GET /api/save` returns `{meta, data}`, or `{meta: null, data: null}` when there's no cloud save.
- `PUT /api/save {baseRev, meta, data, force?}`:
  - Accepted when `baseRev === server.rev` (0 if none) **and** `meta.rev > server.rev`. The server stores the client's meta, with `bytes` set by the server.
  - Otherwise it returns **409** `{ok: false, error: 'conflict', message, server: SaveMeta}`.
  - With `force: true` it always stores, with `rev = max(meta.rev, server.rev + 1)`.
  - The previous cloud save rotates into 5 backups, newest first.
  - Limited to 20 PUTs per minute per user.
- **Client sync algorithm.** The client keeps `cloudRev`, the last rev the server acknowledged (stored next to the save).
  1. On launch or when back online, `GET /api/save`.
  2. If `server.rev === cloudRev`, upload the local save if it's newer (`baseRev = cloudRev`).
  3. If `server.rev > cloudRev` and the local save hasn't changed since `cloudRev`, adopt the cloud save.
  4. If both changed, the saves diverged. Show the choice: **Keep cloud** (adopt it) or **Keep this device** (PUT with `force: true`). Show playtime and `savedAt` for each.
- **JSON export/import** is client-only.
- **Schema migrations** live in `@dg/sim` save code. The server never parses saves; it only checks size and base64.

## 5. Updates
- The service worker uses a versioned precache. A new version is applied at a safe moment (main menu or right after an autosave), followed by an "Updated" toast. IndexedDB, and with it the token and saves, is never cleared.
- `GET /api/version` returns `{minClient, latest}` from the Worker vars `MIN_CLIENT` and `LATEST_CLIENT`. If `GAME_VERSION < minClient`, the client must hard-refresh: `registration.update()`, then reload.
- WorldRoom refuses `hello` from clients older than `MIN_CLIENT`: it sends error `update_required` and closes with code 4006.
- To force-refresh a broken build, bump `MIN_CLIENT` in `wrangler.jsonc` and deploy.

## 6. Co-op (WorldRoom)

### Authority decision: host-client
**Decision:** host-client authority. The first player who joins (the earliest still connected or in grace) is the host. The host's phone runs the `@dg/sim` world simulation and owns time, weather, survivors, AI and raids. The server authenticates, validates shape, size and rate, relays, and logs world events for catch-up.

**Why not a server-side sim:**
- Workers Free gives **10 ms CPU per Worker request**. Durable Objects allow more CPU per request, but the free plan bills **13,000 GB-s/day** of wall-clock duration.
- A server tick (for example 5 Hz) keeps the object awake permanently. That uses the same ~28 object-hours/day as the relay, but also adds CPU-heavy work: survivor pathing, AI and farming across 12–40 agents.
- With no sim benchmark yet, we can't prove that fits within per-event CPU, and a stalled DO desyncs everyone.

**Revisit** once `@dg/sim` has a headless benchmark. If a full tick costs under ~2 ms at 2 Hz, a hybrid (server-validated inventory/building, host-run AI) becomes viable.

### Protocol (`ClientMsg` / `ServerMsg` in `net.ts`)
**Connecting**
- Create a room with `POST /api/room` (authenticated). The optional JSON body `{seed}` is a uint32; it is random if omitted. The response is `{code}`: 5 chars from `ABCDEFGHJKMNPQRSTVWXYZ23456789`.
- Share as `?join=CODE`. Connect to `wss://<origin>/ws/room/CODE`. The Worker upper-cases the code.

**Joining**
- The first frame must be `hello {user, token, clientVersion, resume?}`. Browsers can't set WS headers, so auth is in-band. If no hello arrives within 10 s, the socket is closed.
- The reply is `welcome {you, host, players, resumeToken, hour, seed}`.
  - `players` includes everyone in the room, including players in grace and yourself.
  - It is followed by replayed `event` messages, the last ≤2,000 logged actions, oldest first. Apply them idempotently, because some may already be in your save.
  - Other players then receive `join`.

**Messages while playing**
- **`state`**: about 10 Hz. The server ignores the client's `s.id` and uses the authenticated name. Excess states (more than ~15/s) are silently dropped.
- **`snapshot {players, at}`**: sent per recipient at most every 100 ms, only when someone sent a state. It contains only other players within **200 m** of you, and excludes players in grace. Interpolate remote players about 100 ms behind.
- **`action {seq, ev}`**: validated and rate-limited (30 burst, 10/s per player).
  - The server broadcasts `event {from, seq, ev}` to **everyone, including the sender**; the sender uses this as the ack.
  - Invalid or over-limit actions get `reject {seq, reason}`.
  - `time` events are **host-only** and are relayed but not logged.
  - `piecePlaced.piece.store` is stripped to `[]`, because inventories are per-player.
- **`ping {at}`**: replied with `pong {at, server}`. Send one at least every 10 s. Sockets silent for more than 30 s are closed (code 4008) and enter grace.
- **`pingWheel`** and **`emote`**: relayed to all players. Limited to 5 burst, 1/s. Emotes: `wave thumbsup cheer point sit laugh shrug thanks`.
- **Malformed frames** get `error {error: 'bad_message'}`. More than ~20 in quick succession closes the socket (code 4007).

**Disconnects and reconnects**
- On disconnect, other players get `leave {id, grace: true}`. Show them as "reconnecting".
- Reconnecting within **60 s** with `hello` (including `resume`) restores the player at their last position, and everyone gets `join` again.
- After the grace period, players get `leave {id, grace: false}`. If the host left, the host role passes to the next earliest joiner.
  - There is no dedicated host-change message yet. Clients should recompute `host` as the earliest remaining player. `welcome.players` is in join order, and `join`/`leave` are delivered in order.
- A second connection for the same user replaces the first. The old socket closes with code 4001, and the player doesn't leave.

**Close codes**

| Code | Meaning |
|---|---|
| 4001 | replaced |
| 4003 | auth failed |
| 4004 | room full |
| 4005 | room not found |
| 4006 | update required |
| 4007 | protocol error |
| 4008 | timeout |
| 4009 | rate limited |

**Rooms idle for 7 days** with no players are wiped.

**Persistence.** The room log is for catch-up only. Long-term world state lives in each player's own save (the host's is canonical) through PlayerVault.

### Hibernation
- The room uses `ctx.acceptWebSocket` and the hibernation handlers, and has no `setInterval`.
- Per-socket state (user, last state, last message time, IP hash) lives in `serializeAttachment`, well under 16 KiB. The player roster, room meta and event chunks (50 events per key) live in storage.
- Alarms handle hello timeouts, heartbeats, grace expiry and idle wipe. They fire every 15 s while sockets are open.

## 7. HTTP API summary

All responses are JSON with `cache-control: no-store` and `x-content-type-options: nosniff`. Errors look like `{ok: false, error, message}`, where `message` is player-facing.

| Method & path | Auth | Body | Success | Notable errors |
|---|---|---|---|---|
| GET `/api/version` | – | – | `VersionResponse` | |
| POST `/api/claim` | – | `{username}` ≤2 KB | `ClaimResponse` | 400 `invalid_username` / `username_blocked` / `username_reserved`, 409 `username_taken`, 429 `rate_limited` |
| GET `/api/whoami` | ✓ | – | `WhoAmIResponse` | 401 `unauthorized` |
| POST `/api/recover` | – | `{username, recoveryCode}` | `ClaimResponse` (new token + rotated code) | 401 `invalid_recovery`, 429 |
| POST `/api/link/create` | ✓ | – | `LinkCreateResponse` | 429 |
| POST `/api/link/redeem` | – | `{code}` | `ClaimResponse` | 400 `invalid_link_code`, 429 |
| GET `/api/save` | ✓ | – | `SaveGetResponse` | 401 |
| PUT `/api/save` | ✓ | `SavePutRequest` ≤516 KB | `SavePutResponse` | 409 `conflict` (+`server`), 413 `save_too_large`, 400 `invalid_save`, 429 |
| POST `/api/room` | ✓ | optional `{seed}` | `RoomCreateResponse` | 503 `room_unavailable` |
| GET `/ws/room/:code` | in-band | WS upgrade | 101 | 426 when not a WS request; unknown room → 404 |

**Other general errors**
- 415 for any POST/PUT body that isn't `application/json`.
- 405 for the wrong method.
- 429 from the per-isolate IP bucket (120 burst, 2/s).
- 403 `origin_not_allowed` for a cross-origin `Origin` that isn't in `ALLOWED_ORIGINS`.

**Rate-limit caveat.** The Worker-level buckets are per isolate, so they are not global. The authoritative limits live inside the Durable Objects: claims and link redeems per IP-hash, auth failures per account × IP-hash, recovery attempts per account, save PUTs per user, and WS rates per player.

## 8. Testing
- `apps/server/test/*.test.ts` (Vitest, Node) covers:
  - `*Core` classes against an in-memory store
  - the real DO wrapper classes, with a stubbed `cloudflare:workers` module
  - full Worker routing, CORS and rate limits
  - fuzzed WS frames and saves
- Manual end-to-end check in real workerd: run `npx wrangler dev`, then run a scripted claim, save, conflict, room, two WebSocket clients, state, action, disconnect, resume and bad auth. This passed on 2026-11-04.
- `@cloudflare/vitest-pool-workers` was not adopted. The stubbed approach covers the logic, and workerd behavior was checked manually with `wrangler dev`.
- `npx wrangler deploy --dry-run` bundles to about 51 KiB (14 KiB gzipped).

## 9. Deploy (CI)

`.github/workflows/deploy.yml` runs on every push to `main`:
1. `npm ci` and `npm run check`.
2. If both `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` secrets exist, run `cloudflare/wrangler-action@v4` with `deploy` in `apps/server`. This uploads the Worker and `apps/game/dist`.
3. Smoke test against the live `deployment-url`: `/api/version` and `/` must return 200.
4. If the smoke test fails, run `wrangler rollback -y`. Workers keeps previous versions, so earlier builds stay available for rollback.

If either secret is missing, the workflow posts a warning and `pages-fallback.yml` ships the offline-only build to GitHub Pages instead.

**Before the first deploy**
- The API token needs **Workers Scripts: Edit**. Add Pages permissions only if you use the Pages option.
- The account must have a workers.dev subdomain. Without one, `deployment-url` is empty and the smoke step fails with a clear message.
