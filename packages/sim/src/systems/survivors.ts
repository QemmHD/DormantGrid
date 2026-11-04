// Survivors: generation, schedules, job choice via the Needs Board, and the coarse
// statistical town model. The same model runs for every survivor; the client only
// visualises near survivors walking to `survivorTarget`, so approaching never pops.

import type { Difficulty, ItemStack, PlacedPiece, SurvivorSave, WorldSave } from '@dg/shared';
import { Rng, hash2 } from '@dg/shared';
import { getItem } from '../data/items';
import { BARKS, FIRST_NAMES, LAST_NAMES, SKILLS, TRAITS, TRAIT_MAP, type SkillId } from '../data/survivorTraits';
import { CROP_MAP, CROPS } from '../data/crops';
import { getPiece, pieceHp } from '../data/pieces';
import { addItem, countItem, createInventory, removeItem, type Inventory } from './inventory';
import { harvest, plant, tickCrop, fertilize, willRipenInTime } from './farming';
import { hourOfDay, seasonOf, weatherAt, dayOf, type Weather } from './time';
import { freshness, DIFFICULTY } from './survival';
import { itemValue } from './factions';

export type JobId = 'auto' | 'farm' | 'gather' | 'guard' | 'build' | 'haul' | 'cook' | 'heal' | 'scavenge' | 'companion' | 'idle';
export const ASSIGNABLE_JOBS: readonly JobId[] = ['auto', 'farm', 'gather', 'guard', 'build', 'haul', 'cook', 'heal', 'scavenge'] as const;
export const JOB_SKILL: Record<JobId, SkillId | null> = {
  auto: null,
  farm: 'farming',
  gather: 'scavenging',
  guard: 'combat',
  build: 'building',
  haul: 'building',
  cook: 'cooking',
  heal: 'medicine',
  scavenge: 'scavenging',
  companion: 'combat',
  idle: null,
};
export const JOB_NAMES: Record<JobId, string> = {
  auto: 'Auto (Needs Board)',
  farm: 'Farm',
  gather: 'Gather',
  guard: 'Guard',
  build: 'Build & Repair',
  haul: 'Haul',
  cook: 'Cook',
  heal: 'Heal',
  scavenge: 'Scavenge Run',
  companion: 'Companion',
  idle: 'Off duty',
};

export type Activity = 'sleep' | 'eat' | 'socialize' | 'work' | 'recover';

export interface TownEvent {
  type:
    | 'arrival'
    | 'left'
    | 'injury'
    | 'recovered'
    | 'death'
    | 'friendship'
    | 'conflict'
    | 'harvest'
    | 'planted'
    | 'cooked'
    | 'scavenged'
    | 'blueprint'
    | 'starving'
    | 'spoiled'
    | 'repaired'
    | 'livestock';
  hour: number;
  text: string;
  ids?: number[];
  item?: string;
  count?: number;
}

export interface TownContext {
  difficulty: Difficulty;
  /** Haven center (anchor for wandering/scavenge directions) */
  home: { x: number; z: number };
  rank: number;
  /** survivors cap from rank/services */
  cap: number;
  permadeath?: boolean;
  /** mood bonus from restoration (e.g. +2 per restored district) */
  moodBonus?: number;
  /** clinic service open */
  clinic?: boolean;
  /** Grid water: irrigated plots */
  irrigation?: boolean;
  /** survivor ids the player is currently directly controlling/accompanied by */
  companions?: number[];
  /** disable arrivals (tests) */
  noArrivals?: boolean;
}

export const STOCK_SLOTS = 120;

// ---------------- Generation ----------------

export function generateSurvivor(rng: Rng, id: number, x: number, z: number): SurvivorSave {
  const t1 = rng.pick(TRAITS);
  let t2 = rng.pick(TRAITS);
  for (let k = 0; k < 20 && (t2.id === t1.id || t1.excludes?.includes(t2.id) || t2.excludes?.includes(t1.id)); k++) t2 = rng.pick(TRAITS);
  const stat = () => rng.int(2, 8);
  const stats = { str: stat(), dex: stat(), int: stat(), cha: stat(), grit: stat() };
  const skills: Record<string, number> = {};
  for (const sk of SKILLS) {
    let xp = rng.int(0, 60);
    if (t1.skill?.[sk] || t2.skill?.[sk]) xp += 160;
    skills[sk] = xp;
  }
  return {
    id,
    name: `${rng.pick(FIRST_NAMES)} ${rng.pick(LAST_NAMES)}`,
    seed: rng.int(0, 0x7fffffff),
    traits: [t1.id, t2.id],
    stats,
    skills,
    mood: 60,
    loyalty: 50,
    hunger: 80,
    rest: 80,
    health: 100,
    job: 'auto',
    x,
    z,
    bed: -1,
    injured: false,
    alive: true,
  };
}

export function skillLevel(xp: number): number {
  return Math.max(0, Math.min(10, Math.floor(Math.sqrt(Math.max(0, xp) / 10))));
}

