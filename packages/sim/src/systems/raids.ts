// Telegraphed raids: scheduled with a warning lead time, composition scales with pressure.

import { Rng } from '@dg/shared';
import type { Difficulty } from '@dg/shared';
import type { EnemyId } from '../data/enemies';
import { ENEMY_MAP } from '../data/enemies';
import { DIFFICULTY } from './survival';

export const RAID_WARNING_HOURS = 6;
export const RAID_MIN_GAP_DAYS = 2;

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
export function maybeScheduleRaid(st: RaidSchedulerState, hour: number, rng: Rng, inp: { pressure: { reavers: number; custodians: number }; rank: number; difficulty: Difficulty; nightOnly?: boolean }): RaidPlan | null {
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
  const cleaned = units.filter((u) => u.count > 0);
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
  return {
    won,
    stockLoss: won ? 0 : Math.min(0.3, 0.08 + severity * 0.22),
    injuries: Math.round(severity * (won ? 1 : 3)),
    structureDamage: Math.min(0.5, severity * 0.4),
  };
}

export function finishRaid(st: RaidSchedulerState, hour: number): void {
  st.pending = null;
  st.lastRaidHour = hour;
}

/** Raid phase for UI given current hour. */
export function raidPhase(plan: RaidPlan | null, hour: number): 'none' | 'warning' | 'active' {
  if (!plan) return 'none';
  if (hour >= plan.arriveHour) return 'active';
  if (hour >= plan.warnHour) return 'warning';
  return 'none';
}
