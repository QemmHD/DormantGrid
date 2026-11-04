// Worldgen versioning + save safety.
// Saves store the seed, the worldgen version and deltas (removed prop/piece ids,
// placed pieces, drops, ...) — never generated props. These tests prove that a
// newer worldgen keeps every older id meaning the same thing, so old saves load.
import { describe, expect, it } from 'vitest';
import { SAVE_SCHEMA_VERSION, TILES, TILE_SIZE, Tile, WORLDGEN_VERSION, type PropDef, type WorldLayout } from '@dg/shared';
import { buildingBounds, generateWorld, PROP_HALF, tileAt } from '../src/world/index';
import { decodeSave, encodeSave, migrateSave, newGame, SaveError, upgradeWorldGen, validateSave } from '../src/save/index';

declare const console: { log: (...a: unknown[]) => void };
const bytesEqual = (a: Uint8Array, b: Uint8Array) => a.length === b.length && a.every((v, i) => v === b[i]);

const SEED = 1337;
const V1_HASH = '9cf52650';
let v1: WorldLayout | null = null;
let v2: WorldLayout | null = null;
const L1 = () => (v1 ??= generateWorld(SEED, 1));
const L2 = () => (v2 ??= generateWorld(SEED, 2));

const sameProp = (a: PropDef, b: PropDef) =>
  a.id === b.id && a.kind === b.kind && a.x === b.x && a.y === b.y && a.z === b.z && a.rotY === b.rotY && a.scale === b.scale && a.building === b.building;

/** Axis-aligned footprint exactly as worldgen's tryProp computes it. */
function rect(p: PropDef): [number, number, number, number] {
  const [hx0, hz0] = PROP_HALF[p.kind];
  const q = Math.round(p.rotY / (Math.PI / 2)) & 1;
  const hx = (q ? hz0 : hx0) * p.scale;
  const hz = (q ? hx0 : hz0) * p.scale;
  return [p.x - hx, p.z - hz, p.x + hx, p.z + hz];
}

describe('worldgen versions', () => {
  it('latest version is 2 and v1 output is frozen (hash unchanged)', () => {
    expect(WORLDGEN_VERSION).toBe(2);
    expect(L1().genVersion).toBe(1);
    expect(L1().hash).toBe(V1_HASH);
    expect(generateWorld(SEED).genVersion).toBe(WORLDGEN_VERSION);
  });

  it('rejects unknown versions', () => {
    expect(() => generateWorld(SEED, 0)).toThrow();
    expect(() => generateWorld(SEED, WORLDGEN_VERSION + 1)).toThrow();
  });

  it('v2 is deterministic', () => {
    const again = generateWorld(SEED, 2);
    expect(again.hash).toBe(L2().hash);
    expect(again.props.length).toBe(L2().props.length);
    expect(L2().hash).not.toBe(V1_HASH);
  });

  it('v2 is a strict superset of v1: tiles, buildings, nodes identical; v1 props are an identical prefix', () => {
    const a = L1();
    const b = L2();
    expect(bytesEqual(b.tiles, a.tiles)).toBe(true);
    expect(bytesEqual(b.districtMap, a.districtMap)).toBe(true);
    expect(b.buildings).toEqual(a.buildings);
    expect(b.nodes).toEqual(a.nodes);
    expect(b.spawn).toEqual(a.spawn);
    expect(b.propMarks[1]).toBe(a.props.length);
    expect(b.propMarks[2]).toBe(b.props.length);
    for (let i = 0; i < a.props.length; i++) if (!sameProp(a.props[i], b.props[i])) expect.fail(`prop ${i} changed between v1 and v2`);
  });

  it('v2 adds substantially more, and more varied, street dressing', () => {
    const a = L1();
    const b = L2();
    const added = b.props.slice(a.props.length);
    expect(b.props.length).toBeGreaterThan(a.props.length * 1.2);
    const kinds = new Map<string, number>();
    for (const p of added) kinds.set(p.kind, (kinds.get(p.kind) ?? 0) + 1);
    // the categories the brief asked for: cars, barrels, crates, debris, signs, foliage
    for (const k of ['car', 'barrel', 'crate', 'debris', 'sign', 'bush', 'weeds', 'cone', 'barrier', 'planter']) {
      expect(kinds.get(k) ?? 0, `v2 adds ${k}`).toBeGreaterThan(5);
    }
    console.log(`[worldgen v2] +${added.length} props over v1 (${a.props.length} → ${b.props.length}):`, Object.fromEntries([...kinds].sort((x, y) => y[1] - x[1])));
  });

  it('v2 props do not overlap buildings, water, rail or each other, and keep spawn and nodes clear', () => {
    const l = L2();
    const from = l.propMarks[1];
    const occ = new Uint8Array(TILES * TILES);
    for (const bb of l.buildings.map(buildingBounds))
      for (let z = bb.z0; z < bb.z1; z += TILE_SIZE) for (let x = bb.x0; x < bb.x1; x += TILE_SIZE) occ[(z / TILE_SIZE) * TILES + x / TILE_SIZE] = 1;
    // spatial hash of outdoor prop rects
    const CELL = 8;
    const grid = new Map<number, PropDef[]>();
    const key = (cx: number, cz: number) => cz * 4096 + cx;
    for (const p of l.props) {
      if (p.building >= 0) continue;
      const [x0, z0, x1, z1] = rect(p);
      for (let cz = Math.floor(z0 / CELL); cz <= Math.floor(z1 / CELL); cz++)
        for (let cx = Math.floor(x0 / CELL); cx <= Math.floor(x1 / CELL); cx++) {
          const k = key(cx, cz);
          const list = grid.get(k);
          if (list) list.push(p);
          else grid.set(k, [p]);
        }
    }
    for (let i = from; i < l.props.length; i++) {
      const p = l.props[i];
      expect(p.building).toBe(-1);
      const [x0, z0, x1, z1] = rect(p);
      // positions are stored rounded to 1 cm, so test corners 2 cm inside the footprint
      const e = 0.02;
      for (const [x, z] of [[x0 + e, z0 + e], [x1 - e, z0 + e], [x0 + e, z1 - e], [x1 - e, z1 - e], [p.x, p.z]]) {
        const t = tileAt(l, x, z);
        expect(t === Tile.Water || t === Tile.Rail, `prop ${p.id} ${p.kind} on water/rail`).toBe(false);
        expect(occ[Math.floor(z / TILE_SIZE) * TILES + Math.floor(x / TILE_SIZE)], `prop ${p.id} ${p.kind} inside a building`).toBe(0);
      }
      expect(Math.hypot(p.x - l.spawn.x, p.z - l.spawn.z)).toBeGreaterThanOrEqual(26);
      for (const n of l.nodes) expect(Math.hypot(p.x - n.x, p.z - n.z), `prop ${p.id} near node ${n.id}`).toBeGreaterThanOrEqual(9);
      const seen = new Set<number>();
      for (let cz = Math.floor(z0 / CELL); cz <= Math.floor(z1 / CELL); cz++)
        for (let cx = Math.floor(x0 / CELL); cx <= Math.floor(x1 / CELL); cx++)
          for (const o of grid.get(key(cx, cz)) ?? []) {
            if (o.id === p.id || seen.has(o.id)) continue;
            seen.add(o.id);
            const [a0, b0, a1, b1] = rect(o);
            const ov = Math.min(x1, a1) - Math.max(x0, a0) > 0.01 && Math.min(z1, b1) - Math.max(z0, b0) > 0.01;
            if (ov) expect.fail(`v2 prop ${p.id} ${p.kind} overlaps prop ${o.id} ${o.kind}`);
          }
    }
  });
});

