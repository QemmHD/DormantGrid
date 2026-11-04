// Game orchestrator: owns the world, player, systems and implements GameAPI for the UI.
import * as THREE from 'three';
import { GAME_VERSION, RESTORATION_NAMES, Rng, type GameSave, type ItemStack, type PlacedPiece, type StationId, type ToolTier, type WorldLayout } from '@dg/shared';
import {
  BUILDING_SALVAGE,
  CONTAINER_LOOT,
  DISTRICT_YIELD,
  PROP_SALVAGE,
  RECIPE_MAP,
  START_HOUR,
  addItem,
  clockString,
  collapseAfterRemoval,
  collapsePlacedAfterRemoval,
  consume,
  craft as simCraft,
  damagePlayer,
  dayOf,
  districtAt,
  fallDamage,
  gameHoursPerRealSecond,
  generateWorld,
  getItem,
  getPiece,
  hourOfDay,
  isNight,
  migrateSave,
  activeQuests,
  advanceQuests,
  objectiveProgress,
  QUESTS,
  ACT_NAMES,
  modifiers,
  moveSlot as simMoveSlot,
  newGame as simNewGame,
  refundFor,
  removeItem,
  respawnPlayer,
  seasonOf,
  snapPiece,
  sortInventory as simSort,
  splitSlot as simSplit,
  takeItems,
  tickPlayer,
  tickStamina,
  toolCanBreak,
  totalWeight,
  validatePlacement,
  wearSlot,
  weatherAt,
  type PieceInfo,
  type SalvageDef,
  type Yield,
} from '@dg/sim';
import { Renderer, type QualityTier } from '../core/renderer';
import { PerfOverlay } from '../core/perf';
import { errors } from '../core/errors';
import { Input } from '../input/input';
import { Atmosphere, type Weather } from '../render/sky';
import { ThirdPersonCamera } from './camera';
import { PlayerController } from './player';
import { CollisionWorld, type Collider } from './collision';
import { CharacterRig, randomLook } from '../render/character';
import { audio, type Sfx } from '../audio/audio';
import { WorldView } from '../world/world';
import { FX } from '../render/fx';
import { MeshBuilder } from '../render/geo';
import { BaseView, levelFromY, STOREY_H } from './base';
import { Bus, loadSettings, storeSettings, type CraftInfo, type GameAPI, type GameMode, type ScreenId, type Settings } from './api';
import { ONBOARDING, type OnboardingTrigger } from '../content/onboarding';
import { DISTRICT_INTROS } from '../content/campaign';

export const SEED = 1337;
const INTERACT_RANGE = 3.2;
const tmpV = new THREE.Vector3();

type Target =
  | { kind: 'prop'; id: number; pos: THREE.Vector3; def: SalvageDef; name: string; searched: boolean }
  | { kind: 'piece'; bid: number; index: number; pos: THREE.Vector3; def: SalvageDef; info: PieceInfo; name: string }
  | { kind: 'placed'; id: number; pos: THREE.Vector3; piece: PlacedPiece; name: string }
  | { kind: 'drop'; index: number; pos: THREE.Vector3; name: string };

function matOf(item: string): string {
  if (item.startsWith('mat.')) return item.slice(4);
  if (item.startsWith('food.') || item.startsWith('seed.')) return 'organic';
  if (item.startsWith('drink.')) return 'glass';
  if (item.startsWith('med.')) return 'cloth';
  return 'scrap';
}

const SFX_FOR: Record<SalvageDef['sfx'], Sfx> = {
  metal: 'hitMetal',
  wood: 'hitWood',
  stone: 'hitStone',
  glass: 'hitGlass',
  cloth: 'hitFlesh',
  foliage: 'hitWood',
  plastic: 'hitWood',
};

export class Game implements GameAPI {
  readonly bus = new Bus();
  renderer!: Renderer;
  scene = new THREE.Scene();
  camera!: ThirdPersonCamera;
  atm!: Atmosphere;
  input!: Input;
  player!: PlayerController;
  readonly collision = new CollisionWorld();
  perf!: PerfOverlay;
  view!: WorldView;
  base!: BaseView;
  fx!: FX;
  layout!: WorldLayout;
  readonly audio = audio;
  settings: Settings = loadSettings();
  save!: GameSave;
  mode: GameMode = 'menu';
  paused = false;
  time = 0;
  private last = performance.now();
  readonly rng = new Rng(Date.now() & 0xffffffff);
  private target: Target | null = null;
  private targetTimer = 0;
  private holdT = 0;
  private holdHitT = 0;
  hitstop = 0;
  private attackT = 0;
  private propHp = new Map<number, number>();
  private searchedProps = new Set<number>();
  private survivalAcc = 0;
  private metersAcc = 0;
  private autosaveT = 0;
  private districtIdx = -1;
  private build: { piece: string; tier: number; rot: number; ok: boolean; reason: string | null } | null = null;
  private onbStep = 0;
  private onbStartPos = new THREE.Vector3();
  private onbYaw = 0;
  private dropMeshes: THREE.Mesh[] = [];
  private openScreenId: ScreenId | null = null;
  private recentFoods: string[] = [];
  private storageTarget: PlacedPiece | null = null;
  private promptT = 0;
  /** set by persistence layer (net/save services) */
  persistHook: ((save: GameSave, reason: string) => void) | null = null;
  hasSaveHook: (() => boolean) | null = null;
  /** UI hook to open screens */
  openScreenHook: ((id: ScreenId | null) => void) | null = null;
  /** returns the UI's currently open screen */
  screenProbe: (() => ScreenId | null) | null = null;
  /** per-frame hooks for other systems (survivors, grid, enemies, net) */
  readonly tickers: ((dt: number, simDt: number) => void)[] = [];
  playtime = 0;

  get hour(): number {
    return this.save?.world.hour ?? START_HOUR;
  }

