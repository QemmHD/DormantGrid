import { describe, expect, it } from 'vitest';
import { DISTRICT_KEYS, NAVS, NAV_SIZE, TILES, TILE_SIZE, Tile, WORLD_SIZE, type WorldLayout } from '@dg/shared';
import {
  buildCellIndex,
  buildNavGrid,
  buildingBounds,
  findPath,
  generateWorld,
  heightAt,
  layoutHash,
  NAV_BLOCKED,
  PROP_HALF,
  tileAt,
} from '../src/world/index';

declare const console: { log: (...a: unknown[]) => void };

const SEED = 1337;
let cached: WorldLayout | null = null;
let genMs = 0;
function world(): WorldLayout {
  if (!cached) {
    const t = Date.now();
    cached = generateWorld(SEED);
    genMs = Date.now() - t;
  }
  return cached;
}

describe('worldgen determinism', () => {
  it('same seed gives identical hash, different seeds differ', () => {
    const a = world();
    const b = generateWorld(SEED);
    expect(b.hash).toBe(a.hash);
    expect(layoutHash(b)).toBe(a.hash);
    expect(b.buildings.length).toBe(a.buildings.length);
    expect(b.props.length).toBe(a.props.length);
    const c = generateWorld(SEED + 1);
    expect(c.hash).not.toBe(a.hash);
    console.log(`[worldgen] seed ${SEED} hash ${a.hash} in ${genMs} ms; buildings ${a.buildings.length}, props ${a.props.length}, nodes ${a.nodes.length}`);
  });

  it('generates quickly and within size targets', () => {
    const l = world();
    expect(genMs).toBeLessThan(3000);
    expect(l.buildings.length).toBeGreaterThanOrEqual(600);
    expect(l.buildings.length).toBeLessThanOrEqual(1500);
    expect(l.props.length).toBeGreaterThanOrEqual(12000);
    expect(l.props.length).toBeLessThanOrEqual(30000);
    expect(l.tiles.length).toBe(TILES * TILES);
    expect(l.districts.map((d) => d.key)).toEqual([...DISTRICT_KEYS]);
    const enterable = l.buildings.filter((b) => b.enterable).length / l.buildings.length;
    expect(enterable).toBeGreaterThan(0.2);
    expect(enterable).toBeLessThan(0.45);
    for (const b of l.buildings.filter((x) => x.enterable)) expect(b.floors).toBeLessThanOrEqual(2);
  });
});

