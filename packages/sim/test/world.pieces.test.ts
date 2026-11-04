import { describe, expect, it } from 'vitest';
import type { BuildingDef, PropKind } from '@dg/shared';
import { buildingPieces, collapseAfterRemoval, initialRuinedPieces, propYield, PROP_HALF } from '../src/world/index';

const house: BuildingDef = {
  id: 0, district: 2, lot: 'house', x: 100, z: 100, w: 12, d: 8, rot: 0, floors: 2, roof: 'gable',
  enterable: true, variant: 12345, decay: 0.3,
};
const warehouse: BuildingDef = { ...house, lot: 'warehouse', w: 24, d: 16, floors: 1, roof: 'sawtooth', enterable: false };

describe('building pieces', () => {
  it('derives a deterministic piece list with a door, walls, slabs, beams and roof', () => {
    const a = buildingPieces(house);
    const b = buildingPieces(house);
    expect(a).toEqual(b);
    a.forEach((p, i) => expect(p.index).toBe(i));
    expect(a.filter((p) => p.kind === 'door')).toHaveLength(1);
    expect(a.filter((p) => p.kind === 'floor')).toHaveLength(2);
    expect(a.filter((p) => p.kind === 'beam')).toHaveLength(8);
    expect(a.filter((p) => p.kind === 'roof')).toHaveLength(1);
    expect(a.filter((p) => p.kind === 'fixture')).toHaveLength(1);
    // 12x8 => per floor 3+3+2+2 = 10 facade modules
    expect(a.filter((p) => p.kind === 'wall' || p.kind === 'window' || p.kind === 'door')).toHaveLength(20);
    for (const p of a) {
      for (const s of p.supports) expect(s).toBeLessThan(a.length);
      expect(p.yield.length).toBeGreaterThan(0);
      for (let k = 0; k < 3; k++) expect(p.max[k]).toBeGreaterThan(p.min[k]);
    }
    expect(buildingPieces(warehouse).some((p) => p.kind === 'pipe')).toBe(true);
  });

  it('removing a ground wall does not collapse the upper wall (slab still supports it)', () => {
    const pieces = buildingPieces(house);
    const ground = pieces.find((p) => p.floor === 0 && p.kind === 'wall')!;
    const removed = new Set<number>();
    expect(collapseAfterRemoval(pieces, removed, [ground.index])).toEqual([]);
    expect(removed.has(ground.index)).toBe(true);
  });

  it('removing all ground-floor supports collapses everything above', () => {
    const pieces = buildingPieces(house);
    const ground = pieces.filter((p) => p.floor === 0 && (p.side >= 0 && p.kind !== 'pipe' || p.kind === 'beam'));
    const removed = new Set<number>();
    const fallen = collapseAfterRemoval(pieces, removed, ground.map((p) => p.index));
    const upper = pieces.filter((p) => p.floor >= 1);
    for (const p of upper) expect(removed.has(p.index), `${p.kind} f${p.floor}`).toBe(true);
    expect(fallen.length).toBe(upper.length);
    // grounded slab and fixture survive
    expect(removed.has(0)).toBe(false);
  });

  it('removing the roof alone drops nothing, removing top walls+beams drops the roof', () => {
    const pieces = buildingPieces(house);
    const roof = pieces.find((p) => p.kind === 'roof')!;
    expect(collapseAfterRemoval(pieces, new Set(), [roof.index])).toEqual([]);
    const tops = roof.supports;
    const removed = new Set<number>();
    const fallen = collapseAfterRemoval(pieces, removed, tops);
    expect(fallen).toContain(roof.index);
  });

  it('decay pre-ruins only upper structure and is deterministic', () => {
    const ruined = { ...house, decay: 0.95 };
    const pieces = buildingPieces(ruined);
    const a = initialRuinedPieces(ruined, pieces);
    expect(a).toEqual(initialRuinedPieces(ruined, pieces));
    for (const i of a) expect(pieces[i].kind === 'wall' && pieces[i].floor === 0).toBe(false);
    expect(initialRuinedPieces({ ...house, decay: 0.05 }, pieces)).toEqual([]);
  });
});

describe('prop yields', () => {
  it('every prop kind has a tool, hp, material yield and weight 1..4', () => {
    for (const kind of Object.keys(PROP_HALF) as PropKind[]) {
      const y = propYield(kind);
      expect(y.hp).toBeGreaterThan(0);
      expect(y.weight).toBeGreaterThanOrEqual(1);
      expect(y.weight).toBeLessThanOrEqual(4);
      expect(y.yield.length, kind).toBeGreaterThan(0);
    }
  });
});
