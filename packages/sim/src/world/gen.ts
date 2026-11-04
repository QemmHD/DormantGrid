// Deterministic town generator. Pure TS: no DOM, no three.js.
//
// Coordinates: world meters, origin at the south-west corner, x east, z south.
// Everything structural (roads, lots, buildings) is aligned to the 4 m tile grid.

import {
  Rng,
  hash2,
  fbm2,
  WORLD_SIZE,
  TILES,
  TILE_SIZE,
  NAVS,
  NAV_SIZE,
  Tile,
  DISTRICT_KEYS,
  type BuildingDef,
  type ControlNodeDef,
  type DistrictInfo,
  type DistrictKey,
  type LotType,
  type PropDef,
  type PropKind,
  type RoofType,
  type WorldLayout,
} from '@dg/shared';
import { layoutHash } from './query';

// ---------------------------------------------------------------- constants

/** Town core rectangle (meters). Everything outside is the Outskirts. */
export const CORE = { x0: 128, z0: 160, x1: 1088, z1: 1056 } as const;

const RIVER_HALF = 12; // 24 m wide river
const RAIL_HALF = 4; // 8 m rail bed

interface DistrictDef {
  key: DistrictKey;
  name: string;
  cx: number;
  cz: number;
  danger: number;
  /** Voronoi distance weight; >1 shrinks the district */
  weight: number;
}

const DISTRICT_DEFS: DistrictDef[] = [
  { key: 'haven', name: 'Haven Lot', cx: 216, cz: 640, danger: 0, weight: 1.45 },
  { key: 'downtown', name: 'Old Downtown', cx: 560, cz: 600, danger: 2, weight: 1.0 },
  { key: 'residential', name: 'Residential Rows', cx: 380, cz: 900, danger: 1, weight: 0.95 },
  { key: 'market', name: 'Market Row', cx: 680, cz: 880, danger: 1, weight: 1.05 },
  { key: 'industrial', name: 'Industrial Yard', cx: 990, cz: 420, danger: 4, weight: 0.95 },
  { key: 'hospital', name: 'Hospital Campus', cx: 380, cz: 400, danger: 2, weight: 1.05 },
  { key: 'waterworks', name: 'Waterworks', cx: 970, cz: 860, danger: 3, weight: 1.0 },
  { key: 'rail', name: 'Rail Depot', cx: 680, cz: 300, danger: 3, weight: 1.05 },
  { key: 'outskirts', name: 'The Outskirts', cx: 608, cz: 1150, danger: 1, weight: 1 },
];

const OUTSKIRTS = DISTRICT_KEYS.indexOf('outskirts');
const HAVEN = DISTRICT_KEYS.indexOf('haven');

/** Building rules per district. Sizes in meters (snapped to 4). */
interface PackRule {
  depth: [number, number];
  width: [number, number];
  gap: [number, number];
  setback: number;
  floors: [number, number];
  lots: [LotType, number][];
  /** chance a block becomes a park */
  park: number;
  /** chance to skip a building slot (sparser districts) */
  skip: number;
  /** yard prop density: attempts per 100 m² */
  yard: number;
  yardKinds: [PropKind, number][];
  fill: Tile;
  /** chance an interior road segment is kept */
  keep: number;
}

const RULES: Record<DistrictKey, PackRule> = {
  haven: {
    depth: [8, 12], width: [8, 16], gap: [12, 20], setback: 4, floors: [1, 1],
    lots: [['shelter', 3], ['house', 1]], park: 0, skip: 0.35, yard: 0.5,
    yardKinds: [['crate', 3], ['barrel', 2], ['pallet', 2], ['tire', 1], ['rubble', 1], ['bush', 1]],
    fill: Tile.Lot, keep: 0.7,
  },
  downtown: {
    depth: [16, 28], width: [12, 24], gap: [0, 4], setback: 0, floors: [3, 6],
    lots: [['office', 3], ['apartment', 2], ['shop', 2]], park: 0.1, skip: 0.04, yard: 0.9,
    yardKinds: [['rubble', 5], ['trashbag', 4], ['dumpster', 3], ['crate', 2], ['barrel', 2], ['debris', 2], ['bench', 1], ['tree', 1]],
    fill: Tile.Plaza, keep: 1,
  },
  residential: {
    depth: [8, 12], width: [8, 12], gap: [4, 8], setback: 4, floors: [1, 2],
    lots: [['house', 8], ['apartment', 1]], park: 0.12, skip: 0.06, yard: 0.9,
    yardKinds: [['tree', 5], ['bush', 6], ['fence', 3], ['trashbag', 2], ['tire', 1], ['rubble', 2], ['barrel', 1]],
    fill: Tile.Grass, keep: 0.95,
  },
  market: {
    depth: [12, 16], width: [8, 16], gap: [0, 4], setback: 0, floors: [1, 2],
    lots: [['shop', 6], ['apartment', 1], ['warehouse', 1]], park: 0.05, skip: 0.04, yard: 1.0,
    yardKinds: [['crate', 5], ['pallet', 4], ['trashbag', 3], ['dumpster', 2], ['rubble', 2], ['barrel', 2], ['table', 2]],
    fill: Tile.Plaza, keep: 1,
  },
  industrial: {
    depth: [16, 32], width: [16, 40], gap: [8, 12], setback: 4, floors: [1, 2],
    lots: [['warehouse', 3], ['factory', 2]], park: 0, skip: 0.1, yard: 0.7,
    yardKinds: [['container', 4], ['barrel', 4], ['pallet', 3], ['crate', 3], ['pipe', 2], ['tire', 2], ['dumpster', 1], ['rubble', 1]],
    fill: Tile.Lot, keep: 0.55,
  },
  hospital: {
    depth: [16, 24], width: [16, 32], gap: [8, 12], setback: 4, floors: [2, 4],
    lots: [['clinic', 4], ['office', 1]], park: 0.15, skip: 0.08, yard: 0.6,
    yardKinds: [['tree', 5], ['bench', 4], ['bush', 4], ['trashbag', 2], ['rubble', 2], ['crate', 3]],
    fill: Tile.Grass, keep: 0.8,
  },
  waterworks: {
    depth: [12, 20], width: [12, 24], gap: [8, 12], setback: 4, floors: [1, 2],
    lots: [['pumphouse', 3], ['warehouse', 1]], park: 0, skip: 0.15, yard: 0.7,
    yardKinds: [['pipe', 6], ['barrel', 5], ['crate', 3], ['rubble', 2], ['container', 2], ['tire', 2]],
    fill: Tile.Lot, keep: 0.6,
  },
  rail: {
    depth: [12, 20], width: [16, 32], gap: [8, 12], setback: 4, floors: [1, 2],
    lots: [['depot', 3], ['warehouse', 2]], park: 0, skip: 0.15, yard: 0.7,
    yardKinds: [['container', 6], ['pallet', 4], ['crate', 3], ['barrel', 3], ['rubble', 2], ['tire', 2]],
    fill: Tile.Lot, keep: 0.6,
  },
  outskirts: {
    depth: [8, 12], width: [8, 12], gap: [8, 12], setback: 4, floors: [1, 2],
    lots: [['house', 1]], park: 0, skip: 0.5, yard: 0.3,
    yardKinds: [['tree', 3], ['bush', 3], ['rock', 2], ['haybale', 1]],
    fill: Tile.Grass, keep: 0.5,
  },
};

