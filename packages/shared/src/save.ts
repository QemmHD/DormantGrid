// Versioned save schema. Bump SAVE_SCHEMA_VERSION and add a migration in
// @dg/sim/save/migrations whenever this shape changes. Never remove migrations.

import type { ConditionId, ItemStack } from './items';
import type { RestorationState } from './world';

export const SAVE_SCHEMA_VERSION = 4;

export type Difficulty = 'chill' | 'standard' | 'hard';

export interface PlayerSave {
  x: number;
  y: number;
  z: number;
  yaw: number;
  health: number; // 0..100
  hunger: number; // 0..100 (100 = full)
  thirst: number;
  stamina: number;
  sleep: number; // 100 = rested
  conditions: { id: ConditionId; t: number }[]; // t = remaining hours (or severity)
  inventory: (ItemStack | null)[];
  quick: (string | null)[]; // 4 quick-slot item ids
  equipped: string | null;
  bed: { x: number; z: number } | null;
  perks: string[];
  perkPoints: number;
  xp: number;
}

export interface PlacedPiece {
  id: number; // unique within save
  piece: string; // piece def id, e.g. 'wall' | 'foundation'
  tier: 0 | 1 | 2 | 3; // scrap, timber, brick, reinforced
  x: number;
  y: number;
  z: number;
  rot: 0 | 1 | 2 | 3;
  hp: number;
  /** station inventory for storage etc */
  store?: (ItemStack | null)[];
}

export interface DropPile {
  x: number;
  z: number;
  items: ItemStack[];
  t: number;
}

export interface SurvivorSave {
  id: number;
  name: string;
  seed: number; // appearance
  traits: [string, string];
  stats: { str: number; dex: number; int: number; cha: number; grit: number };
  skills: Record<string, number>; // skill -> xp
  mood: number; // 0..100
  loyalty: number;
  hunger: number;
  rest: number;
  health: number;
  job: string; // current assigned job or 'auto'
  x: number;
  z: number;
  bed: number; // placed piece id or -1
  injured: boolean;
  alive: boolean;
}

export interface CropSave {
  plot: number; // placed piece id
  crop: string;
  planted: number; // game hour planted
  growth: number; // 0..1
  water: number; // 0..1
  nutrients: number; // 0..1
  lastCrop?: string;
  /** game hour it ripened */
  ripeAt?: number;
  /** planted by the player: farmers leave it ripe for them for a few hours (round 6 harvest reminder) */
  mine?: boolean;
}

export interface DistrictSave {
  state: RestorationState;
  nodesOnline: number[];
}

export interface WorldSave {
  seed: number;
  /** worldgen version the prop/building IDs below refer to (see WORLDGEN_VERSION) */
  genVersion: number;
  /** Game time in hours since start (day = floor(h/24)) */
  hour: number;
  weather: string;
  /** prop ids removed by deconstruction (sorted) */
  removedProps: number[];
  /** building id -> bitmask string of removed piece indices (base36 runs) */
  removedPieces: Record<string, number[]>;
  pieces: PlacedPiece[];
  nextPieceId: number;
  drops: DropPile[];
  survivors: SurvivorSave[];
  crops: CropSave[];
  districts: DistrictSave[];
  factions: Record<string, number>; // faction -> reputation -100..100
  townStock: (ItemStack | null)[];
  blueprints: string[];
  quests: Record<string, number>; // quest id -> step
  flags: Record<string, boolean | number | string>;
  difficulty: Difficulty;
}

export interface GameSave {
  schema: number;
  /** monotonically increasing revision, bumped on every local save */
  rev: number;
  savedAt: number; // epoch ms
  playtime: number; // seconds
  gameVersion: string;
  player: PlayerSave;
  world: WorldSave;
}
