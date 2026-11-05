// Town Rank progress + "what does the next rank give me": the next named unlocks
// (stations and pieces, recipes, building tiers, room for more residents).

import { PIECES, TIER_NAMES } from '../data/pieces';
import { RECIPES } from '../data/recipes';
import { getItem } from '../data/items';
import { RANK_THRESHOLDS, maxBuildTier, survivorCap } from './rank';

export interface RankUnlock {
  rank: number;
  label: string;
  kind: 'piece' | 'recipe' | 'tier' | 'residents';
}

/** Everything a rank unlocks, in a stable order. */
export function unlocksAt(rank: number): RankUnlock[] {
  const out: RankUnlock[] = [];
  if (maxBuildTier(rank) > maxBuildTier(rank - 1)) out.push({ rank, label: `${TIER_NAMES[maxBuildTier(rank)]} building tier`, kind: 'tier' });
  for (const p of PIECES) if (p.rank === rank) out.push({ rank, label: p.name, kind: 'piece' });
  for (const r of RECIPES) if (r.rank === rank) out.push({ rank, label: getItem(r.out)?.name ?? r.out, kind: 'recipe' });
  const more = survivorCap(rank) - survivorCap(rank - 1);
  if (more > 0) out.push({ rank, label: `Room for ${more} more residents (${survivorCap(rank)})`, kind: 'residents' });
  return out;
}

/** The next `n` unlocks above the current rank (named ones first within each rank). */
export function nextUnlocks(rank: number, n = 3): RankUnlock[] {
  const out: RankUnlock[] = [];
  for (let r = rank + 1; r <= 10 && out.length < n; r++) for (const u of unlocksAt(r)) if (out.length < n) out.push(u);
  return out;
}

/** Progress inside the current rank. */
export function rankProgress(rank: number, points: number): { into: number; need: number; frac: number; max: boolean } {
  if (rank >= 10) return { into: 0, need: 0, frac: 1, max: true };
  const lo = RANK_THRESHOLDS[rank - 1] ?? 0, hi = RANK_THRESHOLDS[rank] ?? lo + 1;
  const into = Math.max(0, points - lo), need = hi - lo;
  return { into, need, frac: Math.min(1, into / need), max: false };
}
