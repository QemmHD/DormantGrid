// Restoration payoff (review gap #4): a rebooted district must look and sound different,
// not just shift tint. Driven by the sim's RESTORATION_FX table (lamps / plants / people /
// cleanup per state), plus a local boost within NODE_GLOW m of every node that is online,
// so the streets around a node change the moment it syncs.
//
// Everything is deterministic from the save (district states + online nodes), rebuilt only
// when those or the player's 64 m cell change. Budget: ≤ 96 lamp glows + 96 light pools
// (2 draw calls), ≤ 3 decor batches, ≤ 6 walkers (one skinned draw each).
import * as THREE from 'three';
import { hash2, type PropDef, type RestorationState } from '@dg/shared';
import { districtAt, RESTORATION_FX } from '@dg/sim';
import type { Game } from './game';
import { CharacterRig, randomLook } from '../render/character';
import { propShape } from '../render/props';
import { audio } from '../audio/audio';

const RANGE = 150; // m around the player
const NODE_GLOW = 130; // m around an online node that counts as at least Powered
const MAX_LAMPS = 96;
const MAX_DECOR = 160;
const MAX_WALKERS = 6;
const HAZARDS = new Set(['rubble', 'debris', 'cone', 'barrier', 'trashbag', 'tire']);
const DECOR_KINDS = ['planter', 'bush', 'bench'] as const;

const m4 = new THREE.Matrix4();
const q = new THREE.Quaternion();
const v = new THREE.Vector3();
const sc = new THREE.Vector3();
const col = new THREE.Color();

function glowTexture(): THREE.DataTexture {
  const n = 32;
  const d = new Uint8Array(n * n * 4);
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      const r = Math.hypot((x + 0.5) / n - 0.5, (y + 0.5) / n - 0.5) * 2;
      const a = Math.max(0, 1 - r) ** 2;
      const i = (y * n + x) * 4;
      d[i] = d[i + 1] = d[i + 2] = 255;
      d[i + 3] = Math.round(a * 255);
    }
  const t = new THREE.DataTexture(d, n, n, THREE.RGBAFormat);
  t.magFilter = t.minFilter = THREE.LinearFilter;
  t.needsUpdate = true;
  return t;
}

interface Walker {
  rig: CharacterRig;
  a: THREE.Vector3;
  b: THREE.Vector3;
  toB: boolean;
  wait: number;
  active: boolean;
}

export interface RestorationStats {
  litLamps: number;
  decor: number;
  walkers: number;
  cleared: number;
  effectiveState: number;
}

export class Restoration {
  private glow: THREE.InstancedMesh;
  private pools: THREE.InstancedMesh;
  private glowMat: THREE.MeshBasicMaterial;
  private poolMat: THREE.MeshBasicMaterial;
  private decor = new Map<string, THREE.InstancedMesh>();
  private lampHeads: THREE.Vector3[] = [];
  private walkers: Walker[] = [];
  private key = '';
  private chirpT = 3;
  private cleared = new Set<number>();
  readonly stats: RestorationStats = { litLamps: 0, decor: 0, walkers: 0, cleared: 0, effectiveState: 0 };