const PARK_KINDS: [PropKind, number][] = [['tree', 9], ['bush', 6], ['bench', 3], ['rock', 2], ['streetlight', 1]];
const PLAZA_KINDS: [PropKind, number][] = [['tree', 6], ['bench', 6], ['bush', 4], ['trashbag', 2], ['streetlight', 2]];

/** Prop footprint half extents (x, z) in meters, used for overlap tests. */
export const PROP_HALF: Record<PropKind, [number, number]> = {
  car: [1.0, 2.3], van: [1.1, 2.7], bus: [1.3, 5.8], tree: [1.1, 1.1], pine: [1.0, 1.0], bush: [0.8, 0.8],
  rock: [1.0, 1.0], rubble: [1.2, 1.2], barrel: [0.4, 0.4], crate: [0.6, 0.6], dumpster: [1.0, 0.8],
  bench: [1.0, 0.4], streetlight: [0.3, 0.3], sign: [0.4, 0.4], hydrant: [0.3, 0.3], fence: [1.6, 0.2],
  pallet: [0.7, 0.6], tire: [0.5, 0.5], trashbag: [0.4, 0.4], mailbox: [0.3, 0.3], container: [1.25, 3.0],
  pipe: [0.4, 2.0], haybale: [0.9, 0.9], stump: [0.5, 0.5], locker: [0.3, 0.3], shelf: [0.9, 0.3],
  table: [0.8, 0.5], chair: [0.3, 0.3], bed: [0.9, 1.1], cabinet: [0.5, 0.3], sofa: [1.0, 0.45],
  fridge: [0.4, 0.4], stove: [0.4, 0.4], terminal: [0.4, 0.3], debris: [1.0, 1.0],
};

/** Large props that block navigation */
export const PROP_BLOCKS_NAV: ReadonlySet<PropKind> = new Set<PropKind>(['car', 'van', 'bus', 'container', 'dumpster']);

// ---------------------------------------------------------------- helpers

const snap4 = (v: number) => Math.round(v / 4) * 4;
const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
const tIdx = (tx: number, tz: number) => tz * TILES + tx;

function weighted<T>(rng: Rng, table: [T, number][]): T {
  let total = 0;
  for (const [, w] of table) total += w;
  let r = rng.next() * total;
  for (const [v, w] of table) {
    r -= w;
    if (r <= 0) return v;
  }
  return table[table.length - 1][0];
}

function smoothstep(a: number, b: number, x: number): number {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
}

interface Segment {
  vertical: boolean;
  /** line coordinate (x for vertical, z for horizontal) */
  c: number;
  a: number;
  b: number;
  arterial: boolean;
  kept: boolean;
  bridged: boolean;
}

interface Line {
  c: number;
  real: boolean;
  arterial: boolean;
  bridged: boolean;
}

interface Rect {
  x0: number;
  z0: number;
  x1: number;
  z1: number;
}

/** Occupancy values for the tile grid */
const FREE = -1;
const RESERVED = -2;

// ---------------------------------------------------------------- generator

export function generateWorld(seed: number): WorldLayout {
  const g = new Gen(seed >>> 0);
  return g.run();
}

class Gen {
  readonly rng: Rng;
  readonly tiles = new Uint8Array(TILES * TILES);
  readonly districtMap = new Uint8Array(TILES * TILES);
  readonly heights = new Float32Array(TILES * TILES);
  /** tile occupancy: FREE, RESERVED, or building id */
  readonly occ = new Int32Array(TILES * TILES).fill(FREE);
  /** 2 m prop occupancy */
  readonly propOcc = new Uint8Array(NAVS * NAVS);
  readonly bridgeMask = new Uint8Array(TILES * TILES);
  readonly arterialMask = new Uint8Array(TILES * TILES);
  readonly districts: DistrictInfo[] = [];
  readonly buildings: BuildingDef[] = [];
  readonly props: PropDef[] = [];
  readonly nodes: ControlNodeDef[] = [];
  readonly segments: Segment[] = [];
  readonly riverPts: [number, number][] = [];
  railZ = 300;
  riverPhase = 0;
  riverAmp = 34;
  spawn = { x: 0, z: 0 };
  readonly havenCenter = { x: 0, z: 0 };

  constructor(readonly seed: number) {
    this.rng = new Rng(hash2(seed, 0x51d));
  }

  run(): WorldLayout {
    this.setupDistricts();
    this.setupRiverAndRail();
    this.paintDistrictMap();
    const { xs, zs } = this.roadLines();
    this.paintRoads(xs, zs);
    this.paintWater();
    this.paintRail();
    this.extendDirtRoads(xs, zs);
    const cells = this.blocks(xs, zs);
    this.reserveNodes(cells);
    this.packBlocks(cells);
    this.farms();
    this.outskirtsNodes();
    this.paintOutskirts();
    this.heightsPass();
    this.streetProps();
    this.yardProps(cells);
    this.interiorProps();
    this.outskirtsProps();
    this.fallbackNodes();

    const layout: WorldLayout = {
      seed: this.seed,
      size: WORLD_SIZE,
      districts: this.districts,
      districtMap: this.districtMap,
      tiles: this.tiles,
      heights: this.heights,
      river: { points: this.riverPts, width: RIVER_HALF * 2 },
      rail: { points: this.railPoints(), width: RAIL_HALF * 2 },
      buildings: this.buildings,
      props: this.props,
      nodes: this.nodes,
      spawn: this.spawn,
      hash: '',
    };
    layout.hash = layoutHash(layout);
    return layout;
  }

  // ------------------------------------------------------------ districts

  setupDistricts(): void {
    const r = this.rng.fork(1);
    DISTRICT_DEFS.forEach((d, i) => {
      const jx = d.key === 'outskirts' ? 0 : snap4(r.range(-24, 24));
      const jz = d.key === 'outskirts' ? 0 : snap4(r.range(-24, 24));
      this.districts.push({ index: i, key: d.key, name: d.name, cx: d.cx + jx, cz: d.cz + jz, danger: d.danger });
    });
    const h = this.districts[HAVEN];
    this.havenCenter.x = h.cx;
    this.havenCenter.z = h.cz;
  }

  riverX(z: number): number {
    const n = fbm2(this.seed + 41, z / 160, 3.7, 3) - 0.5;
    return 820 + this.riverAmp * Math.sin(z / 230 + this.riverPhase) + n * 30;
  }

  setupRiverAndRail(): void {
    const r = this.rng.fork(2);
    this.riverPhase = r.range(0, Math.PI * 2);
    this.riverAmp = r.range(26, 40);
    for (let z = -32; z <= WORLD_SIZE + 32; z += 32) this.riverPts.push([round2(this.riverX(z)), z]);
    this.railZ = snap4(300 + r.range(-16, 16));
    // nudge the rail depot to sit on the rail line
    const rail = this.districts[DISTRICT_KEYS.indexOf('rail')];
    rail.cz = this.railZ + 24;
  }

  railPoints(): [number, number][] {
    const pts: [number, number][] = [];
    for (let x = 0; x <= WORLD_SIZE; x += 64) pts.push([x, this.railZ]);
    return pts;
  }

  inCore(x: number, z: number): boolean {
    return x >= CORE.x0 && x < CORE.x1 && z >= CORE.z0 && z < CORE.z1;
  }