describe('worldgen layout validity', () => {
  it('buildings do not overlap each other, roads, water or rail', () => {
    const l = world();
    const owner = new Int32Array(TILES * TILES).fill(-1);
    for (const b of l.buildings) {
      expect(b.w % 4).toBe(0);
      expect(b.d % 4).toBe(0);
      expect(b.floors).toBeGreaterThanOrEqual(1);
      expect(b.floors).toBeLessThanOrEqual(6);
      const bb = buildingBounds(b);
      expect(bb.x0).toBeGreaterThanOrEqual(0);
      expect(bb.z1).toBeLessThanOrEqual(WORLD_SIZE);
      for (let z = bb.z0 + 2; z < bb.z1; z += TILE_SIZE) {
        for (let x = bb.x0 + 2; x < bb.x1; x += TILE_SIZE) {
          const i = Math.floor(z / TILE_SIZE) * TILES + Math.floor(x / TILE_SIZE);
          expect(owner[i], `building ${b.id} overlaps ${owner[i]}`).toBe(-1);
          owner[i] = b.id;
          const t = l.tiles[i];
          expect([Tile.Road, Tile.Sidewalk, Tile.Water, Tile.Rail, Tile.Bridge]).not.toContain(t);
          expect(l.heights[i]).toBe(0);
        }
      }
    }
  });

  it('props are in bounds and not inside buildings (unless interior) or water', () => {
    const l = world();
    const boxes = l.buildings.map(buildingBounds);
    for (const p of l.props) {
      expect(p.x).toBeGreaterThan(0);
      expect(p.z).toBeGreaterThan(0);
      expect(p.x).toBeLessThan(WORLD_SIZE);
      expect(p.z).toBeLessThan(WORLD_SIZE);
      expect(Number.isFinite(p.rotY)).toBe(true);
      expect(PROP_HALF[p.kind]).toBeDefined();
      expect(tileAt(l, p.x, p.z)).not.toBe(Tile.Water);
      if (p.building >= 0) {
        const bb = boxes[p.building];
        expect(l.buildings[p.building].enterable).toBe(true);
        expect(p.x > bb.x0 && p.x < bb.x1 && p.z > bb.z0 && p.z < bb.z1).toBe(true);
      }
    }
    // outdoor props never sit inside a building footprint: use a tile occupancy map
    const occ = new Uint8Array(TILES * TILES);
    for (const bb of boxes)
      for (let z = bb.z0; z < bb.z1; z += TILE_SIZE)
        for (let x = bb.x0; x < bb.x1; x += TILE_SIZE) occ[(z / TILE_SIZE) * TILES + x / TILE_SIZE] = 1;
    for (const p of l.props) {
      if (p.building >= 0) continue;
      const i = Math.floor(p.z / TILE_SIZE) * TILES + Math.floor(p.x / TILE_SIZE);
      expect(occ[i], `prop ${p.id} ${p.kind} inside a building`).toBe(0);
    }
    // ids are dense
    l.props.forEach((p, i) => expect(p.id).toBe(i));
  });

  it('every non-haven district has 1-3 control nodes; haven has none', () => {
    const l = world();
    for (const d of l.districts) {
      const n = l.nodes.filter((x) => x.district === d.index).length;
      if (d.key === 'haven') expect(n).toBe(0);
      else {
        expect(n, d.key).toBeGreaterThanOrEqual(1);
        expect(n, d.key).toBeLessThanOrEqual(3);
      }
    }
  });

  it('has a river, a bridge, rail, roads, fields and forest', () => {
    const l = world();
    const count = (t: Tile) => l.tiles.reduce((a, x) => a + (x === t ? 1 : 0), 0);
    expect(count(Tile.Water)).toBeGreaterThan(500);
    expect(count(Tile.Bridge)).toBeGreaterThan(4);
    expect(count(Tile.Rail)).toBeGreaterThan(200);
    expect(count(Tile.Road)).toBeGreaterThan(3000);
    expect(count(Tile.Field)).toBeGreaterThan(100);
    expect(count(Tile.Forest)).toBeGreaterThan(1000);
    let maxH = 0;
    for (const h of l.heights) maxH = Math.max(maxH, h);
    expect(maxH).toBeGreaterThan(0.5);
    expect(maxH).toBeLessThanOrEqual(4);
    expect(heightAt(l, l.spawn.x, l.spawn.z)).toBe(0);
  });

  it('cell index covers every building and prop exactly once', () => {
    const l = world();
    const idx = buildCellIndex(l);
    expect(idx.reduce((a, c) => a + c.buildings.length, 0)).toBe(l.buildings.length);
    expect(idx.reduce((a, c) => a + c.props.length, 0)).toBe(l.props.length);
  });
});

describe('navigation', () => {
  it('spawn is walkable and reaches nodes in at least 3 districts', () => {
    const l = world();
    const nav = buildNavGrid(l);
    expect(nav.length).toBe(NAVS * NAVS);
    const si = Math.floor(l.spawn.z / NAV_SIZE) * NAVS + Math.floor(l.spawn.x / NAV_SIZE);
    expect(nav[si]).not.toBe(NAV_BLOCKED);
    const reached = new Set<number>();
    for (const n of l.nodes) {
      if (reached.has(n.district)) continue;
      const path = findPath(nav, l.spawn.x, l.spawn.z, n.x, n.z, 300000);
      if (path) {
        reached.add(n.district);
        const last = path[path.length - 1];
        expect(Math.hypot(last[0] - n.x, last[1] - n.z)).toBeLessThan(8);
        for (const [x, z] of path) expect(nav[Math.floor(z / NAV_SIZE) * NAVS + Math.floor(x / NAV_SIZE)]).not.toBe(NAV_BLOCKED);
      }
    }
    expect(reached.size).toBeGreaterThanOrEqual(3);
  });

  it('returns null when the target is unreachable within the node budget', () => {
    const l = world();
    const nav = buildNavGrid(l);
    const far = l.nodes.reduce((a, n) => (Math.hypot(n.x - l.spawn.x, n.z - l.spawn.z) > Math.hypot(a.x - l.spawn.x, a.z - l.spawn.z) ? n : a));
    expect(findPath(nav, l.spawn.x, l.spawn.z, far.x, far.z, 10)).toBeNull();
  });
});
