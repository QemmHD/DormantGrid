// Read-only queries over a WorldLayout.

import {
  CELLS,
  CELL_SIZE,
  DISTRICT_KEYS,
  Hasher,
  TILES,
  TILE_SIZE,
  Tile,
  cellKey,
  type BuildingDef,
  type CellIndex,
  type DistrictInfo,
  type WorldLayout,
} from '@dg/shared';

/** Stable hex hash of every generated field (excluding `hash` itself). */
export function layoutHash(l: WorldLayout): string {
  const h = new Hasher();
  h.num(l.seed).num(l.size);
  for (const d of l.districts) h.str(d.key).str(d.name).num(d.cx).num(d.cz).num(d.danger);
  h.bytes(l.districtMap).bytes(l.tiles);
  // heights are stored with 1 cm precision; hash as integer centimeters
  const hq = new Uint8Array(l.heights.length);
  for (let i = 0; i < l.heights.length; i++) hq[i] = Math.round(l.heights[i] * 50) & 0xff;
  h.bytes(hq);
  for (const p of l.river.points) h.num(p[0]).num(p[1]);
  for (const p of l.rail.points) h.num(p[0]).num(p[1]);
  for (const b of l.buildings) {
    h.num(b.id).num(b.district).str(b.lot).num(b.x).num(b.z).num(b.w).num(b.d).num(b.rot).num(b.floors);
    h.str(b.roof).num(b.enterable ? 1 : 0).num(b.variant).num(b.decay);
  }
  for (const p of l.props) h.num(p.id).str(p.kind).num(p.x).num(p.y).num(p.z).num(p.rotY).num(p.scale).num(p.building);
  for (const n of l.nodes) h.num(n.id).num(n.district).num(n.x).num(n.z).num(n.order);
  h.num(l.spawn.x).num(l.spawn.z);
  return h.hex();
}

/** Buildings are indexed by the cell containing their center; props by their position. */
export function buildCellIndex(l: WorldLayout): CellIndex[] {
  const out: CellIndex[] = [];
  for (let i = 0; i < CELLS * CELLS; i++) out.push({ buildings: [], props: [] });
  const cellIdx = (x: number, z: number) => {
    const cx = Math.min(CELLS - 1, Math.max(0, Math.floor(x / CELL_SIZE)));
    const cz = Math.min(CELLS - 1, Math.max(0, Math.floor(z / CELL_SIZE)));
    return cellKey(cx, cz);
  };
  for (const b of l.buildings) out[cellIdx(b.x, b.z)].buildings.push(b.id);
  for (const p of l.props) out[cellIdx(p.x, p.z)].props.push(p.id);
  return out;
}

function tileIndex(x: number, z: number): number {
  const tx = Math.min(TILES - 1, Math.max(0, Math.floor(x / TILE_SIZE)));
  const tz = Math.min(TILES - 1, Math.max(0, Math.floor(z / TILE_SIZE)));
  return tz * TILES + tx;
}

export function districtAt(l: WorldLayout, x: number, z: number): DistrictInfo {
  return l.districts[l.districtMap[tileIndex(x, z)]];
}

export function tileAt(l: WorldLayout, x: number, z: number): Tile {
  return l.tiles[tileIndex(x, z)] as Tile;
}