  paintDistrictMap(): void {
    const town = this.districts.filter((d) => d.key !== 'outskirts');
    for (let tz = 0; tz < TILES; tz++) {
      for (let tx = 0; tx < TILES; tx++) {
        const x = tx * TILE_SIZE + 2;
        const z = tz * TILE_SIZE + 2;
        const i = tIdx(tx, tz);
        if (!this.inCore(x, z)) {
          this.districtMap[i] = OUTSKIRTS;
          continue;
        }
        const n = (fbm2(this.seed + 11, x / 140, z / 140, 3) - 0.5) * 110;
        let best = 0;
        let bd = Infinity;
        for (const d of town) {
          const def = DISTRICT_DEFS[d.index];
          // keep the river as a soft boundary: east-of-river districts prefer east tiles
          const dist = Math.hypot(x - d.cx, z - d.cz) * def.weight + n;
          const side = (x > this.riverX(z)) !== (d.cx > this.riverX(d.cz)) ? 140 : 0;
          if (dist + side < bd) {
            bd = dist + side;
            best = d.index;
          }
        }
        this.districtMap[i] = best;
      }
    }
  }

  districtAtM(x: number, z: number): number {
    const tx = clamp(Math.floor(x / TILE_SIZE), 0, TILES - 1);
    const tz = clamp(Math.floor(z / TILE_SIZE), 0, TILES - 1);
    return this.districtMap[tIdx(tx, tz)];
  }

  // ------------------------------------------------------------ roads

  roadLines(): { xs: Line[]; zs: Line[] } {
    const r = this.rng.fork(3);
    const xs: Line[] = [{ c: CORE.x0, real: false, arterial: false, bridged: false }];
    let x = CORE.x0 + snap4(r.range(48, 64));
    let n = 0;
    // river exclusion band for vertical roads
    let rMin = Infinity;
    let rMax = -Infinity;
    for (let z = CORE.z0; z <= CORE.z1; z += 8) {
      const rx = this.riverX(z);
      rMin = Math.min(rMin, rx);
      rMax = Math.max(rMax, rx);
    }
    while (x < CORE.x1 - 40) {
      const arterial = n % 3 === 1;
      const half = arterial ? 12 : 8;
      if (x + half + 8 < rMin - RIVER_HALF || x - half - 8 > rMax + RIVER_HALF) {
        xs.push({ c: x, real: true, arterial, bridged: false });
        n++;
      }
      x += snap4(r.range(64, 96));
    }
    xs.push({ c: CORE.x1, real: false, arterial: false, bridged: false });

    const zs: Line[] = [{ c: CORE.z0, real: false, arterial: false, bridged: false }];
    let z = CORE.z0 + snap4(r.range(48, 64));
    n = 0;
    while (z < CORE.z1 - 40) {
      if (Math.abs(z - this.railZ) > 32) {
        const arterial = n % 3 === 1;
        zs.push({ c: z, real: true, arterial, bridged: false });
        n++;
      }
      z += snap4(r.range(64, 96));
    }
    zs.push({ c: CORE.z1, real: false, arterial: false, bridged: false });

    // two bridged horizontal arterials (south of the rail so they are inside the town)
    const art = zs.filter((l) => l.real && l.arterial && l.c > this.railZ + 40);
    const cands = art.length >= 2 ? art : zs.filter((l) => l.real && l.c > this.railZ + 40);
    const picks: Line[] = [];
    if (cands.length > 0) picks.push(cands[Math.floor(cands.length * 0.3)]);
    if (cands.length > 1) picks.push(cands[Math.floor(cands.length * 0.8)]);
    for (const p of picks) {
      if (picks.length > 1 && p === picks[0] && picks[1] === p) continue;
      p.arterial = true;
      p.bridged = true;
    }
    return { xs, zs };
  }

  paintRect(x0: number, z0: number, x1: number, z1: number, fn: (i: number, tx: number, tz: number) => void): void {
    const tx0 = clamp(Math.floor(x0 / TILE_SIZE), 0, TILES);
    const tz0 = clamp(Math.floor(z0 / TILE_SIZE), 0, TILES);
    const tx1 = clamp(Math.ceil(x1 / TILE_SIZE), 0, TILES);
    const tz1 = clamp(Math.ceil(z1 / TILE_SIZE), 0, TILES);
    for (let tz = tz0; tz < tz1; tz++) for (let tx = tx0; tx < tx1; tx++) fn(tIdx(tx, tz), tx, tz);
  }

  paintRoads(xs: Line[], zs: Line[]): void {
    const r = this.rng.fork(4);
    for (const l of xs) {
      if (!l.real) continue;
      for (let j = 0; j < zs.length - 1; j++) {
        const a = zs[j].c;
        const b = zs[j + 1].c;
        const d = this.districtAtM(l.c, (a + b) / 2);
        const keep = l.arterial || r.chance(RULES[DISTRICT_KEYS[d]].keep);
        this.segments.push({ vertical: true, c: l.c, a, b, arterial: l.arterial, kept: keep, bridged: false });
      }
    }
    for (const l of zs) {
      if (!l.real) continue;
      for (let i = 0; i < xs.length - 1; i++) {
        const a = xs[i].c;
        const b = xs[i + 1].c;
        const d = this.districtAtM((a + b) / 2, l.c);
        const keep = l.arterial || r.chance(RULES[DISTRICT_KEYS[d]].keep);
        this.segments.push({ vertical: false, c: l.c, a, b, arterial: l.arterial, kept: keep, bridged: l.bridged });
      }
    }
    // sidewalks first, then roads
    for (const pass of [0, 1]) {
      for (const s of this.segments) {
        if (!s.kept) continue;
        const half = pass === 0 ? (s.arterial ? 12 : 8) : s.arterial ? 8 : 4;
        const t = pass === 0 ? Tile.Sidewalk : Tile.Road;
        const paint = (i: number) => {
          if (pass === 0 && this.tiles[i] === Tile.Road) return;
          this.tiles[i] = t;
          if (s.bridged) this.bridgeMask[i] = 1;
          if (s.arterial) this.arterialMask[i] = 1;
        };
        if (s.vertical) this.paintRect(s.c - half, s.a, s.c + half, s.b, paint);
        else this.paintRect(s.a, s.c - half, s.b, s.c + half, paint);
      }
    }
  }

  paintWater(): void {
    for (let tz = 0; tz < TILES; tz++) {
      const z = tz * TILE_SIZE + 2;
      const rx = this.riverX(z);
      const tx0 = clamp(Math.floor((rx - RIVER_HALF - 8) / TILE_SIZE), 0, TILES - 1);
      const tx1 = clamp(Math.ceil((rx + RIVER_HALF + 8) / TILE_SIZE), 0, TILES - 1);
      for (let tx = tx0; tx <= tx1; tx++) {
        const x = tx * TILE_SIZE + 2;
        const i = tIdx(tx, tz);
        const d = Math.abs(x - rx);
        if (d < RIVER_HALF) {
          this.tiles[i] = this.bridgeMask[i] ? Tile.Bridge : Tile.Water;
        } else if (d < RIVER_HALF + 6 && this.tiles[i] === Tile.Grass) {
          this.tiles[i] = Tile.Dirt; // muddy bank
        }
      }
    }
  }

