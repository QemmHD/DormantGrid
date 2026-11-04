// Coarse navigation grid (2 m cells) + A*. Fallback chosen over recast for mobile (see docs/DECISIONS.md).

import { NAVS, NAV_SIZE, TILES, TILE_SIZE, Tile, type WorldLayout } from '@dg/shared';
import { PROP_BLOCKS_NAV, PROP_HALF } from './gen';
import { buildingBounds } from './query';

export const NAV_WALK = 0;
export const NAV_BLOCKED = 1;
export const NAV_SLOW = 2;

/**
 * NAVS*NAVS grid: 0 walkable, 1 blocked (buildings, water, large vehicles/containers), 2 slow (forest, rail, fields).
 * `removedProps` lets callers rebuild after deconstruction.
 */
export function buildNavGrid(l: WorldLayout, removedProps?: ReadonlySet<number>): Uint8Array {
  const nav = new Uint8Array(NAVS * NAVS);
  const ratio = TILE_SIZE / NAV_SIZE; // 2
  for (let tz = 0; tz < TILES; tz++) {
    for (let tx = 0; tx < TILES; tx++) {
      const t = l.tiles[tz * TILES + tx];
      let v = NAV_WALK;
      if (t === Tile.Water) v = NAV_BLOCKED;
      else if (t === Tile.Forest || t === Tile.Rail || t === Tile.Field) v = NAV_SLOW;
      if (v === NAV_WALK) continue;
      for (let dz = 0; dz < ratio; dz++)
        for (let dx = 0; dx < ratio; dx++) nav[(tz * ratio + dz) * NAVS + tx * ratio + dx] = v;
    }
  }
  const fill = (x0: number, z0: number, x1: number, z1: number, v: number) => {
    const nx0 = Math.max(0, Math.floor(x0 / NAV_SIZE));
    const nz0 = Math.max(0, Math.floor(z0 / NAV_SIZE));
    const nx1 = Math.min(NAVS - 1, Math.ceil(x1 / NAV_SIZE) - 1);
    const nz1 = Math.min(NAVS - 1, Math.ceil(z1 / NAV_SIZE) - 1);
    for (let z = nz0; z <= nz1; z++) for (let x = nx0; x <= nx1; x++) nav[z * NAVS + x] = v;
  };
  for (const b of l.buildings) {
    const bb = buildingBounds(b);
    fill(bb.x0, bb.z0, bb.x1, bb.z1, NAV_BLOCKED);
  }
  for (const p of l.props) {
    if (p.building >= 0 || !PROP_BLOCKS_NAV.has(p.kind) || removedProps?.has(p.id)) continue;
    const [hx0, hz0] = PROP_HALF[p.kind];
    const q = Math.round(p.rotY / (Math.PI / 2)) & 1;
    const hx = (q ? hz0 : hx0) * p.scale * 0.8;
    const hz = (q ? hx0 : hz0) * p.scale * 0.8;
    // only block cells whose centers are covered, so narrow gaps stay open
    const nx0 = Math.ceil((p.x - hx) / NAV_SIZE - 0.5);
    const nx1 = Math.floor((p.x + hx) / NAV_SIZE - 0.5);
    const nz0 = Math.ceil((p.z - hz) / NAV_SIZE - 0.5);
    const nz1 = Math.floor((p.z + hz) / NAV_SIZE - 0.5);
    for (let z = Math.max(0, nz0); z <= Math.min(NAVS - 1, nz1); z++)
      for (let x = Math.max(0, nx0); x <= Math.min(NAVS - 1, nx1); x++) nav[z * NAVS + x] = NAV_BLOCKED;
  }
  return nav;
}

/** Nearest walkable nav cell within `radius` cells, or -1. */
function nearestOpen(nav: Uint8Array, cx: number, cz: number, radius: number): number {
  for (let r = 0; r <= radius; r++) {
    for (let dz = -r; dz <= r; dz++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
        const x = cx + dx;
        const z = cz + dz;
        if (x < 0 || z < 0 || x >= NAVS || z >= NAVS) continue;
        if (nav[z * NAVS + x] !== NAV_BLOCKED) return z * NAVS + x;
      }
    }
  }
  return -1;
}

// Reusable A* buffers (module-level so repeated calls do not allocate megabytes each time)
let gScore: Float32Array | null = null;
let came: Int32Array | null = null;
let stamp: Uint32Array | null = null;
let closedStamp: Uint32Array | null = null;
let curStamp = 0;

