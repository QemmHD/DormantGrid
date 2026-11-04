import { describe, expect, it } from 'vitest';
import { RECONNECT_GRACE_MS, type ClientMsg } from '@dg/shared';
import { MemoryStore } from '../src/store';
import { CLOSE, EVENT_LOG_MAX, HELLO_TIMEOUT_MS, ROOM_IDLE_WIPE_MS, RoomCore, STALE_MS } from '../src/room-core';
import { Clock, FakeSocket } from './helpers';

const TOKENS: Record<string, string> = { ash: 'a'.repeat(64), bob: 'b'.repeat(64), cyd: 'c'.repeat(64), dia: 'd'.repeat(64), eda: 'e'.repeat(64) };
const NAMES: Record<string, string> = { ash: 'Ash', bob: 'Bob', cyd: 'Cyd', dia: 'Dia', eda: 'Eda' };

function setup() {
  const clock = new Clock();
  const sockets: FakeSocket[] = [];
  const store = new MemoryStore();
  let alarm: number | null = null;
  const room = () =>
    new RoomCore({
      store,
      now: clock.now,
      sockets: () => sockets,
      authenticate: async (user, token) => (TOKENS[user.toLowerCase()] === token ? NAMES[user.toLowerCase()] : null),
      minClient: '0.1.0',
      setAlarm: async (at) => {
        alarm = at;
      },
    });
  return { clock, sockets, store, room, getAlarm: () => alarm };
}

function hello(user: string, extra: Partial<Extract<ClientMsg, { t: 'hello' }>> = {}): string {
  return JSON.stringify({ t: 'hello', user, token: TOKENS[user.toLowerCase()], clientVersion: '0.1.0', ...extra });
}

async function join(core: RoomCore, sockets: FakeSocket[], user: string, extra = {}) {
  const ws = new FakeSocket(sockets);
  await core.onOpen(ws, 'iph');
  await core.onMessage(ws, hello(user, extra));
  return ws;
}

function state(x: number, z: number, seq = 1): string {
  return JSON.stringify({ t: 'state', s: { id: 'spoof', x, y: 0, z, yaw: 0, anim: 1, seq } });
}