  // ------------------------------------------------------------ boot
  async boot(progress: (p: number) => void): Promise<void> {
    const auto: QualityTier = matchMedia('(pointer: coarse)').matches ? 'medium' : 'high';
    const forced = new URLSearchParams(location.search).get('quality') as QualityTier | null;
    const tier = forced ?? (this.settings.quality === 'auto' ? auto : this.settings.quality);
    this.renderer = new Renderer(document.getElementById('view')!, tier);
    this.renderer.autoQuality = this.settings.quality === 'auto';
    this.perf = new PerfOverlay(this.renderer);
    this.perf.extra = () => ({
      hour: this.save ? clockString(this.save.world.hour) : '-',
      mode: this.mode,
      pos: this.player ? `${this.player.pos.x.toFixed(0)},${this.player.pos.z.toFixed(0)}` : '-',
    });
    this.camera = new ThirdPersonCamera(innerWidth / innerHeight);
    this.atm = new Atmosphere(this.scene, this.renderer.quality.shadows ? this.renderer.quality.shadowSize : 0);
    this.atm.onLightning = () => setTimeout(() => audio.play('thunder', { vol: 0.8 }), 400 + Math.random() * 1500);
    this.input = new Input(this.renderer.canvas);
    this.fx = new FX(this.scene);
    const vig = document.createElement('div');
    vig.className = 'vignette';
    document.getElementById('app')!.appendChild(vig);
    progress(0.15);
    await nextFrame();
    this.layout = generateWorld(SEED);
    progress(0.55);
    await nextFrame();
    this.view = this.makeView();
    this.base = new BaseView(this.collision, (x, z) => this.view.surface(x, z));
    this.scene.add(this.base.group);
    const rig = new CharacterRig(randomLook(7, { backpack: true, hairStyle: 1, shirt: 0x46535c, accent: 0xe8a65a }));
    this.scene.add(rig.root);
    this.player = new PlayerController(rig);
    this.player.terrain = (x, z) => this.view.surface(x, z);
    this.player.onStep = (run) => {
      const wet = this.atm.wetness > 0.3;
      audio.play(wet ? 'stepWet' : run ? 'stepHard' : 'step', { vol: run ? 0.5 : 0.35 });
    };
    this.player.onLand = (v) => {
      audio.play('land', { vol: Math.min(1, v / 10) });
      this.fx.dust(this.player.pos.x, this.player.pos.y, this.player.pos.z, 4);
      if (v > 9) {
        this.camera.addTrauma(0.35);
        const dmg = fallDamage(-v);
        if (dmg > 0) this.hurt(dmg, 'fall');
      }
    };
    this.renderer.onQualityChange = (q) => {
      this.view.radius = q.detailRadius;
      this.view.propDensity = q.propDensity;
      this.atm.setShadows(q.shadows ? q.shadowSize : 0);
      this.view.setShadows(q.shadows);
    };
    this.renderer.onContextRestored = () => this.toast('Graphics restored.');
    // A fresh world behind the main menu so the menu has a live backdrop.
    this.save = simNewGame(SEED, 'standard', this.layout.spawn);
    this.applyWorldState();
    this.placePlayer(this.layout.spawn.x, this.layout.spawn.z);
    this.camera.yaw = 2.4;
    this.camera.pitch = -0.18;
    this.view.loadAround(this.player.pos.x, this.player.pos.z);
    progress(0.95);
    const unlock = () => audio.unlock();
    window.addEventListener('touchend', unlock);
    window.addEventListener('mousedown', unlock);
    window.addEventListener('keydown', unlock);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.mode !== 'menu') this.persist('hidden');
    });
    window.addEventListener('pagehide', () => {
      if (this.mode !== 'menu') this.persist('pagehide');
    });
    this.applySettings();
    progress(1);
    requestAnimationFrame(this.frame);
  }

  private makeView(): WorldView {
    const v = new WorldView(this.layout, this.collision, this.renderer.quality.shadows);
    v.radius = this.renderer.quality.detailRadius;
    v.propDensity = this.renderer.quality.propDensity;
    this.scene.add(v.group);
    return v;
  }

  private placePlayer(x: number, z: number): void {
    this.player.pos.set(x, this.view.surface(x, z), z);
    this.player.vel.set(0, 0, 0);
    this.player.rig.root.position.copy(this.player.pos);
  }

  /** Re-apply persistent world deltas (removed props/pieces, base) to the view. */
  private applyWorldState(): void {
    const w = this.save.world;
    for (const id of w.removedProps) this.view.destroyProp(id);
    for (const [bid, list] of Object.entries(w.removedPieces)) {
      const set = this.view.removed(Number(bid));
      for (const i of list) set.add(i);
      this.view.markBuildingDirty(Number(bid));
    }
    this.base.rebuild(w.pieces, w.crops, w.hour);
    this.rebuildDrops();
  }

  // ------------------------------------------------------------ flow
  hasSave(): boolean {
    return this.hasSaveHook?.() ?? false;
  }

  async newGame(): Promise<void> {
    this.save = simNewGame(SEED, 'standard', this.layout.spawn);
    // starting kit: enough to survive the first hour, not enough to skip it
    const inv = this.save.player.inventory;
    addItem(inv, 'drink.clean_water', 2);
    addItem(inv, 'food.canned_beans', 2);
    addItem(inv, 'med.bandage', 1);
    this.save.player.quick = ['drink.clean_water', 'food.canned_beans', null, null];
    this.save.world.flags['onb'] = 0;
    this.resetWorldView();
    this.placePlayer(this.layout.spawn.x, this.layout.spawn.z);
    this.player.yaw = 2.4;
    this.camera.yaw = 2.4;
    this.startPlaying();
    this.persist('new');
  }

  async continueGame(): Promise<void> {
    this.startPlaying();
  }

  /** Load an existing save into the running world. */
  loadSave(save: GameSave): void {
    this.save = save;
    this.resetWorldView();
    this.placePlayer(save.player.x, save.player.z);
    this.player.pos.y = Math.max(save.player.y, this.view.surface(save.player.x, save.player.z));
    this.player.yaw = save.player.yaw;
    this.camera.yaw = save.player.yaw;
    this.view.loadAround(this.player.pos.x, this.player.pos.z);
    this.bus.emit({ type: 'inventory' });
    this.bus.emit({ type: 'meters' });
  }

  private resetWorldView(): void {
    this.scene.remove(this.view.group);
    this.view.dispose();
    this.view = this.makeView();
    this.propHp.clear();
    this.searchedProps.clear();
    this.applyWorldState();
    this.view.loadAround(this.save.player.x, this.save.player.z);
  }

  private startPlaying(): void {
    this.setMode('play');
    this.onbStep = Number(this.save.world.flags['onb'] ?? ONBOARDING.length);
    this.onbStartPos.copy(this.player.pos);
    this.onbYaw = this.camera.yaw;
    this.districtIdx = -1;
    this.bus.emit({ type: 'inventory' });
    this.bus.emit({ type: 'meters' });
    this.showOnboarding();
  }

  setMode(m: GameMode): void {
    this.mode = m;
    this.bus.emit({ type: 'mode', mode: m });
  }

  setPaused(p: boolean): void {
    this.paused = p;
  }

  quitToMenu(): void {
    this.persist('quit');
    this.stopBuild();
    this.setMode('menu');
  }

  openScreen(id: ScreenId | null): void {
    this.openScreenId = id;
    this.openScreenHook?.(id);
    this.bus.emit({ type: 'open', screen: id });
  }

  /** UI tells the game which screen is open (so hotkeys/triggers work) */
  noteScreen(id: ScreenId | null): void {
    this.openScreenId = id;
  }

  applySettings(): void {
    const s = this.settings;
    storeSettings(s);
    audio.volumes = { master: s.master, music: s.music, sfx: s.sfx, ambience: s.ambience };
    audio.setMuted(s.muted);
    audio.applyVolumes();
    this.input.sensitivity = s.sensitivity;
    this.input.leftHanded = s.leftHanded;
    this.camera.reduceShake = s.reduceShake;
    this.fx.reduced = s.reduceShake;
    this.renderer.fpsCap = s.fpsCap30 ? 30 : 60;
    if (s.quality !== 'auto' && s.quality !== this.renderer.quality.tier) this.renderer.setTier(s.quality);
    this.renderer.autoQuality = s.quality === 'auto';
    this.perf.toggle(s.showPerf || new URLSearchParams(location.search).has('perf'));
    const html = document.documentElement.classList;
    html.toggle('lefty', s.leftHanded);
    html.toggle('cb', s.colorblind);
    html.toggle('big-text', s.textSize === 'big');
    html.toggle('huge-text', s.textSize === 'huge');
    this.showOnboarding();
    this.bus.emit({ type: 'settings' });
  }

  persist(reason: string): void {
    if (!this.save || this.mode === 'menu') return;
    const p = this.save.player;
    p.x = this.player.pos.x;
    p.y = this.player.pos.y;
    p.z = this.player.pos.z;
    p.yaw = this.player.yaw;
    this.save.world.removedProps = [...this.view.removedProps].sort((a, b) => a - b);
    const rp: Record<string, number[]> = {};
    for (const [bid, set] of this.view.removedPieces) if (set.size) rp[bid] = [...set].sort((a, b) => a - b);
    this.save.world.removedPieces = rp;
    this.save.rev++;
    this.save.savedAt = Date.now();
    this.save.playtime += this.playtime;
    this.playtime = 0;
    this.save.gameVersion = GAME_VERSION;
    try {
      this.persistHook?.(this.save, reason);
    } catch (e) {
      errors.push(`persist failed: ${(e as Error).message}`);
    }
    this.bus.emit({ type: 'saved', at: Date.now(), cloud: false });
  }

  exportSave(): string {
    this.persist('export');
    return JSON.stringify(this.save);
  }

  async importSave(json: string): Promise<boolean> {
    try {
      const s = migrateSave(JSON.parse(json));
      this.loadSave(s);
      this.persist('import');
      return true;
    } catch (e) {
      this.toast(`That save couldn't be read: ${(e as Error).message}`, 'bad');
      return false;
    }
  }

  // ------------------------------------------------------------ inventory API
  private get inv(): (ItemStack | null)[] {
    return this.save.player.inventory;
  }

  carryWeight(): { kg: number; max: number } {
    return { kg: totalWeight(this.inv), max: 40 };
  }

  useSlot(i: number): void {
    const st = this.inv[i];
    if (!st) return;
    const def = getItem(st.id);
    if (!def) return;
    if (def.tool || def.weapon) {
      this.save.player.equipped = this.save.player.equipped === st.id ? null : st.id;
      audio.play('click');
      this.toast(this.save.player.equipped ? `Equipped ${def.name}` : `Put away ${def.name}`);
      if (this.save.player.equipped && def.tool) this.trigger('equippedTool');
      this.bus.emit({ type: 'inventory' });
      return;
    }
    if (def.food || def.heals) {
      const res = consume(this.save.player, st, this.save.world.hour, this.survivalCtx(), this.recentFoods);
      if (!res.ok) {
        audio.play('deny');
        if (res.message) this.toast(res.message, 'bad');
        return;
      }
      removeItem(this.inv, st.id, 1);
      if (def.food?.group) {
        this.recentFoods.push(def.food.group);
        if (this.recentFoods.length > 6) this.recentFoods.shift();
      }
      audio.play(st.id.startsWith('drink') ? 'drink' : def.heals ? 'click' : 'eat');
      if (res.message) this.toast(res.message, res.becameSick || res.spoiled ? "bad" : "warm");
      this.trigger('ateOrDrank');
      this.bus.emit({ type: 'inventory' });
      this.bus.emit({ type: 'meters' });
      return;
    }
    const piece = def.places ?? findPieceForItem(st.id);
    if (piece && getPiece(piece)) {
      this.openScreen(null);
      this.startBuild(piece, 0);
      return;
    }
    audio.play('deny');
  }

  dropSlot(i: number): void {
    const st = this.inv[i];
    if (!st) return;
    this.inv[i] = null;
    this.save.world.drops.push({ x: this.player.pos.x + Math.sin(this.player.yaw) * 0.8, z: this.player.pos.z + Math.cos(this.player.yaw) * 0.8, items: [st], t: this.save.world.hour });
    if (this.save.player.equipped === st.id && !this.inv.some((s) => s?.id === st.id)) this.save.player.equipped = null;
    this.rebuildDrops();
    audio.play('place', { vol: 0.5 });
    this.bus.emit({ type: 'inventory' });
  }

  moveSlot(a: number, b: number): void {
    simMoveSlot(this.inv, a, this.inv, b);
    this.bus.emit({ type: 'inventory' });
  }
  splitSlot(i: number): void {
    simSplit(this.inv, i);
    this.bus.emit({ type: 'inventory' });
  }
  sortInventory(): void {
    simSort(this.inv);
    this.bus.emit({ type: 'inventory' });
  }
  setQuick(q: number, itemId: string | null): void {
    this.save.player.quick[q] = itemId;
    this.bus.emit({ type: 'inventory' });
  }
  selectQuick(q: number): void {
    const id = this.save.player.quick[q];
    if (!id) return;
    const i = this.inv.findIndex((s) => s?.id === id);
    if (i < 0) {
      audio.play('deny');
      this.toast(`Out of ${getItem(id)?.name ?? id}`, 'bad');
      return;
    }
    this.useSlot(i);
  }

  storage(): (ItemStack | null)[] | null {
    return this.storageTarget?.store ?? null;
  }
  moveToStorage(i: number): void {
    const st = this.inv[i];
    const store = this.storage();
    if (!st || !store) return;
    const left = addItem(store, st.id, st.n, { d: st.d, t: st.t });
    if (left === 0) this.inv[i] = null;
    else st.n = left;
    audio.play('click');
    this.bus.emit({ type: 'inventory' });
  }
  moveFromStorage(i: number): void {
    const store = this.storage();
    const st = store?.[i];
    if (!st || !store) return;
    const left = addItem(this.inv, st.id, st.n, { d: st.d, t: st.t });
    if (left === 0) store[i] = null;
    else st.n = left;
    audio.play('click');
    this.bus.emit({ type: 'inventory' });
  }

  // ------------------------------------------------------------ crafting
  private nearbyStations(): StationId[] {
    const out: StationId[] = ['hands'];
    for (const p of this.save.world.pieces) {
      const def = getPiece(p.piece);
      if (!def?.station) continue;
      const pos = this.base.pos.get(p.id);
      if (pos && pos.distanceToSquared(this.player.pos) < 6 * 6) out.push(def.station);
    }
    return out;
  }

  craftInfo(): CraftInfo {
    return { stations: this.nearbyStations(), blueprints: this.save.world.blueprints, rank: Number(this.save.world.flags['rank'] ?? 1) };
  }

  craft(recipeId: string, times: number): boolean {
    const r = RECIPE_MAP.get(recipeId);
    if (!r) return false;
    let made = 0;
    const info = this.craftInfo();
    for (let i = 0; i < times; i++) {
      if (!simCraft(r, this.inv, { ...info, hour: this.save.world.hour })) break;
      made++;
    }
    if (made === 0) {
      audio.play('deny');
      return false;
    }
    audio.play('craft');
    const def = getItem(r.out);
    this.toast(`Crafted ${made * r.count}× ${def?.name ?? r.out}`, 'warm');
    this.fx.glowBurst(this.player.pos.x, this.player.pos.y + 1.2, this.player.pos.z, 10, 0xe8a65a);
    const f = this.save.world.flags;
    f[`crafted:${r.out}`] = Number(f[`crafted:${r.out}`] ?? 0) + made;
    if (r.out === 'tool.crowbar') this.trigger('craftedCrowbar');
    if (def?.tool && !this.save.player.equipped) {
      this.save.player.equipped = r.out;
      this.trigger('equippedTool');
    }
    if ((def?.tool || def?.weapon) && !this.save.player.quick.includes(r.out)) {
      const free = this.save.player.quick.indexOf(null);
      if (free >= 0) this.save.player.quick[free] = r.out;
    }
    this.bus.emit({ type: 'inventory' });
    this.persist('craft');
    return true;
  }

  // ------------------------------------------------------------ building
  startBuild(pieceId: string, tier: number): void {
    const def = getPiece(pieceId);
    if (!def) return;
    this.build = { piece: pieceId, tier: def.costs.length > 1 ? tier : 0, rot: 0, ok: false, reason: null };
    this.setMode('build');
    this.trigger('openedBuild');
    audio.play('open');
  }

  stopBuild(): void {
    this.build = null;
    this.base?.showGhost(null, 0, 0, 0, 0, 0, false);
    if (this.mode === 'build') this.setMode('play');
    this.bus.emit({ type: 'build', piece: null, tier: 0, ok: false });
  }

  private buildCost(): { item: string; count: number }[] {
    if (!this.build) return [];
    const def = getPiece(this.build.piece);
    if (!def) return [];
    if (def.fromItem) return [{ item: def.fromItem, count: 1 }];
    return def.costs[Math.min(this.build.tier, def.costs.length - 1)] ?? [];
  }

  private updateBuild(): void {
    const b = this.build;
    if (!b) return;
    const def = getPiece(b.piece)!;
    if (this.input.wasPressed('rotate')) {
      b.rot = (b.rot + 1) % 4;
      audio.play('click');
    }
    if (this.input.wasPressed('cancel') || this.input.wasPressed('build')) {
      this.stopBuild();
      audio.play('close');
      return;
    }
    const fwdYaw = this.camera.yaw;
    const dist = def.snap === 'cell' ? 4 : def.snap === 'edge' ? 3 : 2.4;
    const ax = this.player.pos.x + Math.sin(fwdYaw) * dist;
    const az = this.player.pos.z + Math.cos(fwdYaw) * dist;
    const terrain = this.view.surface(this.player.pos.x, this.player.pos.z);
    let level = levelFromY(Math.max(0, this.player.pos.y - terrain - 0.4) * (3 / STOREY_H));
    if (def.kind === 'roof' || def.kind === 'floor') level += 1;
    const yaw = fwdYaw + (b.rot * Math.PI) / 2;
    const cand = snapPiece(b.piece, ax, level * 3, az, yaw);
    const check = validatePlacement(this.save.world.pieces, { piece: b.piece, tier: b.tier as 0 | 1 | 2 | 3, x: cand.x, y: cand.y, z: cand.z, rot: cand.rot });
    const cost = this.buildCost();
    const afford = hasAll(this.inv, cost);
    let blocked = false;
    if (def.kind !== 'trap') {
      this.collision.query(cand.x - 1.4, cand.z - 1.4, cand.x + 1.4, cand.z + 1.4, (c) => {
        if (c.tag === 'piece' && c.maxY > 0.5) blocked = true;
      });
    }
    b.ok = check.ok && afford && !blocked;
    b.reason = !check.ok ? (check.reason ?? 'blocked') : blocked ? 'blocked' : !afford ? 'materials' : null;
    const y = this.base.worldBase(this.save.world.pieces, { piece: b.piece, x: cand.x, y: cand.y, z: cand.z });
    this.base.showGhost(b.piece, b.tier, cand.x, y, cand.z, cand.rot, b.ok);
    this.bus.emit({ type: 'build', piece: b.piece, tier: b.tier, ok: b.ok, reason: b.reason ?? undefined });
    if (this.input.wasPressed('confirm') || this.input.wasPressed('attack')) {
      if (!b.ok) {
        audio.play('deny');
        const why =
          b.reason === 'materials'
            ? 'Not enough materials.'
            : b.reason === 'unsupported'
              ? 'Needs support — build on a foundation or next to something solid.'
              : b.reason === 'occupied'
                ? 'Something is already there.'
                : b.reason === 'blocked'
                  ? 'Too close to a ruin to build here.'
                  : "Can't place that here.";
        this.toast(why, 'bad');
        return;
      }
      takeItems(this.inv, cost);
      const id = this.save.world.nextPieceId++;
      const placed: PlacedPiece = { id, piece: b.piece, tier: b.tier as 0 | 1 | 2 | 3, x: cand.x, y: cand.y, z: cand.z, rot: cand.rot, hp: def.hp };
      if (def.storageSlots) placed.store = new Array(def.storageSlots).fill(null);
      this.save.world.pieces.push(placed);
      this.base.rebuild(this.save.world.pieces, this.save.world.crops, this.save.world.hour);
      audio.play('place');
      this.fx.dust(cand.x, y, cand.z, 6);
      this.camera.addTrauma(0.12);
      this.hitstop = 0.03;
      if (b.piece === 'foundation') this.trigger('placedFoundation');
      if (def.kind === 'wall') {
        const walls = this.save.world.pieces.filter((p) => getPiece(p.piece)?.kind === 'wall').length;
        if (walls >= 3) this.trigger('placedWalls');
      }
      if (def.kind === 'roof') this.trigger('placedRoof');
      if (b.piece === 'bed') {
        this.save.player.bed = { x: cand.x, z: cand.z };
        this.trigger('placedBed');
        this.toast('Bed placed. You will wake up here.', 'warm');
      }
      const f = this.save.world.flags;
      f[`built:${b.piece}`] = Number(f[`built:${b.piece}`] ?? 0) + 1;
      this.bus.emit({ type: 'inventory' });
      this.persist('build');
      if (def.fromItem && !this.inv.some((s) => s?.id === def.fromItem)) this.stopBuild();
    }
  }

  // ------------------------------------------------------------ interaction
  private scanTargets(): void {
    const px = this.player.pos.x, pz = this.player.pos.z, py = this.player.pos.y;
    const fx = Math.sin(this.camera.yaw), fz = Math.cos(this.camera.yaw);
    let best: Target | null = null;
    let bestScore = Infinity;
    const score = (x: number, z: number, extra = 0) => {
      const dx = x - px, dz = z - pz;
      const d = Math.hypot(dx, dz);
      const dot = d > 0.01 ? (dx * fx + dz * fz) / d : 1;
      return d * (1.6 - dot) + extra;
    };
    this.save.world.drops.forEach((dp, i) => {
      if (Math.hypot(dp.x - px, dp.z - pz) > INTERACT_RANGE) return;
      const sc = score(dp.x, dp.z, -1);
      if (sc < bestScore) {
        bestScore = sc;
        best = { kind: 'drop', index: i, pos: new THREE.Vector3(dp.x, this.view.surface(dp.x, dp.z), dp.z), name: 'Dropped pack' };
      }
    });
    const near: number[] = [];
    this.view.propsNear(px, pz, INTERACT_RANGE + 2.5, near);
    for (const pid of near) {
      const p = this.layout.props[pid];
      const reach = INTERACT_RANGE + (p.kind === 'bus' || p.kind === 'container' ? 2.5 : p.kind === 'car' || p.kind === 'van' || p.kind === 'tree' ? 1.2 : 0);
      if (Math.hypot(p.x - px, p.z - pz) > reach || Math.abs(p.y + this.view.height(p.x, p.z) - py) > 2.5) continue;
      const sc = score(p.x, p.z);
      if (sc < bestScore) {
        bestScore = sc;
        best = { kind: 'prop', id: pid, pos: new THREE.Vector3(p.x, p.y + this.view.height(p.x, p.z) + 0.6, p.z), def: PROP_SALVAGE[p.kind], name: propName(p.kind), searched: this.searchedProps.has(pid) };
      }
    }
    for (const pc of this.save.world.pieces) {
      const pos = this.base.pos.get(pc.id);
      if (!pos) continue;
      if (Math.hypot(pos.x - px, pos.z - pz) > INTERACT_RANGE + 0.5 || Math.abs(pos.y - py) > 3) continue;
      const def = getPiece(pc.piece);
      const useful = def?.station || def?.storageSlots || pc.piece === 'bed' || pc.piece === 'farm_plot';
      const sc = score(pos.x, pos.z, useful ? -0.6 : 0.4);
      if (sc < bestScore) {
        bestScore = sc;
        best = { kind: 'placed', id: pc.id, pos, piece: pc, name: def?.name ?? pc.piece };
      }
    }
    const R = 2.2;
    const cy = py + 1.2;
    this.collision.query(px - R, pz - R, px + R, pz + R, (c: Collider) => {
      if (c.tag !== 'piece') return;
      const cx = Math.max(c.minX, Math.min(px, c.maxX));
      const czz = Math.max(c.minZ, Math.min(pz, c.maxZ));
      const cyy = Math.max(c.minY, Math.min(cy, c.maxY));
      if (Math.hypot(cx - px, czz - pz) > R || Math.abs(cyy - cy) > 1.6) return;
      const sc = score(cx, czz, 0.8 + Math.abs(cyy - cy) * 0.5);
      if (sc < bestScore) {
        const bid = Math.floor(c.ref / 1000), index = c.ref % 1000;
        const info = this.view.pieces(bid)[index];
        if (!info) return;
        bestScore = sc;
        best = { kind: 'piece', bid, index, pos: new THREE.Vector3(cx, cyy, czz), def: BUILDING_SALVAGE[info.kind], info, name: pieceName(info) };
      }
    });
    const prevKey = targetKey(this.target);
    this.target = best;
    if (targetKey(best) !== prevKey) {
      this.holdT = 0;
      this.bus.emit({ type: 'progress', value: null });
      this.updatePrompt();
    }
  }

  private toolTier(): { tier: ToolTier; speed: number; slot: number } {
    const eq = this.save.player.equipped;
    if (eq) {
      const def = getItem(eq);
      const slot = this.inv.findIndex((s) => s?.id === eq);
      if (def?.tool && slot >= 0) return { tier: def.tool.tier, speed: def.tool.speed, slot };
    }
    return { tier: 'hands', speed: 1, slot: -1 };
  }

  private updatePrompt(): void {
    const t = this.target;
    if (!t || this.mode !== 'play') {
      this.bus.emit({ type: 'prompt', text: null });
      return;
    }
    if (t.kind === 'drop') {
      this.bus.emit({ type: 'prompt', text: 'Pick up pack', key: 'E' });
    } else if (t.kind === 'placed') {
      const def = getPiece(t.piece.piece);
      const verb = t.piece.piece === 'bed' ? 'Sleep in' : def?.storageSlots ? 'Open' : def?.station ? 'Use' : null;
      this.bus.emit({ type: 'prompt', text: verb ? `${verb} ${t.name}` : `Hold to dismantle ${t.name}`, sub: verb ? 'hold to dismantle' : undefined, key: 'E' });
    } else if (t.kind === 'prop' && PROP_SALVAGE[this.layout.props[t.id].kind]?.container && !t.searched) {
      this.bus.emit({ type: 'prompt', text: `Search ${t.name}`, sub: 'hold to salvage', key: 'E' });
    } else {
      const ok = toolCanBreak(this.toolTier().tier, t.def.tool);
      this.bus.emit({ type: 'prompt', text: ok ? `Hold to salvage ${t.name}` : t.name, sub: ok ? undefined : `needs ${toolName(t.def.tool)}`, key: 'E' });
    }
  }

  get interactReady(): boolean {
    return !!this.target;
  }

  private updateInteract(dt: number): void {
    const t = this.target;
    const held = this.input.isHeld('interact');
    const tapped = this.input.wasReleased('interact') && this.holdT < 0.35;
    if (!t) {
      if (this.input.wasPressed('interact')) audio.play('deny', { vol: 0.4 });
      this.holdT = 0;
      return;
    }
    if (tapped) {
      if (t.kind === 'drop') return this.pickupDrop(t.index);
      if (t.kind === 'placed') {
        const def = getPiece(t.piece.piece);
        if (t.piece.piece === 'bed') return this.trySleep();
        if (def?.storageSlots) {
          this.storageTarget = t.piece;
          this.openScreen('storage');
          return;
        }
        if (def?.station) {
          this.openScreen('craft');
          return;
        }
      }
      if (t.kind === 'prop' && PROP_SALVAGE[this.layout.props[t.id].kind]?.container && !this.searchedProps.has(t.id)) return this.searchProp(t.id);
    }
    if (!held || t.kind === 'drop') {
      if (this.holdT > 0) this.bus.emit({ type: 'progress', value: null });
      this.holdT = 0;
      return;
    }
    const tool = this.toolTier();
    let need = 3;
    let can = true;
    if (t.kind === 'placed') {
      need = 2.5;
    } else {
      can = toolCanBreak(tool.tier, t.def.tool);
      const best = tool.tier === t.def.best ? 1.6 : 1;
      need = t.def.time / (tool.speed * best);
      if (t.kind === 'prop') need *= Math.max(0.6, this.layout.props[t.id].scale);
    }
    if (!can) {
      if (this.input.wasPressed('interact')) {
        audio.play('deny');
        if ('def' in t) this.toast(`You'll need a ${toolName(t.def.tool)} for that.`, 'bad');
      }
      return;
    }
    // small grace so a tap doesn't start salvaging
    this.holdT += dt;
    if (this.holdT < 0.18) return;
    this.player.rig.setState('interact');
    this.player.yaw = Math.atan2(t.pos.x - this.player.pos.x, t.pos.z - this.player.pos.z);
    this.holdHitT -= dt;
    const weight = 'def' in t ? t.def.weight : 0.5;
    if (this.holdHitT <= 0) {
      this.holdHitT = 0.42;
      const sfx = 'def' in t ? SFX_FOR[t.def.sfx] : 'hitWood';
      audio.play(sfx, { vol: 0.55, pos: t.pos });
      this.camera.addTrauma(0.05 + weight * 0.05);
      this.fx.debris(t.pos.x, t.pos.y, t.pos.z, 'def' in t ? t.def.sfx : 'wood', 0.15, 3);
      if ('def' in t && (t.def.sfx === 'metal' || t.def.sfx === 'stone')) this.fx.sparks(t.pos.x, t.pos.y, t.pos.z, 5);
      if (t.kind === 'prop') this.view.pokeProp(t.id, 0.94, (Math.random() - 0.5) * 0.06);
      this.hitstop = 0.03;
    } else if (t.kind === 'prop' && this.holdHitT < 0.3) this.view.pokeProp(t.id, 1);
    const k = Math.min(1, (this.holdT - 0.18) / need);
    this.bus.emit({ type: 'progress', value: k });
    if (k >= 1) {
      this.holdT = 0;
      this.bus.emit({ type: 'progress', value: null });
      if (tool.slot >= 0 && t.kind !== 'placed') {
        if (wearSlot(this.inv, tool.slot, 1)) {
          this.toast('Your tool broke.', 'bad');
          this.save.player.equipped = null;
        }
      }
      if (t.kind === 'prop') this.salvageProp(t.id);
      else if (t.kind === 'piece') this.salvagePiece(t.bid, t.index);
      else if (t.kind === 'placed') this.dismantlePlaced(t.piece);
      this.target = null;
      this.targetTimer = 0;
      this.player.rig.setState('idle');
      this.bus.emit({ type: 'prompt', text: null });
    }
  }

  rollYields(ys: readonly Yield[], mult: number): { item: string; n: number }[] {
    const out: { item: string; n: number }[] = [];
    for (const y of ys) {
      if (y.chance !== undefined && !this.rng.chance(y.chance)) continue;
      const n = Math.round(this.rng.int(y.min, y.max) * mult);
      if (n > 0) out.push({ item: y.item, n });
    }
    return out;
  }

  grant(items: { item: string; n: number }[], from: THREE.Vector3): void {
    let delay = 0;
    let overflow = false;
    for (const { item, n } of items) {
      if (!getItem(item)) continue;
      const left = addItem(this.inv, item, n);
      const got = n - left;
      if (left > 0) {
        overflow = true;
        this.save.world.drops.push({ x: from.x, z: from.z, items: [{ id: item, n: left }], t: this.save.world.hour });
      }
      if (got <= 0) continue;
      const chips = Math.min(5, got);
      for (let i = 0; i < chips; i++) {
        const last = i === chips - 1;
        this.fx.flyer(
          from.x, from.y, from.z, matOf(item), delay,
          last
            ? () => {
                audio.play('pickup', { pitch: 1 + Math.random() * 0.2, vol: 0.5 });
                this.bus.emit({ type: 'pickup', item, n: got });
              }
            : undefined,
        );
        delay += 0.05;
      }
    }
    if (overflow) {
      this.toast('Your pack is full — the rest is on the ground.', 'bad');
      this.rebuildDrops();
    }
    if (items.length) this.trigger('pickedUp');
    this.bus.emit({ type: 'inventory' });
  }

  private districtMult(x: number, z: number): number {
    const d = districtAt(this.layout, x, z);
    return DISTRICT_YIELD[d.key] ?? 1;
  }

  private salvageProp(pid: number): void {
    const p = this.layout.props[pid];
    const def = PROP_SALVAGE[p.kind];
    const pos = new THREE.Vector3(p.x, this.view.height(p.x, p.z) + p.y + 0.5, p.z);
    const items = this.rollYields(def.yields, this.districtMult(p.x, p.z) * Math.max(0.6, p.scale));
    this.view.destroyProp(pid);
    this.fx.debris(pos.x, pos.y, pos.z, def.sfx, def.weight);
    audio.play(def.weight > 0.7 ? 'breakBig' : 'break', { pos, vol: 0.9 });
    this.hitstop = 0.035 + def.weight * 0.035;
    this.camera.addTrauma(0.15 + def.weight * 0.3);
    this.camera.kickFov(2 + def.weight * 3);
    this.grant(items, pos);
    this.trigger('brokeProp');
    const f = this.save.world.flags;
    f['salvaged'] = Number(f['salvaged'] ?? 0) + 1;
  }

  private searchProp(pid: number): void {
    const p = this.layout.props[pid];
    this.searchedProps.add(pid);
    const b = p.building >= 0 ? this.layout.buildings[p.building] : null;
    const table = CONTAINER_LOOT[b?.lot ?? 'house'] ?? [];
    const items = this.rollYields(table, this.districtMult(p.x, p.z));
    const pos = new THREE.Vector3(p.x, this.view.height(p.x, p.z) + p.y + 0.8, p.z);
    audio.play('open', { pos });
    this.view.pokeProp(pid, 1.06);
    setTimeout(() => this.view.pokeProp(pid, 1), 120);
    if (items.length === 0) this.toast('Nothing useful. Someone got here first.');
    else this.grant(items, pos);
    if (this.target?.kind === 'prop' && this.target.id === pid) this.target.searched = true;
    this.updatePrompt();
  }

  private salvagePiece(bid: number, index: number): void {
    const pieces = this.view.pieces(bid);
    const removed = this.view.removed(bid);
    const info = pieces[index];
    const b = this.layout.buildings[bid];
    const def = BUILDING_SALVAGE[info.kind];
    const fallen = collapseAfterRemoval(pieces, removed, [index]);
    const ang = (b.rot * Math.PI) / 2;
    const cs = Math.cos(ang), sn = Math.sin(ang);
    const toWorld = (pi: PieceInfo) => {
      const lx = (pi.min[0] + pi.max[0]) / 2, lz = (pi.min[2] + pi.max[2]) / 2;
      return new THREE.Vector3(b.x + lx * cs + lz * sn, (pi.min[1] + pi.max[1]) / 2, b.z - lx * sn + lz * cs);
    };
    const pos = toWorld(info);
    const mult = this.districtMult(b.x, b.z);
    const items = this.rollYields(def.yields, mult);
    this.fx.debris(pos.x, pos.y, pos.z, def.sfx, def.weight);
    audio.play('break', { pos });
    this.hitstop = 0.05;
    this.camera.addTrauma(0.25);
    if (fallen.length) {
      audio.play('collapse', { pos, vol: Math.min(1, 0.4 + fallen.length * 0.05) });
      this.camera.addTrauma(Math.min(0.8, 0.3 + fallen.length * 0.03));
      this.hitstop = 0.07;
      let k = 0;
      for (const fi of fallen.slice(0, 40)) {
        const fp = toWorld(pieces[fi]);
        const fd = BUILDING_SALVAGE[pieces[fi].kind];
        setTimeout(() => this.fx.debris(fp.x, Math.max(0.5, fp.y), fp.z, fd.sfx, 0.7, 6), k * 40);
        k++;
        for (const it of this.rollYields(fd.yields, mult * 0.5)) items.push(it);
      }
      this.toast(fallen.length > 3 ? `${fallen.length} pieces came down with it.` : 'Something above came down too.', 'warm');
    }
    const merged = new Map<string, number>();
    for (const it of items) merged.set(it.item, (merged.get(it.item) ?? 0) + it.n);
    this.grant([...merged].map(([item, n]) => ({ item, n })), pos);
    this.view.rebuildBuildingNow(bid);
    this.save.world.removedPieces[bid] = [...removed].sort((a, c) => a - c);
    this.trigger('deconstructedPiece');
    if (this.rng.chance(0.05)) this.discoverBlueprint(pos);
  }

  private dismantlePlaced(p: PlacedPiece): void {
    const w = this.save.world;
    const fallen = collapsePlacedAfterRemoval(w.pieces, p.id);
    const all = [p.id, ...fallen];
    const refunds: { item: string; n: number }[] = [];
    for (const id of all) {
      const pc = w.pieces.find((x) => x.id === id);
      if (!pc) continue;
      for (const r of refundFor(pc)) refunds.push({ item: r.item, n: r.count });
      if (pc.store) for (const st of pc.store) if (st) refunds.push({ item: st.id, n: st.n });
    }
    const pos = (this.base.pos.get(p.id) ?? this.player.pos).clone();
    w.pieces = w.pieces.filter((x) => !all.includes(x.id));
    w.crops = w.crops.filter((c) => !all.includes(c.plot));
    this.base.rebuild(w.pieces, w.crops, w.hour);
    this.fx.debris(pos.x, pos.y + 1, pos.z, 'wood', 0.6);
    audio.play(fallen.length ? 'collapse' : 'break', { pos });
    this.camera.addTrauma(0.2);
    this.grant(refunds, pos.setY(pos.y + 1));
    this.persist('dismantle');
  }

  private discoverBlueprint(pos: THREE.Vector3): void {
    const known = new Set(this.save.world.blueprints);
    const candidates = ['bp.crossbow', 'bp.nailgun', 'bp.workbench2', 'bp.chemlab', 'bp.canning', 'bp.antibiotics'].filter((b) => !known.has(b));
    if (!candidates.length) return;
    const bp = this.rng.pick(candidates);
    this.save.world.blueprints.push(bp);
    this.fx.glowBurst(pos.x, pos.y, pos.z, 20);
    audio.play('levelUp', { vol: 0.6 });
    this.toast(`Blueprint found: ${getItem(bp)?.name ?? bp}`, 'warm');
  }

  private pickupDrop(i: number): void {
    const dp = this.save.world.drops[i];
    if (!dp) return;
    const rest: ItemStack[] = [];
    for (const st of dp.items) {
      const left = addItem(this.inv, st.id, st.n, { d: st.d, t: st.t });
      if (left > 0) rest.push({ ...st, n: left });
    }
    if (rest.length) dp.items = rest;
    else this.save.world.drops.splice(i, 1);
    audio.play('pickup');
    this.toast(rest.length ? 'Took what you could carry.' : 'Pack recovered.', 'warm');
    this.rebuildDrops();
    this.target = null;
    this.bus.emit({ type: 'inventory' });
  }

  private rebuildDrops(): void {
    for (const m of this.dropMeshes) this.scene.remove(m);
    this.dropMeshes = [];
    const geo = dropGeo();
    for (const dp of this.save.world.drops) {
      const m = new THREE.Mesh(geo, this.base.mat);
      m.position.set(dp.x, this.view.surface(dp.x, dp.z), dp.z);
      m.castShadow = true;
      this.scene.add(m);
      this.dropMeshes.push(m);
    }
  }

  // ------------------------------------------------------------ swing at props
  private updateAttack(dt: number): void {
    this.attackT = Math.max(0, this.attackT - dt);
    const want = this.input.consumeBuffered('attack') || (this.input.isHeld('attack') && this.attackT <= 0);
    if (!want || this.attackT > 0 || this.mode !== 'play') return;
    const p = this.save.player;
    if (p.stamina < 8) {
      audio.play('deny', { vol: 0.4 });
      return;
    }
    const eq = p.equipped ? getItem(p.equipped) : undefined;
    const cd = eq?.weapon?.cooldown ?? 0.55;
    this.attackT = cd;
    this.player.rig.attackDur = Math.min(0.6, cd * 0.85);
    this.player.rig.setState('attack');
    tickStamina(p, 0, eq?.weapon?.stamina ?? 8, modifiers(p));
    audio.play('swing', { vol: 0.6 });
    const dmg = eq?.weapon?.damage ?? (eq?.tool ? 12 : 6);
    setTimeout(() => this.resolveSwing(dmg), cd * 0.45 * 1000);
  }

  /** Hook for the combat system (enemies). Returns true if it consumed the hit. */
  swingHook: ((damage: number) => boolean) | null = null;

  private resolveSwing(damage: number): void {
    if (this.swingHook?.(damage)) return;
    const t = this.target;
    if (!t || t.kind !== 'prop') return;
    if (t.pos.distanceTo(tmpV.copy(this.player.pos).setY(t.pos.y)) > 2.6) return;
    const def = t.def;
    if (!toolCanBreak(this.toolTier().tier, def.tool)) {
      audio.play(SFX_FOR[def.sfx], { pos: t.pos, vol: 0.6, pitch: 0.8 });
      this.fx.sparks(t.pos.x, t.pos.y, t.pos.z, 4);
      this.camera.addTrauma(0.08);
      return;
    }
    const hpMax = def.time * 14;
    const hp = (this.propHp.get(t.id) ?? hpMax) - damage;
    audio.play(SFX_FOR[def.sfx], { pos: t.pos });
    this.fx.debris(t.pos.x, t.pos.y, t.pos.z, def.sfx, 0.2, 4);
    if (def.sfx === 'metal' || def.sfx === 'stone') this.fx.sparks(t.pos.x, t.pos.y, t.pos.z, 6);
    this.hitstop = 0.03 + def.weight * 0.03;
    this.camera.addTrauma(0.1 + def.weight * 0.12);
    this.view.pokeProp(t.id, 0.9, 0.05);
    setTimeout(() => this.view.pokeProp(t.id, 1), 90);
    if (hp <= 0) {
      this.propHp.delete(t.id);
      this.salvageProp(t.id);
      this.target = null;
    } else this.propHp.set(t.id, hp);
  }

  // ------------------------------------------------------------ survival
  survivalCtx() {
    return { difficulty: this.save.world.difficulty, rng: this.rng, sleeping: this.mode === 'sleeping', exposed: this.atm.wetness > 0.5 && !this.underRoof() };
  }

  private underRoof(): boolean {
    const p = this.player.pos;
    return this.collision.raycast(p.x, p.y + 1.8, p.z, p.x, p.y + 30, p.z) < 1;
  }

  hurt(amount: number, kind: 'blunt' | 'cut' | 'fall' | 'bite' | 'shot', cause = kind as string): void {
    if (this.mode === 'dead') return;
    const dealt = damagePlayer(this.save.player, amount, kind, this.survivalCtx());
    this.bus.emit({ type: 'damage', amount: dealt });
    audio.play('hurt');
    this.player.rig.hit(0.8);
    this.camera.addTrauma(0.3);
    this.fx.decal(this.player.pos.x, this.player.pos.y, this.player.pos.z, 0x5a1a16, 0.6);
    this.bus.emit({ type: 'meters' });
    if (this.save.player.health <= 0) this.die(cause);
  }

  private die(cause: string): void {
    if (this.mode === 'dead') return;
    const p = this.save.player;
    const pos = this.player.pos.clone();
    const bed = p.bed ?? this.layout.spawn;
    const dropped = respawnPlayer(p, bed);
    const items = dropped.filter((s): s is ItemStack => !!s);
    if (items.length) this.save.world.drops.push({ x: pos.x, z: pos.z, items, t: this.save.world.hour });
    this.save.player.equipped = null;
    this.rebuildDrops();
    this.player.rig.setState('dead');
    this.setMode('dead');
    this.toast(cause === 'fall' ? 'That was a long way down.' : 'You went down.', 'bad');
    setTimeout(() => {
      this.placePlayer(bed.x, bed.z);
      this.view.loadAround(bed.x, bed.z);
      this.player.rig.setState('idle');
      this.setMode('play');
      this.toast(items.length ? 'Your pack is where you fell. Go get it.' : 'You wake up sore.', 'warm');
      this.bus.emit({ type: 'inventory' });
      this.bus.emit({ type: 'meters' });
      this.persist('death');
    }, 3200);
  }

  private trySleep(): void {
    const h = hourOfDay(this.save.world.hour);
    if (!(h >= 19 || h < 5) && this.save.player.sleep > 60) {
      this.toast("You're not tired enough to sleep yet.", 'bad');
      audio.play('deny');
      return;
    }
    this.setMode('sleeping');
    this.player.rig.setState('sleep');
    const fade = document.createElement('div');
    fade.className = 'fade';
    document.getElementById('app')!.appendChild(fade);
    requestAnimationFrame(() => fade.classList.add('on'));
    setTimeout(() => {
      const w = this.save.world;
      let target = Math.floor(w.hour / 24) * 24 + 6.5;
      while (target <= w.hour + 1) target += 24;
      const hrs = target - w.hour;
      const step = 0.5;
      for (let t = 0; t < hrs; t += step) tickPlayer(this.save.player, step, { ...this.survivalCtx(), sleeping: true });
      this.onSleepHook?.(hrs);
      w.hour = target;
      this.trigger('slept');
      this.trigger('survivedNight');
      w.flags['nights'] = Number(w.flags['nights'] ?? 0) + 1;
      this.persist('sleep');
      fade.classList.remove('on');
      setTimeout(() => fade.remove(), 900);
      this.player.rig.setState('idle');
      this.setMode('play');
      this.bus.emit({ type: 'meters' });
      this.toast(`Day ${dayOf(w.hour) + 1}. ${seasonName(w.hour)}.`, 'warm');
    }, 1300);
  }
  onSleepHook: ((hours: number) => void) | null = null;

  private updateSurvival(dt: number): void {
    const p = this.save.player;
    const moving = this.player.rig.speed > 0.5;
    const sprinting = this.input.sprinting && moving && this.player.canSprint;
    const mods = modifiers(p);
    tickStamina(p, dt, sprinting ? 14 : 0, mods);
    this.player.canSprint = p.stamina > 4;
    const over = Math.max(0, totalWeight(this.inv) - 40);
    this.player.speedMul = (mods.speed ?? 1) * (over > 0 ? Math.max(0.45, 1 - over / 30) : 1);
    this.survivalAcc += dt;
    if (this.survivalAcc >= 1) {
      const hrs = this.survivalAcc * gameHoursPerRealSecond(this.settings.dayMinutes * 60);
      this.survivalAcc = 0;
      const ev = tickPlayer(p, hrs, this.survivalCtx());
      for (const c of ev.gained) this.toast(conditionText(c), c === 'wellfed' || c === 'rested' ? 'warm' : 'bad');
      for (const wn of ev.warnings) this.toast(warningText(wn), 'bad');
      if (ev.died) this.die('exposure');
    }
    this.metersAcc += dt;
    if (this.metersAcc > 0.25) {
      this.metersAcc = 0;
      this.bus.emit({ type: 'meters' });
    }
  }

  // ------------------------------------------------------------ onboarding
  trigger(t: OnboardingTrigger): void {
    if (this.onbStep >= ONBOARDING.length) return;
    const step = ONBOARDING[this.onbStep];
    if (step.trigger !== t) return;
    this.onbStep++;
    this.save.world.flags['onb'] = this.onbStep;
    audio.play('node', { vol: 0.4 });
    this.showOnboarding();
  }

  private showOnboarding(): void {
    if (!this.save || this.mode === 'menu' || !this.settings.hints || this.onbStep >= ONBOARDING.length) {
      this.bus.emit({ type: 'hint', text: null });
      return;
    }
    const step = ONBOARDING[this.onbStep];
    const touch = this.input.usingTouch || document.documentElement.classList.contains('touch');
    this.bus.emit({ type: "hint", text: `**${step.title}** — ${touch ? step.touch : step.desktop}` });
    if (step.trigger === 'moved') this.onbStartPos.copy(this.player.pos);
    if (step.trigger === 'looked') this.onbYaw = this.camera.yaw;
  }

  private checkOnboarding(): void {
    if (this.onbStep >= ONBOARDING.length) return;
    const step = ONBOARDING[this.onbStep];
    if (step.trigger === 'moved' && this.player.pos.distanceTo(this.onbStartPos) > 6) this.trigger('moved');
    if (step.trigger === 'looked' && Math.abs(this.camera.yaw - this.onbYaw) > 1.4) this.trigger('looked');
    if (step.trigger === 'nightfall' && isNight(this.save.world.hour)) this.trigger('nightfall');
    if (step.trigger === 'openedInventory' && (this.screenProbe?.() ?? this.openScreenId) === 'inventory') this.trigger('openedInventory');
  }

  // ------------------------------------------------------------ helpers
  toast(text: string, kind: 'info' | 'warm' | 'bad' = 'info'): void {
    this.bus.emit({ type: 'toast', text, kind });
  }

  private updateDistrict(): void {
    const d = districtAt(this.layout, this.player.pos.x, this.player.pos.z);
    if (d.index !== this.districtIdx) {
      this.districtIdx = d.index;
      const st = this.save.world.districts[d.index]?.state ?? 0;
      const intro = DISTRICT_INTROS[d.key];
      this.bus.emit({ type: 'district', name: intro?.name ?? d.name, state: RESTORATION_NAMES[st], blurb: intro?.blurb ?? '' });
      this.save.world.flags[`reached:${d.key}`] = true;
    }
  }

  /** 0 = cold ruin .. 1 = warm restored, at the player's location */
  warmth(): number {
    const d = districtAt(this.layout, this.player.pos.x, this.player.pos.z);
    const st = this.save.world.districts[d.index]?.state ?? 0;
    const base = d.key === 'haven' ? 0.55 : 0.2;
    return Math.min(1, base + st * 0.18);
  }

  private questCtx() {
    return { inventory: this.inv, rank: Number(this.save.world.flags['rank'] ?? 1), districtKeys: this.layout.districts.map((d) => d.key) };
  }

  /** Journal lines: active quest steps with progress, plus completed ones. */
  objectives(): { title: string; text: string; done: boolean }[] {
    const w = this.save.world;
    const out: { title: string; text: string; done: boolean }[] = [];
    for (const q of activeQuests(w)) {
      const stepIdx = w.quests[q.id] ?? 0;
      const step = q.steps[stepIdx];
      if (!step) continue;
      const pr = objectiveProgress(w, step.obj, this.questCtx());
      out.push({ title: `${ACT_NAMES[q.act]} · ${q.title}`, text: `${step.text}${pr.need > 1 ? ` (${Math.min(pr.have, pr.need)}/${pr.need})` : ''}`, done: false });
    }
    for (const q of QUESTS) if ((w.quests[q.id] ?? 0) >= q.steps.length) out.push({ title: q.title, text: q.steps[q.steps.length - 1]?.text ?? '', done: true });
    return out;
  }

  private questT = 0;
  private updateQuests(dt: number): void {
    this.questT -= dt;
    if (this.questT > 0) return;
    this.questT = 1.5;
    const w = this.save.world;
    const ev = advanceQuests(w, this.questCtx());
    for (const e of ev) {
      const q = QUESTS.find((x) => x.id === e.quest);
      if (!q) continue;
      if (e.completedQuest) {
        this.toast(`Done: ${q.title}`, 'warm');
        audio.play('levelUp', { vol: 0.6 });
        for (const it of q.reward.items ?? []) addItem(this.inv, it.item, it.count);
        for (const bp of q.reward.blueprints ?? []) if (!w.blueprints.includes(bp)) w.blueprints.push(bp);
        this.bus.emit({ type: 'inventory' });
      } else {
        const step = q.steps[e.step];
        if (step) this.toast(`New objective: ${step.text}`, 'info');
      }
    }
  }

  clock(): { time: string; sub: string } {
    const h = this.save.world.hour;
    return { time: clockString(h), sub: `Day ${dayOf(h) + 1} · ${seasonName(h)}` };
  }

  // ------------------------------------------------------------ frame
  private frame = (): void => {
    const now = performance.now();
    if (this.renderer.fpsCap === 30 && now - this.last < 30) {
      requestAnimationFrame(this.frame);
      return;
    }
    let dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    if (this.paused) dt = 0;
    this.time += dt;
    this.input.update();
    const playing = this.mode === 'play' || this.mode === 'build';
    const blocked = this.input.uiBlocking || !playing;
    if (!blocked) this.camera.look(this.input.lookX, this.input.lookY * (this.settings.invertY ? -1 : 1));
    if (this.mode === 'menu') this.camera.yaw += dt * 0.04;
    let simDt = dt;
    if (this.hitstop > 0) {
      this.hitstop -= dt;
      simDt = dt * 0.05;
    }
    if (playing && !this.paused) {
      this.playtime += dt;
      const w = this.save.world;
      w.hour += simDt * gameHoursPerRealSecond(this.settings.dayMinutes * 60);
      w.weather = weatherAt(SEED, w.hour);
      if (!blocked) {
        if (this.input.wasPressed('build') && this.mode === 'play') this.startBuild('foundation', 0);
        for (let q = 0; q < 4; q++) if (this.input.wasPressed(`q${q + 1}` as 'q1')) this.selectQuick(q);
      }
      if (this.input.wasPressed('menu') && this.mode === 'build') this.stopBuild();
      this.player.locked = (this.input.uiBlocking || this.holdT > 0.18) && !this.player.dodging;
      if (!blocked && this.input.wasPressed('dodge') && this.save.player.stamina > 12) {
        if (this.player.startDodge({ x: this.input.moveX, y: this.input.moveY, mag: 1, sprint: false, jump: false, dodge: true, camYaw: this.camera.yaw })) {
          tickStamina(this.save.player, 0, 12, modifiers(this.save.player));
          audio.play('swing', { pitch: 0.7, vol: 0.4 });
        }
      }
      const jump = !blocked && this.input.wasPressed('jump') && this.save.player.stamina > 5;
      if (jump && this.player.grounded) audio.play('jump', { vol: 0.4 });
      this.player.update(
        simDt,
        { x: this.input.moveX, y: this.input.moveY, mag: this.input.moveMag, sprint: this.input.sprinting, jump, dodge: false, camYaw: this.camera.yaw },
        this.collision,
      );
      const rig = this.player.rig;
      if (!this.player.dodging && rig.state === 'dodge' && rig.stateT > 0.42) rig.setState('idle');
      if (rig.state === 'attack' && rig.stateT > rig.attackDur) rig.setState('idle');
      if (rig.state === 'interact' && this.holdT === 0) rig.setState('idle');
      if (this.mode === 'play' && !blocked) {
        this.targetTimer -= dt;
        if (this.targetTimer <= 0) {
          this.targetTimer = 0.1;
          this.scanTargets();
        }
        this.updateInteract(simDt);
        this.updateAttack(simDt);
        this.promptT -= dt;
        if (this.promptT <= 0) {
          this.promptT = 0.25;
          this.updatePrompt();
        }
      } else if (this.mode === 'play' && blocked) {
        this.bus.emit({ type: 'prompt', text: null });
      }
      if (this.mode === 'build' && !this.input.uiBlocking) this.updateBuild();
      this.updateSurvival(simDt);
      this.updateDistrict();
      this.checkOnboarding();
      this.updateQuests(dt);
      this.autosaveT += dt;
      if (this.autosaveT > 60) {
        this.autosaveT = 0;
        this.persist('auto');
      }
    } else if (this.mode === 'dead' || this.mode === 'sleeping') {
      this.player.update(simDt, { x: 0, y: 0, mag: 0, sprint: false, jump: false, dodge: false, camYaw: this.camera.yaw }, this.collision);
    }
    for (const t of this.tickers) t(dt, playing && !this.paused ? simDt : 0);
    this.player.rig.update(simDt);
    this.view.update(this.player.pos.x, this.player.pos.z);
    this.fx.target.copy(this.player.pos);
    this.fx.update(simDt, (x, z) => this.view.surface(x, z));
    this.camera.update(dt, this.player.pos, this.input.sprinting && this.input.moveMag > 0.5 && this.player.canSprint, this.collision);
    const warmth = this.warmth();
    this.atm.update(dt, this.save.world.hour, (this.save.world.weather as Weather) ?? 'clear', warmth, this.player.pos, this.camera.cam.position, this.renderer.quality.fogFar, this.time);
    const night = 1 - this.atm.daylight;
    for (const u of this.view.uniforms) {
      u.uWindow.value = 0.25 + night * 1.1;
      u.uGrid.value = 0.8 + Math.sin(this.time * 2) * 0.1;
    }
    this.base.mat.userData.u.uWindow.value = 0.4 + night;
    this.base.mat.userData.u.uGrid.value = 1;
    audio.listener.x = this.player.pos.x;
    audio.listener.z = this.player.pos.z;
    audio.listener.yaw = this.camera.yaw;
    const d = districtAt(this.layout, this.player.pos.x, this.player.pos.z);
    audio.update({ danger: Math.min(1, d.danger / 4) * (1 - warmth * 0.5), warmth, night, rain: this.atm.wetness, machine: this.machineProximity, combat: this.combatLevel, indoors: false });
    this.renderer.syncSize(this.camera.cam);
    this.renderer.render(this.scene, this.camera.cam);
    const ms = performance.now() - now;
    this.renderer.adapt(ms, now);
    this.perf.frame(ms, now, { chunks: this.view.chunkCount, chunkBuildMs: this.view.lastBuildMs, entities: this.entityCount, colliders: this.collision.count });
    this.input.endFrame();
    requestAnimationFrame(this.frame);
  };

  /** set by other systems */
  machineProximity = 0;
  combatLevel = 0;
  entityCount = 1;
}