class Heap {
  ids: number[] = [];
  fs: number[] = [];
  push(id: number, f: number): void {
    const a = this.ids;
    const b = this.fs;
    let i = a.length;
    a.push(id);
    b.push(f);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (b[p] <= f) break;
      a[i] = a[p];
      b[i] = b[p];
      i = p;
    }
    a[i] = id;
    b[i] = f;
  }
  pop(): number {
    const a = this.ids;
    const b = this.fs;
    const top = a[0];
    const lastId = a.pop()!;
    const lastF = b.pop()!;
    const n = a.length;
    if (n > 0) {
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        if (l >= n) break;
        const r = l + 1;
        const c = r < n && b[r] < b[l] ? r : l;
        if (b[c] >= lastF) break;
        a[i] = a[c];
        b[i] = b[c];
        i = c;
      }
      a[i] = lastId;
      b[i] = lastF;
    }
    return top;
  }
  get size(): number {
    return this.ids.length;
  }
}

/**
 * A* over the nav grid in world meters. 8-connected, no corner cutting, slow cells cost 2.5x.
 * Returns simplified waypoints (cell centers, world meters) from start to target, or null.
 */
export function findPath(
  nav: Uint8Array,
  sx: number,
  sz: number,
  tx: number,
  tz: number,
  maxNodes = 20000,
): [number, number][] | null {
  const N = NAVS * NAVS;
  if (!gScore || gScore.length !== N) {
    gScore = new Float32Array(N);
    came = new Int32Array(N);
    stamp = new Uint32Array(N);
    closedStamp = new Uint32Array(N);
    curStamp = 0;
  }
  curStamp++;
  if (curStamp === 0xffffffff) {
    stamp!.fill(0);
    closedStamp!.fill(0);
    curStamp = 1;
  }
  const clampN = (v: number) => Math.max(0, Math.min(NAVS - 1, Math.floor(v / NAV_SIZE)));
  const start = nearestOpen(nav, clampN(sx), clampN(sz), 3);
  const goal = nearestOpen(nav, clampN(tx), clampN(tz), 3);
  if (start < 0 || goal < 0) return null;
  const gx = goal % NAVS;
  const gz = (goal / NAVS) | 0;
  const h = (i: number) => {
    const dx = Math.abs((i % NAVS) - gx);
    const dz = Math.abs(((i / NAVS) | 0) - gz);
    return (dx + dz + (Math.SQRT2 - 2) * Math.min(dx, dz)) * 1.001;
  };
  const G = gScore;
  const C = came!;
  const S = stamp!;
  const CL = closedStamp!;
  const heap = new Heap();
  G[start] = 0;
  C[start] = -1;
  S[start] = curStamp;
  heap.push(start, h(start));
  let expanded = 0;
  let found = false;
  while (heap.size > 0) {
    const cur = heap.pop();
    if (CL[cur] === curStamp) continue;
    CL[cur] = curStamp;
    if (cur === goal) {
      found = true;
      break;
    }
    if (++expanded > maxNodes) return null;
    const cx = cur % NAVS;
    const cz = (cur / NAVS) | 0;
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dz) continue;
        const nx = cx + dx;
        const nz = cz + dz;
        if (nx < 0 || nz < 0 || nx >= NAVS || nz >= NAVS) continue;
        const ni = nz * NAVS + nx;
        const v = nav[ni];
        if (v === NAV_BLOCKED || CL[ni] === curStamp) continue;
        if (dx && dz && (nav[cz * NAVS + nx] === NAV_BLOCKED || nav[nz * NAVS + cx] === NAV_BLOCKED)) continue;
        const step = (dx && dz ? Math.SQRT2 : 1) * (v === NAV_SLOW ? 2.5 : 1);
        const g = G[cur] + step;
        if (S[ni] === curStamp && g >= G[ni]) continue;
        S[ni] = curStamp;
        G[ni] = g;
        C[ni] = cur;
        heap.push(ni, g + h(ni));
      }
    }
  }
  if (!found) return null;
  const cells: number[] = [];
  for (let i = goal; i !== -1; i = C[i]) cells.push(i);
  cells.reverse();
  // simplify: drop points that continue the same direction
  const out: [number, number][] = [];
  let pdx = 99;
  let pdz = 99;
  for (let k = 0; k < cells.length; k++) {
    const i = cells[k];
    const x = i % NAVS;
    const z = (i / NAVS) | 0;
    if (k > 0 && k < cells.length - 1) {
      const n = cells[k + 1];
      const ddx = (n % NAVS) - x;
      const ddz = ((n / NAVS) | 0) - z;
      if (ddx === pdx && ddz === pdz) continue;
      pdx = ddx;
      pdz = ddz;
    } else if (k === 0 && cells.length > 1) {
      const n = cells[1];
      pdx = (n % NAVS) - x;
      pdz = ((n / NAVS) | 0) - z;
    }
    out.push([x * NAV_SIZE + NAV_SIZE / 2, z * NAV_SIZE + NAV_SIZE / 2]);
  }
  return out;
}
