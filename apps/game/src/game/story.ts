// Campaign plumbing on the client: the Act III toll decision, the Grid Core
// hatch under Old Downtown, the core choice and the ending screen, plus the
// "next step" + ending paths the Journal shows. Rules live in @dg/sim campaign.ts.
import * as THREE from 'three';
import { CORE_CHOICES, QUEST_MAP, applyChoice, choicePending, endingPaths, endingPreview, isQuestDone, nextStep, objectiveProgress, tileAt, ENDINGS, type CoreChoice } from '@dg/sim';
import { Tile } from '@dg/shared';
import { ENDINGS as EPILOGUES, type EndingKey } from '../content/campaign';
import { audio } from '../audio/audio';
import { S } from '../ui/strings';
import { btn, h, tap } from '../ui/dom';
import type { UI } from '../ui/ui';
import type { Game, ProviderPrompt } from './game';

/** sim core choice → client epilogue (content/campaign.ts) where one is written */
const EPILOGUE_FOR: Partial<Record<string, EndingKey>> = { 'end.commons': 'people', 'end.guild': 'guild', 'end.sleep': 'dark' };

export interface StoryInfo {
  next: { id: string; index: number; type: string; title: string; text: string; hint: string; have: number; need: number } | null;
  /** pending decision key the Journal can open ("toll" | "core") */
  decide: string | null;
  endings: { title: string; how: string; met: boolean; reached: boolean }[] | null;
  rep: { name: string; value: number }[];
  ending: string | null;
}

export class Story {
  readonly corePos: THREE.Vector3;
  private hatch: THREE.Group;
  private beacon: THREE.Mesh;
  private hatchMat: THREE.MeshBasicMaterial;
  private tollPrompted = false;
  private t = 0;
  private time = 0;

