// Procedural low-poly mesh builder: chunky bevelled forms, flat shading,
// vertex colors with baked ground AO, optional skin indices and emissive mask.
import * as THREE from 'three';

const tmpV = new THREE.Vector3();
const TA = new THREE.Vector3();
const TB = new THREE.Vector3();
const TC = new THREE.Vector3();
const tmpN = new THREE.Vector3();
const tmpM3 = new THREE.Matrix3();

export interface BuildOpts {
  /** darken vertices near y=0 (world-space after matrix) */
  groundAO?: boolean;
  /** per-face color jitter amount 0..0.2 */
  jitter?: number;
}

export class MeshBuilder {
  pos: number[] = [];
  nor: number[] = [];
  col: number[] = [];
  emit: number[] = [];
  skin: number[] = [];
  private m = new THREE.Matrix4();
  private stack: THREE.Matrix4[] = [];
  private color = new THREE.Color(1, 1, 1);
  private emissive = 0;
  private bone = 0;
  private seed = 1;
  /** when set (local space), triangles are auto-oriented to face away from it (convex shapes) */
  private convex: THREE.Vector3 | null = null;
  private convexW = new THREE.Vector3();
  constructor(public opts: BuildOpts = {}) {}

  get vertexCount(): number {
    return this.pos.length / 3;
  }

