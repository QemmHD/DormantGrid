// Interaction clarity layer: in-world highlight of the current target (prop
// silhouette or piece box, tinted by interaction type), a floating marker with
// icon + verb, an edge arrow when the target is off-screen, floating "+3 Timber"
// pickups, and the touch primary button's label/colour.
import * as THREE from 'three';
import type { Game, InteractKind, TargetInfo } from './game';
import { propShape } from '../render/props';

export const KIND_COLOR: Record<InteractKind, number> = {
  loot: 0xe8a65a,
  break: 0xe7e4dc,
  build: 0x8fcf6a,
  talk: 0x6ab0ff,
  door: 0xc896ff,
  use: 0x39e6d0,
  farm: 0xb4dc5a,
  node: 0x39e6d0,
  attack: 0xe2574c,
};

const KIND_ICON: Record<InteractKind, string> = {
  loot: '<path d="M4 9h16v10H4zM4 9l2-4h12l2 4M10 13h4"/>',
  break: '<path d="M14 4l6 6-9 9-6-6zM5 19l3-3"/>',
  build: '<path d="M3 21h18M5 21V10l7-5 7 5v11M10 21v-6h4v6"/>',
  talk: '<path d="M4 5h16v11H9l-5 4z"/>',
  door: '<path d="M6 21V3h12v18M14 12h1"/>',
  use: '<circle cx="12" cy="12" r="7"/><path d="M12 8v4l3 2"/>',
  farm: '<path d="M12 21V11M12 11c0-4 3-7 7-7 0 4-3 7-7 7zM12 14c0-3-2-5-6-5 0 3 2 5 6 5z"/>',
  node: '<path d="M13 2L4 14h7l-1 8 9-12h-7z"/>',
  attack: '<path d="M14.5 17.5L3 6V3h3l11.5 11.5M13 19l6-6M16 16l4 4"/>',
};

interface Floater {
  el: HTMLDivElement;
  pos: THREE.Vector3;
  t: number;
}

