// Static collision world: AABBs in a spatial hash. Kinematic capsule (as a
// vertical cylinder) resolution, ground probing and segment raycasts.
// Decision (docs/DECISIONS.md): replaces Rapier for the player — the world is
// axis-aligned boxes, this is ~2 KB instead of ~1.5 MB WASM, and deterministic.

export interface Collider {
  minX: number;
  minY: number;
  minZ: number;
  maxX: number;
  maxY: number;
  maxZ: number;
  /** what this is: 'building' | 'prop' | 'piece' | 'wall' ... */
  tag: string;
  ref: number;
  /** optional oriented box in XZ (rotated props); AABB above stays the broadphase bound */
  obb?: { cx: number; cz: number; hx: number; hz: number; c: number; s: number };
  /** internal */
  _id?: number;
  _cells?: number[];
}

const CELL = 8;

export class CollisionWorld {
  private cells = new Map<number, Collider[]>();
  private nextId = 1;
  private stamp = 0;
  private seen = new Map<number, number>();
  count = 0;

  private key(cx: number, cz: number): number {
    return (cz + 2048) * 4096 + (cx + 2048);
  }

  add(c: Collider): Collider {
    c._id = this.nextId++;
    c._cells = [];
    const x0 = Math.floor(c.minX / CELL), x1 = Math.floor(c.maxX / CELL);
    const z0 = Math.floor(c.minZ / CELL), z1 = Math.floor(c.maxZ / CELL);
    for (let z = z0; z <= z1; z++)
      for (let x = x0; x <= x1; x++) {
        const k = this.key(x, z);
        let arr = this.cells.get(k);
        if (!arr) this.cells.set(k, (arr = []));
        arr.push(c);
        c._cells.push(k);
      }
    this.count++;
    return c;
  }

  remove(c: Collider): void {
    if (!c._cells) return;
    for (const k of c._cells) {
      const arr = this.cells.get(k);
      if (!arr) continue;
      const i = arr.indexOf(c);
      if (i >= 0) {
        arr[i] = arr[arr.length - 1];
        arr.pop();
      }
      if (arr.length === 0) this.cells.delete(k);
    }
    c._cells = undefined;
    this.count--;
  }

  /** Visit colliders overlapping an XZ rectangle (each once). */
  query(x0: number, z0: number, x1: number, z1: number, cb: (c: Collider) => void): void {
    this.stamp++;
    const cx0 = Math.floor(x0 / CELL), cx1 = Math.floor(x1 / CELL);
    const cz0 = Math.floor(z0 / CELL), cz1 = Math.floor(z1 / CELL);
    for (let z = cz0; z <= cz1; z++)
      for (let x = cx0; x <= cx1; x++) {
        const arr = this.cells.get(this.key(x, z));
        if (!arr) continue;
        for (let i = 0; i < arr.length; i++) {
          const c = arr[i];
          if (this.seen.get(c._id!) === this.stamp) continue;
          this.seen.set(c._id!, this.stamp);
          if (c.maxX < x0 || c.minX > x1 || c.maxZ < z0 || c.minZ > z1) continue;
          cb(c);
        }
      }
    if (this.seen.size > 50000) this.seen.clear();
  }

