// Meridian Guild trader at the Haven camp (barter in Guild chits) and
// readable lore terminals scattered through the ruins.
import * as THREE from 'three';
import { FACTION_MAP, addItem, buyPrice, changeRep, countItem, getItem, removeItem, sellPrice } from '@dg/sim';
import { CharacterRig, randomLook } from '../render/character';
import { LORE_TERMINALS } from '../content/lore';
import { audio } from '../audio/audio';
import type { Game, ProviderPrompt } from './game';

const CHIT = 'misc.guild_chit';
const FACTION = 'guild';

export interface TradeRow {
  item: string;
  name: string;
  have: number;
  price: number;
  kind: 'buy' | 'sell';
}

export class Trader {
  readonly rig: CharacterRig;
  readonly pos: THREE.Vector3;
  /** set by main: opens the trade dialog */
  onOpen: (() => void) | null = null;
  /** set by main: shows a lore terminal */
  onLore: ((title: string, header: string, body: string) => void) | null = null;
  private lookT = 0;

  constructor(private game: Game) {
    const s = game.layout.spawn;
    this.pos = new THREE.Vector3(s.x + 8.6, 0, s.z - 1.6);
    this.pos.y = game.view.surface(this.pos.x, this.pos.z);
    this.rig = new CharacterRig(randomLook(0x6e7d, { shirt: 0x3a5a6a, accent: 0xc8a040, hairStyle: 2, backpack: true }));
    this.rig.root.position.copy(this.pos);
    this.rig.root.rotation.y = Math.PI;
    game.scene.add(this.rig.root);
    game.collision.add({ minX: this.pos.x - 0.35, maxX: this.pos.x + 0.35, minY: this.pos.y, maxY: this.pos.y + 1.8, minZ: this.pos.z - 0.35, maxZ: this.pos.z + 0.35, tag: 'npc', ref: 0 });
    game.tickers.push((dt) => this.update(dt));
    game.interactProviders.push({ prompt: () => this.prompt(), handle: (_h, _p, tapped) => this.handle(tapped) });
    game.terminalHook = (pid) => this.readTerminal(pid);
  }

  get rep(): number {
    return this.game.save.world.factions[FACTION] ?? FACTION_MAP.get(FACTION)?.startRep ?? 0;
  }

  private near(): boolean {
    return this.game.player.pos.distanceTo(this.pos) < 2.6;
  }

  private prompt(): ProviderPrompt | null {
    return this.near() ? { text: 'Odile', verb: 'Trade', kind: 'talk' as const, pos: this.pos.clone().setY(this.pos.y + 2.1), sub: 'Meridian Guild trader' } : null;
  }

  private handle(tapped: boolean): boolean {
    if (tapped) {
      const f = FACTION_MAP.get(FACTION);
      this.game.bus.emit({ type: 'subtitle', who: 'Odile', text: f?.lines.greet ?? 'Show me what you found.' });
      this.onOpen?.();
    }
    return true;
  }

  rows(): TradeRow[] {
    const inv = this.game.save.player.inventory;
    const rep = this.rep;
    const out: TradeRow[] = [];
    const f = FACTION_MAP.get(FACTION);
    for (const s of f?.sells ?? []) {
      const p = buyPrice(s.item, FACTION, rep);
      if (p !== null && getItem(s.item)) out.push({ item: s.item, name: getItem(s.item)!.name, have: countItem(inv, s.item), price: p, kind: 'buy' });
    }
    const seen = new Set<string>();
    for (const st of inv) {
      if (!st || seen.has(st.id) || st.id === CHIT) continue;
      seen.add(st.id);
      const p = sellPrice(st.id, FACTION, rep);
      if (p > 0) out.push({ item: st.id, name: getItem(st.id)?.name ?? st.id, have: countItem(inv, st.id), price: p, kind: 'sell' });
    }
    return out;
  }

  chits(): number {
    return countItem(this.game.save.player.inventory, CHIT);
  }

  trade(row: TradeRow, n: number): boolean {
    const inv = this.game.save.player.inventory;
    if (row.kind === 'sell') {
      const k = Math.min(n, countItem(inv, row.item));
      if (k <= 0) return false;
      removeItem(inv, row.item, k);
      const left = addItem(inv, CHIT, row.price * k);
      if (left > 0) {
        removeItem(inv, CHIT, row.price * k - left);
        addItem(inv, row.item, k);
        audio.play('deny');
        this.game.toast('No room for the chits. Free a slot first.', 'bad');
        return false;
      }
    } else {
      const cost = row.price * n;
      if (this.chits() < cost) {
        audio.play('deny');
        this.game.toast('Not enough Guild chits.', 'bad');
        return false;
      }
      if (addItem(inv, row.item, n) > 0) {
        audio.play('deny');
        this.game.toast('No room in your pack.', 'bad');
        return false;
      }
      removeItem(inv, CHIT, cost);
    }
    const w = this.game.save.world;
    w.factions[FACTION] = changeRep(w.factions, FACTION, 0.5);
    audio.play('craft');
    this.game.bus.emit({ type: 'inventory' });
    return true;
  }

  private readTerminal(pid: number): void {
    const g = this.game;
    const p = g.layout.props[pid];
    const dkey = g.layout.districts[p.district]?.key;
    const w = g.save.world;
    const pool = LORE_TERMINALS.filter((l) => l.district === dkey);
    const all = pool.length ? pool : LORE_TERMINALS;
    const unread = all.filter((l) => !w.flags[`lore:${l.id}`]);
    const pick = (unread.length ? unread : all)[pid % (unread.length ? unread.length : all.length)];
    if (!pick) return;
    const first = !w.flags[`lore:${pick.id}`];
    w.flags[`lore:${pick.id}`] = true;
    audio.play('node');
    g.fx.glowBurst(p.x, g.view.height(p.x, p.z) + 1.2, p.z, 8);
    if (first) g.toast('Lore added to your journal.', 'warm');
    this.onLore?.(pick.title, pick.header, pick.body);
  }

  private update(dt: number): void {
    this.lookT -= dt;
    this.rig.speed = 0;
    if (this.near()) {
      const p = this.game.player.pos;
      const target = Math.atan2(p.x - this.pos.x, p.z - this.pos.z);
      let d = target - this.rig.root.rotation.y;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      this.rig.root.rotation.y += d * Math.min(1, dt * 4);
    }
    this.rig.update(dt);
  }
}
