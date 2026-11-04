// Salvage yields for props and building pieces, and container loot by lot type.

import type { DistrictKey, LotType, PropKind, ToolTier } from '@dg/shared';

export interface Yield {
  item: string;
  min: number;
  max: number;
  chance?: number; // default 1
}

export interface SalvageDef {
  /** minimum tool tier able to break it */
  tool: ToolTier;
  /** best tool (gets full speed) */
  best: ToolTier;
  /** seconds with hands-level speed */
  time: number;
  /** relative weight for hitstop/shake 0..1 */
  weight: number;
  /** sound/particle material */
  sfx: 'metal' | 'wood' | 'stone' | 'glass' | 'cloth' | 'foliage' | 'plastic';
  yields: Yield[];
  /** can also be searched for container loot */
  container?: boolean;
}

const Y = (item: string, min: number, max = min, chance?: number): Yield => ({ item, min, max, chance });

export const PROP_SALVAGE: Record<PropKind, SalvageDef> = {
  car: { tool: 'crowbar', best: 'torch', time: 7, weight: 1, sfx: 'metal', yields: [Y('mat.scrap', 6, 10), Y('mat.glass', 1, 3), Y('mat.plastic', 2, 4), Y('mat.wiring', 1, 2), Y('comp.spring', 1, 2, 0.6), Y('comp.battery', 1, 1, 0.3), Y('comp.fuel', 1, 1, 0.25)], container: true },
  van: { tool: 'crowbar', best: 'torch', time: 8, weight: 1, sfx: 'metal', yields: [Y('mat.scrap', 8, 12), Y('mat.glass', 1, 2), Y('mat.plastic', 2, 4), Y('mat.wiring', 1, 3), Y('comp.spring', 1, 2, 0.5), Y('comp.fuel', 1, 1, 0.3)], container: true },
  bus: { tool: 'saw', best: 'torch', time: 12, weight: 1, sfx: 'metal', yields: [Y('mat.scrap', 14, 20), Y('mat.glass', 3, 6), Y('mat.plastic', 4, 8), Y('mat.cloth', 2, 4), Y('mat.wiring', 2, 4)] },
  tree: { tool: 'axe', best: 'axe', time: 5, weight: 0.7, sfx: 'wood', yields: [Y('mat.timber', 5, 9), Y('mat.organic', 1, 3)] },
  pine: { tool: 'axe', best: 'axe', time: 5, weight: 0.7, sfx: 'wood', yields: [Y('mat.timber', 6, 10), Y('mat.organic', 1, 2)] },
  bush: { tool: 'hands', best: 'axe', time: 1.5, weight: 0.15, sfx: 'foliage', yields: [Y('mat.organic', 2, 4), Y('food.berries', 1, 3, 0.35)] },
  rock: { tool: 'pickaxe', best: 'pickaxe', time: 5, weight: 0.8, sfx: 'stone', yields: [Y('mat.brick', 4, 7), Y('mat.scrap', 1, 1, 0.2)] },
  rubble: { tool: 'hands', best: 'pickaxe', time: 2.5, weight: 0.5, sfx: 'stone', yields: [Y('mat.brick', 2, 4), Y('mat.scrap', 0, 2), Y('mat.glass', 0, 1)] },
  barrel: { tool: 'hands', best: 'crowbar', time: 2, weight: 0.4, sfx: 'metal', yields: [Y('mat.scrap', 2, 3), Y('mat.chemicals', 1, 2, 0.5), Y('drink.dirty_water', 1, 2, 0.3)] },
  crate: { tool: 'hands', best: 'crowbar', time: 1.5, weight: 0.3, sfx: 'wood', yields: [Y('mat.timber', 2, 3), Y('comp.nails', 2, 6)], container: true },
  dumpster: { tool: 'crowbar', best: 'torch', time: 6, weight: 0.9, sfx: 'metal', yields: [Y('mat.scrap', 6, 9), Y('mat.plastic', 2, 4), Y('mat.organic', 1, 3)], container: true },
  bench: { tool: 'hands', best: 'saw', time: 2.5, weight: 0.4, sfx: 'wood', yields: [Y('mat.timber', 2, 4), Y('mat.scrap', 1, 2)] },
  streetlight: { tool: 'saw', best: 'torch', time: 5, weight: 0.8, sfx: 'metal', yields: [Y('mat.scrap', 4, 6), Y('mat.wiring', 2, 3), Y('mat.glass', 1, 2)] },
  sign: { tool: 'hands', best: 'crowbar', time: 2, weight: 0.35, sfx: 'metal', yields: [Y('mat.scrap', 2, 3), Y('mat.plastic', 0, 2)] },
  hydrant: { tool: 'crowbar', best: 'torch', time: 4, weight: 0.6, sfx: 'metal', yields: [Y('mat.scrap', 3, 4), Y('comp.fitting', 1, 2)] },
  fence: { tool: 'hands', best: 'saw', time: 2, weight: 0.3, sfx: 'wood', yields: [Y('mat.timber', 2, 3), Y('comp.nails', 1, 4)] },
  pallet: { tool: 'hands', best: 'crowbar', time: 1.5, weight: 0.25, sfx: 'wood', yields: [Y('mat.timber', 2, 3), Y('comp.nails', 2, 5)] },
  tire: { tool: 'hands', best: 'saw', time: 2, weight: 0.3, sfx: 'plastic', yields: [Y('mat.plastic', 2, 3), Y('mat.scrap', 0, 1)] },
  trashbag: { tool: 'hands', best: 'hands', time: 0.8, weight: 0.1, sfx: 'cloth', yields: [Y('mat.plastic', 1, 2), Y('mat.organic', 1, 2), Y('mat.cloth', 0, 1), Y('food.crackers', 1, 1, 0.12), Y('drink.soda', 1, 1, 0.08)] },
  mailbox: { tool: 'hands', best: 'crowbar', time: 1.5, weight: 0.3, sfx: 'metal', yields: [Y('mat.scrap', 1, 2), Y('misc.lore_tape', 1, 1, 0.05)] },
  container: { tool: 'torch', best: 'torch', time: 14, weight: 1, sfx: 'metal', yields: [Y('mat.scrap', 18, 26)], container: true },
  pipe: { tool: 'saw', best: 'saw', time: 3, weight: 0.5, sfx: 'metal', yields: [Y('mat.scrap', 2, 4), Y('comp.fitting', 1, 2)] },
  haybale: { tool: 'hands', best: 'hands', time: 1.5, weight: 0.2, sfx: 'foliage', yields: [Y('mat.organic', 4, 6), Y('misc.feed', 1, 2, 0.5)] },
  stump: { tool: 'axe', best: 'axe', time: 3, weight: 0.5, sfx: 'wood', yields: [Y('mat.timber', 2, 3), Y('mat.organic', 1, 2)] },
  locker: { tool: 'crowbar', best: 'crowbar', time: 3, weight: 0.5, sfx: 'metal', yields: [Y('mat.scrap', 3, 4)], container: true },
  shelf: { tool: 'hands', best: 'saw', time: 2, weight: 0.4, sfx: 'wood', yields: [Y('mat.timber', 2, 3), Y('mat.scrap', 0, 2)], container: true },
  table: { tool: 'hands', best: 'saw', time: 2, weight: 0.4, sfx: 'wood', yields: [Y('mat.timber', 3, 4), Y('comp.nails', 1, 3)] },
  chair: { tool: 'hands', best: 'saw', time: 1.2, weight: 0.2, sfx: 'wood', yields: [Y('mat.timber', 1, 2), Y('mat.cloth', 0, 1)] },
  bed: { tool: 'hands', best: 'saw', time: 3, weight: 0.5, sfx: 'cloth', yields: [Y('mat.cloth', 3, 5), Y('comp.spring', 1, 3), Y('mat.timber', 1, 2)] },
  cabinet: { tool: 'hands', best: 'crowbar', time: 2, weight: 0.4, sfx: 'wood', yields: [Y('mat.timber', 2, 3), Y('mat.glass', 0, 1)], container: true },
  sofa: { tool: 'hands', best: 'saw', time: 3, weight: 0.5, sfx: 'cloth', yields: [Y('mat.cloth', 3, 6), Y('comp.spring', 1, 2), Y('mat.timber', 1, 2)] },
  fridge: { tool: 'crowbar', best: 'saw', time: 4, weight: 0.7, sfx: 'metal', yields: [Y('mat.scrap', 4, 6), Y('mat.plastic', 2, 3), Y('mat.chemicals', 1, 1, 0.5)], container: true },
  stove: { tool: 'crowbar', best: 'torch', time: 4, weight: 0.7, sfx: 'metal', yields: [Y('mat.scrap', 5, 7), Y('comp.fitting', 1, 1, 0.5)] },
  terminal: { tool: 'crowbar', best: 'saw', time: 3, weight: 0.4, sfx: 'plastic', yields: [Y('mat.wiring', 2, 4), Y('comp.circuit', 1, 1, 0.4), Y('mat.plastic', 1, 2), Y('misc.lore_tape', 1, 1, 0.25)] },
  debris: { tool: 'hands', best: 'hands', time: 0.6, weight: 0.15, sfx: 'stone', yields: [Y('mat.brick', 1, 2), Y('mat.scrap', 0, 1), Y('mat.timber', 0, 1)] },
};

