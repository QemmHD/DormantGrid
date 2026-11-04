// City mesher: turns WorldLayout data into chunk geometry (ground + buildings)
// and the whole-town far LOD mesh. Pure geometry; no scene management here.
import * as THREE from 'three';
import { CELL_SIZE, TILES, TILE_SIZE, Tile, hash2, valueNoise2, type BuildingDef, type WorldLayout } from '@dg/shared';
import { BUILDING_FLOOR_H, type PieceInfo } from '@dg/sim';
import { MeshBuilder } from '../render/geo';
import { PALETTES, type DistrictPalette } from '../content/palette';

const c1 = new THREE.Color();
const c2 = new THREE.Color();

export function paletteOf(layout: WorldLayout, district: number): DistrictPalette {
  return PALETTES[layout.districts[district]?.key ?? 'downtown'];
}

const GLASS = 0x1b232a;
const GLASS_LIT = 0x2a2a24;
const DOOR_DARK = 0x16130f;

/** Ground surface height including sidewalks/water (used by mesher and player). */
export function surfaceHeight(layout: WorldLayout, x: number, z: number, base: number): number {
  const tx = Math.floor(x / TILE_SIZE), tz = Math.floor(z / TILE_SIZE);
  if (tx < 0 || tz < 0 || tx >= TILES || tz >= TILES) return base;
  const t = layout.tiles[tz * TILES + tx];
  if (t === Tile.Sidewalk) return base + 0.12;
  if (t === Tile.Water) return base - 0.55;
  return base;
}

function tileColor(layout: WorldLayout, t: number, d: number, x: number, z: number, out: THREE.Color): THREE.Color {
  const p = paletteOf(layout, d);
  const n = valueNoise2(layout.seed, x * 0.11, z * 0.11);
  const n2 = valueNoise2(layout.seed + 7, x * 0.6, z * 0.6);
  switch (t) {
    case Tile.Road:
    case Tile.Bridge:
      out.setHex(p.road).multiplyScalar(0.9 + n2 * 0.18);
      break;
    case Tile.Sidewalk:
      out.setHex(p.trim).lerp(c2.setHex(0x80807a), 0.6).multiplyScalar(0.62 + n2 * 0.08);
      break;
    case Tile.Lot:
      out.setHex(p.ground).lerp(c2.setHex(p.road), 0.35).multiplyScalar(0.92 + n * 0.16);
      break;
    case Tile.Dirt:
      out.setHex(0x6a5a46).multiplyScalar(0.85 + n * 0.25);
      break;
    case Tile.Field:
      out.setHex(0x6e6a44).lerp(c2.setHex(0x5a4a36), (Math.floor(z / 2) % 2) * 0.55).multiplyScalar(0.9 + n * 0.15);
      break;
    case Tile.Water:
      out.setHex(0x2c3a40).multiplyScalar(0.9 + n2 * 0.1);
      break;
    case Tile.Rail:
      out.setHex(0x5a5248).multiplyScalar(0.85 + n2 * 0.2);
      break;
    case Tile.Plaza:
      out.setHex(p.trim).lerp(c2.setHex(p.road), 0.45).multiplyScalar(0.72 + ((Math.floor(x / 2) + Math.floor(z / 2)) % 2) * 0.05);
      break;
    case Tile.Forest:
      out.setHex(p.foliage).lerp(c2.setHex(0x3a3428), 0.45).multiplyScalar(0.8 + n * 0.25);
      break;
    default:
      out.setHex(p.ground).lerp(c2.setHex(p.foliage), 0.35 + n * 0.4).multiplyScalar(0.85 + n2 * 0.2);
  }
  return out.multiplyScalar(1.3);
}

