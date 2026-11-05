// Game orchestrator: owns the world, player, systems and implements GameAPI for the UI.
import * as THREE from 'three';
import { GAME_VERSION, RESTORATION_NAMES, Rng, type WorldEvent, type GameSave, type ItemStack, type PlacedPiece, type StationId, type ToolTier, type WorldLayout } from '@dg/shared';
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
  upgradeWorldGen,
  PROP_HALF,
  tileAt,
  TIER_HP_MULT,
  plant as plantCrop,
  harvest as harvestCrop,
  waterCrop,
  fertilize,
  cropStage,
  canPlant,
  activeQuests,
  advanceQuests,
  applyQuestRewards,
  grantXp,
  perkFx,
  districtPowered,
  canTakePerk,
  PERK_MAP,
  XP,
  PERK_POINT_PER_QUEST,
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
import { ContactShadows } from '../render/contact';
import { S } from '../ui/strings';
import { audio, type Sfx } from '../audio/audio';
import { WorldView } from '../world/world';
import { FX } from '../render/fx';
import { MeshBuilder } from '../render/geo';
import { BaseView, levelFromY, STOREY_H } from './base';
import { HavenCamp } from '../world/haven';
import { PostFX } from '../render/post';
import { Bus, loadSettings, storeSettings, type CraftInfo, type GameAPI, type GameMode, type ScreenId, type Settings } from './api';
import { ONBOARDING, type OnboardingTrigger } from '../content/onboarding';
import { ACTS, DISTRICT_INTROS } from '../content/campaign';

export const SEED = 1337;

export type InteractKind = 'loot' | 'break' | 'build' | 'talk' | 'door' | 'use' | 'farm' | 'node' | 'attack';
export interface ProviderPrompt {
  text: string;
  sub?: string;
  kind?: InteractKind;
  verb?: string;
  pos?: THREE.Vector3;
  hold?: boolean;
}

