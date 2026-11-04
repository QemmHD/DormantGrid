// Tier B model loading: replaces procedural (Tier A) meshes with ingested GLB
// models listed in models/manifest.json (copied from assets/ at build time).
//
// - Nothing is downloaded unless the manifest lists a model the runtime can use
//   ("runtime": "live"); GLTFLoader + the meshopt decoder are a lazy chunk.
// - Any failure (404, bad file, odd attributes) leaves the procedural version in
//   place and is reported, never thrown. Procedural fallback always stays.
// - Live today: props (instanced batches) and rigid enemies. Buildings and rigged
//   characters are validated by ingest but still drawn procedurally ("pending").
import * as THREE from 'three';
import type { PropKind } from '@dg/shared';

export interface ModelManifestEntry {
  path: string;
  kind: string;
  stable?: string;
  runtime?: string;
  replaces?: { prop?: string; enemy?: string; building?: string; character?: string; node?: string };
}

export interface ModelReport {
  loaded: string[];
  failed: { id: string; reason: string }[];
  pending: string[];
}

export interface ModelSinks {
  prop(kind: PropKind, geo: THREE.BufferGeometry, mat: THREE.Material | THREE.Material[]): void;
  enemy(kind: string, geo: THREE.BufferGeometry, mat: THREE.Material | THREE.Material[]): void;
}

/** Pick one entry per stable id (lowest variant wins, e.g. _01). */
export function pickEntries(assets: Record<string, ModelManifestEntry>): [string, ModelManifestEntry][] {
  const best = new Map<string, [string, ModelManifestEntry]>();
  for (const [id, e] of Object.entries(assets).sort(([a], [b]) => a.localeCompare(b))) {
    if (e.kind !== 'model') continue;
    const stable = e.stable ?? id.replace(/_\d{2}$/, '');
    if (!best.has(stable)) best.set(stable, [id, e]);
  }
  return [...best.values()];
}

function sliceVertices(g: THREE.BufferGeometry, start: number, count: number): THREE.BufferGeometry {
  const out = new THREE.BufferGeometry();
  for (const [name, attr] of Object.entries(g.attributes)) {
    const a = attr as THREE.BufferAttribute;
    const n = Math.max(0, Math.min(count, a.count - start));
    const arr = new Float32Array(n * a.itemSize);
    for (let i = 0; i < n; i++) for (let k = 0; k < a.itemSize; k++) arr[i * a.itemSize + k] = a.getComponent(start + i, k);
    out.setAttribute(name, new THREE.BufferAttribute(arr, a.itemSize));
  }
  return out;
}

/** Merge a loaded scene into one geometry (groups per material), base-centered, front +Z. */
export function bakeScene(root: THREE.Object3D): { geo: THREE.BufferGeometry; materials: THREE.Material[] } | null {
  root.updateMatrixWorld(true);
  const parts: { geo: THREE.BufferGeometry; mat: THREE.Material }[] = [];
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || (m as unknown as THREE.SkinnedMesh).isSkinnedMesh) return;
    const mats = Array.isArray(m.material) ? m.material : [m.material];
    let g = m.geometry.clone().applyMatrix4(m.matrixWorld);
    // de-index first: group start/count then address vertices directly
    if (g.index) g = g.toNonIndexed();
    if (mats.length > 1 && g.groups.length) {
      for (const grp of g.groups) parts.push({ geo: sliceVertices(g, grp.start, grp.count), mat: mats[grp.materialIndex ?? 0] });
    } else parts.push({ geo: g, mat: mats[0] });
  });
  if (!parts.length) return null;
  // common attribute set: position + normal + uv (+ color only if every part has it)
  const allColor = parts.every((p) => !!p.geo.getAttribute('color'));
  const geos = parts.map((p) => {
    const src = p.geo;
    const out = new THREE.BufferGeometry();
    out.setAttribute('position', src.getAttribute('position'));
    if (!src.getAttribute('normal')) src.computeVertexNormals();
    out.setAttribute('normal', src.getAttribute('normal'));
    const n = src.getAttribute('position').count;
    out.setAttribute('uv', src.getAttribute('uv') ?? new THREE.BufferAttribute(new Float32Array(n * 2), 2));
    if (allColor) out.setAttribute('color', src.getAttribute('color'));
    return out;
  });
  // concatenate (non-indexed) with one group per part
  const total = geos.reduce((a, g) => a + g.getAttribute('position').count, 0);
  const merged = new THREE.BufferGeometry();
  const attrs: [string, number][] = [['position', 3], ['normal', 3], ['uv', 2]];
  if (allColor) attrs.push(['color', geos[0].getAttribute('color').itemSize]);
  for (const [name, size] of attrs) {
    const arr = new Float32Array(total * size);
    let off = 0;
    for (const g of geos) {
      const a = g.getAttribute(name) as THREE.BufferAttribute;
      for (let i = 0; i < a.count; i++) for (let k = 0; k < size; k++) arr[off + i * size + k] = a.getComponent(i, k);
      off += a.count * size;
    }
    merged.setAttribute(name, new THREE.BufferAttribute(arr, size));
  }
  const materials: THREE.Material[] = [];
  let start = 0;
  parts.forEach((p, i) => {
    const count = geos[i].getAttribute('position').count;
    let mi = materials.indexOf(p.mat);
    if (mi < 0) mi = materials.push(p.mat) - 1;
    merged.addGroup(start, count, mi);
    start += count;
  });
  // re-base: pivot at the center of the base
  merged.computeBoundingBox();
  const bb = merged.boundingBox!;
  merged.translate(-(bb.min.x + bb.max.x) / 2, -bb.min.y, -(bb.min.z + bb.max.z) / 2);
  merged.computeBoundingBox();
  merged.computeBoundingSphere();
  return { geo: merged, materials: materials.map((m) => toLambert(m, allColor)) };
}