/** Ground mesh for one cell: one quad per 4 m tile with curbs, water banks, rails and road paint. */
export function buildGround(layout: WorldLayout, cx: number, cz: number, height: (x: number, z: number) => number): MeshBuilder {
  const b = new MeshBuilder();
  const per = CELL_SIZE / TILE_SIZE;
  const tileAt = (tx: number, tz: number) => (tx < 0 || tz < 0 || tx >= TILES || tz >= TILES ? Tile.Grass : layout.tiles[tz * TILES + tx]);
  const lift = (t: number) => (t === Tile.Sidewalk ? 0.12 : t === Tile.Water ? -0.55 : 0);
  for (let j = 0; j < per; j++)
    for (let i = 0; i < per; i++) {
      const tx = cx * per + i, tz = cz * per + j;
      const t = tileAt(tx, tz);
      const d = layout.districtMap[tz * TILES + tx];
      const x0 = tx * TILE_SIZE, z0 = tz * TILE_SIZE, x1 = x0 + TILE_SIZE, z1 = z0 + TILE_SIZE;
      const l = lift(t);
      const h00 = height(x0, z0) + l, h10 = height(x1, z0) + l, h01 = height(x0, z1) + l, h11 = height(x1, z1) + l;
      b.setColor(tileColor(layout, t, d, x0 + 2, z0 + 2, c1));
      // split tiles in 2x2 for subtle color variation on grass/forest
      if (t === Tile.Grass || t === Tile.Forest || t === Tile.Field) {
        const hm = (h00 + h10 + h01 + h11) / 4;
        const xm = x0 + 2, zm = z0 + 2;
        const hx0 = (h00 + h01) / 2, hx1 = (h10 + h11) / 2, hz0 = (h00 + h10) / 2, hz1 = (h01 + h11) / 2;
        const quads: [number[], number[], number[], number[]][] = [
          [[x0, hx0, zm], [xm, hm, zm], [xm, hz0, z0], [x0, h00, z0]],
          [[xm, hm, zm], [x1, hx1, zm], [x1, h10, z0], [xm, hz0, z0]],
          [[x0, h01, z1], [xm, hz1, z1], [xm, hm, zm], [x0, hx0, zm]],
          [[xm, hz1, z1], [x1, h11, z1], [x1, hx1, zm], [xm, hm, zm]],
        ];
        quads.forEach((q, k) => {
          const v = valueNoise2(layout.seed + 3, (x0 + (k % 2) * 2) * 0.45, (z0 + (k >> 1) * 2) * 0.45);
          b.setColor(c2.copy(c1).multiplyScalar(0.9 + v * 0.2));
          b.quad(q[0], q[1], q[2], q[3]);
        });
      } else {
        b.quad([x0, h01, z1], [x1, h11, z1], [x1, h10, z0], [x0, h00, z0]);
      }
      // ground clutter: grass tufts and pebbles (static, merged)
      if (t === Tile.Grass || t === Tile.Forest || t === Tile.Lot || t === Tile.Field) {
        const pal = paletteOf(layout, d);
        const nTufts = t === Tile.Lot ? 1 : 3;
        for (let k = 0; k < nTufts; k++) {
          const hsh = hash2(hash2(tx, tz), k);
          if (t === Tile.Lot && hsh % 3 !== 0) continue;
          const ox = x0 + ((hsh & 255) / 255) * 4, oz = z0 + (((hsh >> 8) & 255) / 255) * 4;
          const oy = height(ox, oz) + l;
          const hh = 0.25 + ((hsh >> 16) & 15) / 40;
          const a = ((hsh >> 20) & 63) / 10;
          b.setColor(c2.setHex(pal.foliage).multiplyScalar(0.75 + ((hsh >> 4) & 7) / 20));
          for (let bl = 0; bl < 3; bl++) {
            const ang = a + bl * 2.1;
            const dx = Math.cos(ang) * 0.14, dz = Math.sin(ang) * 0.14;
            const tipx = ox + Math.cos(ang + 0.5) * 0.12, tipz = oz + Math.sin(ang + 0.5) * 0.12;
            b.tri(ox - dx, oy, oz - dz, ox + dx, oy, oz + dz, tipx, oy + hh, tipz, 1.1);
            b.tri(ox + dx, oy, oz + dz, ox - dx, oy, oz - dz, tipx, oy + hh, tipz, 0.9);
          }
          if ((hsh & 7) === 0) {
            b.setColor(0x7a766c);
            b.box(ox + 0.4, oy + 0.04, oz - 0.3, 0.09, 0.05, 0.07);
          }
        }
      }
      // curbs / banks: vertical faces where neighbor is lower
      const edges: [number, number, number[], number[]][] = [
        [1, 0, [x1, 0, z1], [x1, 0, z0]],
        [-1, 0, [x0, 0, z0], [x0, 0, z1]],
        [0, 1, [x0, 0, z1], [x1, 0, z1]],
        [0, -1, [x1, 0, z0], [x0, 0, z0]],
      ];
      for (const [dx, dz, a, c] of edges) {
        const nt = tileAt(tx + dx, tz + dz);
        const nl = lift(nt);
        if (nl < l - 0.01) {
          const ya = height(a[0], a[2]);
          const yc = height(c[0], c[2]);
          b.setColor(t === Tile.Sidewalk ? c2.setHex(0x8a8a84) : c2.setHex(0x4a4436));
          b.quad([a[0], ya + nl, a[2]], [c[0], yc + nl, c[2]], [c[0], yc + l, c[2]], [a[0], ya + l, a[2]], 0.8);
        }
      }
      // rails: two steel rails + sleepers along x
      if (t === Tile.Rail) {
        b.setColor(0x4a3a2c);
        for (let s = 0; s < 4; s++) b.box(x0 + 0.5 + s, 0.05, z0 + 2, 0.12, 0.05, 1.3);
        b.setColor(0x7a7a78);
        b.box(x0 + 2, 0.14, z0 + 1.3, 2, 0.04, 0.04);
        b.box(x0 + 2, 0.14, z0 + 2.7, 2, 0.04, 0.04);
      }
      // road paint: center dashes on straight road runs
      if (t === Tile.Road) {
        const ew = tileAt(tx - 1, tz) === Tile.Road && tileAt(tx + 1, tz) === Tile.Road;
        const ns = tileAt(tx, tz - 1) === Tile.Road && tileAt(tx, tz + 1) === Tile.Road;
        const n = tileAt(tx, tz + 1) !== Tile.Road && tileAt(tx, tz - 1) === Tile.Road;
        const w = tileAt(tx + 1, tz) !== Tile.Road && tileAt(tx - 1, tz) === Tile.Road;
        const rnd = hash2(tx, tz) % 100;
        if (rnd > 12) {
          b.setColor(0x9a9480);
          if (ew && !ns && n && tx % 2 === 0) b.box(x0 + 2, 0.012, z1 - 0.02, 1.1, 0.01, 0.07);
          if (ns && !ew && w && tz % 2 === 0) b.box(x1 - 0.02, 0.012, z0 + 2, 0.07, 0.01, 1.1);
        }
        if (rnd < 6) {
          // pothole / crack patch
          b.setColor(c2.setHex(paletteOf(layout, d).road).multiplyScalar(0.7));
          b.box(x0 + 1 + (rnd % 3) * 0.6, 0.008, z0 + 1.5, 0.6, 0.006, 0.4);
        }
      }
    }
  return b;
}

