// WorldRoom logic: one object per co-op run (2–4 players). Host-client authority:
// the host's phone runs the sim; this object authenticates, validates, relays,
// rate-limits, and keeps a capped event log so (re)joining players can catch up.

import {
  MAX_WS_MSG_BYTES,
  NET_TICK_HZ,
  RECONNECT_GRACE_MS,
  ROOM_MAX_PLAYERS,
  type ClientMsg,
  type NetPlayerState,
  type ServerMsg,
  type WorldEvent,
} from '@dg/shared';
import type { Store } from './store';
import { parseClientMsg, validatePlayerState } from './validate';
import { TokenBucket, compareVersions, randomBytes, toHex } from './util';

export interface SocketAttachment {
  /** username (display) once authenticated; null while waiting for hello */
  user: string | null;
  openedAt: number;
  lastMsg: number;
  state: NetPlayerState | null;
  /** salted hash of the client IP, used for per-IP auth failure limits */
  ip: string;
}

/** Abstract socket so this logic is testable without workerd. */
export interface RoomSocket {
  send(data: string): void;
  close(code: number, reason: string): void;
  getAttachment(): SocketAttachment | null;
  setAttachment(a: SocketAttachment): void;
}

export interface RoomMeta {
  code: string;
  seed: number;
  createdAt: number;
  creator: string;
  hour: number;
  weather: string;
  eventCount: number;
  lastActive: number;
}

interface PlayerRecord {
  user: string;
  joinedAt: number;
  resumeToken: string;
  /** set while disconnected inside the grace window */
  graceUntil: number | null;
  last: NetPlayerState;
}

export interface RoomDeps {
  store: Store;
  now: () => number;
  /** All currently open sockets (hibernation-safe; read from the runtime). */
  sockets: () => RoomSocket[];
  /** Verify a device token; returns canonical display name or null. */
  authenticate: (user: string, token: string, ipHash: string) => Promise<string | null>;
  minClient: string;
  setAlarm: (at: number) => Promise<void>;
}

export const EVENT_LOG_MAX = 2000;
const EVENT_CHUNK = 50;
export const INTEREST_RADIUS = 200;
export const HELLO_TIMEOUT_MS = 10_000;
export const STALE_MS = 30_000;
export const ALARM_INTERVAL_MS = 15_000;
export const META_FLUSH_MS = 30_000;
export const ROOM_IDLE_WIPE_MS = 7 * 24 * 3600_000;
const SNAPSHOT_MS = 1000 / NET_TICK_HZ;

// WebSocket close codes (4000-4999 application range)
export const CLOSE = {
  replaced: 4001,
  authFailed: 4003,
  full: 4004,
  notFound: 4005,
  updateRequired: 4006,
  protocol: 4007,
  timeout: 4008,
  rateLimited: 4009,
} as const;

export class RoomCore {
  private meta: RoomMeta | null = null;
  private players = new Map<string, PlayerRecord>(); // key = lowercase user
  private loaded = false;
  private lastSnapshot = 0;
  private lastMetaFlush = 0;
  private metaDirty = false;
  /** count of successful fast resumes (for tests/metrics) */
  resumes = 0;
  private stateBuckets = new TokenBucket(NET_TICK_HZ * 2, NET_TICK_HZ * 1.5);
  private actionBuckets = new TokenBucket(30, 10);
  private chatBuckets = new TokenBucket(5, 1);
  private badMsgBuckets = new TokenBucket(20, 2);
  /** in-memory cache of the current (last, partial) event chunk */
  private chunkCache: { idx: number; events: StoredEvent[] } | null = null;

  constructor(private readonly d: RoomDeps) {}

  // ---------- lifecycle ----------

