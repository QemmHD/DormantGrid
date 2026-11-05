// Player survival: meters + conditions. Rates are per in-game hour
// (24 real minutes per in-game day => 1 game hour = 60 real seconds at default speed).

import type { ConditionId, Difficulty, ItemStack, PlayerSave } from '@dg/shared';
import { Rng } from '@dg/shared';
import { getItem } from '../data/items';
import { RECIPES } from '../data/recipes';

/** foods made at a campfire or kitchen (Camp Cook perk) */
const COOKED: ReadonlySet<string> = new Set(RECIPES.filter((r) => (r.station === 'campfire' || r.station === 'kitchen') && r.out.startsWith('food.')).map((r) => r.out));


/**
 * Difficulty (player-facing: Relaxed / Standard / Hard). drain = hunger/thirst rate,
 * damageTaken = enemy damage, raid = raid frequency, raidSize = raid squad size, loot = loot rolls.
 */
export const DIFFICULTY: Record<Difficulty, { drain: number; damageTaken: number; raid: number; raidSize: number; loot: number }> = {
  chill: { drain: 0.6, damageTaken: 0.6, raid: 0.5, raidSize: 0.7, loot: 1.25 },
  standard: { drain: 1, damageTaken: 1, raid: 1, raidSize: 1, loot: 1 },
  hard: { drain: 1.35, damageTaken: 1.4, raid: 1.5, raidSize: 1.35, loot: 0.85 },
};

/** Per game-hour base drains. */
export const RATES = {
  hunger: 3.2, // ~31h from full to empty
  thirst: 4.8, // ~21h
  sleep: 2.6, // ~38h awake
  starveDamage: 6, // per hour at 0 hunger
  dehydrateDamage: 9,
  exhaustedDamage: 0, // exhaustion slows you instead of killing you
  bleed: 14,
  infection: 3,
  sick: 2,
  regen: 4, // passive regen when fed/watered
};

export interface SurvivalContext {
  difficulty: Difficulty;
  /** true while sleeping in a bed */
  sleeping?: boolean;
  /** standing in rain without roof */
  exposed?: boolean;
  rng: Rng;
  /** perk modifiers */
  perks?: { sickness?: number; medicine?: number; staminaRegen?: number; cooking?: number; spoil?: number };
}

export interface SurvivalEvents {
  /** newly added conditions */
  gained: ConditionId[];
  /** removed conditions */
  lost: ConditionId[];
  /** health crossed 0 */
  died: boolean;
  /** threshold warnings that just triggered */
  warnings: ('hungry' | 'thirsty' | 'tired' | 'starving' | 'dehydrated' | 'exhausted')[];
}

const clamp = (v: number, lo = 0, hi = 100) => (Number.isFinite(v) ? (v < lo ? lo : v > hi ? hi : v) : lo);

export function hasCondition(p: PlayerSave, id: ConditionId): boolean {
  return p.conditions.some((c) => c.id === id);
}

export function addCondition(p: PlayerSave, id: ConditionId, hours: number, ev?: SurvivalEvents): void {
  const c = p.conditions.find((x) => x.id === id);
  if (c) c.t = Math.max(c.t, hours);
  else {
    p.conditions.push({ id, t: hours });
    ev?.gained.push(id);
  }
}

export function removeCondition(p: PlayerSave, id: ConditionId, ev?: SurvivalEvents): boolean {
  const i = p.conditions.findIndex((x) => x.id === id);
  if (i < 0) return false;
  p.conditions.splice(i, 1);
  ev?.lost.push(id);
  return true;
}

function newEvents(): SurvivalEvents {
  return { gained: [], lost: [], died: false, warnings: [] };
}

function crossed(before: number, after: number, threshold: number): boolean {
  return before > threshold && after <= threshold;
}

