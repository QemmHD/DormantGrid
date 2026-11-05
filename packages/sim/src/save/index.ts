// Save creation, validation, migration and (de)serialization. Pure TS (fflate for deflate).

import { retroactiveProgress } from '../systems/campaign';
import { deflateSync, inflateSync, strFromU8, strToU8 } from 'fflate';
import {
  DISTRICT_KEYS,
  GAME_VERSION,
  SAVE_SCHEMA_VERSION,
  WORLDGEN_VERSION,
  type ConditionId,
  type CropSave,
  type Difficulty,
  type DistrictSave,
  type DropPile,
  type GameSave,
  type ItemStack,
  type PlacedPiece,
  type PlayerSave,
  type RestorationState,
  type SurvivorSave,
  type WorldLayout,
  type WorldSave,
} from '@dg/shared';
import { PROP_HALF } from '../world/gen';
import { newPlayer } from '../systems/survival';

export type SaveErrorReason =
  | 'not_object'
  | 'bad_field'
  | 'nan'
  | 'future_version'
  | 'bad_schema'
  | 'decode_failed'
  | 'too_large';

export class SaveError extends Error {
  readonly reason: SaveErrorReason;
  readonly path: string;
  constructor(reason: SaveErrorReason, path = '', detail = '') {
    super(`save ${reason}${path ? ` at ${path}` : ''}${detail ? `: ${detail}` : ''}`);
    this.name = 'SaveError';
    this.reason = reason;
    this.path = path;
  }
}

export const PLAYER_INVENTORY_SLOTS = 24;
const MAX_ARRAY = 100_000;
const MAX_DECODED_BYTES = 16 * 1024 * 1024;

const FACTION_IDS = ['hearth', 'reavers', 'guild', 'custodians'] as const;
const CONDITIONS: readonly ConditionId[] = ['bleeding', 'fracture', 'sick', 'infected', 'wellfed', 'rested', 'soaked'];

// ------------------------------------------------------------------ creation

export function newGame(seed: number, difficulty: Difficulty, spawn: { x: number; z: number }): GameSave {
  const player: PlayerSave = newPlayer(spawn, PLAYER_INVENTORY_SLOTS);
  const factions: Record<string, number> = {};
  for (const f of FACTION_IDS) factions[f] = f === 'hearth' ? 20 : f === 'custodians' ? -50 : 0;
  const districts: DistrictSave[] = DISTRICT_KEYS.map((k) => ({
    state: (k === 'haven' ? 1 : 0) as RestorationState,
    nodesOnline: [],
  }));
  const world: WorldSave = {
    seed: seed >>> 0,
    genVersion: WORLDGEN_VERSION,
    hour: 8, // day 0, 08:00
    weather: 'clear',
    removedProps: [],
    removedPieces: {},
    pieces: [],
    nextPieceId: 1,
    drops: [],
    survivors: [],
    crops: [],
    districts,
    factions,
    townStock: new Array<ItemStack | null>(48).fill(null),
    blueprints: [],
    quests: {},
    flags: {},
    difficulty,
  };
  return {
    schema: SAVE_SCHEMA_VERSION,
    rev: 0,
    savedAt: 0,
    playtime: 0,
    gameVersion: GAME_VERSION,
    player,
    world,
  };
}

// ------------------------------------------------------------------ validation helpers

type Obj = Record<string, unknown>;