  async load(): Promise<void> {
    if (this.loaded) return;
    this.meta = (await this.d.store.get<RoomMeta>('meta')) ?? null;
    if (this.meta) {
      // meta is flushed lazily, so eventCount may lag: recount from the chunk keys.
      let idx = Math.floor(this.meta.eventCount / EVENT_CHUNK);
      for (;;) {
        const chunk = await this.d.store.get<StoredEvent[]>(`ev:${idx}`);
        if (!chunk) break;
        this.meta.eventCount = idx * EVENT_CHUNK + chunk.length;
        if (chunk.length < EVENT_CHUNK) break;
        idx++;
      }
    }
    const players = (await this.d.store.get<PlayerRecord[]>('players')) ?? [];
    this.players = new Map(players.map((p) => [p.user.toLowerCase(), p]));
    // Merge latest positions from socket attachments (survive hibernation).
    for (const ws of this.d.sockets()) {
      const a = ws.getAttachment();
      if (a?.user && a.state) {
        const p = this.players.get(a.user.toLowerCase());
        if (p) p.last = a.state;
      }
    }
    this.loaded = true;
  }

  async init(code: string, seed: number, creator: string): Promise<boolean> {
    await this.load();
    if (this.meta) return false;
    const t = this.d.now();
    this.meta = { code, seed, createdAt: t, creator, hour: 7, weather: 'clear', eventCount: 0, lastActive: t };
    await this.d.store.put('meta', this.meta);
    await this.d.setAlarm(t + ROOM_IDLE_WIPE_MS);
    return true;
  }

  getMeta(): RoomMeta | null {
    return this.meta;
  }

  /** Called when a new socket is accepted (before hello). */
  async onOpen(ws: RoomSocket, ipHash = ''): Promise<void> {
    await this.load();
    const t = this.d.now();
    ws.setAttachment({ user: null, openedAt: t, lastMsg: t, state: null, ip: ipHash });
    await this.d.setAlarm(t + HELLO_TIMEOUT_MS);
  }

  // ---------- helpers ----------

  private send(ws: RoomSocket, msg: ServerMsg): void {
    try {
      ws.send(JSON.stringify(msg));
    } catch {
      // socket already closing; ignore
    }
  }

  private close(ws: RoomSocket, code: number, reason: string): void {
    try {
      ws.close(code, reason);
    } catch {
      // ignore
    }
  }

  private authedSockets(): RoomSocket[] {
    return this.d.sockets().filter((s) => s.getAttachment()?.user);
  }

  private socketFor(userKey: string): RoomSocket | undefined {
    return this.d.sockets().find((s) => s.getAttachment()?.user?.toLowerCase() === userKey);
  }

  private broadcast(msg: ServerMsg, exceptKey?: string): void {
    const data = JSON.stringify(msg);
    for (const ws of this.authedSockets()) {
      if (exceptKey && ws.getAttachment()?.user?.toLowerCase() === exceptKey) continue;
      try {
        ws.send(data);
      } catch {
        // ignore
      }
    }
  }

  /** Host = earliest-joined player that is connected or within grace. */
  hostUser(): string {
    let best: PlayerRecord | null = null;
    for (const p of this.players.values()) {
      if (!best || p.joinedAt < best.joinedAt) best = p;
    }
    return best?.user ?? '';
  }

  private async savePlayers(): Promise<void> {
    await this.d.store.put('players', [...this.players.values()]);
  }

  /**
   * Persist meta at most every META_FLUSH_MS (SQLite row writes are the scarcest
   * free-tier resource). eventCount is recoverable from chunk keys on load.
   */
  private async touch(force = false): Promise<void> {
    if (!this.meta) return;
    this.meta.lastActive = this.d.now();
    this.metaDirty = true;
    await this.flushMeta(force);
  }

  private async flushMeta(force: boolean): Promise<void> {
    if (!this.meta || !this.metaDirty) return;
    const t = this.d.now();
    if (force || t - this.lastMetaFlush >= META_FLUSH_MS) {
      this.lastMetaFlush = t;
      this.metaDirty = false;
      await this.d.store.put('meta', this.meta);
    }
  }

  // ---------- messages ----------

  /** Handle a raw frame. Never throws. */
  async onMessage(ws: RoomSocket, raw: string | ArrayBuffer): Promise<void> {
    try {
      await this.load();
      await this.handle(ws, raw);
    } catch (e) {
      console.error('room_message_error', e instanceof Error ? e.name : typeof e);
      this.send(ws, { t: 'error', error: 'internal', message: 'Server hiccup. Reconnecting may help.' });
    }
  }

