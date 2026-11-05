// Guidance: always-visible objective tracker, a world beacon (with off-screen
// arrow) pointing at where to go, a "Next?" button that picks the next best
// action, one-time contextual tips for each mechanic, and the Help screen.
import * as THREE from 'three';
import { computeNeeds, getPiece, isNight, nextUnlocks, rankProgress } from '@dg/sim';
import { ONBOARDING, CONTEXT_HINTS } from '../content/onboarding';
import type { Game } from './game';
import type { UI } from '../ui/ui';
import { KIND_COLOR } from './markers';
import { rankOf } from './town';
import { S } from '../ui/strings';

interface Advice {
  text: string;
  target: THREE.Vector3 | null;
}

const TIP_DURATION = 8;

export class Guide {
  private el: HTMLDivElement;
  private titleEl: HTMLDivElement;
  private bodyEl: HTMLDivElement;
  private progEl: HTMLDivElement;
  private skipBtn: HTMLButtonElement;
  private beacon: HTMLDivElement;
  private beaconLbl: HTMLSpanElement;
  private arrow: HTMLDivElement;
  private target: THREE.Vector3 | null = null;
  /** temporary beacon from the Next? button */
  private adviceUntil = 0;
  private refreshT = 0;
  private tipUntil = 0;
  private v = new THREE.Vector3();
  private lastStep = -1;
  private rankEl: HTMLDivElement;
  private rankLbl: HTMLElement;
  private rankFill: HTMLElement;
  private rankPts: HTMLElement;
  private rankNext: HTMLDivElement;
  private rankKey = '';

  constructor(private game: Game, private ui: UI) {
    const root = document.getElementById('ui')!;
    this.el = document.createElement('div');
    this.el.className = 'objective';
    this.titleEl = document.createElement('div');
    this.titleEl.className = 'ot';
    this.bodyEl = document.createElement('div');
    this.bodyEl.className = 'ob';
    this.progEl = document.createElement('div');
    this.progEl.className = 'op';
    const row = document.createElement('div');
    row.className = 'orow';
    const next = document.createElement('button');
    next.className = 'obtn primary';
    next.textContent = 'Next?';
    next.setAttribute('aria-label', 'What should I do next?');
    this.skipBtn = document.createElement('button');
    this.skipBtn.className = 'obtn';
    this.skipBtn.textContent = 'Skip';
    this.skipBtn.setAttribute('aria-label', 'Skip the tutorial');
    const help = document.createElement('button');
    help.className = 'obtn';
    help.textContent = 'Help';
    row.append(next, help, this.skipBtn);
    // Town Rank: progress bar + the next unlocks, always on the HUD
    this.rankEl = document.createElement('div');
    this.rankEl.className = 'orank';
    this.rankEl.setAttribute('data-rankbar', '');
    this.rankLbl = document.createElement('b');
    const bar = document.createElement('div');
    bar.className = 'rbar';
    this.rankFill = document.createElement('i');
    bar.append(this.rankFill);
    this.rankPts = document.createElement('small');
    const top = document.createElement('div');
    top.className = 'rtop';
    top.append(this.rankLbl, bar, this.rankPts);
    this.rankNext = document.createElement('div');
    this.rankNext.className = 'rnext';
    this.rankEl.append(top, this.rankNext);
    this.el.append(this.titleEl, this.bodyEl, this.progEl, this.rankEl, row);
    for (const b of [next, help, this.skipBtn]) {
      b.addEventListener('touchstart', (e) => e.stopPropagation(), { passive: true });
      b.addEventListener('mousedown', (e) => e.stopPropagation());
    }
    next.addEventListener('click', () => this.next());
    help.addEventListener('click', () => game.openScreen('help'));
    this.skipBtn.addEventListener('click', () => {
      game.save.world.flags['onb'] = ONBOARDING.length;
      game.onbStep = ONBOARDING.length;
      game.toast('Tutorial skipped. Tap Next? any time for a pointer, or Help to replay it.');
      this.refresh();
    });
    root.append(this.el);
    this.beacon = document.createElement('div');
    this.beacon.className = 'beacon';
    this.beacon.append(document.createElement('i'));
    this.beaconLbl = document.createElement('span');
    this.beacon.append(this.beaconLbl);
    this.arrow = document.createElement('div');
    this.arrow.className = 'beacon-arrow';
    root.append(this.beacon, this.arrow);
    ui.registerScreen('help', 'How to play', (body) => this.buildHelp(body));
    game.tickers.push((dt) => this.update(dt));
    game.bus.on('mode', () => this.refresh());
  }

