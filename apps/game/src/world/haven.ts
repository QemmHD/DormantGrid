// Haven Lot set dressing: the survivors' starting camp around the spawn.
// Tents, tarp canopy, fire barrels with flicker, string lights, a cookfire,
// crates and a hand-painted sign. One merged mesh + a few glow sprites.
import * as THREE from 'three';
import { glowTexture } from '../render/glow';

const TONGUES = 10;
const FM = new THREE.Matrix4();
const FV = new THREE.Vector3();
const FS = new THREE.Vector3();
const FQ = new THREE.Quaternion();
const FC = new THREE.Color();
import { MeshBuilder } from '../render/geo';
import { makeChunkMaterial } from '../render/materials';
import type { CollisionWorld } from '../game/collision';

export class HavenCamp {
  readonly group = new THREE.Group();
  private flames: THREE.Object3D[] = [];
  private tongues!: THREE.InstancedMesh;
  private life!: Float32Array;
  private drift!: Float32Array;
  /** set by the game: billboards face this camera */
  cam: THREE.Camera | null = null;
  private bulbs: THREE.Mesh;
  readonly mat = makeChunkMaterial();
  private t = 0;
  readonly light = new THREE.PointLight(0xff9a4a, 0, 22, 1.6);

  constructor(cx: number, cz: number, ground: (x: number, z: number) => number, collision: CollisionWorld) {
    const b = new MeshBuilder({ groundAO: true });
    const y0 = ground(cx, cz);
    const at = (x: number, z: number) => ground(cx + x, cz + z) - y0;
    const col = (x: number, z: number, hx: number, hz: number, h: number) =>
      collision.add({ minX: cx + x - hx, maxX: cx + x + hx, minY: y0, maxY: y0 + h, minZ: cz + z - hz, maxZ: cz + z + hz, tag: 'camp', ref: 0 });
    b.pushTRS(cx, y0, cz, 0);
    // tents (A-frames) in an arc behind the spawn
    const tents: [number, number, number, number][] = [
      [-9, -7, 0.4, 0x6a7a5a],
      [-3, -10, 0.1, 0x8a6a48],
      [4, -9, -0.3, 0x5a6a7a],
    ];
    for (const [x, z, r, c] of tents) {
      b.pushTRS(x, at(x, z), z, r);
      b.setColor(c);
      b.gable(0, 0, 0, 1.4, 1.1, 1.7, 0.1);
      b.setColor(0x2a2622);
      b.tri(-1.4, 0, 1.1, 1.4, 0, 1.1, 0, 1.7, 1.1, 0.5);
      b.setColor(0x4a3a2c);
      b.box(0, 0.85, 1.25, 0.03, 0.85, 0.03);
      b.pop();
      col(x, z, 1.5, 1.2, 1.7);
    }
    // tarp canopy on poles with a table
    b.pushTRS(8, at(8, -3), -3, 0.2);
    b.setColor(0x4a3a2c);
    for (const [px, pz] of [[-2, -1.6], [2, -1.6], [-2, 1.6], [2, 1.6]]) b.box(px, 1.2, pz, 0.05, 1.2, 0.05);
    b.setColor(0x7a8a6a);
    b.push(new THREE.Matrix4().makeRotationX(0.08));
    b.box(0, 2.42, 0, 2.2, 0.02, 1.8);
    b.pop();
    b.setColor(0x9a7652);
    b.bevelBox(0, 0.75, 0, 1.0, 0.04, 0.5, 0.02);
    b.setColor(0x4a4038);
    for (const sx of [-0.9, 0.9]) for (const sz of [-0.4, 0.4]) b.box(sx, 0.37, sz, 0.04, 0.37, 0.04);
    b.setColor(0x6a6e72);
    b.cylinder(-0.4, 0.79, 0, 0.12, 0.1, 0.2, 8);
    b.setColor(0xd8d0b0);
    b.box(0.3, 0.8, 0.1, 0.18, 0.01, 0.13);
    b.pop();
    col(8, -3, 1.1, 0.6, 0.8);
    // cookfire ring with logs to sit on
    b.pushTRS(0, at(0, -4), -4, 0);
    b.setColor(0x6a6660);
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2;
      b.bevelBox(Math.cos(a) * 0.65, 0.1, Math.sin(a) * 0.65, 0.15, 0.1, 0.12, 0.03);
    }
    b.setColor(0x5a3a26);
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2 + 0.4;
      b.pushTRS(Math.cos(a) * 2.2, 0.2, Math.sin(a) * 2.2, -a);
      b.push(new THREE.Matrix4().makeRotationZ(Math.PI / 2));
      b.cylinder(0, -0.8, 0, 0.2, 0.2, 1.6, 7);
      b.pop().pop();
    }
    b.setColor(0x2a2018);
    b.cylinder(0, 0, 0, 0.45, 0.45, 0.06, 8);
    b.pop();
    // fire barrels
    const barrels: [number, number][] = [[-6, -2], [6, 3], [-2, 6]];
    for (const [x, z] of barrels) {
      b.pushTRS(x, at(x, z), z, 0);
      b.setColor(0x5a4a3e);
      b.cylinder(0, 0, 0, 0.32, 0.3, 0.95, 10);
      b.setColor(0x2a2420);
      b.cylinder(0, 0.25, 0, 0.33, 0.33, 0.05, 10, false);
      b.cylinder(0, 0.65, 0, 0.33, 0.33, 0.05, 10, false);
      b.pop();
      col(x, z, 0.35, 0.35, 1);
    }
    // crates & sacks stacks
    const stacks: [number, number, number][] = [[-10, -2, 0.3], [11, -7, -0.4], [-6, -11, 0.8]];
    for (const [x, z, r] of stacks) {
      b.pushTRS(x, at(x, z), z, r);
      b.setColor(0xa08060);
      b.bevelBox(0, 0.35, 0, 0.36, 0.35, 0.36, 0.04);
      b.bevelBox(0.78, 0.35, 0.1, 0.36, 0.35, 0.36, 0.04);
      b.setColor(0x98805a);
      b.bevelBox(0.35, 1.05, 0.05, 0.36, 0.35, 0.36, 0.04);
      b.setColor(0xb8a888);
      b.blob(-0.7, 0.3, 0.2, 0.35, 0.3, 0.3, 0.2, 4);
      b.pop();
      col(x + 0.3, z, 0.9, 0.5, 1.4);
    }
    // painted sign
    b.pushTRS(2, at(2, 7), 7, Math.PI);
    b.setColor(0x4a3a2c);
    b.box(-1.2, 1, 0, 0.06, 1, 0.06);
    b.box(1.2, 1, 0, 0.06, 1, 0.06);
    b.setColor(0x8a6a48);
    b.bevelBox(0, 1.6, 0, 1.45, 0.38, 0.04, 0.02);
    b.setColor(0xd8c8a0);
    // "HAVEN" as a 5×7 pixel font so V and N read as V and N (round 3 strokes read "HAUEH")
    const GLYPHS = [
      ['10001', '10001', '10001', '11111', '10001', '10001', '10001'], // H
      ['01110', '10001', '10001', '11111', '10001', '10001', '10001'], // A
      ['10001', '10001', '10001', '10001', '01010', '01010', '00100'], // V
      ['11111', '10000', '10000', '11110', '10000', '10000', '11111'], // E
      ['10001', '11001', '10101', '10101', '10011', '10001', '10001'], // N
    ];
    const px = 0.062, gap = 0.44;
    for (let gi = 0; gi < GLYPHS.length; gi++) {
      const x0 = (gi - 2) * gap - 2 * px;
      GLYPHS[gi].forEach((row, r) => {
        for (let c = 0; c < 5; c++) {
          if (row[c] !== '1') continue;
          const x = x0 + c * px, y = 1.6 + (3 - r) * px;
          // the -z face is read from behind the board's local frame: mirror x there
          b.box(-x, y, -0.045, px * 0.46, px * 0.46, 0.006);
          b.box(x, y, 0.045, px * 0.46, px * 0.46, 0.006);
        }
      });
    }
    b.pop();
    // string-light poles around the fire
    const poles: [number, number][] = [[-5, -7], [5, -7], [6, 1], [-6, 1]];
    b.setColor(0x4a3a2c);
    for (const [x, z] of poles) {
      b.pushTRS(x, at(x, z), z, 0);
      b.cylinder(0, 0, 0, 0.07, 0.06, 3.2, 5);
      b.pop();
    }
    b.pop();
    const mesh = new THREE.Mesh(b.toGeometry(true), this.mat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.group.add(mesh);

    // flames: soft additive billboard "tongues" that rise, shrink and cool from
    // white-yellow to deep orange (replaces the round-3 cones), plus a base glow
    const fires: [number, number, number, number][] = [...barrels.map(([x, z]) => [x, z, 1.15, 0.8] as [number, number, number, number]), [0, -4, 0.3, 1.25]];
    for (const [x, z, h, size] of fires) {
      const f = new THREE.Object3D();
      f.position.set(cx + x, ground(cx + x, cz + z) + h, cz + z);
      f.userData.size = size;
      this.flames.push(f);
    }
    const tex = glowTexture();
    this.tongues = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }), fires.length * TONGUES + fires.length);
    this.tongues.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(this.tongues.count * 3), 3);
    this.tongues.frustumCulled = false;
    this.tongues.renderOrder = 4;
    this.group.add(this.tongues);
    this.life = new Float32Array(fires.length * TONGUES).map((_, i) => (i % TONGUES) / TONGUES);
    this.drift = new Float32Array(fires.length * TONGUES * 2).map(() => (Math.random() - 0.5) * 0.18);
    this.light.position.set(cx, y0 + 1.4, cz - 4);
    this.group.add(this.light);
    // string light bulbs along catenaries between poles
    const pts: number[] = [];
    for (let i = 0; i < poles.length; i++) {
      const [ax, az] = poles[i];
      const [bx, bz] = poles[(i + 1) % poles.length];
      for (let k = 0; k <= 10; k++) {
        const t = k / 10;
        const x = ax + (bx - ax) * t, z = az + (bz - az) * t;
        pts.push(cx + x, ground(cx + x, cz + z) + 3.1 - Math.sin(t * Math.PI) * 0.7, cz + z);
      }
    }
    const bulbGeo = new THREE.SphereGeometry(0.045, 5, 4);
    this.bulbs = new THREE.InstancedMesh(bulbGeo, new THREE.MeshBasicMaterial({ color: 0xffd08a }), pts.length / 3) as unknown as THREE.Mesh;
    const im = this.bulbs as unknown as THREE.InstancedMesh;
    const m4 = new THREE.Matrix4();
    for (let i = 0; i < pts.length / 3; i++) im.setMatrixAt(i, m4.makeTranslation(pts[i * 3], pts[i * 3 + 1], pts[i * 3 + 2]));
    this.group.add(im);
    // the wire
    const wire = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    this.group.add(new THREE.Line(wire, new THREE.LineBasicMaterial({ color: 0x1a1612 })));
  }

  /** smoke emitter hook (set by the game: FX.smoke) */
  smoke: ((x: number, y: number, z: number) => void) | null = null;
  private smokeT = 0;

  private updateFlames(dt: number): void {
    const im = this.tongues;
    const cq = this.cam?.quaternion ?? FQ.identity();
    let k = 0;
    for (let i = 0; i < this.flames.length; i++) {
      const f = this.flames[i];
      const size = f.userData.size as number;
      const gust = Math.sin(this.t * 2.3 + i) * 0.5 + Math.sin(this.t * 5.1 + i * 2) * 0.3;
      for (let j = 0; j < TONGUES; j++) {
        const n = i * TONGUES + j;
        let l = this.life[n] + dt * (1.5 + (j % 3) * 0.25);
        if (l >= 1) {
          l -= 1;
          this.drift[n * 2] = (Math.random() - 0.5) * 0.2;
          this.drift[n * 2 + 1] = (Math.random() - 0.5) * 0.2;
        }
        this.life[n] = l;
        const rise = l * 0.95 * size;
        const sway = gust * 0.08 * l;
        const sc = size * (0.62 * (1 - l) ** 0.7 + 0.08) * (0.9 + Math.random() * 0.2);
        FV.set(f.position.x + this.drift[n * 2] * (1 - l) + sway, f.position.y + rise, f.position.z + this.drift[n * 2 + 1] * (1 - l));
        FM.compose(FV, cq, FS.set(sc * 0.8, sc * 1.25, sc));
        im.setMatrixAt(k, FM);
        // white-yellow core → orange → dim red tips; additive, so dimmer = more transparent
        const heat = 1 - l;
        FC.setRGB(1, 0.32 + 0.6 * heat * heat, 0.08 + 0.45 * heat ** 3).multiplyScalar(0.25 + 0.75 * heat);
        im.setColorAt(k, FC);
        k++;
      }
    }
    // a soft, flickering base glow per fire
    for (let i = 0; i < this.flames.length; i++) {
      const f = this.flames[i];
      const size = f.userData.size as number;
      const fl = 0.85 + Math.sin(this.t * 13 + i * 3) * 0.08 + Math.sin(this.t * 7.3 + i) * 0.07;
      FV.set(f.position.x, f.position.y + 0.15 * size, f.position.z);
      FM.compose(FV, cq, FS.setScalar(size * 1.5 * fl));
      im.setMatrixAt(k, FM);
      im.setColorAt(k, FC.setRGB(1, 0.45, 0.12).multiplyScalar(0.45 * fl));
      k++;
    }
    im.count = k;
    im.instanceMatrix.needsUpdate = true;
    if (im.instanceColor) im.instanceColor.needsUpdate = true;
  }

  update(dt: number, night: number): void {
    this.t += dt;
    this.smokeT -= dt;
    if (this.smoke && this.smokeT <= 0) {
      this.smokeT = 0.22;
      const f = this.flames[Math.floor(Math.random() * this.flames.length)];
      if (f) this.smoke(f.position.x, f.position.y + 0.5, f.position.z);
    }
    this.updateFlames(dt);
    this.light.intensity = (3 + night * 13) * (0.85 + Math.sin(this.t * 11) * 0.08 + Math.sin(this.t * 4.7) * 0.07);
    const mat = (this.bulbs as unknown as THREE.InstancedMesh).material as THREE.MeshBasicMaterial;
    mat.color.setRGB(1, 0.82, 0.54).multiplyScalar(0.35 + night * 0.9);
  }
}
