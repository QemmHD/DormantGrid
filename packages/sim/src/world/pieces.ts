// Deterministic deconstructable piece lists for generated buildings, and simple support/collapse rules.

import { Rng, hash2, type BuildingDef, type LotType, type MaterialId, type PropKind, type ToolTier } from '@dg/shared';
import { PROP_SALVAGE, type BuildingPieceKind } from '../data/loot';

/** Storey height of generated (world) buildings in meters. */
export const BUILDING_FLOOR_H = 3.5;
/** Wall module width along a facade, meters. */
export const WALL_MODULE = 4;
export const WALL_THICK = 0.3;

export interface PieceInfo {
  index: number;
  kind: BuildingPieceKind;
  floor: number;
  /** 0 front (+z local, street side), 1 back (-z), 2 right (+x), 3 left (-x); -1 not a facade piece */
  side: -1 | 0 | 1 | 2 | 3;
  /** building-local AABB (x/z centered on the footprint center, y from ground) */
  min: [number, number, number];
  max: [number, number, number];
  /** indices this piece rests on. Empty = grounded (never falls). Falls when ALL supports are gone. */
  supports: number[];
  material: MaterialId;
  yield: { mat: MaterialId; n: number }[];
  /** minimum tool tier */
  tool: ToolTier;
  hp: number;
}

type Family = 'timber' | 'brick' | 'metal';

function family(lot: LotType): Family {
  switch (lot) {
    case 'house':
    case 'barn':
    case 'shelter':
      return 'timber';
    case 'warehouse':
    case 'factory':
    case 'depot':
    case 'pumphouse':
      return 'metal';
    default:
      return 'brick';
  }
}

const WALL_MAT: Record<Family, MaterialId> = { timber: 'timber', brick: 'brick', metal: 'scrap' };
const MAT_TOOL: Record<MaterialId, ToolTier> = {
  timber: 'axe', brick: 'pickaxe', scrap: 'saw', glass: 'crowbar', cloth: 'hands', wiring: 'hands',
  plastic: 'hands', chemicals: 'hands', organic: 'hands',
};
const MAT_HP: Record<MaterialId, number> = {
  timber: 60, brick: 110, scrap: 90, glass: 20, cloth: 10, wiring: 15, plastic: 15, chemicals: 10, organic: 10,
};

/**
 * Every deconstructable piece of a generated building, in a stable order:
 * per floor: floor slab, 4 corner beams, facade wall modules (front, back, right, left); then roof, pipes, fixture.
 */
