// Runs only with DG_E2E=http://localhost:8799 against `wrangler dev` (apps/server).
import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { newGame } from '@dg/sim';
import { Bus } from '../game/api';
import { SaveStore } from '../save/store';
import { ApiClient } from './api';
import { Account } from './account';
import { CloudSync } from './sync';
import { CoopClient, type WsLike } from './coop';

const BASE = process.env.DG_E2E;

describe.skipIf(!BASE)('e2e against wrangler dev', () => {
  it('claim → save → second device link → conflict → co-op', async () => {
    const mk = async (n: string) => {
      const bus = new Bus();
      const store = new SaveStore(bus, `e2e-${n}-${Date.now()}`);
      await store.open();
      const api = new ApiClient({ base: `${BASE}/api`, offlineOnly: false });
      const account = new Account(api, store, bus);
      const sync = new CloudSync(api, store, account, bus);
      await sync.init();
      return { store, api, account, sync };
    };
    const a = await mk('a');
    const name = `e2e_${Math.random().toString(36).slice(2, 9)}`;
    const rc = await a.account.claim(name);
    expect(rc.length).toBeGreaterThan(5);
    expect(await a.account.init()).toBe('signed-in');
    const g = newGame(1, 'standard', { x: 5, z: 5 });
    g.rev = 1;
    g.playtime = 500;
    expect(await a.sync.pushNow(g, 't')).toBe('ok');

    const link = await a.account.createLink();
    const b = await mk('b');
    await b.account.redeemLink(link.code);
    const got = await b.sync.pullOnStart(null);
    expect(got?.playtime).toBe(500);

    // b advances, a advances too → a gets a conflict
    got!.rev += 1;
    got!.playtime = 900;
    expect(await b.sync.pushNow(got!, 't')).toBe('ok');
    g.rev = 2;
    a.sync.onConflict = async () => 'device';
    expect(await a.sync.pushNow(g, 't')).toBe('conflict-device');

    // co-op: two clients in one room
    const WS = (globalThis as unknown as { WebSocket: new (u: string) => WsLike }).WebSocket;
    const wsOrigin = BASE!.replace('http', 'ws');
    const ca = new CoopClient(undefined, a.api, { wsFactory: (u) => new WS(u), origin: wsOrigin });
    const cb = new CoopClient(undefined, b.api, { wsFactory: (u) => new WS(u), origin: wsOrigin });
    void ca;
    const code = await ca.hostRoom(42);
    await new Promise((r) => setTimeout(r, 500));
    expect(ca.status).toBe('online');
    // b is the same user on another device → server replaces; use a second account instead
    const c2 = await mk('c');
    await c2.account.claim(`${name}x`.slice(0, 20));
    const cc = new CoopClient(undefined, c2.api, { wsFactory: (u) => new WS(u), origin: wsOrigin });
    const events: string[] = [];
    cc.onWorldEvent = (ev, from) => events.push(`${from}:${ev.type}`);
    cc.join(code);
    await new Promise((r) => setTimeout(r, 600));
    expect(cc.status).toBe('online');
    ca.sendAction({ type: 'propRemoved', id: 12 });
    ca.sendState({ x: 100, y: 0, z: 100, yaw: 0, anim: 1 }, true, 1e9);
    await new Promise((r) => setTimeout(r, 600));
    expect(events).toContain(`${ca.me}:propRemoved`);
    expect(cc.playerIds).toContain(ca.me);
    ca.leave();
    cc.leave();
    void cb;
  }, 30000);
});
