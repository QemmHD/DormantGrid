// Telegraphed raids: scheduled with a warning lead time, composition scales with pressure.

import { Rng } from '@dg/shared';
import type { Difficulty } from '@dg/shared';
import type { EnemyId } from '../data/enemies';
import { ENEMY_MAP } from '../data/enemies';
import { DIFFICULTY } from './survival';

export const RAID_WARNING_HOURS = 6;
export const RAID_MIN_GAP_DAYS = 2;
/** the first raids are sized to the player's preparation and their losses are soft */
export const EARLY_RAIDS = 2;
/** extra breathing room after a lost raid, in hours (no death spiral) */
export const RAID_LOSS_GRACE_HOURS = 24;

/** What the player has ready for a raid (walls, traps, turrets, guards, a weapon in hand). */
export interface RaidPrep {
  walls: number;
  traps: number;
  turrets: number;
  guards: number;
  weapon: boolean;
}

/** 0.. score of how prepared Haven is; used only to size the early raids. */
export function prepScore(p: RaidPrep): number {
  return Math.min(p.walls, 12) * 1.5 + Math.min(p.traps, 6) * 3 + p.turrets * 12 + Math.min(p.guards, 4) * 6 + (p.weapon ? 6 : 0);
}

/**
 * Strength budget for early raid #index (0-based). A player with no defences gets the
 * smallest squad (two grunts / a drone and four crawlers / three hounds); preparing grows the
 * raid a little so it still feels like a raid, but never past what that preparation can hold.
 */
export function earlyRaidBudget(index: number, prep: RaidPrep): number {
  const base = index === 0 ? 22 : 30;
  const grow = prepScore(prep) * (index === 0 ? 0.25 : 0.35);
  return Math.round(Math.min(base + grow, index === 0 ? 34 : 46));
}

function fillToBudget(faction: RaidPlan['faction'], budget: number, sizeMult: number): RaidPlan['units'] {
  // cheapest-first recipe per faction; at least the core unit
  const recipe: Record<RaidPlan['faction'], { enemy: EnemyId; min: number }[]> = {
    reavers: [{ enemy: 'raider_grunt', min: 2 }, { enemy: 'raider_scout', min: 0 }],
    custodians: [{ enemy: 'drone', min: 1 }, { enemy: 'crawler', min: 3 }],
    wild: [{ enemy: 'hound', min: 2 }],
  };
  const units = recipe[faction].map((r) => ({ enemy: r.enemy, count: r.min }));
  const cost = (id: EnemyId) => raidStrength([{ enemy: id, count: 1 }]);
  let guard = 0;
  while (raidStrength(units) + cost(units[units.length - 1].enemy) <= budget && guard++ < 20) {
    // alternate additions so squads stay mixed
    const u = units[guard % units.length];
    if (raidStrength(units) + cost(u.enemy) > budget) break;
    u.count++;
  }
  for (const u of units) u.count = Math.max(u === units[0] ? 1 : 0, Math.round(u.count * sizeMult));
  return units.filter((u) => u.count > 0);
}

export interface RaidPlan {
  id: number;
  faction: 'reavers' | 'custodians' | 'wild';
  warnHour: number;
  arriveHour: number;
  /** compass direction they come from, radians */
  dir: number;
  units: { enemy: EnemyId; count: number }[];
  strength: number;
  /** what the raid goes for */
  goal: 'stores' | 'people' | 'nodes';
  /** one of the first EARLY_RAIDS: sized to preparation, soft losses */
  early?: boolean;
}

export interface RaidSchedulerState {
  lastRaidHour: number;
  nextId: number;
  pending: RaidPlan | null;
}

export function newRaidState(): RaidSchedulerState {
  return { lastRaidHour: -9999, nextId: 1, pending: null };
}

export function raidStrength(units: RaidPlan['units']): number {
  let s = 0;
  for (const u of units) {
    const e = ENEMY_MAP.get(u.enemy);
    if (e) s += u.count * (e.hp / 10 + e.damage / 2);
  }
  return Math.round(s);
}

/**
 * Call once per in-game day (e.g. at 06:00). Returns a new plan if a raid is scheduled.
 * Never two pending; first raid not before day 3 (day 5 on chill).
 */