  paintRail(): void {
    for (let tx = 0; tx < TILES; tx++) {
      for (let tz = 0; tz < TILES; tz++) {
        const z = tz * TILE_SIZE + 2;
        const dz = Math.abs(z - this.railZ);
        const i = tIdx(tx, tz);
        if (dz < RAIL_HALF) {
          if (this.tiles[i] === Tile.Road && this.arterialMask[i]) continue; // level crossing
          this.tiles[i] = Tile.Rail;
        } else if (dz < RAIL_HALF + 4) {
          const t = this.tiles[i];
          if (t === Tile.Grass || t === Tile.Lot || t === Tile.Plaza) this.tiles[i] = Tile.Dirt;
        }
      }
    }
  }

  /** Arterials leave town as dirt tracks to the map edge. */
  extendDirtRoads(xs: Line[], zs: Line[]): void {
    const paintDirt = (i: number) => {
      const t = this.tiles[i];
      if (t === Tile.Water || t === Tile.Rail || t === Tile.Road) return;
      this.tiles[i] = Tile.Dirt;
      this.arterialMask[i] = 2;
    };
    const vx = xs.filter((l) => l.real && l.arterial);
    const hz = zs.filter((l) => l.real && l.arterial);
    for (const l of vx) {
      this.paintRect(l.c - 4, 0, l.c + 4, CORE.z0, paintDirt);
      this.paintRect(l.c - 4, CORE.z1, l.c + 4, WORLD_SIZE, paintDirt);
      this.dirtRoads.push({ vertical: true, c: l.c, a: 0, b: CORE.z0 });
      this.dirtRoads.push({ vertical: true, c: l.c, a: CORE.z1, b: WORLD_SIZE });
    }
    for (const l of hz) {
      this.paintRect(0, l.c - 4, CORE.x0, l.c + 4, paintDirt);
      this.paintRect(CORE.x1, l.c - 4, WORLD_SIZE, l.c + 4, paintDirt);
      this.dirtRoads.push({ vertical: false, c: l.c, a: 0, b: CORE.x0 });
      this.dirtRoads.push({ vertical: false, c: l.c, a: CORE.x1, b: WORLD_SIZE });
    }
  }

  readonly dirtRoads: { vertical: boolean; c: number; a: number; b: number }[] = [];

  // ------------------------------------------------------------ blocks

  segKept(vertical: boolean, c: number, a: number): Segment | undefined {
    for (const s of this.segments) if (s.vertical === vertical && s.c === c && s.a === a && s.kept) return s;
    return undefined;
  }

  blocks(xs: Line[], zs: Line[]): Block[] {
    const out: Block[] = [];
    for (let i = 0; i < xs.length - 1; i++) {
      for (let j = 0; j < zs.length - 1; j++) {
        const L = xs[i];
        const R = xs[i + 1];
        const T = zs[j];
        const B = zs[j + 1];
        const sl = L.real ? this.segKept(true, L.c, T.c) : undefined;
        const sr = R.real ? this.segKept(true, R.c, T.c) : undefined;
        const st = T.real ? this.segKept(false, T.c, L.c) : undefined;
        const sb = B.real ? this.segKept(false, B.c, L.c) : undefined;
        const half = (s: Segment | undefined) => (s ? (s.arterial ? 12 : 8) : 0);
        const rect: Rect = { x0: L.c + half(sl), x1: R.c - half(sr), z0: T.c + half(st), z1: B.c - half(sb) };
        if (rect.x1 - rect.x0 < 12 || rect.z1 - rect.z0 < 12) continue;
        const cx = (rect.x0 + rect.x1) / 2;
        const cz = (rect.z0 + rect.z1) / 2;
        const district = this.districtAtM(cx, cz);
        const edge = !L.real || !R.real || !T.real || !B.real;
        out.push({ rect, district, edge, kept: [!!sb, !!st, !!sr, !!sl], park: false, haven: false, nodes: 0 });
      }
    }
    return out;
  }

  tileFreeForBuilding(i: number): boolean {
    if (this.occ[i] !== FREE) return false;
    const t = this.tiles[i];
    return t !== Tile.Road && t !== Tile.Sidewalk && t !== Tile.Water && t !== Tile.Rail && t !== Tile.Bridge;
  }

  rectFree(x0: number, z0: number, x1: number, z1: number): boolean {
    if (x0 < 4 || z0 < 4 || x1 > WORLD_SIZE - 4 || z1 > WORLD_SIZE - 4) return false;
    const tx0 = x0 / TILE_SIZE;
    const tz0 = z0 / TILE_SIZE;
    const tx1 = x1 / TILE_SIZE;
    const tz1 = z1 / TILE_SIZE;
    for (let tz = tz0; tz < tz1; tz++) for (let tx = tx0; tx < tx1; tx++) if (!this.tileFreeForBuilding(tIdx(tx, tz))) return false;
    return true;
  }

  reserveRect(x0: number, z0: number, x1: number, z1: number, tile: Tile | -1): void {
    this.paintRect(x0, z0, x1, z1, (i) => {
      const t = this.tiles[i];
      if (t === Tile.Road || t === Tile.Sidewalk || t === Tile.Water || t === Tile.Rail || t === Tile.Bridge) return;
      if (this.occ[i] === FREE) this.occ[i] = RESERVED;
      if (tile !== -1) this.tiles[i] = tile;
    });
  }

  reserveNodes(cells: Block[]): void {
    const r = this.rng.fork(5);
    const counts: Partial<Record<DistrictKey, number>> = {
      downtown: 3, industrial: r.int(2, 3), residential: r.int(1, 2), market: r.int(1, 2),
      hospital: r.int(1, 2), waterworks: r.int(1, 2), rail: r.int(1, 2),
    };
    for (const d of this.districts) {
      const want = counts[d.key] ?? 0;
      if (!want) continue;
      const cands = cells.filter((c) => {
        if (c.district !== d.index || c.edge) return false;
        const w = c.rect.x1 - c.rect.x0;
        const h = c.rect.z1 - c.rect.z0;
        if (w < 36 || h < 36) return false;
        const { x, z } = rectCenter4(c.rect);
        return this.rectFree(x - 8, z - 8, x + 8, z + 8);
      });
      // shuffle deterministically
      for (let i = cands.length - 1; i > 0; i--) {
        const j = r.int(0, i);
        [cands[i], cands[j]] = [cands[j], cands[i]];
      }
      let placed = 0;
      for (const minDist of [140, 80, 0]) {
        for (const c of cands) {
          if (placed >= want) break;
          if (c.nodes) continue;
          const { x, z } = rectCenter4(c.rect);
          if (this.nodes.some((n) => n.district === d.index && Math.hypot(n.x - x, n.z - z) < minDist)) continue;
          this.addNodePlaza(c, x, z, d.index, placed++);
        }
      }
    }
  }

  addNodePlaza(c: Block, x: number, z: number, district: number, order: number): void {
    c.nodes++;
    this.reserveRect(x - 8, z - 8, x + 8, z + 8, Tile.Plaza);
    // access corridor toward a side that has a road (prefer south)
    const [sb, st, sr, sl] = c.kept;
    if (sb || (!st && !sr && !sl)) this.reserveRect(x - 4, z + 8, x + 4, c.rect.z1, Tile.Plaza);
    else if (st) this.reserveRect(x - 4, c.rect.z0, x + 4, z - 8, Tile.Plaza);
    else if (sr) this.reserveRect(x + 8, z - 4, c.rect.x1, z + 4, Tile.Plaza);
    else this.reserveRect(c.rect.x0, z - 4, x - 8, z + 4, Tile.Plaza);
    this.nodes.push({ id: this.nodes.length, district, x, z, order });
  }

