// Base-building piece definitions.
// Grid: 4 m cells (matches the world building kit), 3 m storeys.
// - 'cell' pieces occupy a 4x4 cell at a level (foundation, floor, roof, stairs).
// - 'edge' pieces sit on a cell edge (walls, doorways, windows, fences, gates).
// - 'free' pieces snap to a 1 m grid on the ground or on a floor (stations, defenses, traps).

import type { StationId } from '@dg/shared';

export const GRID = 4;
export const STOREY = 3;
export const FREE_GRID = 1;

/** 0 scrap, 1 timber, 2 brick/concrete, 3 reinforced */
export type Tier = 0 | 1 | 2 | 3;
export const TIER_NAMES = ['Scrap', 'Timber', 'Brick', 'Reinforced'] as const;
export const TIER_HP_MULT = [1, 2, 4, 8] as const;
/** Stability lost per support hop multiplier per tier (higher tiers carry further). */
export const TIER_LOSS_MULT = [1.3, 1, 0.8, 0.6] as const;
export const TIER_BLUEPRINT: (string | undefined)[] = [undefined, undefined, undefined, 'bp.reinforced'];
export const TIER_RANK = [1, 1, 2, 4] as const;

export type PieceKind = 'foundation' | 'wall' | 'floor' | 'roof' | 'stairs' | 'fence' | 'station' | 'defense' | 'trap';
export type Snap = 'cell' | 'edge' | 'free';
export type Cost = { item: string; count: number }[];

export interface PieceDef {
  id: string;
  name: string;
  desc: string;
  kind: PieceKind;
  snap: Snap;
  /** meters (local, before rotation) */
  size: { w: number; h: number; d: number };
  /** costs per tier; free pieces have a single tier-0 cost */
  costs: Cost[];
  /** base hp at tier 0 */
  hp: number;
  /** blocks movement */
  solid: boolean;
  /** has a walk-through opening */
  opening?: boolean;
  station?: StationId;
  storageSlots?: number;
  /** if set, placing this piece consumes one of the item instead of costs */
  fromItem?: string;
  needsPower?: boolean;
  rank?: number;
  blueprint?: string;
}

const scrap = (n: number): Cost => [{ item: 'mat.scrap', count: n }];
const tiered = (s: number, t: number, b: number, re: number, nails = 0): Cost[] => [
  scrap(s),
  [{ item: 'mat.timber', count: t }, ...(nails ? [{ item: 'comp.nails', count: nails }] : [])],
  [{ item: 'mat.brick', count: b }],
  [{ item: 'mat.brick', count: Math.ceil(re / 2) }, { item: 'mat.scrap', count: re }],
];

