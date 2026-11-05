// Client-internal contract between the game core (game/*), the UI (ui/*) and
// the account/save/net layer (net/*, save/*). Keep this file small and stable.
import type { GameSave, ItemStack, StationId } from '@dg/shared';
import type { Input } from '../input/input';
import type { AudioEngine } from '../audio/audio';

// ---------------- event bus ----------------
export type GameEvent =
  | { type: 'inventory' } // player inventory/quick slots/equipped changed
  | { type: 'meters' } // health/hunger/thirst/stamina/sleep/conditions changed (throttled ~4 Hz)
  | { type: 'toast'; text: string; kind?: 'info' | 'warm' | 'bad'; icon?: string }
  | { type: 'hint'; text: string | null } // onboarding/contextual hint (null hides)
  | { type: 'prompt'; text: string | null; sub?: string; key?: string } // context interact prompt
  | { type: 'progress'; value: number | null } // hold-to-deconstruct ring 0..1 (null hides)
  | { type: 'district'; name: string; state: string; blurb: string } // entered a district
  | { type: 'subtitle'; who: string; text: string }
  | { type: 'mode'; mode: GameMode } // play | build | menu | dead | sleeping | cinematic
  | { type: 'pickup'; item: string; n: number }
  | { type: 'float'; text: string; x: number; y: number; z: number; color?: number }
  | { type: 'saved'; at: number; cloud: boolean }
  | { type: 'settings' }
  | { type: 'damage'; amount: number }
  | { type: 'build'; piece: string | null; tier: number; ok: boolean; reason?: string }
  | { type: 'town' } // survivors/needs/rank changed
  | { type: 'net'; status: NetStatus }
  | { type: 'update-ready' }
  | { type: 'open'; screen: ScreenId | null };

export type GameMode = 'menu' | 'play' | 'build' | 'dead' | 'sleeping' | 'cinematic';
export type ScreenId = 'inventory' | 'craft' | 'map' | 'ledger' | 'journal' | 'perks' | 'settings' | 'pause' | 'storage' | 'account' | 'coop' | 'help';
export type NetStatus = 'offline' | 'online' | 'syncing' | 'conflict' | 'error' | 'reconnecting';

type Handler<T extends GameEvent['type']> = (ev: Extract<GameEvent, { type: T }>) => void;

export class Bus {
  private map = new Map<string, Set<(ev: GameEvent) => void>>();
  on<T extends GameEvent['type']>(type: T, fn: Handler<T>): () => void {
    let set = this.map.get(type);
    if (!set) this.map.set(type, (set = new Set()));
    const h = fn as (ev: GameEvent) => void;
    set.add(h);
    return () => set!.delete(h);
  }
  emit(ev: GameEvent): void {
    const set = this.map.get(ev.type);
    if (set) for (const fn of set) fn(ev);
  }
}

// ---------------- settings ----------------
export interface Settings {
  quality: 'auto' | 'low' | 'medium' | 'high';
  master: number; // 0..1
  music: number;
  sfx: number;
  ambience: number;
  muted: boolean;
  sensitivity: number; // 0.4..2
  invertY: boolean;
  leftHanded: boolean;
  textSize: 'normal' | 'big' | 'huge';
  colorblind: boolean;
  reduceShake: boolean;
  subtitles: boolean;
  showPerf: boolean;
  /** co-op diagnostics overlay (state, RTT, snapshot age, desyncs, copy report) */
  coopDiag: boolean;
  fpsCap30: boolean; // battery saver / Low Power Mode
  dayMinutes: number; // real minutes per in-game day (default 24)
  hints: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  quality: 'auto',
  master: 0.9,
  music: 0.55,
  sfx: 0.9,
  ambience: 0.7,
  muted: false,
  sensitivity: 1,
  invertY: false,
  leftHanded: false,
  textSize: 'normal',
  colorblind: false,
  reduceShake: false,
  subtitles: true,
  showPerf: false,
  coopDiag: false,
  fpsCap30: false,
  dayMinutes: 24,
  hints: true,
};

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem('dg.settings');
    if (raw) return { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<Settings>) };
  } catch {
    /* ignore */
  }
  return { ...DEFAULT_SETTINGS };
}

export function storeSettings(s: Settings): void {
  try {
    localStorage.setItem('dg.settings', JSON.stringify(s));
  } catch {
    /* private mode */
  }
}

// ---------------- game API used by UI ----------------
export interface CraftInfo {
  stations: StationId[];
  /** stations in reach that need Grid power and have none */
  unpowered?: StationId[];
  blueprints: string[];
  rank: number;
}

export interface GameAPI {
  readonly bus: Bus;
  readonly input: Input;
  readonly audio: AudioEngine;
  settings: Settings;
  /** live save (player + world). Read freely; mutate only via methods below. */
  readonly save: GameSave;
  readonly mode: GameMode;
  /** current game hour (fractional) */
  readonly hour: number;

  // inventory
  useSlot(i: number): void; // eat/drink/heal/equip/place
  dropSlot(i: number): void;
  moveSlot(a: number, b: number): void;
  splitSlot(i: number): void;
  sortInventory(): void;
  setQuick(q: number, itemId: string | null): void;
  selectQuick(q: number): void;
  carryWeight(): { kg: number; max: number };

  // crafting
  craftInfo(): CraftInfo;
  /** recipe id the tutorial wants next, pinned first in the craft list */
  suggestedRecipe(): string | null;
  craft(recipeId: string, times: number): boolean;

  // building
  startBuild(pieceId: string, tier: number): void;
  stopBuild(): void;

  // storage (when a storage screen is open)
  storage(): (ItemStack | null)[] | null;
  moveToStorage(i: number): void;
  moveFromStorage(i: number): void;

  // flow
  setPaused(p: boolean): void;
  applySettings(): void;
  newGame(): Promise<void>;
  continueGame(): Promise<void>;
  hasSave(): boolean;
  exportSave(): string; // JSON string
  importSave(json: string): Promise<boolean>;
  /** open a UI screen by id (UI implements; game calls) */
  openScreen(id: ScreenId | null): void;

  // progression
  /** learn a perk with a perk point; false if not allowed */
  takePerk(id: string): boolean;
}