  packBlocks(cells: Block[]): void {
    const r = this.rng.fork(6);
    // Haven: the block closest to the haven center becomes the starting shelter yard
    let havenBlock: Block | null = null;
    let hb = Infinity;
    for (const c of cells) {
      if (c.district !== HAVEN) continue;
      const { x, z } = rectCenter4(c.rect);
      const d = Math.hypot(x - this.havenCenter.x, z - this.havenCenter.z);
      if (d < hb && c.rect.x1 - c.rect.x0 >= 36 && c.rect.z1 - c.rect.z0 >= 36) {
        hb = d;
        havenBlock = c;
      }
    }
    if (!havenBlock) havenBlock = cells.find((c) => c.district === HAVEN) ?? cells[0];
    havenBlock.haven = true;

    for (const c of cells) {
      const key = DISTRICT_KEYS[c.district];
      const rule = RULES[key];
      // fill ground
      // edge blocks keep their grass so the town frays into the outskirts instead of ending in a hard slab
      if (!c.edge || rule.fill === Tile.Plaza) {
        this.paintRect(c.rect.x0, c.rect.z0, c.rect.x1, c.rect.z1, (i) => {
          if (this.tiles[i] === Tile.Grass) this.tiles[i] = c.edge ? Tile.Lot : rule.fill;
        });
      }
      if (c.haven) {
        this.packHaven(c, r);
        continue;
      }
      if (!c.nodes && !c.edge && r.chance(rule.park)) {
        c.park = true;
        const parkTile = key === 'downtown' || key === 'market' ? Tile.Plaza : Tile.Grass;
        this.paintRect(c.rect.x0, c.rect.z0, c.rect.x1, c.rect.z1, (i) => {
          const t = this.tiles[i];
          if (t === Tile.Grass || t === Tile.Plaza || t === Tile.Lot) this.tiles[i] = parkTile;
        });
        continue;
      }
      this.packRect(c.rect, rule, c.district, r, c.edge ? 0.4 : 0);
    }
  }

  packHaven(c: Block, r: Rng): void {
    const { x, z } = rectCenter4(c.rect);
    this.spawn = { x: x + 2, z: z + 6 };
    // open yard around spawn
    this.reserveRect(x - 12, z - 8, x + 12, z + 16, Tile.Lot);
    // two shelters on the north side, facing the yard
    const rule = RULES.haven;
    let cursor = c.rect.x0 + 4;
    let placed = 0;
    while (placed < 3 && cursor + 12 <= c.rect.x1) {
      const w = placed === 1 ? 16 : 12;
      const d = 12;
      const z0 = c.rect.z0 + 4;
      if (this.rectFree(cursor, z0, cursor + w, z0 + d)) {
        this.addBuilding(cursor, z0, cursor + w, z0 + d, 0, w, d, 'shelter', 1, 'flat', c.district, r, true);
        placed++;
        cursor += w + 8;
      } else cursor += 4;
    }
    void rule;
    this.havenYard = c.rect;
  }

  havenYard: Rect | null = null;

  packRect(rect: Rect, rule: PackRule, district: number, r: Rng, extraSkip: number): void {
    const H = rect.z1 - rect.z0;
    const W = rect.x1 - rect.x0;
    const pick = (range: [number, number]) => snap4(r.range(range[0], range[1]));
    const maxDepthZ = H >= rule.depth[0] * 2 + 4 ? Math.floor((H - 4) / 2 / 4) * 4 : H - rule.setback;
    const maxDepthX = W >= rule.depth[0] * 2 + 4 ? Math.floor((W - 4) / 2 / 4) * 4 : W - rule.setback;

    const side = (rot: 0 | 1 | 2 | 3) => {
      const along = rot === 0 || rot === 2;
      const start = along ? rect.x0 : rect.z0;
      const end = along ? rect.x1 : rect.z1;
      let cursor = start;
      while (cursor + rule.width[0] <= end) {
        let w = pick(rule.width);
        if (cursor + w > end) w = Math.floor((end - cursor) / 4) * 4;
        if (w < rule.width[0]) break;
        const maxD = along ? maxDepthZ : maxDepthX;
        let d = Math.min(pick(rule.depth), maxD);
        if (d < 8) break;
        if (r.chance(rule.skip + extraSkip)) {
          cursor += w + pick(rule.gap);
          continue;
        }
        let x0: number;
        let z0: number;
        let x1: number;
        let z1: number;
        if (rot === 0) {
          z1 = rect.z1 - rule.setback; z0 = z1 - d; x0 = cursor; x1 = cursor + w;
        } else if (rot === 2) {
          z0 = rect.z0 + rule.setback; z1 = z0 + d; x0 = cursor; x1 = cursor + w;
        } else if (rot === 1) {
          x1 = rect.x1 - rule.setback; x0 = x1 - d; z0 = cursor; z1 = cursor + w;
        } else {
          x0 = rect.x0 + rule.setback; x1 = x0 + d; z0 = cursor; z1 = cursor + w;
        }
        // shrink depth until it fits (handles corners & reserved plazas)
        while (!this.rectFree(x0, z0, x1, z1) && d > 8) {
          d -= 4;
          if (rot === 0) z0 += 4;
          else if (rot === 2) z1 -= 4;
          else if (rot === 1) x0 += 4;
          else x1 -= 4;
        }
        if (!this.rectFree(x0, z0, x1, z1)) {
          cursor += 4;
          continue;
        }
        const lot = weighted(r, rule.lots);
        this.addBuildingByLot(x0, z0, x1, z1, rot, w, d, lot, rule, district, r);
        cursor += w + pick(rule.gap);
      }
    };
    side(0);
    side(2);
    side(1);
    side(3);
  }

  addBuildingByLot(
    x0: number, z0: number, x1: number, z1: number, rot: 0 | 1 | 2 | 3, w: number, d: number,
    lot: LotType, rule: PackRule, district: number, r: Rng,
  ): void {
    let floors = r.int(rule.floors[0], rule.floors[1]);
    let roof: RoofType = 'flat';
    switch (lot) {
      case 'house':
        roof = r.chance(0.8) ? 'gable' : 'flat';
        floors = Math.min(floors, 2);
        break;
      case 'apartment':
        floors = Math.max(floors, DISTRICT_KEYS[district] === 'downtown' ? floors : r.int(3, 4));
        break;
      case 'warehouse':
      case 'factory':
        roof = r.chance(0.5) ? 'sawtooth' : 'flat';
        floors = Math.min(floors, 2);
        break;
      case 'depot':
        roof = r.chance(0.5) ? 'gable' : 'sawtooth';
        break;
      case 'barn':
        roof = 'gable';
        break;
      default:
        break;
    }
    this.addBuilding(x0, z0, x1, z1, rot, w, d, lot, floors, roof, district, r, null);
  }

