// Player-built base: renders placed pieces (one merged mesh, rebuilt on change),
// owns their colliders, and drives the build-mode ghost preview.
import * as THREE from 'three';
import type { CropSave, PlacedPiece } from '@dg/shared';
import { getPiece, cropStage, type PieceDef } from '@dg/sim';
import { MeshBuilder } from '../render/geo';
import { makeChunkMaterial } from '../render/materials';
import { propShape } from '../render/props';
import type { Collider, CollisionWorld } from './collision';

export const FOUND_H = 0.4;
export const STOREY_H = 3.25;

const TIER_COL = [
  [0x7a6e62, 0x8a5a44, 0x5e6266], // scrap: rust, rust-red, steel
  [0xa8835a, 0x8a6a48, 0x6a5038], // timber
  [0x9a6a54, 0x8a8478, 0x7a5a4a], // brick/concrete
  [0x8a8e90, 0x5a6066, 0x39e6d0], // reinforced (+ grid accent trim)
];

/** World Y of a piece's base given terrain height and piece level. */
export function pieceBaseY(def: PieceDef, level: number, terrain: number, onFoundation: boolean): number {
  if (def.kind === 'foundation') return terrain + level * STOREY_H;
  if (def.kind === 'floor' || def.kind === 'roof') return terrain + FOUND_H + level * STOREY_H - 0.25;
  if (level === 0 && !onFoundation) return terrain;
  return terrain + FOUND_H + level * STOREY_H;
}

export function levelFromY(y: number): number {
  return Math.max(0, Math.round(y / 3));
}