export class Markers {
  private hlMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.3, side: THREE.BackSide, depthWrite: false });
  private boxMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.1, depthWrite: false });
  private edgeMat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85 });
  private propMesh: THREE.Mesh | null = null;
  private propKind = '';
  private boxMesh: THREE.Mesh;
  private boxEdges: THREE.LineSegments;
  private el: HTMLDivElement;
  private iconEl: HTMLDivElement;
  private verbEl: HTMLSpanElement;
  private subEl: HTMLSpanElement;
  private arrow: HTMLDivElement;
  private floaters: Floater[] = [];
  private v = new THREE.Vector3();
  private lastKey = '';
  private primaryBtn: HTMLElement | null = null;
  private primaryLbl: HTMLSpanElement | null = null;
  private t = 0;

  constructor(private game: Game) {
    const bg = new THREE.BoxGeometry(1, 1, 1);
    this.boxMesh = new THREE.Mesh(bg, this.boxMat);
    this.boxEdges = new THREE.LineSegments(new THREE.EdgesGeometry(bg), this.edgeMat);
    this.boxMesh.add(this.boxEdges);
    this.boxMesh.visible = false;
    this.boxMesh.renderOrder = 6;
    game.scene.add(this.boxMesh);
    const ui = document.getElementById('ui')!;
    this.el = document.createElement('div');
    this.el.className = 'wm';
    this.iconEl = document.createElement('div');
    this.iconEl.className = 'wm-ic';
    const txt = document.createElement('div');
    txt.className = 'wm-txt';
    this.verbEl = document.createElement('span');
    this.verbEl.className = 'wm-verb';
    this.subEl = document.createElement('span');
    this.subEl.className = 'wm-sub';
    txt.append(this.verbEl, this.subEl);
    this.el.append(this.iconEl, txt);
    this.arrow = document.createElement('div');
    this.arrow.className = 'wm-arrow';
    ui.append(this.el, this.arrow);
    game.bus.on('float', (e) => this.float(e.text, e.x, e.y, e.z, e.color));
    game.tickers.push((dt) => this.update(dt));
  }

  private float(text: string, x: number, y: number, z: number, color?: number): void {
    if (this.floaters.length > 10) {
      const old = this.floaters.shift();
      old?.el.remove();
    }
    const el = document.createElement('div');
    el.className = 'floater';
    el.textContent = text;
    if (color !== undefined) el.style.color = `#${color.toString(16).padStart(6, '0')}`;
    document.getElementById('ui')!.append(el);
    // stagger stacked pickups so they don't overlap
    const lift = this.floaters.filter((f) => f.t < 0.4).length * 0.35;
    this.floaters.push({ el, pos: new THREE.Vector3(x, y + 0.6 + lift, z), t: 0 });
  }

  private ensurePrimary(): void {
    if (this.primaryBtn) return;
    this.primaryBtn = document.querySelector('.act.interact');
    if (this.primaryBtn && !this.primaryLbl) {
      this.primaryLbl = document.createElement('span');
      this.primaryLbl.className = 'act-lbl';
      this.primaryBtn.append(this.primaryLbl);
    }
  }

  private highlight(info: TargetInfo | null): void {
    const g = this.game;
    const key = info?.shape ? ('prop' in info.shape ? `p${info.shape.prop}` : `b${info.shape.box[0].x.toFixed(2)},${info.shape.box[0].z.toFixed(2)},${info.shape.box[1].y.toFixed(1)}`) : '';
    const color = info ? (info.blocked ? 0xe2574c : KIND_COLOR[info.kind]) : 0xffffff;
    this.hlMat.color.setHex(color);
    this.boxMat.color.setHex(color);
    this.edgeMat.color.setHex(color);
    const pulse = 0.75 + Math.sin(this.t * 5) * 0.25;
    this.hlMat.opacity = 0.32 * pulse;
    this.edgeMat.opacity = 0.75 * pulse;
    if (key === this.lastKey) return;
    this.lastKey = key;
    if (this.propMesh) this.propMesh.visible = false;
    this.boxMesh.visible = false;
    if (!info?.shape) return;
    if ('prop' in info.shape) {
      const p = g.layout.props[info.shape.prop];
      if (!p) return;
      if (this.propKind !== p.kind || !this.propMesh) {
        if (this.propMesh) g.scene.remove(this.propMesh);
        this.propMesh = new THREE.Mesh(propShape(p.kind).geo, this.hlMat);
        this.propMesh.renderOrder = 6;
        g.scene.add(this.propMesh);
        this.propKind = p.kind;
      }
      this.propMesh.visible = true;
      this.propMesh.position.set(p.x, p.y + g.view.height(p.x, p.z) - 0.03 * p.scale, p.z);
      this.propMesh.rotation.set(0, p.rotY, 0);
      this.propMesh.scale.setScalar(p.scale * 1.08);
    } else {
      const [a, b] = info.shape.box;
      this.boxMesh.visible = true;
      this.boxMesh.position.set((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
      this.boxMesh.scale.set(b.x - a.x + 0.08, b.y - a.y + 0.08, b.z - a.z + 0.08);
    }
  }

  private update(dt: number): void {
    this.t += dt;
    const g = this.game;
    const info = g.mode === 'play' && !g.input.uiBlocking ? g.describeTarget() : null;
    this.highlight(info);
    // primary touch button label + colour
    this.ensurePrimary();
    if (this.primaryBtn && this.primaryLbl) {
      // idle: neutral "Use" (still swings if pressed); red only when a fight is on
      const fighting = g.combatLevel > 0.3;
      const kind = info ? info.kind : fighting ? 'attack' : 'idle';
      const label = info ? (info.blocked ? 'Locked' : info.verb) : fighting ? 'Swing' : 'Use';
      if (this.primaryLbl.textContent !== label) this.primaryLbl.textContent = label;
      if (this.primaryBtn.dataset.kind !== kind) this.primaryBtn.dataset.kind = kind;
      this.primaryBtn.classList.toggle('blocked', !!info?.blocked);
      this.primaryBtn.classList.toggle('hold', !!info?.hold && !info.blocked);
    }
    // floating marker
    const cam = g.camera.cam;
    const w = innerWidth, h = innerHeight;
    if (info?.pos) {
      this.v.copy(info.pos);
      this.v.y += 0.9;
      this.v.project(cam);
      const behind = this.v.z > 1;
      let sx = (this.v.x * 0.5 + 0.5) * w, sy = (-this.v.y * 0.5 + 0.5) * h;
      if (behind) {
        sx = w - sx;
        sy = h - sy;
      }
      const margin = 46;
      const off = behind || sx < margin || sx > w - margin || sy < margin || sy > h - margin;
      const col = `#${(info.blocked ? 0xe2574c : KIND_COLOR[info.kind]).toString(16).padStart(6, '0')}`;
      if (off) {
        this.el.classList.remove('show');
        const cx = w / 2, cy = h / 2;
        const ang = Math.atan2(sy - cy, sx - cx);
        const r = Math.min(w, h) * 0.42;
        this.arrow.style.transform = `translate(${cx + Math.cos(ang) * r}px, ${cy + Math.sin(ang) * r}px) rotate(${ang}rad)`;
        this.arrow.style.color = col;
        this.arrow.classList.add('show');
      } else {
        this.arrow.classList.remove('show');
        this.el.classList.add('show');
        this.el.style.transform = `translate(${sx}px, ${sy}px)`;
        this.el.style.setProperty('--kc', col);
        const ic = `<svg viewBox="0 0 24 24">${KIND_ICON[info.blocked ? 'attack' : info.kind]}</svg>`;
        if (this.iconEl.dataset.k !== info.kind + !!info.blocked) {
          this.iconEl.innerHTML = info.blocked ? '<svg viewBox="0 0 24 24"><rect x="6" y="11" width="12" height="9" rx="1"/><path d="M8 11V8a4 4 0 018 0v3"/></svg>' : ic;
          this.iconEl.dataset.k = info.kind + !!info.blocked;
        }
        const verb = info.blocked ? info.name : info.verb;
        if (this.verbEl.textContent !== verb) this.verbEl.textContent = verb;
        const sub = info.blocked ?? (info.hold ? 'hold' : info.sub ?? '');
        if (this.subEl.textContent !== sub) this.subEl.textContent = sub;
      }
    } else {
      this.el.classList.remove('show');
      this.arrow.classList.remove('show');
    }
    // floaters
    for (let i = this.floaters.length - 1; i >= 0; i--) {
      const f = this.floaters[i];
      f.t += dt;
      f.pos.y += dt * 0.9;
      this.v.copy(f.pos).project(cam);
      const sx = (this.v.x * 0.5 + 0.5) * w, sy = (-this.v.y * 0.5 + 0.5) * h;
      f.el.style.transform = `translate(${sx}px, ${sy}px) scale(${f.t < 0.15 ? 0.6 + f.t * 2.6 : 1})`;
      f.el.style.opacity = String(this.v.z > 1 ? 0 : Math.max(0, 1 - Math.max(0, f.t - 0.9) / 0.6));
      if (f.t > 1.5) {
        f.el.remove();
        this.floaters.splice(i, 1);
      }
    }
  }
}
