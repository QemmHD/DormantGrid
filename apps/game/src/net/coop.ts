// Co-op client (2–4 players) for the WorldRoom Durable Object.
// Host-client authority: the earliest-joined player's phone simulates the world;
// the server relays, validates shapes/rates and persists the event log.
import {
  GAME_VERSION,
  MAX_WS_MSG_BYTES,
  type ClientMsg,
  type NetPlayerState,
  type PingKind,
  type ServerMsg,
  type WorldEvent,
} from '@dg/shared';
import type { Bus, NetStatus } from '../game/api';
import type { ApiClient } from './api';

export const ROOM_CODE_RE = /^[ABCDEFGHJKMNPQRSTVWXYZ23456789]{5}$/;
export const INTERP_DELAY_MS = 100;
const STATE_MOVING_MS = 100; // 10 Hz
const STATE_IDLE_MS = 500; // 2 Hz
const PING_MS = 8000;
const BACKOFF = [500, 1000, 2000, 4000, 8000, 15000];
const RECONNECT_WINDOW_MS = 60_000;
const NO_RECONNECT = new Set([4001, 4003, 4004, 4005, 4006, 4007]);
const MAX_BUFFER = 30;
const MAX_SEEN = 4096;

export interface WsLike {
  readyState: number;
  send(data: string): void;
  close(code?: number, reason?: string): void;
  onopen: ((ev: unknown) => void) | null;
  onmessage: ((ev: { data: unknown }) => void) | null;
  onclose: ((ev: { code: number; reason?: string }) => void) | null;
  onerror: ((ev: unknown) => void) | null;
}

export interface CoopOptions {
  wsFactory?: (url: string) => WsLike;
  now?: () => number;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (h: unknown) => void;
  origin?: string; // e.g. 'wss://host'
}

interface Snap {
  t: number;
  s: NetPlayerState;
}

export function normalizeCode(raw: string): string | null {
  const c = raw.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  return ROOM_CODE_RE.test(c) ? c : null;
}

/** Read and strip ?join=CODE from the URL. */
export function consumeJoinParam(): string | null {
  if (typeof location === 'undefined') return null;
  try {
    const url = new URL(location.href);
    const raw = url.searchParams.get('join');
    if (!raw) return null;
    url.searchParams.delete('join');
    history.replaceState(history.state, '', url.toString());
    return normalizeCode(raw);
  } catch {
    return null;
  }
}

function num(x: unknown): x is number {
  return typeof x === 'number' && Number.isFinite(x);
}
function isState(x: unknown): x is NetPlayerState {
  if (typeof x !== 'object' || x === null) return false;
  const s = x as Record<string, unknown>;
  return typeof s.id === 'string' && num(s.x) && num(s.y) && num(s.z) && num(s.yaw) && num(s.anim) && num(s.seq);
}
function isEvent(x: unknown): x is WorldEvent {
  return typeof x === 'object' && x !== null && typeof (x as { type?: unknown }).type === 'string';
}

function lerpAngle(a: number, b: number, t: number): number {
  let d = b - a;
  d = Math.atan2(Math.sin(d), Math.cos(d));
  return a + d * t;
}

export class CoopClient {
  code: string | null = null;
  me: string | null = null;
  host: string | null = null;
  status: NetStatus = 'offline';
  seed = 0;
  /** remote players: id -> snapshot buffer */
  private buffers = new Map<string, Snap[]>();
  /** players currently in reconnect grace */
  readonly reconnecting = new Set<string>();
  private ws: WsLike | null = null;
  private resumeToken: string | null = null;
  private seq = 0;
  private stateSeq = 0;
  private lastStateAt = -1e9;
  private lastPingAt = 0;
  private seen = new Set<string>();
  private seenOrder: string[] = [];
  private retries = 0;
  private disconnectedAt = 0;
  private retryTimer: unknown = null;
  private wantOpen = false;
  rtt = 0;

  onWorldEvent: ((ev: WorldEvent, from: string, mine: boolean, seq: number) => void) | null = null;
  onReject: ((seq: number, reason: string) => void) | null = null;
  onPing: ((from: string, kind: PingKind, x: number, z: number) => void) | null = null;
  onEmote: ((from: string, emote: string) => void) | null = null;
  onWelcome: ((info: { you: string; host: string; hour: number; seed: number; players: NetPlayerState[] }) => void) | null = null;
  onPlayers: (() => void) | null = null;
  onUpdateRequired: (() => void) | null = null;
  onClosed: ((reason: string) => void) | null = null;

