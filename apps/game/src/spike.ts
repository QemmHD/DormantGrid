// Phase 0 iPhone stress spike (?spike=1). Instanced buildings, ~10k props,
// 40 animated skinned characters, streamed ground. Perf overlay always on.
import * as THREE from 'three';
import { Rng, type PropKind } from '@dg/shared';
import { Renderer, type QualityTier } from './core/renderer';
import { PerfOverlay } from './core/perf';
import { Atmosphere } from './render/sky';
import { propShape } from './render/props';
import { CharacterRig, randomLook } from './render/character';
import { MeshBuilder } from './render/geo';
import { makeChunkMaterial } from './render/materials';

export async function runSpike(): Promise<void> {
  const params = new URLSearchParams(location.search);
  const tier = (params.get('tier') as QualityTier) || 'medium';
  const renderer = new Renderer(document.getElementById('view')!, tier);
  const perf = new PerfOverlay(renderer);
  perf.toggle(true);
  const scene = new THREE.Scene();
  const cam = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.1, 1200);
  const atm = new Atmosphere(scene, renderer.quality.shadows ? renderer.quality.shadowSize : 0);
  const rng = new Rng(42);

  // streamed ground: 9x9 chunks of 64 m around the camera, rebuilt as it moves
  const groundMat = makeChunkMaterial();
  const chunks = new Map<string, THREE.Mesh>();
  const makeChunk = (cx: number, cz: number) => {
    const b = new MeshBuilder();
    for (let z = 0; z < 16; z++)
      for (let x = 0; x < 16; x++) {
        const road = x % 8 === 0 || z % 8 === 0;
        b.setColor(road ? 0x3a3d40 : (x + z) % 2 ? 0x5a5a4c : 0x55574a);
        const X = cx * 64 + x * 4, Z = cz * 64 + z * 4;
        b.quad([X, 0, Z + 4], [X + 4, 0, Z + 4], [X + 4, 0, Z], [X, 0, Z]);
      }
    const g = b.toGeometry(true);
    const m = new THREE.Mesh(g, groundMat);
    m.receiveShadow = true;
    scene.add(m);
    return m;
  };

  // instanced buildings
  const bb = new MeshBuilder({ groundAO: true });
  bb.setColor(0xffffff);
  bb.bevelBox(0, 0.5, 0, 0.5, 0.5, 0.5, 0.03);
  const bGeo = bb.toGeometry(true);
  const NB = 1500;
  const bMesh = new THREE.InstancedMesh(bGeo, makeChunkMaterial(), NB);
  const m4 = new THREE.Matrix4();
  const col = new THREE.Color();
  for (let i = 0; i < NB; i++) {
    const x = rng.range(-600, 600), z = rng.range(-600, 600);
    const w = rng.int(2, 5) * 4, d = rng.int(2, 5) * 4, h = rng.int(1, 6) * 3.2;
    m4.compose(new THREE.Vector3(x, 0, z), new THREE.Quaternion(), new THREE.Vector3(w, h, d));
    bMesh.setMatrixAt(i, m4);
    bMesh.setColorAt(i, col.setHex(rng.pick([0x8a7a66, 0x6e7479, 0x58606a, 0x9c8f78])));
  }
  bMesh.castShadow = true;
  bMesh.receiveShadow = true;
  scene.add(bMesh);

  // ~10k props over 12 kinds
  const kinds: PropKind[] = ['car', 'tree', 'bush', 'rubble', 'barrel', 'crate', 'streetlight', 'trashbag', 'pine', 'fence', 'dumpster', 'bench'];
  const per = Math.floor(10000 / kinds.length);
  for (const k of kinds) {
    const s = propShape(k);
    const im = new THREE.InstancedMesh(s.geo, makeChunkMaterial(), per);
    for (let i = 0; i < per; i++) {
      m4.compose(new THREE.Vector3(rng.range(-500, 500), 0, rng.range(-500, 500)), new THREE.Quaternion().setFromAxisAngle(THREE.Object3D.DEFAULT_UP, rng.range(0, 6.28)), new THREE.Vector3(1, 1, 1));
      im.setMatrixAt(i, m4);
      im.setColorAt(i, col.setHex(rng.pick(s.tints)));
    }
    im.castShadow = s.shadow;
    im.receiveShadow = true;
    scene.add(im);
  }

  // 40 characters
  const rigs: CharacterRig[] = [];
  for (let i = 0; i < 40; i++) {
    const r = new CharacterRig(randomLook(i * 77 + 3));
    r.root.position.set(rng.range(-30, 30), 0, rng.range(-30, 30));
    r.speed = i % 3 === 0 ? 0 : i % 3 === 1 ? 2 : 5;
    scene.add(r.root);
    rigs.push(r);
  }

  let last = performance.now();
  let t = 0;
  const frame = () => {
    const now = performance.now();
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    t += dt;
    // camera flies slowly in a circle so streaming triggers
    const R = 120;
    const p = new THREE.Vector3(Math.cos(t * 0.05) * R, 14, Math.sin(t * 0.05) * R);
    cam.position.copy(p);
    cam.lookAt(p.x + Math.cos(t * 0.05 + 1.6) * 40, 2, p.z + Math.sin(t * 0.05 + 1.6) * 40);
    const ccx = Math.floor(p.x / 64), ccz = Math.floor(p.z / 64);
    const want = new Set<string>();
    for (let z = -4; z <= 4; z++) for (let x = -4; x <= 4; x++) want.add(`${ccx + x},${ccz + z}`);
    for (const [k, m] of chunks)
      if (!want.has(k)) {
        m.geometry.dispose();
        scene.remove(m);
        chunks.delete(k);
      }
    let built = 0;
    for (const k of want)
      if (!chunks.has(k) && built < 2) {
        const [x, z] = k.split(',').map(Number);
        chunks.set(k, makeChunk(x, z));
        built++;
      }
    for (const r of rigs) {
      r.update(dt);
      r.root.position.x += Math.sin(r.root.rotation.y) * r.speed * dt;
      r.root.position.z += Math.cos(r.root.rotation.y) * r.speed * dt;
      r.root.rotation.y += dt * 0.3;
    }
    atm.update(dt, 10 + t * 0.2, 'clear', 0.5, p, cam.position, renderer.quality.fogFar, t);
    renderer.syncSize(cam);
    renderer.render(scene, cam);
    const ms = performance.now() - now;
    renderer.adapt(ms, now);
    perf.frame(ms, now, { chunks: chunks.size, chunkBuildMs: 0, entities: rigs.length, colliders: 0 });
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}