describe('RoomCore', () => {
  it('rejects hello to an uninitialized room', async () => {
    const { room, sockets } = setup();
    const core = room();
    const ws = await join(core, sockets, 'ash');
    expect(ws.closed?.code).toBe(CLOSE.notFound);
  });

  it('welcomes players, sets host, announces joins', async () => {
    const { room, sockets } = setup();
    const core = room();
    await core.init('ABCDE', 42, 'Ash');
    expect(await core.init('ABCDE', 1, 'X')).toBe(false);
    const a = await join(core, sockets, 'ash');
    const w = a.of('welcome')[0];
    expect(w).toMatchObject({ you: 'Ash', host: 'Ash', seed: 42 });
    expect(w.resumeToken).toMatch(/^[0-9a-f]{32}$/);
    const b = await join(core, sockets, 'bob');
    expect(b.of('welcome')[0].host).toBe('Ash');
    expect(a.of('join')[0].player.id).toBe('Bob');
  });

  it('rejects bad auth, old clients and non-hello first messages', async () => {
    const { room, sockets } = setup();
    const core = room();
    await core.init('ABCDE', 1, 'Ash');
    const bad = new FakeSocket(sockets);
    await core.onOpen(bad);
    await core.onMessage(bad, JSON.stringify({ t: 'hello', user: 'Ash', token: 'f'.repeat(64), clientVersion: '0.1.0' }));
    expect(bad.closed?.code).toBe(CLOSE.authFailed);
    const old = new FakeSocket(sockets);
    await core.onOpen(old);
    await core.onMessage(old, hello('ash', { clientVersion: '0.0.9' }));
    expect(old.closed?.code).toBe(CLOSE.updateRequired);
    const rude = new FakeSocket(sockets);
    await core.onOpen(rude);
    await core.onMessage(rude, state(1, 1));
    expect(rude.closed?.code).toBe(CLOSE.protocol);
  });

  it('caps the room at four players', async () => {
    const { room, sockets } = setup();
    const core = room();
    await core.init('ABCDE', 1, 'Ash');
    for (const u of ['ash', 'bob', 'cyd', 'dia']) await join(core, sockets, u);
    const e = await join(core, sockets, 'eda');
    expect(e.closed?.code).toBe(CLOSE.full);
    expect(e.of('error')[0].error).toBe('room_full');
  });

  it('relays states as batched snapshots with server-assigned ids and interest management', async () => {
    const { room, sockets, clock } = setup();
    const core = room();
    await core.init('ABCDE', 1, 'Ash');
    const a = await join(core, sockets, 'ash');
    const b = await join(core, sockets, 'bob');
    const c = await join(core, sockets, 'cyd');
    await core.onMessage(c, state(1000, 1000)); // far away
    clock.advance(150);
    await core.onMessage(a, state(10, 10));
    clock.advance(150);
    await core.onMessage(b, state(20, 20));
    const snaps = a.of('snapshot');
    expect(snaps.length).toBeGreaterThan(0);
    const last = snaps[snaps.length - 1];
    expect(last.players.map((p) => p.id)).toEqual(['Bob']); // Cyd is out of range, self excluded
    expect(JSON.stringify(a.sent)).not.toContain('spoof');
    // two states within 100 ms produce at most one snapshot
    const before = b.of('snapshot').length;
    await core.onMessage(a, state(11, 11, 2));
    await core.onMessage(a, state(12, 12, 3));
    expect(b.of('snapshot').length - before).toBeLessThanOrEqual(1);
  });

  it('validates, logs and relays actions; time is host-only', async () => {
    const { room, sockets } = setup();
    const core = room();
    await core.init('ABCDE', 1, 'Ash');
    const a = await join(core, sockets, 'ash');
    const b = await join(core, sockets, 'bob');
    await core.onMessage(b, JSON.stringify({ t: 'action', seq: 1, ev: { type: 'propRemoved', id: 77 } }));
    expect(a.of('event')[0]).toMatchObject({ from: 'Bob', seq: 1, ev: { type: 'propRemoved', id: 77 } });
    await core.onMessage(b, JSON.stringify({ t: 'action', seq: 2, ev: { type: 'time', hour: 9, weather: 'rain' } }));
    expect(b.of('reject')[0]).toMatchObject({ seq: 2, reason: 'host_only' });
    await core.onMessage(a, JSON.stringify({ t: 'action', seq: 1, ev: { type: 'time', hour: 9, weather: 'rain' } }));
    expect(b.of('event').some((e) => e.ev.type === 'time')).toBe(true);
    await core.onMessage(b, JSON.stringify({ t: 'action', seq: 3, ev: { type: 'launchNukes' } }));
    expect(b.of('error').length).toBe(1);
    // late joiner receives the replayed log (time is not logged)
    const c = await join(core, sockets, 'cyd');
    expect(c.of('event').map((e) => e.ev.type)).toEqual(['propRemoved']);
    expect(c.of('welcome')[0].hour).toBe(9);
  });

  it('strips storage contents from relayed piece placements', async () => {
    const { room, sockets } = setup();
    const core = room();
    await core.init('ABCDE', 1, 'Ash');
    const a = await join(core, sockets, 'ash');
    const piece = { id: 1, piece: 'storage', tier: 1, x: 1, y: 0, z: 1, rot: 0, hp: 100, store: [{ id: 'tool.torch', n: 99 }] };
    await core.onMessage(a, JSON.stringify({ t: 'action', seq: 1, ev: { type: 'piecePlaced', piece } }));
    const ev = a.of('event')[0].ev;
    expect(ev.type === 'piecePlaced' && ev.piece.store).toEqual([]);
  });

  it('rate-limits action spam and closes sockets spamming garbage', async () => {
    const { room, sockets } = setup();
    const core = room();
    await core.init('ABCDE', 1, 'Ash');
    const a = await join(core, sockets, 'ash');
    for (let i = 0; i < 60; i++) await core.onMessage(a, JSON.stringify({ t: 'action', seq: i, ev: { type: 'propRemoved', id: i } }));
    expect(a.of('reject').filter((r) => r.reason === 'rate_limited').length).toBeGreaterThan(0);
    for (let i = 0; i < 40 && !a.closed; i++) await core.onMessage(a, '{garbage');
    expect(a.closed?.code).toBe(CLOSE.protocol);
  });

  it('keeps players through a reconnect grace window and resumes them', async () => {
    const { room, sockets, clock } = setup();
    let core = room();
    await core.init('ABCDE', 1, 'Ash');
    const a = await join(core, sockets, 'ash');
    const b = await join(core, sockets, 'bob');
    await core.onMessage(b, state(50, 60));
    const resume = b.of('welcome')[0].resumeToken;
    b.close(1006, 'gone');
    await core.onClose(b);
    expect(a.of('leave')[0]).toEqual({ t: 'leave', id: 'Bob', grace: true });
    // hibernation: new core instance rebuilt from storage + attachments
    core = room();
    clock.advance(RECONNECT_GRACE_MS / 2);
    await core.alarm();
    expect(a.of('leave').length).toBe(1);
    const b2 = await join(core, sockets, 'bob', { resume });
    const w = b2.of('welcome')[0];
    expect(w.players.find((p) => p.id === 'Bob')).toMatchObject({ x: 50, z: 60 });
    expect(w.host).toBe('Ash');
    expect(core.resumes).toBe(1);
    expect(a.of('join').filter((j) => j.player.id === 'Bob').length).toBe(2);
  });

  it('removes players after the grace window and hands host to the next player', async () => {
    const { room, sockets, clock } = setup();
    const core = room();
    await core.init('ABCDE', 1, 'Ash');
    const a = await join(core, sockets, 'ash');
    clock.advance(10);
    const b = await join(core, sockets, 'bob');
    a.close(1006, 'gone');
    await core.onClose(a);
    clock.advance(RECONNECT_GRACE_MS + 1);
    // keep Bo fresh so the heartbeat check doesn't drop them
    await core.onMessage(b, JSON.stringify({ t: 'ping', at: 1 }));
    await core.alarm();
    expect(b.of('leave').at(-1)).toEqual({ t: 'leave', id: 'Ash', grace: false });
    expect(core.hostUser()).toBe('Bob');
    expect(core.playerCount()).toBe(1);
  });

  it('a second connection for the same user replaces the first', async () => {
    const { room, sockets } = setup();
    const core = room();
    await core.init('ABCDE', 1, 'Ash');
    const a1 = await join(core, sockets, 'ash');
    const a2 = await join(core, sockets, 'ash');
    expect(a1.closed?.code).toBe(CLOSE.replaced);
    await core.onClose(a1);
    expect(core.playerCount()).toBe(1);
    expect(a2.closed).toBeNull();
  });

  it('times out silent sockets and sockets that never say hello', async () => {
    const { room, sockets, clock } = setup();
    const core = room();
    await core.init('ABCDE', 1, 'Ash');
    const a = await join(core, sockets, 'ash');
    const lurker = new FakeSocket(sockets);
    await core.onOpen(lurker);
    clock.advance(HELLO_TIMEOUT_MS + 1);
    await core.alarm();
    expect(lurker.closed?.code).toBe(CLOSE.timeout);
    expect(a.closed).toBeNull();
    clock.advance(STALE_MS + 1);
    await core.alarm();
    expect(a.closed?.code).toBe(CLOSE.timeout);
  });

  it('caps the event log and wipes idle rooms', async () => {
    const { room, sockets, clock } = setup();
    const core = room();
    await core.init('ABCDE', 1, 'Ash');
    const a = await join(core, sockets, 'ash');
    for (let i = 0; i < EVENT_LOG_MAX + 120; i++) {
      clock.advance(200); // stay under the action rate limit
      await core.onMessage(a, JSON.stringify({ t: 'action', seq: i, ev: { type: 'propRemoved', id: i } }));
    }
    const evs = await core.events();
    expect(evs.length).toBe(EVENT_LOG_MAX);
    expect(evs[0].seq).toBe(120);
    expect(evs.at(-1)!.seq).toBe(EVENT_LOG_MAX + 119);
    a.close(1000, 'bye');
    await core.onClose(a);
    clock.advance(RECONNECT_GRACE_MS + 1);
    expect((await core.alarm()).wipe).toBe(false);
    clock.advance(ROOM_IDLE_WIPE_MS);
    expect((await core.alarm()).wipe).toBe(true);
  });

  it('fuzz: random frames never throw out of the handler', async () => {
    const { room, sockets } = setup();
    const core = room();
    await core.init('ABCDE', 1, 'Ash');
    const a = await join(core, sockets, 'ash');
    let seed = 7;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    const types = ['state', 'action', 'ping', 'pingWheel', 'emote', 'hello', 'nope'];
    for (let i = 0; i < 2000; i++) {
      const m: Record<string, unknown> = { t: types[Math.floor(rnd() * types.length)] };
      if (rnd() < 0.5) m.s = { x: rnd() * 1e6 - 5e5, z: 'a', yaw: NaN, anim: rnd() * 20, seq: -1 };
      if (rnd() < 0.5) m.ev = { type: ['propRemoved', 'piecePlaced', 'time'][Math.floor(rnd() * 3)], id: rnd() * 1e9, piece: rnd() < 0.5 ? {} : null };
      if (rnd() < 0.5) m.seq = Math.floor(rnd() * 100);
      await expect(core.onMessage(a, JSON.stringify(m))).resolves.toBeUndefined();
    }
  });
});
