// World streaming: far whole-town LOD mesh + time-sliced detail chunks
// (ground, buildings, instanced props, colliders) around the player.
import * as THREE from 'three';
import { CELLS, CELL_SIZE, cellKey, type CellIndex, type PropDef, type PropKind, type WorldLayout } from '@dg/shared';
import { buildCellIndex, buildingPieces, heightAt, initialRuinedPieces, type PieceInfo } from '@dg/sim';
import { MeshBuilder } from '../render/geo';
import { makeChunkMaterial, type ChunkUniforms } from '../render/materials';
import { propShape, PROP_KINDS } from '../render/props';
import type { Collider, CollisionWorld } from '../game/collision';
import { buildFarMesh, buildGround, meshBuilding, paletteOf, surfaceHeight } from './mesher';

interface Chunk {
  cx: number;
  cz: number;
  ground: THREE.Mesh;
  bld: THREE.Mesh | null;
  colliders: Collider[];
  props: number[];
  buildings: number[];
  dirty: boolean;
}

interface PropBatch {
  mesh: THREE.InstancedMesh;
  ids: number[]; // slot -> prop id
}

const m4 = new THREE.Matrix4();
const q = new THREE.Quaternion();
const v = new THREE.Vector3();
const s = new THREE.Vector3();
const col = new THREE.Color();
const UP = new THREE.Vector3(0, 1, 0);

export class WorldView {
  readonly group = new THREE.Group();
  readonly cells: CellIndex[];
  private chunks = new Map<number, Chunk>();
  private pieceCache = new Map<number, PieceInfo[]>();
  readonly removedPieces = new Map<number, Set<number>>();
  readonly removedProps = new Set<number>();
  private batches = new Map<PropKind, PropBatch>();
  private propSlot = new Map<number, number>(); // prop id -> slot
  private loadedTex: THREE.DataTexture;
  private loadedData: Uint8Array;
  readonly chunkMat = makeChunkMaterial();
  readonly groundMat = makeChunkMaterial();
  readonly propMat = makeChunkMaterial();
  private farMat: THREE.MeshLambertMaterial;
  far: THREE.Mesh;
  radius = 2;
  propDensity = 1;
  lastBuildMs = 0;
  /** extra lit factor for windows (habitation) per district index */
  windowLit: number[] = [];
  onChunkLoaded: ((cx: number, cz: number) => void) | null = null;

  constructor(readonly layout: WorldLayout, private collision: CollisionWorld, private castShadows: boolean) {
    this.cells = buildCellIndex(layout);
    this.windowLit = layout.districts.map((d) => (d.key === 'haven' ? 0.35 : 0.04));
    // loaded-cell texture used by the far mesh to collapse geometry inside detail chunks
    this.loadedData = new Uint8Array(CELLS * CELLS * 4);
    this.loadedTex = new THREE.DataTexture(this.loadedData, CELLS, CELLS, THREE.RGBAFormat);
    this.loadedTex.needsUpdate = true;
    this.farMat = this.makeFarMaterial();
    const far = buildFarMesh(layout, (x, z) => heightAt(layout, x, z));
    this.far = new THREE.Mesh(far.geo, this.farMat);
    this.far.frustumCulled = false;
    this.far.receiveShadow = false;
    this.group.add(this.far);
    // instanced prop batches, sized for the whole town per kind
    const counts = new Map<PropKind, number>();
    for (const p of layout.props) counts.set(p.kind, (counts.get(p.kind) ?? 0) + 1);
    for (const kind of PROP_KINDS) {
      const n = counts.get(kind) ?? 0;
      if (n === 0) continue;
      const shape = propShape(kind);
      const mesh = new THREE.InstancedMesh(shape.geo, this.propMat, n);
      mesh.count = 0;
      mesh.castShadow = shape.shadow && castShadows;
      mesh.receiveShadow = true;
      mesh.frustumCulled = false;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.setColorAt(0, col.setRGB(1, 1, 1));
      this.group.add(mesh);
      this.batches.set(kind, { mesh, ids: [] });
    }
  }

  get chunkCount(): number {
    return this.chunks.size;
  }

  get uniforms(): ChunkUniforms[] {
    return [this.chunkMat.userData.u, this.propMat.userData.u, this.groundMat.userData.u, this.farMat.userData.u as ChunkUniforms];
  }