  private async handle(ws: RoomSocket, raw: string | ArrayBuffer): Promise<void> {
    const att = ws.getAttachment() ?? { user: null, openedAt: this.d.now(), lastMsg: this.d.now(), state: null, ip: '' };
    const t = this.d.now();
    att.lastMsg = t;
    const msg = parseClientMsg(raw, MAX_WS_MSG_BYTES);
    const rlKey = att.user?.toLowerCase() ?? `anon:${att.openedAt}`;
    if (!msg) {
      if (!this.badMsgBuckets.take(rlKey, t)) {
        this.close(ws, CLOSE.protocol, 'too many bad messages');
        return;
      }
      ws.setAttachment(att);
      this.send(ws, { t: 'error', error: 'bad_message', message: 'Malformed message ignored.' });
      return;
    }
    if (!att.user) {
      if (msg.t !== 'hello') {
        this.close(ws, CLOSE.protocol, 'hello first');
        return;
      }
      await this.hello(ws, att, msg);
      return;
    }
    const key = att.user.toLowerCase();
    const player = this.players.get(key);
    if (!player) {
      // e.g. grace expired while socket lingered
      this.close(ws, CLOSE.protocol, 'not in room');
      return;
    }
    switch (msg.t) {
      case 'hello':
        this.send(ws, { t: 'error', error: 'bad_message', message: 'Already joined.' });
        break;
      case 'state': {
        if (!this.stateBuckets.take(key, t)) break; // silently drop excess states
        const s = validatePlayerState(msg.s, player.user);
        if (!s) break;
        player.last = s;
        att.state = s;
        ws.setAttachment(att);
        if (t - this.lastSnapshot >= SNAPSHOT_MS) this.snapshot(t);
        break;
      }
      case 'action':
        await this.action(ws, player, msg.seq, msg.ev, t);
        break;
      case 'ping':
        ws.setAttachment(att);
        this.send(ws, { t: 'pong', at: msg.at, server: t });
        break;
      case 'pingWheel':
        if (!this.chatBuckets.take(key, t)) break;
        this.broadcast({ t: 'ping', from: player.user, kind: msg.kind, x: msg.x, z: msg.z });
        break;
      case 'emote':
        if (!this.chatBuckets.take(key, t)) break;
        this.broadcast({ t: 'emote', from: player.user, emote: msg.emote });
        break;
    }
    await this.touch();
  }

  private async hello(ws: RoomSocket, att: SocketAttachment, msg: Extract<ClientMsg, { t: 'hello' }>): Promise<void> {
    if (!this.meta) {
      this.send(ws, { t: 'error', error: 'room_not_found', message: 'That room code does not exist.' });
      this.close(ws, CLOSE.notFound, 'room not found');
      return;
    }
    if (compareVersions(msg.clientVersion, this.d.minClient) < 0) {
      this.send(ws, { t: 'error', error: 'update_required', message: 'A game update is required. Reload to update.' });
      this.close(ws, CLOSE.updateRequired, 'update required');
      return;
    }
    const display = await this.d.authenticate(msg.user, msg.token, att.ip);
    if (!display) {
      this.send(ws, { t: 'error', error: 'unauthorized', message: 'Could not verify this device.' });
      this.close(ws, CLOSE.authFailed, 'auth failed');
      return;
    }
    const key = display.toLowerCase();
    const t = this.d.now();
    let player = this.players.get(key);
    if (!player && this.players.size >= ROOM_MAX_PLAYERS) {
      this.send(ws, { t: 'error', error: 'room_full', message: 'This run already has four players.' });
      this.close(ws, CLOSE.full, 'room full');
      return;
    }
    // Replace any older socket for the same user (e.g. app resumed with a new connection).
    for (const other of this.d.sockets()) {
      if (other !== ws && other.getAttachment()?.user?.toLowerCase() === key) {
        const oa = other.getAttachment();
        if (oa) other.setAttachment({ ...oa, user: null }); // so its close event is ignored
        this.close(other, CLOSE.replaced, 'replaced by new connection');
      }
    }
    const resumed = !!player && !!msg.resume && player.resumeToken === msg.resume;
    const isNew = !player;
    if (!player) {
      player = {
        user: display,
        joinedAt: t,
        resumeToken: '',
        graceUntil: null,
        last: { id: display, x: 0, y: 0, z: 0, yaw: 0, anim: 0, seq: 0 },
      };
      this.players.set(key, player);
    }
    player.graceUntil = null;
    player.resumeToken = toHex(randomBytes(16));
    att.user = display;
    att.state = player.last;
    ws.setAttachment(att);
    await this.savePlayers();

    this.send(ws, {
      t: 'welcome',
      you: display,
      host: this.hostUser(),
      players: [...this.players.values()].map((p) => p.last),
      resumeToken: player.resumeToken,
      hour: this.meta.hour,
      seed: this.meta.seed,
    });
    // Catch-up: replay the logged world events in order.
    await this.replayEvents(ws);
    // New and resumed players are both announced so others clear any 'reconnecting' state.
    this.broadcast({ t: 'join', player: player.last }, key);
    if (resumed && !isNew) this.resumes++;
    await this.d.setAlarm(t + ALARM_INTERVAL_MS);
  }