/** Advance survival meters by dtHours of game time. */
export function tickPlayer(p: PlayerSave, dtHours: number, ctx: SurvivalContext): SurvivalEvents {
  const ev = newEvents();
  const dt = Number.isFinite(dtHours) && dtHours > 0 ? Math.min(dtHours, 24) : 0;
  if (dt === 0 || p.health <= 0) return ev;
  const d = DIFFICULTY[ctx.difficulty] ?? DIFFICULTY.standard;
  const sick = hasCondition(p, 'sick');
  const sleeping = !!ctx.sleeping;

  const h0 = p.hunger;
  const t0 = p.thirst;
  const s0 = p.sleep;
  const hungerMul = (sick ? 1.5 : 1) * (sleeping ? 0.5 : 1);
  p.hunger = clamp(p.hunger - RATES.hunger * hungerMul * d.drain * dt);
  p.thirst = clamp(p.thirst - RATES.thirst * (sick ? 1.6 : 1) * (sleeping ? 0.5 : 1) * d.drain * dt);
  p.sleep = sleeping ? clamp(p.sleep + 12.5 * dt) : clamp(p.sleep - RATES.sleep * d.drain * dt);

  if (crossed(h0, p.hunger, 30)) ev.warnings.push('hungry');
  if (crossed(h0, p.hunger, 0.0001)) ev.warnings.push('starving');
  if (crossed(t0, p.thirst, 30)) ev.warnings.push('thirsty');
  if (crossed(t0, p.thirst, 0.0001)) ev.warnings.push('dehydrated');
  if (crossed(s0, p.sleep, 25)) ev.warnings.push('tired');
  if (crossed(s0, p.sleep, 0.0001)) ev.warnings.push('exhausted');

  let dmg = 0;
  if (p.hunger <= 0) dmg += RATES.starveDamage * dt;
  if (p.thirst <= 0) dmg += RATES.dehydrateDamage * dt;

  // Conditions
  for (let i = p.conditions.length - 1; i >= 0; i--) {
    const c = p.conditions[i];
    switch (c.id) {
      case 'bleeding':
        dmg += RATES.bleed * d.damageTaken * dt;
        c.t -= dt;
        // untreated bleeding can turn a wound dirty
        if (ctx.rng.chance(0.08 * dt * (1 + (ctx.perks?.sickness ?? 0)))) addCondition(p, 'infected', 24, ev);
        break;
      case 'infected':
        dmg += RATES.infection * d.damageTaken * dt;
        c.t += 0.25 * dt; // gets worse until treated
        if (c.t > 48 && ctx.rng.chance(0.05 * dt)) addCondition(p, 'sick', 12, ev);
        break;
      case 'sick':
        dmg += RATES.sick * dt;
        c.t -= dt * (sleeping ? 2 : 1);
        break;
      case 'fracture':
        // persists until splinted; heals slowly if resting
        c.t -= dt * (sleeping ? 1 : 0.15);
        break;
      default:
        c.t -= dt;
    }
    if (c.t <= 0 && c.id !== 'infected') {
      p.conditions.splice(i, 1);
      ev.lost.push(c.id);
    }
  }

  // Soaked from rain: mild, cleared by shelter
  if (ctx.exposed) addCondition(p, 'soaked', 1, ev);

  // Regen when fed, watered and not bleeding
  if (p.hunger > 40 && p.thirst > 40 && !hasCondition(p, 'bleeding') && !hasCondition(p, 'infected')) {
    const mult = (sleeping ? 3 : 1) * (hasCondition(p, 'wellfed') ? 1.5 : 1) * (hasCondition(p, 'rested') ? 1.2 : 1);
    p.health = clamp(p.health + RATES.regen * mult * dt);
  }
  p.health = clamp(p.health - dmg);
  if (p.health <= 0) ev.died = true;

  if (sleeping && p.sleep >= 99 && !hasCondition(p, 'rested')) addCondition(p, 'rested', 10, ev);
  return ev;
}

export interface Modifiers {
  speed: number; // move speed multiplier
  staminaRegen: number;
  canSprint: boolean;
  /** UI flags */
  limp: boolean;
}

export function modifiers(p: PlayerSave, perks?: SurvivalContext['perks']): Modifiers {
  let speed = 1;
  let regen = 1 + (perks?.staminaRegen ?? 0);
  const limp = hasCondition(p, 'fracture');
  if (limp) speed *= 0.62;
  if (p.sleep < 25) {
    speed *= 0.9;
    regen *= 0.6;
  }
  if (p.sleep <= 0) regen *= 0.5;
  if (p.hunger <= 0 || p.thirst <= 0) regen *= 0.5;
  if (hasCondition(p, 'sick')) regen *= 0.6;
  if (hasCondition(p, 'wellfed')) regen *= 1.25;
  if (hasCondition(p, 'rested')) regen *= 1.15;
  if (hasCondition(p, 'soaked')) regen *= 0.9;
  return { speed, staminaRegen: regen, canSprint: !limp && p.stamina > 5, limp };
}

/** Real-time stamina: call each frame with seconds. `use` = stamina spent this frame. */
export function tickStamina(p: PlayerSave, dtSeconds: number, use: number, mods: Modifiers): void {
  const dt = Number.isFinite(dtSeconds) && dtSeconds > 0 ? Math.min(dtSeconds, 1) : 0;
  const spend = Number.isFinite(use) && use > 0 ? use : 0;
  p.stamina = clamp(p.stamina - spend + (spend > 0 ? 0 : 18 * mods.staminaRegen * dt));
}

export interface ConsumeResult {
  ok: boolean;
  becameSick: boolean;
  spoiled: boolean;
  cured: ConditionId[];
  message: string;
}

/** Hours since made until spoil; returns 0..1 freshness, 1 = fresh. */
export function freshness(stack: ItemStack, hour: number, spoilMult = 1): number {
  const f = getItem(stack.id)?.food;
  if (!f?.spoilHours || stack.t === undefined) return 1;
  const age = Math.max(0, hour - stack.t);
  return Math.max(0, 1 - age / (f.spoilHours * spoilMult));
}