/** Building pieces derived by worldgen; key = piece kind. */
export type BuildingPieceKind = 'wall' | 'floor' | 'roof' | 'door' | 'window' | 'beam' | 'pipe' | 'fixture';
export const BUILDING_SALVAGE: Record<BuildingPieceKind, SalvageDef> = {
  wall: { tool: 'pickaxe', best: 'pickaxe', time: 6, weight: 0.9, sfx: 'stone', yields: [Y('mat.brick', 4, 6), Y('mat.timber', 0, 2)] },
  floor: { tool: 'saw', best: 'saw', time: 6, weight: 0.8, sfx: 'wood', yields: [Y('mat.timber', 4, 6), Y('comp.nails', 2, 5)] },
  roof: { tool: 'saw', best: 'saw', time: 6, weight: 0.8, sfx: 'wood', yields: [Y('mat.timber', 3, 5), Y('mat.scrap', 1, 3)] },
  door: { tool: 'crowbar', best: 'crowbar', time: 3, weight: 0.5, sfx: 'wood', yields: [Y('mat.timber', 2, 3), Y('mat.scrap', 1, 1)] },
  window: { tool: 'crowbar', best: 'crowbar', time: 2.5, weight: 0.3, sfx: 'glass', yields: [Y('mat.glass', 1, 3), Y('mat.timber', 0, 1)] },
  beam: { tool: 'torch', best: 'torch', time: 8, weight: 1, sfx: 'metal', yields: [Y('mat.scrap', 6, 9)] },
  pipe: { tool: 'saw', best: 'saw', time: 3, weight: 0.4, sfx: 'metal', yields: [Y('comp.fitting', 1, 2), Y('mat.scrap', 1, 2)] },
  fixture: { tool: 'crowbar', best: 'crowbar', time: 2, weight: 0.3, sfx: 'plastic', yields: [Y('mat.wiring', 1, 3), Y('mat.glass', 0, 1), Y('mat.plastic', 1, 1)] },
};