  private readonly wsFactory: (url: string) => WsLike;
  private readonly now: () => number;
  private readonly setTimer: (fn: () => void, ms: number) => unknown;
  private readonly clearTimer: (h: unknown) => void;
  private readonly origin: string | undefined;

  constructor(
    private bus: Bus | undefined,
    private api: ApiClient,
    opts: CoopOptions = {},
  ) {
    this.wsFactory = opts.wsFactory ?? ((url) => new WebSocket(url) as unknown as WsLike);
    this.now = opts.now ?? (() => performance.now());
    this.setTimer = opts.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
    this.clearTimer = opts.clearTimer ?? ((h) => clearTimeout(h as ReturnType<typeof setTimeout>));
    this.origin = opts.origin;
  }

  get active(): boolean {
    return this.code !== null;
  }
  get isHost(): boolean {
    return this.me !== null && this.me === this.host;
  }
  get playerIds(): string[] {
    return [...this.buffers.keys()];
  }

  private setStatus(s: NetStatus): void {
    if (this.status === s) return;
    this.status = s;
    this.bus?.emit({ type: 'net', status: s });
  }

  /** Create a room and join it. Returns the room code. */
  async hostRoom(seed?: number): Promise<string> {
    const r = await this.api.createRoom(seed);
    this.join(r.code);
    return r.code;
  }

  join(rawCode: string): boolean {
    const code = normalizeCode(rawCode);
    if (!code || !this.api.creds) return false;
    if (this.code && this.code !== code) this.leave();
    this.code = code;
    this.wantOpen = true;
    this.retries = 0;
    this.resumeToken = null;
    this.open();
    return true;
  }

  shareLink(): string | null {
    if (!this.code || typeof location === 'undefined') return null;
    const u = new URL(location.href);
    u.search = '';
    u.hash = '';
    u.searchParams.set('join', this.code);
    return u.toString();
  }

  private url(): string {
    const origin = this.origin ?? (typeof location !== 'undefined' ? `${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}` : 'ws://localhost');
    return `${origin}/ws/room/${this.code}`;
  }

  private open(): void {
    if (!this.code || !this.api.creds) return;
    this.setStatus(this.resumeToken ? 'reconnecting' : 'syncing');
    let ws: WsLike;
    try {
      ws = this.wsFactory(this.url());
    } catch {
      this.scheduleReconnect();
      return;
    }
    this.ws = ws;
    ws.onopen = () => {
      const creds = this.api.creds;
      if (!creds) return;
      this.send({ t: 'hello', user: creds.user, token: creds.token, clientVersion: GAME_VERSION, resume: this.resumeToken ?? undefined });
    };
    ws.onmessage = (ev) => {
      if (typeof ev.data === 'string') this.handleMessage(ev.data);
    };
    ws.onerror = () => {
      /* onclose follows */
    };
    ws.onclose = (ev) => {
      if (this.ws !== ws) return;
      this.ws = null;
      this.handleClose(ev.code, ev.reason ?? '');
    };
  }

  private handleClose(code: number, reason: string): void {
    if (!this.wantOpen) return;
    if (code === 4006) {
      this.wantOpen = false;
      this.code = null;
      this.setStatus('error');
      this.onUpdateRequired?.();
      return;
    }
    if (NO_RECONNECT.has(code)) {
      const msg =
        code === 4004 ? 'That run is full (4 players).' : code === 4005 ? 'That room code does not exist.' : code === 4003 ? 'Could not verify this device.' : code === 4001 ? 'You joined from another tab or device.' : 'Disconnected from the run.';
      this.reset();
      this.setStatus('offline');
      this.bus?.emit({ type: 'toast', kind: 'bad', text: msg });
      this.onClosed?.(msg || reason);
      return;
    }
    if (!this.disconnectedAt) this.disconnectedAt = this.now();
    this.scheduleReconnect();
  }

