// Town Rank 1..10, tech tiers, survivor cap, player XP.

import type { PlayerSave } from '@dg/shared';
import { xpForLevel } from '../data/perks';

export interface RankInputs {
  population: number;
  /** districts at Powered (2) or above, excluding Haven */
  restoredDistricts: number;
  /** count of powered stations + irrigated plots + water */
  infrastructure: number;
  /** defense score (walls tiers, turrets, guards) */
  defense: number;
}

export const RANK_THRESHOLDS = [0, 40, 100, 180, 280, 400, 540, 700, 880, 1080];

export function rankPoints(i: RankInputs): number {
  const pop = Math.max(0, i.population);
  return Math.round(pop * 10 + Math.max(0, i.restoredDistricts) * 60 + Math.min(200, Math.max(0, i.infrastructure) * 6) + Math.min(200, Math.max(0, i.defense) * 2));
}

export function townRank(i: RankInputs): { rank: number; points: number; next: number | null } {
  const points = rankPoints(i);
  let rank = 1;
  for (let r = 0; r < RANK_THRESHOLDS.length; r++) if (points >= RANK_THRESHOLDS[r]) rank = r + 1;
  rank = Math.min(10, rank);
  return { rank, points, next: rank < 10 ? RANK_THRESHOLDS[rank] : null };
}

export function survivorCap(rank: number, housingService = false): number {
  return Math.min(40, 4 + rank * 3 + (housingService ? 8 : 0));
}

/** Building tier unlocked at rank: 0 scrap,1 timber at 1, brick at 2, reinforced at 4 (+blueprint). */
export function maxBuildTier(rank: number): 0 | 1 | 2 | 3 {
  return rank >= 4 ? 3 : rank >= 2 ? 2 : 1;
}

/** Grant XP; returns perk points gained. */
export function grantXp(p: PlayerSave, amount: number): number {
  if (!Number.isFinite(amount) || amount <= 0) return 0;
  const levelBefore = playerLevel(p.xp);
  p.xp += amount;
  const gained = playerLevel(p.xp) - levelBefore;
  p.perkPoints += gained;
  return gained;
}

export function playerLevel(xp: number): number {
  let lvl = 1;
  let need = 0;
  while (lvl < 60) {
    need += xpForLevel(lvl);
    if (xp < need) break;
    lvl++;
  }
  return lvl;
}