export interface TargetInfo {
  kind: InteractKind;
  verb: string;
  name: string;
  sub: string | null;
  /** true when the main action is hold-to-complete */
  hold: boolean;
  /** why it can't be done right now (needs tool, pack full...) */
  blocked: string | null;
  pos: THREE.Vector3 | null;
  shape: { prop: number } | { box: [THREE.Vector3, THREE.Vector3] } | null;
}
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
  camp!: HavenCamp;
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
  private readonly playerLook = new THREE.Vector3();
  private readonly cutFocus = new THREE.Vector3();
  private contact!: ContactShadows;
  private contactT = 0;
  private readonly contactIds: number[] = [];

  /** soft blob shadows under characters and props near the player (4×/s) */
  private updateContactShadows(): void {
    const c = this.contact;
    // round 4: 0.32 read as no shadow at all on high; real shadows don't cover the feet at this res
    c.strength = this.renderer.quality.shadows ? 0.5 : 0.6;
    c.begin();
    for (const r of CharacterRig.all) {
      if (!r.root.parent || !r.root.visible) continue;
      const p = r.root.position;
      if (Math.abs(p.x - this.player.pos.x) > 40 || Math.abs(p.z - this.player.pos.z) > 40) continue;
      c.add(p.x, this.view.surface(p.x, p.z), p.z, 0.36, 0.36);
    }
    const ids = this.contactIds;
    ids.length = 0;
    this.view.propsNear(this.player.pos.x, this.player.pos.z, 28, ids);
    for (const id of ids) {
      const pr = this.layout.props[id];
      if (this.view.removedProps.has(id)) continue;
      const [hx, hz] = PROP_HALF[pr.kind];
      const k = pr.kind === 'tree' || pr.kind === 'pine' ? 0.55 : 1.15;
      c.add(pr.x, pr.y + this.view.height(pr.x, pr.z), pr.z, hx * pr.scale * k, hz * pr.scale * k, pr.rotY);
    }
    c.end();
  }
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
  onbStep = 0;
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
  /** reads a lore terminal prop (set by Trader module) */
  terminalHook: ((pid: number) => void) | null = null;
  /** Town stockpile position (set by the Town module) */
  stockpilePos: (() => THREE.Vector3 | null) | null = null;
  /** co-op: piece ids are offset per player so peers never collide */
  pieceIdBase = 0;
  /** called after a teammate's nodeOnline so the grid view refreshes */
  onRemoteNode: ((node: number, district: number) => void) | null = null;
  /** co-op: local world actions to broadcast */
  onWorldAction: ((ev: WorldEvent) => void) | null = null;
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
    this.contact = new ContactShadows(this.scene);
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
    this.camp = new HavenCamp(this.layout.spawn.x, this.layout.spawn.z, (x, z) => this.view.surface(x, z), this.collision);
    this.scene.add(this.camp.group);
    this.camp.smoke = (x, y, z) => this.fx.smoke(x, y, z);
    this.camp.cam = this.camera.cam;
    this.fx.camera = this.camera.cam;
    const rig = new CharacterRig(randomLook(7, { backpack: true, hairStyle: 1, shirt: 0x46535c, accent: 0xe8a65a }));
    this.scene.add(rig.root);
    this.player = new PlayerController(rig);
    this.player.terrain = (x, z) => this.view.surface(x, z);
    this.player.onStep = (run) => {
      const vol = run ? 0.5 : 0.35;
      const surf = this.surfaceUnderPlayer();
      if (this.atm.wetness > 0.3 && surf !== 'wood') audio.play('stepWet', { vol });
      else audio.play(surf === 'grass' ? 'stepGrass' : surf === 'wood' ? 'stepWood' : surf === 'metal' ? 'stepMetal' : surf === 'hard' ? 'stepHard' : 'step', { vol });
      if (surf === 'dirt' && run) this.fx.dust(this.player.pos.x, this.player.pos.y, this.player.pos.z, 1, 0x8a7a64);
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
      this.renderer.post?.dispose();
      this.renderer.post = q.tier === 'low' ? null : new PostFX(this.renderer.gl, this.scene, this.camera.cam, q.tier === 'high');
      this.view.radius = q.detailRadius;
      this.view.propDensity = q.propDensity;
      for (const u of this.view.uniforms) u.uGround.value = u.uPattern.value = q.patterns ? 1 : 0;
      this.atm.setShadows(q.shadows ? q.shadowSize : 0);
      this.view.setShadows(q.shadows);
    };
    this.renderer.onContextRestored = () => this.toast('Graphics restored.');
    if (this.renderer.quality.tier !== 'low') this.renderer.post = new PostFX(this.renderer.gl, this.scene, this.camera.cam, this.renderer.quality.tier === 'high');
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
    this.camera.blocker = (x, y, z) => {
      const b = v.buildingAt(x, y, z, 0.1);
      return b >= 0 && b !== v.buildingAt(this.player.pos.x, this.player.pos.y + 1, this.player.pos.z, -0.4);
    };
    v.radius = this.renderer.quality.detailRadius;
    v.propDensity = this.renderer.quality.propDensity;
    for (const u of v.uniforms) u.uGround.value = u.uPattern.value = this.renderer.quality.patterns ? 1 : 0;
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
    // pocket scrap: with the first crate (2-3 scrap, 2-3 timber) this always covers the crowbar (4 scrap + 1 timber)
    addItem(inv, 'mat.scrap', 2);
    this.save.player.quick = ['drink.clean_water', 'food.canned_beans', null, null];
    this.save.world.flags['onb'] = 0;
    this.resetWorldView();
    this.placePlayer(this.layout.spawn.x, this.layout.spawn.z);
    this.player.yaw = 2.4;
    this.camera.yaw = 2.4;
    this.startPlaying();
    this.persist('new');
    this.playIntro();
  }

  async continueGame(): Promise<void> {
    this.startPlaying();
  }

  /** Load an existing save into the running world. */
  loadSave(save: GameSave): void {
    // Saves made on an older worldgen keep every id (versions only append props);
    // new props that would land on the player's base/drops/bed are marked removed.
    const cleared = upgradeWorldGen(save, this.layout);
    if (cleared.length) console.info(`[save] worldgen upgraded to v${this.layout.genVersion}; ${cleared.length} new prop(s) cleared around your base`);
    this.save = save;
    this.resetWorldView();
    this.placePlayer(save.player.x, save.player.z);
    this.player.pos.y = Math.max(save.player.y, this.view.surface(save.player.x, save.player.z));
    this.player.yaw = save.player.yaw;
    this.camera.yaw = save.player.yaw;
    this.onbStep = Number(save.world.flags['onb'] ?? ONBOARDING.length);
    this.view.loadAround(this.player.pos.x, this.player.pos.z);
    this.bus.emit({ type: 'inventory' });
    this.bus.emit({ type: 'meters' });
  }

  /** hooks run whenever the world is swapped (new game / load / import) */
  readonly resetHooks: (() => void)[] = [];

  private resetWorldView(): void {
    this.session++;
    this.build = null;
    this.target = null;
    this.storageTarget = null;
    this.recentFoods = [];
    this.holdT = 0;
    this.introT = -1;
    document.getElementById('app')?.classList.remove('letterbox');
    for (const h of this.resetHooks) h();
    this.scene.remove(this.view.group);
    this.view.dispose();
    this.view = this.makeView();
    this.propHp.clear();
    this.searchedProps.clear();
    this.applyWorldState();
    this.view.loadAround(this.save.player.x, this.save.player.z);
  }

  private moveIntent = { x: 0, y: 0, mag: 0, sprint: false, jump: false, dodge: false, camYaw: 0 };
  private audioState = { danger: 0, warmth: 0, night: 0, rain: 0, machine: 0, combat: 0, indoors: false };
  private introT = -1;
  private introCard: HTMLElement | null = null;

  /** Cinematic opening: swoop from above the dead city down to Haven. */
  playIntro(): void {
    if (new URLSearchParams(location.search).has('autostart')) return;
    this.introT = 0;
    this.setMode('cinematic');
    document.getElementById('app')!.classList.add('letterbox');
    const act = ACTS[0];
    const card = document.createElement('div');
    card.className = 'district-banner show';
    card.style.top = '58%';
    card.style.background = 'radial-gradient(ellipse at center, rgba(6,8,10,0.72) 0%, rgba(6,8,10,0) 75%)';
    card.style.padding = '28px 60px';
    card.innerHTML = `<div class="state"></div><h2></h2><p></p>`;
    (card.children[0] as HTMLElement).textContent = `${act.subtitle}`;
    (card.children[1] as HTMLElement).textContent = act.title;
    (card.children[2] as HTMLElement).textContent = act.text;
    (card.children[2] as HTMLElement).style.maxWidth = '560px';
    card.style.opacity = '0';
    document.getElementById('ui')!.appendChild(card);
    setTimeout(() => (card.style.opacity = '1'), 1200);
    this.introCard = card;
    audio.play('powerUp', { vol: 0.35, pitch: 0.5 });
  }

  private updateIntro(dt: number): void {
    if (this.introT < 0) return;
    const D = 7;
    this.introT += dt;
    const skip = this.input.wasPressed('attack') || this.input.wasPressed('interact') || this.input.wasPressed('jump') || this.input.wasPressed('menu');
    const k = Math.min(1, this.introT / D);
    const e = k * k * k * (k * (k * 6 - 15) + 10);
    const p = this.player.pos;
    const a = this.camera.yaw + Math.PI + (1 - e) * 1.2;
    const hi = tmpV.set(p.x + Math.sin(a) * 140 * (1 - e) + 0, p.y + 90 * (1 - e) + 2, p.z + Math.cos(a) * 140 * (1 - e));
    const cam = this.camera.cam;
    cam.position.lerpVectors(hi, cam.position, e);
    const look = new THREE.Vector3(608, 0, 608).lerp(new THREE.Vector3(p.x, p.y + 1.5, p.z), Math.min(1, e * 1.2));
    cam.lookAt(look);
    if (k >= 1 || skip) {
      this.introT = -1;
      document.getElementById('app')!.classList.remove('letterbox');
      if (this.introCard) {
        const c = this.introCard;
        c.style.opacity = '0';
        setTimeout(() => c.remove(), 900);
        this.introCard = null;
      }
      this.setMode('play');
      this.showOnboarding();
    }
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
      const m = this.mode;
      this.mode = 'play';
      this.persist('import');
      this.mode = m;
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
    return { kg: totalWeight(this.inv), max: 40 + this.pk('carry') };
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
    this.addDrop(this.player.pos.x + Math.sin(this.player.yaw) * 0.8, this.player.pos.z + Math.cos(this.player.yaw) * 0.8, [st]);
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

  private storageOverride: (ItemStack | null)[] | null = null;
  /** Open the shared Town Stockpile in the storage screen (survivors eat and build from it). */
  openStockpile(): void {
    this.storageOverride = this.save.world.townStock;
    this.openScreen('storage');
  }
  storage(): (ItemStack | null)[] | null {
    return this.storageOverride ?? this.storageTarget?.store ?? null;
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
  private nearbyStations(unpowered?: StationId[]): StationId[] {
    const out: StationId[] = ['hands'];
    for (const p of this.save.world.pieces) {
      const def = getPiece(p.piece);
      if (!def?.station) continue;
      const pos = this.base.pos.get(p.id);
      if (!pos || pos.distanceToSquared(this.player.pos) >= 6 * 6) continue;
      // needsPower stations only work on Grid current
      if (def.needsPower && !this.poweredAt(pos.x, pos.z)) {
        unpowered?.push(def.station);
        continue;
      }
      out.push(def.station);
    }
    return out;
  }

  /** Grid power at a point (sim districtPowered: district Powered, or Haven fed by any Powered district) */
  poweredAt(x: number, z: number): boolean {
    const d = districtAt(this.layout, x, z);
    return districtPowered(this.save.world, this.layout.districts.map((q) => q.key), d.index);
  }

  /** Recipe the current tutorial step asks for (pinned to the top of the craft list). */
  suggestedRecipe(): string | null {
    const step = ONBOARDING[this.onbStep];
    return step?.id === 'craft' ? 'r.tool.crowbar' : null;
  }

  craftInfo(): CraftInfo {
    const unpowered: StationId[] = [];
    const stations = this.nearbyStations(unpowered);
    return { stations, unpowered, blueprints: this.save.world.blueprints, rank: Number(this.save.world.flags['rank'] ?? 1) };
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
    this.award(XP.craft * made);
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
    const base = def.costs[Math.min(this.build.tier, def.costs.length - 1)] ?? [];
    // perks: Square and Level (all pieces), Master Builder (reinforced tier)
    const m = 1 + this.pk('buildCost') + (this.build.tier >= 2 ? this.pk('reinforcedCost') : 0);
    return m >= 1 ? base : base.map((c) => ({ item: c.item, count: Math.max(1, Math.round(c.count * m)) }));
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
    const check = validatePlacement(this.save.world.pieces, { piece: b.piece, tier: b.tier as 0 | 1 | 2 | 3, x: cand.x, y: cand.y, z: cand.z, rot: cand.rot }, this.pk('stability'));
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
      const id = this.pieceIdBase ? this.pieceIdBase + (this.save.world.nextPieceId++ % 1_000_000) : this.save.world.nextPieceId++;
      const placed: PlacedPiece = { id, piece: b.piece, tier: b.tier as 0 | 1 | 2 | 3, x: cand.x, y: cand.y, z: cand.z, rot: cand.rot, hp: Math.round(def.hp * (b.tier === 2 ? 1 + this.pk('brickHp') : 1)) };
      if (def.storageSlots) placed.store = new Array(def.storageSlots).fill(null);
      this.save.world.pieces.push(placed);
      this.onWorldAction?.({ type: 'piecePlaced', piece: placed });
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
      this.award(XP.build);
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
    // Look direction first, distance second (review finding #4). Anything more than
    // 70° off the camera's forward direction never wins, so nothing behind the player can.
    const COS_MAX = Math.cos((70 * Math.PI) / 180);
    const score = (x: number, z: number, extra = 0) => {
      const dx = x - px, dz = z - pz;
      const d = Math.hypot(dx, dz);
      if (d < 0.35) return 0.6 + extra; // standing on it: neutral, never an automatic win
      const dot = (dx * fx + dz * fz) / d;
      if (dot < COS_MAX) return Infinity;
      return Math.acos(Math.min(1, dot)) * 1.9 + d * 0.3 + extra;
    };
    this.save.world.drops.forEach((dp, i) => {
      if (Math.hypot(dp.x - px, dp.z - pz) > INTERACT_RANGE * (1 + this.pk('pickupRange'))) return;
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
    // aim point 1.4 m ahead: the closest point of a piece to where the player is looking
    const ax = px + fx * 1.4, az = pz + fz * 1.4;
    this.collision.query(px - R, pz - R, px + R, pz + R, (c: Collider) => {
      if (c.tag !== 'piece') return;
      const cx = Math.max(c.minX, Math.min(ax, c.maxX));
      const czz = Math.max(c.minZ, Math.min(az, c.maxZ));
      const cyy = Math.max(c.minY, Math.min(cy, c.maxY));
      if (Math.hypot(cx - px, czz - pz) > R || Math.abs(cyy - cy) > 1.6) return;
      const flat = c.maxY - c.minY < 0.6; // floors/roofs: only when nothing else is in view
      const sc = score(cx, czz, 0.8 + Math.abs(cyy - cy) * 0.5 + (flat ? 1.2 : 0));
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

  /** What the player would interact with right now (drives the primary button, marker, highlight, prompt). */
  describeTarget(): TargetInfo | null {
    if (this.mode !== 'play') return null;
    for (const p of this.interactProviders) {
      const o = p.prompt();
      if (o) return { kind: o.kind ?? 'use', verb: o.verb ?? o.text, name: o.text, sub: o.sub ?? null, hold: o.hold ?? false, blocked: null, pos: o.pos ?? null, shape: null };
    }
    const t = this.target;
    if (!t) return null;
    if (t.kind === 'drop') return { kind: 'loot', verb: 'Pick up', name: 'Dropped pack', sub: null, hold: false, blocked: null, pos: t.pos, shape: null };
    if (t.kind === 'placed') {
      const def = getPiece(t.piece.piece);
      const shape = { box: this.placedBox(t.piece) };
      if (t.piece.piece === 'bed') return { kind: 'use', verb: 'Sleep', name: t.name, sub: 'hold: dismantle', hold: false, blocked: null, pos: t.pos, shape };
      if (t.piece.piece === 'farm_plot') {
        const c = this.save.world.crops.find((x) => x.plot === t.piece.id);
        const verb = !c || !c.crop ? 'Plant' : c.growth >= 1 ? 'Harvest' : c.water < 0.4 ? 'Water' : 'Check';
        return { kind: 'farm', verb, name: t.name, sub: 'hold: dismantle', hold: false, blocked: null, pos: t.pos, shape };
      }
      if (def?.storageSlots) return { kind: 'loot', verb: 'Open', name: t.name, sub: 'hold: dismantle', hold: false, blocked: null, pos: t.pos, shape };
      if (def?.station) return { kind: 'build', verb: 'Craft', name: t.name, sub: 'hold: dismantle', hold: false, blocked: null, pos: t.pos, shape };
      return { kind: 'break', verb: 'Dismantle', name: t.name, sub: 'refunds materials', hold: true, blocked: null, pos: t.pos, shape };
    }
    if (t.kind === 'prop') {
      const kind = this.layout.props[t.id].kind;
      const ok = toolCanBreak(this.toolTier().tier, t.def.tool);
      const blocked = ok ? null : `Needs a ${toolName(t.def.tool)}`;
      if (kind === 'terminal') return { kind: 'use', verb: 'Read', name: t.name, sub: 'hold: salvage', hold: false, blocked: null, pos: t.pos, shape: { prop: t.id } };
      if (PROP_SALVAGE[kind]?.container && !t.searched) return { kind: 'loot', verb: 'Loot', name: t.name, sub: ok ? 'hold: break apart' : null, hold: false, blocked: null, pos: t.pos, shape: { prop: t.id } };
      return { kind: 'break', verb: 'Break', name: t.name, sub: null, hold: true, blocked, pos: t.pos, shape: { prop: t.id } };
    }
    const ok = toolCanBreak(this.toolTier().tier, t.def.tool);
    const box = this.pieceBox(t.bid, t.index);
    return { kind: t.info.kind === 'door' ? 'door' : 'break', verb: 'Salvage', name: t.name, sub: null, hold: true, blocked: ok ? null : `Needs a ${toolName(t.def.tool)}`, pos: t.pos, shape: box ? { box } : null };
  }

  private placedBox(p: PlacedPiece): [THREE.Vector3, THREE.Vector3] {
    const def = getPiece(p.piece);
    const pos = this.base.pos.get(p.id) ?? new THREE.Vector3(p.x, 0, p.z);
    const odd = p.rot % 2 === 1;
    const hw = ((odd ? def?.size.d : def?.size.w) ?? 1) / 2, hd = ((odd ? def?.size.w : def?.size.d) ?? 1) / 2;
    return [new THREE.Vector3(pos.x - hw, pos.y, pos.z - hd), new THREE.Vector3(pos.x + hw, pos.y + (def?.size.h ?? 1), pos.z + hd)];
  }

  private pieceBox(bid: number, index: number): [THREE.Vector3, THREE.Vector3] | null {
    const b = this.layout.buildings[bid];
    const pi = this.view.pieces(bid)[index];
    if (!b || !pi) return null;
    const ang = (b.rot * Math.PI) / 2;
    const cs = Math.round(Math.cos(ang)), sn = Math.round(Math.sin(ang));
    const xa = pi.min[0] * cs + pi.min[2] * sn, za = -pi.min[0] * sn + pi.min[2] * cs;
    const xb = pi.max[0] * cs + pi.max[2] * sn, zb = -pi.max[0] * sn + pi.max[2] * cs;
    return [new THREE.Vector3(b.x + Math.min(xa, xb), pi.min[1], b.z + Math.min(za, zb)), new THREE.Vector3(b.x + Math.max(xa, xb), pi.max[1], b.z + Math.max(za, zb))];
  }

  private updatePrompt(): void {
    const info = this.describeTarget();
    if (!info) {
      this.bus.emit({ type: 'prompt', text: null });
      return;
    }
    const touch = this.input.usingTouch || document.documentElement.classList.contains('touch');
    const text = info.blocked ? `${info.name}` : `${info.verb} ${info.name}`;
    const sub = info.blocked ?? (info.hold ? (touch ? 'hold the action button' : 'hold E') : info.sub ?? undefined);
    this.bus.emit({ type: 'prompt', text, sub: sub ?? undefined, key: touch ? undefined : 'E' });
  }

  get interactReady(): boolean {
    return !!this.target || this.interactProviders.some((p) => !!p.prompt());
  }

  /** systems (grid nodes, survivors) can claim interaction before props/pieces */
  readonly interactProviders: {
    prompt: () => ProviderPrompt | null;
    handle: (held: boolean, pressed: boolean, tapped: boolean, dt: number) => boolean;
  }[] = [];
  private overrideTap = 0;
  private primarySwing = false;

  private updateInteract(dt: number): void {
    const held = this.input.isHeld('interact');
    const pressedNow = this.input.wasPressed('interact');
    if (pressedNow) this.overrideTap = 0;
    if (held) this.overrideTap += dt;
    const tappedNow = this.input.wasReleased('interact') && this.overrideTap < 0.35;
    for (const p of this.interactProviders) if (p.prompt() && p.handle(held, pressedNow, tappedNow, dt)) return;
    const t = this.target;
    const tapped = this.input.wasReleased('interact') && this.holdT < 0.35;
    if (!t) {
      // one primary button on touch: with nothing to interact with, it swings
      if (this.input.wasPressed('interact')) this.primarySwing = true;
      this.holdT = 0;
      return;
    }
    if (tapped) {
      if (t.kind === 'drop') return this.pickupDrop(t.index);
      if (t.kind === 'placed') {
        const def = getPiece(t.piece.piece);
        if (t.piece.piece === 'bed') return this.trySleep();
        if (t.piece.piece === 'farm_plot') return this.tendPlot(t.piece);
        if (def?.storageSlots) {
          this.storageOverride = null;
          this.storageTarget = t.piece;
          this.openScreen('storage');
          return;
        }
        if (def?.station) {
          this.openScreen('craft');
          return;
        }
      }
      if (t.kind === 'prop' && this.layout.props[t.id].kind === 'terminal' && this.terminalHook) return this.terminalHook(t.id);
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
      need = t.def.time / (tool.speed * best * (1 + this.pk('deconSpeed')));
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
        if (!(this.pk('durability') < 0 && this.rng.chance(-this.pk('durability'))) && wearSlot(this.inv, tool.slot, 1)) {
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
    const bp = 1 + this.pk('bpChance');
    const glass = this.pk('glassSafe');
    for (const y of ys) {
      // Blueprint Hunter doubles blueprint drop chances
      if (y.chance !== undefined && !this.rng.chance(y.item.startsWith('bp.') ? Math.min(1, y.chance * bp) : y.chance)) continue;
      const n = Math.round(this.rng.int(y.min, y.max) * mult) + (y.item === 'mat.glass' ? glass : 0);
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
        this.addDrop(from.x, from.z, [{ id: item, n: left }]);
      }
      if (got <= 0) continue;
      this.bus.emit({ type: 'float', text: `+${got} ${getItem(item)?.name ?? item}`, x: from.x, y: from.y, z: from.z, color: item.startsWith('mat.') ? 0xf0e6cc : 0xe8a65a });
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
    this.onWorldAction?.({ type: 'propRemoved', id: pid });
    this.fx.debris(pos.x, pos.y, pos.z, def.sfx, def.weight);
    audio.play(def.weight > 0.7 ? 'breakBig' : 'break', { pos, vol: 0.9 });
    this.hitstop = 0.035 + def.weight * 0.035;
    this.camera.addTrauma(0.15 + def.weight * 0.3);
    this.camera.kickFov(2 + def.weight * 3);
    this.perkYields(items);
    this.grant(items, pos);
    this.trigger('brokeProp');
    this.award(def.weight > 0.7 ? XP.salvageHeavy : XP.salvage);
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
    this.onWorldAction?.({ type: 'buildingPieceRemoved', building: bid, piece: index });
    const ang = (b.rot * Math.PI) / 2;
    const cs = Math.cos(ang), sn = Math.sin(ang);
    const toWorld = (pi: PieceInfo) => {
      const lx = (pi.min[0] + pi.max[0]) / 2, lz = (pi.min[2] + pi.max[2]) / 2;
      return new THREE.Vector3(b.x + lx * cs + lz * sn, (pi.min[1] + pi.max[1]) / 2, b.z - lx * sn + lz * cs);
    };
    const pos = toWorld(info);
    const mult = this.districtMult(b.x, b.z);
    const items = this.rollYields(def.yields, mult);
    this.perkYields(items);
    this.award(def.weight > 0.7 ? XP.salvageHeavy : XP.salvage);
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

  /** Apply a world event from another co-op player (idempotent). */
  applyRemote(ev: WorldEvent): void {
    const w = this.save.world;
    switch (ev.type) {
      case 'propRemoved':
        if (this.view.removedProps.has(ev.id)) return;
        {
          const p = this.layout.props[ev.id];
          if (!p) return;
          this.view.destroyProp(ev.id);
          if (this.view.isLoaded(p.x, p.z)) {
            const d = PROP_SALVAGE[p.kind];
            this.fx.debris(p.x, this.view.height(p.x, p.z) + 0.5, p.z, d.sfx, d.weight);
            audio.play('break', { pos: p });
          }
        }
        return;
      case 'buildingPieceRemoved': {
        const b = this.layout.buildings[ev.building];
        if (!b) return;
        const removed = this.view.removed(ev.building);
        if (removed.has(ev.piece)) return;
        collapseAfterRemoval(this.view.pieces(ev.building), removed, [ev.piece]);
        w.removedPieces[ev.building] = [...removed].sort((a, c) => a - c);
        this.view.markBuildingDirty(ev.building);
        if (this.view.isLoaded(b.x, b.z)) audio.play('collapse', { pos: b, vol: 0.5 });
        return;
      }
      case 'piecePlaced':
        if (w.pieces.some((p) => p.id === ev.piece.id)) return;
        w.pieces.push(ev.piece);
        this.base.rebuild(w.pieces, w.crops, w.hour);
        return;
      case 'pieceRemoved':
        if (!w.pieces.some((p) => p.id === ev.id)) return;
        w.pieces = w.pieces.filter((p) => p.id !== ev.id);
        w.crops = w.crops.filter((c) => c.plot !== ev.id);
        this.base.rebuild(w.pieces, w.crops, w.hour);
        return;
      case 'nodeOnline': {
        const d = w.districts[ev.district];
        if (d && !d.nodesOnline.includes(ev.node)) {
          d.nodesOnline.push(ev.node);
          this.onRemoteNode?.(ev.node, ev.district);
          this.toast('A teammate brought a node online.', 'warm');
        }
        return;
      }
      case 'time':
        if (Math.abs(w.hour - ev.hour) > 0.25) w.hour = ev.hour;
        return;
    }
  }

  private tendPlot(p: PlacedPiece): void {
    const w = this.save.world;
    let c = w.crops.find((x) => x.plot === p.id);
    const pos = (this.base.pos.get(p.id) ?? this.player.pos).clone().setY(this.player.pos.y + 0.5);
    if (c && c.crop && c.growth >= 1) {
      const got = harvestCrop(c, this.rng);
      if (got.length && this.pk('harvest') > 0) got[0].count += this.pk('harvest');
      this.grant(got.map((g) => ({ item: g.item, n: g.count })), pos);
      this.award(XP.harvest);
      audio.play('pickup');
      this.fx.debris(pos.x, pos.y, pos.z, 'foliage', 0.3, 6);
      w.flags['harvested'] = Number(w.flags['harvested'] ?? 0) + 1;
    } else if (!c || !c.crop) {
      const seed = this.inv.find((s) => s && s.id.startsWith('seed.') && canPlant(s.id, w.hour));
      if (!seed) {
        const any = this.inv.some((s) => s?.id.startsWith('seed.'));
        this.toast(any ? "None of your seeds will grow this season." : 'You need seeds. Bushes and gardens sometimes have them.', 'bad');
        audio.play('deny');
        return;
      }
      const planted = plantCrop(p.id, seed.id, w.hour, c);
      if (!planted) return;
      removeItem(this.inv, seed.id, 1);
      if (c) Object.assign(c, planted);
      else w.crops.push((c = planted));
      audio.play('place', { vol: 0.5 });
      this.fx.dust(pos.x, pos.y - 0.4, pos.z, 4, 0x5a4a36);
      this.toast(`Planted ${getItem(seed.id)?.name.replace(' Seeds', '') ?? seed.id}.`, 'warm');
    } else {
      const water = this.inv.findIndex((s) => s && (s.id === 'drink.dirty_water' || s.id === 'drink.clean_water' || s.id === 'tool.watering_can'));
      const fert = this.inv.findIndex((s) => s?.id === 'misc.fertilizer');
      if (c.water < 0.6 && water >= 0) {
        if (this.inv[water]!.id !== 'tool.watering_can') removeItem(this.inv, this.inv[water]!.id, 1);
        waterCrop(c);
        audio.play('drink', { pitch: 0.7 });
        this.toast('Watered.', 'warm');
      } else if (c.nutrients < 0.5 && fert >= 0) {
        removeItem(this.inv, 'misc.fertilizer', 1);
        fertilize(c);
        this.toast('Fertilized.', 'warm');
      } else {
        const stages = ['Seedlings', 'Growing', 'Nearly there', 'Ripe'];
        this.toast(`${stages[cropStage(c.growth)]} — ${Math.round(c.growth * 100)}% grown, soil ${c.water < 0.4 ? 'dry' : 'moist'}.`);
      }
    }
    this.base.rebuild(w.pieces, w.crops, w.hour);
    this.bus.emit({ type: 'inventory' });
  }

  private lastPieceToast = 0;
  /** Enemies damage a placed piece. Higher tiers soak more. Destroyed pieces collapse with no refund. */
  damagePiece(id: number, dmg: number): void {
    const w = this.save.world;
    const p = w.pieces.find((x) => x.id === id);
    if (!p) return;
    p.hp -= dmg / TIER_HP_MULT[p.tier];
    const pos = this.base.pos.get(id);
    if (pos) {
      this.fx.debris(pos.x, pos.y + 1, pos.z, p.tier >= 2 ? 'stone' : 'wood', 0.2, 3);
      audio.play(p.tier >= 2 ? 'hitStone' : 'hitWood', { pos, vol: 0.7 });
    }
    if (p.hp > 0) return;
    const fallen = collapsePlacedAfterRemoval(w.pieces, id, this.pk('stability'));
    const all = [id, ...fallen];
    for (const pid of all) this.onWorldAction?.({ type: 'pieceRemoved', id: pid });
    w.pieces = w.pieces.filter((x) => !all.includes(x.id));
    w.crops = w.crops.filter((c) => !all.includes(c.plot));
    if (this.save.player.bed && !w.pieces.some((x) => x.piece === 'bed' && Math.hypot(x.x - this.save.player.bed!.x, x.z - this.save.player.bed!.z) < 0.5)) this.save.player.bed = null;
    this.base.rebuild(w.pieces, w.crops, w.hour);
    if (pos) {
      this.fx.debris(pos.x, pos.y + 1, pos.z, 'wood', 0.8);
      audio.play('collapse', { pos });
    }
    if (this.time - this.lastPieceToast > 4) {
      this.lastPieceToast = this.time;
      this.toast(`${getPiece(p.piece)?.name ?? 'Something'} at Haven was torn down.`, 'bad');
    }
  }

  private dismantlePlaced(p: PlacedPiece): void {
    const w = this.save.world;
    const fallen = collapsePlacedAfterRemoval(w.pieces, p.id, this.pk('stability'));
    const all = [p.id, ...fallen];
    const refunds: { item: string; n: number }[] = [];
    for (const id of all) {
      const pc = w.pieces.find((x) => x.id === id);
      if (!pc) continue;
      for (const r of refundFor(pc)) refunds.push({ item: r.item, n: r.count });
      if (pc.store) for (const st of pc.store) if (st) refunds.push({ item: st.id, n: st.n });
    }
    const pos = (this.base.pos.get(p.id) ?? this.player.pos).clone();
    this.onWorldAction?.({ type: 'pieceRemoved', id: p.id });
    for (const id of all) {
      const pc = w.pieces.find((x) => x.id === id);
      if (pc?.piece === 'bed' && this.save.player.bed && Math.hypot(this.save.player.bed.x - pc.x, this.save.player.bed.z - pc.z) < 0.5) this.save.player.bed = null;
    }
    for (const id of all) this.onWorldAction?.({ type: 'pieceRemoved', id });
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

  /** Add items to the nearest pack within 2.5 m (or a new one); caps total packs. */
  addDrop(x: number, z: number, items: ItemStack[]): void {
    const w = this.save.world;
    let pack = w.drops.find((d) => Math.hypot(d.x - x, d.z - z) < 2.5);
    if (!pack) {
      if (w.drops.length >= 120) w.drops.shift();
      pack = { x, z, items: [], t: w.hour };
      w.drops.push(pack);
    }
    for (const st of items) {
      const same = pack.items.find((s) => s.id === st.id && s.d === undefined && st.d === undefined);
      if (same) same.n += st.n;
      else pack.items.push(st);
    }
    if (pack.items.length > 60) pack.items.length = 60;
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
    const want = this.input.consumeBuffered('attack') || (this.input.isHeld('attack') && this.attackT <= 0) || this.primarySwing;
    this.primarySwing = false;
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
    tickStamina(p, 0, eq?.weapon?.stamina ?? 8, modifiers(p, this.perkMods()));
    audio.play('swing', { vol: 0.6 });
    const dmg = (eq?.weapon?.damage ?? (eq?.tool ? 12 : 6)) * (1 + this.pk(eq?.weapon?.kind === 'ranged' ? 'ranged' : 'melee'));
    if (eq?.weapon?.kind === 'ranged') {
      const ammo = eq.weapon.ammo;
      if (ammo && !this.inv.some((s) => s?.id === ammo)) {
        audio.play('deny');
        this.toast(`Out of ${getItem(ammo)?.name ?? 'ammo'}.`, 'bad');
        this.player.rig.setState('idle');
        return;
      }
      if (ammo) removeItem(this.inv, ammo, 1);
      this.player.rig.setState('aim');
      this.fireHook?.(dmg, eq.weapon.range, eq.id);
      this.bus.emit({ type: 'inventory' });
      return;
    }
    setTimeout(() => this.resolveSwing(dmg), cd * 0.45 * 1000);
  }

  /** ranged weapon fire (set by Enemies) */
  fireHook: ((damage: number, range: number, weapon: string) => void) | null = null;
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
    return { difficulty: this.save.world.difficulty, rng: this.rng, sleeping: this.mode === 'sleeping', exposed: this.atm.wetness > 0.5 && !this.underRoof(), perks: this.perkMods() };
  }

  // ------------------------------------------------------------ progression (XP, perk points, perk effects)
  /** sum of an owned perk effect (perks.ts fx keys) */
  pk(key: string): number {
    return this.save ? perkFx(this.save.player.perks, key) : 0;
  }

  perkMods(): { sickness: number; medicine: number; staminaRegen: number; cooking: number; spoil: number } {
    return { sickness: this.pk('sickness'), medicine: this.pk('medicine'), staminaRegen: this.pk('staminaRegen'), cooking: this.pk('cooking'), spoil: this.pk('spoil') };
  }

  /** set by main: perk point earned (UI badge/refresh) */
  onPerkPoint: (() => void) | null = null;

  /** Grant XP for an action. A level-up gives a perk point. */
  award(xp: number, why?: string): void {
    if (!this.save || xp <= 0) return;
    const gained = grantXp(this.save.player, xp);
    if (why) this.toast(S.prog.xpGain(xp, why), 'info');
    if (gained > 0) this.perkPointToast(gained, S.prog.levelUp);
  }

  /** Perk points that do not come from levelling (nodes, quests). */
  givePerkPoints(n: number, why: string): void {
    if (!this.save || n <= 0) return;
    this.save.player.perkPoints += n;
    this.perkPointToast(n, why);
  }

  private perkPointToast(n: number, why: string): void {
    this.toast(S.prog.point(why, n), 'warm');
    audio.play('levelUp', { vol: 0.7 });
    this.fx.glowBurst(this.player.pos.x, this.player.pos.y + 1.4, this.player.pos.z, 14, 0xffd27a);
    this.onPerkPoint?.();
  }

  takePerk(id: string): boolean {
    const p = this.save.player;
    if (!canTakePerk(p.perks, id, p.perkPoints)) {
      audio.play('deny');
      return false;
    }
    p.perks.push(id);
    p.perkPoints--;
    const def = PERK_MAP.get(id);
    this.toast(S.prog.taken(def?.name ?? id), 'warm');
    audio.play('levelUp', { vol: 0.8 });
    this.fx.glowBurst(this.player.pos.x, this.player.pos.y + 1.2, this.player.pos.z, 18, 0xffd27a);
    this.onPerkPoint?.();
    this.persist('perk');
    return true;
  }

  /** Strip It All / Eye for Wire */
  private perkYields(items: { item: string; n: number }[]): void {
    if (!items.length) return;
    const bonus = this.pk('salvageBonus');
    if (bonus > 0) items[0].n += bonus;
    const wire = items.find((i) => i.item === 'mat.wiring');
    if (wire) wire.n += this.pk('wiringBonus');
  }

  private underRoof(): boolean {
    const p = this.player.pos;
    return this.collision.raycast(p.x, p.y + 1.8, p.z, p.x, p.y + 30, p.z) < 1;
  }

  hurt(amount: number, kind: 'blunt' | 'cut' | 'fall' | 'bite' | 'shot', cause = kind as string): void {
    if (this.mode === 'dead') return;
    const dealt = damagePlayer(this.save.player, amount * (1 - Math.min(0.6, this.pk('armor'))), kind, this.survivalCtx());
    this.bus.emit({ type: 'damage', amount: dealt });
    audio.play('hurt');
    this.player.rig.hit(0.8);
    this.camera.addTrauma(0.3);
    this.fx.decal(this.player.pos.x, this.player.pos.y, this.player.pos.z, 0x5a1a16, 0.6);
    this.bus.emit({ type: 'meters' });
    if (this.save.player.health <= 0) this.die(cause);
  }

  /** bumped whenever a different save/session takes over, so stale timers bail */
  session = 0;

  private die(cause: string): void {
    if (this.mode === 'dead') return;
    this.stopBuild();
    const sess = this.session;
    const p = this.save.player;
    const pos = this.player.pos.clone();
    const bed = p.bed ?? this.layout.spawn;
    const dropped = respawnPlayer(p, bed);
    const items = dropped.filter((s): s is ItemStack => !!s);
    if (items.length) this.addDrop(pos.x, pos.z, items);
    this.save.player.equipped = null;
    this.rebuildDrops();
    this.player.rig.setState('dead');
    this.setMode('dead');
    this.toast(cause === 'fall' ? 'That was a long way down.' : 'You went down.', 'bad');
    setTimeout(() => {
      if (sess !== this.session || this.mode !== 'dead') return;
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
    const sess = this.session;
    this.player.rig.setState('sleep');
    const fade = document.createElement('div');
    fade.className = 'fade';
    document.getElementById('app')!.appendChild(fade);
    requestAnimationFrame(() => fade.classList.add('on'));
    setTimeout(() => {
      if (sess !== this.session || this.mode !== 'sleeping') {
        fade.remove();
        return;
      }
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
      this.award(XP.night, S.prog.night);
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

  /** footstep surface under the player */
  private surfaceUnderPlayer(): 'grass' | 'dirt' | 'hard' | 'wood' | 'metal' | 'soft' {
    const p = this.player.pos;
    const ground = this.view.surface(p.x, p.z);
    if (p.y > ground + 0.15) {
      // on a floor slab, foundation or prop
      return p.y > ground + 0.6 ? 'metal' : 'wood';
    }
    const t = tileAt(this.layout, p.x, p.z);
    if (t === 0 || t === 5 || t === 9) return 'grass';
    if (t === 4 || t === 3) return 'dirt';
    if (t === 1 || t === 2 || t === 8 || t === 10) return 'hard';
    if (t === 7) return 'metal';
    return 'soft';
  }

  private winded = false;
  private breathT = 0;

  private updateSurvival(dt: number): void {
    const p = this.save.player;
    const moving = this.player.rig.speed > 0.5;
    const sprinting = this.input.sprinting && moving && this.player.canSprint;
    const mods = modifiers(p, this.perkMods());
    tickStamina(p, dt, sprinting ? 14 : 0, mods);
    // hysteresis: once you run dry you must recover to 30% before sprinting again
    if (!this.winded && p.stamina <= 3) {
      this.winded = true;
      this.toast("Out of breath — walk a moment to recover.", 'bad');
      audio.play('breath', { vol: 0.8 });
    } else if (this.winded && p.stamina >= 30) this.winded = false;
    this.player.canSprint = !this.winded;
    document.documentElement.classList.toggle('winded', this.winded || p.stamina < 15);
    this.breathT -= dt;
    if ((this.winded || p.stamina < 25) && this.breathT <= 0) {
      this.breathT = 1.15;
      audio.play('breath', { vol: 0.45 });
    }
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
    if (!this.save || this.mode === 'menu' || this.mode === 'cinematic' || !this.settings.hints || this.onbStep >= ONBOARDING.length) {
      this.bus.emit({ type: 'hint', text: null });
      return;
    }
    const step = ONBOARDING[this.onbStep];
    if (step.trigger === 'moved') this.onbStartPos.copy(this.player.pos);
    if (step.trigger === 'looked') this.onbYaw = this.camera.yaw;
  }

  private checkOnboarding(): void {
    if (this.onbStep >= ONBOARDING.length) return;
    // remember a pack opened BEFORE its tutorial step, so the step does not ask twice
    // (round 4: the review bot opened it during step 3 and the step then never completed)
    if ((this.screenProbe?.() ?? this.openScreenId) === 'inventory') this.save.world.flags['seenPack'] = true;
    const step = ONBOARDING[this.onbStep];
    if (step.trigger === 'moved' && this.player.pos.distanceTo(this.onbStartPos) > 6) this.trigger('moved');
    if (step.trigger === 'looked' && Math.abs(this.camera.yaw - this.onbYaw) > 1.4) this.trigger('looked');
    if (step.trigger === 'nightfall' && isNight(this.save.world.hour)) this.trigger('nightfall');
    if (step.trigger === 'openedInventory' && this.save.world.flags['seenPack']) this.trigger('openedInventory');
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
  /** effective restoration at a point (set by the restoration layer: district state, boosted near online nodes) */
  restorationAt: ((x: number, z: number) => number) | null = null;

  warmth(): number {
    const d = districtAt(this.layout, this.player.pos.x, this.player.pos.z);
    const st = this.restorationAt?.(this.player.pos.x, this.player.pos.z) ?? this.save.world.districts[d.index]?.state ?? 0;
    const base = d.key === 'haven' ? 0.55 : 0.2;
    return Math.min(1, base + st * 0.18);
  }

  questCtx() {
    return { inventory: this.inv, rank: Number(this.save.world.flags['rank'] ?? 1), districtKeys: this.layout.districts.map((d) => d.key) };
  }

  /** Journal lines: active quest steps with progress, plus completed ones. */
  objectives(): { title: string; text: string; done: boolean }[] {
    const w = this.save.world;
    const out: { title: string; text: string; done: boolean }[] = [];
    // main story first: the HUD objective card shows entry 0, so it must be the main next step
    for (const q of activeQuests(w).sort((a, b) => Number(b.main) - Number(a.main))) {
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
  /** advance quests now (after a talk/choice) instead of waiting for the 1.5 s tick */
  pokeQuests(): void {
    this.questT = 0;
    this.updateQuests(0);
  }
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
        applyQuestRewards(w, q);
        this.award(q.reward.xp ?? 0, q.title);
        this.givePerkPoints(PERK_POINT_PER_QUEST, S.prog.questDone(q.title));
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
      w.weather = dayOf(w.hour) === 0 ? 'clear' : weatherAt(SEED, w.hour);
      if (!blocked) {
        if (this.input.wasPressed('build') && this.mode === 'play') this.startBuild('foundation', 0);
        for (let q = 0; q < 4; q++) if (this.input.wasPressed(`q${q + 1}` as 'q1')) this.selectQuick(q);
      }
      if (this.input.wasPressed('menu') && this.mode === 'build') this.stopBuild();
      this.player.locked = (this.input.uiBlocking || this.holdT > 0.18) && !this.player.dodging;
      if (!blocked && this.input.wasPressed('dodge') && this.save.player.stamina > 12) {
        if (this.player.startDodge({ x: this.input.moveX, y: this.input.moveY, mag: 1, sprint: false, jump: false, dodge: true, camYaw: this.camera.yaw })) {
          tickStamina(this.save.player, 0, 12 * (1 + this.pk('dodgeCost')), modifiers(this.save.player, this.perkMods()));
          audio.play('swing', { pitch: 0.7, vol: 0.4 });
        }
      }
      const jump = !blocked && this.input.wasPressed('jump') && this.save.player.stamina > 5;
      if (jump && this.player.grounded) audio.play('jump', { vol: 0.4 });
      const mi = this.moveIntent;
      mi.x = this.input.moveX;
      mi.y = this.input.moveY;
      mi.mag = this.input.moveMag;
      mi.sprint = this.input.sprinting;
      mi.jump = jump;
      mi.camYaw = this.camera.yaw;
      this.player.update(simDt, mi, this.collision);
      const rig = this.player.rig;
      if (!this.player.dodging && rig.state === 'dodge' && rig.stateT > 0.42) rig.setState('idle');
      if ((rig.state === 'attack' || rig.state === 'aim') && rig.stateT > rig.attackDur) rig.setState('idle');
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
    {
      const look = this.playerLook;
      const tp = this.target?.pos;
      if (tp) look.copy(tp);
      else {
        const cy = this.camera.yaw;
        look.set(this.player.pos.x + Math.sin(cy) * 12, this.player.pos.y + 1.6 + Math.sin(this.camera.pitch) * 12, this.player.pos.z + Math.cos(cy) * 12);
      }
      this.player.rig.lookTarget = this.mode === 'play' ? look : null;
    }
    this.player.rig.update(simDt);
    this.view.update(this.player.pos.x, this.player.pos.z);
    this.fx.target.copy(this.player.pos);
    this.fx.update(simDt, (x, z) => this.view.surface(x, z));
    this.contactT -= dt;
    if (this.contactT <= 0) {
      this.contactT = 0.25;
      this.updateContactShadows();
    }
    if (!this.input.uiBlocking && this.input.zoom) this.camera.zoomBy(this.input.zoom);
    this.camera.bob = this.player.grounded ? Math.min(1, this.player.rig.speed / 6) : 0;
    this.camera.update(dt, this.player.pos, this.input.sprinting && this.input.moveMag > 0.5 && this.player.canSprint, this.collision);
    // fade the player out when the camera is pressed against them (walls behind)
    // never lose the player: hidden only if the lens is literally inside the head
    this.player.rig.mesh.visible = this.camera.lensToFocus > 0.4 || this.mode === 'cinematic';
    this.updateIntro(dt);
    const warmth = this.warmth();
    this.atm.update(dt, this.save.world.hour, (this.save.world.weather as Weather) ?? 'clear', warmth, this.player.pos, this.camera.cam.position, this.renderer.quality.fogFar * (this.introT >= 0 ? 2.6 - Math.min(1, this.introT / 7) * 1.6 : 1), this.time);
    const night = 1 - this.atm.daylight;
    this.renderer.post?.setWarmth(warmth);
    // occluder cutout: world + props + base + camp dither away what sits between lens and player
    this.cutFocus.set(this.player.pos.x, this.player.pos.y + 1.0, this.player.pos.z);
    for (const u of [this.view.chunkMat.userData.u, this.view.propMat.userData.u, this.base.mat.userData.u, this.camp.mat.userData.u]) {
      u.uCut.value = this.mode === 'cinematic' ? 0 : 1;
      u.uCamPos.value.copy(this.camera.cam.position);
      u.uFocus.value.copy(this.cutFocus);
    }
    for (const u of this.view.uniforms) {
      u.uWindow.value = 0.25 + night * 1.1;
      u.uGrid.value = 0.8 + Math.sin(this.time * 2) * 0.1;
    }
    this.base.mat.userData.u.uWindow.value = 0.4 + night;
    this.base.mat.userData.u.uGrid.value = 1;
    this.camp.update(dt, night);
    this.camp.mat.userData.u.uWindow.value = 0.4 + night;
    audio.listener.x = this.player.pos.x;
    audio.listener.z = this.player.pos.z;
    audio.listener.yaw = this.camera.yaw;
    const d = districtAt(this.layout, this.player.pos.x, this.player.pos.z);
    const as = this.audioState;
    as.danger = Math.min(1, d.danger / 4) * (1 - warmth * 0.5);
    as.warmth = warmth;
    as.night = night;
    as.rain = this.atm.wetness;
    as.machine = this.machineProximity;
    as.combat = this.combatLevel;
    audio.update(as);
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
  cone: 'Traffic Cone', barrier: 'Concrete Barrier', planter: 'Planter', weeds: 'Weeds',
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