  setColor(c: number | THREE.Color): this {
    if (typeof c === 'number') this.color.setHex(c);
    else this.color.copy(c);
    return this;
  }
  setEmissive(e: number): this {
    this.emissive = e;
    return this;
  }
  setBone(b: number): this {
    this.bone = b;
    return this;
  }
  push(m: THREE.Matrix4): this {
    this.stack.push(this.m.clone());
    this.m.multiply(m);
    return this;
  }
  pushTRS(x: number, y: number, z: number, ry = 0, sx = 1, sy = 1, sz = 1): this {
    const q = new THREE.Quaternion().setFromAxisAngle(THREE.Object3D.DEFAULT_UP, ry);
    return this.push(new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(sx, sy, sz)));
  }
  pushMatrix(m: THREE.Matrix4): this {
    return this.push(m);
  }
  pop(): this {
    const m = this.stack.pop();
    if (m) this.m.copy(m);
    return this;
  }
  resetMatrix(): this {
    this.m.identity();
    this.stack.length = 0;
    return this;
  }

  private rnd(): number {
    this.seed = (this.seed * 16807) % 2147483647;
    return this.seed / 2147483647;
  }

  /** Add a flat-shaded triangle in local space. */
  tri(ax: number, ay: number, az: number, bx: number, by: number, bz: number, cx: number, cy: number, cz: number, shade = 1): void {
    const a = TA.set(ax, ay, az).applyMatrix4(this.m);
    let b = TB.set(bx, by, bz).applyMatrix4(this.m);
    let c = TC.set(cx, cy, cz).applyMatrix4(this.m);
    tmpN.subVectors(c, b).cross(tmpV.subVectors(a, b)).normalize();
    if (this.convex) {
      tmpV.copy(a).add(b).add(c).multiplyScalar(1 / 3).sub(this.convexW);
      if (tmpV.dot(tmpN) < 0) {
        const t = b;
        b = c;
        c = t;
        tmpN.negate();
      }
    }
    const j = this.opts.jitter ?? 0;
    const jit = j > 0 ? 1 + (this.rnd() - 0.5) * j : 1;
    const base = shade * jit;
    const ao = this.opts.groundAO;
    const cr = this.color.r, cg = this.color.g, cb = this.color.b;
    const P = this.pos, N = this.nor, C = this.col, E = this.emit, S = this.skin;
    const nx = tmpN.x, ny = tmpN.y, nz = tmpN.z;
    for (let k = 0; k < 3; k++) {
      const p = k === 0 ? a : k === 1 ? b : c;
      P.push(p.x, p.y, p.z);
      N.push(nx, ny, nz);
      const f = ao ? base * (0.55 + 0.45 * Math.min(1, Math.max(0, p.y / 1.6))) : base;
      C.push(cr * f, cg * f, cb * f);
      E.push(this.emissive);
      S.push(this.bone);
    }
  }

  quad(a: number[], b: number[], c: number[], d: number[], shade = 1): void {
    this.tri(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2], shade);
    this.tri(a[0], a[1], a[2], c[0], c[1], c[2], d[0], d[1], d[2], shade);
  }

  /** Axis-aligned box centered at (x,y,z) with half extents. Bottom face optional. */
  box(x: number, y: number, z: number, hx: number, hy: number, hz: number, bottom = false): void {
    const x0 = x - hx, x1 = x + hx, y0 = y - hy, y1 = y + hy, z0 = z - hz, z1 = z + hz;
    this.quad([x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], 1.0); // top
    this.quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], 0.92); // front +z
    this.quad([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], 0.8); // back -z
    this.quad([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], 0.86); // right +x
    this.quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], 0.84); // left -x
    if (bottom) this.quad([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], 0.6);
  }

  /** Chamfered box (44 tris) — the house shape language. */
  bevelBox(x: number, y: number, z: number, hx: number, hy: number, hz: number, b: number, bottom = true): void {
    b = Math.min(b, hx * 0.9, hy * 0.9, hz * 0.9);
    if (b <= 0.001) return this.box(x, y, z, hx, hy, hz, bottom);
    this.beginConvex(x, y, z);
    const P = (axis: number, sx: number, sy: number, sz: number): number[] => {
      if (axis === 0) return [x + sx * hx, y + sy * (hy - b), z + sz * (hz - b)];
      if (axis === 1) return [x + sx * (hx - b), y + sy * hy, z + sz * (hz - b)];
      return [x + sx * (hx - b), y + sy * (hy - b), z + sz * hz];
    };
    // main faces
    this.quad(P(1, -1, 1, 1), P(1, 1, 1, 1), P(1, 1, 1, -1), P(1, -1, 1, -1), 1.0);
    if (bottom) this.quad(P(1, -1, -1, -1), P(1, 1, -1, -1), P(1, 1, -1, 1), P(1, -1, -1, 1), 0.6);
    this.quad(P(2, -1, -1, 1), P(2, 1, -1, 1), P(2, 1, 1, 1), P(2, -1, 1, 1), 0.92);
    this.quad(P(2, 1, -1, -1), P(2, -1, -1, -1), P(2, -1, 1, -1), P(2, 1, 1, -1), 0.8);
    this.quad(P(0, 1, -1, 1), P(0, 1, -1, -1), P(0, 1, 1, -1), P(0, 1, 1, 1), 0.86);
    this.quad(P(0, -1, -1, -1), P(0, -1, -1, 1), P(0, -1, 1, 1), P(0, -1, 1, -1), 0.84);
    // edges & corners: build from convex fan per sign combo
    for (const sx of [-1, 1])
      for (const sy of [-1, 1]) {
        if (sy < 0 && !bottom) continue;
        // edge along z between x-face and y-face
        const a = P(0, sx, sy, 1), bb = P(0, sx, sy, -1), c = P(1, sx, sy, -1), d = P(1, sx, sy, 1);
        if (sx * sy > 0) this.quad(a, bb, c, d, sy > 0 ? 1.08 : 0.7);
        else this.quad(d, c, bb, a, sy > 0 ? 1.08 : 0.7);
      }
    for (const sy of [-1, 1])
      for (const sz of [-1, 1]) {
        if (sy < 0 && !bottom) continue;
        const a = P(1, -1, sy, sz), bb = P(1, 1, sy, sz), c = P(2, 1, sy, sz), d = P(2, -1, sy, sz);
        if (sy * sz > 0) this.quad(a, bb, c, d, sy > 0 ? 1.04 : 0.7);
        else this.quad(d, c, bb, a, sy > 0 ? 1.04 : 0.7);
      }
    for (const sx of [-1, 1])
      for (const sz of [-1, 1]) {
        const a = P(0, sx, -1, sz), bb = P(0, sx, 1, sz), c = P(2, sx, 1, sz), d = P(2, sx, -1, sz);
        if (sx * sz > 0) this.quad(a, bb, c, d, 0.95);
        else this.quad(d, c, bb, a, 0.95);
      }
    for (const sx of [-1, 1])
      for (const sy of [-1, 1])
        for (const sz of [-1, 1]) {
          if (sy < 0 && !bottom) continue;
          const a = P(0, sx, sy, sz), bb = P(1, sx, sy, sz), c = P(2, sx, sy, sz);
          this.tri(a[0], a[1], a[2], bb[0], bb[1], bb[2], c[0], c[1], c[2], 1.02);
        }
    this.convex = null;
  }

  beginConvex(x: number, y: number, z: number): void {
    this.convex = new THREE.Vector3(x, y, z);
    this.convexW.copy(this.convex).applyMatrix4(this.m);
  }
  endConvex(): void {
    this.convex = null;
  }

  /** Vertical prism (cylinder) with n sides, base at y0. */
  cylinder(x: number, y0: number, z: number, r0: number, r1: number, h: number, n = 6, caps = true): void {
    const y1 = y0 + h;
    this.beginConvex(x, y0 + h * 0.5, z);
    for (let i = 0; i < n; i++) {
      const a0 = (i / n) * Math.PI * 2;
      const a1 = ((i + 1) / n) * Math.PI * 2;
      const c0 = Math.cos(a0), s0 = Math.sin(a0), c1 = Math.cos(a1), s1 = Math.sin(a1);
      const shade = 0.82 + 0.18 * Math.max(0, (c0 + c1) * 0.5 * 0.4 + (s0 + s1) * 0.5 * 0.6);
      this.quad(
        [x + c0 * r0, y0, z + s0 * r0],
        [x + c1 * r0, y0, z + s1 * r0],
        [x + c1 * r1, y1, z + s1 * r1],
        [x + c0 * r1, y1, z + s0 * r1],
        shade,
      );
      // Winding: ensure outward; quad above is CCW when viewed from outside for our tri() normal convention
      if (caps && r1 > 0.001) this.tri(x, y1, z, x + c1 * r1, y1, z + s1 * r1, x + c0 * r1, y1, z + s0 * r1, 1.0);
      if (caps && r0 > 0.001) this.tri(x, y0, z, x + c0 * r0, y0, z + s0 * r0, x + c1 * r0, y0, z + s1 * r0, 0.6);
    }
    this.convex = null;
  }

  /** Low-poly blob (icosphere-ish, 1 subdivision) for foliage/rocks/heads. */
  blob(x: number, y: number, z: number, rx: number, ry: number, rz: number, wobble = 0.15, seed = 1): void {
    const ico = getIco();
    const p = ico.positions;
    const s = seed * 9301 + 49297;
    const w = (i: number) => 1 + (((Math.sin(i * 12.9898 + s) * 43758.5453) % 1) - 0.5) * 2 * wobble;
    this.beginConvex(x, y, z);
    for (let i = 0; i < ico.index.length; i += 3) {
      const ia = ico.index[i], ib = ico.index[i + 1], ic = ico.index[i + 2];
      const wa = w(ia), wb = w(ib), wc = w(ic);
      this.tri(
        x + p[ia * 3] * rx * wa, y + p[ia * 3 + 1] * ry * wa, z + p[ia * 3 + 2] * rz * wa,
        x + p[ib * 3] * rx * wb, y + p[ib * 3 + 1] * ry * wb, z + p[ib * 3 + 2] * rz * wb,
        x + p[ic * 3] * rx * wc, y + p[ic * 3 + 1] * ry * wc, z + p[ic * 3 + 2] * rz * wc,
        1,
      );
    }
    this.convex = null;
  }

  /** Gable roof prism along local x, ridge height h above y0. */
  gable(x: number, y0: number, z: number, hx: number, hz: number, h: number, overhang = 0.3): void {
    const X0 = x - hx - overhang, X1 = x + hx + overhang, Z0 = z - hz - overhang, Z1 = z + hz + overhang;
    const yr = y0 + h;
    this.quad([X0, y0, Z1], [X1, y0, Z1], [X1, yr, z], [X0, yr, z], 0.95);
    this.quad([X1, y0, Z0], [X0, y0, Z0], [X0, yr, z], [X1, yr, z], 0.78);
    // gable ends (inset to wall plane)
    const ex0 = x - hx, ex1 = x + hx;
    this.tri(ex1, y0, z + hz, ex1, y0, z - hz, ex1, yr, z, 0.86);
    this.tri(ex0, y0, z - hz, ex0, y0, z + hz, ex0, yr, z, 0.84);
  }

  /** Append another builder's data (already transformed). */
  append(o: MeshBuilder): void {
    for (const k of ['pos', 'nor', 'col', 'emit', 'skin'] as const) {
      const src = o[k];
      const dst = this[k];
      for (let i = 0; i < src.length; i++) dst.push(src[i]);
    }
  }

  toGeometry(withEmit = false, withSkin = false): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    if (withEmit) g.setAttribute('aEmit', new THREE.Float32BufferAttribute(this.emit, 1));
    if (withSkin) {
      const n = this.skin.length;
      const idx = new Uint16Array(n * 4);
      const wts = new Float32Array(n * 4);
      for (let i = 0; i < n; i++) {
        idx[i * 4] = this.skin[i];
        wts[i * 4] = 1;
      }
      g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(idx, 4));
      g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(wts, 4));
    }
    g.computeBoundingSphere();
    g.computeBoundingBox();
    return g;
  }

  /** Raw typed arrays (for transfer from workers). */
  toArrays(): { pos: Float32Array; nor: Float32Array; col: Float32Array; emit: Float32Array } {
    return {
      pos: new Float32Array(this.pos),
      nor: new Float32Array(this.nor),
      col: new Float32Array(this.col),
      emit: new Float32Array(this.emit),
    };
  }
}