const sideDir = (side: number): [number, number] =>
  side === 0 ? [0, 1] : side === 1 ? [0, -1] : side === 2 ? [1, 0] : [-1, 0];

function wallColor(b: BuildingDef, p: DistrictPalette, out: THREE.Color): THREE.Color {
  const v = b.variant % 3;
  out.setHex(v === 0 ? p.wallA : v === 1 ? p.wallB : p.wallC);
  // grime with decay
  out.lerp(c2.setHex(0x3e3a34), b.decay * 0.28);
  return out;
}

/**
 * Emit a building into `mb` (world space). `removed` = removed piece indices.
 * lod=true: cheap silhouette (single box + roof) for mid distance.
 */
export function meshBuilding(mb: MeshBuilder, b: BuildingDef, pieces: readonly PieceInfo[], removed: ReadonlySet<number>, p: DistrictPalette, windowLit: number): void {
  const H = BUILDING_FLOOR_H;
  mb.pushTRS(b.x, 0, b.z, (b.rot * Math.PI) / 2);
  const wc = wallColor(b, p, new THREE.Color());
  const trim = new THREE.Color(p.trim).lerp(c2.setHex(0x3e3a34), b.decay * 0.3);
  const rng = (i: number) => (hash2(b.variant, i) % 1000) / 1000;
  const shop = b.lot === 'shop' || b.lot === 'clinic';

  for (const pc of pieces) {
    if (removed.has(pc.index)) continue;
    const [x0, y0, z0] = pc.min;
    const [x1, y1, z1] = pc.max;
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, cz = (z0 + z1) / 2;
    const hx = (x1 - x0) / 2, hy = (y1 - y0) / 2, hz = (z1 - z0) / 2;
    const jit = 0.94 + rng(pc.index) * 0.1;
    switch (pc.kind) {
      case 'wall':
      case 'window':
      case 'door': {
        const [nx, nz] = sideDir(pc.side);
        const alongX = nz !== 0;
        const len = alongX ? x1 - x0 : z1 - z0;
        const u0 = alongX ? x0 : z0;
        // helper: box in (u, y, n) wall space
        const seg = (ua: number, ub: number, ya: number, yb: number, outset = 0, inset = 0) => {
          if (alongX) {
            const za = z0 - (nz < 0 ? outset : -inset), zb = z1 + (nz > 0 ? outset : -inset);
            mb.box((ua + ub) / 2, (ya + yb) / 2, (za + zb) / 2, (ub - ua) / 2, (yb - ya) / 2, (zb - za) / 2);
          } else {
            const xa = x0 - (nx < 0 ? outset : -inset), xb = x1 + (nx > 0 ? outset : -inset);
            mb.box((xa + xb) / 2, (ya + yb) / 2, (ua + ub) / 2, (xb - xa) / 2, (yb - ya) / 2, (ub - ua) / 2);
          }
        };
        mb.setColor(c1.copy(wc).multiplyScalar(jit * (pc.floor === 0 ? 0.92 : 1)));
        if (pc.kind === 'wall') {
          seg(u0, u0 + len, y0, y1);
        } else if (pc.kind === 'window') {
          const big = shop && pc.floor === 0;
          const sill = big ? 0.5 : 1.0;
          const head = big ? 2.9 : 2.4;
          const pier = big ? 0.35 : Math.max(0.5, (len - 1.6) / 2);
          seg(u0, u0 + len, y0, y0 + sill);
          seg(u0, u0 + len, y0 + head, y1);
          seg(u0, u0 + pier, y0 + sill, y0 + head);
          seg(u0 + len - pier, u0 + len, y0 + sill, y0 + head);
          // glass (recessed) + sill trim
          const lit = rng(pc.index + 99) < windowLit ? 0.6 + rng(pc.index + 7) * 0.4 : 0;
          mb.setColor(lit > 0 ? GLASS_LIT : GLASS).setEmissive(lit);
          seg(u0 + pier, u0 + len - pier, y0 + sill, y0 + head, -0.12, 0.12);
          mb.setEmissive(0);
          mb.setColor(trim);
          seg(u0 + pier - 0.06, u0 + len - pier + 0.06, y0 + sill - 0.08, y0 + sill, 0.06);
          // occasional boarded window in ruins
          if (b.decay > 0.45 && rng(pc.index + 3) < 0.35) {
            mb.setColor(0x6a5a44);
            seg(u0 + pier, u0 + len - pier, y0 + sill + 0.3, y0 + sill + 0.55, 0.03);
            seg(u0 + pier, u0 + len - pier, y0 + sill + 0.9, y0 + sill + 1.15, 0.03);
          }
        } else {
          const dw = 1.3;
          const a = u0 + (len - dw) / 2;
          seg(u0, a, y0, y1);
          seg(a + dw, u0 + len, y0, y1);
          seg(a, a + dw, y0 + 2.4, y1);
          mb.setColor(DOOR_DARK);
          seg(a, a + dw, y0 + 0.2, y0 + 2.4, -0.25, 0.25);
          mb.setColor(trim);
          seg(a - 0.1, a + dw + 0.1, y0 + 2.4, y0 + 2.55, 0.07);
          if (shop) {
            // awning
            mb.setColor(c1.setHex(p.accent).multiplyScalar(0.85));
            if (alongX) mb.box(u0 + len / 2, y0 + 2.95, z1 + 0.55 * nz, len / 2 + 1.5, 0.06, 0.6);
            else mb.box(x1 + 0.55 * nx, y0 + 2.95, u0 + len / 2, 0.6, 0.06, len / 2 + 1.5);
          }
        }
        // cornice band at top of each floor (outer face)
        mb.setColor(trim);
        seg(u0, u0 + len, y1 - 0.14, y1, 0.07);
        if (pc.floor === 0) {
          mb.setColor(c1.copy(wc).multiplyScalar(0.62));
          seg(u0, u0 + len, y0, y0 + 0.35, 0.04);
        }
        break;
      }
      case 'beam':
        mb.setColor(c1.copy(trim).multiplyScalar(0.85));
        mb.box(cx, cy, cz, hx + 0.02, hy, hz + 0.02);
        break;
      case 'floor':
        mb.setColor(pc.floor === 0 ? 0x4a443c : c1.copy(wc).multiplyScalar(0.8));
        mb.box(cx, cy, cz, hx, hy, hz, pc.floor > 0);
        break;
      case 'roof': {
        const roofCol = new THREE.Color(p.roof).multiplyScalar(jit);
        if (b.roof === 'gable') {
          const along = hx >= hz;
          mb.setColor(roofCol);
          if (along) mb.gable(cx, y0, cz, hx, hz, y1 - y0, 0.35);
          else {
            mb.pushTRS(cx, 0, cz, Math.PI / 2);
            mb.gable(0, y0, 0, hz, hx, y1 - y0, 0.35);
            mb.pop();
          }
          // chimney
          if (rng(5) < 0.6) {
            mb.setColor(c1.copy(wc).multiplyScalar(0.8));
            mb.box(cx + hx * 0.45, y1 - 0.2, cz + hz * 0.2, 0.3, (y1 - y0) * 0.5, 0.3);
          }
        } else if (b.roof === 'sawtooth') {
          const teeth = Math.max(2, Math.round((hx * 2) / 4));
          const tw = (hx * 2) / teeth;
          for (let i = 0; i < teeth; i++) {
            const a = x0 + i * tw;
            mb.setColor(roofCol);
            mb.quad([a, y0, z1], [a + tw, y0, z1], [a + tw, y1, z0 + 0.01], [a, y1, z0 + 0.01], 0.95);
            mb.quad([a + tw, y0, z0], [a + tw, y1, z0], [a + tw, y1, z1], [a + tw, y0, z1], 0.85);
            mb.setColor(GLASS).setEmissive(windowLit > 0.5 ? 0.4 : 0);
            mb.quad([a + tw, y0, z0], [a, y0, z0], [a, y1, z0], [a + tw, y1, z0], 0.9);
            mb.setEmissive(0);
          }
        } else {
          mb.setColor(c1.copy(roofCol).multiplyScalar(0.9));
          mb.box(cx, y0 + 0.1, cz, hx, 0.1, hz);
          mb.setColor(trim);
          const ph = 0.55;
          mb.box(cx, y0 + ph / 2, z1 - 0.12, hx, ph / 2, 0.12);
          mb.box(cx, y0 + ph / 2, z0 + 0.12, hx, ph / 2, 0.12);
          mb.box(x1 - 0.12, y0 + ph / 2, cz, 0.12, ph / 2, hz - 0.24);
          mb.box(x0 + 0.12, y0 + ph / 2, cz, 0.12, ph / 2, hz - 0.24);
          // rooftop clutter
          const units = 1 + Math.floor(rng(11) * 3);
          for (let i = 0; i < units; i++) {
            const ux = cx + (rng(20 + i) - 0.5) * (hx * 2 - 3), uz = cz + (rng(30 + i) - 0.5) * (hz * 2 - 3);
            if (rng(40 + i) < 0.35 && b.floors >= 3) {
              mb.setColor(0x5a4a3a);
              mb.cylinder(ux, y0 + 1.6, uz, 1.0, 1.0, 1.6, 8);
              mb.setColor(0x3a3430);
              for (const sx of [-0.6, 0.6]) for (const sz of [-0.6, 0.6]) mb.box(ux + sx, y0 + 0.8, uz + sz, 0.06, 0.8, 0.06);
              mb.setColor(0x4a3a2e);
              mb.cylinder(ux, y0 + 3.2, uz, 1.0, 0, 0.5, 8);
            } else {
              mb.setColor(0x8a8a86);
              mb.bevelBox(ux, y0 + 0.65, uz, 0.6, 0.45, 0.5, 0.05);
              mb.setColor(0x3a3e40);
              mb.cylinder(ux, y0 + 1.1, uz, 0.3, 0.3, 0.03, 8, false);
            }
          }
        }
        break;
      }
      case 'pipe':
        mb.setColor(0x6a6e72);
        mb.cylinder(cx, y0, cz, 0.16, 0.16, y1 - y0, 6);
        break;
      case 'fixture':
        mb.setColor(0xe8e0c8).setEmissive(windowLit > 0.5 ? 1 : 0);
        mb.box(cx, cy, cz, hx, hy, hz);
        mb.setEmissive(0);
        break;
      default:
        break;
    }
  }
  // stoop/steps at the door for houses
  if (b.lot === 'house' || b.lot === 'apartment') {
    mb.setColor(c1.setHex(p.trim).multiplyScalar(0.7));
    mb.box(0, 0.1, b.d / 2 + 0.6, 1.0, 0.1, 0.6);
  }
  mb.pop();
  void H;
}

