// Pure input validation. Every function either returns a typed value or throws HttpError / returns null.

import {
  MAX_SAVE_BYTES,
  USERNAME_RE,
  type ClientMsg,
  type NetPlayerState,
  type PingKind,
  type PlacedPiece,
  type SaveMeta,
  type SavePutRequest,
  type WorldEvent,
} from '@dg/shared';
import { HttpError, isRecord } from './util';

// ---------- usernames ----------

// Deliberately short list of unambiguous slurs/obscenities. Matched as substrings after
// leetspeak normalization, so keep roots specific enough to avoid false positives.
const BLOCKED_ROOTS = [
  'fuck', 'shit', 'cunt', 'bitch', 'whore', 'slut', 'nigg', 'fag', 'retard', 'rape',
  'cock', 'dick', 'pussy', 'penis', 'vagina', 'porn', 'nazi', 'hitler', 'kike', 'spic',
  'chink', 'tranny', 'dyke', 'twat', 'wank', 'jizz', 'cum', 'anal', 'molest', 'pedo',
];
const PREFIX_ONLY = new Set(['cum', 'anal', 'rape', 'cock', 'dick', 'spic', 'fag', 'dyke', 'wank', 'pedo']);
// Names that look official or confuse players.
const RESERVED = ['admin', 'administrator', 'moderator', 'mod', 'system', 'server', 'dormantgrid', 'support', 'staff', 'claude', 'anthropic', 'null', 'undefined'];