  /**
   * Resolve a vertical cylinder at feet (x,y,z) against boxes. Mutates `out`.
   * Returns ground height found under the cylinder (or -Infinity).
   */
  resolve(out: { x: number; y: number; z: number }, radius: number, height: number, step: number): { ground: number; hitWall: boolean; ceiling: number } {
    let hitWall = false;
    let ground = -Infinity;
    let ceiling = Infinity;
    for (let iter = 0; iter < 3; iter++) {
      let moved = false;
      this.query(out.x - radius, out.z - radius, out.x + radius, out.z + radius, (c) => {
        const feet = out.y;
        if (c.maxY <= feet + step || c.minY >= feet + height) return; // below step or above head
        if (c.obb) {
          const o = c.obb;
          const rx = out.x - o.cx, rz = out.z - o.cz;
          const lx = rx * o.c + rz * o.s, lz = -rx * o.s + rz * o.c;
          const qx = Math.max(-o.hx, Math.min(lx, o.hx)), qz = Math.max(-o.hz, Math.min(lz, o.hz));
          let ex = lx - qx, ez = lz - qz;
          let dd = ex * ex + ez * ez;
          if (dd >= radius * radius) return;
          if (dd < 1e-8) {
            // inside: push out along the shallowest local axis
            const px = o.hx - Math.abs(lx), pz = o.hz - Math.abs(lz);
            if (px < pz) {
              ex = Math.sign(lx) || 1;
              ez = 0;
              dd = 1;
              const push = px + radius;
              out.x += (ex * o.c - ez * o.s) * push;
              out.z += (ex * o.s + ez * o.c) * push;
            } else {
              ex = 0;
              ez = Math.sign(lz) || 1;
              const push = pz + radius;
              out.x += (ex * o.c - ez * o.s) * push;
              out.z += (ex * o.s + ez * o.c) * push;
            }
          } else {
            const d = Math.sqrt(dd);
            const push = radius - d;
            const nx = ex / d, nz = ez / d;
            out.x += (nx * o.c - nz * o.s) * push;
            out.z += (nx * o.s + nz * o.c) * push;
          }
          hitWall = true;
          moved = true;
          return;
        }
        // closest point on box rect to circle center
        const px = Math.max(c.minX, Math.min(out.x, c.maxX));
        const pz = Math.max(c.minZ, Math.min(out.z, c.maxZ));
        let dx = out.x - px;
        let dz = out.z - pz;
        const d2 = dx * dx + dz * dz;
        if (d2 >= radius * radius) return;
        if (d2 > 1e-8) {
          const d = Math.sqrt(d2);
          const push = radius - d;
          out.x += (dx / d) * push;
          out.z += (dz / d) * push;
        } else {
          // center inside box: push out along the shallowest axis
          const l = out.x - c.minX, r = c.maxX - out.x, b = out.z - c.minZ, f = c.maxZ - out.z;
          const m = Math.min(l, r, b, f);
          if (m === l) out.x = c.minX - radius;
          else if (m === r) out.x = c.maxX + radius;
          else if (m === b) out.z = c.minZ - radius;
          else out.z = c.maxZ + radius;
          dx = dz = 0;
        }
        hitWall = true;
        moved = true;
      });
      if (!moved) break;
    }
    const r2 = radius * 0.7;
    this.query(out.x - r2, out.z - r2, out.x + r2, out.z + r2, (c) => {
      if (c.maxY <= out.y + step + 0.01 && c.maxY > ground) ground = c.maxY;
      if (c.minY >= out.y + 0.5 && c.minY < ceiling) ceiling = c.minY;
    });
    return { ground, hitWall, ceiling };
  }

  /** Segment raycast. Returns hit fraction 0..1 (1 = no hit). */
  raycast(ax: number, ay: number, az: number, bx: number, by: number, bz: number, ignoreTag?: string): number {
    let best = 1;
    const dx = bx - ax, dy = by - ay, dz = bz - az;
    this.query(Math.min(ax, bx), Math.min(az, bz), Math.max(ax, bx), Math.max(az, bz), (c) => {
      if (ignoreTag && c.tag === ignoreTag) return;
      let tmin = 0;
      let tmax = best;
      const slab = (o: number, d: number, mn: number, mx: number): boolean => {
        if (Math.abs(d) < 1e-9) return o >= mn && o <= mx;
        let t1 = (mn - o) / d;
        let t2 = (mx - o) / d;
        if (t1 > t2) [t1, t2] = [t2, t1];
        tmin = Math.max(tmin, t1);
        tmax = Math.min(tmax, t2);
        return tmin <= tmax;
      };
      if (slab(ax, dx, c.minX, c.maxX) && slab(ay, dy, c.minY, c.maxY) && slab(az, dz, c.minZ, c.maxZ)) {
        if (tmin < best) best = tmin;
      }
    });
    return best;
  }
}