/** Emit one piece into a builder in piece-local space (origin at base center, facing +z). */
export function emitPiece(b: MeshBuilder, def: PieceDef, tier: number, crop?: CropSave | null, hour = 0): void {
  const [c0, c1, c2] = TIER_COL[Math.max(0, Math.min(3, tier))];
  const { w, h, d } = def.size;
  const plankLines = (hw: number, hh: number, hz: number, y0: number, n: number) => {
    b.setColor(new THREE.Color(c1).multiplyScalar(0.8));
    for (let i = 1; i < n; i++) b.box(0, y0 + (i / n) * hh * 2, hz + 0.005, hw, 0.015, 0.005);
  };
  switch (def.id) {
    case 'foundation':
      b.setColor(c0);
      b.bevelBox(0, -0.3 + (h + 0.6) / 2, 0, w / 2, (h + 0.6) / 2, d / 2, 0.08);
      b.setColor(new THREE.Color(c1).multiplyScalar(0.9));
      b.box(0, h + 0.005, 0, w / 2 - 0.15, 0.005, d / 2 - 0.15);
      if (tier === 3) {
        b.setColor(c2).setEmissive(2.5);
        b.box(0, h - 0.06, d / 2 + 0.01, w / 2 - 0.2, 0.02, 0.01);
        b.setEmissive(0);
      }
      return;
    case 'wall':
    case 'window':
    case 'doorway': {
      const hw = w / 2, t = d / 2;
      b.setColor(c0);
      if (def.id === 'wall') b.box(0, h / 2, 0, hw, h / 2, t);
      else if (def.id === 'window') {
        b.box(0, 0.5, 0, hw, 0.5, t);
        b.box(0, h - 0.35, 0, hw, 0.35, t);
        b.box(-hw + 0.7, 1.82, 0, 0.7, 0.82, t);
        b.box(hw - 0.7, 1.82, 0, 0.7, 0.82, t);
        b.setColor(0x26323a).setEmissive(0.3);
        b.box(0, 1.82, 0, 1.3, 0.82, 0.03);
        b.setEmissive(0);
        b.setColor(c1);
        b.box(0, 1.0, 0, 1.4, 0.05, t + 0.06);
      } else {
        b.box(-hw + 1.2, h / 2, 0, 1.2, h / 2, t);
        b.box(hw - 1.2, h / 2, 0, 1.2, h / 2, t);
        b.box(0, h - 0.3, 0, 0.8, 0.3, t);
        b.setColor(c1);
        b.box(0, h - 0.62, 0, 0.9, 0.04, t + 0.04);
      }
      if (tier <= 1) plankLines(hw, h / 2, t, 0, 6);
      b.setColor(c1);
      b.box(-hw + 0.08, h / 2, 0, 0.08, h / 2, t + 0.04);
      b.box(hw - 0.08, h / 2, 0, 0.08, h / 2, t + 0.04);
      if (tier === 0) {
        // scrap patches
        b.setColor(c2);
        b.box(-0.8, 1.2, t + 0.02, 0.5, 0.4, 0.02);
        b.box(0.9, 2.2, t + 0.02, 0.4, 0.3, 0.02);
      }
      if (tier === 3) {
        b.setColor(c2).setEmissive(2.5);
        b.box(0, h - 0.1, t + 0.02, hw - 0.2, 0.025, 0.01);
        b.setEmissive(0);
      }
      return;
    }
    case 'floor':
      b.setColor(c0);
      b.box(0, h / 2, 0, w / 2, h / 2, d / 2, true);
      return;
    case 'roof':
      b.setColor(c0);
      b.bevelBox(0, h / 2, 0, w / 2 + 0.2, h / 2, d / 2 + 0.2, 0.06);
      b.setColor(new THREE.Color(c1).multiplyScalar(0.85));
      for (let i = -1; i <= 1; i++) b.box(i * 1.3, h + 0.02, 0, 0.05, 0.03, d / 2 + 0.2);
      return;
    case 'stairs': {
      b.setColor(c0);
      const steps = 10;
      for (let i = 0; i < steps; i++) {
        const sz = d / steps;
        b.box(0, ((i + 0.5) * h) / steps / 2 + 0.0, -d / 2 + (i + 0.5) * sz, w / 2 - 0.4, ((i + 1) * h) / steps / 2, sz / 2);
      }
      return;
    }
    case 'fence':
    case 'gate': {
      b.setColor(c0);
      for (let x = -w / 2 + 0.1; x <= w / 2; x += 0.5) b.box(x, h / 2, 0, 0.06, h / 2, 0.06);
      b.setColor(c1);
      b.box(0, h * 0.3, 0, w / 2, 0.05, 0.04);
      b.box(0, h * 0.8, 0, w / 2, 0.05, 0.04);
      if (def.id === 'gate') {
        b.setColor(c2);
        b.box(0, h * 0.55, 0.05, 0.08, h * 0.4, 0.02);
      }
      return;
    }
    case 'campfire':
      b.setColor(0x6a6660);
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        b.bevelBox(Math.cos(a) * 0.55, 0.1, Math.sin(a) * 0.55, 0.14, 0.1, 0.12, 0.03);
      }
      b.setColor(0x5a3a26);
      b.pushTRS(0, 0.15, 0, 0.4).push(new THREE.Matrix4().makeRotationZ(0.3));
      b.box(0, 0, 0, 0.45, 0.06, 0.06);
      b.pop().pop();
      b.pushTRS(0, 0.15, 0, -0.9).push(new THREE.Matrix4().makeRotationZ(-0.3));
      b.box(0, 0, 0, 0.45, 0.06, 0.06);
      b.pop().pop();
      b.setColor(0xffa040).setEmissive(1);
      b.cylinder(0, 0.1, 0, 0.22, 0, 0.5, 5);
      b.setEmissive(0);
      return;
    case 'workbench1':
    case 'workbench2':
    case 'workbench3':
    case 'kitchen':
    case 'chemlab': {
      const top = def.id === 'kitchen' ? 0x8a8a86 : def.id === 'chemlab' ? 0x7a8a8a : 0x9a7652;
      b.setColor(top);
      b.bevelBox(0, h - 0.05, 0, w / 2, 0.05, d / 2, 0.02);
      b.setColor(0x4a4038);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box(sx * (w / 2 - 0.1), (h - 0.1) / 2, sz * (d / 2 - 0.1), 0.05, (h - 0.1) / 2, 0.05);
      b.box(0, 0.25, 0, w / 2 - 0.1, 0.02, d / 2 - 0.1);
      if (def.id === 'workbench1') {
        b.setColor(0x5a5e62);
        b.bevelBox(w / 2 - 0.3, h + 0.1, 0, 0.12, 0.1, 0.15, 0.02);
        b.setColor(0x8a6a48);
        b.box(-0.3, h + 0.03, 0.1, 0.3, 0.03, 0.06);
      } else if (def.id === 'workbench2') {
        b.setColor(0x4a5258);
        b.cylinder(-0.5, h, 0, 0.12, 0.12, 0.6, 6);
        b.bevelBox(-0.5, h + 0.65, 0.1, 0.12, 0.1, 0.22, 0.03);
      } else if (def.id === 'workbench3') {
        b.setColor(0x3a4044);
        b.bevelBox(0, h + 0.35, -0.3, 0.6, 0.3, 0.12, 0.04);
        b.setColor(0x39e6d0).setEmissive(2.5);
        b.box(0, h + 0.35, -0.17, 0.5, 0.2, 0.01);
        b.setEmissive(0);
      } else if (def.id === 'kitchen') {
        b.setColor(0x2a2a2a);
        b.cylinder(-0.4, h, 0, 0.18, 0.18, 0.02, 8);
        b.cylinder(0.3, h, 0, 0.18, 0.18, 0.02, 8);
        b.setColor(0x6a6e72);
        b.cylinder(0.3, h + 0.02, 0, 0.16, 0.14, 0.2, 8);
      } else {
        b.setColor(0x9ad0c8).setEmissive(0.5);
        for (let i = 0; i < 3; i++) b.cylinder(-0.5 + i * 0.35, h, 0, 0.06, 0.06, 0.25, 6);
        b.setEmissive(0);
      }
      return;
    }
    case 'bed':
      b.append(fromShape('bed'));
      return;
    case 'storage':
      b.setColor(0x9a7652);
      b.bevelBox(0, h / 2, 0, w / 2, h / 2, d / 2, 0.04);
      b.setColor(0x5a4a3a);
      b.box(0, h * 0.75, d / 2 + 0.01, w / 2 - 0.05, 0.04, 0.01);
      b.setColor(0x8a8e92);
      b.box(0, h * 0.55, d / 2 + 0.02, 0.08, 0.06, 0.02);
      return;
    case 'farm_plot': {
      b.setColor(0x4a3a2a);
      b.box(0, 0.12, 0, w / 2, 0.12, d / 2);
      b.setColor(0x3a2c20);
      for (let i = -1; i <= 1; i++) b.box(i * 0.95, 0.25, 0, 0.28, 0.02, d / 2 - 0.15);
      b.setColor(0x7a6a50);
      b.box(0, 0.2, d / 2, w / 2, 0.12, 0.05);
      b.box(0, 0.2, -d / 2, w / 2, 0.12, 0.05);
      b.box(w / 2, 0.2, 0, 0.05, 0.12, d / 2);
      b.box(-w / 2, 0.2, 0, 0.05, 0.12, d / 2);
      if (crop) emitCrop(b, crop, hour);
      return;
    }
    case 'rain_collector':
      b.setColor(0x4a6a7a);
      b.cylinder(0, 0, 0, 0.4, 0.4, 0.9, 10);
      b.setColor(0x7a8a6a);
      b.pushTRS(0, 1.3, 0, 0);
      b.cylinder(0, 0, 0, 0.7, 0.2, 0.25, 8);
      b.pop();
      b.setColor(0x4a4038);
      for (const sx of [-0.5, 0.5]) b.box(sx, 0.75, 0, 0.03, 0.75, 0.03);
      return;
    case 'coop':
    case 'pen':
    case 'smoker':
      b.setColor(def.id === 'smoker' ? 0x8a5a48 : 0x8a6a48);
      b.bevelBox(0, h / 2, 0, w / 2, h / 2, d / 2, 0.05);
      b.setColor(0x4a3a2c);
      if (def.id === 'coop') b.gable(0, h, 0, w / 2, d / 2, 0.6, 0.15);
      else b.box(0, h + 0.05, 0, w / 2 + 0.1, 0.05, d / 2 + 0.1);
      if (def.id === 'smoker') {
        b.setColor(0x5a5e62);
        b.cylinder(0.3, h, 0.3, 0.12, 0.12, 0.6, 6);
      }
      return;
    case 'alarm':
      b.setColor(0x4a4038);
      b.box(0, h / 2, 0, 0.06, h / 2, 0.06);
      b.setColor(0xc8a040);
      b.cylinder(0, h - 0.5, 0, 0.25, 0.12, 0.35, 8);
      return;
    case 'turret':
      b.setColor(0x5a5e62);
      b.cylinder(0, 0, 0, 0.35, 0.3, 0.9, 8);
      b.bevelBox(0, 1.15, 0, 0.3, 0.2, 0.35, 0.05);
      b.setColor(0x2a2a2a);
      b.cylinder(0, 1.15, 0.5, 0.05, 0.05, 0.02, 6);
      b.box(0, 1.15, 0.6, 0.04, 0.04, 0.3);
      b.setColor(0x39e6d0).setEmissive(2.5);
      b.box(0, 1.25, 0.36, 0.08, 0.03, 0.01);
      b.setEmissive(0);
      return;
    case 'floodlight':
      b.setColor(0x4a4e52);
      b.cylinder(0, 0, 0, 0.08, 0.06, h, 6);
      b.setColor(0xfff0c0).setEmissive(1);
      b.bevelBox(0, h, 0.1, 0.25, 0.15, 0.1, 0.03);
      b.setEmissive(0);
      return;
    default: {
      // traps & barricades: low spiky shapes
      b.setColor(def.kind === 'trap' ? 0x6a6e72 : 0x7a5a3a);
      b.box(0, 0.05, 0, w / 2, 0.05, d / 2);
      const n = Math.max(2, Math.round(w * 2));
      for (let i = 0; i < n; i++) {
        const x = -w / 2 + ((i + 0.5) * w) / n;
        b.cylinder(x, 0.08, 0, 0.06, 0, Math.max(0.15, h - 0.1), 4);
      }
    }
  }
}

