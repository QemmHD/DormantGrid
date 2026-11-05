// Soft contact shadows (review finding #1: things looked "placed on" the world).
// One instanced mesh of flat, radially-faded dark quads under characters and nearby
// props. One draw call, ≤ 384 quads, rebuilt 4×/s, no per-frame allocation.
import * as THREE from 'three';

const m4 = new THREE.Matrix4();
const q = new THREE.Quaternion();
const v = new THREE.Vector3();
const sc = new THREE.Vector3();

function blobTexture(): THREE.DataTexture {
  const n = 32;
  const d = new Uint8Array(n * n * 4);
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      const r = Math.hypot((x + 0.5) / n - 0.5, (y + 0.5) / n - 0.5) * 2;
      const a = Math.max(0, 1 - r) ** 1.8;
      const i = (y * n + x) * 4;
      d[i] = d[i + 1] = d[i + 2] = 0;
      d[i + 3] = Math.round(a * 255);
    }
  const t = new THREE.DataTexture(d, n, n, THREE.RGBAFormat);
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearFilter;
  t.needsUpdate = true;
  return t;
}

export class ContactShadows {
  readonly mesh: THREE.InstancedMesh;
  private readonly N = 384;
  private n = 0;
  private mat: THREE.MeshBasicMaterial;

  constructor(scene: THREE.Scene) {
    const g = new THREE.PlaneGeometry(1, 1);
    g.rotateX(-Math.PI / 2);
    this.mat = new THREE.MeshBasicMaterial({ map: blobTexture(), transparent: true, depthWrite: false, opacity: 0.5, polygonOffset: true, polygonOffsetFactor: -3, fog: true });
    this.mesh = new THREE.InstancedMesh(g, this.mat, this.N);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 1;
    this.mesh.count = 0;
    scene.add(this.mesh);
  }

  /** 0..1 darkness; stronger when real shadow maps are off */
  set strength(s: number) {
    this.mat.opacity = s;
  }

  begin(): void {
    this.n = 0;
  }

  add(x: number, y: number, z: number, rx: number, rz: number, rot = 0): void {
    if (this.n >= this.N) return;
    q.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, rot);
    m4.compose(v.set(x, y + 0.03, z), q, sc.set(rx * 2, 1, rz * 2));
    this.mesh.setMatrixAt(this.n++, m4);
  }

  end(): void {
    this.mesh.count = this.n;
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}
