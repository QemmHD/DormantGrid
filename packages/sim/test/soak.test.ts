// Soak: 30 in-game days (multiple seasons) at accelerated speed via the coarse model.
import { describe, expect, it } from 'vitest';
import type { WorldSave } from '@dg/shared';
import { tickTown, survivorTarget, assignJobs, computeNeeds, STOCK_SLOTS, FARMER_HARVEST_DELAY, type TownEvent } from '../src/systems/survivors';
import { seasonOf } from '../src/systems/time';
import { townBoard } from '../src/systems/townboard';
import { townFixture } from './balance.fixture';

function sane(world: WorldSave) {
  for (const s of world.survivors) {
    for (const v of [s.hunger, s.rest, s.health, s.mood, s.loyalty, s.x, s.z]) expect(Number.isFinite(v)).toBe(true);
    expect(s.hunger).toBeGreaterThanOrEqual(0);
    expect(s.health).toBeGreaterThanOrEqual(0);
    for (const xp of Object.values(s.skills)) expect(Number.isFinite(xp)).toBe(true);
  }
  for (const st of world.townStock) if (st) expect(st.n).toBeGreaterThan(0);
  for (const c of world.crops) for (const v of [c.growth, c.water, c.nutrients]) expect(Number.isFinite(v)).toBe(true);
}

describe('soak', () => {
  it('30 days: town alive, bounded, no NaN', () => {
    const world = townFixture(99, 12, 12, 18);
    const ctx = { difficulty: 'standard' as const, home: { x: 600, z: 600 }, rank: 4, cap: 18 };
    const seasons = new Set<string>();
    const all: TownEvent[] = [];
    let dayEvents: TownEvent[] = [];
    let saveSize = 0;
    for (let d = 0; d < 30; d++) {
      for (let h = 0; h < 24; h++) {
        const ev = tickTown(world, 1, ctx);
        dayEvents.push(...ev);
        all.push(...ev);
      }
      seasons.add(seasonOf(world.hour));
      const board = townBoard(dayEvents, world.hour, world.seed);
      expect(board.lines.length).toBeGreaterThan(0);
      dayEvents = [];
      sane(world);
      const size = JSON.stringify(world).length;
      if (d === 10) saveSize = size;
      if (d > 10) expect(size).toBeLessThan(saveSize * 2 + 20000); // save growth is bounded
    }
    expect(seasons.size).toBeGreaterThanOrEqual(4);
    const alive = world.survivors.filter((s) => s.alive);
    expect(alive.length).toBeGreaterThanOrEqual(8);
    expect(alive.length).toBeLessThanOrEqual(ctx.cap);
    expect(alive.filter((s) => s.hunger <= 0).length).toBeLessThan(alive.length / 2);
    expect(world.townStock.length).toBe(STOCK_SLOTS);
    expect(world.crops.length).toBeLessThanOrEqual(12);
    expect(Object.keys(world.flags).length).toBeLessThan(400);
    expect(all.some((e) => e.type === 'harvest')).toBe(true);
    expect(all.some((e) => e.type === 'arrival')).toBe(true);
    // nobody is stuck: survivors spread over several distinct targets
    const positions = new Set(alive.map((s) => `${Math.round(s.x)},${Math.round(s.z)}`));
    expect(positions.size).toBeGreaterThan(2);
  });

  it('near/far reconciliation: target is a pure function of state (no pops)', () => {
    const world = townFixture(3, 6, 4);
    const ctx = { difficulty: 'standard' as const, home: { x: 600, z: 600 }, rank: 2, cap: 6 };
    tickTown(world, 30, ctx);
    const jobs = assignJobs(world, computeNeeds(world));
    for (const s of world.survivors) {
      // the coarse model already placed them at their target for the current hour
      const t = survivorTarget(s, world, jobs.get(s.id) ?? 'idle', Math.floor(world.hour), ctx.home);
      expect(Math.hypot(t.x - s.x, t.z - s.z)).toBeLessThan(0.01);
    }
  });

  it('deterministic replay: same seed, same state', () => {
    const run = () => {
      const w = townFixture(21, 8, 6);
      const ctx = { difficulty: 'standard' as const, home: { x: 600, z: 600 }, rank: 3, cap: 12 };
      for (let i = 0; i < 24 * 10; i++) tickTown(w, 1, ctx);
      return JSON.stringify(w);
    };
    expect(run()).toBe(run());
  });
});

describe('round 6: farmers leave the player-planted ripe crop for a while', () => {
  it('a ripe crop the player planted waits FARMER_HARVEST_DELAY hours; a farmer-planted one does not', () => {
    const world = townFixture(7, 6, 4, 8);
    const ctx = { difficulty: 'standard' as const, home: { x: 600, z: 600 }, rank: 2, cap: 8 };
    for (const s of world.survivors) s.job = 'farm';
    const plots = world.pieces.filter((p) => p.piece === 'farm_plot').slice(0, 2);
    expect(plots.length).toBe(2);
    world.crops = world.crops.filter((c) => !plots.some((p) => p.id === c.plot));
    const h = world.hour;
    world.crops.push({ plot: plots[0].id, crop: 'carrot', planted: h - 80, growth: 0.999, water: 1, nutrients: 1, mine: true });
    world.crops.push({ plot: plots[1].id, crop: 'carrot', planted: h - 80, growth: 0.999, water: 1, nutrients: 1 });
    const mine = () => world.crops.find((c) => c.plot === plots[0].id)!;
    const theirs = () => world.crops.find((c) => c.plot === plots[1].id)!;
    tickTown(world, 1, ctx); // both ripen this hour
    expect(theirs().crop === '' || theirs().growth < 1).toBe(true); // farmers took theirs
    expect(mine().crop).toBe('carrot');
    expect(mine().growth).toBe(1);
    for (let i = 0; i < FARMER_HARVEST_DELAY - 1; i++) tickTown(world, 1, ctx);
    expect(mine().growth).toBe(1); // still waiting for the player
    for (let i = 0; i < 3; i++) tickTown(world, 1, ctx);
    expect(mine().crop === '' || mine().growth < 1).toBe(true); // then the town brings it in
  });
});