  constructor(private game: Game, private ui: UI) {
    this.corePos = this.findCoreSpot();
    const g = new THREE.Group();
    const conc = new THREE.MeshStandardMaterial({ color: 0x5b5d5f, roughness: 0.9 });
    const ring = new THREE.Mesh(new THREE.CylinderGeometry(2.3, 2.5, 0.3, 20), conc);
    ring.position.y = 0.15;
    this.hatchMat = new THREE.MeshBasicMaterial({ color: 0x2a6d78 });
    const lid = new THREE.Mesh(new THREE.CylinderGeometry(1.7, 1.7, 0.08, 20), this.hatchMat);
    lid.position.y = 0.32;
    const bar = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.1, 0.22), new THREE.MeshStandardMaterial({ color: 0x2c2e30, roughness: 0.6, metalness: 0.5 }));
    bar.position.y = 0.38;
    g.add(ring, lid, bar);
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.22, 1.1, 0.22), conc);
      post.position.set(Math.cos(a) * 2.6, 0.55, Math.sin(a) * 2.6);
      g.add(post);
    }
    this.beacon = new THREE.Mesh(
      new THREE.CylinderGeometry(0.35, 0.9, 60, 10, 1, true),
      new THREE.MeshBasicMaterial({ color: 0x5ff0e0, transparent: true, opacity: 0.18, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
    );
    this.beacon.position.y = 30;
    g.add(this.beacon);
    g.position.copy(this.corePos);
    g.visible = false;
    this.hatch = g;
    game.scene.add(g);
    game.interactProviders.push({ prompt: () => this.prompt(), handle: (_h, _p, tapped) => this.handle(tapped) });
    game.tickers.push((dt) => this.update(dt));
  }

  /** a street/plaza spot near the downtown centre, clear of the node masts */
  private findCoreSpot(): THREE.Vector3 {
    const L = this.game.layout;
    const di = L.districts.findIndex((d) => d.key === 'downtown');
    const d = L.districts[di];
    const nodes = L.nodes.filter((n) => n.district === di);
    let best: { x: number; z: number; s: number } | null = null;
    for (let dz = -80; dz <= 80; dz += 2)
      for (let dx = -80; dx <= 80; dx += 2) {
        const x = d.cx + dx, z = d.cz + dz;
        const t = tileAt(L, x, z);
        if (t !== Tile.Plaza && t !== Tile.Road) continue;
        // whole hatch footprint on open ground
        let ok = true;
        for (const [ox, oz] of [[3, 0], [-3, 0], [0, 3], [0, -3]]) {
          const tt = tileAt(L, x + ox, z + oz);
          if (tt !== Tile.Plaza && tt !== Tile.Road && tt !== Tile.Sidewalk) ok = false;
        }
        if (!ok || nodes.some((n) => Math.hypot(n.x - x, n.z - z) < 14)) continue;
        const s = Math.hypot(dx, dz) - (t === Tile.Plaza ? 12 : 0);
        if (!best || s < best.s) best = { x, z, s };
      }
    const x = best?.x ?? d.cx, z = best?.z ?? d.cz;
    return new THREE.Vector3(x, this.game.view.surface(x, z), z);
  }

  /** Act IV has begun (the hatch is part of the world from here on) */
  private coreActive(): boolean {
    const w = this.game.save?.world;
    if (!w) return false;
    const ind = QUEST_MAP.get('q.industry');
    return !!ind && isQuestDone(w, ind);
  }

  private coreOpen(): { open: boolean; have: number; need: number } {
    const q = QUEST_MAP.get('q.core')!;
    const step0 = q.steps[0].obj;
    const w = this.game.save.world;
    const p = objectiveProgress(w, step0, this.game.questCtx());
    // open once the quest is past "reboot every downtown node" (or the nodes are all up)
    return { open: (w.quests['q.core'] ?? 0) >= 1 || p.have >= p.need, have: p.have, need: p.need };
  }

  private prompt(): ProviderPrompt | null {
    if (!this.hatch.visible) return null;
    const pp = this.game.player.pos;
    if (Math.hypot(pp.x - this.corePos.x, pp.z - this.corePos.z) > 3.2) return null;
    const st = this.coreOpen();
    const pos = this.corePos.clone().setY(this.corePos.y + 1.6);
    if (!st.open) return { text: S.camp.coreName, verb: S.camp.coreInspect, sub: S.camp.coreSealed(st.have, st.need), kind: 'use', pos };
    return { text: S.camp.coreName, verb: S.camp.coreEnter, sub: S.camp.coreSub, kind: 'use', pos };
  }

  private handle(tapped: boolean): boolean {
    if (!tapped) return true;
    const st = this.coreOpen();
    if (!st.open) {
      audio.play('deny');
      this.game.toast(S.camp.coreSealed(st.have, st.need), 'bad');
      return true;
    }
    const w = this.game.save.world;
    w.flags['talk:grid_core'] = true;
    this.game.pokeQuests();
    audio.play('powerUp', { vol: 0.8 });
    this.game.camera.addTrauma(0.2);
    if (choicePending(w, 'core')) this.openCore();
    return true;
  }

  private update(dt: number): void {
    this.time += dt;
    const vis = this.coreActive();
    if (this.hatch.visible !== vis) this.hatch.visible = vis;
    if (vis) {
      const open = this.coreOpen().open;
      this.beacon.visible = open && !this.game.save.world.flags['ending'];
      const k = 0.5 + 0.5 * Math.sin(this.time * 2.2);
      this.hatchMat.color.setRGB(0.12 + (open ? 0.25 * k : 0.05), 0.35 + (open ? 0.45 * k : 0.05), 0.4 + (open ? 0.45 * k : 0.05));
    }
    this.t -= dt;
    if (this.t > 0) return;
    this.t = 2;
    // Act III: put the toll decision in front of the player once, when nothing else is open
    const w = this.game.save?.world;
    if (!w || this.tollPrompted || this.game.mode !== 'play' || this.ui.openScreen) return;
    if (choicePending(w, 'toll')) {
      this.tollPrompted = true;
      this.openToll();
    }
  }

  /** Journal: open whichever decision is pending */
  decide(key: string): void {
    if (key === 'toll') this.openToll();
    else if (key === 'core') {
      if (this.game.save.world.flags['talk:grid_core']) this.openCore();
      else this.game.toast(S.camp.coreSub, 'info');
    }
  }

  openToll(): void {
    const w = this.game.save.world;
    if (!choicePending(w, 'toll')) return;
    const list = h('div.list.choice-list');
    for (const [opt, [label, effect]] of Object.entries(S.camp.tollOpts)) {
      const row = h('div.li.choice', { role: 'button', 'data-choice': opt }, h('div.main', null, h('b', null, label), h('small', null, effect)));
      tap(row, () => {
        if (!applyChoice(w, 'toll', opt)) return;
        this.ui.closeDialog();
        audio.play(opt === 'fight' ? 'hurt' : 'levelUp', { vol: 0.7 });
        this.game.camera.addTrauma(0.25);
        this.game.toast(S.camp.tollDone(label), 'warm');
        this.game.pokeQuests();
        this.game.persist('choice');
      });
      list.append(row);
    }
    this.ui.dialog(S.camp.tollTitle, h('div', null, h('p', null, S.camp.tollBody), list), [btn(S.camp.later, 'ghost', () => this.ui.closeDialog())]);
  }

  openCore(): void {
    const w = this.game.save.world;
    if (!choicePending(w, 'core')) return;
    const list = h('div.list.choice-list');
    for (const c of CORE_CHOICES) {
      const pv = endingPreview(c, w.factions);
      const need = pv.needs.map((n) => `${S.camp.factionNames[n.faction] ?? n.faction} ${Math.round(n.have)}/${n.min}`).join(' · ');
      const row = h(
        'div',
        { class: `li choice ${pv.met ? '' : 'unmet'}`, role: 'button', 'data-choice': c },
        h('div.main', null, h('b', null, S.camp.coreOpts[c]), h('small', null, `${S.camp.coreResult(pv.result.title)}${need ? ` · ${need}` : ''}`)),
      );
      tap(row, () => this.confirmCore(c));
      list.append(row);
    }
    this.ui.dialog(S.camp.coreTitle, h('div', null, h('p', null, S.camp.coreBody), list), [btn(S.camp.later, 'ghost', () => this.ui.closeDialog())]);
  }

  private confirmCore(c: CoreChoice): void {
    const w = this.game.save.world;
    const pv = endingPreview(c, w.factions);
    this.ui.dialog(S.camp.coreOpts[c], `${S.camp.coreResult(pv.result.title)}. ${S.camp.coreBody.split('. ').pop()}`, [
      btn(S.cancel, 'ghost', () => this.openCore()),
      btn(S.camp.coreConfirm, 'primary', () => {
        if (!applyChoice(w, 'core', c)) return;
        w.flags['endingAt'] = w.hour;
        this.ui.closeDialog();
        this.game.pokeQuests();
        this.game.persist('ending');
        audio.play('powerUp', { vol: 1 });
        this.game.camera.addTrauma(0.5);
        this.game.fx.glowBurst(this.corePos.x, this.corePos.y + 2, this.corePos.z, 60);
        setTimeout(() => this.showEnding(), 900);
      }, { 'data-confirm': c }),
    ]);
  }

  showEnding(): void {
    const id = String(this.game.save.world.flags['ending'] ?? '');
    const e = ENDINGS.find((x) => x.id === id);
    if (!e) return;
    const body = h('div.ending', { 'data-ending': id }, h('p', null, e.text));
    const key = EPILOGUE_FOR[id];
    if (key) {
      body.append(h('h3.section', null, S.camp.epilogue));
      for (const line of EPILOGUES[key].epilogue) body.append(h('p', null, line));
    }
    audio.play('levelUp', { vol: 0.9 });
    this.ui.dialog(e.title, body, [btn(S.camp.keepPlaying, 'primary', () => this.ui.closeDialog())]);
  }

  /** what the Journal shows */
  info(): StoryInfo {
    const w = this.game.save.world;
    const ns = nextStep(w, this.game.questCtx());
    const decide = choicePending(w, 'toll') ? 'toll' : choicePending(w, 'core') && w.flags['talk:grid_core'] ? 'core' : null;
    const met = isQuestDone(w, QUEST_MAP.get('q.first_node')!);
    const reached = String(w.flags['ending'] ?? '');
    const endings = met
      ? endingPaths(w.factions).map((p) => ({ title: p.ending.title, how: p.how, met: p.met, reached: p.ending.id === reached }))
      : null;
    const rep = Object.entries(S.camp.factionNames).map(([k, name]) => ({ name, value: Math.round(w.factions[k] ?? 0) }));
    return {
      next: ns ? { id: ns.quest.id, index: ns.index, type: ns.step.obj.type, title: ns.quest.title, text: ns.step.text, hint: ns.step.hint, have: ns.have, need: ns.need } : null,
      decide,
      endings,
      rep,
      ending: reached ? (ENDINGS.find((x) => x.id === reached)?.title ?? null) : null,
    };
  }
}