  addBuilding(
    x0: number, z0: number, x1: number, z1: number, rot: 0 | 1 | 2 | 3, w: number, d: number,
    lot: LotType, floors: number, roof: RoofType, district: number, r: Rng, forceEnterable: boolean | null,
  ): BuildingDef {
    const id = this.buildings.length;
    const x = (x0 + x1) / 2;
    const z = (z0 + z1) / 2;
    const dist = Math.hypot(x - this.havenCenter.x, z - this.havenCenter.z);
    const decay = round2(clamp(smoothstep(80, 900, dist) * 0.82 + r.range(0, 0.18), 0, 1));
    const eligible = floors <= 2 && Math.min(w, d) >= 8 && Math.max(w, d) <= 16;
    const enterable = forceEnterable ?? (eligible && r.chance(0.72));
    const b: BuildingDef = {
      id, district, lot, x, z, w, d, rot, floors: clamp(floors, 1, 6), roof, enterable,
      variant: r.int(0, 0x7fffffff), decay: lot === 'shelter' ? 0.05 : decay,
    };
    this.buildings.push(b);
    this.paintRect(x0, z0, x1, z1, (i) => {
      this.occ[i] = id;
    });
    return b;
  }

  // ------------------------------------------------------------ outskirts

  farms(): void {
    const r = this.rng.fork(7);
    const outskirts = OUTSKIRTS;
    for (const road of this.dirtRoads) {
      const len = road.b - road.a;
      for (let t = 40; t < len - 40; t += snap4(r.range(110, 170))) {
        if (!r.chance(0.7)) continue;
        const along = road.a + snap4(t);
        const sideSign = r.chance(0.5) ? 1 : -1;
        // farmstead: barn + house set back from the track, field behind
        const off = 16;
        if (road.vertical) {
          const bx0 = sideSign > 0 ? road.c + off : road.c - off - 16;
          const ok = this.tryFarm(bx0, along, true, sideSign, outskirts, r);
          void ok;
        } else {
          const bz0 = sideSign > 0 ? road.c + off : road.c - off - 16;
          this.tryFarm(along, bz0, false, sideSign, outskirts, r);
        }
      }
    }
  }

  tryFarm(a: number, b: number, vertical: boolean, sign: number, district: number, r: Rng): boolean {
    // a,b is the corner of the barn footprint (x0,z0)
    const bw = 16;
    const bd = snap4(r.range(16, 24));
    const x0 = snap4(a);
    const z0 = snap4(b);
    const [x1, z1] = vertical ? [x0 + bw, z0 + bd] : [x0 + bd, z0 + bw];
    if (!this.rectFree(x0, z0, x1, z1) || !this.outside(x0 - 8, z0 - 8, x1 + 8, z1 + 8)) return false;
    // barn faces the track
    const rot: 0 | 1 | 2 | 3 = vertical ? (sign > 0 ? 3 : 1) : sign > 0 ? 2 : 0;
    const [w, d] = vertical ? [bd, bw] : [bd, bw];
    this.addBuilding(x0, z0, x1, z1, rot, w, d, 'barn', r.int(1, 2), 'gable', district, r, null);
    // farmhouse next to it
    const hx0 = vertical ? x0 : x1 + 8;
    const hz0 = vertical ? z1 + 8 : z0;
    if (this.rectFree(hx0, hz0, hx0 + 12, hz0 + 12) && this.outside(hx0, hz0, hx0 + 12, hz0 + 12)) {
      this.addBuilding(hx0, hz0, hx0 + 12, hz0 + 12, rot, 12, 12, 'house', r.int(1, 2), 'gable', district, r, null);
    }
    // field behind
    const fx0 = vertical ? (sign > 0 ? x1 + 8 : x0 - 8 - 48) : x0 - 8;
    const fz0 = vertical ? z0 - 8 : sign > 0 ? z1 + 8 : z0 - 8 - 48;
    const fw = vertical ? 48 : snap4(r.range(48, 72));
    const fh = vertical ? snap4(r.range(48, 72)) : 48;
    this.paintRect(fx0, fz0, fx0 + fw, fz0 + fh, (i, tx, tz) => {
      const x = tx * TILE_SIZE + 2;
      const z = tz * TILE_SIZE + 2;
      if (this.inCore(x, z) || this.occ[i] !== FREE) return;
      if (this.tiles[i] === Tile.Grass) this.tiles[i] = Tile.Field;
    });
    return true;
  }

  outside(x0: number, z0: number, x1: number, z1: number): boolean {
    return x1 <= CORE.x0 || x0 >= CORE.x1 || z1 <= CORE.z0 || z0 >= CORE.z1;
  }

  outskirtsNodes(): void {
    const r = this.rng.fork(8);
    const want = r.int(2, 3);
    let order = 0;
    for (let attempt = 0; attempt < 400 && order < want; attempt++) {
      const x = snap4(r.range(40, WORLD_SIZE - 40));
      const z = snap4(r.range(40, WORLD_SIZE - 40));
      if (!this.outside(x - 40, z - 40, x + 40, z + 40)) continue;
      if (!this.rectFree(x - 8, z - 8, x + 8, z + 8)) continue;
      if (this.nodes.some((n) => Math.hypot(n.x - x, n.z - z) < 300)) continue;
      this.reserveRect(x - 8, z - 8, x + 8, z + 8, Tile.Dirt);
      this.nodes.push({ id: this.nodes.length, district: OUTSKIRTS, x, z, order: order++ });
    }
  }

  paintOutskirts(): void {
    for (let tz = 0; tz < TILES; tz++) {
      for (let tx = 0; tx < TILES; tx++) {
        const i = tIdx(tx, tz);
        if (this.tiles[i] !== Tile.Grass || this.districtMap[i] !== OUTSKIRTS || this.occ[i] !== FREE) continue;
        const x = tx * TILE_SIZE + 2;
        const z = tz * TILE_SIZE + 2;
        const n = fbm2(this.seed + 23, x / 170, z / 170, 4);
        // forests thicken toward the map edge
        const edge = Math.min(x, z, WORLD_SIZE - x, WORLD_SIZE - z);
        const bias = (1 - smoothstep(0, 200, edge)) * 0.12;
        if (n + bias > 0.58) this.tiles[i] = Tile.Forest;
      }
    }
  }

  heightsPass(): void {
    // multi-source BFS distance (in tiles) from tiles that must stay flat
    const dist = new Uint8Array(TILES * TILES).fill(255);
    const queue = new Int32Array(TILES * TILES);
    let qh = 0;
    let qt = 0;
    for (let i = 0; i < dist.length; i++) {
      const tx = i % TILES;
      const tz = (i / TILES) | 0;
      const x = tx * TILE_SIZE + 2;
      const z = tz * TILE_SIZE + 2;
      const t = this.tiles[i];
      const flat =
        this.inCore(x, z) || this.occ[i] !== FREE || t === Tile.Dirt || t === Tile.Water || t === Tile.Rail ||
        t === Tile.Bridge || t === Tile.Road;
      if (flat) {
        dist[i] = 0;
        queue[qt++] = i;
      }
    }
    while (qh < qt) {
      const i = queue[qh++];
      const d = dist[i];
      if (d >= 12) continue;
      const tx = i % TILES;
      const tz = (i / TILES) | 0;
      const nb = [tx > 0 ? i - 1 : -1, tx < TILES - 1 ? i + 1 : -1, tz > 0 ? i - TILES : -1, tz < TILES - 1 ? i + TILES : -1];
      for (const j of nb) {
        if (j >= 0 && dist[j] > d + 1) {
          dist[j] = d + 1;
          queue[qt++] = j;
        }
      }
    }
    for (let i = 0; i < dist.length; i++) {
      if (dist[i] === 0) continue;
      const tx = i % TILES;
      const tz = (i / TILES) | 0;
      const x = tx * TILE_SIZE + 2;
      const z = tz * TILE_SIZE + 2;
      const n = fbm2(this.seed + 31, x / 210, z / 210, 3);
      const h = clamp((n - 0.3) * 9, 0, 4);
      const f = smoothstep(0, 6, dist[i]);
      this.heights[i] = Math.round(h * f * 100) / 100;
    }
  }