  private async action(ws: RoomSocket, player: PlayerRecord, seq: number, ev: WorldEvent, t: number): Promise<void> {
    const key = player.user.toLowerCase();
    if (!this.actionBuckets.take(key, t)) {
      this.send(ws, { t: 'reject', seq, reason: 'rate_limited' });
      return;
    }
    if (ev.type === 'time') {
      if (this.hostUser() !== player.user) {
        this.send(ws, { t: 'reject', seq, reason: 'host_only' });
        return;
      }
      if (this.meta) {
        this.meta.hour = ev.hour;
        this.meta.weather = ev.weather;
      }
      // time is state, not history: relay without logging
      this.broadcast({ t: 'event', from: player.user, seq, ev }, key);
      return;
    }
    if (ev.type === 'piecePlaced' && ev.piece.store && ev.piece.store.length > 0) {
      // Storage contents are per-player inventory domain; never relay arbitrary item stacks on placement.
      ev = { ...ev, piece: { ...ev.piece, store: [] } };
    }
    await this.appendEvent({ from: player.user, seq, ev });
    this.broadcast({ t: 'event', from: player.user, seq, ev });
  }

  private async appendEvent(e: StoredEvent): Promise<void> {
    if (!this.meta) return;
    const n = this.meta.eventCount;
    const idx = Math.floor(n / EVENT_CHUNK);
    let chunk = this.chunkCache && this.chunkCache.idx === idx ? this.chunkCache.events : null;
    if (!chunk) chunk = (await this.d.store.get<StoredEvent[]>(`ev:${idx}`)) ?? [];
    chunk.push(e);
    this.chunkCache = { idx, events: chunk };
    await this.d.store.put(`ev:${idx}`, chunk);
    this.meta.eventCount = n + 1;
    // Drop chunks that fell out of the window.
    const oldest = Math.floor(Math.max(0, this.meta.eventCount - EVENT_LOG_MAX) / EVENT_CHUNK) - 1;
    if (oldest >= 0 && (this.meta.eventCount - 1) % EVENT_CHUNK === 0) {
      await this.d.store.delete(`ev:${oldest}`);
    }
  }

  async events(): Promise<StoredEvent[]> {
    if (!this.meta) return [];
    const out: StoredEvent[] = [];
    const first = Math.max(0, this.meta.eventCount - EVENT_LOG_MAX);
    const lastIdx = Math.floor((this.meta.eventCount - 1) / EVENT_CHUNK);
    for (let idx = Math.floor(first / EVENT_CHUNK); idx <= lastIdx; idx++) {
      const chunk = await this.d.store.get<StoredEvent[]>(`ev:${idx}`);
      if (!chunk) continue;
      for (let i = 0; i < chunk.length; i++) {
        if (idx * EVENT_CHUNK + i >= first) out.push(chunk[i]);
      }
    }
    return out;
  }