function traitMult(s: SurvivorSave, sk: SkillId): number {
  let m = 1;
  for (const t of s.traits) m *= TRAIT_MAP.get(t)?.skill?.[sk] ?? 1;
  return m;
}
function traitNum(s: SurvivorSave, key: 'hungerRate' | 'restRate' | 'social' | 'conflict' | 'bravery' | 'injuryRisk' | 'mood', def: number): number {
  let v = key === 'mood' ? 0 : def;
  for (const t of s.traits) {
    const tv = TRAIT_MAP.get(t)?.[key];
    if (tv !== undefined) v = key === 'mood' ? v + tv : v * tv;
  }
  return v;
}

/** Work efficiency multiplier for a job (0.4..~2). */
export function workEfficiency(s: SurvivorSave, job: JobId): number {
  const sk = JOB_SKILL[job];
  if (!sk) return 0;
  const lvl = skillLevel(s.skills[sk] ?? 0);
  const statKey: Record<SkillId, keyof SurvivorSave['stats']> = { farming: 'grit', scavenging: 'dex', building: 'str', cooking: 'int', combat: 'str', medicine: 'int', engineering: 'int' };
  const stat = s.stats[statKey[sk]] ?? 5;
  const mood = 0.6 + Math.max(0, Math.min(100, s.mood)) / 250;
  const tired = s.rest < 10 ? 0.6 : 1;
  return (0.6 + lvl * 0.08) * (0.8 + stat * 0.04) * traitMult(s, sk) * mood * tired;
}

// ---------------- Schedule ----------------

export function survivorActivity(s: SurvivorSave, hour: number): Activity {
  if (s.injured) return 'recover';
  const owl = s.traits.includes('night_owl');
  const h = hourOfDay(hour);
  const wake = owl ? 8 : 6;
  const sleep = owl ? 25 : 22; // 25 => 01:00
  const hh = owl && h < 3 ? h + 24 : h;
  if (hh < wake || hh >= sleep) return 'sleep';
  if ((h >= 7 && h < 8) || (h >= 12 && h < 13) || (h >= 18 && h < 19)) return 'eat';
  if (h >= 19 && h < 22) return 'socialize';
  return 'work';
}

// ---------------- Needs Board ----------------

export interface NeedsBoard {
  food: number; // 0..1 urgency
  materials: number;
  defense: number;
  construction: number;
  /** derived summaries for UI */
  foodDays: number;
  population: number;
  injured: number;
  beds: number;
}

const CORE_MATS = ['mat.scrap', 'mat.timber', 'mat.brick', 'mat.cloth'];

function stockOf(world: WorldSave): Inventory {
  if (!Array.isArray(world.townStock) || world.townStock.length === 0) world.townStock = createInventory(STOCK_SLOTS);
  return world.townStock;
}

export function foodValue(stock: Inventory): number {
  let v = 0;
  for (const s of stock) {
    if (!s) continue;
    const f = getItem(s.id)?.food;
    if (f && f.hunger >= 5) v += f.hunger * s.n;
  }
  return v;
}

const SURVIVOR_DAILY_FOOD = 50;

export function computeNeeds(world: WorldSave, raidPending = false): NeedsBoard {
  const stock = stockOf(world);
  const alive = world.survivors.filter((s) => s.alive);
  const pop = Math.max(1, alive.length);
  const foodDays = foodValue(stock) / (pop * SURVIVOR_DAILY_FOOD);
  let mats = 0;
  for (const m of CORE_MATS) mats += countItem(stock, m);
  const beds = world.pieces.filter((p) => p.piece === 'bed').length;
  let damaged = 0;
  for (const p of world.pieces) if (p.hp < maxHpOf(p) * 0.8) damaged++;
  const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
  const defensePieces = world.pieces.filter((p) => p.piece === 'wall' || p.piece === 'barricade' || p.piece === 'turret' || p.piece === 'gate').length;
  return {
    food: clamp01(1 - foodDays / 5),
    materials: clamp01(1 - mats / (pop * 30)),
    defense: clamp01((raidPending ? 0.6 : 0.15) + Math.max(0, 0.4 - defensePieces / 40)),
    construction: clamp01(damaged / Math.max(1, world.pieces.length) * 2 + (beds < pop ? 0.3 : 0)),
    foodDays: Math.round(foodDays * 10) / 10,
    population: alive.length,
    injured: alive.filter((s) => s.injured).length,
    beds,
  };
}

function maxHpOf(p: PlacedPiece): number {
  const def = getPiece(p.piece);
  return def ? pieceHp(def, p.tier) : p.hp;
}