  // ------------------------------------------------------------ props

  /** Try to place a prop. mode 'out' = outdoor on allowed tiles, else a building id for interiors. */
  tryProp(
    kind: PropKind, x: number, z: number, rotY: number, scale: number, allowed: (t: number) => boolean,
    building = -1, y = 0,
  ): boolean {
    const [hx0, hz0] = PROP_HALF[kind];
    const q = Math.round(rotY / (Math.PI / 2)) & 1;
    const hx = (q ? hz0 : hx0) * scale;
    const hz = (q ? hx0 : hz0) * scale;
    const x0 = x - hx;
    const x1 = x + hx;
    const z0 = z - hz;
    const z1 = z + hz;
    if (x0 < 2 || z0 < 2 || x1 > WORLD_SIZE - 2 || z1 > WORLD_SIZE - 2) return false;
    // tiles
    const tx0 = Math.floor(x0 / TILE_SIZE);
    const tx1 = Math.floor(x1 / TILE_SIZE);
    const tz0 = Math.floor(z0 / TILE_SIZE);
    const tz1 = Math.floor(z1 / TILE_SIZE);
    for (let tz = tz0; tz <= tz1; tz++) {
      for (let tx = tx0; tx <= tx1; tx++) {
        const i = tIdx(tx, tz);
        if (building >= 0) {
          if (this.occ[i] !== building) return false;
        } else {
          if (this.occ[i] !== FREE) return false;
          if (!allowed(this.tiles[i])) return false;
        }
      }
    }
    // prop-prop overlap on the 2 m grid
    const nx0 = Math.floor(x0 / NAV_SIZE);
    const nx1 = Math.floor(x1 / NAV_SIZE);
    const nz0 = Math.floor(z0 / NAV_SIZE);
    const nz1 = Math.floor(z1 / NAV_SIZE);
    for (let nz = nz0; nz <= nz1; nz++) for (let nx = nx0; nx <= nx1; nx++) if (this.propOcc[nz * NAVS + nx]) return false;
    for (let nz = nz0; nz <= nz1; nz++) for (let nx = nx0; nx <= nx1; nx++) this.propOcc[nz * NAVS + nx] = 1;
    this.props.push({
      id: this.props.length,
      kind,
      x: round2(x),
      y,
      z: round2(z),
      rotY: round2(rotY),
      scale: round2(scale),
      district: this.districtAtM(x, z),
      building,
    });
    return true;
  }

  streetProps(): void {
    const r = this.rng.fork(9);
    const onRoad = (t: number) => t === Tile.Road || t === Tile.Bridge;
    const onWalk = (t: number) => t === Tile.Sidewalk;
    for (const s of this.segments) {
      if (!s.kept) continue;
      const rh = s.arterial ? 8 : 4;
      const len = s.b - s.a;
      const danger = this.districts[this.districtAtM(s.vertical ? s.c : (s.a + s.b) / 2, s.vertical ? (s.a + s.b) / 2 : s.c)].danger;
      // abandoned vehicles in lanes
      const lanes = s.arterial ? [-5.5, -2, 2, 5.5] : [-2, 2];
      for (const lane of lanes) {
        for (let t = 10; t < len - 10; t += r.range(9, 15)) {
          if (!r.chance(0.11 + danger * 0.02)) continue;
          const along = s.a + t;
          const kind: PropKind = s.arterial && r.chance(0.06) ? 'bus' : r.chance(0.22) ? 'van' : 'car';
          const askew = r.range(-0.12, 0.12) + (r.chance(0.15 + danger * 0.05) ? r.range(-0.6, 0.6) : 0);
          const dir = lane < 0 ? Math.PI : 0;
          const rot = (s.vertical ? dir : dir + Math.PI / 2) + askew;
          const [x, z] = s.vertical ? [s.c + lane, along] : [along, s.c + lane];
          if (this.tryProp(kind, x, z, rot, 1, onRoad)) t += 6;
        }
      }
      // road rubble in dangerous districts
      if (danger >= 2) {
        for (let t = 8; t < len - 8; t += 16) {
          if (!r.chance(0.04 * danger)) continue;
          const off = r.range(-rh + 1, rh - 1);
          const [x, z] = s.vertical ? [s.c + off, s.a + t] : [s.a + t, s.c + off];
          this.tryProp(r.chance(0.5) ? 'rubble' : 'debris', x, z, r.range(0, 6.28), r.range(0.8, 1.2), onRoad);
        }
      }
      // sidewalks: lights on one side, furniture on both
      const sw = rh + 2;
      for (let t = 6; t < len - 6; t += 24) {
        const along = s.a + t;
        const [x, z] = s.vertical ? [s.c + sw, along] : [along, s.c + sw];
        this.tryProp('streetlight', x, z, s.vertical ? Math.PI / 2 : 0, 1, onWalk);
      }
      for (const sgn of [-1, 1]) {
        for (let t = 4; t < len - 4; t += r.range(6, 12)) {
          if (!r.chance(0.18)) continue;
          const along = s.a + t;
          const kind = weighted<PropKind>(r, [['trashbag', 4], ['hydrant', 1], ['mailbox', 1], ['sign', 2], ['bench', 1], ['tree', 1], ['tire', 1], ['barrel', 1]]);
          const off = sgn * (rh + 2 + r.range(-0.8, 0.8));
          const [x, z] = s.vertical ? [s.c + off, along] : [along, s.c + off];
          const rot = kind === 'bench' ? (s.vertical ? (sgn > 0 ? -Math.PI / 2 : Math.PI / 2) : sgn > 0 ? Math.PI : 0) : r.range(0, 6.28);
          this.tryProp(kind, x, z, rot, kind === 'tree' ? r.range(0.8, 1.0) : 1, onWalk);
        }
      }
    }
  }

  yardProps(cells: Block[]): void {
    const r = this.rng.fork(10);
    const yardTile = (t: number) => t === Tile.Grass || t === Tile.Lot || t === Tile.Plaza || t === Tile.Dirt;
    for (const c of cells) {
      const key = DISTRICT_KEYS[c.district];
      const rule = RULES[key];
      const area = (c.rect.x1 - c.rect.x0) * (c.rect.z1 - c.rect.z0);
      let kinds = rule.yardKinds;
      let density = rule.yard;
      if (c.park) {
        kinds = key === 'downtown' || key === 'market' ? PLAZA_KINDS : PARK_KINDS;
        density = 1.6;
      }
      if (c.haven) {
        kinds = RULES.haven.yardKinds;
        density = 0.35;
      }
      const attempts = Math.round((area / 100) * density * 1.4);
      for (let a = 0; a < attempts; a++) {
        const kind = weighted(r, kinds);
        const x = r.range(c.rect.x0 + 1, c.rect.x1 - 1);
        const z = r.range(c.rect.z0 + 1, c.rect.z1 - 1);
        const axis = kind === 'container' || kind === 'pipe' || kind === 'fence' || kind === 'bench';
        const rot = axis ? r.int(0, 3) * (Math.PI / 2) + r.range(-0.05, 0.05) : r.range(0, Math.PI * 2);
        const scale = kind === 'tree' || kind === 'pine' || kind === 'rock' || kind === 'bush' ? r.range(0.8, 1.25) : 1;
        this.tryProp(kind, x, z, rot, scale, yardTile);
      }
    }
  }