  constructor(private game: Game) {
    const tex = glowTexture();
    this.glowMat = new THREE.MeshBasicMaterial({ map: tex, color: 0xffc070, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: true });
    this.glow = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), this.glowMat, MAX_LAMPS);
    const pg = new THREE.PlaneGeometry(1, 1);
    pg.rotateX(-Math.PI / 2);
    this.poolMat = new THREE.MeshBasicMaterial({ map: tex, color: 0xffa850, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, polygonOffset: true, polygonOffsetFactor: -2, fog: true });
    this.pools = new THREE.InstancedMesh(pg, this.poolMat, MAX_LAMPS);
    for (const m of [this.glow, this.pools]) {
      m.count = 0;
      m.frustumCulled = false;
      m.renderOrder = 3;
      game.scene.add(m);
    }
    game.tickers.push((dt, simDt) => this.tick(dt, simDt));
    game.resetHooks.push(() => {
      this.key = '';
      this.cleared.clear();
    });
  }

  /** effective restoration state at a point: district state, at least Powered near an online node */
  stateAt(x: number, z: number): RestorationState {
    const g = this.game;
    const d = districtAt(g.layout, x, z);
    const ds = g.save.world.districts[d.index];
    let st = (ds?.state ?? 0) as number;
    if (ds && st < 2 && ds.nodesOnline.length) {
      for (const id of ds.nodesOnline) {
        const n = g.layout.nodes[id];
        if (n && Math.hypot(n.x - x, n.z - z) < NODE_GLOW) {
          st = 2;
          break;
        }
      }
    }
    return Math.min(4, st) as RestorationState;
  }

  private stateKey(): string {
    const g = this.game;
    const p = g.player.pos;
    return `${Math.floor(p.x / 64)},${Math.floor(p.z / 64)}|${g.save.world.districts.map((d) => `${d.state}:${d.nodesOnline.length}`).join(',')}`;
  }

  private propsAround(x: number, z: number): PropDef[] {
    const g = this.game;
    const out: PropDef[] = [];
    const cx = Math.floor(x / 64), cz = Math.floor(z / 64);
    const R = Math.ceil(RANGE / 64);
    for (let dz = -R; dz <= R; dz++)
      for (let dx = -R; dx <= R; dx++) {
        const cell = g.view.cells[(cz + dz) * 19 + (cx + dx)];
        if (!cell || cx + dx < 0 || cz + dz < 0 || cx + dx >= 19 || cz + dz >= 19) continue;
        for (const id of cell.props) {
          const p = g.layout.props[id];
          if (p.building < 0 && Math.abs(p.x - x) < RANGE && Math.abs(p.z - z) < RANGE) out.push(p);
        }
      }
    return out;
  }

  /** Rebuild lamps, decor, hazard cleanup and walker routes for the area around the player. */
  rebuild(): void {
    const g = this.game;
    const p = g.player.pos;
    const props = this.propsAround(p.x, p.z);
    const heads: THREE.Vector3[] = [];
    const poolsAt: THREE.Vector3[] = [];
    const decorAt: Record<string, { x: number; y: number; z: number; r: number; s: number }[]> = { planter: [], bush: [], bench: [] };
    const routes: { a: THREE.Vector3; b: THREE.Vector3; d: number }[] = [];
    const lampsByDistrict = new Map<number, PropDef[]>();
    for (const pr of props) {
      const st = this.stateAt(pr.x, pr.z);
      if (st <= 0) continue;
      const fx = RESTORATION_FX[st];
      const h = (k: number) => (hash2(pr.id, k) % 1000) / 1000;
      if (HAZARDS.has(pr.kind) && h(3) < fx.cleanup && !g.view.removedProps.has(pr.id)) {
        g.view.destroyProp(pr.id);
        this.cleared.add(pr.id);
        continue;
      }
      if (pr.kind !== 'streetlight' || g.view.removedProps.has(pr.id)) continue;
      const ground = g.view.surface(pr.x, pr.z);
      const c = Math.cos(pr.rotY), s = Math.sin(pr.rotY);
      // lamp head sits at local (0, 5.29, 1.0); local x runs along the road
      const lx = pr.x + s * 1.0 * pr.scale, lz = pr.z + c * 1.0 * pr.scale;
      if (h(1) < fx.lamps && heads.length < MAX_LAMPS) {
        heads.push(new THREE.Vector3(lx, ground + 5.25 * pr.scale, lz));
        poolsAt.push(new THREE.Vector3(lx, g.view.surface(lx, lz), lz));
        const d = districtAt(g.layout, pr.x, pr.z).index;
        if (!lampsByDistrict.has(d)) lampsByDistrict.set(d, []);
        lampsByDistrict.get(d)!.push(pr);
      }
      // planters / flowering bushes / benches beside the lamp, back from the curb
      for (const side of [-1, 1]) {
        if (h(10 + side) >= fx.plants) continue;
        const ox = c * side * 2.6 - s * 0.7, oz = -s * side * 2.6 - c * 0.7;
        const x = pr.x + ox, z = pr.z + oz;
        const kind = DECOR_KINDS[hash2(pr.id, 20 + side) % 3];
        decorAt[kind].push({ x, y: g.view.surface(x, z), z, r: kind === 'bench' ? pr.rotY + Math.PI : h(30 + side) * 6.28, s: kind === 'bush' ? 0.75 + h(40) * 0.3 : 1 });
      }
    }
    // walker routes: pairs of lit lamps on the same side of a street, 12-45 m apart
    for (const [d, lamps] of lampsByDistrict) {
      const st = Math.max(...lamps.map((l) => this.stateAt(l.x, l.z))) as RestorationState;
      const want = Math.round(RESTORATION_FX[st].people * 3);
      for (let i = 0; i < lamps.length && routes.length < MAX_WALKERS && want > routes.filter((r) => r.d === d).length; i++) {
        const a = lamps[i];
        const b = lamps.find((o) => o !== a && Math.abs(o.rotY - a.rotY) < 0.1 && Math.hypot(o.x - a.x, o.z - a.z) > 12 && Math.hypot(o.x - a.x, o.z - a.z) < 45);
        if (!b) continue;
        routes.push({ a: new THREE.Vector3(a.x, 0, a.z), b: new THREE.Vector3(b.x, 0, b.z), d });
      }
    }
    this.lampHeads = heads;
    this.pools.count = poolsAt.length;
    poolsAt.forEach((pp, i) => this.pools.setMatrixAt(i, m4.compose(v.set(pp.x, pp.y + 0.04, pp.z), q.identity(), sc.set(14, 1, 14))));
    this.pools.instanceMatrix.needsUpdate = true;
    this.glow.count = heads.length;
    // decor batches
    let decorN = 0;
    for (const kind of DECOR_KINDS) {
      let mesh = this.decor.get(kind);
      if (!mesh) {
        const shape = propShape(kind);
        mesh = new THREE.InstancedMesh(shape.geo, g.view.propMat, MAX_DECOR);
        mesh.frustumCulled = false;
        mesh.castShadow = false;
        mesh.receiveShadow = true;
        g.scene.add(mesh);
        this.decor.set(kind, mesh);
      }
      const list = decorAt[kind].slice(0, MAX_DECOR);
      list.forEach((d, i) => {
        q.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, d.r);
        mesh!.setMatrixAt(i, m4.compose(v.set(d.x, d.y, d.z), q, sc.set(d.s, d.s, d.s)));
        // restored greenery is lusher than the ruin's
        mesh!.setColorAt(i, kind === 'bush' ? col.setHex(i % 3 ? 0x6f8f4a : 0x8a7a5a) : kind === 'planter' ? col.setHex(0xe8e0d0) : col.setHex(0xd8c8b0));
      });
      mesh.count = list.length;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      decorN += list.length;
    }
    // walkers
    while (this.walkers.length < routes.length) {
      const rig = new CharacterRig(randomLook(9000 + this.walkers.length * 37, { backpack: false }));
      g.scene.add(rig.root);
      this.walkers.push({ rig, a: new THREE.Vector3(), b: new THREE.Vector3(), toB: true, wait: 0, active: false });
    }
    this.walkers.forEach((w, i) => {
      const r = routes[i];
      w.active = !!r;
      w.rig.root.visible = w.active;
      if (!r) return;
      w.a.copy(r.a);
      w.b.copy(r.b);
      w.rig.root.position.set(r.a.x, g.view.surface(r.a.x, r.a.z), r.a.z);
      w.toB = true;
      w.wait = (i % 3) * 1.5;
    });
    this.stats.litLamps = heads.length;
    this.stats.decor = decorN;
    this.stats.walkers = routes.length;
    this.stats.cleared = this.cleared.size;
  }

  private tick(dt: number, simDt: number): void {
    const g = this.game;
    if (!g.save || g.mode === 'menu') return;
    const k = this.stateKey();
    if (k !== this.key) {
      this.key = k;
      this.rebuild();
    }
    const night = 1 - g.atm.daylight;
    this.stats.effectiveState = this.stateAt(g.player.pos.x, g.player.pos.z);
    // lamps glow mostly at night; billboards face the camera
    this.glowMat.opacity = 0.18 + night * 0.82;
    this.poolMat.opacity = 0.04 + night * 0.85;
    const cq = g.camera.cam.quaternion;
    this.lampHeads.forEach((h, i) => this.glow.setMatrixAt(i, m4.compose(h, cq, sc.set(2.6, 2.6, 2.6))));
    if (this.lampHeads.length) this.glow.instanceMatrix.needsUpdate = true;
    // walkers stroll between two lamps and pause at each end
    for (const w of this.walkers) {
      if (!w.active) continue;
      const pos = w.rig.root.position;
      const tgt = w.toB ? w.b : w.a;
      if (w.wait > 0) {
        w.wait -= simDt;
        w.rig.speed = 0;
      } else {
        const dx = tgt.x - pos.x, dz = tgt.z - pos.z, d = Math.hypot(dx, dz);
        if (d < 0.4) {
          w.toB = !w.toB;
          w.wait = 2 + Math.random() * 4;
        } else {
          const step = Math.min(d, 1.3 * simDt);
          pos.x += (dx / d) * step;
          pos.z += (dz / d) * step;
          w.rig.root.rotation.y = Math.atan2(dx, dz);
          w.rig.speed = 1.3;
        }
      }
      pos.y = g.view.surface(pos.x, pos.z);
      const near = Math.hypot(g.player.pos.x - pos.x, g.player.pos.z - pos.z) < 7;
      w.rig.lookTarget = near ? g.player.pos : null;
      w.rig.update(simDt);
    }
    // birdsong by day where the district is alive again
    this.chirpT -= simDt;
    if (this.chirpT <= 0) {
      this.chirpT = 2.5 + Math.random() * 5;
      if (this.stats.effectiveState >= 2 && g.atm.daylight > 0.45) {
        const a = Math.random() * 6.28;
        audio.play('chirp', { vol: 0.5, pos: { x: g.player.pos.x + Math.sin(a) * 12, z: g.player.pos.z + Math.cos(a) * 12 } });
      }
    }
  }

  /** Short cinematic beat when a node comes online: crane up over the node, letterbox. */
  beat(x: number, y: number, z: number): void {
    const g = this.game;
    const cam = g.camera;
    const a = cam.yaw + Math.PI;
    cam.override = { pos: new THREE.Vector3(x + Math.sin(a) * 18, y + 14, z + Math.cos(a) * 18), look: new THREE.Vector3(x, y + 4, z), t: 0 };
    document.getElementById('app')?.classList.add('letterbox');
    this.key = ''; // rebuild now so lamps, plants and people appear during the shot
    setTimeout(() => {
      cam.override = null;
      document.getElementById('app')?.classList.remove('letterbox');
    }, 4200);
  }
}
