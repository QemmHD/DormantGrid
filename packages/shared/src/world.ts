// World layout contract. Produced by @dg/sim worldgen (deterministic from seed),
// consumed by the client renderer/streamer and the server.

export const WORLD_SIZE = 1216; // meters, 19 cells of 64 m
export const CELL_SIZE = 64; // streaming chunk size in meters
export const CELLS = WORLD_SIZE / CELL_SIZE; // 19
export const TILE_SIZE = 4; // ground tile size in meters
export const TILES = WORLD_SIZE / TILE_SIZE; // 304
export const NAV_SIZE = 2; // nav grid resolution in meters
export const NAVS = WORLD_SIZE / NAV_SIZE; // 608

/** World origin is the south-west corner at (0,0); x grows east, z grows south. */

export type DistrictKey =
  | 'haven'
  | 'downtown'
  | 'residential'
  | 'market'
  | 'industrial'
  | 'hospital'
  | 'waterworks'
  | 'rail'
  | 'outskirts';

export const DISTRICT_KEYS: readonly DistrictKey[] = [
  'haven',
  'downtown',
  'residential',
  'market',
  'industrial',
  'hospital',
  'waterworks',
  'rail',
  'outskirts',
] as const;

/** 0 Ruin, 1 Stabilized, 2 Powered, 3 Inhabited, 4 Thriving */
export type RestorationState = 0 | 1 | 2 | 3 | 4;
export const RESTORATION_NAMES = ['Ruin', 'Stabilized', 'Powered', 'Inhabited', 'Thriving'] as const;

export const enum Tile {
  Grass = 0,
  Road = 1,
  Sidewalk = 2,
  Lot = 3, // paved/dirt yard inside a lot
  Dirt = 4,
  Field = 5,
  Water = 6,
  Rail = 7,
  Plaza = 8,
  Forest = 9,
  Bridge = 10,
}

export interface DistrictInfo {
  index: number; // index into WorldLayout.districts, also the value stored in districtMap
  key: DistrictKey;
  name: string;
  /** Center in world meters */
  cx: number;
  cz: number;
  /** Danger tier 0..4 (haven 0) */
  danger: number;
}

export type RoofType = 'flat' | 'gable' | 'sawtooth';
export type LotType =
  | 'house'
  | 'apartment'
  | 'shop'
  | 'office'
  | 'warehouse'
  | 'factory'
  | 'clinic'
  | 'pumphouse'
  | 'depot'
  | 'barn'
  | 'shelter';

export interface BuildingDef {
  id: number;
  district: number;
  lot: LotType;
  /** Center of footprint in world meters */
  x: number;
  z: number;
  /** Footprint along local x / local z (meters, multiples of 4) */
  w: number;
  d: number;
  /** Quarter turns 0..3 about Y (local +z faces the street at rot 0) */
  rot: 0 | 1 | 2 | 3;
  floors: number; // 1..6
  roof: RoofType;
  enterable: boolean;
  /** Deterministic variant seed for color/detail */
  variant: number;
  /** 0 intact .. 1 heavily ruined (holes, collapsed corners) */
  decay: number;
}

export type PropKind =
  | 'car'
  | 'van'
  | 'bus'
  | 'tree'
  | 'pine'
  | 'bush'
  | 'rock'
  | 'rubble'
  | 'barrel'
  | 'crate'
  | 'dumpster'
  | 'bench'
  | 'streetlight'
  | 'sign'
  | 'hydrant'
  | 'fence'
  | 'pallet'
  | 'tire'
  | 'trashbag'
  | 'mailbox'
  | 'container'
  | 'pipe'
  | 'haybale'
  | 'stump'
  | 'locker'
  | 'shelf'
  | 'table'
  | 'chair'
  | 'bed'
  | 'cabinet'
  | 'sofa'
  | 'fridge'
  | 'stove'
  | 'terminal'
  | 'debris'
  // worldgen v2 street dressing
  | 'cone'
  | 'barrier'
  | 'planter'
  | 'weeds';

export interface PropDef {
  id: number;
  kind: PropKind;
  x: number;
  y: number; // usually 0, >0 for interior props on upper floors
  z: number;
  rotY: number; // radians
  scale: number;
  district: number;
  /** building id if inside a building, else -1 */
  building: number;
}

export interface ControlNodeDef {
  id: number;
  district: number;
  x: number;
  z: number;
  /** order within district, 0 first */
  order: number;
}

export interface Polyline {
  points: [number, number][];
  width: number;
}

/**
 * Worldgen version. Saves record the version their prop/building IDs refer to.
 * Rule: a new version may only APPEND props/buildings after the previous
 * version's output (same RNG streams, same IDs), so every older save's IDs stay
 * valid. A non-additive change needs an ID remap migration in @dg/sim/save.
 *   1 — original layout (hash 9cf52650 for seed 1337)
 *   2 — (hash ff749351 for seed 1337) v1 + denser street dressing (parked cars, clutter clusters, debris, signs, foliage)
 */
export const WORLDGEN_VERSION = 2;

export interface WorldLayout {
  seed: number;
  /** worldgen version this layout was produced with */
  genVersion: number;
  /** propMarks[v] = number of props that existed in version v (props [0, propMarks[v]) are identical) */
  propMarks: number[];
  size: number;
  districts: DistrictInfo[];
  /** TILES*TILES district index per ground tile */
  districtMap: Uint8Array;
  /** TILES*TILES Tile enum per ground tile */
  tiles: Uint8Array;
  /** TILES*TILES terrain height in meters (mostly flat, gentle rolls in outskirts) — Float32 */
  heights: Float32Array;
  river: Polyline;
  rail: Polyline;
  buildings: BuildingDef[];
  props: PropDef[];
  nodes: ControlNodeDef[];
  /** Player spawn (Haven Lot) */
  spawn: { x: number; z: number };
  /** Stable hex hash of all generated data */
  hash: string;
}

/** Spatial index of the layout by streaming cell. */
export interface CellIndex {
  buildings: number[];
  props: number[];
}

export function cellOf(x: number, z: number): [number, number] {
  return [Math.floor(x / CELL_SIZE), Math.floor(z / CELL_SIZE)];
}

export function cellKey(cx: number, cz: number): number {
  return cz * CELLS + cx;
}