  private makeFarMaterial(): THREE.MeshLambertMaterial & { userData: { u: ChunkUniforms } } {
    const m = makeChunkMaterial();
    const prev = m.onBeforeCompile;
    const tex = this.loadedTex;
    m.onBeforeCompile = (shader, r) => {
      prev.call(m, shader, r);
      shader.uniforms.uLoaded = { value: tex };
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>\nattribute vec2 aCenter;\nuniform sampler2D uLoaded;`)
        .replace(
          '#include <project_vertex>',
          `#include <project_vertex>
          vec2 cc = floor(aCenter / ${CELL_SIZE.toFixed(1)}) + 0.5;
          float loaded = texture2D(uLoaded, cc / ${CELLS.toFixed(1)}).r;
          if (loaded > 0.5) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);`,
        );
    };
    m.customProgramCacheKey = () => 'dg-far';
    return m;
  }

  height(x: number, z: number): number {
    return heightAt(this.layout, x, z);
  }

  /** Walkable surface height (terrain + sidewalk/water offsets). */
  surface(x: number, z: number): number {
    return surfaceHeight(this.layout, x, z, heightAt(this.layout, x, z));
  }

  pieces(bid: number): PieceInfo[] {
    let p = this.pieceCache.get(bid);
    if (!p) {
      const b = this.layout.buildings[bid];
      p = buildingPieces(b);
      this.pieceCache.set(bid, p);
      if (!this.removedPieces.has(bid)) {
        const ruined = initialRuinedPieces(b, p);
        if (ruined.length) this.removedPieces.set(bid, new Set(ruined));
      }
    }
    return p;
  }

  removed(bid: number): Set<number> {
    let r = this.removedPieces.get(bid);
    if (!r) {
      this.pieces(bid);
      r = this.removedPieces.get(bid);
      if (!r) this.removedPieces.set(bid, (r = new Set()));
    }
    return r;
  }

  /** Stream around (x,z). Builds at most one chunk per call within budget. */
  update(x: number, z: number): void {
    const pcx = Math.floor(x / CELL_SIZE), pcz = Math.floor(z / CELL_SIZE);
    const R = this.radius;
    // unload far chunks (hysteresis +1)
    for (const [k, c] of this.chunks) {
      if (Math.max(Math.abs(c.cx - pcx), Math.abs(c.cz - pcz)) > R + 1) this.unload(k, c);
    }
    // rebuild dirty chunks first (deconstruction)
    for (const c of this.chunks.values()) {
      if (c.dirty) {
        const t0 = performance.now();
        this.rebuildBuildings(c);
        this.lastBuildMs = performance.now() - t0;
        return;
      }
    }
    // load nearest missing chunk
    let best: [number, number] | null = null;
    let bestD = Infinity;
    for (let dz = -R; dz <= R; dz++)
      for (let dx = -R; dx <= R; dx++) {
        const cx = pcx + dx, cz = pcz + dz;
        if (cx < 0 || cz < 0 || cx >= CELLS || cz >= CELLS) continue;
        if (this.chunks.has(cellKey(cx, cz))) continue;
        const d = dx * dx + dz * dz;
        if (d < bestD) {
          bestD = d;
          best = [cx, cz];
        }
      }
    if (best) {
      const t0 = performance.now();
      this.load(best[0], best[1]);
      this.lastBuildMs = performance.now() - t0;
    }
  }

  /** Synchronously load everything around a point (spawn / teleport). */
  loadAround(x: number, z: number): void {
    for (let i = 0; i < 64; i++) {
      const before = this.chunks.size;
      this.update(x, z);
      if (this.chunks.size === before) break;
    }
  }

  isLoaded(x: number, z: number): boolean {
    return this.chunks.has(cellKey(Math.floor(x / CELL_SIZE), Math.floor(z / CELL_SIZE)));
  }

  private load(cx: number, cz: number): void {
    const key = cellKey(cx, cz);
    const idx = this.cells[key];
    const gb = buildGround(this.layout, cx, cz, (x, z) => heightAt(this.layout, x, z));
    const ground = new THREE.Mesh(gb.toGeometry(true), this.groundMat);
    ground.receiveShadow = true;
    ground.matrixAutoUpdate = false;
    this.group.add(ground);
    const c: Chunk = { cx, cz, ground, bld: null, colliders: [], props: [], buildings: idx?.buildings ?? [], dirty: false };
    this.chunks.set(key, c);
    this.rebuildBuildings(c);
    // props
    for (const pid of idx?.props ?? []) {
      if (this.removedProps.has(pid)) continue;
      const p = this.layout.props[pid];
      const shape = propShape(p.kind);
      if (shape.small && this.propDensity < 1 && ((pid * 2654435761) >>> 0) / 4294967296 > this.propDensity) continue;
      this.addPropInstance(p);
      c.props.push(pid);
      if (shape.col) {
        const [hx, hy, hz] = shape.col;
        const cs = Math.abs(Math.cos(p.rotY)), sn = Math.abs(Math.sin(p.rotY));
        const ex = (cs * hx + sn * hz) * p.scale, ez = (sn * hx + cs * hz) * p.scale;
        // trees: trunk only
        const trunk = p.kind === 'tree' || p.kind === 'pine';
        const ax = trunk ? 0.3 : ex, az = trunk ? 0.3 : ez;
        c.colliders.push(this.collision.add({ minX: p.x - ax, maxX: p.x + ax, minY: p.y, maxY: p.y + hy * 2 * p.scale, minZ: p.z - az, maxZ: p.z + az, tag: 'prop', ref: pid }));
      }
    }
    this.loadedData[(cz * CELLS + cx) * 4] = 255;
    this.loadedTex.needsUpdate = true;
    this.onChunkLoaded?.(cx, cz);
  }

  private unload(key: number, c: Chunk): void {
    c.ground.geometry.dispose();
    this.group.remove(c.ground);
    if (c.bld) {
      c.bld.geometry.dispose();
      this.group.remove(c.bld);
    }
    for (const cl of c.colliders) this.collision.remove(cl);
    for (const pid of c.props) this.removePropInstance(pid);
    this.chunks.delete(key);
    this.loadedData[(c.cz * CELLS + c.cx) * 4] = 0;
    this.loadedTex.needsUpdate = true;
  }

  private rebuildBuildings(c: Chunk): void {
    c.dirty = false;
    // drop old building colliders (keep prop colliders)
    c.colliders = c.colliders.filter((cl) => {
      if (cl.tag === 'piece') {
        this.collision.remove(cl);
        return false;
      }
      return true;
    });
    if (c.bld) {
      c.bld.geometry.dispose();
      this.group.remove(c.bld);
      c.bld = null;
    }
    if (c.buildings.length === 0) return;
    const mb = new MeshBuilder({ groundAO: true });
    for (const bid of c.buildings) {
      const b = this.layout.buildings[bid];
      const pieces = this.pieces(bid);
      const removed = this.removed(bid);
      meshBuilding(mb, b, pieces, removed, paletteOf(this.layout, b.district), this.windowLit[b.district] ?? 0.05);
      // colliders per remaining piece
      const ang = (b.rot * Math.PI) / 2;
      const cs = Math.round(Math.cos(ang)), sn = Math.round(Math.sin(ang));
      for (const p of pieces) {
        if (removed.has(p.index) || p.kind === 'fixture') continue;
        let minY = p.min[1];
        if (p.kind === 'door') minY = p.min[1] + 2.4;
        // rotate local AABB corners (quarter turns): x' = x*cos + z*sin, z' = -x*sin + z*cos
        const xa = p.min[0] * cs + p.min[2] * sn, za = -p.min[0] * sn + p.min[2] * cs;
        const xb = p.max[0] * cs + p.max[2] * sn, zb = -p.max[0] * sn + p.max[2] * cs;
        c.colliders.push(
          this.collision.add({
            minX: b.x + Math.min(xa, xb), maxX: b.x + Math.max(xa, xb), minY, maxY: p.max[1],
            minZ: b.z + Math.min(za, zb), maxZ: b.z + Math.max(za, zb), tag: 'piece', ref: bid * 1000 + p.index,
          }),
        );
      }
    }
    const geo = mb.toGeometry(true);
    c.bld = new THREE.Mesh(geo, this.chunkMat);
    c.bld.castShadow = this.castShadows;
    c.bld.receiveShadow = true;
    c.bld.matrixAutoUpdate = false;
    this.group.add(c.bld);
  }

  markBuildingDirty(bid: number): void {
    const b = this.layout.buildings[bid];
    const c = this.chunks.get(cellKey(Math.floor(b.x / CELL_SIZE), Math.floor(b.z / CELL_SIZE)));
    if (c) c.dirty = true;
  }

  /** Rebuild a building's chunk immediately (used right after deconstruction for instant feedback). */
  rebuildBuildingNow(bid: number): void {
    const b = this.layout.buildings[bid];
    const c = this.chunks.get(cellKey(Math.floor(b.x / CELL_SIZE), Math.floor(b.z / CELL_SIZE)));
    if (c) {
      const t0 = performance.now();
      this.rebuildBuildings(c);
      this.lastBuildMs = performance.now() - t0;
    }
  }

  private addPropInstance(p: PropDef): void {
    const batch = this.batches.get(p.kind);
    if (!batch) return;
    const slot = batch.ids.length;
    batch.ids.push(p.id);
    this.propSlot.set(p.id, slot);
    this.writeInstance(batch, slot, p);
    batch.mesh.count = batch.ids.length;
  }

  private writeInstance(batch: PropBatch, slot: number, p: PropDef, scaleMul = 1): void {
    q.setFromAxisAngle(UP, p.rotY);
    v.set(p.x, p.y + this.height(p.x, p.z) * (p.building < 0 ? 1 : 0), p.z);
    s.setScalar(p.scale * scaleMul);
    m4.compose(v, q, s);
    batch.mesh.setMatrixAt(slot, m4);
    const shape = propShape(p.kind);
    const tint = shape.tints[((p.id * 2654435761) >>> 0) % shape.tints.length];
    col.setHex(tint);
    // district foliage for vegetation
    if (p.kind === 'tree' || p.kind === 'bush' || p.kind === 'pine') col.lerp(new THREE.Color(paletteOf(this.layout, p.district).foliage), 0.5);
    batch.mesh.setColorAt(slot, col);
    batch.mesh.instanceMatrix.needsUpdate = true;
    if (batch.mesh.instanceColor) batch.mesh.instanceColor.needsUpdate = true;
  }

  /** Squash/stretch or shake a prop instance (hit feedback). */
  pokeProp(pid: number, scaleMul: number, offset = 0): void {
    const p = this.layout.props[pid];
    const batch = this.batches.get(p.kind);
    const slot = this.propSlot.get(pid);
    if (!batch || slot === undefined) return;
    const pp = offset ? { ...p, x: p.x + offset, z: p.z + offset * 0.5 } : p;
    this.writeInstance(batch, slot, pp, scaleMul);
  }

  private removePropInstance(pid: number): void {
    const p = this.layout.props[pid];
    const batch = this.batches.get(p.kind);
    const slot = this.propSlot.get(pid);
    if (!batch || slot === undefined) return;
    const last = batch.ids.length - 1;
    if (slot !== last) {
      const moved = batch.ids[last];
      batch.ids[slot] = moved;
      this.propSlot.set(moved, slot);
      batch.mesh.getMatrixAt(last, m4);
      batch.mesh.setMatrixAt(slot, m4);
      if (batch.mesh.instanceColor) {
        batch.mesh.getColorAt(last, col);
        batch.mesh.setColorAt(slot, col);
        batch.mesh.instanceColor.needsUpdate = true;
      }
    }
    batch.ids.pop();
    this.propSlot.delete(pid);
    batch.mesh.count = batch.ids.length;
    batch.mesh.instanceMatrix.needsUpdate = true;
  }

  /** Permanently remove a prop (deconstructed). */
  destroyProp(pid: number): void {
    if (this.removedProps.has(pid)) return;
    this.removedProps.add(pid);
    this.removePropInstance(pid);
    const p = this.layout.props[pid];
    const c = this.chunks.get(cellKey(Math.floor(p.x / CELL_SIZE), Math.floor(p.z / CELL_SIZE)));
    if (c) {
      c.props = c.props.filter((x) => x !== pid);
      c.colliders = c.colliders.filter((cl) => {
        if (cl.tag === 'prop' && cl.ref === pid) {
          this.collision.remove(cl);
          return false;
        }
        return true;
      });
    }
  }

  /** Props currently loaded near (x,z) within r (for interaction targeting). */
  propsNear(x: number, z: number, r: number, out: number[]): number[] {
    out.length = 0;
    const cx0 = Math.floor((x - r) / CELL_SIZE), cx1 = Math.floor((x + r) / CELL_SIZE);
    const cz0 = Math.floor((z - r) / CELL_SIZE), cz1 = Math.floor((z + r) / CELL_SIZE);
    for (let cz = cz0; cz <= cz1; cz++)
      for (let cx = cx0; cx <= cx1; cx++) {
        const c = this.chunks.get(cellKey(cx, cz));
        if (!c) continue;
        for (const pid of c.props) {
          const p = this.layout.props[pid];
          const dx = p.x - x, dz = p.z - z;
          if (dx * dx + dz * dz <= r * r) out.push(pid);
        }
      }
    return out;
  }

  setShadows(on: boolean): void {
    this.castShadows = on;
    for (const c of this.chunks.values()) if (c.bld) c.bld.castShadow = on;
    for (const [k, b] of this.batches) b.mesh.castShadow = on && propShape(k).shadow;
  }

  dispose(): void {
    for (const [k, c] of this.chunks) this.unload(k, c);
    this.far.geometry.dispose();
    for (const b of this.batches.values()) b.mesh.dispose();
    this.loadedTex.dispose();
  }
}
