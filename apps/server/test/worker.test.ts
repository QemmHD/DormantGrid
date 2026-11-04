import { describe, expect, it } from 'vitest';
import { deflateSync } from 'node:zlib';
import worker, { AccountRegistry, PlayerVault, WorldRoom } from '../src/index';
import type { Env } from '../src/env';
import { FakeStorage } from './helpers';
import type { ClaimResponse, LinkCreateResponse, SaveGetResponse, SavePutResponse } from '@dg/shared';

type Ctor<T> = new (ctx: never, env: Env) => T;

function namespace<T>(Cls: Ctor<T>, envRef: { env: Env | null }) {
  const objs = new Map<string, T>();
  return {
    idFromName: (n: string) => n,
    get: (id: string) => {
      let o = objs.get(id);
      if (!o) {
        const ctx = { storage: new FakeStorage(), getWebSockets: () => [], acceptWebSocket: () => undefined };
        o = new Cls(ctx as never, envRef.env!);
        objs.set(id, o);
      }
      return o;
    },
  };
}

function makeEnv(): Env {
  const ref: { env: Env | null } = { env: null };
  const env = {
    ACCOUNT_REGISTRY: namespace(AccountRegistry, ref),
    PLAYER_VAULT: namespace(PlayerVault, ref),
    WORLD_ROOM: namespace(WorldRoom, ref),
    MIN_CLIENT: '0.1.0',
  } as unknown as Env;
  ref.env = env;
  return env;
}

let ipCounter = 0;
function req(path: string, init: RequestInit & { ip?: string } = {}): Request {
  const headers = new Headers(init.headers);
  headers.set('CF-Connecting-IP', init.ip ?? `10.0.0.${++ipCounter % 250}`);
  if (init.body && !headers.has('content-type')) headers.set('content-type', 'application/json');
  return new Request(`https://dormant-grid.example.workers.dev${path}`, { ...init, headers });
}

async function call<T>(env: Env, path: string, init: RequestInit & { ip?: string } = {}): Promise<{ status: number; body: T; res: Response }> {
  const res = await worker.fetch(req(path, init), env);
  return { status: res.status, body: (await res.json()) as T, res };
}

function auth(c: ClaimResponse): Record<string, string> {
  return { 'X-DG-User': c.username, Authorization: `Bearer ${c.token}` };
}

function saveBody(rev: number, baseRev: number, force = false) {
  const data = deflateSync(Buffer.from(JSON.stringify({ schema: 1, rev }))).toString('base64');
  return JSON.stringify({ baseRev, force, data, meta: { rev, schema: 1, savedAt: Date.now(), playtime: 60 * rev, bytes: 0 } });
}

