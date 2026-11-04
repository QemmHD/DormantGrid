// DORMANT GRID API Worker. Routes /api/* and /ws/room/:code; everything else is the
// static game build served by Workers Static Assets (see wrangler.jsonc).

import {
  API_VERSION,
  GAME_VERSION,
  MAX_SAVE_BYTES,
  USERNAME_RE,
  type ClaimResponse,
  type LinkCreateResponse,
  type RoomCreateResponse,
  type SaveGetResponse,
  type SavePutResponse,
  type VersionResponse,
  type WhoAmIResponse,
} from '@dg/shared';
import type { Env } from './env';
import { unwrap } from './rpc';
import { HttpError, TokenBucket, errorResponse, isRecord, json, originAllowed, randomCode, readJson, sha256Hex } from './util';
import { ROOM_CODE_RE, TOKEN_RE, validateSavePut, validateUsername } from './validate';

export { AccountRegistry, PlayerVault, WorldRoom } from './durable';

const SMALL_BODY = 2 * 1024;
// base64 save + JSON envelope
const SAVE_BODY = MAX_SAVE_BYTES + 4 * 1024;

// Per-isolate limits. Cloudflare runs many isolates, so these are a first line of defense;
// the per-object limits inside the Durable Objects are the authoritative ones.
const ipBucket = new TokenBucket(120, 2); // 120 burst, 2/s sustained
const wsBucket = new TokenBucket(10, 0.2);

const DEFAULT_ORIGINS = 'https://dormant-grid.pages.dev,https://*.dormant-grid.pages.dev,http://localhost:*,http://127.0.0.1:*';

function corsHeaders(origin: string): Record<string, string> {
  return {
    'access-control-allow-origin': origin,
    'access-control-allow-methods': 'GET, PUT, POST, OPTIONS',
    'access-control-allow-headers': 'content-type, authorization, x-dg-user',
    'access-control-max-age': '600',
    vary: 'Origin',
  };
}

/** Returns the origin to echo for CORS, '' for same-origin/no-origin, or throws 403. */
function checkOrigin(req: Request, env: Env): string {
  const origin = req.headers.get('Origin');
  if (!origin) return '';
  const self = new URL(req.url).origin;
  if (origin === self) return '';
  const patterns = (env.ALLOWED_ORIGINS ?? DEFAULT_ORIGINS).split(',');
  if (originAllowed(origin, patterns)) return origin;
  throw new HttpError(403, 'origin_not_allowed', 'This origin may not call the API.');
}

async function ipHash(req: Request): Promise<string> {
  const ip = req.headers.get('CF-Connecting-IP') ?? 'unknown';
  return (await sha256Hex('dg-ip-v1', ip)).slice(0, 16);
}

function vault(env: Env, key: string) {
  return env.PLAYER_VAULT.get(env.PLAYER_VAULT.idFromName(key));
}
function registry(env: Env) {
  return env.ACCOUNT_REGISTRY.get(env.ACCOUNT_REGISTRY.idFromName('global'));
}

/** Read X-DG-User + Bearer token. Returns the lowercase key and token (not yet verified). */
function credentials(req: Request): { key: string; token: string } {
  const user = req.headers.get('X-DG-User') ?? '';
  const auth = req.headers.get('Authorization') ?? '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  if (!USERNAME_RE.test(user) || !TOKEN_RE.test(token)) {
    throw new HttpError(401, 'unauthorized', 'This device is not signed in.');
  }
  return { key: user.toLowerCase(), token };
}

async function authed(req: Request, env: Env): Promise<{ key: string; token: string; ip: string; username: string; createdAt: number }> {
  const { key, token } = credentials(req);
  const ip = await ipHash(req);
  const who = unwrap(await vault(env, key).auth(token, ip));
  return { key, token, ip, ...who };
}

function method(req: Request, ...allowed: string[]): void {
  if (!allowed.includes(req.method)) throw new HttpError(405, 'method_not_allowed', 'Method not allowed.');
}