// ---------------------------------------------------------------- utilities
function nextFrame(): Promise<void> {
  return new Promise((r) => requestAnimationFrame(() => r()));
}

function hasAll(inv: (ItemStack | null)[], cost: { item: string; count: number }[]): boolean {
  for (const c of cost) {
    let have = 0;
    for (const s of inv) if (s?.id === c.item) have += s.n;
    if (have < c.count) return false;
  }
  return true;
}

function findPieceForItem(itemId: string): string | null {
  const map: Record<string, string> = {
    'def.barricade': 'barricade',
    'def.alarm_bell': 'alarm',
    'def.turret': 'turret',
    'def.floodlight': 'floodlight',
    'trap.snare': 'snare',
    'trap.bear_trap': 'bear_trap',
    'trap.tripwire': 'tripwire',
    'trap.spike_pit': 'spike_strip',
  };
  return map[itemId] ?? null;
}

function targetKey(t: Target | null): string {
  if (!t) return '';
  if (t.kind === 'prop') return `p${t.id}`;
  if (t.kind === 'piece') return `b${t.bid}:${t.index}`;
  if (t.kind === 'placed') return `x${t.id}`;
  return `d${t.index}`;
}

const PROP_NAMES: Record<string, string> = {
  car: 'Wrecked Car', van: 'Van', bus: 'Bus', tree: 'Tree', pine: 'Pine', bush: 'Bush', rock: 'Boulder', rubble: 'Rubble', barrel: 'Barrel',
  crate: 'Crate', dumpster: 'Dumpster', bench: 'Bench', streetlight: 'Streetlight', sign: 'Sign', hydrant: 'Hydrant', fence: 'Fence',
  pallet: 'Pallet', tire: 'Tire', trashbag: 'Trash Bags', mailbox: 'Mailbox', container: 'Shipping Container', pipe: 'Pipe Section',
  haybale: 'Hay Bale', stump: 'Stump', locker: 'Locker', shelf: 'Shelf', table: 'Table', chair: 'Chair', bed: 'Bed', cabinet: 'Cabinet',
  sofa: 'Sofa', fridge: 'Fridge', stove: 'Stove', terminal: 'Grid Terminal', debris: 'Debris',
};
function propName(k: string): string {
  return PROP_NAMES[k] ?? k;
}
function pieceName(p: PieceInfo): string {
  const names: Record<string, string> = { wall: 'Wall', floor: 'Floor', roof: 'Roof', door: 'Door', window: 'Window', beam: 'Support Beam', pipe: 'Pipe', fixture: 'Light Fixture' };
  return names[p.kind] ?? p.kind;
}
function toolName(t: string): string {
  const n: Record<string, string> = { hands: 'free hand', crowbar: 'crowbar', axe: 'axe', pickaxe: 'pickaxe', saw: 'saw', torch: 'cutting torch' };
  return n[t] ?? t;
}
export function seasonName(h: number): string {
  const s = seasonOf(h);
  return s.charAt(0).toUpperCase() + s.slice(1);
}
function conditionText(c: string): string {
  const t: Record<string, string> = {
    bleeding: 'You are bleeding. A bandage will stop it.',
    fracture: 'Something cracked. A splint will help you walk straight.',
    sick: 'You feel sick. Rest, clean water, maybe antibiotics.',
    infected: 'The wound is infected. Disinfect it before it gets worse.',
    wellfed: 'Well fed. Stamina recovers faster.',
    rested: 'Rested. You feel sharp.',
    soaked: 'Soaked to the skin. Get under a roof.',
  };
  return t[c] ?? c;
}
function warningText(w: string): string {
  const t: Record<string, string> = {
    hungry: "You're getting hungry.",
    thirsty: "You're thirsty.",
    tired: "You're tired. A bed would be nice.",
    starving: "You're starving. Eat something now.",
    dehydrated: "You're dehydrated. Drink something now.",
    exhausted: "You're exhausted. Sleep soon.",
  };
  return t[w] ?? w;
}

let _dropGeo: THREE.BufferGeometry | null = null;
function dropGeo(): THREE.BufferGeometry {
  if (_dropGeo) return _dropGeo;
  const b = new MeshBuilder();
  b.setColor(0x4d4537);
  b.bevelBox(0, 0.22, 0, 0.3, 0.22, 0.2, 0.06);
  b.setColor(0x6b5f4a);
  b.bevelBox(0, 0.48, 0, 0.22, 0.06, 0.16, 0.03);
  b.setColor(0xe8a65a).setEmissive(1);
  b.box(0, 0.3, 0.205, 0.06, 0.12, 0.01);
  _dropGeo = b.toGeometry(true);
  return _dropGeo;
}
