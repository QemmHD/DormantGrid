import 'fake-indexeddb/auto';
import { describe, expect, it, vi } from 'vitest';
import { newGame, saveToBase64 } from '@dg/sim';
import type { GameSave, SaveMeta } from '@dg/shared';
import { Bus } from '../game/api';
import { SaveStore } from '../save/store';
import { ApiClient, ApiFailure } from './api';
import { Account, usernameProblem } from './account';
import { CloudSync, decideStart } from './sync';
import { Updater, cmpVersion, type RegisterFn } from './updater';
import { CoopClient, normalizeCode, type WsLike } from './coop';

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const TOKEN = 'a'.repeat(64);
let dbn = 0;

function save(rev: number, playtime = 600, savedAt = 1000): GameSave {
  const g = newGame(1337, 'standard', { x: 10, z: 10 });
  g.rev = rev;
  g.playtime = playtime;
  g.savedAt = savedAt;
  return g;
}

/** Tiny in-memory fake of the Worker's save endpoints. */
function fakeServer() {
  const st = { meta: null as SaveMeta | null, data: null as string | null, puts: 0 };
  const fetchFn = vi.fn(async (url: string, init?: RequestInit) => {
    const path = url.replace('/api', '');
    if (path === '/whoami') return json(200, { ok: true, username: 'Rook', createdAt: 1 });
    if (path === '/claim') return json(200, { ok: true, username: JSON.parse(String(init?.body)).username, token: TOKEN, recoveryCode: 'RC-1' });
    if (path === '/save' && init?.method === 'GET') return json(200, { ok: true, meta: st.meta, data: st.data });
    if (path === '/save' && init?.method === 'PUT') {
      st.puts++;
      const req = JSON.parse(String(init.body));
      const serverRev = st.meta?.rev ?? 0;
      if (!req.force && (req.baseRev !== serverRev || req.meta.rev <= serverRev)) return json(409, { ok: false, error: 'conflict', message: 'conflict', server: st.meta });
      const meta = { ...req.meta };
      if (req.force) meta.rev = Math.max(meta.rev, serverRev + 1);
      st.meta = meta;
      st.data = req.data;
      return json(200, { ok: true, meta });
    }
    return json(404, { ok: false, error: 'not_found', message: 'nope' });
  });
  return { st, fetchFn };
}

async function rig(opts: { now?: () => number } = {}) {
  const srv = fakeServer();
  const bus = new Bus();
  const store = new SaveStore(bus, `dg-net-${++dbn}`);
  await store.open();
  const api = new ApiClient({ fetchFn: srv.fetchFn, offlineOnly: false });
  const account = new Account(api, store, bus);
  await account.claim('Rook');
  const sync = new CloudSync(api, store, account, bus, { now: opts.now, setTimer: () => 0, clearTimer: () => undefined });
  await sync.init();
  return { srv, bus, store, api, account, sync };
}

describe('username validation', () => {
  it('accepts good names and rejects bad ones', () => {
    expect(usernameProblem('Rook_42')).toBeNull();
    expect(usernameProblem('ab')).toMatch(/3/);
    expect(usernameProblem('a'.repeat(21))).toMatch(/20/);
    expect(usernameProblem('has space')).toMatch(/only/);
    expect(usernameProblem('sh1t_lord')).toMatch(/different/);
  });
});

describe('decideStart', () => {
  const s = (rev: number, playtime = 600, savedAt = 0) => ({ rev, playtime, savedAt });
  it.each([
    ['none', null, null, 0],
    ['local', s(5), null, 0],
    ['cloud', null, s(5), 0],
    ['local', s(8), s(5), 5], // cloud unchanged since last sync
    ['cloud', s(5), s(9), 5], // only cloud moved
    ['conflict', s(7), s(9), 5], // both moved
    ['cloud', s(2, 10), s(9), 0], // fresh device, throwaway local
    ['local', s(9), s(2, 10), 0], // cloud is throwaway
    ['conflict', s(9), s(4), 0], // never synced, both real
  ] as const)('%s', (want, local, cloud, rev) => {
    expect(decideStart(local, cloud, rev)).toBe(want);
  });
});