export function maybeScheduleRaid(
  st: RaidSchedulerState,
  hour: number,
  rng: Rng,
  inp: { pressure: { reavers: number; custodians: number }; rank: number; difficulty: Difficulty; nightOnly?: boolean; raidIndex?: number; prep?: RaidPrep },
): RaidPlan | null {
  if (st.pending) return null;
  const day = Math.floor(hour / 24);
  const firstDay = inp.difficulty === 'chill' ? 5 : 3;
  if (day < firstDay) return null;
  if (hour - st.lastRaidHour < RAID_MIN_GAP_DAYS * 24) return null;
  const mult = DIFFICULTY[inp.difficulty]?.raid ?? 1;
  const pR = inp.pressure.reavers * 0.45 * mult;
  const pC = inp.pressure.custodians * 0.35 * mult;
  const pW = 0.08;
  const r = rng.next();
  let faction: RaidPlan['faction'] | null = null;
  if (r < pR) faction = 'reavers';
  else if (r < pR + pC) faction = 'custodians';
  else if (r < pR + pC + pW) faction = 'wild';
  if (!faction) return null;
  const sizeMult = DIFFICULTY[inp.difficulty]?.raidSize ?? 1;
  const early = (inp.raidIndex ?? EARLY_RAIDS) < EARLY_RAIDS;
  const scale = 1 + inp.rank * 0.35 + (faction === 'reavers' ? inp.pressure.reavers : inp.pressure.custodians);
  const units: RaidPlan['units'] = [];
  if (faction === 'reavers') {
    units.push({ enemy: 'raider_grunt', count: Math.max(2, Math.round(2 * scale)) });
    if (inp.rank >= 2) units.push({ enemy: 'raider_scout', count: Math.round(scale * 0.7) });
    if (inp.rank >= 3) units.push({ enemy: 'raider_brute', count: Math.max(1, Math.round(scale * 0.3)) });
    if (inp.rank >= 4) units.push({ enemy: 'raider_sniper', count: Math.max(1, Math.round(scale * 0.25)) });
    if (inp.rank >= 5) units.push({ enemy: 'raider_leader', count: 1 });
  } else if (faction === 'custodians') {
    units.push({ enemy: 'drone', count: Math.max(1, Math.round(scale * 0.6)) });
    units.push({ enemy: 'crawler', count: Math.max(3, Math.round(4 * scale)) });
    if (inp.rank >= 3) units.push({ enemy: 'guard_bot', count: Math.max(1, Math.round(scale * 0.3)) });
    if (inp.rank >= 6) units.push({ enemy: 'custodian_heavy', count: 1 });
  } else {
    units.push({ enemy: 'hound', count: Math.max(3, Math.round(3 * scale * 0.7)) });
    if (rng.chance(0.4)) units.push({ enemy: 'boar', count: 1 });
  }
  const cleaned = early
    ? fillToBudget(faction, earlyRaidBudget(inp.raidIndex ?? 0, inp.prep ?? { walls: 0, traps: 0, turrets: 0, guards: 0, weapon: false }), sizeMult)
    : units.map((u) => ({ enemy: u.enemy, count: Math.max(u === units[0] ? 1 : 0, Math.round(u.count * sizeMult)) })).filter((u) => u.count > 0);
  // arrive at dusk-to-night (18..23) so the day's warning is usable
  const arriveHour = day * 24 + 18 + rng.int(0, 5);
  const warnHour = Math.max(hour, arriveHour - RAID_WARNING_HOURS);
  const plan: RaidPlan = {
    id: st.nextId++,
    faction,
    warnHour,
    arriveHour,
    dir: rng.range(0, Math.PI * 2),
    units: cleaned,
    strength: raidStrength(cleaned),
    goal: faction === 'custodians' ? 'nodes' : faction === 'wild' ? 'people' : 'stores',
    early,
  };
  st.pending = plan;
  return plan;
}

export interface RaidOutcome {
  won: boolean;
  /** fraction of town stock lost 0..0.3 (capped: fair, never wipes you) */
  stockLoss: number;
  injuries: number;
  /** pieces damaged (hp fraction) */
  structureDamage: number;
}

/**
 * Resolve a raid statistically (player far away or skipped).
 * defense = guards*combatSkill + structure score + turrets. Losses are capped so it's never cruel.
 */
export function resolveRaidCoarse(plan: RaidPlan, defense: number, rng: Rng): RaidOutcome {
  const ratio = defense / Math.max(1, plan.strength);
  const roll = rng.range(0.8, 1.2);
  const won = ratio * roll >= 1;
  const severity = won ? Math.max(0, 0.4 - ratio * 0.2) : Math.min(1, 1.1 - ratio * 0.5);
  if (plan.early) {
    // soft failure: a few supplies taken, nobody hurt, light damage
    return { won, stockLoss: won ? 0 : Math.min(0.1, 0.04 + severity * 0.06), injuries: 0, structureDamage: Math.min(0.15, severity * 0.15) };
  }
  return {
    won,
    stockLoss: won ? 0 : Math.min(0.3, 0.08 + severity * 0.22),
    injuries: Math.round(severity * (won ? 1 : 3)),
    structureDamage: Math.min(0.5, severity * 0.4),
  };
}

/** Close the raid. A lost raid pushes the next one back by RAID_LOSS_GRACE_HOURS. */
export function finishRaid(st: RaidSchedulerState, hour: number, lost = false): void {
  st.pending = null;
  st.lastRaidHour = hour + (lost ? RAID_LOSS_GRACE_HOURS : 0);
}

/** Compass point a raid comes from (world -z is north). */
export function raidCompass(dir: number): 'N' | 'NE' | 'E' | 'SE' | 'S' | 'SW' | 'W' | 'NW' {
  // dir: x = cos(dir), z = sin(dir); bearing measured clockwise from north (-z)
  const bearing = (Math.atan2(Math.cos(dir), -Math.sin(dir)) + Math.PI * 2) % (Math.PI * 2);
  const pts = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'] as const;
  return pts[Math.round(bearing / (Math.PI / 4)) % 8];
}

/** Raid phase for UI given current hour. */
export function raidPhase(plan: RaidPlan | null, hour: number): 'none' | 'warning' | 'active' {
  if (!plan) return 'none';
  if (hour >= plan.arriveHour) return 'active';
  if (hour >= plan.warnHour) return 'warning';
  return 'none';
}