/** Choose jobs for all 'auto' survivors, balanced against the Needs Board. Deterministic. */
export function assignJobs(world: WorldSave, needs: NeedsBoard): Map<number, JobId> {
  const out = new Map<number, JobId>();
  const counts: Partial<Record<JobId, number>> = {};
  const hasPlots = world.pieces.some((p) => p.piece === 'farm_plot');
  const hasFire = world.pieces.some((p) => p.piece === 'campfire' || p.piece === 'kitchen' || p.piece === 'smoker');
  const alive = world.survivors.filter((s) => s.alive).sort((a, b) => a.id - b.id);
  for (const s of alive) {
    if (s.job !== 'auto') {
      out.set(s.id, s.job as JobId);
      counts[s.job as JobId] = (counts[s.job as JobId] ?? 0) + 1;
    }
  }
  const plots = world.pieces.filter((p) => p.piece === 'farm_plot').length;
  for (const s of alive) {
    if (s.job !== 'auto') continue;
    const w: [JobId, number][] = [];
    if (hasPlots) w.push(['farm', 0.35 + needs.food * 1.2 - Math.max(0, (counts.farm ?? 0) - plots / 3) * 0.5]);
    if (hasFire) w.push(['cook', 0.2 + needs.food * 0.6 - (counts.cook ?? 0) * 0.6]);
    w.push(['gather', 0.3 + needs.materials * 0.9]);
    w.push(['scavenge', 0.25 + needs.materials * 0.6 + (hasPlots ? 0 : needs.food * 0.8)]);
    w.push(['guard', 0.1 + needs.defense * 1.2]);
    if (world.pieces.length > 0) w.push(['build', 0.1 + needs.construction * 1.2]);
    if (needs.injured > 0) w.push(['heal', 0.2 + needs.injured * 0.3 - (counts.heal ?? 0) * 0.8]);
    if (alive.length >= 6) w.push(['haul', 0.15 - (counts.haul ?? 0) * 0.5]);
    let best: JobId = 'gather';
    let bestScore = -Infinity;
    for (const [job, base] of w) {
      const score = base * workEfficiency(s, job) - (counts[job] ?? 0) * 0.12;
      if (score > bestScore) {
        bestScore = score;
        best = job;
      }
    }
    out.set(s.id, best);
    counts[best] = (counts[best] ?? 0) + 1;
  }
  return out;
}

// ---------------- Targets for near-survivor visualisation ----------------

export interface SurvivorTarget {
  x: number;
  z: number;
  /** piece the survivor is using, if any */
  piece?: number;
  /** pose hint for the client animation */
  pose: 'sleep' | 'sit' | 'stand' | 'work' | 'walk_away' | 'guard' | 'lie';
  /** true when the survivor is off on a scavenging run (far away) */
  away?: boolean;
}

function pieceOfType(world: WorldSave, types: string[], pick: number): PlacedPiece | undefined {
  const list = world.pieces.filter((p) => types.includes(p.piece));
  if (list.length === 0) return undefined;
  return list[Math.abs(pick) % list.length];
}

export function survivorTarget(s: SurvivorSave, world: WorldSave, job: JobId, hour: number, home: { x: number; z: number }): SurvivorTarget {
  const act = survivorActivity(s, hour);
  const day = dayOf(hour);
  const jitter = (salt: number, r: number): [number, number] => {
    const h = hash2(hash2(s.seed, salt), day);
    const a = ((h & 0xffff) / 0xffff) * Math.PI * 2;
    const d = (((h >>> 16) & 0xffff) / 0xffff) * r;
    return [Math.cos(a) * d, Math.sin(a) * d];
  };
  const at = (p: PlacedPiece | undefined, pose: SurvivorTarget['pose'], ring = 1.6): SurvivorTarget => {
    if (!p) {
      const [jx, jz] = jitter(7, 10);
      return { x: home.x + jx, z: home.z + jz, pose: 'stand' };
    }
    const a = ((s.id * 2.399963) % (Math.PI * 2));
    return { x: p.x + Math.cos(a) * ring, z: p.z + Math.sin(a) * ring, piece: p.id, pose };
  };
  switch (act) {
    case 'sleep': {
      const bed = world.pieces.find((p) => p.id === s.bed);
      if (bed) return { x: bed.x, z: bed.z, piece: bed.id, pose: 'sleep' };
      return at(pieceOfType(world, ['campfire'], s.id), 'lie', 2.4);
    }
    case 'recover': {
      const bed = world.pieces.find((p) => p.id === s.bed);
      if (bed) return { x: bed.x, z: bed.z, piece: bed.id, pose: 'lie' };
      return at(pieceOfType(world, ['campfire'], s.id), 'lie', 2.4);
    }
    case 'eat':
    case 'socialize':
      return at(pieceOfType(world, ['campfire', 'kitchen'], 0), 'sit', 2 + (s.id % 3) * 0.5);
    case 'work':
      switch (job) {
        case 'farm':
          return at(pieceOfType(world, ['farm_plot'], s.id + day), 'work', 1.8);
        case 'cook':
          return at(pieceOfType(world, ['kitchen', 'campfire', 'smoker'], s.id), 'work', 1.1);
        case 'build':
        case 'haul':
          return at(pieceOfType(world, ['wall', 'foundation', 'storage', 'workbench1'], s.id + day * 7), 'work', 1.4);
        case 'guard':
          return at(pieceOfType(world, ['alarm', 'gate', 'barricade', 'wall', 'turret'], s.id), 'guard', 1.5);
        case 'heal':
          return at(pieceOfType(world, ['bed'], s.id), 'work', 1.2);
        case 'gather': {
          const [jx, jz] = jitter(11, 70);
          return { x: home.x + jx, z: home.z + jz, pose: 'work' };
        }
        case 'scavenge': {
          const [jx, jz] = jitter(13, 1);
          const len = Math.hypot(jx, jz) || 1;
          const h = hourOfDay(hour);
          // leave in the morning, return in the late afternoon
          const out = h < 11 ? (h - 8) / 3 : h > 15 ? (18 - h) / 3 : 1;
          const r = 60 + 220 * Math.max(0, Math.min(1, out));
          return { x: home.x + (jx / len) * r, z: home.z + (jz / len) * r, pose: 'walk_away', away: out > 0.4 };
        }
        default:
          return at(pieceOfType(world, ['campfire', 'workbench1'], s.id), 'stand', 2.5);
      }
  }
}