describe('CloudSync', () => {
  it('pushes, then throttles, and pushNow bypasses the throttle', async () => {
    let t = 1_000_000;
    const { sync, srv } = await rig({ now: () => t });
    const g = save(1);
    expect(await sync.push(g)).toBe('ok');
    expect(sync.cloudRev).toBe(1);
    g.rev = 2;
    expect(await sync.push(g)).toBe('throttled');
    expect(await sync.pushNow(g, 'sleep')).toBe('ok');
    t += 6 * 60_000;
    g.rev = 3;
    expect(await sync.push(g)).toBe('ok');
    expect(srv.st.puts).toBe(3);
  });

  it('conflict → keep device force-pushes; keep cloud loads the cloud save', async () => {
    const { sync, srv } = await rig();
    await sync.pushNow(save(1), 'x');
    // another device advances the cloud
    srv.st.meta = { rev: 9, schema: 1, savedAt: 5000, playtime: 999, bytes: 1 };
    srv.st.data = saveToBase64(save(9, 999, 5000));
    sync.onConflict = async () => 'device';
    const mine = save(2);
    expect(await sync.pushNow(mine, 'x')).toBe('conflict-device');
    expect(srv.st.meta!.rev).toBe(10);
    expect(mine.rev).toBe(10);
    // again, this time keep cloud
    srv.st.meta = { rev: 20, schema: 1, savedAt: 9000, playtime: 1500, bytes: 1 };
    srv.st.data = saveToBase64(save(20, 1500, 9000));
    sync.onConflict = async () => 'cloud';
    let loaded: GameSave | null = null;
    sync.onLoadSave = (s) => (loaded = s);
    expect(await sync.pushNow(save(11), 'x')).toBe('conflict-cloud');
    expect(loaded!.playtime).toBe(1500);
    expect(sync.cloudRev).toBe(20);
  });

  it('goes offline on network failure without throwing', async () => {
    const { sync, api } = await rig();
    (api as unknown as { fetchFn: () => Promise<Response> }).fetchFn = () => Promise.reject(new TypeError('net'));
    const statuses: string[] = [];
    expect(await sync.pushNow(save(1), 'x')).toBe('offline');
    expect(sync.status).toBe('offline');
    void statuses;
  });

  it('pullOnStart takes the cloud on a fresh device', async () => {
    const { sync, srv } = await rig();
    srv.st.meta = { rev: 4, schema: 1, savedAt: 1, playtime: 3000, bytes: 1 };
    srv.st.data = saveToBase64(save(4, 3000));
    const got = await sync.pullOnStart(save(1, 20));
    expect(got!.playtime).toBe(3000);
  });
});

describe('ApiClient', () => {
  it('maps errors and offline-only', async () => {
    const api = new ApiClient({ fetchFn: async () => json(429, { ok: false, error: 'rate_limited', message: 'Slow down.' }), offlineOnly: false });
    await expect(api.version()).rejects.toMatchObject({ status: 429, message: 'Slow down.' });
    const off = new ApiClient({ offlineOnly: true });
    await expect(off.version()).rejects.toBeInstanceOf(ApiFailure);
    const bad = new ApiClient({ fetchFn: async () => new Response('<html>', { status: 200 }), offlineOnly: false });
    await expect(bad.version()).rejects.toMatchObject({ code: 'bad_response' });
  });
});

describe('Updater', () => {
  it('applies only at safe moments and only when an update waits', async () => {
    let needRefresh: (() => void) | undefined;
    const update = vi.fn(async () => undefined);
    const register: RegisterFn = (o) => {
      needRefresh = o.onNeedRefresh;
      return update;
    };
    const mem = new Map<string, string>();
    const session = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v), removeItem: (k: string) => void mem.delete(k) };
    const u = new Updater(undefined, null, { register, session, reload: () => undefined });
    await u.init();
    expect(u.applyIfSafe(true)).toBe(false); // nothing waiting
    needRefresh!();
    expect(u.applyIfSafe(false)).toBe(false); // not safe
    expect(update).not.toHaveBeenCalled();
    expect(u.applyIfSafe(true)).toBe(true);
    expect(update).toHaveBeenCalledWith(true);
    expect(mem.get('dg.updated')).toBe('1');
  });
  it('compares versions', () => {
    expect(cmpVersion('0.1.0', '0.1.0')).toBe(0);
    expect(cmpVersion('0.1.0', '0.2.0')).toBe(-1);
    expect(cmpVersion('1.10.0', '1.9.9')).toBe(1);
  });
});