function isObj(v: unknown): v is Obj {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function obj(v: unknown, path: string): Obj {
  if (!isObj(v)) throw new SaveError('bad_field', path, 'expected object');
  return v;
}

function num(v: unknown, path: string, min = -1e12, max = 1e12): number {
  if (typeof v !== 'number') throw new SaveError('bad_field', path, 'expected number');
  if (Number.isNaN(v)) throw new SaveError('nan', path);
  if (v === Infinity) return max;
  if (v === -Infinity) return min;
  return v < min ? min : v > max ? max : v;
}

function int(v: unknown, path: string, min = -2147483648, max = 2147483647): number {
  return Math.round(num(v, path, min, max));
}

function str(v: unknown, path: string, maxLen = 200): string {
  if (typeof v !== 'string') throw new SaveError('bad_field', path, 'expected string');
  return v.length > maxLen ? v.slice(0, maxLen) : v;
}

function bool(v: unknown, path: string): boolean {
  if (typeof v !== 'boolean') throw new SaveError('bad_field', path, 'expected boolean');
  return v;
}

function arr(v: unknown, path: string, max = MAX_ARRAY): unknown[] {
  if (!Array.isArray(v)) throw new SaveError('bad_field', path, 'expected array');
  if (v.length > max) throw new SaveError('too_large', path);
  return v;
}

function stack(v: unknown, path: string): ItemStack | null {
  if (v === null || v === undefined) return null;
  const o = obj(v, path);
  const s: ItemStack = { id: str(o.id, `${path}.id`, 64), n: int(o.n, `${path}.n`, 0, 1_000_000) };
  if (o.d !== undefined) s.d = num(o.d, `${path}.d`, 0, 1e6);
  if (o.t !== undefined) s.t = num(o.t, `${path}.t`, -1e9, 1e9);
  if (s.n <= 0 || s.id.length === 0) return null;
  return s;
}

function stacks(v: unknown, path: string, max = 1000): (ItemStack | null)[] {
  return arr(v, path, max).map((x, i) => stack(x, `${path}[${i}]`));
}

function vec2(v: unknown, path: string): { x: number; z: number } {
  const o = obj(v, path);
  return { x: num(o.x, `${path}.x`, -1e5, 1e5), z: num(o.z, `${path}.z`, -1e5, 1e5) };
}

const quarter = (v: unknown, path: string) => (int(v, path, 0, 3) & 3) as 0 | 1 | 2 | 3;

// ------------------------------------------------------------------ validation

function validatePlayer(v: unknown): PlayerSave {
  const p = obj(v, 'player');
  const inv = stacks(p.inventory, 'player.inventory', 200);
  const quick = arr(p.quick, 'player.quick', 16).map((q, i) => (q === null ? null : str(q, `player.quick[${i}]`, 64)));
  while (quick.length < 4) quick.push(null);
  const conditions = arr(p.conditions, 'player.conditions', 64)
    .map((c, i) => {
      const o = obj(c, `player.conditions[${i}]`);
      return { id: str(o.id, `player.conditions[${i}].id`, 32) as ConditionId, t: num(o.t, `player.conditions[${i}].t`, 0, 1e6) };
    })
    .filter((c) => CONDITIONS.includes(c.id));
  return {
    x: num(p.x, 'player.x', -1e5, 1e5),
    y: num(p.y, 'player.y', -1000, 1000),
    z: num(p.z, 'player.z', -1e5, 1e5),
    yaw: num(p.yaw, 'player.yaw', -1e4, 1e4),
    health: num(p.health, 'player.health', 0, 100),
    hunger: num(p.hunger, 'player.hunger', 0, 100),
    thirst: num(p.thirst, 'player.thirst', 0, 100),
    stamina: num(p.stamina, 'player.stamina', 0, 100),
    sleep: num(p.sleep, 'player.sleep', 0, 100),
    conditions,
    inventory: inv,
    quick: quick.slice(0, 4),
    equipped: p.equipped === null || p.equipped === undefined ? null : str(p.equipped, 'player.equipped', 64),
    bed: p.bed === null || p.bed === undefined ? null : vec2(p.bed, 'player.bed'),
    perks: arr(p.perks, 'player.perks', 256).map((x, i) => str(x, `player.perks[${i}]`, 64)),
    perkPoints: int(p.perkPoints, 'player.perkPoints', 0, 10000),
    xp: num(p.xp, 'player.xp', 0, 1e9),
  };
}

function validatePiece(v: unknown, path: string): PlacedPiece {
  const o = obj(v, path);
  const piece: PlacedPiece = {
    id: int(o.id, `${path}.id`, 0),
    piece: str(o.piece, `${path}.piece`, 64),
    tier: int(o.tier, `${path}.tier`, 0, 3) as 0 | 1 | 2 | 3,
    x: num(o.x, `${path}.x`, -1e5, 1e5),
    y: num(o.y, `${path}.y`, -1000, 1000),
    z: num(o.z, `${path}.z`, -1e5, 1e5),
    rot: quarter(o.rot, `${path}.rot`),
    hp: num(o.hp, `${path}.hp`, 0, 1e6),
  };
  if (o.store !== undefined) piece.store = stacks(o.store, `${path}.store`, 200);
  return piece;
}

function validateSurvivor(v: unknown, path: string): SurvivorSave {
  const o = obj(v, path);
  const st = obj(o.stats, `${path}.stats`);
  const traits = arr(o.traits, `${path}.traits`, 2);
  const skillsIn = obj(o.skills, `${path}.skills`);
  const skills: Record<string, number> = {};
  for (const [k, val] of Object.entries(skillsIn)) skills[k.slice(0, 32)] = num(val, `${path}.skills.${k}`, 0, 1e7);
  const stat = (k: string) => int(st[k], `${path}.stats.${k}`, 1, 10);
  return {
    id: int(o.id, `${path}.id`, 0),
    name: str(o.name, `${path}.name`, 40),
    seed: int(o.seed, `${path}.seed`, -2147483648, 4294967295),
    traits: [str(traits[0], `${path}.traits[0]`, 32), str(traits[1], `${path}.traits[1]`, 32)],
    stats: { str: stat('str'), dex: stat('dex'), int: stat('int'), cha: stat('cha'), grit: stat('grit') },
    skills,
    mood: num(o.mood, `${path}.mood`, 0, 100),
    loyalty: num(o.loyalty, `${path}.loyalty`, 0, 100),
    hunger: num(o.hunger, `${path}.hunger`, 0, 100),
    rest: num(o.rest, `${path}.rest`, 0, 100),
    health: num(o.health, `${path}.health`, 0, 100),
    job: str(o.job, `${path}.job`, 32),
    x: num(o.x, `${path}.x`, -1e5, 1e5),
    z: num(o.z, `${path}.z`, -1e5, 1e5),
    bed: int(o.bed, `${path}.bed`, -1),
    injured: bool(o.injured, `${path}.injured`),
    alive: bool(o.alive, `${path}.alive`),
  };
}

function validateCrop(v: unknown, path: string): CropSave {
  const o = obj(v, path);
  const c: CropSave = {
    plot: int(o.plot, `${path}.plot`, 0),
    crop: str(o.crop, `${path}.crop`, 32),
    planted: num(o.planted, `${path}.planted`, -1e9, 1e9),
    growth: num(o.growth, `${path}.growth`, 0, 1),
    water: num(o.water, `${path}.water`, 0, 1),
    nutrients: num(o.nutrients, `${path}.nutrients`, 0, 1),
  };
  if (o.lastCrop !== undefined) c.lastCrop = str(o.lastCrop, `${path}.lastCrop`, 32);
  return c;
}

function genVersionOf(v: unknown): number {
  const g = int(v, 'world.genVersion', 1, 1e6);
  if (g > WORLDGEN_VERSION) throw new SaveError('future_version', 'world.genVersion', `world v${g}, game supports v${WORLDGEN_VERSION}`);
  return g;
}

function validateWorld(v: unknown): WorldSave {
  const w = obj(v, 'world');
  const removedPiecesIn = obj(w.removedPieces, 'world.removedPieces');
  const removedPieces: Record<string, number[]> = {};
  for (const [k, list] of Object.entries(removedPiecesIn)) {
    if (!/^\d{1,6}$/.test(k)) throw new SaveError('bad_field', `world.removedPieces.${k.slice(0, 16)}`, 'bad building id');
    removedPieces[k] = arr(list, `world.removedPieces.${k}`, 4096).map((x, i) => int(x, `world.removedPieces.${k}[${i}]`, 0, 1e6));
  }
  const districtsIn = arr(w.districts, 'world.districts', 64);
  const districts: DistrictSave[] = DISTRICT_KEYS.map((_, i) => {
    const d = districtsIn[i];
    if (d === undefined) return { state: 0 as RestorationState, nodesOnline: [] };
    const o = obj(d, `world.districts[${i}]`);
    return {
      state: int(o.state, `world.districts[${i}].state`, 0, 4) as RestorationState,
      nodesOnline: arr(o.nodesOnline, `world.districts[${i}].nodesOnline`, 16).map((x, j) =>
        int(x, `world.districts[${i}].nodesOnline[${j}]`, 0, 1e6),
      ),
    };
  });
  const factionsIn = obj(w.factions, 'world.factions');
  const factions: Record<string, number> = {};
  for (const [k, val] of Object.entries(factionsIn)) factions[k.slice(0, 32)] = num(val, `world.factions.${k}`, -100, 100);
  const questsIn = obj(w.quests, 'world.quests');
  const quests: Record<string, number> = {};
  for (const [k, val] of Object.entries(questsIn)) quests[k.slice(0, 64)] = int(val, `world.quests.${k}`, -1, 1000);
  const flagsIn = obj(w.flags, 'world.flags');
  const flags: Record<string, boolean | number | string> = {};
  for (const [k, val] of Object.entries(flagsIn)) {
    if (typeof val === 'boolean') flags[k.slice(0, 64)] = val;
    else if (typeof val === 'number') flags[k.slice(0, 64)] = num(val, `world.flags.${k}`);
    else if (typeof val === 'string') flags[k.slice(0, 64)] = str(val, `world.flags.${k}`, 500);
    else throw new SaveError('bad_field', `world.flags.${k.slice(0, 32)}`);
  }
  const diff = str(w.difficulty, 'world.difficulty', 16);
  const drops: DropPile[] = arr(w.drops, 'world.drops', 256).map((d, i) => {
    const o = obj(d, `world.drops[${i}]`);
    return {
      x: num(o.x, `world.drops[${i}].x`, -1e5, 1e5),
      z: num(o.z, `world.drops[${i}].z`, -1e5, 1e5),
      items: stacks(o.items, `world.drops[${i}].items`, 400).filter((s): s is ItemStack => s !== null),
      t: num(o.t, `world.drops[${i}].t`, -1e9, 1e9),
    };
  });
  const pieces = arr(w.pieces, 'world.pieces', 20000).map((p, i) => validatePiece(p, `world.pieces[${i}]`));
  const maxPieceId = pieces.reduce((m, p) => Math.max(m, p.id), 0);
  return {
    seed: int(w.seed, 'world.seed', 0, 4294967295) >>> 0,
    genVersion: genVersionOf(w.genVersion),
    hour: num(w.hour, 'world.hour', 0, 1e7),
    weather: str(w.weather, 'world.weather', 16),
    removedProps: [...new Set(arr(w.removedProps, 'world.removedProps').map((x, i) => int(x, `world.removedProps[${i}]`, 0, 1e7)))].sort(
      (a, b) => a - b,
    ),
    removedPieces,
    pieces,
    nextPieceId: Math.max(int(w.nextPieceId, 'world.nextPieceId', 1), maxPieceId + 1),
    drops,
    survivors: arr(w.survivors, 'world.survivors', 200).map((s, i) => validateSurvivor(s, `world.survivors[${i}]`)),
    crops: arr(w.crops, 'world.crops', 5000).map((c, i) => validateCrop(c, `world.crops[${i}]`)),
    districts,
    factions,
    townStock: stacks(w.townStock, 'world.townStock', 1000),
    blueprints: [...new Set(arr(w.blueprints, 'world.blueprints', 2000).map((x, i) => str(x, `world.blueprints[${i}]`, 64)))],
    quests,
    flags,
    difficulty: (diff === 'chill' || diff === 'hard' ? diff : 'standard') as Difficulty,
  };
}

/** Validate an already-migrated save. Throws SaveError on corrupt data; clamps out-of-range numbers. */
export function validateSave(x: unknown): GameSave {
  const o = obj(x, '');
  const schema = int(o.schema, 'schema', 0, 1e6);
  if (schema !== SAVE_SCHEMA_VERSION) throw new SaveError('bad_schema', 'schema', `expected ${SAVE_SCHEMA_VERSION}, got ${schema}`);
  return {
    schema,
    rev: int(o.rev, 'rev', 0, 2 ** 31 - 1),
    savedAt: num(o.savedAt, 'savedAt', 0, 1e14),
    playtime: num(o.playtime, 'playtime', 0, 1e10),
    gameVersion: str(o.gameVersion, 'gameVersion', 32),
    player: validatePlayer(o.player),
    world: validateWorld(o.world),
  };
}

// ------------------------------------------------------------------ migrations

/**
 * migrations[n] upgrades a raw save from schema n to n+1. Never remove entries.
 * Schema 0 is the pre-release prototype format: `{ v: 0, player: { pos: [x,y,z], food, water, ... }, world: {...} }`.
 */
export const MIGRATIONS: Record<number, (raw: Obj) => Obj> = {
  0: (raw) => {
    const p = isObj(raw.player) ? { ...raw.player } : {};
    const pos = Array.isArray(p.pos) ? p.pos : [0, 0, 0];
    const w = isObj(raw.world) ? { ...raw.world } : {};
    const player: Obj = {
      x: pos[0] ?? 0,
      y: pos[1] ?? 0,
      z: pos[2] ?? 0,
      yaw: p.yaw ?? 0,
      health: p.health ?? 100,
      hunger: p.food ?? p.hunger ?? 80,
      thirst: p.water ?? p.thirst ?? 80,
      stamina: p.stamina ?? 100,
      sleep: p.sleep ?? 90,
      conditions: [],
      inventory: Array.isArray(p.items) ? p.items : [],
      quick: [null, null, null, null],
      equipped: null,
      bed: null,
      perks: [],
      perkPoints: 0,
      xp: p.xp ?? 0,
    };
    const world: Obj = {
      seed: w.seed ?? 1,
      hour: w.hour ?? 8,
      weather: w.weather ?? 'clear',
      removedProps: Array.isArray(w.removedProps) ? w.removedProps : [],
      removedPieces: {},
      pieces: Array.isArray(w.pieces) ? w.pieces : [],
      nextPieceId: 1,
      drops: [],
      survivors: [],
      crops: [],
      districts: DISTRICT_KEYS.map((k) => ({ state: k === 'haven' ? 1 : 0, nodesOnline: [] })),
      factions: { hearth: 20, reavers: 0, guild: 0, custodians: -50 },
      townStock: [],
      blueprints: [],
      quests: {},
      flags: {},
      difficulty: 'standard',
    };
    return {
      schema: 1,
      rev: typeof raw.rev === 'number' ? raw.rev : 0,
      savedAt: typeof raw.savedAt === 'number' ? raw.savedAt : 0,
      playtime: typeof raw.playtime === 'number' ? raw.playtime : 0,
      gameVersion: '0.0.0',
      player,
      world,
    };
  },
  // v1 -> v2: worldgen versioning. Every v1 save was made against worldgen v1.
  1: (raw) => {
    const w = isObj(raw.world) ? { ...raw.world } : {};
    w.genVersion = 1;
    return { ...raw, schema: 2, world: w };
  },
  // v2 -> v3: progression goes live. XP, perk points and quest reputation were
  // never granted before; credit completed quests and rebooted nodes once.
  2: (raw) => {
    const p = isObj(raw.player) ? { ...raw.player } : {};
    const w = isObj(raw.world) ? { ...raw.world } : {};
    if (isObj(w.factions)) w.factions = { ...w.factions };
    retroactiveProgress(p, w);
    return { ...raw, schema: 3, player: p, world: w };
  },
};

/**
 * Move a save to a newer worldgen version. Versions only append props, so all
 * existing ids keep their meaning; the only conflict is a NEW prop landing on
 * something the player owns (placed pieces, crops' plots, drops, bed, survivors,
 * the player). Those new props are marked removed. Returns the ids it removed.
 * Must be called with a layout generated at the target version.
 */
export function upgradeWorldGen(save: GameSave, layout: WorldLayout): number[] {
  const w = save.world;
  if (w.genVersion >= layout.genVersion) return [];
  const from = layout.propMarks[w.genVersion];
  if (from === undefined) throw new SaveError('bad_field', 'world.genVersion', `layout has no mark for v${w.genVersion}`);
  const spots: [number, number, number][] = []; // x, z, clearance radius
  for (const p of w.pieces) spots.push([p.x, p.z, 2.6]);
  for (const d of w.drops) spots.push([d.x, d.z, 1.5]);
  for (const sv of w.survivors) spots.push([sv.x, sv.z, 1.5]);
  const pl = save.player;
  spots.push([pl.x, pl.z, 3]);
  if (pl.bed) spots.push([pl.bed.x, pl.bed.z, 2.5]);
  const removed = new Set(w.removedProps);
  const added: number[] = [];
  for (let i = from; i < layout.props.length; i++) {
    const p = layout.props[i];
    if (p.building >= 0) continue;
    const [hx, hz] = PROP_HALF[p.kind];
    const pr = Math.hypot(hx, hz) * p.scale;
    for (const [x, z, r] of spots) {
      if (Math.hypot(p.x - x, p.z - z) < pr + r) {
        if (!removed.has(p.id)) {
          removed.add(p.id);
          added.push(p.id);
        }
        break;
      }
    }
  }
  w.removedProps = [...removed].sort((a, b) => a - b);
  w.genVersion = layout.genVersion;
  return added;
}

/** Upgrade any supported raw save to the current schema and validate it. */
export function migrateSave(raw: unknown): GameSave {
  if (!isObj(raw)) throw new SaveError('not_object');
  let cur: Obj = raw;
  let schema = typeof cur.schema === 'number' ? cur.schema : typeof cur.v === 'number' ? cur.v : 0;
  if (!Number.isInteger(schema) || schema < 0) throw new SaveError('bad_schema', 'schema');
  if (schema > SAVE_SCHEMA_VERSION) throw new SaveError('future_version', 'schema', `save is v${schema}, game supports v${SAVE_SCHEMA_VERSION}`);
  while (schema < SAVE_SCHEMA_VERSION) {
    const m = MIGRATIONS[schema];
    if (!m) throw new SaveError('bad_schema', 'schema', `no migration from v${schema}`);
    try {
      cur = m(cur);
    } catch (e) {
      if (e instanceof SaveError) throw e;
      throw new SaveError('bad_field', 'migration', String(e));
    }
    schema++;
    cur.schema = schema;
  }
  return validateSave(cur);
}

// ------------------------------------------------------------------ encoding

export function encodeSave(save: GameSave): Uint8Array {
  return deflateSync(strToU8(JSON.stringify(save)), { level: 6 });
}

export function decodeSave(bytes: Uint8Array): GameSave {
  let json: string;
  try {
    const raw = inflateSync(bytes);
    if (raw.length > MAX_DECODED_BYTES) throw new SaveError('too_large');
    json = strFromU8(raw);
  } catch (e) {
    if (e instanceof SaveError) throw e;
    throw new SaveError('decode_failed', '', 'inflate');
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new SaveError('decode_failed', '', 'json');
  }
  return migrateSave(parsed);
}

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const B64_LOOKUP = (() => {
  const t = new Int16Array(128).fill(-1);
  for (let i = 0; i < B64.length; i++) t[B64.charCodeAt(i)] = i;
  return t;
})();

export function bytesToBase64(b: Uint8Array): string {
  const parts: string[] = [];
  let chunk = '';
  for (let i = 0; i < b.length; i += 3) {
    const n = (b[i] << 16) | ((b[i + 1] ?? 0) << 8) | (b[i + 2] ?? 0);
    chunk += B64[(n >> 18) & 63] + B64[(n >> 12) & 63] + (i + 1 < b.length ? B64[(n >> 6) & 63] : '=') + (i + 2 < b.length ? B64[n & 63] : '=');
    if (chunk.length > 8192) {
      parts.push(chunk);
      chunk = '';
    }
  }
  parts.push(chunk);
  return parts.join('');
}

export function base64ToBytes(s: string): Uint8Array {
  const clean = s.replace(/[\s]/g, '');
  if (clean.length % 4 !== 0) throw new SaveError('decode_failed', '', 'base64 length');
  let pad = 0;
  if (clean.endsWith('==')) pad = 2;
  else if (clean.endsWith('=')) pad = 1;
  const out = new Uint8Array((clean.length / 4) * 3 - pad);
  let o = 0;
  for (let i = 0; i < clean.length; i += 4) {
    const v = [0, 1, 2, 3].map((k) => {
      const ch = clean.charCodeAt(i + k);
      if (ch === 61 /* = */ && i + k >= clean.length - pad) return 0;
      const x = ch < 128 ? B64_LOOKUP[ch] : -1;
      if (x < 0) throw new SaveError('decode_failed', '', 'base64 char');
      return x;
    });
    const n = (v[0] << 18) | (v[1] << 12) | (v[2] << 6) | v[3];
    if (o < out.length) out[o++] = (n >> 16) & 255;
    if (o < out.length) out[o++] = (n >> 8) & 255;
    if (o < out.length) out[o++] = n & 255;
  }
  return out;
}

export function saveToBase64(save: GameSave): string {
  return bytesToBase64(encodeSave(save));
}

export function base64ToSave(s: string): GameSave {
  return decodeSave(base64ToBytes(s));
}

export interface SaveSummary {
  rev: number;
  savedAt: number;
  playtime: number;
}

/** Info shown in the "keep cloud / keep this device" conflict dialog. */
export function mergeConflictInfo(local: GameSave, cloud: GameSave): { local: SaveSummary; cloud: SaveSummary; newer: 'local' | 'cloud' } {
  const s = (g: GameSave): SaveSummary => ({ rev: g.rev, savedAt: g.savedAt, playtime: g.playtime });
  return { local: s(local), cloud: s(cloud), newer: local.savedAt >= cloud.savedAt ? 'local' : 'cloud' };
}