// ---------------- Barks ----------------

export function barkFor(s: SurvivorSave, situation: keyof typeof BARKS | string, rng: Rng): string | null {
  const b = BARKS[situation];
  if (!b) return null;
  const pool: string[] = [...b.any];
  for (const t of s.traits) {
    const tl = b.trait?.[t];
    if (tl) pool.push(...tl, ...tl); // trait lines twice as likely
  }
  return pool.length ? rng.pick(pool) : null;
}

// ---------------- Coarse town model ----------------

function relKey(a: number, b: number): string {
  return a < b ? `rel:${a}:${b}` : `rel:${b}:${a}`;
}
export function relationship(world: WorldSave, a: number, b: number): number {
  const v = world.flags[relKey(a, b)];
  return typeof v === 'number' ? v : 0;
}

const COOK_MAP: [string[], string, number][] = [
  [['food.raw_meat', 'food.potato', 'food.potato'], 'food.stew', 2],
  [['food.raw_meat'], 'food.cooked_meat', 1],
  [['food.potato'], 'food.baked_potato', 1],
  [['food.carrot', 'food.tomato', 'food.cabbage'], 'food.veg_soup', 2],
  // survivor cooks stretch any three vegetables into a pot of soup
  [['food.carrot', 'food.carrot', 'food.corn'], 'food.veg_soup', 2],
  [['food.carrot', 'food.carrot', 'food.carrot'], 'food.veg_soup', 2],
  [['food.tomato', 'food.tomato', 'food.corn'], 'food.veg_soup', 2],
  [['food.cabbage', 'food.cabbage', 'food.carrot'], 'food.veg_soup', 2],
  [['food.corn', 'food.corn', 'food.tomato'], 'food.veg_soup', 2],
  [['food.wheat', 'food.wheat', 'food.wheat'], 'food.flour', 1],
  [['food.flour'], 'food.flatbread', 2],
  [['drink.dirty_water'], 'drink.clean_water', 1],
];

const COOK_INGREDIENTS = new Set(['food.potato', 'food.raw_meat', 'food.wheat', 'food.flour']);

function seedRng(world: WorldSave, hour: number, salt: number): Rng {
  return new Rng(hash2(hash2(world.seed, Math.floor(hour)), salt));
}

/** Stamp untimed perishable food in the stock with the current hour (so spoilage starts). */
function stampStock(stock: Inventory, hour: number): void {
  for (const s of stock) if (s && s.t === undefined && getItem(s.id)?.food?.spoilHours) s.t = hour;
}

function eatFromStock(stock: Inventory, s: SurvivorSave, hour: number): boolean {
  let ate = false;
  for (let k = 0; k < 3 && s.hunger < 72; k++) {
    const room = 100 - s.hunger;
    let best = -1;
    let bestScore = -Infinity;
    for (let i = 0; i < stock.length; i++) {
      const st = stock[i];
      if (!st) continue;
      const f = getItem(st.id)?.food;
      if (!f || f.hunger < 5) continue;
      if ((f.sickness ?? 0) > 0.3 && s.hunger > 20) continue;
      if (f.hunger > room + 8 && s.hunger > 25) continue; // don't waste a big meal on a small appetite
      if (COOK_INGREDIENTS.has(st.id) && s.hunger > 30) continue; // leave ingredients for the cook
      // prefer cooked/high value, and food closest to spoiling
      const fresh = freshness(st, hour);
      const score = f.hunger + (f.spoilHours ? (1 - fresh) * 30 : -5);
      if (score > bestScore) {
        bestScore = score;
        best = i;
      }
    }
    if (best < 0) break;
    const st = stock[best]!;
    const f = getItem(st.id)!.food!;
    s.hunger = Math.min(100, s.hunger + f.hunger);
    st.n -= 1;
    if (st.n <= 0) stock[best] = null;
    ate = true;
  }
  return ate;
}

function addStock(stock: Inventory, item: string, n: number, hour: number): number {
  if (n <= 0) return 0;
  const f = getItem(item)?.food;
  return n - addItem(stock, item, n, f?.spoilHours ? { t: hour } : undefined);
}

function freeBed(world: WorldSave): PlacedPiece | undefined {
  const used = new Set(world.survivors.filter((s) => s.alive).map((s) => s.bed));
  return world.pieces.find((p) => p.piece === 'bed' && !used.has(p.id));
}

/**
 * Advance the town by `hours` of game time starting at world.hour (advances world.hour
 * and world.weather). Hourly discrete steps on whole-hour crossings. Returns events.
 */