  // ---------------- objective ----------------
  private tutorialTarget(marker: string | null | undefined): THREE.Vector3 | null {
    const g = this.game;
    const p = g.player.pos;
    const s = g.layout.spawn;
    const plot = new THREE.Vector3(s.x + 4, g.view.surface(s.x + 4, s.z + 14), s.z + 14);
    const placed = (id: string) => {
      const pc = g.save.world.pieces.find((x) => x.piece === id);
      return pc ? (g.base.pos.get(pc.id)?.clone() ?? null) : null;
    };
    switch (marker) {
      case 'nearestCrate': {
        const ids = g.view.propsNear(p.x, p.z, 50, []);
        let best: THREE.Vector3 | null = null;
        let bd = 1e9;
        for (const id of ids) {
          const pr = g.layout.props[id];
          if (pr.building >= 0 || (pr.kind !== 'crate' && pr.kind !== 'barrel' && pr.kind !== 'rubble' && pr.kind !== 'pallet')) continue;
          const d = Math.hypot(pr.x - p.x, pr.z - p.z);
          if (d < bd) {
            bd = d;
            best = new THREE.Vector3(pr.x, g.view.height(pr.x, pr.z) + 0.6, pr.z);
          }
        }
        return best;
      }
      case 'nearestRuin': {
        let best: THREE.Vector3 | null = null;
        let bd = 1e9;
        for (const b of g.layout.buildings) {
          const d = Math.hypot(b.x - p.x, b.z - p.z);
          if (d > 90 || d > bd) continue;
          // front door: local +z face, rotated
          const ang = (b.rot * Math.PI) / 2;
          const dx = Math.sin(ang) * (b.d / 2 + 0.6), dz = Math.cos(ang) * (b.d / 2 + 0.6);
          bd = d;
          best = new THREE.Vector3(b.x + dx, 1.2, b.z + dz);
        }
        return best;
      }
      case 'havenPlot':
        return plot;
      case 'workbench':
        return placed('workbench1') ?? plot;
      case 'bed':
        return placed('bed') ?? plot;
      default:
        return null;
    }
  }

  private refreshRank(): void {
    const r = rankOf(this.game.save.world);
    const pr = rankProgress(r.rank, r.points);
    const next = nextUnlocks(r.rank, 3);
    const key = `${r.rank}:${r.points}`;
    if (key === this.rankKey) return;
    this.rankKey = key;
    this.rankLbl.textContent = S.rankbar.label(r.rank);
    this.rankFill.style.width = `${Math.round(pr.frac * 100)}%`;
    this.rankPts.textContent = pr.max ? S.rankbar.max : S.rankbar.pts(pr.into, pr.need);
    this.rankNext.textContent = next.length ? S.rankbar.next(next.map((u) => u.label).join(' · ')) : S.rankbar.max;
  }