/** Terrain height, bilinear between tile centers (tile (tx,tz) center = tx*4+2, tz*4+2). */
export function heightAt(l: WorldLayout, x: number, z: number): number {
  const fx = Math.min(TILES - 1, Math.max(0, x / TILE_SIZE - 0.5));
  const fz = Math.min(TILES - 1, Math.max(0, z / TILE_SIZE - 0.5));
  const x0 = Math.floor(fx);
  const z0 = Math.floor(fz);
  const x1 = Math.min(TILES - 1, x0 + 1);
  const z1 = Math.min(TILES - 1, z0 + 1);
  const u = fx - x0;
  const v = fz - z0;
  const H = l.heights;
  const a = H[z0 * TILES + x0];
  const b = H[z0 * TILES + x1];
  const c = H[z1 * TILES + x0];
  const d = H[z1 * TILES + x1];
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

/** World-space AABB of a building footprint. */
export function buildingBounds(b: BuildingDef): { x0: number; z0: number; x1: number; z1: number } {
  const hx = (b.rot & 1 ? b.d : b.w) / 2;
  const hz = (b.rot & 1 ? b.w : b.d) / 2;
  return { x0: b.x - hx, z0: b.z - hz, x1: b.x + hx, z1: b.z + hz };
}

/** Rotate a building-local point (lx, lz) into world space. rot quarter turns: rot0 local+z→world+z, rot1 local+z→world+x. */
export function buildingLocalToWorld(b: BuildingDef, lx: number, lz: number): [number, number] {
  switch (b.rot) {
    case 0:
      return [b.x + lx, b.z + lz];
    case 1:
      return [b.x + lz, b.z - lx];
    case 2:
      return [b.x - lx, b.z - lz];
    default:
      return [b.x - lz, b.z + lx];
  }
}

const TILE_RGB: Record<number, [number, number, number]> = {
  [Tile.Grass]: [86, 100, 72],
  [Tile.Road]: [52, 54, 58],
  [Tile.Sidewalk]: [112, 112, 108],
  [Tile.Lot]: [96, 92, 84],
  [Tile.Dirt]: [110, 96, 74],
  [Tile.Field]: [128, 116, 70],
  [Tile.Water]: [44, 70, 92],
  [Tile.Rail]: [74, 62, 56],
  [Tile.Plaza]: [124, 120, 112],
  [Tile.Forest]: [52, 72, 52],
  [Tile.Bridge]: [92, 88, 84],
};

const DISTRICT_TINT: Record<string, [number, number, number]> = {
  haven: [214, 150, 80],
  downtown: [120, 130, 150],
  residential: [150, 130, 110],
  market: [170, 120, 90],
  industrial: [130, 110, 90],
  hospital: [150, 170, 170],
  waterworks: [100, 140, 160],
  rail: [140, 100, 90],
  outskirts: [110, 130, 90],
};

/**
 * Top-down RGBA map (for minimap / world map). `scale` = pixels per 4 m tile (1..4).
 * Buildings are drawn darker and tinted by district; control nodes as bright accent dots.
 */
export function renderMapRGBA(l: WorldLayout, scale = 1): { w: number; h: number; data: Uint8ClampedArray } {
  const s = Math.max(1, Math.min(4, Math.floor(scale)));
  const w = TILES * s;
  const h = TILES * s;
  const data = new Uint8ClampedArray(w * h * 4);
  const put = (px: number, pz: number, c: [number, number, number]) => {
    if (px < 0 || pz < 0 || px >= w || pz >= h) return;
    const o = (pz * w + px) * 4;
    data[o] = c[0];
    data[o + 1] = c[1];
    data[o + 2] = c[2];
    data[o + 3] = 255;
  };
  for (let tz = 0; tz < TILES; tz++) {
    for (let tx = 0; tx < TILES; tx++) {
      const i = tz * TILES + tx;
      const base = TILE_RGB[l.tiles[i]] ?? [255, 0, 255];
      const hgt = l.heights[i];
      const shade = 1 + hgt * 0.04;
      const c: [number, number, number] = [base[0] * shade, base[1] * shade, base[2] * shade];
      for (let dz = 0; dz < s; dz++) for (let dx = 0; dx < s; dx++) put(tx * s + dx, tz * s + dz, c);
    }
  }
  const ppm = s / TILE_SIZE;
  for (const b of l.buildings) {
    const bb = buildingBounds(b);
    const tint = DISTRICT_TINT[DISTRICT_KEYS[b.district]] ?? [128, 128, 128];
    const k = 0.55 - b.floors * 0.04;
    const c: [number, number, number] = [tint[0] * k + 20, tint[1] * k + 20, tint[2] * k + 20];
    const edge: [number, number, number] = [c[0] * 0.6, c[1] * 0.6, c[2] * 0.6];
    const px0 = Math.round(bb.x0 * ppm);
    const px1 = Math.round(bb.x1 * ppm);
    const pz0 = Math.round(bb.z0 * ppm);
    const pz1 = Math.round(bb.z1 * ppm);
    for (let pz = pz0; pz < pz1; pz++)
      for (let px = px0; px < px1; px++) put(px, pz, px === px0 || pz === pz0 || px === px1 - 1 || pz === pz1 - 1 ? edge : c);
  }
  for (const n of l.nodes) {
    const px = Math.round(n.x * ppm);
    const pz = Math.round(n.z * ppm);
    const r = Math.max(2, s * 2);
    for (let dz = -r; dz <= r; dz++)
      for (let dx = -r; dx <= r; dx++) if (dx * dx + dz * dz <= r * r) put(px + dx, pz + dz, [64, 230, 210]);
  }
  return { w, h, data };
}