describe('worker routes (integration with DO wrappers)', () => {
  it('serves /api/version', async () => {
    const env = makeEnv();
    const r = await call<{ ok: boolean; minClient: string }>(env, '/api/version');
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ ok: true, minClient: '0.1.0' });
    expect(r.res.headers.get('x-content-type-options')).toBe('nosniff');
  });

  it('claim -> whoami -> save round trip -> conflict -> force', async () => {
    const env = makeEnv();
    const claim = await call<ClaimResponse>(env, '/api/claim', { method: 'POST', body: JSON.stringify({ username: 'Rook_9' }) });
    expect(claim.status).toBe(200);
    const dup = await call<{ error: string }>(env, '/api/claim', { method: 'POST', body: JSON.stringify({ username: 'rook_9' }) });
    expect(dup.status).toBe(409);
    expect(dup.body.error).toBe('username_taken');
    const who = await call<{ username: string }>(env, '/api/whoami', { headers: auth(claim.body) });
    expect(who.body.username).toBe('Rook_9');
    const empty = await call<SaveGetResponse>(env, '/api/save', { headers: auth(claim.body) });
    expect(empty.body).toEqual({ ok: true, meta: null, data: null });
    const p1 = await call<SavePutResponse>(env, '/api/save', { method: 'PUT', headers: auth(claim.body), body: saveBody(1, 0) });
    expect(p1.status).toBe(200);
    expect(p1.body.meta.rev).toBe(1);
    const conflict = await call<{ error: string; server: { rev: number } }>(env, '/api/save', { method: 'PUT', headers: auth(claim.body), body: saveBody(2, 0) });
    expect(conflict.status).toBe(409);
    expect(conflict.body).toMatchObject({ error: 'conflict', server: { rev: 1 } });
    const forced = await call<SavePutResponse>(env, '/api/save', { method: 'PUT', headers: auth(claim.body), body: saveBody(2, 0, true) });
    expect(forced.body.meta.rev).toBe(2);
    const got = await call<SaveGetResponse>(env, '/api/save', { headers: auth(claim.body) });
    expect(got.body.meta?.rev).toBe(2);
  });

  it('rejects bad auth, wrong content type, oversized and malformed bodies', async () => {
    const env = makeEnv();
    expect((await call(env, '/api/whoami')).status).toBe(401);
    expect((await call(env, '/api/whoami', { headers: { 'X-DG-User': 'Nobody', Authorization: `Bearer ${'a'.repeat(64)}` } })).status).toBe(401);
    expect((await call(env, '/api/claim', { method: 'POST', body: 'username=x', headers: { 'content-type': 'text/plain' } })).status).toBe(415);
    expect((await call(env, '/api/claim', { method: 'POST', body: '{nope' })).status).toBe(400);
    expect((await call(env, '/api/claim', { method: 'POST', body: JSON.stringify({ username: 'x'.repeat(5000) }) })).status).toBe(413);
    expect((await call(env, '/api/claim', { method: 'GET' })).status).toBe(405);
    expect((await call(env, '/api/nope')).status).toBe(404);
  });

  it('recovery and link-device flows issue working tokens', async () => {
    const env = makeEnv();
    const c = (await call<ClaimResponse>(env, '/api/claim', { method: 'POST', body: JSON.stringify({ username: 'Wren' }) })).body;
    const rec = await call<ClaimResponse>(env, '/api/recover', { method: 'POST', body: JSON.stringify({ username: 'WREN', recoveryCode: c.recoveryCode }) });
    expect(rec.status).toBe(200);
    expect((await call(env, '/api/whoami', { headers: auth(rec.body) })).status).toBe(200);
    const again = await call(env, '/api/recover', { method: 'POST', body: JSON.stringify({ username: 'Wren', recoveryCode: c.recoveryCode }) });
    expect(again.status).toBe(401);
    const link = await call<LinkCreateResponse>(env, '/api/link/create', { method: 'POST', headers: auth(c) });
    expect(link.body.code).toMatch(/^[A-Z0-9]{3}-[A-Z0-9]{3}$/);
    const red = await call<ClaimResponse>(env, '/api/link/redeem', { method: 'POST', body: JSON.stringify({ code: link.body.code }) });
    expect(red.status).toBe(200);
    expect(red.body.username).toBe('Wren');
    expect((await call(env, '/api/whoami', { headers: auth(red.body) })).status).toBe(200);
    expect((await call(env, '/api/link/redeem', { method: 'POST', body: JSON.stringify({ code: link.body.code }) })).status).toBe(400);
  });

  it('creates rooms and refuses non-websocket room requests', async () => {
    const env = makeEnv();
    const c = (await call<ClaimResponse>(env, '/api/claim', { method: 'POST', body: JSON.stringify({ username: 'Moss' }) })).body;
    const room = await call<{ code: string }>(env, '/api/room', { method: 'POST', headers: { ...auth(c), 'content-type': 'application/json' }, body: JSON.stringify({ seed: 1234 }) });
    expect(room.status).toBe(200);
    expect(room.body.code).toMatch(/^[A-Z2-9]{5}$/);
    expect((await call(env, `/ws/room/${room.body.code}`)).status).toBe(426);
    expect((await call(env, '/api/room', { method: 'POST', headers: auth(c), body: JSON.stringify({ seed: -1 }) })).status).toBe(400);
  });

  it('enforces CORS allowlist', async () => {
    const env = makeEnv();
    const ok = await worker.fetch(req('/api/version', { headers: { Origin: 'http://localhost:5173' } }), env);
    expect(ok.headers.get('access-control-allow-origin')).toBe('http://localhost:5173');
    const pre = await worker.fetch(req('/api/save', { method: 'OPTIONS', headers: { Origin: 'http://localhost:5173' } }), env);
    expect(pre.status).toBe(204);
    const bad = await worker.fetch(req('/api/version', { headers: { Origin: 'https://evil.example' } }), env);
    expect(bad.status).toBe(403);
    const same = await worker.fetch(req('/api/version', { headers: { Origin: 'https://dormant-grid.example.workers.dev' } }), env);
    expect(same.status).toBe(200);
    expect(same.headers.get('access-control-allow-origin')).toBeNull();
  });

  it('per-IP rate limit kicks in', async () => {
    const env = makeEnv();
    let limited = false;
    for (let i = 0; i < 200 && !limited; i++) limited = (await worker.fetch(req('/api/version', { ip: '9.9.9.9' }), env)).status === 429;
    expect(limited).toBe(true);
  });

  it('non-API paths fall through to assets', async () => {
    const env = { ...makeEnv(), ASSETS: { fetch: async () => new Response('game') } } as unknown as Env;
    const res = await worker.fetch(req('/index.html'), env);
    expect(await res.text()).toBe('game');
  });
});