  refresh(): void {
    const g = this.game;
    if (!g.save || g.mode === 'menu' || g.mode === 'cinematic') {
      this.el.style.opacity = '0';
      this.el.style.pointerEvents = 'none';
      return;
    }
    this.el.style.opacity = '1';
    this.el.style.pointerEvents = ''; // CSS decides (short screens: text passes touches to the stick)
    this.refreshRank();
    const touch = g.input.usingTouch || document.documentElement.classList.contains('touch');
    const step = g.onbStep < ONBOARDING.length ? ONBOARDING[g.onbStep] : null;
    this.skipBtn.style.display = step ? '' : 'none';
    if (step) {
      this.titleEl.textContent = `Tutorial ${g.onbStep + 1}/${ONBOARDING.length} · ${step.title}`;
      this.bodyEl.textContent = touch ? step.touch : step.desktop;
      this.progEl.textContent = '';
      if (Date.now() > this.adviceUntil) this.target = this.tutorialTarget(step.marker);
      if (step.id !== String(this.lastStep)) {
        this.el.classList.remove('flash');
        void this.el.offsetWidth;
        this.el.classList.add('flash');
        this.lastStep = g.onbStep;
      }
    } else {
      const obj = g.objectives().find((o) => !o.done);
      this.titleEl.textContent = obj ? 'Objective' : 'Free play';
      this.bodyEl.textContent = obj ? obj.text : 'Rebuild the city your way. Tap Next? for a suggestion.';
      this.progEl.textContent = obj ? obj.title : '';
      if (Date.now() > this.adviceUntil) this.target = null;
    }
  }

  // ---------------- Next? ----------------
  private advice(): Advice {
    const g = this.game;
    const p = g.save.player;
    const w = g.save.world;
    const inv = p.inventory;
    const has = (pred: (id: string) => boolean) => inv.some((s) => s && pred(s.id));
    const pos = g.player.pos;
    if (g.onbStep < ONBOARDING.length) {
      const st = ONBOARDING[g.onbStep];
      const touch = g.input.usingTouch || document.documentElement.classList.contains('touch');
      return { text: touch ? st.touch : st.desktop, target: this.tutorialTarget(st.marker) };
    }
    if (p.health < 35 && has((id) => id.startsWith('med.'))) return { text: 'You are hurt. Open your pack and use a bandage or medicine.', target: null };
    if (p.thirst < 30) return has((id) => id.startsWith('drink.')) ? { text: 'You are thirsty. Tap a drink in your quick bar.', target: null } : { text: 'You need water. Barrels and fridges often have some; boil dirty water at a campfire.', target: this.tutorialTarget('nearestCrate') };
    if (p.hunger < 30) return has((id) => id.startsWith('food.')) ? { text: 'You are hungry. Tap some food in your quick bar.', target: null } : { text: 'You need food. Search crates, cabinets and fridges, or harvest a farm plot.', target: this.tutorialTarget('nearestCrate') };
    const bed = w.pieces.find((x) => x.piece === 'bed');
    if (isNight(w.hour)) return bed ? { text: 'It is night. Sleep in your bed to skip to morning (and save).', target: g.base.pos.get(bed.id)?.clone() ?? null } : { text: 'Night is dangerous. Build a bed (Build menu) and sleep in it.', target: this.tutorialTarget('havenPlot') };
    const needs = computeNeeds(w);
    if (needs.food > 0.6 && w.survivors.length) {
      const sp = g.stockpilePos?.() ?? null;
      return { text: 'The town is short on food. Put spare food into the Town Stockpile, or build farm plots.', target: sp };
    }
    if (!w.pieces.some((x) => getPiece(x.piece)?.station === 'workbench1')) return { text: 'Build a Workbench (Build menu → Workbench). It unlocks axes, pickaxes, saws and weapons.', target: this.tutorialTarget('havenPlot') };
    if (!w.pieces.some((x) => x.piece === 'farm_plot')) return { text: 'Build a Farm Plot and plant seeds. Survivors will tend it and the town will eat.', target: this.tutorialTarget('havenPlot') };
    if (!w.flags['ledgerOpened'] && w.survivors.length) return { text: 'Open the Town Ledger (people icon) and give a survivor a job.', target: null };
    // nearest offline node
    let best: THREE.Vector3 | null = null;
    let bd = 1e9;
    for (const n of g.layout.nodes) {
      if (w.districts[n.district]?.nodesOnline.includes(n.id)) continue;
      const d = Math.hypot(n.x - pos.x, n.z - pos.z);
      if (d < bd) {
        bd = d;
        best = new THREE.Vector3(n.x, g.view.surface(n.x, n.z) + 2, n.z);
      }
    }
    if (best) return { text: 'Reboot the nearest Grid control node: route its 3 relays, hold to sync, then defend it.', target: best };
    return { text: 'Every node is online. Grow the town: more survivors, better walls, full stores.', target: null };
  }

