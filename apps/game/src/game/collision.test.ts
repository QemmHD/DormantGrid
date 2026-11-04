import { describe, expect, it } from 'vitest';
import { CollisionWorld } from './collision';

describe('collision', () => {
  it('pushes a cylinder out of an axis-aligned box', () => {
    const w = new CollisionWorld();
    w.add({ minX: -1, maxX: 1, minY: 0, maxY: 2, minZ: -1, maxZ: 1, tag: 'piece', ref: 0 });
    const p = { x: 1.2, y: 0, z: 0 };
    const r = w.resolve(p, 0.4, 1.7, 0.45);
    expect(r.hitWall).toBe(true);
    expect(p.x).toBeCloseTo(1.4, 3);
  });

  it('a rotated (OBB) car does not block the empty corner of its AABB', () => {
    const w = new CollisionWorld();
    const a = Math.PI / 4; // car rotated 45°: AABB is much bigger than the car
    const hx = 0.9, hz = 2.1;
    const ex = Math.abs(Math.cos(a)) * hx + Math.abs(Math.sin(a)) * hz;
    w.add({ minX: -ex, maxX: ex, minY: 0, maxY: 1.4, minZ: -ex, maxZ: ex, tag: 'prop', ref: 1, obb: { cx: 0, cz: 0, hx, hz, c: Math.cos(a), s: -Math.sin(a) } });
    // a point near the AABB corner but well outside the rotated car
    const p = { x: ex - 0.3, y: 0, z: -(ex - 0.3) };
    const before = { ...p };
    w.resolve(p, 0.35, 1.7, 0.45);
    expect(Math.hypot(p.x - before.x, p.z - before.z)).toBeLessThan(1e-6);
    // a point at the car's center line gets pushed out
    const q = { x: 0.2, y: 0, z: 0.2 };
    const r = w.resolve(q, 0.35, 1.7, 0.45);
    expect(r.hitWall).toBe(true);
  });

  it('stands on low boxes within step height and ignores ones above the head', () => {
    const w = new CollisionWorld();
    w.add({ minX: -1, maxX: 1, minY: 0, maxY: 0.3, minZ: -1, maxZ: 1, tag: 'piece', ref: 0 });
    w.add({ minX: -1, maxX: 1, minY: 2.5, maxY: 3, minZ: -1, maxZ: 1, tag: 'piece', ref: 1 });
    const p = { x: 0, y: 0, z: 0 };
    const r = w.resolve(p, 0.35, 1.7, 0.45);
    expect(r.ground).toBeCloseTo(0.3, 5);
    expect(r.hitWall).toBe(false);
  });
});