function fromShape(kind: 'bed'): MeshBuilder {
  // re-use the prop kit geometry as builder data (positions/colors)
  const g = propShape(kind).geo;
  const mb = new MeshBuilder();
  const p = g.getAttribute('position'), n = g.getAttribute('normal'), c = g.getAttribute('color');
  for (let i = 0; i < p.count; i++) {
    mb.pos.push(p.getX(i), p.getY(i), p.getZ(i));
    mb.nor.push(n.getX(i), n.getY(i), n.getZ(i));
    mb.col.push(c.getX(i), c.getY(i), c.getZ(i));
    mb.emit.push(0);
    mb.skin.push(0);
  }
  return mb;
}

const CROP_COL: Record<string, number> = {
  potato: 0x7a8a48, carrot: 0xd07a30, tomato: 0xc0443a, corn: 0xd8c050, cabbage: 0x8ab060, pumpkin: 0xd08a30, wheat: 0xd8c070,
};

function emitCrop(b: MeshBuilder, c: CropSave, _hour: number): void {
  const st = cropStage(c.growth);
  const key = c.crop.replace(/^(seed|crop|food)\./, '');
  const fruit = CROP_COL[key] ?? 0x8ab060;
  for (let i = -1; i <= 1; i++)
    for (let j = -1; j <= 1; j++) {
      const x = i * 0.95, z = j * 0.85;
      if (st === 0) {
        b.setColor(0x5a7a40);
        b.box(x, 0.3, z, 0.05, 0.05, 0.05);
      } else if (st === 1) {
        b.setColor(0x6a8a48);
        b.blob(x, 0.42, z, 0.18, 0.16, 0.18, 0.2, i * 3 + j);
      } else {
        const sz = st === 2 ? 0.28 : 0.36;
        b.setColor(key === 'wheat' || key === 'corn' ? 0x9aa058 : 0x5a8a40);
        if (key === 'wheat' || key === 'corn') b.cylinder(x, 0.25, z, 0.12, 0.05, st === 2 ? 0.7 : 1.1, 5);
        else b.blob(x, 0.5, z, sz, sz * 0.8, sz, 0.25, i * 5 + j);
        if (st === 3) {
          b.setColor(fruit);
          if (key === 'wheat' || key === 'corn') b.blob(x, 1.3, z, 0.08, 0.18, 0.08, 0.1, i + j);
          else b.blob(x + 0.15, 0.55, z + 0.1, 0.12, 0.11, 0.12, 0.15, i * 7 + j);
        }
      }
    }
}

