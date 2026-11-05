import { describe, expect, it } from 'vitest';
import { nextUnlocks, rankProgress, unlocksAt } from '../src/systems/townrank';
import { RANK_THRESHOLDS } from '../src/systems/rank';

describe('Town Rank unlocks', () => {
  it('ranks 1-7 show 3 next unlocks; higher ranks show all that remain', () => {
    for (let r = 1; r <= 9; r++) {
      const n = nextUnlocks(r);
      const remaining = Array.from({ length: 10 - r }, (_, i) => unlocksAt(r + 1 + i).length).reduce((a, b) => a + b, 0);
      expect(n.length, `rank ${r}`).toBe(Math.min(3, remaining));
      if (r <= 7) expect(n.length).toBe(3);
      for (const u of n) expect(u.rank).toBeGreaterThan(r);
    }
    expect(nextUnlocks(10)).toEqual([]);
  });
  it('rank 2 unlocks the brick tier and named stations', () => {
    const u = unlocksAt(2).map((x) => x.label);
    expect(u).toContain('Brick building tier');
    expect(u.some((l) => /Bench|Kitchen|Station|Workbench|Machinist/.test(l))).toBe(true);
  });
  it('progress within a rank', () => {
    const p = rankProgress(2, RANK_THRESHOLDS[1] + 30);
    expect(p.into).toBe(30);
    expect(p.need).toBe(RANK_THRESHOLDS[2] - RANK_THRESHOLDS[1]);
    expect(rankProgress(10, 5000).max).toBe(true);
  });
});
