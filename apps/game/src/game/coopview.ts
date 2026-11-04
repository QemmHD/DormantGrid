// Co-op in the world: sends our state, draws interpolated remote players,
// relays world actions, host time sync, and in-world ping markers.
import * as THREE from 'three';
import { fnv1a, type PingKind } from '@dg/shared';
import type { CoopClient } from '../net/coop';
import { CharacterRig, randomLook } from '../render/character';
import { audio } from '../audio/audio';
import type { Game } from './game';

const PING_COLORS: Record<PingKind, number> = { here: 0x39e6d0, danger: 0xe2574c, loot: 0xe8a65a, help: 0xffd860, go: 0x8fcf6a };
const PING_TEXT: Record<PingKind, string> = { here: 'is here', danger: 'spotted danger', loot: 'found loot', help: 'needs help', go: 'says go' };

export class CoopView {
  private rigs = new Map<string, CharacterRig>();
  private pings: { mesh: THREE.Mesh; t: number }[] = [];
  private timeT = 0;
  private pingGeo = new THREE.CylinderGeometry(0.35, 0.35, 40, 8, 1, true);

  constructor(private game: Game, private coop: CoopClient) {
    game.onWorldAction = (ev) => {
      if (this.coop.active) this.coop.sendAction(ev);
    };
    coop.onWorldEvent = (ev, from, mine) => {
      if (!mine) game.applyRemote(ev);
      void from;
    };
    coop.onPing = (from, kind, x, z) => this.showPing(from, kind, x, z);
    coop.onEmote = (from, emote) => game.bus.emit({ type: 'subtitle', who: from, text: emote });
    coop.onWelcome = (info) => {
      game.pieceIdBase = (fnv1a(info.you) % 1000) * 1_000_000;
      if (!coop.isHost) game.save.world.hour = info.hour;
      game.toast(`Joined ${coop.code}. ${info.players.length} in the run.`, 'warm');
    };
    coop.onPlayers = () => this.syncRigs();
    game.tickers.push((dt) => this.update(dt));
    window.addEventListener('keydown', (e) => {
      if (e.code === 'KeyG' && this.coop.active) this.pingHere('here');
    });
  }

  pingHere(kind: PingKind): void {
    const g = this.game;
    const x = g.player.pos.x + Math.sin(g.camera.yaw) * 6, z = g.player.pos.z + Math.cos(g.camera.yaw) * 6;
    this.coop.sendPing(kind, x, z);
    this.showPing(this.coop.me ?? 'you', kind, x, z);
  }

  private showPing(from: string, kind: PingKind, x: number, z: number): void {
    const m = new THREE.Mesh(
      this.pingGeo,
      new THREE.MeshBasicMaterial({ color: PING_COLORS[kind], transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    m.position.set(x, this.game.view.surface(x, z) + 20, z);
    this.game.scene.add(m);
    this.pings.push({ mesh: m, t: 6 });
    audio.play('node', { pos: { x, z }, vol: 0.7 });
    this.game.toast(`${from} ${PING_TEXT[kind]}`, kind === 'danger' ? 'bad' : 'info');
  }

  private syncRigs(): void {
    const ids = new Set(this.coop.playerIds.filter((id) => id !== this.coop.me));
    for (const [id, r] of this.rigs)
      if (!ids.has(id)) {
        r.dispose();
        this.rigs.delete(id);
        this.game.toast(`${id} left the run.`);
      }
    for (const id of ids)
      if (!this.rigs.has(id)) {
        const rig = new CharacterRig(randomLook(fnv1a(id), { backpack: true, accent: 0x39e6d0 }));
        this.game.scene.add(rig.root);
        this.rigs.set(id, rig);
        this.game.toast(`${id} joined the run.`, 'warm');
      }
  }

  private update(dt: number): void {
    const g = this.game;
    for (let i = this.pings.length - 1; i >= 0; i--) {
      const p = this.pings[i];
      p.t -= dt;
      (p.mesh.material as THREE.MeshBasicMaterial).opacity = Math.min(0.6, p.t / 2);
      if (p.t <= 0) {
        p.mesh.removeFromParent();
        (p.mesh.material as THREE.Material).dispose();
        this.pings.splice(i, 1);
      }
    }
    if (!this.coop.active || g.mode === 'menu') {
      if (this.rigs.size) {
        for (const r of this.rigs.values()) r.dispose();
        this.rigs.clear();
      }
      return;
    }
    const rig = g.player.rig;
    const anim = rig.state === 'attack' ? 3 : rig.state === 'interact' ? 4 : rig.state === 'dodge' ? 5 : rig.speed > 4 ? 2 : rig.speed > 0.3 ? 1 : 0;
    this.coop.sendState({ x: g.player.pos.x, y: g.player.pos.y, z: g.player.pos.z, yaw: g.player.yaw, anim }, rig.speed > 0.2);
    this.coop.tick();
    if (this.coop.isHost) {
      this.timeT -= dt;
      if (this.timeT <= 0) {
        this.timeT = 10;
        this.coop.sendAction({ type: 'time', hour: g.save.world.hour, weather: String(g.save.world.weather) });
      }
    }
    if (this.rigs.size !== this.coop.playerIds.length) this.syncRigs(); // playerIds = remote players only
    for (const [id, r] of this.rigs) {
      const s = this.coop.sample(id);
      // (0,0,0) is the server's placeholder before a player's first state message — never draw it
      if (!s || (s.x === 0 && s.z === 0)) {
        r.root.visible = false;
        continue;
      }
      r.root.visible = true;
      const ox = r.root.position.x, oz = r.root.position.z;
      // first real sample or a teleport: snap instead of sliding across the map
      if (Math.hypot(s.x - ox, s.z - oz) > 25) {
        r.root.position.set(s.x, s.y, s.z);
        continue;
      }
      r.root.position.set(s.x, s.y, s.z);
      r.root.rotation.y = s.yaw;
      const sp = dt > 0 ? Math.hypot(s.x - ox, s.z - oz) / dt : 0;
      r.speed = sp < 20 ? sp : 0;
      r.setState(s.anim === 3 ? 'attack' : s.anim === 4 ? 'interact' : s.anim === 5 ? 'dodge' : 'idle');
      r.update(dt);
    }
  }
}