  private async replayEvents(ws: RoomSocket): Promise<void> {
    for (const e of await this.events()) this.send(ws, { t: 'event', from: e.from, seq: e.seq, ev: e.ev });
  }

  /** Per-recipient snapshot with interest management. */
  snapshot(t: number): void {
    this.lastSnapshot = t;
    const all = [...this.players.values()].filter((p) => p.graceUntil === null).map((p) => p.last);
    for (const ws of this.authedSockets()) {
      const me = ws.getAttachment()?.user;
      if (!me) continue;
      const mine = this.players.get(me.toLowerCase())?.last;
      const visible = all.filter(
        (p) =>
          p.id !== me &&
          (!mine || (p.x - mine.x) * (p.x - mine.x) + (p.z - mine.z) * (p.z - mine.z) <= INTEREST_RADIUS * INTEREST_RADIUS),
      );
      if (visible.length === 0) continue;
      this.send(ws, { t: 'snapshot', players: visible, at: t });
    }
  }

  // ---------- disconnects & alarms ----------

  async onClose(ws: RoomSocket): Promise<void> {
    try {
      await this.load();
      const user = ws.getAttachment()?.user;
      if (!user) return;
      const key = user.toLowerCase();
      // If a newer socket for this user exists, nothing to do.
      const other = this.d.sockets().find((s) => s !== ws && s.getAttachment()?.user?.toLowerCase() === key);
      if (other) return;
      const p = this.players.get(key);
      if (!p || p.graceUntil !== null) return;
      const t = this.d.now();
      p.graceUntil = t + RECONNECT_GRACE_MS;
      await this.savePlayers();
      await this.touch(true);
      this.broadcast({ t: 'leave', id: p.user, grace: true }, key);
      await this.d.setAlarm(t + Math.min(ALARM_INTERVAL_MS, RECONNECT_GRACE_MS));
    } catch (e) {
      console.error('room_close_error', e instanceof Error ? e.name : typeof e);
    }
  }

  /** Periodic housekeeping. Returns true if the room should be wiped (idle too long). */
  async alarm(): Promise<{ wipe: boolean }> {
    await this.load();
    const t = this.d.now();
    // 1. Close sockets that never said hello, or went silent (suspended iPhone tabs).
    for (const ws of this.d.sockets()) {
      const a = ws.getAttachment();
      if (!a) continue;
      if (!a.user && t - a.openedAt > HELLO_TIMEOUT_MS) this.close(ws, CLOSE.timeout, 'hello timeout');
      else if (a.user && t - a.lastMsg > STALE_MS) {
        this.close(ws, CLOSE.timeout, 'heartbeat timeout');
        await this.onClose(ws);
      }
    }
    // 2. Expire grace windows.
    let changed = false;
    for (const [key, p] of this.players) {
      if (p.graceUntil !== null && p.graceUntil <= t) {
        this.players.delete(key);
        changed = true;
        this.broadcast({ t: 'leave', id: p.user, grace: false });
      }
    }
    if (changed) await this.savePlayers();
    await this.flushMeta(true);
    // 3. Reschedule.
    const pending =
      this.d.sockets().length > 0 || [...this.players.values()].some((p) => p.graceUntil !== null);
    if (pending) {
      await this.d.setAlarm(t + ALARM_INTERVAL_MS);
      return { wipe: false };
    }
    const lastActive = this.meta?.lastActive ?? 0;
    if (this.players.size === 0 && t - lastActive >= ROOM_IDLE_WIPE_MS) return { wipe: true };
    await this.d.setAlarm(lastActive + ROOM_IDLE_WIPE_MS);
    return { wipe: false };
  }

  playerCount(): number {
    return this.players.size;
  }
}

export interface StoredEvent {
  from: string;
  seq: number;
  ev: WorldEvent;
}