export function tickTown(world: WorldSave, hours: number, ctx: TownContext): TownEvent[] {
  const events: TownEvent[] = [];
  const dt = Number.isFinite(hours) && hours > 0 ? Math.min(hours, 24 * 60) : 0;
  if (dt === 0) return events;
  const start = world.hour;
  const end = start + dt;
  const firstStep = Math.floor(start) + 1;
  for (let h = firstStep; h <= Math.floor(end); h++) hourStep(world, h, ctx, events);
  world.hour = end;
  world.weather = weatherAt(world.seed, end);
  return events;
}

/** Alias for clarity in offline catch-up and tests. */
export const simulateSurvivorsCoarse = tickTown;

function hourStep(world: WorldSave, hour: number, ctx: TownContext, ev: TownEvent[]): void {
  const stock = stockOf(world);
  const weather: Weather = weatherAt(world.seed, hour);
  const rng = seedRng(world, hour, 1);
  const hOfDay = hourOfDay(hour);
  const alive = world.survivors.filter((s) => s.alive);
  const needs = computeNeeds(world);
  const jobs = assignJobs(world, needs);
  const drain = DIFFICULTY[ctx.difficulty]?.drain ?? 1;
  const companions = new Set(ctx.companions ?? []);

  let haulBonus = 0;
  for (const s of alive) if (jobs.get(s.id) === 'haul' && survivorActivity(s, hour) === 'work') haulBonus += 0.05;
  haulBonus = Math.min(0.25, haulBonus);

  let farmerPower = 0;
  let guardPower = 0;
  let cookPower = 0;
  let healPower = 0;
  let buildPower = 0;
  const hasFire = world.pieces.some((p) => p.piece === 'campfire' || p.piece === 'kitchen' || p.piece === 'smoker');

  for (const s of alive) {
    const act = survivorActivity(s, hour);
    const job: JobId = companions.has(s.id) ? 'companion' : (jobs.get(s.id) ?? 'idle');
    // needs
    const hungerRate = traitNum(s, 'hungerRate', 1) * drain;
    s.hunger = Math.max(0, s.hunger - (act === 'sleep' ? 0.7 : 1.7) * hungerRate);
    if (act === 'sleep' || act === 'recover') s.rest = Math.min(100, s.rest + 12);
    else s.rest = Math.max(0, s.rest - 3.2 * traitNum(s, 'restRate', 1));
    if (act === 'eat' || s.hunger < 30) {
      const before = s.hunger;
      eatFromStock(stock, s, hour);
      if (s.hunger <= 0 && before <= 0 && hOfDay === 12) ev.push({ type: 'starving', hour, text: `${s.name} has gone hungry all day.`, ids: [s.id] });
    }
    if (s.hunger <= 0) {
      // hunger weakens but does not bed-ride people (that would starve the farms too)
      s.health = Math.max(ctx.permadeath ? 0 : 10, s.health - 3);
      s.mood = Math.max(0, s.mood - 2);
    } else if (!s.injured) s.health = Math.min(100, s.health + 1);

    // injuries / recovery
    if (s.injured) {
      s.health = Math.min(100, s.health + 2 * (ctx.clinic ? 2 : 1));
      if (s.health <= 0 && ctx.permadeath && s.hunger <= 0) {
        s.alive = false;
        ev.push({ type: 'death', hour, text: `${s.name} didn’t make it.`, ids: [s.id] });
        continue;
      }
      if (s.health >= 60) {
        s.injured = false;
        ev.push({ type: 'recovered', hour, text: `${s.name} is back on their feet.`, ids: [s.id] });
      }
    } else if (s.health <= 0 && s.hunger > 0) {
      s.injured = true;
      s.health = 5;
      ev.push({ type: 'injury', hour, text: `${s.name} collapsed and needs care.`, ids: [s.id] });
    }

    // work
    if (act === 'work' && job !== 'idle' && job !== 'companion') {
      const eff = workEfficiency(s, job) * (1 + (job === 'haul' ? 0 : haulBonus));
      const sk = JOB_SKILL[job];
      if (sk) s.skills[sk] = (s.skills[sk] ?? 0) + eff;
      switch (job) {
        case 'farm':
          farmerPower += eff;
          break;
        case 'guard':
          guardPower += eff * (1 + skillLevel(s.skills.combat ?? 0) * 0.2);
          break;
        case 'cook':
          cookPower += eff;
          break;
        case 'heal':
          healPower += eff;
          break;
        case 'build':
        case 'haul':
          buildPower += eff;
          break;
        case 'gather': {
          const n = Math.floor(eff * 1.6 + rng.next());
          const pool = ['mat.timber', 'mat.timber', 'mat.scrap', 'mat.organic', 'mat.brick', 'mat.cloth'];
          for (let i = 0; i < n; i++) addStock(stock, rng.pick(pool), 1, hour);
          break;
        }
        case 'scavenge': {
          const n = Math.floor(eff * 1.8 + rng.next());
          const pool = ['mat.scrap', 'mat.wiring', 'mat.plastic', 'mat.glass', 'mat.chemicals', 'mat.cloth', 'comp.nails'];
          for (let i = 0; i < n; i++) addStock(stock, rng.pick(pool), 1, hour);
          if (rng.chance(0.07 * eff)) {
            const food = rng.pick(['food.canned_beans', 'food.crackers', 'drink.soda', 'food.canned_beans']);
            addStock(stock, food, rng.int(1, 2), hour);
          }
          if (rng.chance(0.025 * eff)) addStock(stock, rng.pick(['med.bandage', 'med.painkillers', 'med.disinfectant']), 1, hour);
          if (rng.chance(0.003 * eff)) {
            const bp = rng.pick(['bp.crossbow', 'bp.canning', 'bp.chemlab', 'bp.workbench2']);
            if (!world.blueprints.includes(bp)) {
              world.blueprints.push(bp);
              ev.push({ type: 'blueprint', hour, text: `${s.name} found a blueprint: ${getItem(bp)?.name ?? bp}.`, ids: [s.id], item: bp });
            }
          }
          if (rng.chance(0.006 * traitNum(s, 'injuryRisk', 1))) {
            s.health = Math.max(5, s.health - rng.int(30, 55));
            if (s.health < 30) {
              s.injured = true;
              ev.push({ type: 'injury', hour, text: `${s.name} came back from a run limping.`, ids: [s.id] });
            }
          }
          break;
        }
      }
    }

    // mood + loyalty
    const bed = s.bed >= 0 && world.pieces.some((p) => p.id === s.bed);
    const target = 55 + traitNum(s, 'mood', 0) + (s.hunger > 30 ? 8 : -15) + (bed ? 6 : -10) + (s.injured ? -10 : 0) + (ctx.moodBonus ?? 0) + (needs.foodDays > 3 ? 4 : 0);
    s.mood += (Math.max(0, Math.min(100, target)) - s.mood) * 0.08;
    s.loyalty = Math.max(0, Math.min(100, s.loyalty + (s.mood > 60 ? 0.05 : s.mood < 30 ? -0.1 : 0)));

    // position follows the schedule (so far-away survivors are where they should be)
    const t = survivorTarget(s, world, job, hour, ctx.home);
    s.x = t.x;
    s.z = t.z;
  }

  // Farming: tend crops with pooled farmer capacity
  townFarming(world, stock, hour, weather, farmerPower, ctx, ev, rng);
  // Cooking
  if (hasFire && cookPower > 0) {
    let ready = 0;
    for (const st of stock) {
      const f = st ? getItem(st.id)?.food : undefined;
      if (st && f?.spoilHours !== undefined && f.spoilHours <= 120 && f.hunger >= 20) ready += f.hunger * st.n;
    }
    const enough = ready > alive.length * SURVIVOR_DAILY_FOOD * 1.5;
    let budget = enough ? 0 : Math.floor(cookPower * 2.5 + rng.next());
    if (enough && countItem(stock, 'drink.dirty_water') > 0) {
      removeItem(stock, 'drink.dirty_water', 1);
      addStock(stock, 'drink.clean_water', 1, hour);
    }
    let made = 0;
    for (const [ins, out, n] of COOK_MAP) {
      while (budget > 0) {
        const need = new Map<string, number>();
        for (const i of ins) need.set(i, (need.get(i) ?? 0) + 1);
        let ok = true;
        for (const [i, c] of need) if (countItem(stock, i) < c) ok = false;
        if (!ok) break;
        for (const [i, c] of need) removeItem(stock, i, c);
        addStock(stock, out, n, hour);
        budget--;
        made += n;
      }
    }
    if (made > 0 && hOfDay === 18) ev.push({ type: 'cooked', hour, text: `The kitchen turned out ${made} portions.`, count: made });
  }
  // Healing
  if (healPower > 0) {
    for (const s of alive) {
      if (!s.injured) continue;
      s.health = Math.min(100, s.health + 6 * healPower);
      if (countItem(stock, 'med.bandage') > 0 && rng.chance(0.2)) removeItem(stock, 'med.bandage', 1);
    }
  }
  // Repairs
  if (buildPower > 0) {
    let hp = buildPower * 40;
    for (const p of world.pieces) {
      if (hp <= 0) break;
      const max = maxHpOf(p);
      if (p.hp < max) {
        const add = Math.min(max - p.hp, hp);
        if (removeItem(stock, 'mat.scrap', Math.max(1, Math.floor(add / 80))) > 0 || add < 20) {
          p.hp += add;
          hp -= add;
        } else break;
      }
    }
  }
  world.flags['town.defense'] = Math.round(guardPower * 10) / 10;

  // Daily routines
  if (hOfDay === 0) dailySpoilage(stock, hour, ev);
  if (hOfDay === 20) socialize(world, alive, hour, rng, ev);
  if (hOfDay === 9) {
    arrivals(world, hour, ctx, rng, ev);
    departures(world, hour, ev);
  }
  if (hOfDay === 6) livestock(world, stock, hour, rng, ev);
  // assign beds
  for (const s of world.survivors) {
    if (!s.alive || (s.bed >= 0 && world.pieces.some((p) => p.id === s.bed))) continue;
    const b = freeBed(world);
    s.bed = b ? b.id : -1;
  }
  stampStock(stock, hour);
}