  next(): void {
    const a = this.advice();
    this.target = a.target;
    this.adviceUntil = Date.now() + 25000;
    this.game.bus.emit({ type: 'hint', text: `**Next:** ${a.text}` });
    this.tipUntil = this.game.time + 10;
    this.game.audio.play('node', { vol: 0.5 });
  }

  // ---------------- contextual tips (first use) ----------------
  private tip(key: keyof typeof CONTEXT_HINTS): void {
    const f = this.game.save.world.flags;
    if (f[`tip:${key}`] || !this.game.settings.hints) return;
    f[`tip:${key}`] = true;
    this.game.bus.emit({ type: 'hint', text: `**Tip:** ${CONTEXT_HINTS[key]}` });
    this.tipUntil = this.game.time + TIP_DURATION;
  }

  private checkTips(): void {
    const g = this.game;
    const p = g.save.player;
    if (p.stamina < 5) this.tip('lowStamina');
    if (g.carryWeight().kg > 40) this.tip('heavyLoad');
    for (const c of p.conditions) if (c.id === 'bleeding' || c.id === 'fracture' || c.id === 'sick') this.tip(c.id);
    if (g.machineProximity > 0.4) this.tip('firstDrone');
    if (p.inventory.every((s) => s)) this.tip('inventoryFull');
    for (const n of g.layout.nodes) if (Math.hypot(n.x - g.player.pos.x, n.z - g.player.pos.z) < 18) this.tip('firstNode');
  }

  // ---------------- per frame ----------------
  private update(dt: number): void {
    const g = this.game;
    if (!g.save || g.mode === 'menu') {
      this.beacon.classList.remove('show');
      this.arrow.classList.remove('show');
      this.el.style.opacity = '0';
      return;
    }
    this.refreshT -= dt;
    if (this.refreshT <= 0) {
      this.refreshT = 0.5;
      this.refresh();
      if (g.mode === 'play') this.checkTips();
    }
    if (this.tipUntil && g.time > this.tipUntil) {
      this.tipUntil = 0;
      g.bus.emit({ type: 'hint', text: null });
    }
    // beacon
    const t = this.target;
    if (!t || g.mode !== 'play' || g.input.uiBlocking) {
      this.beacon.classList.remove('show');
      this.arrow.classList.remove('show');
      return;
    }
    const dist = Math.hypot(t.x - g.player.pos.x, t.z - g.player.pos.z);
    if (dist < 2.5) {
      this.beacon.classList.remove('show');
      this.arrow.classList.remove('show');
      return;
    }
    this.v.copy(t);
    this.v.y += 1.2;
    this.v.project(g.camera.cam);
    const W = innerWidth, H = innerHeight;
    const behind = this.v.z > 1;
    let sx = (this.v.x * 0.5 + 0.5) * W, sy = (-this.v.y * 0.5 + 0.5) * H;
    if (behind) {
      sx = W - sx;
      sy = H - sy;
    }
    const off = behind || sx < 40 || sx > W - 40 || sy < 40 || sy > H - 40;
    if (off) {
      this.beacon.classList.remove('show');
      const ang = Math.atan2(sy - H / 2, sx - W / 2);
      const r = Math.min(W, H) * 0.36;
      this.arrow.style.transform = `translate(${W / 2 + Math.cos(ang) * r}px, ${H / 2 + Math.sin(ang) * r}px) rotate(${ang}rad)`;
      this.arrow.classList.add('show');
    } else {
      this.arrow.classList.remove('show');
      this.beacon.classList.add('show');
      // never sit on top of the objective card
      const r = this.el.getBoundingClientRect();
      if (sx > r.left - 24 && sx < r.right + 24 && sy > r.top - 40 && sy < r.bottom + 30) sx = r.right + 34;
      this.beacon.style.transform = `translate(${sx}px, ${sy}px)`;
      const lbl = `${Math.round(dist)} m`;
      if (this.beaconLbl.textContent !== lbl) this.beaconLbl.textContent = lbl;
    }
  }

