// Tier A procedural prop kit. One geometry per PropKind (instanced), pivot at
// base center, facing +Z, 1 unit = 1 m. Instance colors tint per-prop variety.
import * as THREE from 'three';
import type { PropKind } from '@dg/shared';
import { MeshBuilder } from './geo';

export interface PropShape {
  geo: THREE.BufferGeometry;
  /** collision half extents (x,y,z) in local space, null = walk-through */
  col: [number, number, number] | null;
  /** tint palette for instance colors */
  tints: number[];
  /** small props can be culled at low density */
  small: boolean;
  /** casts shadows */
  shadow: boolean;
}

const RZ = (a: number) => new THREE.Matrix4().makeRotationZ(a);
const RX = (a: number) => new THREE.Matrix4().makeRotationX(a);
const T = (x: number, y: number, z: number) => new THREE.Matrix4().makeTranslation(x, y, z);

function wheel(b: MeshBuilder, x: number, y: number, z: number, r = 0.34, w = 0.22): void {
  b.push(T(x, y, z)).push(RZ(Math.PI / 2));
  b.setColor(0x1e1e20);
  b.cylinder(0, -w / 2, 0, r, r, w, 8);
  b.setColor(0x6a6c6e);
  b.cylinder(0, -w / 2 - 0.01, 0, r * 0.45, r * 0.45, w + 0.02, 6);
  b.pop().pop();
}

