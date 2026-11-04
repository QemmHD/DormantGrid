// The Grid: control-node pylons, relay boxes, the reboot sequence
// (route relays → hold-to-sync → defend waves → online) and the district
// restoration showpiece (lights ripple on outward from the node).
import * as THREE from 'three';
import { RESTORATION_NAMES, hash2, type ControlNodeDef, type RestorationState } from '@dg/shared';
import { NODE_RANGE, RELAYS_PER_NODE, restorationFor, routeRelay, startReboot, tickReboot, type NodeEvent, type NodeReboot } from '@dg/sim';
import { MeshBuilder } from '../render/geo';
import { makeChunkMaterial } from '../render/materials';
import { audio } from '../audio/audio';
import { NODE_LINES, RESTORATION_LINES, DISTRICT_INTROS } from '../content/campaign';
import type { Game } from './game';
import type { Enemies } from './enemies';

interface NodeView {
  def: ControlNodeDef;
  group: THREE.Group;
  ring: THREE.Mesh;
  relays: THREE.Vector3[];
  relayMeshes: THREE.Mesh[];
}

const OFF = new THREE.Color(0x6a2a26);
const ON = new THREE.Color(0x39e6d0);

function pylonGeo(): THREE.BufferGeometry {
  const b = new MeshBuilder({ groundAO: true });
  b.setColor(0x4a5054);
  b.bevelBox(0, 0.3, 0, 1.6, 0.3, 1.6, 0.08);
  b.setColor(0x5e6468);
  b.bevelBox(0, 2.2, 0, 0.55, 1.9, 0.55, 0.08);
  b.setColor(0x3a3e42);
  for (const s of [-1, 1]) {
    b.box(s * 0.75, 2.6, 0, 0.12, 2.3, 0.12);
    b.box(0, 2.6, s * 0.75, 0.12, 2.3, 0.12);
  }
  b.setColor(0x2a2e32);
  b.bevelBox(0, 4.4, 0, 0.9, 0.25, 0.9, 0.08);
  b.setColor(0xc8a040);
  b.box(0, 0.62, 1.61, 1.2, 0.04, 0.01);
  // terminal face
  b.setColor(0x39e6d0).setEmissive(2.5);
  b.box(0, 1.6, 0.56, 0.3, 0.22, 0.01);
  b.setEmissive(0);
  return b.toGeometry(true);
}

function relayGeo(): THREE.BufferGeometry {
  const b = new MeshBuilder({ groundAO: true });
  b.setColor(0x5a6066);
  b.bevelBox(0, 0.6, 0, 0.35, 0.6, 0.25, 0.05);
  b.setColor(0x2a2e30);
  b.box(0, 0.9, 0.26, 0.22, 0.15, 0.01);
  b.setColor(0x3a3e42);
  b.cylinder(0, 1.2, 0, 0.05, 0.05, 0.6, 5);
  return b.toGeometry(true);
}

export class Grid {
  private nodes: NodeView[] = [];
  private mat = makeChunkMaterial();
  private active: NodeReboot | null = null;
  private activeView: NodeView | null = null;
  private ringMats = new Map<number, THREE.MeshBasicMaterial>();
  private beam: THREE.Mesh;
  private ripple: { cx: number; cz: number; r: number; district: number } | null = null;
  private relayHold = 0;