describe('CoopClient', () => {
  const mk = () => {
    const api = new ApiClient({ offlineOnly: false });
    api.creds = { user: 'Rook', token: TOKEN };
    const sent: string[] = [];
    let ws: WsLike | null = null;
    const c = new CoopClient(undefined, api, {
      wsFactory: () => {
        ws = { readyState: 1, send: (d) => sent.push(d), close: () => undefined, onopen: null, onmessage: null, onclose: null, onerror: null };
        return ws;
      },
      now: () => 0,
      setTimer: () => 0,
      clearTimer: () => undefined,
      origin: 'ws://x',
    });
    return { c, sent, ws: () => ws! };
  };

  it('interpolates remote players ~100ms behind', () => {
    const { c } = mk();
    const p = (x: number, seq: number) => ({ id: 'Ash', x, y: 0, z: 0, yaw: 0, anim: 1, seq });
    c.ingest(p(0, 1), 1000);
    c.ingest(p(10, 2), 1100);
    expect(c.sample('Ash', 1150)!.x).toBeCloseTo(5);
    expect(c.sample('Ash', 1100)!.x).toBeCloseTo(0);
    expect(c.sample('Ash', 900)!.x).toBe(0);
    // extrapolation is capped
    expect(c.sample('Ash', 5000)!.x).toBeLessThanOrEqual(30);
    // out-of-order snapshot ignored
    c.ingest(p(-50, 1), 1200);
    expect(c.sample('Ash', 1150)!.x).toBeCloseTo(5);
    expect(c.sample('nobody', 1000)).toBeNull();
  });

  it('hello on open, welcome, dedupes replayed events, never throws on junk', () => {
    const { c, sent, ws } = mk();
    expect(c.join('ab')).toBe(false);
    expect(c.join('abcd2')).toBe(true);
    ws().onopen!(null);
    expect(JSON.parse(sent[0]).t).toBe('hello');
    c.handleMessage(JSON.stringify({ t: 'welcome', you: 'Rook', host: 'Rook', players: [], resumeToken: 'r', hour: 7, seed: 1 }));
    expect(c.status).toBe('online');
    const got: number[] = [];
    c.onWorldEvent = (_ev, _from, _mine, seq) => got.push(seq);
    const evMsg = JSON.stringify({ t: 'event', from: 'Ash', seq: 3, ev: { type: 'propRemoved', id: 5 } });
    c.handleMessage(evMsg);
    c.handleMessage(evMsg);
    expect(got).toEqual([3]);
    for (const junk of ['', 'null', '[]', '{"t":5}', '{"t":"snapshot","players":"x"}', '{"t":"snapshot","players":[{"id":1}]}', '{"t":"event"}', '{"t":"leave"}', '{"t":"welcome"}', 'x'.repeat(300000), '{"t":"ping","from":"a","x":"q"}']) {
      expect(() => c.handleMessage(junk)).not.toThrow();
    }
    c.sendState({ x: 1, y: 0, z: 1, yaw: 0, anim: 1 }, true, 1000);
    c.sendState({ x: 1, y: 0, z: 1, yaw: 0, anim: 1 }, true, 1050); // rate limited
    expect(sent.filter((s) => JSON.parse(s).t === 'state').length).toBe(1);
  });

  it('stops reconnecting on fatal close codes and reports update-required', () => {
    const { c, ws } = mk();
    let upd = false;
    c.onUpdateRequired = () => (upd = true);
    c.join('ABCD2');
    ws().onclose!({ code: 4006 });
    expect(upd).toBe(true);
    expect(c.active).toBe(false);
    expect(normalizeCode(' abcd2 ')).toBe('ABCD2');
    expect(normalizeCode('ABCDI')).toBeNull();
  });
});