  // ---------------- help ----------------
  private buildHelp(body: HTMLElement): void {
    const g = this.game;
    const touch = g.input.usingTouch || document.documentElement.classList.contains('touch');
    const row = (a: string, b: string) => `<tr><td>${a}</td><td>${b}</td></tr>`;
    const controls = touch
      ? [
          row('Move', 'Drag anywhere on the left half — a stick appears under your thumb.'),
          row('Look', 'Drag on the right half. Pinch with two fingers (or tap Zoom) to zoom.'),
          row('Action button', 'The big round button. Its label changes with what you are aiming at: Loot, Break, Talk, Craft, Harvest… Hold it for hold actions (a ring fills).'),
          row('Swing', 'Attack with your equipped tool or weapon.'),
          row('Roll / Run / Jump', 'Roll dodges attacks. Run toggles sprinting (uses stamina). Jump is rarely needed.'),
          row('Quick bar', 'Tap a slot to eat, drink or equip it.'),
        ]
      : [
          row('Move', 'W A S D · Shift to sprint · Space to jump · Q to roll'),
          row('Look', 'Mouse (click the game to capture it) · wheel to zoom'),
          row('Interact', 'E — tap for the action shown, hold for hold actions'),
          row('Attack', 'Left mouse button'),
          row('Menus', 'I inventory · C crafting · B build · M map · L ledger · J journal · Esc pause'),
          row('Quick bar', '1–4'),
        ];
    const meters = [
      row('Health', 'Drops when you are hurt, starving or sick. At zero you drop your pack and wake at your bed.'),
      row('Food', 'Falls slowly. Eat to refill it. Empty food hurts your health.'),
      row('Water', 'Falls faster than food. Drink clean water; dirty water can make you sick.'),
      row('Stamina', 'Used by running, swinging and rolling. Rest a moment and it comes back.'),
      row('Rest', 'Falls through the day. Sleep in a bed at night to refill it.'),
    ];
    const kinds: [string, string, number][] = [
      ['Loot', 'search containers, pick things up', KIND_COLOR.loot],
      ['Break / Salvage', 'take things apart for materials (hold)', KIND_COLOR.break],
      ['Craft / Build', 'workbenches and stations', KIND_COLOR.build],
      ['Talk / Trade', 'people', KIND_COLOR.talk],
      ['Doors', 'can be pried off for timber', KIND_COLOR.door],
      ['Use / Grid', 'beds, terminals, control nodes', KIND_COLOR.use],
      ['Farm', 'plant, water and harvest', KIND_COLOR.farm],
    ];
    const legend = kinds.map(([a, b, c]) => row(`<span class="sw" style="background:#${c.toString(16).padStart(6, '0')}"></span>${a}`, b)).join('');
    const steps = ONBOARDING.map((s, i) => row(`${i + 1}. ${s.title}`, touch ? s.touch : s.desktop)).join('');
    body.innerHTML = `<div class="help">
      <h3>Controls (${touch ? 'touch' : 'keyboard & mouse'})</h3><table>${controls.join('')}</table>
      <h3>The meters</h3><table>${meters.join('')}</table>
      <h3>What the colours mean</h3><table>${legend}</table>
      <h3>The first steps</h3><table>${steps}</table>
      <h3>The loop</h3><p>Salvage the ruins → craft tools → build a shelter and stations → feed the town and give survivors jobs → reboot Grid nodes to power districts → defend against raids. Tap <b>Next?</b> under your objective whenever you are unsure.</p>
    </div>`;
    const replay = document.createElement('button');
    replay.className = 'btn primary';
    replay.textContent = 'Replay the tutorial';
    replay.addEventListener('click', () => {
      g.save.world.flags['onb'] = 0;
      g.onbStep = 0;
      for (const k of Object.keys(g.save.world.flags)) if (k.startsWith('tip:')) delete g.save.world.flags[k];
      this.ui.close();
      this.refresh();
      g.toast('Tutorial restarted.');
    });
    body.append(replay);
  }
}
