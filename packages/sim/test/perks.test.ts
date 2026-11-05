// Round 5: the town-side perks (Patch Job, Site Foreman, Warden) change the town sim measurably.
import { describe, expect, it } from 'vitest';
import { Rng } from '@dg/shared';
import { newGame } from '../src/save/index';
import { generateSurvivor, tickTown, type TownContext } from '../src/systems/survivors';

describe('perks are all live', () => {
  const town = (ctx: Partial<TownContext>, job: 'build' | 'guard') => {
    const s = newGame(7, 'standard', { x: 0, z: 0 });
    const w = s.world;
    w.hour = 24 * 3 + 10; // a working morning
    const r = new Rng(5);
    for (let i = 0; i < 3; i++) {
      const sv = generateSurvivor(r, i + 1, 2, 2);
      sv.job = job;
      sv.hunger = 90;
      sv.rest = 90;
      w.survivors.push(sv);
    }
    w.pieces.push({ id: 1, piece: 'wall', tier: 1, x: 0, y: 0, z: 0, rot: 0, hp: 10 });
    w.townStock.push({ id: 'mat.scrap', n: 50 }, { id: 'food.canned_beans', n: 30 });
    tickTown(w, 1, { difficulty: 'standard', home: { x: 0, z: 0 }, rank: 2, cap: 8, noArrivals: true, ...ctx } as TownContext);
    const scrap = w.townStock.filter((x) => x?.id === 'mat.scrap').reduce((a, x) => a + (x?.n ?? 0), 0);
    return { hp: w.pieces[0].hp, scrap, defense: Number(w.flags['town.defense'] ?? 0) };
  };

  it('Patch Job: repairs restore more per scrap', () => {
    const a = town({}, 'build'), b = town({ repairBonus: 0.5 }, 'build');
    expect(b.hp).toBeGreaterThan(a.hp);
    expect((b.hp - 10) / Math.max(1, 50 - b.scrap)).toBeGreaterThan((a.hp - 10) / Math.max(1, 50 - a.scrap));
  });

  it('Site Foreman: builders repair faster', () => {
    expect(town({ crewBonus: 0.25 }, 'build').hp).toBeGreaterThan(town({}, 'build').hp);
  });

  it('Warden: guards defend better', () => {
    expect(town({ guardBonus: 0.25 }, 'guard').defense).toBeGreaterThan(town({}, 'guard').defense);
  });
});