export function buildingPieces(b: BuildingDef): PieceInfo[] {
  const fam = family(b.lot);
  const wallMat = WALL_MAT[fam];
  const H = BUILDING_FLOOR_H;
  const hw = b.w / 2;
  const hd = b.d / 2;
  const out: PieceInfo[] = [];
  const add = (p: Omit<PieceInfo, 'index'>) => {
    out.push({ ...p, index: out.length });
    return out.length - 1;
  };
  const r = new Rng(hash2(b.variant, 0xbee));
  let prevSupports: number[] = []; // walls+beams of the floor below
  let prevBeams: number[] = [];
  let prevWalls = new Map<string, number>(); // `${side}:${m}` -> index
  let topWalls: number[] = [];
  const area = b.w * b.d;
  const slabMat: MaterialId = fam === 'timber' ? 'timber' : 'brick';
  const beamMat: MaterialId = fam === 'timber' ? 'timber' : 'scrap';

  for (let f = 0; f < b.floors; f++) {
    const y0 = f * H;
    const slab = add({
      kind: 'floor', floor: f, side: -1,
      min: [-hw, y0, -hd], max: [hw, y0 + 0.2, hd],
      supports: f === 0 ? [] : prevSupports.slice(),
      material: slabMat,
      yield: [{ mat: slabMat, n: clampInt(area / 32, 2, 40) }],
      tool: MAT_TOOL[slabMat],
      hp: Math.round(MAT_HP[slabMat] * 1.5),
    });
    const beams: number[] = [];
    const corners: [number, number][] = [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]];
    corners.forEach(([cx, cz], k) => {
      const sx = Math.sign(cx);
      const sz = Math.sign(cz);
      beams.push(
        add({
          kind: 'beam', floor: f, side: -1,
          min: [cx - (sx > 0 ? 0.4 : 0), y0, cz - (sz > 0 ? 0.4 : 0)],
          max: [cx + (sx < 0 ? 0.4 : 0), y0 + H, cz + (sz < 0 ? 0.4 : 0)],
          supports: f === 0 ? [] : [prevBeams[k], slab],
          material: beamMat,
          yield: [{ mat: beamMat, n: 2 }],
          tool: fam === 'timber' ? 'axe' : 'torch',
          hp: MAT_HP[beamMat] * 2,
        }),
      );
    });
    const walls = new Map<string, number>();
    const floorWalls: number[] = [];
    // facades: side 0 front (+z), 1 back (-z), 2 right (+x), 3 left (-x)
    for (let side = 0 as 0 | 1 | 2 | 3; side < 4; side = (side + 1) as 0 | 1 | 2 | 3) {
      const len = side < 2 ? b.w : b.d;
      const n = Math.max(1, Math.round(len / WALL_MODULE));
      const mod = len / n;
      const door = f === 0 && side === 0 ? Math.floor(n / 2) : -1;
      for (let m = 0; m < n; m++) {
        const a0 = -len / 2 + m * mod;
        const a1 = a0 + mod;
        let min: [number, number, number];
        let max: [number, number, number];
        if (side === 0) {
          min = [a0, y0, hd - WALL_THICK];
          max = [a1, y0 + H, hd];
        } else if (side === 1) {
          min = [a0, y0, -hd];
          max = [a1, y0 + H, -hd + WALL_THICK];
        } else if (side === 2) {
          min = [hw - WALL_THICK, y0, a0];
          max = [hw, y0 + H, a1];
        } else {
          min = [-hw, y0, a0];
          max = [-hw + WALL_THICK, y0 + H, a1];
        }
        const shopFront = f === 0 && side === 0 && (b.lot === 'shop' || b.lot === 'clinic');
        const isWindow = m !== door && r.chance(shopFront ? 0.75 : 0.38);
        const below = prevWalls.get(`${side}:${m}`);
        const supports = f === 0 ? [] : below !== undefined ? [below, slab] : [slab];
        let kind: BuildingPieceKind = 'wall';
        let yieldList: { mat: MaterialId; n: number }[] = [{ mat: wallMat, n: 3 }];
        let tool = MAT_TOOL[wallMat];
        let hp = MAT_HP[wallMat];
        if (m === door) {
          kind = 'door';
          yieldList = [{ mat: 'timber', n: 2 }, { mat: 'scrap', n: 1 }];
          tool = 'crowbar';
          hp = 40;
        } else if (isWindow) {
          kind = 'window';
          yieldList = [{ mat: 'glass', n: 2 }, { mat: wallMat, n: 1 }];
          tool = 'crowbar';
          hp = 25;
        }
        const idx = add({ kind, floor: f, side, min, max, supports, material: kind === 'window' ? 'glass' : kind === 'door' ? 'timber' : wallMat, yield: yieldList, tool, hp });
        walls.set(`${side}:${m}`, idx);
        floorWalls.push(idx);
      }
    }
    prevSupports = [...floorWalls, ...beams];
    prevBeams = beams;
    prevWalls = walls;
    topWalls = prevSupports;
  }

  const roofMat: MaterialId = fam === 'timber' ? 'timber' : fam === 'metal' ? 'scrap' : 'brick';
  const top = b.floors * H;
  const roofH = b.roof === 'gable' ? Math.min(b.w, b.d) * 0.35 : b.roof === 'sawtooth' ? 1.6 : 0.4;
  add({
    kind: 'roof', floor: b.floors, side: -1,
    min: [-hw, top, -hd], max: [hw, top + roofH, hd],
    supports: topWalls.slice(),
    material: roofMat,
    yield: [{ mat: roofMat, n: clampInt(area / 32, 2, 40) }],
    tool: MAT_TOOL[roofMat],
    hp: MAT_HP[roofMat] * 2,
  });

  if (fam === 'metal') {
    // exterior pipes bolted to ground-floor back wall modules
    const backs = out.filter((p) => p.floor === 0 && p.side === 1 && p.kind === 'wall');
    const n = Math.min(backs.length, 1 + (b.variant % 2));
    for (let k = 0; k < n; k++) {
      const w = backs[Math.floor(((k + 0.5) * backs.length) / n)];
      const cx = (w.min[0] + w.max[0]) / 2;
      add({
        kind: 'pipe', floor: 0, side: 1,
        min: [cx - 0.2, 0, -hd - 0.4], max: [cx + 0.2, BUILDING_FLOOR_H * 0.9, -hd],
        supports: [w.index],
        material: 'scrap',
        yield: [{ mat: 'scrap', n: 2 }],
        tool: 'crowbar',
        hp: 30,
      });
    }
  }
  if (b.enterable) {
    add({
      kind: 'fixture', floor: 0, side: -1,
      min: [-0.3, BUILDING_FLOOR_H - 0.4, -0.3], max: [0.3, BUILDING_FLOOR_H - 0.1, 0.3],
      supports: [0],
      material: 'wiring',
      yield: [{ mat: 'wiring', n: 2 }, { mat: 'plastic', n: 1 }],
      tool: 'hands',
      hp: 10,
    });
  }
  return out;
}