function townFarming(world: WorldSave, stock: Inventory, hour: number, weather: Weather, farmerPower: number, ctx: TownContext, ev: TownEvent[], rng: Rng): void {
  const plots = world.pieces.filter((p) => p.piece === 'farm_plot');
  if (plots.length === 0) return;
  const tended = Math.min(1, farmerPower / Math.max(1, plots.length * 0.25));
  const season = seasonOf(hour);
  let actions = Math.floor(farmerPower * 3 + 0.5); // plant/harvest/water/fertilize actions this hour
  let harvested = 0;
  for (const plot of plots) {
    let c = world.crops.find((x) => x.plot === plot.id);
    if (c && c.crop && CROP_MAP.has(c.crop)) {
      const def = CROP_MAP.get(c.crop)!;
      if (!def.frostHardy && season === 'winter' && c.growth < 1) {
        // frost takes tender crops left in the ground
        c.lastCrop = c.crop;
        c.crop = '';
        c.growth = 0;
        addStock(stock, 'mat.organic', 2, hour);
        ev.push({ type: 'spoiled', hour, text: `Frost took the ${def.name.toLowerCase()} bed.`, count: 0 });
      } else tickCrop(c, 1, { hour, weather, tended, irrigated: ctx.irrigation });
      if (actions > 0 && c.growth >= 1) {
        for (const y of harvest(c, rng)) {
          addStock(stock, y.item, y.count, hour);
          if (y.item.startsWith('food.')) harvested += y.count;
        }
        actions--;
      } else if (actions > 0 && c.water < 0.3) {
        c.water = 1;
        actions--;
      }
    }
    // plant fallow plots with an in-season seed from stock
    c = world.crops.find((x) => x.plot === plot.id);
    if (actions > 0 && (!c || !c.crop)) {
      const options = CROPS.filter((d) => d.seasons.includes(season) && countItem(stock, d.seed) > 0 && willRipenInTime(d, hour));
      if (options.length) {
        // rotate: prefer a different family than last time
        const last = c?.lastCrop ? CROP_MAP.get(c.lastCrop)?.family : undefined;
        const score = (d: (typeof CROPS)[number]) => {
          const planted = world.crops.filter((x) => x.crop === d.id).length;
          return cropFoodScore(d.id) * (d.family === last ? 0.92 : last ? 1.15 : 1) * (1 - Math.min(0.5, planted * 0.06));
        };
        options.sort((a, b) => score(b) - score(a) || (a.id < b.id ? -1 : 1));
        const def = options[0];
        const planted = plant(plot.id, def.seed, hour, c);
        if (planted) {
          removeItem(stock, def.seed, 1);
          if (planted.nutrients < 0.45 && countItem(stock, 'misc.fertilizer') > 0) {
            removeItem(stock, 'misc.fertilizer', 1);
            fertilize(planted);
          } else if (planted.nutrients < 0.45) {
            // compost: organic matter tilled back in
            if (removeItem(stock, 'mat.organic', 2) === 2) planted.nutrients = Math.min(1, planted.nutrients + 0.3);
          }
          if (c) Object.assign(c, planted);
          else world.crops.push(planted);
          actions--;
        }
      }
    }
  }
  // drop crops whose plot no longer exists
  if (world.crops.length > plots.length) {
    const ids = new Set(plots.map((p) => p.id));
    world.crops = world.crops.filter((c) => ids.has(c.plot));
  }
  if (harvested > 0) ev.push({ type: 'harvest', hour, text: `Harvested ${harvested} produce.`, count: harvested });
}