  private scheduleReconnect(): void {
    if (!this.wantOpen) return;
    if (this.disconnectedAt && this.now() - this.disconnectedAt > RECONNECT_WINDOW_MS) {
      this.reset();
      this.setStatus('offline');
      this.bus?.emit({ type: 'toast', kind: 'bad', text: 'Lost the connection to the run. You can rejoin from Co-op.' });
      this.onClosed?.('timeout');
      return;
    }
    this.setStatus('reconnecting');
    const ms = BACKOFF[Math.min(this.retries, BACKOFF.length - 1)];
    this.retries++;
    if (this.retryTimer !== null) this.clearTimer(this.retryTimer);
    this.retryTimer = this.setTimer(() => {
      this.retryTimer = null;
      this.open();
    }, ms);
  }

  /** Call when the app returns to the foreground: reconnect fast. */
  resume(): void {
    if (!this.wantOpen || this.ws) return;
    if (this.retryTimer !== null) this.clearTimer(this.retryTimer);
    this.retryTimer = null;
    this.retries = 0;
    this.open();
  }

  leave(): void {
    this.wantOpen = false;
    try {
      this.ws?.close(1000, 'leave');
    } catch {
      /* ignore */
    }
    this.reset();
    this.setStatus('offline');
  }

  private reset(): void {
    this.ws = null;
    this.code = null;
    this.host = null;
    this.resumeToken = null;
    this.wantOpen = false;
    this.buffers.clear();
    this.reconnecting.clear();
    this.disconnectedAt = 0;
    if (this.retryTimer !== null) this.clearTimer(this.retryTimer);
    this.retryTimer = null;
    this.onPlayers?.();
  }

  private send(m: ClientMsg): boolean {
    const ws = this.ws;
    if (!ws || ws.readyState !== 1) return false;
    const s = JSON.stringify(m);
    if (s.length > MAX_WS_MSG_BYTES) return false;
    try {
      ws.send(s);
      return true;
    } catch {
      return false;
    }
  }

  /** Feed raw server text. Never throws. */
  handleMessage(raw: string): void {
    if (raw.length > 256 * 1024) return;
    let m: ServerMsg;
    try {
      m = JSON.parse(raw) as ServerMsg;
    } catch {
      return;
    }
    if (typeof m !== 'object' || m === null || typeof (m as { t?: unknown }).t !== 'string') return;
    try {
      this.dispatch(m);
    } catch {
      /* malformed payload: ignore */
    }
  }

  private dispatch(m: ServerMsg): void {
    const now = this.now();
    switch (m.t) {
      case 'welcome': {
        if (typeof m.you !== 'string' || typeof m.resumeToken !== 'string') return;
        this.me = m.you;
        this.host = typeof m.host === 'string' ? m.host : m.you;
        this.resumeToken = m.resumeToken;
        this.seed = num(m.seed) ? m.seed : 0;
        this.retries = 0;
        this.disconnectedAt = 0;
        const players = Array.isArray(m.players) ? m.players.filter(isState) : [];
        for (const p of players) if (p.id !== this.me) this.push(p, now);
        this.setStatus('online');
        this.onWelcome?.({ you: m.you, host: this.host, hour: num(m.hour) ? m.hour : 0, seed: this.seed, players });
        this.onPlayers?.();
        return;
      }
      case 'snapshot': {
        if (!Array.isArray(m.players)) return;
        for (const p of m.players) if (isState(p) && p.id !== this.me) this.push(p, now);
        return;
      }
      case 'join':
        if (isState(m.player) && m.player.id !== this.me) {
          this.reconnecting.delete(m.player.id);
          this.push(m.player, now);
          this.onPlayers?.();
        }
        return;
      case 'leave':
        if (typeof m.id !== 'string') return;
        if (m.grace) this.reconnecting.add(m.id);
        else {
          this.reconnecting.delete(m.id);
          this.buffers.delete(m.id);
          // host migration: earliest remaining; server is authoritative but does not announce yet
          if (this.host === m.id) this.host = [this.me ?? '', ...this.buffers.keys()].filter(Boolean).sort()[0] ?? this.me;
        }
        this.onPlayers?.();
        return;
      case 'event': {
        if (typeof m.from !== 'string' || !num(m.seq) || !isEvent(m.ev)) return;
        const key = `${m.from}:${m.seq}`;
        if (this.seen.has(key)) return; // replay after resume: idempotent
        this.seen.add(key);
        this.seenOrder.push(key);
        if (this.seenOrder.length > MAX_SEEN) this.seen.delete(this.seenOrder.shift()!);
        this.onWorldEvent?.(m.ev, m.from, m.from === this.me, m.seq);
        return;
      }
      case 'reject':
        if (num(m.seq)) this.onReject?.(m.seq, typeof m.reason === 'string' ? m.reason : 'rejected');
        return;
      case 'pong':
        if (num(m.at)) this.rtt = Math.max(0, now - m.at);
        return;
      case 'ping':
        if (typeof m.from === 'string' && num(m.x) && num(m.z)) this.onPing?.(m.from, m.kind, m.x, m.z);
        return;
      case 'emote':
        if (typeof m.from === 'string' && typeof m.emote === 'string') this.onEmote?.(m.from, m.emote.slice(0, 24));
        return;
      case 'error':
        if (typeof m.message === 'string') this.bus?.emit({ type: 'toast', kind: 'bad', text: m.message.slice(0, 160) });
        return;
      default:
        return;
    }
  }