/** Searchable container loot by lot type. */
export const CONTAINER_LOOT: Record<LotType, Yield[]> = {
  house: [Y('food.canned_beans', 1, 2, 0.35), Y('drink.soda', 1, 1, 0.2), Y('med.bandage', 1, 2, 0.25), Y('mat.cloth', 1, 3, 0.6), Y('seed.carrot', 2, 4, 0.12), Y('seed.potato', 2, 3, 0.1), Y('tool.hoe', 1, 1, 0.03)],
  apartment: [Y('food.crackers', 1, 2, 0.4), Y('food.canned_beans', 1, 1, 0.25), Y('med.painkillers', 1, 2, 0.15), Y('mat.cloth', 1, 2, 0.5), Y('comp.battery', 1, 1, 0.1), Y('misc.lore_tape', 1, 1, 0.04)],
  shop: [Y('food.canned_beans', 1, 3, 0.45), Y('drink.soda', 1, 2, 0.35), Y('food.crackers', 1, 2, 0.35), Y('comp.tape', 1, 1, 0.2), Y('seed.corn', 2, 3, 0.1), Y('seed.wheat', 2, 4, 0.1), Y('seed.cabbage', 2, 3, 0.08)],
  office: [Y('mat.wiring', 1, 3, 0.5), Y('comp.circuit', 1, 1, 0.1), Y('mat.plastic', 1, 2, 0.5), Y('misc.lore_tape', 1, 1, 0.12), Y('bp.workbench2', 1, 1, 0.02)],
  warehouse: [Y('mat.scrap', 2, 5, 0.7), Y('comp.rope', 1, 2, 0.3), Y('comp.tape', 1, 2, 0.25), Y('comp.nails', 5, 15, 0.4), Y('tool.saw', 1, 1, 0.04), Y('tool.axe', 1, 1, 0.04)],
  factory: [Y('mat.chemicals', 1, 3, 0.5), Y('comp.spring', 1, 2, 0.35), Y('comp.fitting', 1, 2, 0.35), Y('comp.fuel', 1, 1, 0.15), Y('tool.pickaxe', 1, 1, 0.04), Y('bp.nailgun', 1, 1, 0.02)],
  clinic: [Y('med.bandage', 1, 3, 0.55), Y('med.disinfectant', 1, 1, 0.3), Y('med.antibiotics', 1, 1, 0.12), Y('med.painkillers', 1, 2, 0.35), Y('med.splint', 1, 1, 0.2), Y('bp.antibiotics', 1, 1, 0.03), Y('bp.chemlab', 1, 1, 0.03)],
  pumphouse: [Y('comp.fitting', 1, 3, 0.6), Y('drink.clean_water', 1, 2, 0.3), Y('mat.chemicals', 1, 2, 0.3), Y('misc.grid_fuse', 1, 1, 0.06)],
  depot: [Y('mat.scrap', 3, 6, 0.6), Y('comp.fuel', 1, 1, 0.25), Y('ammo.rifle_round', 2, 5, 0.12), Y('comp.rope', 1, 2, 0.3), Y('bp.crossbow', 1, 1, 0.03)],
  barn: [Y('seed.wheat', 3, 6, 0.4), Y('seed.potato', 2, 4, 0.3), Y('seed.pumpkin', 2, 3, 0.15), Y('seed.tomato', 2, 3, 0.15), Y('misc.feed', 2, 4, 0.4), Y('tool.hoe', 1, 1, 0.08), Y('tool.watering_can', 1, 1, 0.06)],
  shelter: [Y('food.canned_beans', 1, 2, 0.5), Y('drink.clean_water', 1, 2, 0.5), Y('med.bandage', 1, 2, 0.4), Y('bp.canning', 1, 1, 0.04), Y('bp.reinforced', 1, 1, 0.01)],
};

/** Yield multiplier by district (richer/riskier districts pay more). */
export const DISTRICT_YIELD: Record<DistrictKey, number> = {
  haven: 0.8,
  residential: 1,
  outskirts: 1,
  market: 1.1,
  downtown: 1.2,
  waterworks: 1.15,
  rail: 1.2,
  hospital: 1.25,
  industrial: 1.3,
};

/** Tool tier order for gating. */
export const TOOL_ORDER: Record<ToolTier, number> = { hands: 0, crowbar: 1, axe: 1, pickaxe: 2, saw: 2, torch: 3 };

/** Can this tool break something that requires `need`? Specialized tools only satisfy their own lane; torch satisfies all. */
export function toolCanBreak(have: ToolTier, need: ToolTier): boolean {
  if (need === 'hands') return true;
  if (have === need || have === 'torch') return true;
  if (need === 'crowbar') return have === 'saw' || have === 'pickaxe' || have === 'axe';
  return false;
}