describe('save safety across worldgen versions', () => {
  /** A save exactly as the shipped schema-1 build wrote it (no genVersion field). */
  function schema1Save(): Record<string, unknown> {
    const s = newGame(SEED, 'standard', L1().spawn) as unknown as Record<string, unknown>;
    const w = s.world as Record<string, unknown>;
    delete w.genVersion;
    s.schema = 1;
    const outdoor = L1().props.filter((p) => p.building < 0);
    w.removedProps = [outdoor[10].id, outdoor[500].id, outdoor[4000].id, L1().props.length - 1];
    w.removedPieces = { '3': [0, 2] };
    return s;
  }

  it('saves store seed + genVersion + deltas only (no generated props)', () => {
    const s = newGame(SEED, 'standard', L2().spawn);
    expect(s.schema).toBe(SAVE_SCHEMA_VERSION);
    expect(s.world.seed).toBe(SEED);
    expect(s.world.genVersion).toBe(WORLDGEN_VERSION);
    const json = JSON.stringify(s);
    expect(json).not.toContain('"props"');
    expect(json).not.toContain('"buildings"');
    expect(json.length).toBeLessThan(20_000);
  });

  it('a schema-1 save migrates to schema 2 with genVersion 1 and keeps its removed ids', () => {
    const raw = schema1Save();
    const m = migrateSave(JSON.parse(JSON.stringify(raw)));
    expect(m.schema).toBe(2);
    expect(m.world.genVersion).toBe(1);
    expect(m.world.removedProps).toEqual([...((raw.world as { removedProps: number[] }).removedProps)].sort((a, b) => a - b));
    expect(m.world.removedPieces).toEqual({ '3': [0, 2] });
  });

  it('after upgrading to v2, every removed id still names the same prop', () => {
    const m = migrateSave(schema1Save());
    const before = m.world.removedProps.map((id) => L1().props[id]);
    upgradeWorldGen(m, L2());
    expect(m.world.genVersion).toBe(2);
    for (const p of before) {
      expect(m.world.removedProps).toContain(p.id);
      expect(sameProp(L2().props[p.id], p)).toBe(true);
    }
    // round trip through the binary codec at the new version
    const back = decodeSave(encodeSave(m));
    expect(back.world.genVersion).toBe(2);
    expect(back.world.removedProps).toEqual(m.world.removedProps);
  });

  it('upgrade clears new props that would land on the player base, and only new ones', () => {
    const m = migrateSave(schema1Save());
    const l = L2();
    const target = l.props[l.propMarks[1] + 25];
    m.world.pieces.push({ id: 1, piece: 'wall', tier: 1, x: target.x + 0.5, y: 0, z: target.z, rot: 0, hp: 100 });
    m.world.nextPieceId = 2;
    const cleared = upgradeWorldGen(m, l);
    expect(cleared).toContain(target.id);
    for (const id of cleared) expect(id).toBeGreaterThanOrEqual(l.propMarks[1]);
    expect(m.world.removedProps).toContain(target.id);
    // idempotent
    expect(upgradeWorldGen(m, l)).toEqual([]);
  });

  it('a save from a future worldgen version is refused, not silently loaded', () => {
    const s = newGame(SEED, 'standard', L2().spawn) as unknown as { world: { genVersion: number } };
    s.world.genVersion = WORLDGEN_VERSION + 1;
    expect(() => validateSave(s)).toThrow(SaveError);
    try {
      validateSave(s);
    } catch (e) {
      expect((e as SaveError).reason).toBe('future_version');
    }
  });
});