  interiorProps(): void {
    const r = this.rng.fork(11);
    const sets: Partial<Record<LotType, [PropKind, number][]>> = {
      house: [['bed', 2], ['sofa', 2], ['table', 2], ['chair', 3], ['fridge', 1], ['stove', 1], ['cabinet', 2], ['shelf', 2]],
      apartment: [['bed', 2], ['sofa', 2], ['table', 2], ['chair', 3], ['fridge', 1], ['stove', 1], ['cabinet', 2]],
      shelter: [['bed', 3], ['crate', 3], ['table', 1], ['chair', 2], ['shelf', 2], ['barrel', 1]],
      shop: [['shelf', 6], ['cabinet', 2], ['table', 1], ['crate', 2], ['terminal', 1]],
      office: [['table', 3], ['chair', 4], ['terminal', 2], ['cabinet', 3], ['shelf', 1]],
      clinic: [['bed', 3], ['cabinet', 3], ['locker', 2], ['terminal', 1], ['table', 1]],
      warehouse: [['crate', 4], ['shelf', 3], ['pallet', 3], ['barrel', 2]],
      factory: [['crate', 3], ['barrel', 3], ['pallet', 2], ['locker', 2], ['terminal', 1]],
      pumphouse: [['pipe', 3], ['barrel', 2], ['terminal', 1], ['locker', 1]],
      depot: [['crate', 4], ['locker', 2], ['shelf', 2], ['table', 1]],
      barn: [['haybale', 4], ['crate', 2], ['barrel', 1], ['pallet', 1]],
    };
    for (const b of this.buildings) {
      if (!b.enterable) continue;
      const set = sets[b.lot] ?? sets.house!;
      const wx = b.rot & 1 ? b.d : b.w;
      const wz = b.rot & 1 ? b.w : b.d;
      const n = Math.max(3, Math.round((b.w * b.d) / 14));
      const inset = 1.0;
      // the door is in the middle of the local +z wall; keep a 3 m clear aisle in front of it
      const [fx, fz] = [[0, 1], [1, 0], [0, -1], [-1, 0]][b.rot];
      for (let a = 0; a < n * 3 && a < 60; a++) {
        const kind = weighted(r, set);
        // hug walls: pick a wall and slide along it
        const wall = r.int(0, 3);
        let x: number;
        let z: number;
        let rot: number;
        const [hx, hz] = PROP_HALF[kind];
        const depth = Math.max(hx, hz) + inset;
        if (wall === 0 || wall === 1) {
          x = b.x + r.range(-wx / 2 + depth, wx / 2 - depth);
          z = wall === 0 ? b.z - wz / 2 + hz + inset : b.z + wz / 2 - hz - inset;
          rot = wall === 0 ? 0 : Math.PI;
        } else {
          z = b.z + r.range(-wz / 2 + depth, wz / 2 - depth);
          x = wall === 2 ? b.x - wx / 2 + hz + inset : b.x + wx / 2 - hz - inset;
          rot = wall === 2 ? Math.PI / 2 : -Math.PI / 2;
        }
        // keep the doorway clear
        const dx = x - (b.x + fx * (wx / 2));
        const dz = z - (b.z + fz * (wz / 2));
        if (Math.abs(fx ? dz : dx) < 2.5 && Math.abs(fx ? dx : dz) < 4) continue;
        // keep the room center clear for walking
        if (Math.abs(x - b.x) < wx / 2 - 3 && Math.abs(z - b.z) < wz / 2 - 3) continue;
        this.tryProp(kind, x, z, rot, 1, () => true, b.id, 0);
      }
    }
  }

  outskirtsProps(): void {
    const r = this.rng.fork(12);
    const grassy = (t: number) => t === Tile.Grass || t === Tile.Forest || t === Tile.Field || t === Tile.Dirt;
    for (let tz = 0; tz < TILES; tz++) {
      for (let tx = 0; tx < TILES; tx++) {
        const i = tIdx(tx, tz);
        if (this.districtMap[i] !== OUTSKIRTS || this.occ[i] !== FREE) continue;
        const t = this.tiles[i];
        const x = tx * TILE_SIZE + r.range(0.5, 3.5);
        const z = tz * TILE_SIZE + r.range(0.5, 3.5);
        let kind: PropKind | null = null;
        if (t === Tile.Forest) {
          if (r.chance(0.56)) kind = weighted<PropKind>(r, [['pine', 8], ['tree', 6], ['rock', 2], ['stump', 2], ['bush', 2]]);
        } else if (t === Tile.Field) {
          if (r.chance(0.025)) kind = 'haybale';
        } else if (t === Tile.Grass) {
          if (r.chance(0.06)) kind = weighted<PropKind>(r, [['tree', 4], ['bush', 4], ['rock', 3], ['pine', 2], ['stump', 1]]);
        }
        if (!kind) continue;
        const scale = kind === 'haybale' ? 1 : r.range(0.75, 1.35);
        this.tryProp(kind, x, z, r.range(0, Math.PI * 2), scale, grassy, -1, 0);
      }
    }
  }

  /** Any town district that ended up without a node gets one on its most open ground. */
  fallbackNodes(): void {
    for (const d of this.districts) {
      if (d.key === 'haven') continue;
      if (this.nodes.some((n) => n.district === d.index)) continue;
      let best: { x: number; z: number; s: number } | null = null;
      for (let tz = 2; tz < TILES - 2; tz++) {
        for (let tx = 2; tx < TILES - 2; tx++) {
          if (this.districtMap[tIdx(tx, tz)] !== d.index) continue;
          let ok = true;
          for (let dz = -1; dz <= 1 && ok; dz++)
            for (let dx = -1; dx <= 1 && ok; dx++) {
              const j = tIdx(tx + dx, tz + dz);
              const t = this.tiles[j];
              if (this.occ[j] >= 0 || t === Tile.Water || t === Tile.Rail) ok = false;
            }
          if (!ok) continue;
          const x = tx * TILE_SIZE + 2;
          const z = tz * TILE_SIZE + 2;
          const s = -Math.hypot(x - d.cx, z - d.cz);
          if (!best || s > best.s) best = { x, z, s };
        }
      }
      if (best) {
        this.nodes.push({ id: this.nodes.length, district: d.index, x: best.x, z: best.z, order: 0 });
        // clear props around it
        for (let i = this.props.length - 1; i >= 0; i--) {
          const p = this.props[i];
          if (p.building < 0 && Math.hypot(p.x - best.x, p.z - best.z) < 6) this.props.splice(i, 1);
        }
        this.props.forEach((p, i) => (p.id = i));
      }
    }
  }
}

interface Block {
  rect: Rect;
  district: number;
  edge: boolean;
  /** kept road segments on [south(+z), north(-z), east(+x), west(-x)] */
  kept: [boolean, boolean, boolean, boolean];
  park: boolean;
  haven: boolean;
  nodes: number;
}

function rectCenter4(r: Rect): { x: number; z: number } {
  return { x: snap4((r.x0 + r.x1) / 2), z: snap4((r.z0 + r.z1) / 2) };
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}