const builders: Record<PropKind, () => Omit<PropShape, 'geo'> & { b: MeshBuilder }> = {
  car: () => {
    const b = new MeshBuilder({ groundAO: true });
    b.setColor(0xd8d8d8);
    b.bevelBox(0, 0.62, 0, 0.88, 0.3, 2.1, 0.12);
    b.bevelBox(0, 1.08, -0.15, 0.78, 0.2, 1.1, 0.12);
    b.setColor(0x20262c);
    b.box(0, 1.08, 0.97, 0.7, 0.16, 0.02);
    b.box(0, 1.08, -1.27, 0.7, 0.15, 0.02);
    b.box(0.79, 1.08, -0.15, 0.01, 0.15, 0.95);
    b.box(-0.79, 1.08, -0.15, 0.01, 0.15, 0.95);
    b.setColor(0xb8a070);
    b.box(0.6, 0.66, 2.11, 0.16, 0.06, 0.01);
    b.box(-0.6, 0.66, 2.11, 0.16, 0.06, 0.01);
    b.setColor(0x7a2a24);
    b.box(0.62, 0.68, -2.11, 0.14, 0.06, 0.01);
    b.box(-0.62, 0.68, -2.11, 0.14, 0.06, 0.01);
    for (const x of [-0.82, 0.82]) for (const z of [-1.35, 1.35]) wheel(b, x, 0.34, z);
    return { b, col: [0.9, 0.7, 2.15], tints: [0x8a4a40, 0x5a6a78, 0x7a7a6a, 0x4a5a4a, 0x9a8a6a, 0x5a5a62, 0xa89a88], small: false, shadow: true };
  },
  van: () => {
    const b = new MeshBuilder({ groundAO: true });
    b.setColor(0xdedcd6);
    b.bevelBox(0, 1.15, -0.3, 0.98, 0.85, 2.0, 0.14);
    b.bevelBox(0, 0.8, 1.9, 0.95, 0.5, 0.55, 0.14);
    b.setColor(0x20262c);
    b.box(0, 1.5, 1.72, 0.85, 0.28, 0.25);
    b.setColor(0x9a8a70);
    b.box(0, 1.4, -2.31, 0.6, 0.4, 0.01);
    for (const x of [-0.9, 0.9]) for (const z of [-1.5, 1.6]) wheel(b, x, 0.38, z, 0.38, 0.26);
    return { b, col: [1.0, 1.0, 2.5], tints: [0xd0ccc0, 0x7a8a8e, 0x9a7a5a, 0x6a7a6a], small: false, shadow: true };
  },
  bus: () => {
    const b = new MeshBuilder({ groundAO: true });
    b.setColor(0xc8b48a);
    b.bevelBox(0, 1.6, 0, 1.25, 1.2, 5.5, 0.2);
    b.setColor(0x232a30);
    for (let z = -4.5; z <= 4.5; z += 1.5) {
      b.box(1.26, 2.0, z, 0.01, 0.4, 0.6);
      b.box(-1.26, 2.0, z, 0.01, 0.4, 0.6);
    }
    b.box(0, 2.0, 5.51, 1.05, 0.5, 0.01);
    b.setColor(0x6a4a30);
    b.box(0, 0.75, 0, 1.27, 0.08, 5.52);
    for (const x of [-1.15, 1.15]) for (const z of [-3.8, 3.6]) wheel(b, x, 0.45, z, 0.45, 0.3);
    return { b, col: [1.3, 1.6, 5.6], tints: [0xd8c08a, 0xb0a890, 0x8a9aa0], small: false, shadow: true };
  },
  tree: () => {
    const b = new MeshBuilder();
    b.setColor(0x4a3a2c);
    b.cylinder(0, 0, 0, 0.22, 0.14, 2.6, 6);
    b.setColor(0xffffff);
    b.blob(0, 3.4, 0, 1.7, 1.4, 1.7, 0.2, 1);
    b.blob(0.7, 2.8, 0.4, 1.1, 0.9, 1.1, 0.2, 2);
    b.blob(-0.6, 3.0, -0.5, 1.0, 0.9, 1.0, 0.2, 3);
    // trunk color stays brown; foliage tinted by instance color via white base
    return { b, col: [0.25, 1.6, 0.25], tints: [0x5f7048, 0x6a7448, 0x55663f, 0x7a7a48, 0x8a6a3e], small: false, shadow: true };
  },
  pine: () => {
    const b = new MeshBuilder();
    b.setColor(0x4a3a2c);
    b.cylinder(0, 0, 0, 0.2, 0.12, 1.4, 6);
    b.setColor(0xffffff);
    b.cylinder(0, 1.0, 0, 1.6, 0.0, 2.4, 7);
    b.cylinder(0, 2.4, 0, 1.25, 0.0, 2.0, 7);
    b.cylinder(0, 3.6, 0, 0.85, 0.0, 1.6, 7);
    return { b, col: [0.22, 1.2, 0.22], tints: [0x3f5a44, 0x46604a, 0x3a5240], small: false, shadow: true };
  },
  bush: () => {
    const b = new MeshBuilder();
    b.setColor(0xffffff);
    b.blob(0, 0.45, 0, 0.8, 0.55, 0.8, 0.25, 4);
    b.blob(0.45, 0.35, 0.2, 0.5, 0.4, 0.5, 0.25, 5);
    return { b, col: null, tints: [0x5f7048, 0x55663f, 0x6a6a44], small: true, shadow: false };
  },
  rock: () => {
    const b = new MeshBuilder();
    b.setColor(0xffffff);
    b.blob(0, 0.35, 0, 0.9, 0.6, 0.75, 0.3, 6);
    return { b, col: [0.75, 0.6, 0.65], tints: [0x7a7872, 0x6a6862, 0x8a867c], small: false, shadow: true };
  },
  rubble: () => {
    const b = new MeshBuilder({ groundAO: true, jitter: 0.15 });
    b.setColor(0x8a8478);
    for (let i = 0; i < 7; i++) {
      const a = i * 2.1;
      b.pushTRS(Math.cos(a) * 0.6 * (i % 3) * 0.5, 0.12, Math.sin(a) * 0.5 * (i % 2 + 0.5), a);
      b.bevelBox(0, 0, 0, 0.25 + (i % 3) * 0.08, 0.12 + (i % 2) * 0.06, 0.2, 0.04);
      b.pop();
    }
    b.setColor(0x6a3a2a);
    b.pushTRS(0.2, 0.3, -0.1, 0.5).push(RZ(0.4));
    b.box(0, 0, 0, 0.6, 0.05, 0.06);
    b.pop().pop();
    return { b, col: null, tints: [0xffffff, 0xd8d0c0, 0xc0c0c0], small: true, shadow: false };
  },
  barrel: () => {
    const b = new MeshBuilder({ groundAO: true });
    b.setColor(0xffffff);
    b.cylinder(0, 0, 0, 0.3, 0.3, 0.9, 10);
    b.setColor(0x2a2a2a);
    b.cylinder(0, 0.28, 0, 0.31, 0.31, 0.05, 10, false);
    b.cylinder(0, 0.62, 0, 0.31, 0.31, 0.05, 10, false);
    return { b, col: [0.3, 0.45, 0.3], tints: [0x5a6a7a, 0x8a4a3a, 0x6a7a4a, 0xa88a4a], small: false, shadow: true };
  },
  crate: () => {
    const b = new MeshBuilder({ groundAO: true });
    b.setColor(0xb09068);
    b.bevelBox(0, 0.35, 0, 0.36, 0.35, 0.36, 0.04);
    b.setColor(0x7a6040);
    b.box(0, 0.35, 0.365, 0.36, 0.05, 0.01);
    b.box(0.365, 0.35, 0, 0.01, 0.05, 0.36);
    b.box(-0.365, 0.35, 0, 0.01, 0.05, 0.36);
    b.box(0, 0.35, -0.365, 0.36, 0.05, 0.01);
    return { b, col: [0.36, 0.35, 0.36], tints: [0xffffff, 0xd0c8b8, 0xe0d0b0], small: false, shadow: true };
  },
  dumpster: () => {
    const b = new MeshBuilder({ groundAO: true });
    b.setColor(0xffffff);
    b.bevelBox(0, 0.7, 0, 1.0, 0.6, 0.7, 0.06);
    b.setColor(0x2a2e30);
    b.push(T(0, 1.32, -0.7)).push(RX(-0.12));
    b.box(0, 0, 0.7, 1.02, 0.04, 0.72);
    b.pop().pop();
    b.setColor(0x333333);
    for (const x of [-0.8, 0.8]) for (const z of [-0.5, 0.5]) b.cylinder(x, 0, z, 0.07, 0.07, 0.12, 6);
    return { b, col: [1.0, 0.7, 0.72], tints: [0x4a6a52, 0x3a5a6a, 0x6a5a3a], small: false, shadow: true };
  },
  bench: () => {
    const b = new MeshBuilder({ groundAO: true });
    b.setColor(0x8a6a48);
    for (let i = 0; i < 3; i++) b.box(0, 0.45, -0.15 + i * 0.13, 0.9, 0.025, 0.05);
    for (let i = 0; i < 2; i++) b.box(0, 0.65 + i * 0.13, -0.26, 0.9, 0.045, 0.02);
    b.setColor(0x2f3336);
    for (const x of [-0.75, 0.75]) {
      b.box(x, 0.22, 0, 0.04, 0.22, 0.2);
      b.box(x, 0.6, -0.26, 0.04, 0.2, 0.02);
    }
    return { b, col: [0.9, 0.3, 0.3], tints: [0xffffff, 0xd8c8b0], small: true, shadow: true };
  },
  streetlight: () => {
    const b = new MeshBuilder();
    b.setColor(0x3a3e42);
    b.cylinder(0, 0, 0, 0.12, 0.08, 5.5, 6);
    b.box(0, 5.45, 0.5, 0.05, 0.05, 0.55);
    b.setColor(0x2a2c2e);
    b.bevelBox(0, 5.38, 1.0, 0.16, 0.08, 0.28, 0.04);
    b.setColor(0xfff0c0).setEmissive(1);
    b.box(0, 5.29, 1.0, 0.12, 0.01, 0.22);
    b.setEmissive(0);
    return { b, col: [0.12, 2.8, 0.12], tints: [0xffffff], small: false, shadow: true };
  },
  sign: () => {
    const b = new MeshBuilder();
    b.setColor(0x4a4e52);
    b.cylinder(0, 0, 0, 0.05, 0.05, 2.2, 5);
    b.setColor(0xffffff);
    b.bevelBox(0, 2.2, 0.06, 0.4, 0.3, 0.025, 0.02);
    return { b, col: null, tints: [0x9a3a32, 0x3a6a8a, 0xc8a040, 0x4a7a4a], small: true, shadow: false };
  },
  hydrant: () => {
    const b = new MeshBuilder({ groundAO: true });
    b.setColor(0xffffff);
    b.cylinder(0, 0, 0, 0.14, 0.12, 0.55, 8);
    b.cylinder(0, 0.55, 0, 0.12, 0.04, 0.14, 8);
    b.push(RZ(Math.PI / 2));
    b.cylinder(0.32, -0.2, 0, 0.05, 0.05, 0.4, 6);
    b.pop();
    return { b, col: null, tints: [0xb04a3a, 0xc8a040], small: true, shadow: false };
  },
  fence: () => {
    const b = new MeshBuilder({ groundAO: true, jitter: 0.12 });
    b.setColor(0xffffff);
    for (let x = -1.8; x <= 1.81; x += 0.3) b.box(x, 0.6, 0, 0.06, 0.6 + Math.sin(x * 7) * 0.05, 0.02);
    b.box(0, 0.35, -0.03, 1.95, 0.05, 0.02);
    b.box(0, 0.95, -0.03, 1.95, 0.05, 0.02);
    return { b, col: [1.95, 0.7, 0.06], tints: [0x9a8a70, 0x8a7a64, 0x7a7a72], small: false, shadow: true };
  },
  pallet: () => {
    const b = new MeshBuilder({ groundAO: true });
    b.setColor(0xb09a72);
    for (let i = -2; i <= 2; i++) b.box(i * 0.2, 0.13, 0, 0.08, 0.015, 0.6);
    b.setColor(0x8a7452);
    for (const z of [-0.5, 0, 0.5]) b.box(0, 0.06, z, 0.5, 0.05, 0.05);
    return { b, col: null, tints: [0xffffff, 0xd8c8a8], small: true, shadow: false };
  },
  tire: () => {
    const b = new MeshBuilder({ groundAO: true });
    b.setColor(0x1f1f21);
    b.cylinder(0, 0, 0, 0.4, 0.4, 0.22, 10);
    b.setColor(0x0e0e0f);
    b.cylinder(0, 0.01, 0, 0.2, 0.2, 0.22, 8);
    return { b, col: null, tints: [0xffffff], small: true, shadow: false };
  },
  trashbag: () => {
    const b = new MeshBuilder();
    b.setColor(0x2a2c2e);
    b.blob(0, 0.25, 0, 0.35, 0.28, 0.3, 0.25, 7);
    b.blob(0.3, 0.2, 0.2, 0.25, 0.2, 0.25, 0.25, 8);
    return { b, col: null, tints: [0xffffff, 0x8a9a7a, 0x9a9070], small: true, shadow: false };
  },
  mailbox: () => {
    const b = new MeshBuilder({ groundAO: true });
    b.setColor(0xffffff);
    b.bevelBox(0, 0.6, 0, 0.25, 0.6, 0.22, 0.05);
    b.cylinder(0, 1.2, 0, 0.25, 0.25, 0.01, 8);
    return { b, col: [0.25, 0.6, 0.22], tints: [0x3a5a8a, 0x5a6a5a], small: true, shadow: true };
  },
  container: () => {
    const b = new MeshBuilder({ groundAO: true });
    b.setColor(0xffffff);
    b.box(0, 1.3, 0, 1.22, 1.3, 3.05);
    b.setColor(0xd0d0d0);
    for (let z = -2.8; z <= 2.8; z += 0.4) {
      b.box(1.23, 1.3, z, 0.02, 1.2, 0.08);
      b.box(-1.23, 1.3, z, 0.02, 1.2, 0.08);
    }
    b.setColor(0x3a3a3a);
    b.box(0, 1.3, 3.06, 1.1, 1.2, 0.02);
    return { b, col: [1.25, 1.3, 3.08], tints: [0x8a4a3a, 0x3a5a7a, 0x5a7a5a, 0x9a7a3a, 0x6a6a6a], small: false, shadow: true };
  },
  pipe: () => {
    const b = new MeshBuilder({ groundAO: true });
    b.setColor(0xffffff);
    b.push(RX(Math.PI / 2));
    b.cylinder(0, -2, -0.35, 0.35, 0.35, 4, 10);
    b.pop();
    return { b, col: [0.4, 0.7, 2], tints: [0x6a6e72, 0x7a5a4a, 0x5a6a6a], small: false, shadow: true };
  },
  haybale: () => {
    const b = new MeshBuilder({ groundAO: true, jitter: 0.08 });
    b.setColor(0xc8b070);
    b.push(RZ(Math.PI / 2));
    b.cylinder(0.6, -0.65, 0, 0.6, 0.6, 1.3, 10);
    b.pop();
    return { b, col: [0.65, 0.6, 0.6], tints: [0xffffff, 0xe0d0a0], small: false, shadow: true };
  },
  stump: () => {
    const b = new MeshBuilder({ groundAO: true });
    b.setColor(0x5a4636);
    b.cylinder(0, 0, 0, 0.35, 0.3, 0.45, 7);
    b.setColor(0xb09a72);
    b.cylinder(0, 0.44, 0, 0.29, 0.29, 0.02, 7);
    return { b, col: null, tints: [0xffffff], small: true, shadow: false };
  },
  locker: () => {
    const b = new MeshBuilder({ groundAO: true });
    b.setColor(0xffffff);
    b.bevelBox(0, 0.95, 0, 0.3, 0.95, 0.25, 0.02);
    b.setColor(0x333333);
    for (let i = 0; i < 4; i++) b.box(0, 1.6 - i * 0.04, 0.26, 0.18, 0.01, 0.005);
    return { b, col: [0.3, 0.95, 0.25], tints: [0x5a6a7a, 0x6a7a6a, 0x8a8a7a], small: false, shadow: true };
  },
  shelf: () => {
    const b = new MeshBuilder({ groundAO: true });
    b.setColor(0x6a6e72);
    for (const x of [-0.75, 0.75]) for (const z of [-0.2, 0.2]) b.box(x, 0.9, z, 0.03, 0.9, 0.03);
    b.setColor(0x8a8a86);
    for (let i = 0; i < 4; i++) b.box(0, 0.15 + i * 0.5, 0, 0.78, 0.02, 0.22);
    b.setColor(0xb09060);
    b.bevelBox(-0.4, 0.3, 0, 0.18, 0.13, 0.15, 0.02);
    b.setColor(0x7a8a9a);
    b.bevelBox(0.3, 0.83, 0, 0.2, 0.15, 0.15, 0.02);
    return { b, col: [0.8, 0.9, 0.25], tints: [0xffffff], small: false, shadow: true };
  },
  table: () => {
    const b = new MeshBuilder({ groundAO: true });
    b.setColor(0xffffff);
    b.bevelBox(0, 0.74, 0, 0.7, 0.03, 0.45, 0.02);
    b.setColor(0x6a5a48);
    for (const x of [-0.62, 0.62]) for (const z of [-0.38, 0.38]) b.box(x, 0.36, z, 0.03, 0.36, 0.03);
    return { b, col: [0.7, 0.4, 0.45], tints: [0x9a7a58, 0x8a8a84, 0xb09070], small: false, shadow: true };
  },
  chair: () => {
    const b = new MeshBuilder({ groundAO: true });
    b.setColor(0xffffff);
    b.box(0, 0.45, 0, 0.22, 0.02, 0.22);
    b.box(0, 0.75, -0.21, 0.22, 0.28, 0.02);
    b.setColor(0x4a4038);
    for (const x of [-0.19, 0.19]) for (const z of [-0.19, 0.19]) b.box(x, 0.22, z, 0.02, 0.22, 0.02);
    return { b, col: null, tints: [0x9a7a58, 0x7a8a8a, 0xa86a4a], small: true, shadow: false };
  },
  bed: () => {
    const b = new MeshBuilder({ groundAO: true });
    b.setColor(0x6a5440);
    b.bevelBox(0, 0.2, 0, 0.5, 0.2, 1.0, 0.03);
    b.box(0, 0.55, -1.0, 0.5, 0.35, 0.04);
    b.setColor(0xffffff);
    b.bevelBox(0, 0.45, 0.05, 0.47, 0.07, 0.93, 0.05);
    b.setColor(0xe0dcd0);
    b.bevelBox(0, 0.55, -0.7, 0.3, 0.06, 0.15, 0.04);
    return { b, col: [0.5, 0.35, 1.0], tints: [0x7a8a9a, 0x9a6a5a, 0x7a8a6a, 0xa89a7a], small: false, shadow: true };
  },
  cabinet: () => {
    const b = new MeshBuilder({ groundAO: true });
    b.setColor(0xffffff);
    b.bevelBox(0, 0.45, 0, 0.5, 0.45, 0.28, 0.03);
    b.setColor(0x3a3430);
    b.box(-0.25, 0.6, 0.285, 0.05, 0.01, 0.005);
    b.box(0.25, 0.6, 0.285, 0.05, 0.01, 0.005);
    b.box(0, 0.45, 0.285, 0.005, 0.4, 0.005);
    return { b, col: [0.5, 0.45, 0.28], tints: [0x9a7a58, 0x8a9a9a, 0xb0a890], small: false, shadow: true };
  },
  sofa: () => {
    const b = new MeshBuilder({ groundAO: true });
    b.setColor(0xffffff);
    b.bevelBox(0, 0.25, 0, 0.95, 0.2, 0.42, 0.08);
    b.bevelBox(0, 0.6, -0.32, 0.95, 0.3, 0.12, 0.08);
    b.bevelBox(-0.88, 0.48, 0, 0.1, 0.2, 0.42, 0.06);
    b.bevelBox(0.88, 0.48, 0, 0.1, 0.2, 0.42, 0.06);
    return { b, col: [0.95, 0.45, 0.42], tints: [0x6a5a7a, 0x7a5a4a, 0x5a6a6a, 0x8a7a5a], small: false, shadow: true };
  },
  fridge: () => {
    const b = new MeshBuilder({ groundAO: true });
    b.setColor(0xe8e6e0);
    b.bevelBox(0, 0.9, 0, 0.36, 0.9, 0.34, 0.05);
    b.setColor(0x8a8a8a);
    b.box(0.28, 1.25, 0.35, 0.02, 0.2, 0.02);
    b.box(0, 1.15, 0.345, 0.34, 0.005, 0.005);
    return { b, col: [0.36, 0.9, 0.34], tints: [0xffffff, 0xd8d0c0], small: false, shadow: true };
  },
  stove: () => {
    const b = new MeshBuilder({ groundAO: true });
    b.setColor(0xd8d4cc);
    b.bevelBox(0, 0.45, 0, 0.38, 0.45, 0.32, 0.03);
    b.setColor(0x222222);
    b.box(0, 0.4, 0.325, 0.3, 0.2, 0.005);
    for (const x of [-0.18, 0.18]) for (const z of [-0.14, 0.14]) b.cylinder(x, 0.9, z, 0.09, 0.09, 0.015, 8);
    return { b, col: [0.38, 0.45, 0.32], tints: [0xffffff], small: false, shadow: true };
  },
  terminal: () => {
    const b = new MeshBuilder({ groundAO: true });
    b.setColor(0x3a4044);
    b.bevelBox(0, 0.55, 0, 0.32, 0.55, 0.25, 0.05);
    b.setColor(0x2a2e30);
    b.push(T(0, 1.2, 0.05)).push(RX(-0.3));
    b.bevelBox(0, 0, 0, 0.3, 0.22, 0.06, 0.03);
    b.setColor(0x39e6d0).setEmissive(2.5);
    b.box(0, 0, 0.065, 0.24, 0.16, 0.005);
    b.setEmissive(0);
    b.pop().pop();
    return { b, col: [0.32, 0.7, 0.25], tints: [0xffffff], small: false, shadow: true };
  },
  debris: () => {
    const b = new MeshBuilder({ groundAO: true, jitter: 0.2 });
    b.setColor(0x7a7468);
    b.pushTRS(0, 0.06, 0, 0.3).push(RZ(0.15));
    b.box(0, 0, 0, 0.9, 0.06, 0.5);
    b.pop().pop();
    b.setColor(0x5a4a3a);
    b.pushTRS(0.3, 0.2, 0.1, -0.6).push(RZ(-0.5));
    b.box(0, 0, 0, 0.5, 0.04, 0.04);
    b.pop().pop();
    b.setColor(0x8a8a86);
    b.bevelBox(-0.4, 0.12, -0.2, 0.18, 0.12, 0.15, 0.03);
    return { b, col: null, tints: [0xffffff, 0xd0c8b8], small: true, shadow: false };
  },
};

const cache = new Map<PropKind, PropShape>();

export function propShape(kind: PropKind): PropShape {
  let s = cache.get(kind);
  if (!s) {
    const r = builders[kind]();
    s = { geo: r.b.toGeometry(true), col: r.col, tints: r.tints, small: r.small, shadow: r.shadow };
    cache.set(kind, s);
  }
  return s;
}

export const PROP_KINDS = Object.keys(builders) as PropKind[];