export class BaseView {
  readonly group = new THREE.Group();
  private mesh: THREE.Mesh | null = null;
  private colliders: Collider[] = [];
  readonly mat = makeChunkMaterial();
  private ghost: THREE.Mesh | null = null;
  private ghostKey = '';
  private ghostMatOk = new THREE.MeshBasicMaterial({ color: 0x5fe6a0, transparent: true, opacity: 0.42, depthWrite: false });
  private ghostMatBad = new THREE.MeshBasicMaterial({ color: 0xe2574c, transparent: true, opacity: 0.42, depthWrite: false });
  /** world positions of placed pieces by id (for interaction) */
  readonly pos = new Map<number, THREE.Vector3>();

  constructor(private collision: CollisionWorld, private terrain: (x: number, z: number) => number) {}

  foundationAt(pieces: readonly PlacedPiece[], x: number, z: number, level: number): boolean {
    for (const p of pieces) {
      if (p.piece !== 'foundation' || levelFromY(p.y) !== level) continue;
      if (Math.abs(p.x - x) <= 2.05 && Math.abs(p.z - z) <= 2.05) return true;
    }
    return false;
  }

  worldBase(pieces: readonly PlacedPiece[], p: { piece: string; x: number; y: number; z: number }): number {
    const def = getPiece(p.piece);
    if (!def) return this.terrain(p.x, p.z);
    const L = levelFromY(p.y);
    return pieceBaseY(def, L, this.terrain(p.x, p.z), L > 0 || this.foundationAt(pieces, p.x, p.z, 0) || this.edgeOnFoundation(pieces, p.x, p.z));
  }

