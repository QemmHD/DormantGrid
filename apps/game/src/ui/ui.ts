// UI layer: HUD, modal screens, main menu, build bar, death screen.
// Talks to the game only through GameAPI + Bus (game/api.ts).
import { GAME_VERSION, type ItemStack } from '@dg/shared';
import type { GameAPI, GameMode, ScreenId } from '../game/api';
import type { Action } from '../input/input';
import { countItem, getItem, PIECES, pieceCost, tiersFor, type PieceDef } from '@dg/sim';
import { S } from './strings';
import { btn, clear, h, shield, SVG, tap } from './dom';
import { iconImg, iconURL } from './icons';
import { buildScreen, type ScreenCtx } from './screens';
import type { StoryInfo } from '../game/story';

export interface JournalEntry {
  title: string;
  text: string;
  done: boolean;
}

type DrawFn = (ctx: CanvasRenderingContext2D, w: number, h: number) => void;
type ExternalScreen = { title: string; build: (body: HTMLElement, close: () => void) => void };

interface OpenScreen {
  id: ScreenId;
  el: HTMLElement;
  body: HTMLElement;
  refresh: () => void;
}

const SCREEN_ACTIONS: [Action, ScreenId][] = [
  ['inventory', 'inventory'],
  ['craft', 'craft'],
  ['map', 'map'],
  ['ledger', 'ledger'],
  ['journal', 'journal'],
  ['perks', 'perks'],
];

export class UI {
  readonly root: HTMLElement;
  private hud: HTMLElement;
  private meters = new Map<string, { row: HTMLElement; bar: HTMLElement }>();
  private condsEl: HTMLElement;
  private clockT: HTMLElement;
  private clockD: HTMLElement;
  private netChip: HTMLElement;
  private quickEls: HTMLElement[] = [];
  private promptEl: HTMLElement;
  private ringEl: HTMLElement;
  private ringFg: SVGCircleElement;
  private reticle: HTMLElement;
  private toasts: HTMLElement;
  private hintEl: HTMLElement;
  private subEl: HTMLElement;
  private bannerEl: HTMLElement;
  private dmgEl: HTMLElement;
  private interactBtn: HTMLElement;
  private sprintBtn: HTMLElement;
  private minimap: HTMLCanvasElement;
  private mmDraw: DrawFn | null = null;
  private mmT = 0;
  mapDraw: DrawFn | null = null;
  private stack: OpenScreen[] = [];
  private menuEl: HTMLElement | null = null;
  private buildBar: HTMLElement | null = null;
  private deathEl: HTMLElement | null = null;
  private dialogEl: HTMLElement | null = null;
  private pickupToasts = new Map<string, { el: HTMLElement; n: number; timer: number }>();
  private timers = { hint: 0, sub: 0, banner: 0, dmg: 0 };
  private mode: GameMode = 'menu';
  private refreshT = 0;
  // hooks provided by the game
  journalSource: () => JournalEntry[] = () => [];
  /** campaign next step / decisions / endings (set by main from Story) */
  storySource: (() => StoryInfo) | null = null;
  /** Town Rank for the Journal (set by main) */
  rankSource: (() => { rank: number; into: number; need: number; frac: number; max: boolean; next: { rank: number; label: string }[] }) | null = null;
  decideHandler: (key: string) => void = () => {};
  private perkBadge: HTMLElement | null = null;
  jobAssign: (id: number, job: string) => void = () => {};
  quitHandler: () => void = () => {};
  respawnHandler: () => void = () => {};
  private deathBody: HTMLElement | null = null;
  deviceReport: () => string = () => '';
  private external = new Map<ScreenId, ExternalScreen>();
  buildPiece: string | null = null;
  buildTier = 1;
  private buildCat: 'structure' | 'stations' | 'defense' = 'structure';