/** Hunger points per plot per day for the best way the town can eat this crop. */
const COOKED_HUNGER: Record<string, number> = { potato: 25, wheat: 14.6, carrot: 12, tomato: 12, corn: 14, cabbage: 14, pumpkin: 30 };
export function cropFoodScore(cropId: string): number {
  const d = CROP_MAP.get(cropId);
  if (!d) return 0;
  return (((d.yield[0] + d.yield[1]) / 2) * (COOKED_HUNGER[cropId] ?? 10)) / d.growDays;
}

function dailySpoilage(stock: Inventory, hour: number, ev: TownEvent[]): void {
  let spoiled = 0;
  for (let i = 0; i < stock.length; i++) {
    const s = stock[i];
    if (!s) continue;
    if (getItem(s.id)?.food?.spoilHours && freshness(s, hour) <= 0) {
      spoiled += s.n;
      stock[i] = null;
      addItem(stock, 'mat.organic', s.n);
    }
  }
  if (spoiled > 0) ev.push({ type: 'spoiled', hour, text: `${spoiled} food went off and became compost.`, count: spoiled });
}

function socialize(world: WorldSave, alive: SurvivorSave[], hour: number, rng: Rng, ev: TownEvent[]): void {
  if (alive.length < 2) return;
  const pairs = Math.ceil(alive.length / 2);
  for (let k = 0; k < pairs; k++) {
    const a = rng.pick(alive);
    const b = rng.pick(alive);
    if (a === b || a.injured || b.injured) continue;
    const key = relKey(a.id, b.id);
    const cur = relationship(world, a.id, b.id);
    const social = traitNum(a, 'social', 1) * traitNum(b, 'social', 1);
    const conflict = traitNum(a, 'conflict', 1) * traitNum(b, 'conflict', 1);
    if (rng.chance(0.12 * social)) {
      const next = Math.min(100, cur + 15);
      world.flags[key] = next;
      a.mood = Math.min(100, a.mood + 3);
      b.mood = Math.min(100, b.mood + 3);
      if (cur < 40 && next >= 40) ev.push({ type: 'friendship', hour, text: `${a.name} and ${b.name} are friends now.`, ids: [a.id, b.id] });
    } else if (rng.chance(0.04 * conflict)) {
      const next = Math.max(-100, cur - 20);
      world.flags[key] = next;
      a.mood = Math.max(0, a.mood - 4);
      b.mood = Math.max(0, b.mood - 4);
      ev.push({ type: 'conflict', hour, text: `${a.name} and ${b.name} argued about ${rng.pick(['the last can of beans', 'whose turn it was on watch', 'the correct way to stack firewood', 'a missing wrench', 'the music'])}.`, ids: [a.id, b.id] });
    }
  }
}