const list: PieceDef[] = [
  { id: 'foundation', name: 'Foundation', desc: 'Level ground to build on. Everything stands on this.', kind: 'foundation', snap: 'cell', size: { w: 4, h: 0.4, d: 4 }, costs: tiered(8, 6, 8, 8), hp: 300, solid: true },
  { id: 'wall', name: 'Wall', desc: 'Four meters of keep-out.', kind: 'wall', snap: 'edge', size: { w: 4, h: 3, d: 0.3 }, costs: tiered(6, 4, 6, 6, 6), hp: 150, solid: true },
  { id: 'doorway', name: 'Doorway', desc: 'A wall with a door in it. Locks from the inside.', kind: 'wall', snap: 'edge', size: { w: 4, h: 3, d: 0.3 }, costs: tiered(7, 5, 6, 7, 6), hp: 120, solid: true, opening: true },
  { id: 'window', name: 'Window Wall', desc: 'A wall you can see out of. Glass extra, regret included.', kind: 'wall', snap: 'edge', size: { w: 4, h: 3, d: 0.3 }, costs: tiered(5, 4, 5, 6, 4).map((c) => [...c, { item: 'mat.glass', count: 1 }]), hp: 110, solid: true },
  { id: 'floor', name: 'Floor', desc: 'An upper floor. Needs walls underneath.', kind: 'floor', snap: 'cell', size: { w: 4, h: 0.25, d: 4 }, costs: tiered(6, 4, 6, 6, 4), hp: 150, solid: true },
  { id: 'roof', name: 'Roof', desc: 'Keeps rain out and morale in.', kind: 'roof', snap: 'cell', size: { w: 4, h: 0.4, d: 4 }, costs: tiered(6, 4, 5, 6, 4), hp: 120, solid: true },
  { id: 'stairs', name: 'Stairs', desc: 'One storey up. Mind the third step.', kind: 'stairs', snap: 'cell', size: { w: 4, h: 3, d: 4 }, costs: tiered(6, 5, 6, 6, 6), hp: 120, solid: false },
  { id: 'fence', name: 'Fence', desc: 'Waist-high. Stops livestock and lazy raiders.', kind: 'fence', snap: 'edge', size: { w: 4, h: 1.3, d: 0.2 }, costs: tiered(3, 2, 3, 4, 2), hp: 80, solid: true },
  { id: 'gate', name: 'Gate', desc: 'A fence that opens. Survivors close it behind them, usually.', kind: 'fence', snap: 'edge', size: { w: 4, h: 1.8, d: 0.2 }, costs: tiered(4, 3, 4, 5, 3), hp: 90, solid: true, opening: true },

  // Stations
  { id: 'campfire', name: 'Campfire', desc: 'Cooks food, boils water, gathers people.', kind: 'station', snap: 'free', size: { w: 1.4, h: 0.6, d: 1.4 }, costs: [[{ item: 'mat.timber', count: 3 }, { item: 'mat.brick', count: 3 }]], hp: 80, solid: false, station: 'campfire' },
  { id: 'workbench1', name: 'Workbench', desc: 'A sturdy table and a vise. The beginning of everything.', kind: 'station', snap: 'free', size: { w: 2, h: 1, d: 1 }, costs: [[{ item: 'mat.timber', count: 6 }, { item: 'mat.scrap', count: 4 }]], hp: 150, solid: true, station: 'workbench1' },
  { id: 'workbench2', name: 'Machinist’s Bench', desc: 'Drill press and grinder. Opens advanced tools and weapons.', kind: 'station', snap: 'free', size: { w: 2, h: 1.1, d: 1 }, costs: [[{ item: 'mat.scrap', count: 14 }, { item: 'mat.timber', count: 6 }, { item: 'comp.spring', count: 2 }, { item: 'mat.wiring', count: 4 }]], hp: 220, solid: true, station: 'workbench2', blueprint: 'bp.workbench2', rank: 2 },
  { id: 'workbench3', name: 'Grid Workshop', desc: 'Powered tools on Grid current. Builds the things that win.', kind: 'station', snap: 'free', size: { w: 2.4, h: 1.2, d: 1.2 }, costs: [[{ item: 'mat.scrap', count: 20 }, { item: 'mat.wiring', count: 10 }, { item: 'comp.circuit', count: 2 }, { item: 'comp.battery', count: 2 }]], hp: 300, solid: true, station: 'workbench3', blueprint: 'bp.workbench3', needsPower: true, rank: 4 },
  { id: 'kitchen', name: 'Kitchen', desc: 'A stove, a counter, a pot. Turns harvests into meals.', kind: 'station', snap: 'free', size: { w: 2, h: 1, d: 1 }, costs: [[{ item: 'mat.scrap', count: 10 }, { item: 'mat.brick', count: 6 }, { item: 'comp.fitting', count: 1 }]], hp: 180, solid: true, station: 'kitchen', rank: 2 },
  { id: 'chemlab', name: 'Chem Station', desc: 'Beakers, burners and a fume hood made from a range hood.', kind: 'station', snap: 'free', size: { w: 2, h: 1.1, d: 1 }, costs: [[{ item: 'mat.glass', count: 6 }, { item: 'mat.scrap', count: 8 }, { item: 'mat.chemicals', count: 4 }]], hp: 160, solid: true, station: 'chemlab', blueprint: 'bp.chemlab', rank: 3 },
  { id: 'bed', name: 'Bed', desc: 'Sleep here to pass the night and set your respawn point. Survivors claim beds as homes.', kind: 'station', snap: 'free', size: { w: 1, h: 0.6, d: 2 }, costs: [[{ item: 'mat.timber', count: 4 }, { item: 'mat.cloth', count: 6 }]], hp: 80, solid: false },
  { id: 'storage', name: 'Storage Crate', desc: 'Twenty-four slots. Reachable from any station nearby.', kind: 'station', snap: 'free', size: { w: 1.2, h: 0.8, d: 0.8 }, costs: [[{ item: 'mat.timber', count: 6 }, { item: 'comp.nails', count: 6 }]], hp: 100, solid: true, storageSlots: 24 },
  { id: 'farm_plot', name: 'Farm Plot', desc: 'Tilled bed of good soil. Plant, water, wait, eat.', kind: 'station', snap: 'free', size: { w: 3, h: 0.3, d: 3 }, costs: [[{ item: 'mat.timber', count: 4 }, { item: 'mat.organic', count: 6 }]], hp: 60, solid: false },
  { id: 'rain_collector', name: 'Rain Collector', desc: 'Tarp and barrel. Collects clean water when it rains, and slowly from dew.', kind: 'station', snap: 'free', size: { w: 1.2, h: 1.6, d: 1.2 }, costs: [[{ item: 'mat.plastic', count: 6 }, { item: 'mat.cloth', count: 4 }, { item: 'mat.scrap', count: 3 }]], hp: 70, solid: true, storageSlots: 1 },
  { id: 'coop', name: 'Chicken Coop', desc: 'Houses up to four chickens. Eggs every morning, gossip all day.', kind: 'station', snap: 'free', size: { w: 2, h: 1.4, d: 2 }, costs: [[{ item: 'mat.timber', count: 10 }, { item: 'comp.nails', count: 10 }, { item: 'mat.scrap', count: 4 }]], hp: 120, solid: true, rank: 2 },
  { id: 'pen', name: 'Livestock Pen', desc: 'Room for goats or pigs. Bring feed.', kind: 'station', snap: 'free', size: { w: 4, h: 1.2, d: 4 }, costs: [[{ item: 'mat.timber', count: 14 }, { item: 'comp.nails', count: 12 }]], hp: 140, solid: false, rank: 3 },
  { id: 'smoker', name: 'Smokehouse', desc: 'Preserves meat for weeks. Makes the whole yard smell like dinner.', kind: 'station', snap: 'free', size: { w: 1.4, h: 2, d: 1.4 }, costs: [[{ item: 'mat.brick', count: 8 }, { item: 'mat.scrap', count: 4 }]], hp: 140, solid: true, station: 'campfire', rank: 2 },

  // Defenses (placed from crafted items)
  { id: 'barricade', name: 'Spike Barricade', desc: 'Slows and damages anything that pushes through.', kind: 'defense', snap: 'free', size: { w: 2, h: 1.2, d: 1 }, costs: [[]], hp: 200, solid: true, fromItem: 'def.barricade' },
  { id: 'alarm', name: 'Alarm Bell', desc: 'Calls guards when raids arrive.', kind: 'defense', snap: 'free', size: { w: 0.8, h: 2.4, d: 0.8 }, costs: [[]], hp: 80, solid: true, fromItem: 'def.alarm_bell' },
  { id: 'turret', name: 'Scrap Turret', desc: 'Automated defense. Needs power and rifle rounds.', kind: 'defense', snap: 'free', size: { w: 1, h: 1.6, d: 1 }, costs: [[]], hp: 260, solid: true, fromItem: 'def.turret', needsPower: true },
  { id: 'floodlight', name: 'Floodlight', desc: 'Lights the yard. Reduces night spawns nearby.', kind: 'defense', snap: 'free', size: { w: 0.6, h: 3, d: 0.6 }, costs: [[]], hp: 60, solid: true, fromItem: 'def.floodlight', needsPower: true },

  // Traps
  { id: 'snare', name: 'Rope Snare', desc: 'Catches small game overnight.', kind: 'trap', snap: 'free', size: { w: 0.6, h: 0.2, d: 0.6 }, costs: [[]], hp: 20, solid: false, fromItem: 'trap.snare' },
  { id: 'bear_trap', name: 'Jaw Trap', desc: 'Pins an enemy in place for a few seconds.', kind: 'trap', snap: 'free', size: { w: 0.8, h: 0.2, d: 0.8 }, costs: [[]], hp: 60, solid: false, fromItem: 'trap.bear_trap' },
  { id: 'tripwire', name: 'Tripwire Alarm', desc: 'Rattles when something crosses.', kind: 'trap', snap: 'free', size: { w: 4, h: 0.3, d: 0.1 }, costs: [[]], hp: 10, solid: false, fromItem: 'trap.tripwire' },
  { id: 'spike_strip', name: 'Spike Strip', desc: 'Damages and slows anything that crosses.', kind: 'trap', snap: 'free', size: { w: 2, h: 0.2, d: 1 }, costs: [[]], hp: 120, solid: false, fromItem: 'trap.spike_pit' },
];

export const PIECES: readonly PieceDef[] = list;
export const PIECE_MAP: ReadonlyMap<string, PieceDef> = new Map(list.map((p) => [p.id, p]));
export function getPiece(id: string): PieceDef | undefined {
  return PIECE_MAP.get(id);
}
export function pieceHp(def: PieceDef, tier: Tier): number {
  return def.hp * (def.snap === 'free' ? 1 : TIER_HP_MULT[tier]);
}
export function pieceCost(def: PieceDef, tier: Tier): Cost {
  return def.costs[Math.min(tier, def.costs.length - 1)] ?? [];
}
export function tiersFor(def: PieceDef): Tier[] {
  return def.costs.length >= 4 ? [0, 1, 2, 3] : [0];
}