let ico: { positions: number[]; index: number[] } | null = null;
function getIco() {
  if (ico) return ico;
  const g = new THREE.IcosahedronGeometry(1, 1);
  const merged = g.toNonIndexed();
  // build index over unique positions for consistent wobble per shared vertex
  const p = merged.getAttribute('position');
  const positions: number[] = [];
  const index: number[] = [];
  const map = new Map<string, number>();
  for (let i = 0; i < p.count; i++) {
    const k = `${p.getX(i).toFixed(4)},${p.getY(i).toFixed(4)},${p.getZ(i).toFixed(4)}`;
    let id = map.get(k);
    if (id === undefined) {
      id = positions.length / 3;
      positions.push(p.getX(i), p.getY(i), p.getZ(i));
      map.set(k, id);
    }
    index.push(id);
  }
  // fix winding so normals face outward with our tri() convention
  for (let i = 0; i < index.length; i += 3) {
    const t = index[i + 1];
    index[i + 1] = index[i + 2];
    index[i + 2] = t;
  }
  g.dispose();
  merged.dispose();
  ico = { positions, index };
  return ico;
}

export function arraysToGeometry(a: { pos: Float32Array; nor: Float32Array; col: Float32Array; emit?: Float32Array }): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(a.pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(a.nor, 3));
  g.setAttribute('color', new THREE.BufferAttribute(a.col, 3));
  if (a.emit) g.setAttribute('aEmit', new THREE.BufferAttribute(a.emit, 1));
  g.computeBoundingSphere();
  g.computeBoundingBox();
  return g;
}

export { tmpM3 };