  constructor(private game: Game, private enemies: Enemies) {
    const pg = pylonGeo();
    const rg = relayGeo();
    const ringGeo = new THREE.TorusGeometry(1.15, 0.08, 6, 24);
    ringGeo.rotateX(Math.PI / 2);
    const relayLight = new THREE.SphereGeometry(0.09, 6, 4);
    for (const n of game.layout.nodes) {
      const g = new THREE.Group();
      const y = game.view.surface(n.x, n.z);
      g.position.set(n.x, y, n.z);
      const m = new THREE.Mesh(pg, this.mat);
      m.castShadow = true;
      g.add(m);
      const rm = new THREE.MeshBasicMaterial({ color: OFF.clone(), transparent: true, opacity: 0.9 });
      this.ringMats.set(n.id, rm);
      const ring = new THREE.Mesh(ringGeo, rm);
      ring.position.y = 3.6;
      g.add(ring);
      game.scene.add(g);
      const relays: THREE.Vector3[] = [];
      const relayMeshes: THREE.Mesh[] = [];
      for (let i = 0; i < RELAYS_PER_NODE; i++) {
        const a = (i / RELAYS_PER_NODE) * Math.PI * 2 + (hash2(n.id, i) % 100) / 100;
        let rx = n.x + Math.cos(a) * 9, rz = n.z + Math.sin(a) * 9;
        // nudge out of buildings
        for (let k = 0; k < 6; k++) {
          let hit = false;
          game.collision.query(rx - 0.6, rz - 0.6, rx + 0.6, rz + 0.6, (c) => {
            if (c.tag === 'piece') hit = true;
          });
          if (!hit) break;
          rx = n.x + (rx - n.x) * 0.75;
          rz = n.z + (rz - n.z) * 0.75;
        }
        const rmesh = new THREE.Mesh(rg, this.mat);
        rmesh.position.set(rx, game.view.surface(rx, rz), rz);
        rmesh.rotation.y = Math.atan2(n.x - rx, n.z - rz);
        rmesh.castShadow = true;
        const light = new THREE.Mesh(relayLight, new THREE.MeshBasicMaterial({ color: OFF.clone() }));
        light.position.y = 1.85;
        rmesh.add(light);
        rmesh.visible = false;
        game.scene.add(rmesh);
        relays.push(rmesh.position.clone());
        relayMeshes.push(rmesh);
      }
      this.nodes.push({ def: n, group: g, ring, relays, relayMeshes });
    }
    // sync beam (visible while syncing)
    this.beam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.25, 0.25, 60, 8, 1, true),
      new THREE.MeshBasicMaterial({ color: 0x39e6d0, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    this.beam.visible = false;
    game.scene.add(this.beam);
    this.refresh();
    game.tickers.push((dt, simDt) => this.update(dt, simDt));
    game.interactProviders.push({ prompt: () => this.prompt(), handle: (h, p, t, dt) => this.handle(h, p, t, dt) });
  }

  private isOnline(n: ControlNodeDef): boolean {
    return this.game.save.world.districts[n.district]?.nodesOnline.includes(n.id) ?? false;
  }

  /** Re-apply node colors + district window lighting from the save. */
  refresh(): void {
    const w = this.game.save.world;
    for (const nv of this.nodes) {
      const on = this.isOnline(nv.def);
      this.ringMats.get(nv.def.id)!.color.copy(on ? ON : OFF);
      for (const r of nv.relayMeshes) {
        r.visible = this.active?.node === nv.def.id;
        ((r.children[0] as THREE.Mesh).material as THREE.MeshBasicMaterial).color.copy(on ? ON : OFF);
      }
    }
    for (const d of this.game.layout.districts) {
      const st = (w.districts[d.index]?.state ?? 0) as RestorationState;
      const base = d.key === 'haven' ? 0.35 : 0.04;
      this.game.view.windowLit[d.index] = Math.max(base, [0.04, 0.12, 0.45, 0.65, 0.85][st]);
    }
  }

  private nearNode(r: number): NodeView | null {
    const p = this.game.player.pos;
    let best: NodeView | null = null;
    let bd = r;
    for (const n of this.nodes) {
      const d = Math.hypot(n.def.x - p.x, n.def.z - p.z);
      if (d < bd) {
        bd = d;
        best = n;
      }
    }
    return best;
  }

  private nearRelay(): number {
    if (!this.active || !this.activeView || this.active.phase !== 'routing') return -1;
    const p = this.game.player.pos;
    for (let i = 0; i < this.activeView.relays.length; i++) {
      if (this.active.relays[i]) continue;
      if (this.activeView.relays[i].distanceTo(p) < 2.4) return i;
    }
    return -1;
  }

  private prompt(): { text: string; sub?: string } | null {
    const r = this.nearRelay();
    if (r >= 0) return { text: 'Hold to route power', sub: `relay ${r + 1} of ${RELAYS_PER_NODE}` };
    const n = this.nearNode(3.2);
    if (!n) return null;
    if (this.isOnline(n.def)) return { text: 'Control node — online', sub: 'this district has power' };
    if (this.active && this.active.node === n.def.id) {
      if (this.active.phase === 'routing') return { text: 'Route power at the relays', sub: `${this.active.relays.filter(Boolean).length}/${RELAYS_PER_NODE} routed` };
      if (this.active.phase === 'syncing') return { text: 'Hold to sync the node', sub: `${Math.round(this.active.sync * 100)}%` };
      if (this.active.phase === 'defend') return { text: 'Hold the line', sub: 'stay close to the node' };
    }
    return { text: 'Reboot control node', sub: 'machines will notice' };
  }

  private handle(held: boolean, pressed: boolean, tapped: boolean, dt: number): boolean {
    const g = this.game;
    const r = this.nearRelay();
    if (r >= 0 && this.active && this.activeView) {
      if (held) {
        this.relayHold += dt;
        g.player.rig.setState('interact');
        g.bus.emit({ type: 'progress', value: Math.min(1, this.relayHold / 2.2) });
        if (this.relayHold >= 2.2) {
          this.relayHold = 0;
          g.bus.emit({ type: 'progress', value: null });
          this.handleEvents(routeRelay(this.active, r));
        }
      } else if (this.relayHold > 0) {
        this.relayHold = 0;
        g.bus.emit({ type: 'progress', value: null });
      }
      return true;
    }
    const n = this.nearNode(3.2);
    if (!n || this.isOnline(n.def)) return !!n && (pressed || tapped);
    if (!this.active && tapped) {
      this.active = startReboot(n.def.id, n.def.district);
      this.activeView = n;
      for (const m of n.relayMeshes) {
        m.visible = true;
        m.scale.setScalar(0.01);
      }
      audio.play('node');
      g.fx.glowBurst(n.def.x, g.view.surface(n.def.x, n.def.z) + 2, n.def.z, 16);
      g.bus.emit({ type: 'subtitle', who: 'NODE', text: NODE_LINES.syncStart.replace('SYNCHRONIZING', 'REBOOT REQUESTED. ROUTE POWER, THEN SYNCHRONIZING') });
      g.toast('Three relays nearby need power routed. Find them, then sync the node.', 'warm');
      return true;
    }
    return held || tapped || pressed;
  }

  private handleEvents(ev: NodeEvent[]): void {
    const g = this.game;
    const a = this.active;
    const v = this.activeView;
    if (!a || !v) return;
    for (const e of ev) {
      if (e.type === 'relay') {
        const m = v.relayMeshes[e.index];
        ((m.children[0] as THREE.Mesh).material as THREE.MeshBasicMaterial).color.copy(ON);
        g.fx.glowBurst(m.position.x, m.position.y + 1.8, m.position.z, 12);
        audio.play('powerUp', { pos: m.position, vol: 0.5 });
        g.toast(`Relay ${e.index + 1} routed.`, 'warm');
      } else if (e.type === 'phase' && e.phase === 'syncing') {
        g.toast('All relays live. Hold Interact at the node to sync.', 'warm');
        g.bus.emit({ type: 'subtitle', who: 'NODE', text: NODE_LINES.syncStart });
      } else if (e.type === 'phase' && e.phase === 'defend') {
        g.bus.emit({ type: 'progress', value: null });
        g.toast('Sync complete. Something heard that. Hold the node!', 'bad');
        audio.play('alarm');
        g.bus.emit({ type: 'subtitle', who: 'NODE', text: NODE_LINES.defendStart });
      } else if (e.type === 'wave') {
        const d = g.layout.districts[a.district];
        this.enemies.wave(v.def.x, v.def.z, e.count, d?.danger ?? 1);
        g.toast(e.index === 0 ? 'Machines inbound.' : 'Another wave.', 'bad');
        if (e.index > 0) g.bus.emit({ type: 'subtitle', who: 'NODE', text: pickLine(NODE_LINES.defendWave) });
      } else if (e.type === 'setback') {
        g.toast('You left the node — sync dropped to half. Get back there.', 'bad');
      } else if (e.type === 'online') {
        g.bus.emit({ type: 'progress', value: null });
        this.complete();
      }
    }
  }

  private complete(): void {
    const g = this.game;
    const a = this.active!;
    const v = this.activeView!;
    const w = g.save.world;
    const ds = w.districts[a.district];
    if (ds && !ds.nodesOnline.includes(a.node)) ds.nodesOnline.push(a.node);
    const total = g.layout.nodes.filter((n) => n.district === a.district).length;
    const d = g.layout.districts[a.district];
    const residents = w.survivors.filter((s) => s.alive).length;
    const before = ds?.state ?? 0;
    const st = restorationFor({ nodesOnline: ds?.nodesOnline.length ?? 1, nodesTotal: total, residents, rank: Number(w.flags['rank'] ?? 1), key: d.key });
    if (ds) ds.state = Math.max(before, st) as RestorationState;
    w.flags[`rebooted:${d.key}`] = Number(w.flags[`rebooted:${d.key}`] ?? 0) + 1;
    this.active = null;
    this.activeView = null;
    for (const m of v.relayMeshes) m.visible = false;
    // showpiece: beam, burst, music swell, lights ripple outward
    const y = g.view.surface(v.def.x, v.def.z);
    this.beam.position.set(v.def.x, y + 30, v.def.z);
    this.beam.visible = true;
    (this.beam.material as THREE.MeshBasicMaterial).opacity = 0.9;
    g.fx.glowBurst(v.def.x, y + 3.6, v.def.z, 40);
    audio.play('powerUp', { vol: 1 });
    setTimeout(() => audio.play('levelUp', { vol: 0.8 }), 900);
    g.camera.addTrauma(0.35);
    g.hitstop = 0.12;
    this.ripple = { cx: v.def.x, cz: v.def.z, r: 0, district: a.district };
    const stName = RESTORATION_NAMES[(ds?.state ?? 0) as RestorationState];
    const dname = DISTRICT_INTROS[d.key]?.name ?? d.name;
    g.bus.emit({ type: 'district', name: dname, state: stName, blurb: (RESTORATION_LINES[ds?.state ?? 0] || '').replace('{district}', dname) });
    g.bus.emit({ type: 'subtitle', who: 'NODE', text: pickLine(NODE_LINES.online) });
    g.toast(`${d.name}: node online. District is now ${stName}.`, 'warm');
    this.refresh();
    g.onWorldAction?.({ type: 'nodeOnline', node: a.node, district: a.district });
    g.persist('node');
  }

  private update(dt: number, simDt: number): void {
    const g = this.game;
    // spin rings, pulse online ones
    for (const nv of this.nodes) {
      nv.ring.rotation.y += dt * (this.isOnline(nv.def) ? 1.2 : 0.2);
      nv.ring.position.y = 3.6 + Math.sin(g.time * 1.5 + nv.def.id) * 0.08;
    }
    if (this.activeView) for (const m of this.activeView.relayMeshes) if (m.scale.x < 1) m.scale.setScalar(Math.min(1, m.scale.x + dt * 3));
    // fade beam
    const bm = this.beam.material as THREE.MeshBasicMaterial;
    if (this.beam.visible) {
      bm.opacity = Math.max(0, bm.opacity - dt * 0.25);
      this.beam.scale.x = this.beam.scale.z = 1 + (0.9 - bm.opacity) * 3;
      if (bm.opacity <= 0) this.beam.visible = false;
    }
    // light ripple: rebuild chunks in expanding rings so windows come on street by street
    if (this.ripple) {
      const prev = this.ripple.r;
      this.ripple.r += dt * 40;
      for (const b of g.layout.buildings) {
        if (b.district !== this.ripple.district) continue;
        const d = Math.hypot(b.x - this.ripple.cx, b.z - this.ripple.cz);
        if (d >= prev && d < this.ripple.r) g.view.markBuildingDirty(b.id);
      }
      if (this.ripple.r > 400) this.ripple = null;
    }
    if (!this.active || !this.activeView || simDt <= 0) return;
    const v = this.activeView;
    const p = g.player.pos;
    const dist = Math.hypot(p.x - v.def.x, p.z - v.def.z);
    const holding = g.input.isHeld('interact') && dist < 3.5;
    if (this.active.phase === 'syncing' && holding) {
      g.player.rig.setState('interact');
      if (Math.random() < simDt * 6) g.fx.sparks(v.def.x, g.view.surface(v.def.x, v.def.z) + 1.6, v.def.z + 0.6, 2, 0x39e6d0);
      g.bus.emit({ type: 'progress', value: this.active.sync });
    }
    this.beam.visible = this.active.phase === 'syncing' || this.beam.visible;
    if (this.active.phase === 'syncing') {
      this.beam.position.set(v.def.x, g.view.surface(v.def.x, v.def.z) + 30, v.def.z);
      bm.opacity = 0.15 + this.active.sync * 0.5;
      this.beam.scale.set(0.3 + this.active.sync, 1, 0.3 + this.active.sync);
    }
    const d = g.layout.districts[this.active.district];
    const ev = tickReboot(this.active, simDt, { holding, inRange: dist < NODE_RANGE, enemiesAlive: this.enemies.alive, danger: d?.danger ?? 1 });
    if (ev.length) this.handleEvents(ev);
    if (this.active && this.active.phase === 'syncing' && !holding && g.input.wasReleased('interact')) g.bus.emit({ type: 'progress', value: null });
  }

  /** A teammate brought a node online: recompute restoration and refresh visuals. */
  remoteOnline(_node: number, district: number): void {
    const w = this.game.save.world;
    const ds = w.districts[district];
    const d = this.game.layout.districts[district];
    if (!ds || !d) return;
    const total = this.game.layout.nodes.filter((n) => n.district === district).length;
    const st = restorationFor({ nodesOnline: ds.nodesOnline.length, nodesTotal: total, residents: w.survivors.filter((s) => s.alive).length, rank: Number(w.flags['rank'] ?? 1), key: d.key });
    ds.state = Math.max(ds.state, st) as RestorationState;
    this.refresh();
    for (const b of this.game.layout.buildings) if (b.district === district) this.game.view.markBuildingDirty(b.id);
  }

  /** Cancel any in-progress reboot (death, load). */
  reset(): void {
    if (this.activeView) for (const m of this.activeView.relayMeshes) m.visible = false;
    this.active = null;
    this.activeView = null;
    this.refresh();
  }
}

function pickLine(src: unknown, key?: string): string {
  let arr: unknown = src;
  if (key && src && typeof src === 'object' && !Array.isArray(src)) arr = (src as Record<string, unknown>)[key] ?? Object.values(src as Record<string, unknown>)[0];
  if (Array.isArray(arr) && arr.length) {
    const v = arr[Math.floor(Math.random() * arr.length)];
    return typeof v === 'string' ? v : String((v as { text?: string }).text ?? '');
  }
  return typeof arr === 'string' ? arr : '';
}