  private edgeOnFoundation(pieces: readonly PlacedPiece[], x: number, z: number): boolean {
    // edge pieces sit between two cells: check either side
    return this.foundationAt(pieces, x + 0.5, z + 0.5, 0) || this.foundationAt(pieces, x - 0.5, z - 0.5, 0);
  }

  rebuild(pieces: readonly PlacedPiece[], crops: readonly CropSave[], hour: number): void {
    for (const c of this.colliders) this.collision.remove(c);
    this.colliders = [];
    this.pos.clear();
    if (this.mesh) {
      this.mesh.geometry.dispose();
      this.group.remove(this.mesh);
      this.mesh = null;
    }
    if (pieces.length === 0) return;
    const b = new MeshBuilder({ groundAO: false });
    const cropBy = new Map<number, CropSave>();
    for (const c of crops) cropBy.set(c.plot, c);
    for (const p of pieces) {
      const def = getPiece(p.piece);
      if (!def) continue;
      const y = this.worldBase(pieces, p);
      b.pushTRS(p.x, y, p.z, (p.rot * Math.PI) / 2);
      emitPiece(b, def, p.tier, cropBy.get(p.id), hour);
      b.pop();
      this.pos.set(p.id, new THREE.Vector3(p.x, y, p.z));
      if (def.solid || def.kind === 'foundation' || def.kind === 'floor' || def.kind === 'roof') {
        const odd = p.rot % 2 === 1;
        const hw = (odd ? def.size.d : def.size.w) / 2, hd = (odd ? def.size.w : def.size.d) / 2;
        let y0 = y;
        const y1 = y + def.size.h;
        if (def.kind === 'foundation') y0 = y - 0.6;
        if (def.id === 'doorway' || def.id === 'gate') {
          // passable opening: collide only on the two side posts + lintel
          const along = !odd;
          const side = (s: number) =>
            this.colliders.push(
              this.collision.add({
                minX: along ? p.x + s * 1.4 - 0.6 : p.x - hw, maxX: along ? p.x + s * 1.4 + 0.6 : p.x + hw,
                minY: y0, maxY: y1, minZ: along ? p.z - hd : p.z + s * 1.4 - 0.6, maxZ: along ? p.z + hd : p.z + s * 1.4 + 0.6,
                tag: 'placed', ref: p.id,
              }),
            );
          side(-1);
          side(1);
          continue;
        }
        this.colliders.push(this.collision.add({ minX: p.x - hw, maxX: p.x + hw, minY: y0, maxY: y1, minZ: p.z - hd, maxZ: p.z + hd, tag: 'placed', ref: p.id }));
      }
    }
    this.mesh = new THREE.Mesh(b.toGeometry(true), this.mat);
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    this.group.add(this.mesh);
  }

  showGhost(pieceId: string | null, tier: number, x: number, y: number, z: number, rot: number, ok: boolean): void {
    if (!pieceId) {
      if (this.ghost) this.ghost.visible = false;
      return;
    }
    const key = `${pieceId}:${tier}`;
    if (key !== this.ghostKey) {
      if (this.ghost) {
        this.ghost.geometry.dispose();
        this.group.remove(this.ghost);
      }
      const def = getPiece(pieceId);
      if (!def) return;
      const b = new MeshBuilder();
      emitPiece(b, def, tier);
      this.ghost = new THREE.Mesh(b.toGeometry(false), this.ghostMatOk);
      this.ghost.renderOrder = 5;
      this.group.add(this.ghost);
      this.ghostKey = key;
    }
    if (!this.ghost) return;
    this.ghost.visible = true;
    this.ghost.material = ok ? this.ghostMatOk : this.ghostMatBad;
    this.ghost.position.set(x, y, z);
    this.ghost.rotation.y = (rot * Math.PI) / 2;
    const pulse = 0.36 + Math.sin(performance.now() / 160) * 0.08;
    (this.ghost.material as THREE.MeshBasicMaterial).opacity = pulse;
  }
}