/** Eat/drink/use medicine. Caller removes one item from the inventory if ok. */
export function consume(p: PlayerSave, stack: ItemStack, hour: number, ctx: SurvivalContext, recentGroups: string[] = []): ConsumeResult {
  const def = getItem(stack.id);
  const res: ConsumeResult = { ok: false, becameSick: false, spoiled: false, cured: [], message: '' };
  if (!def) return res;
  if (def.food) {
    // Preserver: spoils slower (spoil -0.4 → lasts 1/0.6 as long)
    const fresh = freshness(stack, hour, 1 / Math.max(0.2, 1 + (ctx.perks?.spoil ?? 0)));
    res.spoiled = fresh <= 0;
    // Camp Cook: cooked meals restore more
    const q = (res.spoiled ? 0.4 : 1) * (COOKED.has(stack.id) ? 1 + (ctx.perks?.cooking ?? 0) : 1);
    p.hunger = clamp(p.hunger + def.food.hunger * q);
    p.thirst = clamp(p.thirst + def.food.thirst * q);
    let sickChance = (def.food.sickness ?? 0) + (res.spoiled ? 0.45 : 0);
    sickChance *= 1 + (ctx.perks?.sickness ?? 0);
    if (sickChance > 0 && ctx.rng.chance(sickChance)) {
      res.becameSick = true;
      addCondition(p, 'sick', 10);
    }
    // Nutrition variety: 3 distinct groups among the last few meals -> well fed buff
    if (def.food.group) {
      const groups = new Set([...recentGroups.slice(-4), def.food.group]);
      if (groups.size >= 3) addCondition(p, 'wellfed', 8);
    }
    res.ok = true;
    res.message = res.spoiled ? 'It was spoiled.' : res.becameSick ? 'Your stomach turns.' : '';
  }
  if (def.heals) {
    const mult = 1 + (ctx.perks?.medicine ?? 0);
    p.health = clamp(p.health + (def.heals.health ?? 0) * mult);
    for (const c of def.heals.cures ?? []) if (removeCondition(p, c)) res.cured.push(c);
    res.ok = true;
  }
  return res;
}

/** Apply a hit to the player; may cause bleeding or a fracture. Returns damage dealt. */
export function damagePlayer(p: PlayerSave, amount: number, kind: 'blunt' | 'cut' | 'fall' | 'bite' | 'shot', ctx: SurvivalContext, armor = 0): number {
  if (!Number.isFinite(amount) || amount <= 0 || p.health <= 0) return 0;
  const d = DIFFICULTY[ctx.difficulty] ?? DIFFICULTY.standard;
  const dmg = amount * d.damageTaken * (1 - Math.min(0.8, Math.max(0, armor)));
  p.health = clamp(p.health - dmg);
  const sev = dmg / 30;
  if ((kind === 'cut' || kind === 'bite' || kind === 'shot') && ctx.rng.chance(0.25 + sev * 0.4)) addCondition(p, 'bleeding', 3);
  if ((kind === 'blunt' || kind === 'fall') && dmg >= 18 && ctx.rng.chance(0.12 + sev * 0.3)) addCondition(p, 'fracture', 48);
  if (kind === 'bite' && ctx.rng.chance(0.08)) addCondition(p, 'infected', 24);
  return dmg;
}

/** Fall damage from vertical speed (m/s). */
export function fallDamage(vy: number): number {
  const v = Math.abs(vy);
  return v < 11 ? 0 : (v - 11) * 6;
}

/** Respawn after death: carried items go to a drop pile (caller creates DropPile). */
/** item categories a player keeps through death (gear); the haul (materials, food, parts) drops in a satchel */
export const KEPT_ON_DEATH: ReadonlySet<string> = new Set(['tool', 'weapon', 'ammo', 'medicine', 'blueprint', 'misc']);

/**
 * Respawn at `at`. The player keeps their gear (tools, weapons, ammo, medicine, blueprints, key items)
 * and whatever is on the quick bar; the rest is returned so the caller can drop it as a satchel.
 */
export function respawnPlayer(p: PlayerSave, at: { x: number; z: number }): (ItemStack | null)[] {
  const quick = new Set(p.quick.filter((q): q is string => !!q));
  const dropped = new Array<ItemStack | null>(p.inventory.length).fill(null);
  for (let i = 0; i < p.inventory.length; i++) {
    const s = p.inventory[i];
    if (!s) continue;
    const cat = getItem(s.id)?.category ?? 'material';
    if (KEPT_ON_DEATH.has(cat) || quick.has(s.id)) continue;
    dropped[i] = s;
    p.inventory[i] = null;
  }
  p.health = 60;
  p.hunger = Math.max(p.hunger, 50);
  p.thirst = Math.max(p.thirst, 50);
  p.stamina = 100;
  p.sleep = Math.max(p.sleep, 50);
  p.conditions = [];
  p.x = at.x;
  p.z = at.z;
  p.y = 0;
  return dropped;
}

export function newPlayer(spawn: { x: number; z: number }, slots = 24): PlayerSave {
  return {
    x: spawn.x,
    y: 0,
    z: spawn.z,
    yaw: 0,
    health: 100,
    hunger: 85,
    thirst: 80,
    stamina: 100,
    sleep: 90,
    conditions: [],
    inventory: new Array<ItemStack | null>(slots).fill(null),
    quick: [null, null, null, null],
    equipped: null,
    bed: null,
    perks: [],
    perkPoints: 0,
    xp: 0,
  };
}