/** Whole-town far mesh: ground at 16 m + building blocks + tree cones. aCenter feeds the loaded-cell collapse. */
export function buildFarMesh(layout: WorldLayout, height: (x: number, z: number) => number): { geo: THREE.BufferGeometry } {
  const mb = new MeshBuilder();
  const centers: number[] = [];
  const pushCenter = (from: number, x: number, z: number) => {
    const n = mb.vertexCount - from;
    for (let i = 0; i < n; i++) centers.push(x, z);
  };
  const G = 16;
  const steps = layout.size / G;
  for (let j = 0; j < steps; j++)
    for (let i = 0; i < steps; i++) {
      const x0 = i * G, z0 = j * G, x1 = x0 + G, z1 = z0 + G;
      const tx = Math.min(TILES - 1, Math.floor((x0 + 8) / TILE_SIZE)), tz = Math.min(TILES - 1, Math.floor((z0 + 8) / TILE_SIZE));
      const t = layout.tiles[tz * TILES + tx];
      const d = layout.districtMap[tz * TILES + tx];
      const from = mb.vertexCount;
      mb.setColor(tileColor(layout, t, d, x0 + 8, z0 + 8, c1));
      const l = t === Tile.Water ? -0.55 : 0;
      mb.quad([x0, height(x0, z1) + l - 0.03, z1], [x1, height(x1, z1) + l - 0.03, z1], [x1, height(x1, z0) + l - 0.03, z0], [x0, height(x0, z0) + l - 0.03, z0]);
      pushCenter(from, x0 + 8, z0 + 8);
    }
  for (const b of layout.buildings) {
    const p = paletteOf(layout, b.district);
    const from = mb.vertexCount;
    const odd = b.rot % 2 === 1;
    const hx = (odd ? b.d : b.w) / 2, hz = (odd ? b.w : b.d) / 2;
    const h = b.floors * BUILDING_FLOOR_H;
    mb.setColor(wallColor(b, p, c1));
    mb.box(b.x, h / 2, b.z, hx, h / 2, hz);
    // window rows as faint emissive bands
    mb.setColor(GLASS).setEmissive(0.5);
    for (let f = 0; f < b.floors; f++) {
      const y = f * BUILDING_FLOOR_H + 1.7;
      mb.box(b.x, y, b.z, hx + 0.02, 0.5, hz + 0.02);
    }
    mb.setEmissive(0);
    mb.setColor(p.roof);
    if (b.roof === 'gable') {
      if (hx >= hz) mb.gable(b.x, h, b.z, hx, hz, Math.min(hx, hz) * 0.7, 0.3);
      else {
        mb.pushTRS(b.x, 0, b.z, Math.PI / 2);
        mb.gable(0, h, 0, hz, hx, Math.min(hx, hz) * 0.7, 0.3);
        mb.pop();
      }
    } else mb.box(b.x, h + 0.2, b.z, hx, 0.2, hz);
    pushCenter(from, b.x, b.z);
  }
  for (const pr of layout.props) {
    if (pr.kind !== 'tree' && pr.kind !== 'pine') continue;
    const from = mb.vertexCount;
    const p = paletteOf(layout, pr.district);
    mb.setColor(c1.setHex(p.foliage).multiplyScalar(pr.kind === 'pine' ? 0.75 : 0.95));
    const s = pr.scale;
    if (pr.kind === 'pine') mb.cylinder(pr.x, pr.y + 0.8 * s, pr.z, 1.5 * s, 0, 4.6 * s, 5, false);
    else mb.cylinder(pr.x, pr.y + 1.6 * s, pr.z, 1.6 * s, 0.9 * s, 2.6 * s, 5, true);
    pushCenter(from, pr.x, pr.z);
  }
  const geo = mb.toGeometry(true);
  geo.setAttribute('aCenter', new THREE.Float32BufferAttribute(centers, 2));
  return { geo };
}