const LEET: Record<string, string> = { '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '8': 'b', '9': 'g', '2': 'z', '6': 'g' };

export function normalizeForFilter(name: string): string {
  let s = name.toLowerCase().replace(/[_-]/g, '');
  s = s.replace(/[0-9]/g, (d) => LEET[d] ?? d);
  // collapse long repeats: 'fuuuck' -> 'fuck'
  s = s.replace(/(.)\1+/g, '$1');
  return s;
}

export function isProfane(name: string): boolean {
  const n = normalizeForFilter(name);
  const raw = name.toLowerCase().replace(/[_-]/g, '');
  // Short roots appear inside innocent words ('document', 'canal', 'scrapper', 'Hancock'):
  // only block those when they are the whole name or at the very start.
  for (const root of BLOCKED_ROOTS) {
    if (PREFIX_ONLY.has(root)) {
      if (n === root || n.startsWith(root) || raw.startsWith(root)) return true;
      continue;
    }
    if (n.includes(root) || raw.includes(root)) return true;
  }
  return false;
}

/** Returns canonical lowercase key, or throws HttpError with a player-facing message. */
export function validateUsername(input: unknown): { display: string; key: string } {
  if (typeof input !== 'string') throw new HttpError(400, 'invalid_username', 'Pick a username.');
  const display = input.trim();
  if (!USERNAME_RE.test(display)) {
    throw new HttpError(400, 'invalid_username', 'Use 3 to 20 letters, digits, underscores or hyphens.');
  }
  const key = display.toLowerCase();
  if (RESERVED.includes(key.replace(/[_-]/g, ''))) {
    throw new HttpError(400, 'username_reserved', 'That name is reserved. Try another.');
  }
  if (isProfane(display)) throw new HttpError(400, 'username_blocked', "That name isn't allowed. Try another.");
  return { display, key };
}

export const TOKEN_RE = /^[0-9a-f]{64}$/;

// ---------- saves ----------

const BASE64_RE = /^[A-Za-z0-9+/]*={0,2}$/;

function finiteInt(v: unknown, min: number, max: number): v is number {
  return typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max;
}
function finiteNum(v: unknown, min: number, max: number): v is number {
  return typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max;
}

export function validateSaveMeta(m: unknown): SaveMeta {
  if (!isRecord(m)) throw new HttpError(400, 'invalid_save', 'Missing save metadata.');
  const { rev, schema, savedAt, playtime, bytes } = m;
  if (
    !finiteInt(rev, 1, Number.MAX_SAFE_INTEGER) ||
    !finiteInt(schema, 1, 10_000) ||
    !finiteInt(savedAt, 0, 8.64e15) ||
    !finiteNum(playtime, 0, 1e10) ||
    !finiteInt(bytes, 0, MAX_SAVE_BYTES)
  ) {
    throw new HttpError(400, 'invalid_save', 'Save metadata is malformed.');
  }
  return { rev, schema, savedAt, playtime, bytes };
}

export function validateSavePut(body: unknown): SavePutRequest {
  if (!isRecord(body)) throw new HttpError(400, 'invalid_save', 'Malformed save upload.');
  const { baseRev, data, force } = body;
  if (!finiteInt(baseRev, 0, Number.MAX_SAFE_INTEGER)) throw new HttpError(400, 'invalid_save', 'Missing baseRev.');
  if (typeof data !== 'string' || data.length === 0) throw new HttpError(400, 'invalid_save', 'Missing save data.');
  if (data.length > MAX_SAVE_BYTES) throw new HttpError(413, 'save_too_large', 'This save is too large to upload.');
  if (!BASE64_RE.test(data) || data.length % 4 !== 0) throw new HttpError(400, 'invalid_save', 'Save data must be base64.');
  if (force !== undefined && typeof force !== 'boolean') throw new HttpError(400, 'invalid_save', 'force must be a boolean.');
  const meta = validateSaveMeta(body.meta);
  // bytes is server-authoritative
  meta.bytes = data.length;
  return { baseRev, meta, data, force: force === true };
}

// ---------- WebSocket messages ----------

const PING_KINDS: readonly PingKind[] = ['here', 'danger', 'loot', 'help', 'go'];
export const EMOTES = ['wave', 'thumbsup', 'cheer', 'point', 'sit', 'laugh', 'shrug', 'thanks'] as const;
const WORLD_LIMIT = 4096; // generous bound around the 1216 m world (allow off-map margin)

function coord(v: unknown): v is number {
  return finiteNum(v, -WORLD_LIMIT, WORLD_LIMIT);
}

export function validatePlayerState(s: unknown, id: string): NetPlayerState | null {
  if (!isRecord(s)) return null;
  const { x, y, z, yaw, anim, seq } = s;
  if (!coord(x) || !finiteNum(y, -500, 2000) || !coord(z)) return null;
  if (!finiteNum(yaw, -1000, 1000) || !finiteInt(anim, 0, 15) || !finiteInt(seq, 0, Number.MAX_SAFE_INTEGER)) return null;
  // id is always server-assigned (never trust the client's claimed id)
  return { id, x, y, z, yaw, anim, seq };
}

function validatePiece(p: unknown): PlacedPiece | null {
  if (!isRecord(p)) return null;
  const { id, piece, tier, x, y, z, rot, hp, store } = p;
  if (!finiteInt(id, 0, 1e9) || typeof piece !== 'string' || !/^[a-z0-9_.-]{1,40}$/.test(piece)) return null;
  if (!finiteInt(tier, 0, 3) || !coord(x) || !finiteNum(y, -100, 500) || !coord(z) || !finiteInt(rot, 0, 3)) return null;
  if (!finiteNum(hp, 0, 1e6)) return null;
  const out: PlacedPiece = { id, piece, tier: tier as PlacedPiece['tier'], x, y, z, rot: rot as PlacedPiece['rot'], hp };
  if (store !== undefined) {
    if (!Array.isArray(store) || store.length > 64) return null;
    const items: PlacedPiece['store'] = [];
    for (const it of store) {
      if (it === null) {
        items.push(null);
        continue;
      }
      if (!isRecord(it) || typeof it.id !== 'string' || it.id.length > 64 || !finiteInt(it.n, 0, 100_000)) return null;
      const st: { id: string; n: number; d?: number; t?: number } = { id: it.id, n: it.n };
      if (it.d !== undefined) {
        if (!finiteNum(it.d, 0, 1e6)) return null;
        st.d = it.d;
      }
      if (it.t !== undefined) {
        if (!finiteNum(it.t, 0, 1e9)) return null;
        st.t = it.t;
      }
      items.push(st);
    }
    out.store = items;
  }
  return out;
}

export function validateWorldEvent(ev: unknown): WorldEvent | null {
  if (!isRecord(ev) || typeof ev.type !== 'string') return null;
  switch (ev.type) {
    case 'propRemoved':
      return finiteInt(ev.id, 0, 10_000_000) ? { type: 'propRemoved', id: ev.id } : null;
    case 'piecePlaced': {
      const piece = validatePiece(ev.piece);
      return piece ? { type: 'piecePlaced', piece } : null;
    }
    case 'pieceRemoved':
      return finiteInt(ev.id, 0, 1e9) ? { type: 'pieceRemoved', id: ev.id } : null;
    case 'buildingPieceRemoved':
      return finiteInt(ev.building, 0, 1_000_000) && finiteInt(ev.piece, 0, 100_000)
        ? { type: 'buildingPieceRemoved', building: ev.building, piece: ev.piece }
        : null;
    case 'nodeOnline':
      return finiteInt(ev.node, 0, 10_000) && finiteInt(ev.district, 0, 255)
        ? { type: 'nodeOnline', node: ev.node, district: ev.district }
        : null;
    case 'time':
      return finiteNum(ev.hour, 0, 1e7) && typeof ev.weather === 'string' && /^[a-z]{1,16}$/.test(ev.weather)
        ? { type: 'time', hour: ev.hour, weather: ev.weather }
        : null;
    default:
      return null;
  }
}

/**
 * Parse and validate a raw client frame. Returns null for anything malformed.
 * The `state` message's player id is filled in by the caller (server-assigned).
 */
export function parseClientMsg(raw: string | ArrayBuffer, maxBytes: number): ClientMsg | null {
  if (typeof raw !== 'string') return null; // binary frames not supported
  if (raw.length > maxBytes) return null;
  let m: unknown;
  try {
    m = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isRecord(m) || typeof m.t !== 'string') return null;
  switch (m.t) {
    case 'hello': {
      const { user, token, clientVersion, resume } = m;
      if (typeof user !== 'string' || !USERNAME_RE.test(user)) return null;
      if (typeof token !== 'string' || !TOKEN_RE.test(token)) return null;
      if (typeof clientVersion !== 'string' || !/^[0-9A-Za-z.+-]{1,32}$/.test(clientVersion)) return null;
      if (resume !== undefined && (typeof resume !== 'string' || !/^[0-9a-f]{32}$/.test(resume))) return null;
      return { t: 'hello', user, token, clientVersion, ...(resume ? { resume } : {}) };
    }
    case 'state': {
      const s = validatePlayerState(m.s, '');
      return s ? { t: 'state', s } : null;
    }
    case 'action': {
      if (!finiteInt(m.seq, 0, Number.MAX_SAFE_INTEGER)) return null;
      const ev = validateWorldEvent(m.ev);
      return ev ? { t: 'action', seq: m.seq, ev } : null;
    }
    case 'ping':
      return finiteNum(m.at, 0, 8.64e15) ? { t: 'ping', at: m.at } : null;
    case 'pingWheel':
      return typeof m.kind === 'string' && (PING_KINDS as readonly string[]).includes(m.kind) && coord(m.x) && coord(m.z)
        ? { t: 'pingWheel', kind: m.kind as PingKind, x: m.x, z: m.z }
        : null;
    case 'emote':
      return typeof m.emote === 'string' && (EMOTES as readonly string[]).includes(m.emote) ? { t: 'emote', emote: m.emote } : null;
    default:
      return null;
  }
}

export const ROOM_CODE_RE = /^[ABCDEFGHJKMNPQRSTVWXYZ23456789]{5}$/;