function arrivals(world: WorldSave, hour: number, ctx: TownContext, rng: Rng, ev: TownEvent[]): void {
  if (ctx.noArrivals) return;
  const alive = world.survivors.filter((s) => s.alive);
  if (alive.length >= ctx.cap) return;
  const bed = freeBed(world);
  if (!bed) return;
  const avgMood = alive.length ? alive.reduce((a, s) => a + s.mood, 0) / alive.length : 60;
  // people don't move into a hungry town
  if (avgMood < 35 || computeNeeds(world).foodDays < 2 || !rng.chance(0.4)) return;
  const id = world.survivors.reduce((m, s) => Math.max(m, s.id), 0) + 1;
  const s = generateSurvivor(rng, id, ctx.home.x + rng.range(-8, 8), ctx.home.z + rng.range(-8, 8));
  s.bed = bed.id;
  world.survivors.push(s);
  ev.push({ type: 'arrival', hour, text: `${s.name} walked in at dawn and asked if the bed was free. It was.`, ids: [s.id] });
}

function departures(world: WorldSave, hour: number, ev: TownEvent[]): void {
  for (let i = world.survivors.length - 1; i >= 0; i--) {
    const s = world.survivors[i];
    if (s.alive && s.loyalty <= 0 && s.mood < 20) {
      world.survivors.splice(i, 1);
      ev.push({ type: 'left', hour, text: `${s.name} packed a bag in the night and left a note: “Sorry.”`, ids: [s.id] });
    }
  }
  // dead survivors are kept out of the list after a day for save-size hygiene
  world.survivors = world.survivors.filter((s) => s.alive);
}

function livestock(world: WorldSave, stock: Inventory, hour: number, rng: Rng, ev: TownEvent[]): void {
  const coops = world.pieces.filter((p) => p.piece === 'coop').length;
  const chickens = Math.min(coops * 4, Number(world.flags['stock.chicken'] ?? 0));
  if (chickens <= 0) return;
  const feed = countItem(stock, 'misc.feed') + countItem(stock, 'mat.organic') * 0.25;
  const need = chickens * 0.25;
  const fed = Math.min(1, feed / Math.max(0.01, need));
  let used = need;
  const fromFeed = Math.min(countItem(stock, 'misc.feed'), Math.ceil(used));
  removeItem(stock, 'misc.feed', fromFeed);
  used -= fromFeed;
  if (used > 0) removeItem(stock, 'mat.organic', Math.ceil(used * 4));
  let eggs = 0;
  for (let i = 0; i < chickens; i++) if (rng.chance(0.9 * fed)) eggs++;
  if (eggs) addStock(stock, 'food.egg', eggs, hour);
  const last = Number(world.flags['stock.chicken.born'] ?? 0);
  if (chickens >= 2 && fed > 0.9 && hour - last >= 6 * 24 && chickens < coops * 4) {
    world.flags['stock.chicken'] = chickens + 1;
    world.flags['stock.chicken.born'] = hour;
    ev.push({ type: 'livestock', hour, text: 'A chick hatched. Everyone pretended not to be delighted.' });
  }
}

/** Town stock value in chits (for raid pressure). */
export function stockValue(stock: Inventory): number {
  let v = 0;
  for (const s of stock) if (s) v += itemValue(s.id) * s.n;
  return v;
}

export function defenseScore(world: WorldSave): number {
  let d = Number(world.flags['town.defense'] ?? 0) * 10;
  for (const p of world.pieces) {
    if (p.piece === 'wall' || p.piece === 'gate' || p.piece === 'fence') d += (p.tier + 1) * 1.5;
    else if (p.piece === 'barricade') d += 6;
    else if (p.piece === 'turret') d += 25;
    else if (p.piece === 'alarm') d += 5;
    else if (p.piece === 'spike_strip' || p.piece === 'bear_trap') d += 3;
  }
  return Math.round(d);
}

export type { ItemStack };