  constructor(readonly api: GameAPI) {
    this.root = document.getElementById('ui')!;
    this.root.append(h('div.vignette'));
    this.dmgEl = h('div.damage-flash');
    this.root.append(this.dmgEl);
    this.hud = h('div.hud');
    this.root.append(this.hud);

    // meters
    const mBox = h('div.meters');
    const MI: Record<string, string> = {
      health: '<path d="M12 20s-7-4.4-7-10a4 4 0 017-2.6A4 4 0 0119 10c0 5.6-7 10-7 10z"/>',
      hunger: '<path d="M7 3v8a2 2 0 002 2v8M11 3v6M3 3v6a4 4 0 004 4M17 21V3c2 0 3 3 3 7h-3"/>',
      thirst: '<path d="M12 3s6 7 6 11a6 6 0 01-12 0c0-4 6-11 6-11z"/>',
      stamina: '<path d="M13 2L4 14h7l-1 8 9-12h-7z"/>',
      sleep: '<path d="M20 14.5A8 8 0 019.5 4a8 8 0 1010.5 10.5z"/>',
    };
    const meterDefs: [string, string][] = [
      ['health', 'var(--health)'],
      ['hunger', 'var(--hunger)'],
      ['thirst', 'var(--thirst)'],
      ['stamina', 'var(--stamina)'],
      ['sleep', 'var(--sleep)'],
    ];
    for (const [k, color] of meterDefs) {
      const bar = h('i');
      bar.style.background = color;
      const b = h('b', { title: S.meters[k as keyof typeof S.meters], html: `<svg viewBox="0 0 24 24">${MI[k]}</svg>` });
      b.style.background = color;
      const row = h('div.meter', null, b, h('div.bar', null, bar), h('span.mlbl', null, S.meterShort[k as keyof typeof S.meterShort]));
      tap(row, () => this.api.openScreen('help' as ScreenId));
      mBox.append(row);
      this.meters.set(k, { row, bar });
    }
    this.condsEl = h('div.conds');
    mBox.append(this.condsEl);
    this.hud.append(mBox);

    // clock
    this.clockT = h('div.t', null, '07:00');
    this.clockD = h('div.d', null, S.day(1));
    this.hud.append(h('div.clock', null, this.clockT, this.clockD));

    // top bar
    const top = h('div.topbar');
    const topDefs: [Action, keyof typeof SVG][] = [
      ['inventory', 'inventory'],
      ['craft', 'craft'],
      ['build', 'build'],
      ['map', 'map'],
      ['ledger', 'ledger'],
      ['journal', 'journal'],
      ['perks', 'perks'],
      ['menu', 'menu'],
    ];
    for (const [a, ic] of topDefs) {
      const b = h('div.icon-btn', { role: 'button', 'aria-label': S.topbar[a as keyof typeof S.topbar], html: SVG[ic], 'data-action': a });
      api.input.bindButton(b, a);
      top.append(b);
      if (a === 'perks') {
        this.perkBadge = h('span.badge');
        b.append(this.perkBadge);
      }
    }
    this.hud.append(top);
    this.netChip = h('div.net-chip');
    this.hud.append(this.netChip);

    // minimap
    this.minimap = h('canvas', { width: 224, height: 224 });
    const mm = h('div.minimap', { 'aria-label': S.map }, this.minimap);
    api.input.bindButton(mm, 'map');
    this.hud.append(mm);

    // action cluster
    const acts = h('div.actions');
    const act = (cls: string, a: Action, ic: keyof typeof SVG, label?: string) => {
      const el = h('div', { class: `act ${cls}`, role: 'button', 'aria-label': S.acts[cls as keyof typeof S.acts], html: SVG[ic] });
      if (label) el.append(h('span.act-lbl', null, label));
      api.input.bindButton(el, a);
      acts.append(el);
      return el;
    };
    act('attack', 'attack', 'attack', S.actLabels.attack);
    this.interactBtn = act('interact', 'interact', 'interact');
    act('dodge', 'dodge', 'dodge', S.actLabels.dodge);
    act('jump', 'jump', 'jump', S.actLabels.jump);
    this.sprintBtn = act('sprint', 'sprint', 'sprint', S.actLabels.sprint);
    const zoom = h('div', { class: 'act zoom', role: 'button', 'aria-label': S.actLabels.zoom, html: '<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="6"/><path d="M20 20l-4.5-4.5M8.5 11h5"/></svg>' });
    zoom.append(h('span.act-lbl', null, S.actLabels.zoom));
    tap(zoom, () => {
      const c = (api as unknown as { camera?: { distance: number; zoomBy: (d: number) => void } }).camera;
      if (!c) return;
      // cycle near → mid → far
      const next = c.distance < 3.6 ? 4.6 - c.distance : c.distance < 5.8 ? 6.8 - c.distance : 3.0 - c.distance;
      c.zoomBy(next);
      api.audio.play('click');
    });
    acts.append(zoom);
    this.hud.append(acts);

    // quick slots
    const quick = h('div.quick');
    for (let q = 0; q < 4; q++) {
      const el = h('div.slot', { role: 'button', 'aria-label': S.quick(q + 1) });
      tap(el, () => {
        api.selectQuick(q);
        api.audio.play('click');
      });
      quick.append(el);
      this.quickEls.push(el);
    }
    this.hud.append(quick);

    // prompt / ring / reticle / toasts / hint / subtitle / banner
    this.promptEl = h('div.prompt');
    this.hud.append(this.promptEl);
    const svgNS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(svgNS, 'svg');
    svg.setAttribute('viewBox', '0 0 64 64');
    const bg = document.createElementNS(svgNS, 'circle');
    bg.setAttribute('class', 'bg');
    this.ringFg = document.createElementNS(svgNS, 'circle');
    this.ringFg.setAttribute('class', 'fg');
    for (const c of [bg, this.ringFg]) {
      c.setAttribute('cx', '32');
      c.setAttribute('cy', '32');
      c.setAttribute('r', '26');
    }
    this.ringFg.setAttribute('stroke-dasharray', `${2 * Math.PI * 26}`);
    svg.append(bg, this.ringFg);
    this.ringEl = h('div.ring');
    this.ringEl.append(svg);
    this.hud.append(this.ringEl);
    this.reticle = h('div.reticle');
    this.hud.append(this.reticle);
    this.toasts = h('div.toasts');
    this.hud.append(this.toasts);
    this.hintEl = h('div.hint');
    this.hud.append(this.hintEl);
    this.subEl = h('div.subtitle');
    this.hud.append(this.subEl);
    this.bannerEl = h('div.district-banner');
    this.hud.append(this.bannerEl);

    this.applyHtmlClasses();
    this.refreshMeters();
    this.refreshQuick();
    this.listen();
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Escape' && this.dialogEl) {
        this.closeDialog();
        // the same Escape must not also open the pause menu on the next frame
        this.api.input.consume('menu');
        this.api.input.consume('cancel');
      }
    });
  }

  // ---------------- public API ----------------
  get openScreen(): ScreenId | null {
    return this.stack.length ? this.stack[this.stack.length - 1].id : null;
  }

  setMinimap(draw: DrawFn): void {
    this.mmDraw = draw;
  }
  setMapDraw(draw: DrawFn): void {
    this.mapDraw = draw;
  }
  setJournalSource(fn: () => JournalEntry[]): void {
    this.journalSource = fn;
  }
  /** perk points waiting: badge on the ★ button */
  setPerkBadge(n: number): void {
    if (!this.perkBadge) return;
    this.perkBadge.textContent = n > 0 ? String(n) : '';
    this.perkBadge.classList.toggle('on', n > 0);
    this.refreshOpen(['perks']);
  }
  setJobAssign(fn: (id: number, job: string) => void): void {
    this.jobAssign = fn;
  }
  setQuitHandler(fn: () => void): void {
    this.quitHandler = fn;
  }
  setRespawnHandler(fn: () => void): void {
    this.respawnHandler = fn;
  }
  setDeviceReport(fn: () => string): void {
    this.deviceReport = fn;
  }
  /** Let another module (account/co-op) provide a screen body. */
  registerScreen(id: ScreenId, title: string, build: (body: HTMLElement, close: () => void) => void): void {
    this.external.set(id, { title, build });
  }

  setClock(text: string, sub: string): void {
    if (this.clockT.textContent !== text) this.clockT.textContent = text;
    if (this.clockD.textContent !== sub) this.clockD.textContent = sub;
  }

  setInteractReady(on: boolean): void {
    this.interactBtn.classList.toggle('ready', on);
  }

  flashDamage(amount: number): void {
    const o = Math.min(0.9, 0.25 + amount / 40);
    this.dmgEl.style.transition = 'none';
    this.dmgEl.style.opacity = String(o);
    void this.dmgEl.offsetWidth;
    this.dmgEl.style.transition = 'opacity 0.6s';
    this.dmgEl.style.opacity = '0';
  }

  /** Per-frame. Call BEFORE input.endFrame() so UI sees this frame's actions. */
  update(dt: number): void {
    const inp = this.api.input;
    if (this.deathEl && (inp.consume('interact') || inp.consume('jump'))) {
      this.hideDeath();
      this.respawnHandler();
    }
    if (!this.menuEl) {
      if (inp.wasPressed('menu') || inp.wasPressed('cancel')) {
        const menu = inp.wasPressed('menu');
        // consume: tickers can run several fixed steps per frame; one Escape must not close a dialog AND open pause
        if (this.dialogEl) {
          this.closeDialog();
          inp.consume('menu');
          inp.consume('cancel');
        } else if (this.stack.length) {
          this.close();
          inp.consume('menu');
          inp.consume('cancel');
        } else if (menu && this.mode !== 'build' && this.mode !== 'dead') {
          this.open('pause');
          inp.consume('menu');
        }
      }
      for (const [a, id] of SCREEN_ACTIONS) {
        if (inp.consume(a)) {
          if (this.openScreen === id) this.close();
          else if (this.mode !== 'dead') this.open(id);
        }
      }
    }
    this.sprintBtn.classList.toggle('on', inp.sprintToggle);
    this.mmT -= dt;
    if (this.mmT <= 0 && this.mmDraw && !this.stack.length) {
      this.mmT = 0.1;
      const ctx = this.minimap.getContext('2d');
      if (ctx) this.mmDraw(ctx, this.minimap.width, this.minimap.height);
    }
    this.refreshT -= dt;
    if (this.refreshT <= 0 && this.stack.length) {
      this.refreshT = 0.5;
      const top = this.stack[this.stack.length - 1];
      if (top.id === 'map') top.refresh();
    }
  }

  // ---------------- main menu ----------------
  showMenu(opts: { hasSave: boolean; username: string | null }): void {
    this.hideMenu(true);
    this.closeAll();
    const stack = h('div.stack');
    if (opts.hasSave)
      stack.append(
        btn(S.continue, 'primary', () => {
          this.api.audio.play('click');
          void this.api.continueGame();
        }),
      );
    stack.append(
      btn(S.newGame, opts.hasSave ? '' : 'primary', () => {
        this.api.audio.play('click');
        if (opts.hasSave)
          this.confirm(S.confirmNewTitle, S.confirmNewBody, S.confirmNewYes, () => void this.api.newGame());
        else void this.api.newGame();
      }),
      btn(S.settings, 'ghost', () => this.open('settings')),
      btn(S.coop, 'ghost', () => this.api.openScreen('coop')),
    );
    const el = h(
      'div.menu',
      null,
      h('h1', null, `${S.title1} `, h('span', null, S.title2)),
      h('p.tag', null, S.tagline),
      stack,
      h('div.who', null, opts.username ? S.signedInAs(opts.username) : S.notSignedIn),
      h('div.ver', null, S.version(GAME_VERSION)),
    );
    shield(el);
    this.menuEl = el;
    this.root.append(el);
    this.hud.style.display = 'none';
    this.api.input.uiBlocking = true;
    this.api.input.exitPointerLock();
  }

  hideMenu(instant = false): void {
    const el = this.menuEl;
    if (!el) return;
    this.menuEl = null;
    this.hud.style.display = '';
    this.api.input.uiBlocking = this.stack.length > 0;
    if (instant) el.remove();
    else {
      el.classList.add('hide');
      setTimeout(() => el.remove(), 600);
    }
  }

  // ---------------- screens ----------------
  open(id: ScreenId | null): void {
    if (id === null) {
      this.closeAll();
      return;
    }
    if (this.openScreen === id) return;
    // account & co-op screens are owned by the net layer (net/ui.ts)
    if ((id === 'account' || id === 'coop') && !this.external.has(id)) return;
    // only settings may stack on pause/menu; others replace
    if (!(id === 'settings' || id === 'account' || id === 'coop') && this.stack.length) this.closeAll(true);
    const sheet = h('div.sheet.panel');
    const body = h('div.body');
    const closeBtn = h('button.close-x', { type: 'button', 'aria-label': S.close }, '×');
    tap(closeBtn, () => this.close());
    const title = h('h2');
    const header = h('header', null, title, closeBtn);
    sheet.append(header, body);
    const el = h('div.screen', null, sheet);
    el.dataset.screen = id;
    shield(el);
    tap(el, (e) => {
      if (e.target === el) this.close();
    });
    let refresh = () => {};
    const ext = this.external.get(id);
    if (ext) {
      title.textContent = ext.title;
      ext.build(body, () => this.close());
    } else {
      const ctx: ScreenCtx = { ui: this, api: this.api, body, header, title, close: () => this.close() };
      const r = buildScreen(id, ctx);
      if (!r) {
        this.toast(S.craftFailed, 'bad');
        return;
      }
      refresh = r;
    }
    this.root.append(el);
    this.stack.push({ id, el, body, refresh });
    requestAnimationFrame(() => el.classList.add('show'));
    this.api.input.uiBlocking = true;
    this.api.input.releaseAll();
    this.api.input.exitPointerLock();
    this.api.audio.play('open');
    if (id === 'pause' || id === 'settings') this.api.setPaused(true);
  }

  close(): void {
    const top = this.stack.pop();
    if (!top) return;
    this.api.audio.play('close');
    top.el.classList.remove('show');
    setTimeout(() => top.el.remove(), 260);
    if (!this.stack.length) {
      this.api.input.uiBlocking = !!this.menuEl;
      if (!this.menuEl) this.api.setPaused(false);
    } else {
      this.stack[this.stack.length - 1].refresh();
    }
  }

  closeAll(silent = false): void {
    while (this.stack.length) {
      const top = this.stack.pop()!;
      top.el.remove();
    }
    if (!silent) {
      this.api.input.uiBlocking = !!this.menuEl;
      if (!this.menuEl) this.api.setPaused(false);
    }
  }

  private refreshOpen(ids: ScreenId[]): void {
    for (const s of this.stack) if (ids.includes(s.id)) s.refresh();
  }

  // ---------------- dialogs ----------------
  confirm(title: string, text: string, yes: string, onYes: () => void): void {
    this.dialog(title, text, [
      btn(S.cancel, 'ghost', () => this.closeDialog()),
      btn(yes, 'danger', () => {
        this.closeDialog();
        onYes();
      }),
    ]);
  }

  dialog(title: string, text: string | Node, buttons: HTMLElement[]): void {
    this.closeDialog();
    const box = h('div.dialog.panel', null, h('h2', null, title), typeof text === 'string' ? h('p', null, text) : text, h('div.row', null, ...buttons));
    const el = h('div.screen', { style: 'z-index:45' }, box);
    shield(el);
    this.dialogEl = el;
    this.root.append(el);
    requestAnimationFrame(() => el.classList.add('show'));
    this.api.input.uiBlocking = true;
  }

  closeDialog(): void {
    if (!this.dialogEl) return;
    const el = this.dialogEl;
    this.dialogEl = null;
    el.classList.remove('show');
    setTimeout(() => el.remove(), 250);
    this.api.input.uiBlocking = !!this.menuEl || this.stack.length > 0;
  }

  // ---------------- death ----------------
  showDeath(cause?: string): void {
    if (this.deathEl) return;
    this.closeAll(true);
    this.closeDialog();
    const body = h('div.recap', { 'data-death-recap': '' }, h('p', null, cause ?? S.causeUnknown));
    const el = h(
      'div.screen.death',
      null,
      h(
        'div.dialog.panel',
        null,
        h('h2', null, S.death.title),
        body,
        h(
          'div.row',
          null,
          btn(S.death.getUp, 'primary', () => {
            this.hideDeath();
            this.respawnHandler();
          }),
        ),
      ),
    );
    shield(el);
    this.deathEl = el;
    this.deathBody = body;
    this.root.append(el);
    requestAnimationFrame(() => el.classList.add('show'));
    this.api.input.uiBlocking = true;
    this.api.input.exitPointerLock();
  }

  /** fill the death screen: cause + where, one tip, what was kept / dropped */
  showDeathRecap(r: { cause: string; where: string; tip: string; kept: string; dropped: string }): void {
    if (!this.deathEl) this.showDeath();
    const b = this.deathBody;
    if (!b) return;
    b.replaceChildren(
      h('p.cause', null, h('b', null, r.cause), ` · ${r.where}`),
      h('p.tip', null, h('b', null, `${S.death.tipLabel} `), r.tip),
      h('p.kept', null, r.kept),
      h('p.kept', null, r.dropped),
    );
  }

  hideDeath(): void {
    if (!this.deathEl) return;
    const el = this.deathEl;
    this.deathEl = null;
    el.classList.remove('show');
    setTimeout(() => el.remove(), 300);
    this.api.input.uiBlocking = this.stack.length > 0 || !!this.menuEl;
  }

  // ---------------- toasts / hints ----------------
  toast(text: string, kind: 'info' | 'warm' | 'bad' = 'info', icon?: string): HTMLElement {
    // de-duplicate: the same message already on screen just gets a ×N badge and a longer life
    for (const c of Array.from(this.toasts.children) as HTMLElement[]) {
      if (c.dataset.text === text && !c.classList.contains('out')) {
        const n = Number(c.dataset.n ?? 1) + 1;
        c.dataset.n = String(n);
        let badge = c.querySelector('.tn') as HTMLElement | null;
        if (!badge) {
          badge = h('span.tn');
          c.append(badge);
        }
        badge.textContent = `×${n}`;
        window.clearTimeout(Number(c.dataset.timer));
        c.dataset.timer = String(window.setTimeout(() => {
          c.classList.add('out');
          setTimeout(() => c.remove(), 400);
        }, 3200));
        return c;
      }
    }
    const el = h('div', { class: `toast ${kind === 'info' ? '' : kind}` });
    el.dataset.text = text;
    if (icon) {
      el.append(h('img.ti', { src: iconURL(icon), alt: '' }));
    }
    const span = h('span', null, text);
    el.append(span);
    this.toasts.prepend(el);
    const max = innerHeight < 500 ? 3 : 4;
    while (this.toasts.children.length > max) this.toasts.lastElementChild?.remove();
    const kill = () => {
      el.classList.add('out');
      setTimeout(() => el.remove(), 400);
    };
    el.dataset.timer = String(window.setTimeout(kill, 2600));
    return el;
  }

  private pickup(item: string, n: number): void {
    const def = getItem(item);
    const name = def?.name ?? item;
    const cur = this.pickupToasts.get(item);
    if (cur && cur.el.isConnected) {
      cur.n += n;
      const span = cur.el.querySelector('span');
      if (span) span.textContent = S.pickup(cur.n, name);
      window.clearTimeout(Number(cur.el.dataset.timer));
      window.clearTimeout(cur.timer);
      cur.el.classList.remove('out');
      cur.el.style.animation = 'none';
      void cur.el.offsetWidth;
      cur.el.style.animation = '';
      cur.timer = window.setTimeout(() => {
        cur.el.classList.add('out');
        setTimeout(() => cur.el.remove(), 400);
        this.pickupToasts.delete(item);
      }, 2400);
      return;
    }
    const el = this.toast(S.pickup(n, name), 'warm', item);
    window.clearTimeout(Number(el.dataset.timer));
    const timer = window.setTimeout(() => {
      el.classList.add('out');
      setTimeout(() => el.remove(), 400);
      this.pickupToasts.delete(item);
    }, 2400);
    this.pickupToasts.set(item, { el, n, timer });
  }

  private hint(text: string | null): void {
    window.clearTimeout(this.timers.hint);
    if (!text || !this.api.settings.hints) {
      this.hintEl.classList.remove('show');
      return;
    }
    this.hintEl.innerHTML = '';
    // **bold** markup support for key words
    const parts = text.split(/\*\*(.+?)\*\*/g);
    parts.forEach((p, i) => this.hintEl.append(i % 2 ? h('b', null, p) : p));
    this.hintEl.classList.add('show');
  }

  // ---------------- HUD refresh ----------------
  refreshMeters(): void {
    const p = this.api.save.player;
    const vals: Record<string, number> = { health: p.health, hunger: p.hunger, thirst: p.thirst, stamina: p.stamina, sleep: p.sleep };
    for (const [k, m] of this.meters) {
      const v = Math.max(0, Math.min(100, vals[k] ?? 0));
      m.bar.style.width = `${v}%`;
      m.row.classList.toggle('low', v < 22);
    }
    const ids = p.conditions.map((c) => c.id).join(',');
    if (this.condsEl.dataset.ids !== ids) {
      this.condsEl.dataset.ids = ids;
      clear(this.condsEl);
      for (const c of p.conditions) {
        const good = c.id === 'wellfed' || c.id === 'rested';
        this.condsEl.append(h('span', { class: `cond ${good ? 'good' : ''}` }, S.conds[c.id] ?? c.id));
      }
    }
  }

  refreshQuick(): void {
    const p = this.api.save.player;
    const inv = p.inventory;
    for (let q = 0; q < 4; q++) {
      const el = this.quickEls[q];
      const id = p.quick[q];
      const key = `${id}|${id ? countItem(inv, id) : 0}|${p.equipped === id}|${id ? this.durOf(inv, id) : ''}`;
      if (el.dataset.key === key) continue;
      el.dataset.key = key;
      clear(el);
      el.append(h('span.k', null, String(q + 1)));
      el.classList.toggle('sel', !!id && p.equipped === id);
      if (!id) continue;
      const def = getItem(id);
      const n = countItem(inv, id);
      const img = iconImg(id, def?.category);
      if (n === 0) img.style.opacity = '0.3';
      el.append(img);
      if ((def?.stack ?? 1) > 1) el.append(h('span.n', null, String(n)));
      const d = this.durOf(inv, id);
      if (d !== null) {
        const bar = h('i');
        bar.style.width = `${Math.round(d * 100)}%`;
        if (d < 0.25) bar.style.background = 'var(--danger)';
        el.append(h('span.dur', null, bar));
      }
    }
  }

  private durOf(inv: (ItemStack | null)[], id: string): number | null {
    const def = getItem(id);
    const max = def?.tool?.durability ?? def?.weapon?.durability;
    if (!max) return null;
    const s = inv.find((x) => x && x.id === id);
    if (!s || s.d === undefined) return null;
    return Math.max(0, Math.min(1, s.d / max));
  }

  applyHtmlClasses(): void {
    const s = this.api.settings;
    const c = document.documentElement.classList;
    c.toggle('lefty', s.leftHanded);
    c.toggle('big-text', s.textSize === 'big');
    c.toggle('huge-text', s.textSize === 'huge');
    c.toggle('cb', s.colorblind);
  }

  // ---------------- build bar ----------------
  private showBuildBar(): void {
    if (this.buildBar) return;
    const wrap = h('div.build-ui');
    shield(wrap);
    this.buildBar = wrap;
    this.root.append(wrap);
    this.renderBuildBar();
  }

  private hideBuildBar(): void {
    this.buildBar?.remove();
    this.buildBar = null;
  }

  private renderBuildBar(status?: { ok: boolean; reason?: string }): void {
    const wrap = this.buildBar;
    if (!wrap) return;
    clear(wrap);
    const cats: ['structure' | 'stations' | 'defense', string][] = [
      ['structure', S.buildCats.structure],
      ['stations', S.buildCats.stations],
      ['defense', S.buildCats.defense],
    ];
    const tabs = h('div.tabs.build-tabs');
    for (const [k, label] of cats) {
      const t = h('button', { class: `tab ${this.buildCat === k ? 'on' : ''}`, type: 'button' }, label);
      tap(t, () => {
        this.buildCat = k;
        this.api.audio.play('click');
        this.renderBuildBar();
      });
      tabs.append(t);
    }
    const inCat = (p: PieceDef) =>
      this.buildCat === 'structure'
        ? ['foundation', 'wall', 'floor', 'roof', 'stairs', 'fence'].includes(p.kind)
        : this.buildCat === 'stations'
          ? p.kind === 'station'
          : p.kind === 'defense' || p.kind === 'trap';
    const bar = h('div.build-bar.panel');
    const inv = this.api.save.player.inventory;
    for (const p of PIECES.filter(inCat)) {
      const tier = (p.costs.length >= 4 ? Math.min(this.buildTier, 3) : 0) as 0 | 1 | 2 | 3;
      const cost = p.fromItem ? [{ item: p.fromItem, count: 1 }] : pieceCost(p, tier);
      const afford = cost.every((c) => countItem(inv, c.item) >= c.count);
      const el = h('div', { class: `piece ${this.buildPiece === p.id ? 'on' : ''} ${afford ? '' : 'poor'}`, role: 'button' });
      const img = h('img', { src: iconURL(p.fromItem ?? `piece.${p.id}`), alt: '', width: 26, height: 26 });
      el.append(img, h('span', null, p.name), h('small', null, cost.map((c) => `${c.count} ${shortName(c.item)}`).join(' · ') || '—'));
      tap(el, () => {
        this.buildPiece = p.id;
        this.api.audio.play('click');
        this.api.startBuild(p.id, tier);
        this.renderBuildBar();
      });
      bar.append(el);
    }
    const tiers = h('div.seg.tier-seg');
    S.tiers.forEach((name, i) => {
      const b = h('button', { class: this.buildTier === i ? 'on' : '', type: 'button' }, name);
      tap(b, () => {
        this.buildTier = i;
        this.api.audio.play('click');
        const piece = this.buildPiece ? PIECES.find((x) => x.id === this.buildPiece) : undefined;
        if (piece && tiersFor(piece).length > 1) this.api.startBuild(piece.id, i);
        this.renderBuildBar();
      });
      tiers.append(b);
    });
    const ctl = h('div.build-ctl');
    const mk = (label: string, cls: string, a: Action, icon?: string) => {
      const b = h('div', { class: `btn ${cls}`, role: 'button' }, ...(icon ? [h('span', { html: icon, class: 'bico' })] : []), label);
      this.api.input.bindButton(b, a);
      return b;
    };
    ctl.append(mk(S.rotate, '', 'rotate', SVG.rotate), mk(S.placeIt, status?.ok === false ? 'primary disabled' : 'primary', 'confirm'), mk(S.cancelBuild, 'ghost', 'cancel'));
    const statusEl = h('div', { class: `build-status ${status ? (status.ok ? 'ok' : 'bad') : ''}` }, status ? (status.ok ? S.buildOk : (status.reason ?? S.buildBad)) : '');
    wrap.append(h('div.build-top', null, tabs, tiers), statusEl, bar, ctl);
  }

  // ---------------- bus ----------------
  private listen(): void {
    const bus = this.api.bus;
    bus.on('toast', (e) => this.toast(e.text, e.kind ?? 'info', e.icon));
    bus.on('hint', (e) => this.hint(e.text));
    bus.on('prompt', (e) => {
      if (!e.text) {
        this.promptEl.classList.remove('show');
        this.setInteractReady(false);
        return;
      }
      clear(this.promptEl);
      if (e.key && !this.api.input.usingTouch) this.promptEl.append(h('kbd', null, e.key));
      this.promptEl.append(e.text);
      if (e.sub) this.promptEl.append(h('span.sub', null, e.sub));
      this.promptEl.classList.add('show');
      this.setInteractReady(true);
    });
    bus.on('progress', (e) => {
      if (e.value === null) {
        this.ringEl.classList.remove('show');
        return;
      }
      const c = 2 * Math.PI * 26;
      this.ringFg.setAttribute('stroke-dashoffset', String(c * (1 - Math.max(0, Math.min(1, e.value)))));
      this.ringEl.classList.add('show');
    });
    bus.on('district', (e) => {
      clear(this.bannerEl);
      this.bannerEl.append(h('div.state', null, e.state), h('h2', null, e.name), h('p', null, e.blurb));
      this.bannerEl.classList.add('show');
      window.clearTimeout(this.timers.banner);
      this.timers.banner = window.setTimeout(() => this.bannerEl.classList.remove('show'), 4200);
    });
    bus.on('subtitle', (e) => {
      if (!this.api.settings.subtitles) return;
      clear(this.subEl);
      if (e.who) this.subEl.append(h('span.who', null, e.who));
      this.subEl.append(e.text);
      this.subEl.classList.add('show');
      window.clearTimeout(this.timers.sub);
      this.timers.sub = window.setTimeout(() => this.subEl.classList.remove('show'), Math.max(2500, e.text.length * 70));
    });
    bus.on('mode', (e) => {
      this.mode = e.mode;
      this.hud.classList.toggle('cinematic', e.mode === 'cinematic' || e.mode === 'sleeping');
      if (e.mode === 'build') this.showBuildBar();
      else this.hideBuildBar();
      if (e.mode === 'dead') this.showDeath();
      else this.hideDeath();
      this.hud.classList.toggle('building', e.mode === 'build');
    });
    bus.on('pickup', (e) => this.pickup(e.item, e.n));
    bus.on('saved', (e) => {
      const el = h('div.save-dot', null, e.cloud ? S.savedCloud : S.saved);
      this.hud.append(el);
      setTimeout(() => el.classList.add('out'), 1400);
      setTimeout(() => el.remove(), 2000);
    });
    bus.on('settings', () => {
      this.applyHtmlClasses();
      this.refreshOpen(['settings']);
    });
    bus.on('damage', (e) => {
      this.flashDamage(e.amount);
      this.reticle.classList.add('hit');
      setTimeout(() => this.reticle.classList.remove('hit'), 140);
    });
    bus.on('build', (e) => {
      if (e.piece) this.buildPiece = e.piece;
      this.buildTier = e.tier;
      if (this.buildBar) this.renderBuildBar({ ok: e.ok, reason: e.reason });
    });
    bus.on('inventory', () => {
      this.refreshQuick();
      this.refreshOpen(['inventory', 'craft', 'storage']);
      if (this.buildBar) this.renderBuildBar();
    });
    bus.on('meters', () => this.refreshMeters());
    bus.on('town', () => this.refreshOpen(['ledger']));
    bus.on('net', (e) => {
      const show = e.status !== 'online';
      this.netChip.textContent = S.net[e.status] ?? '';
      this.netChip.className = `net-chip ${show ? 'show' : ''} ${e.status}`;
    });
    bus.on('update-ready', () => this.toast(S.updated, 'info'));
    bus.on('open', (e) => this.open(e.screen));
  }
}

function shortName(id: string): string {
  const n = getItem(id)?.name ?? id;
  return n.split(/[ &]/)[0];
}