/** Cheap material for iPhone: Lambert keeps the base color/texture/emissive, drops PBR. */
function toLambert(src: THREE.Material, vertexColors: boolean): THREE.Material {
  const s = src as THREE.MeshStandardMaterial;
  const m = new THREE.MeshLambertMaterial({
    color: s.color ? s.color.clone() : new THREE.Color(1, 1, 1),
    map: s.map ?? null,
    emissive: s.emissive ? s.emissive.clone() : new THREE.Color(0, 0, 0),
    emissiveMap: s.emissiveMap ?? null,
    transparent: s.transparent,
    alphaTest: s.alphaTest,
    side: s.side,
    vertexColors,
  });
  m.name = src.name;
  return m;
}

/**
 * Fetch the model manifest and apply every live replacement. Resolves with a
 * report; never rejects.
 */
export async function loadModelOverrides(base: string, sinks: ModelSinks, fetchImpl: typeof fetch = fetch): Promise<ModelReport> {
  const report: ModelReport = { loaded: [], failed: [], pending: [] };
  let manifest: { assets?: Record<string, ModelManifestEntry> };
  try {
    const r = await fetchImpl(`${base}models/manifest.json`, { cache: 'no-cache' });
    if (!r.ok) return report;
    manifest = (await r.json()) as typeof manifest;
  } catch {
    return report; // offline / not deployed: procedural everything
  }
  const entries = pickEntries(manifest.assets ?? {});
  const live = entries.filter(([, e]) => e.runtime === 'live' && (e.replaces?.prop || e.replaces?.enemy));
  for (const [id] of entries) if (!live.some(([l]) => l === id)) report.pending.push(id);
  if (!live.length) return report;
  let loader: { loadAsync(url: string): Promise<{ scene: THREE.Object3D }> };
  try {
    const [{ GLTFLoader }, { MeshoptDecoder }] = await Promise.all([
      import('three/examples/jsm/loaders/GLTFLoader.js'),
      import('three/examples/jsm/libs/meshopt_decoder.module.js'),
    ]);
    const l = new GLTFLoader();
    l.setMeshoptDecoder(MeshoptDecoder);
    loader = l;
  } catch (err) {
    for (const [id] of live) report.failed.push({ id, reason: `loader unavailable: ${String(err)}` });
    return report;
  }
  for (const [id, e] of live) {
    try {
      const gltf = await loader.loadAsync(`${base}models/${e.path}`);
      const baked = bakeScene(gltf.scene);
      if (!baked) throw new Error('no meshes');
      const mat = baked.materials.length === 1 ? baked.materials[0] : baked.materials;
      if (e.replaces?.prop) sinks.prop(e.replaces.prop as PropKind, baked.geo, mat);
      else if (e.replaces?.enemy) sinks.enemy(e.replaces.enemy, baked.geo, mat);
      report.loaded.push(id);
    } catch (err) {
      report.failed.push({ id, reason: String((err as Error)?.message ?? err).slice(0, 200) });
    }
  }
  return report;
}
