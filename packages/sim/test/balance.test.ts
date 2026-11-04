// Balance + Phase 8 acceptance: a full season of survivors farming feeds the town.
import { describe, expect, it } from 'vitest';
import { countItem } from '../src/systems/inventory';
import { townFixture } from './balance.fixture';
import { computeNeeds, foodValue, tickTown, type TownEvent } from '../src/systems/survivors';
import { SEASON_DAYS } from '../src/data/crops';

const ctx = { difficulty: 'standard' as const, home: { x: 600, z: 600 }, rank: 3, cap: 13 };

describe('balance', () => {
  it('Phase 8: a full season of farming feeds a town of 10', () => {
    const world = townFixture(7, 10, 10);
    const events: TownEvent[] = [];
    // one full season, stepped in 15 minute frames like the client would
    for (let k = 0; k < SEASON_DAYS * 24 * 4; k++) events.push(...tickTown(world, 0.25, { ...ctx, noArrivals: true }));
    const alive = world.survivors.filter((s) => s.alive);
    const harvested = events.filter((e) => e.type === 'harvest').reduce((a, e) => a + (e.count ?? 0), 0);
    const starving = events.filter((e) => e.type === 'starving').length;
    const avgHunger = alive.reduce((a, s) => a + s.hunger, 0) / alive.length;
    expect(alive.length).toBe(10);
    expect(harvested).toBeGreaterThan(80);
    expect(starving).toBeLessThanOrEqual(2);
    expect(avgHunger).toBeGreaterThan(35);
    // the stores still hold food going into the next season
    expect(foodValue(world.townStock)).toBeGreaterThan(0);
    // farming kept planting: seeds are not a dead end
    expect(countItem(world.townStock, 'seed.potato') + countItem(world.townStock, 'seed.carrot') + countItem(world.townStock, 'seed.wheat')).toBeGreaterThan(0);
  });

  it('economy: materials accumulate from gather/scavenge jobs', () => {
    const world = townFixture(11, 8, 4);
    const scrap0 = countItem(world.townStock, 'mat.scrap');
    for (let d = 0; d < 5; d++) tickTown(world, 24, { ...ctx, noArrivals: true });
    const mats = ['mat.scrap', 'mat.timber', 'mat.wiring', 'mat.plastic'].reduce((a, m) => a + countItem(world.townStock, m), 0);
    expect(mats).toBeGreaterThan(scrap0 + 60);
    const needs = computeNeeds(world);
    expect(needs.population).toBe(8);
    expect(Number.isFinite(needs.food)).toBe(true);
  });

  it('a town with no farms leans on scavenging and does not instantly collapse', () => {
    const world = townFixture(5, 6, 0);
    for (let d = 0; d < 6; d++) tickTown(world, 24, { ...ctx, noArrivals: true });
    expect(world.survivors.filter((s) => s.alive).length).toBe(6);
  });
});