/**
 * Apply removal of `newlyRemoved` and propagate collapse. Mutates `removed` (adds newly removed and fallen).
 * Returns the indices that fell as a consequence (not including `newlyRemoved`), in fall order.
 */
export function collapseAfterRemoval(pieces: readonly PieceInfo[], removed: Set<number>, newlyRemoved: readonly number[]): number[] {
  // reverse dependency map
  const dependents: number[][] = pieces.map(() => []);
  for (const p of pieces) for (const s of p.supports) dependents[s]?.push(p.index);
  const fallen: number[] = [];
  const queue: number[] = [];
  for (const i of newlyRemoved) {
    if (!removed.has(i)) {
      removed.add(i);
      queue.push(i);
    }
  }
  while (queue.length) {
    const i = queue.shift()!;
    for (const d of dependents[i] ?? []) {
      if (removed.has(d)) continue;
      const p = pieces[d];
      if (p.supports.length > 0 && p.supports.every((s) => removed.has(s))) {
        removed.add(d);
        fallen.push(d);
        queue.push(d);
      }
    }
  }
  return fallen;
}

/**
 * Pieces already missing at world start because of decay (deterministic). Ground-floor walls are always kept
 * so buildings stay readable; includes the consequences of collapse. Sorted ascending.
 */
export function initialRuinedPieces(b: BuildingDef, pieces: readonly PieceInfo[]): number[] {
  if (b.decay < 0.2) return [];
  const r = new Rng(hash2(b.variant, 0xdeca));
  const top = b.floors - 1;
  const gone: number[] = [];
  for (const p of pieces) {
    if (p.kind === 'roof' && b.decay > 0.6 && r.chance((b.decay - 0.6) * 1.6)) gone.push(p.index);
    else if (p.kind === 'window' && r.chance(b.decay * 0.5)) gone.push(p.index);
    else if (p.kind === 'wall' && p.floor === top && p.floor > 0 && r.chance(b.decay * 0.3)) gone.push(p.index);
  }
  const removed = new Set<number>();
  collapseAfterRemoval(pieces, removed, gone);
  return [...removed].sort((a, c) => a - c);
}

const MAT_IDS: ReadonlySet<string> = new Set<MaterialId>([
  'scrap', 'timber', 'brick', 'glass', 'cloth', 'wiring', 'plastic', 'chemicals', 'organic',
]);

/**
 * Material-level summary of what a prop yields (item-level yields with components live in data/loot PROP_SALVAGE).
 * weight 1..4 drives hitstop frames and shake.
 */
export function propYield(kind: PropKind): { tool: ToolTier; hp: number; yield: { mat: MaterialId; n: number }[]; weight: number } {
  const s = PROP_SALVAGE[kind];
  const yields: { mat: MaterialId; n: number }[] = [];
  for (const y of s.yields) {
    const mat = y.item.startsWith('mat.') ? y.item.slice(4) : '';
    if (!MAT_IDS.has(mat)) continue;
    const n = Math.round(((y.min + y.max) / 2) * (y.chance ?? 1));
    if (n > 0) yields.push({ mat: mat as MaterialId, n });
  }
  return {
    tool: s.tool,
    hp: Math.max(5, Math.round(s.time * 12)),
    yield: yields,
    weight: Math.max(1, Math.min(4, 1 + Math.round(s.weight * 3))),
  };
}

function clampInt(v: number, a: number, b: number): number {
  return Math.max(a, Math.min(b, Math.round(v)));
}