async function handleApi(req: Request, env: Env, path: string): Promise<Response> {
  switch (path) {
    case '/api/version': {
      method(req, 'GET');
      const body: VersionResponse = { ok: true, minClient: env.MIN_CLIENT ?? '0.1.0', latest: env.LATEST_CLIENT ?? GAME_VERSION };
      return json(body, 200, { 'cache-control': 'no-store', 'x-dg-api': String(API_VERSION) });
    }
    case '/api/claim': {
      method(req, 'POST');
      const body = await readJson(req, SMALL_BODY);
      if (!isRecord(body)) throw new HttpError(400, 'bad_request', 'Malformed request.');
      const { display, key } = validateUsername(body.username);
      const ip = await ipHash(req);
      const rec = unwrap(await registry(env).claim(display, key, ip));
      const created = await vault(env, key).create(display, key);
      if (!created.ok) {
        await registry(env).release(key, rec.createdAt);
        unwrap(created);
      }
      const creds = unwrap(created);
      const res: ClaimResponse = { ok: true, ...creds };
      return json(res);
    }
    case '/api/whoami': {
      method(req, 'GET');
      const a = await authed(req, env);
      const res: WhoAmIResponse = { ok: true, username: a.username, createdAt: a.createdAt };
      return json(res);
    }
    case '/api/recover': {
      method(req, 'POST');
      const body = await readJson(req, SMALL_BODY);
      if (!isRecord(body) || typeof body.username !== 'string' || typeof body.recoveryCode !== 'string') {
        throw new HttpError(400, 'bad_request', 'Enter your username and recovery code.');
      }
      if (!USERNAME_RE.test(body.username) || body.recoveryCode.length > 64) {
        throw new HttpError(401, 'invalid_recovery', 'That recovery code does not match this username.');
      }
      const creds = unwrap(await vault(env, body.username.toLowerCase()).recover(body.recoveryCode));
      const res: ClaimResponse = { ok: true, ...creds };
      return json(res);
    }
    case '/api/link/create': {
      method(req, 'POST');
      const a = await authed(req, env);
      const link = unwrap(await registry(env).createLink(a.key));
      const res: LinkCreateResponse = { ok: true, ...link };
      return json(res);
    }
    case '/api/link/redeem': {
      method(req, 'POST');
      const body = await readJson(req, SMALL_BODY);
      if (!isRecord(body) || typeof body.code !== 'string' || body.code.length > 32) {
        throw new HttpError(400, 'bad_request', 'Enter the code shown on your other device.');
      }
      const ip = await ipHash(req);
      const { key } = unwrap(await registry(env).redeemLink(body.code, ip));
      const creds = unwrap(await vault(env, key).addDevice());
      const res: ClaimResponse = { ok: true, ...creds };
      return json(res);
    }
    case '/api/save': {
      method(req, 'GET', 'PUT');
      const { key, token } = credentials(req);
      const ip = await ipHash(req);
      if (req.method === 'GET') {
        const s = unwrap(await vault(env, key).getSave(token, ip));
        const res: SaveGetResponse = { ok: true, meta: s.meta, data: s.data };
        return json(res);
      }
      const put = validateSavePut(await readJson(req, SAVE_BODY));
      const meta = unwrap(await vault(env, key).putSave(token, ip, put));
      const res: SavePutResponse = { ok: true, meta };
      return json(res);
    }
    case '/api/room': {
      method(req, 'POST');
      const a = await authed(req, env);
      let seed = Math.floor(Math.random() * 2 ** 31);
      const ct = req.headers.get('content-type') ?? '';
      if (ct.startsWith('application/json')) {
        const body = await readJson(req, SMALL_BODY);
        if (isRecord(body) && body.seed !== undefined) {
          if (typeof body.seed !== 'number' || !Number.isInteger(body.seed) || body.seed < 0 || body.seed > 0xffffffff) {
            throw new HttpError(400, 'bad_request', 'seed must be a 32-bit unsigned integer.');
          }
          seed = body.seed;
        }
      }
      for (let i = 0; i < 6; i++) {
        const code = randomCode(5);
        const stub = env.WORLD_ROOM.get(env.WORLD_ROOM.idFromName(code));
        if (unwrap(await stub.init(code, seed, a.username))) {
          const res: RoomCreateResponse = { ok: true, code };
          return json(res);
        }
      }
      throw new HttpError(503, 'room_unavailable', 'Could not create a room. Try again.');
    }
    default:
      throw new HttpError(404, 'not_found', 'Unknown API route.');
  }
}

async function handleWs(req: Request, env: Env, code: string): Promise<Response> {
  if (req.headers.get('Upgrade')?.toLowerCase() !== 'websocket') {
    throw new HttpError(426, 'upgrade_required', 'Expected a WebSocket upgrade.');
  }
  const c = code.toUpperCase();
  if (!ROOM_CODE_RE.test(c)) throw new HttpError(404, 'room_not_found', 'That room code does not exist.');
  const stub = env.WORLD_ROOM.get(env.WORLD_ROOM.idFromName(c));
  const headers = new Headers(req.headers);
  headers.set('X-DG-IPH', await ipHash(req)); // overwrite anything a client sent
  return stub.fetch(new Request(req.url, { method: 'GET', headers }));
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    const path = url.pathname;
    const isApi = path.startsWith('/api/');
    const wsMatch = /^\/ws\/room\/([A-Za-z0-9]{1,16})\/?$/.exec(path);
    if (!isApi && !wsMatch) {
      if (env.ASSETS) return env.ASSETS.fetch(req);
      return new Response('Not found', { status: 404 });
    }
    let cors = '';
    try {
      cors = checkOrigin(req, env);
      if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors ? corsHeaders(cors) : {} });
      const ip = req.headers.get('CF-Connecting-IP') ?? 'unknown';
      const now = Date.now();
      if (wsMatch) {
        if (!wsBucket.take(ip, now)) throw new HttpError(429, 'rate_limited', 'Too many connection attempts.');
        return await handleWs(req, env, wsMatch[1]);
      }
      if (!ipBucket.take(ip, now)) throw new HttpError(429, 'rate_limited', 'Too many requests. Slow down a little.');
      const res = await handleApi(req, env, path);
      return withHeaders(res, cors);
    } catch (e) {
      return withHeaders(errorResponse(e), cors);
    }
  },
} satisfies ExportedHandler<Env>;

function withHeaders(res: Response, cors: string): Response {
  const h = new Headers(res.headers);
  h.set('x-content-type-options', 'nosniff');
  if (cors) for (const [k, v] of Object.entries(corsHeaders(cors))) h.set(k, v);
  return new Response(res.body, { status: res.status, headers: h });
}