  private push(s: NetPlayerState, t: number): void {
    let b = this.buffers.get(s.id);
    if (!b) this.buffers.set(s.id, (b = []));
    const last = b[b.length - 1];
    if (last && s.seq < last.s.seq) return; // out of order
    b.push({ t, s: { ...s } });
    if (b.length > MAX_BUFFER) b.shift();
  }

  /** Test hook / manual injection of a remote state at a time. */
  ingest(s: NetPlayerState, t: number): void {
    this.push(s, t);
  }

  /** Interpolated remote state ~100 ms in the past. */
  sample(id: string, now: number = this.now()): NetPlayerState | null {
    const b = this.buffers.get(id);
    if (!b || b.length === 0) return null;
    const t = now - INTERP_DELAY_MS;
    if (t <= b[0].t) return { ...b[0].s };
    for (let i = b.length - 1; i > 0; i--) {
      const a = b[i - 1];
      const c = b[i];
      if (t >= a.t && t <= c.t) {
        const k = c.t > a.t ? (t - a.t) / (c.t - a.t) : 1;
        return {
          id,
          x: a.s.x + (c.s.x - a.s.x) * k,
          y: a.s.y + (c.s.y - a.s.y) * k,
          z: a.s.z + (c.s.z - a.s.z) * k,
          yaw: lerpAngle(a.s.yaw, c.s.yaw, k),
          anim: k < 0.5 ? a.s.anim : c.s.anim,
          seq: c.s.seq,
        };
      }
    }
    // newer than newest: hold (brief extrapolation up to 200 ms)
    const last = b[b.length - 1];
    const prev = b.length > 1 ? b[b.length - 2] : null;
    const over = Math.min(200, t - last.t);
    if (prev && over > 0 && last.t > prev.t) {
      const k = over / (last.t - prev.t);
      return { ...last.s, x: last.s.x + (last.s.x - prev.s.x) * k, z: last.s.z + (last.s.z - prev.s.z) * k };
    }
    return { ...last.s };
  }

  /** Call every frame with the local player's state. Rate-limited internally. */
  sendState(s: { x: number; y: number; z: number; yaw: number; anim: number }, moving: boolean, now: number = this.now()): void {
    if (this.status !== 'online') return;
    if (now - this.lastStateAt < (moving ? STATE_MOVING_MS : STATE_IDLE_MS)) return;
    this.lastStateAt = now;
    this.send({ t: 'state', s: { id: this.me ?? '', x: s.x, y: s.y, z: s.z, yaw: s.yaw, anim: s.anim, seq: ++this.stateSeq } });
  }

  /** Send a world action. Returns its seq (echoed back as 'event' or 'reject'), or -1 if not sent. */
  sendAction(ev: WorldEvent): number {
    const seq = ++this.seq;
    return this.send({ t: 'action', seq, ev }) ? seq : -1;
  }

  sendPing(kind: PingKind, x: number, z: number): void {
    this.send({ t: 'pingWheel', kind, x, z });
  }

  sendEmote(emote: string): void {
    this.send({ t: 'emote', emote });
  }

  /** Heartbeat; call each frame (cheap). */
  tick(now: number = this.now()): void {
    if (!this.ws || this.ws.readyState !== 1) return;
    if (now - this.lastPingAt >= PING_MS) {
      this.lastPingAt = now;
      this.send({ t: 'ping', at: now });
    }
  }
}
