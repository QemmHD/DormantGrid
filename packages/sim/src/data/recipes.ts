import type { RecipeDef, StationId } from '@dg/shared';

const list: RecipeDef[] = [];
type In = [string, number][];

function r(out: string, count: number, station: StationId, time: number, inputs: In, opts: { blueprint?: string; rank?: number; id?: string } = {}): void {
  list.push({
    id: opts.id ?? 'r.' + out + (count > 1 ? '.x' + count : ''),
    out,
    count,
    station,
    time,
    inputs: inputs.map(([item, c]) => ({ item, count: c })),
    blueprint: opts.blueprint,
    rank: opts.rank,
  });
}

// ---- Hands ----
r('comp.rope', 1, 'hands', 3, [['mat.cloth', 3]]);
r('comp.nails', 10, 'hands', 4, [['mat.scrap', 2]]);
r('med.bandage', 1, 'hands', 2, [['mat.cloth', 2]]);
r('med.splint', 1, 'hands', 3, [['mat.timber', 2], ['comp.rope', 1]]);
r('tool.hammer', 1, 'hands', 4, [['mat.timber', 2], ['mat.scrap', 2]]);
r('tool.crowbar', 1, 'hands', 5, [['mat.scrap', 4], ['mat.timber', 1]]);
r('wpn.pipe', 1, 'hands', 3, [['mat.scrap', 4], ['mat.cloth', 1]]);
r('wpn.knife', 1, 'hands', 3, [['mat.scrap', 2], ['mat.plastic', 1]]);
r('trap.snare', 1, 'hands', 3, [['comp.rope', 2], ['mat.timber', 1]]);
r('trap.tripwire', 1, 'hands', 3, [['comp.rope', 1], ['mat.scrap', 3]]);
r('misc.fertilizer', 1, 'hands', 3, [['mat.organic', 4]]);

// ---- Workbench I ----
r('tool.axe', 1, 'workbench1', 6, [['mat.scrap', 5], ['mat.timber', 3], ['comp.tape', 1]]);
r('tool.pickaxe', 1, 'workbench1', 6, [['mat.scrap', 7], ['mat.timber', 3]]);
r('tool.saw', 1, 'workbench1', 6, [['mat.scrap', 4], ['comp.spring', 1], ['mat.plastic', 2]]);
r('tool.hoe', 1, 'workbench1', 4, [['mat.scrap', 3], ['mat.timber', 3]]);
r('tool.watering_can', 1, 'workbench1', 4, [['mat.scrap', 4], ['comp.fitting', 1]]);
r('tool.flashlight', 1, 'workbench1', 5, [['mat.plastic', 3], ['mat.wiring', 2], ['comp.battery', 1], ['mat.glass', 1]]);
r('tool.repair_kit', 1, 'workbench1', 5, [['mat.scrap', 3], ['comp.tape', 1], ['mat.wiring', 1]]);
r('comp.tape', 1, 'workbench1', 3, [['mat.cloth', 2], ['mat.plastic', 1], ['mat.chemicals', 1]]);
r('comp.spring', 2, 'workbench1', 4, [['mat.scrap', 3]]);
r('comp.fitting', 2, 'workbench1', 4, [['mat.scrap', 3], ['mat.plastic', 1]]);
r('wpn.machete', 1, 'workbench1', 6, [['mat.scrap', 6], ['mat.cloth', 1], ['comp.tape', 1]]);
r('wpn.spiked_bat', 1, 'workbench1', 5, [['mat.timber', 4], ['comp.nails', 12]]);
r('wpn.spear', 1, 'workbench1', 5, [['mat.scrap', 5], ['mat.timber', 2], ['comp.tape', 1]]);
r('wpn.bow', 1, 'workbench1', 7, [['mat.timber', 4], ['comp.rope', 2]]);
r('ammo.arrow', 5, 'workbench1', 4, [['mat.timber', 2], ['mat.scrap', 1], ['misc.feather', 2]]);
r('ammo.arrow', 3, 'workbench1', 4, [['mat.timber', 2], ['mat.scrap', 1], ['mat.plastic', 1]], { id: 'r.ammo.arrow.plastic' });
r('trap.spike_pit', 1, 'workbench1', 6, [['mat.timber', 4], ['mat.scrap', 6]]);
r('def.barricade', 1, 'workbench1', 8, [['mat.timber', 8], ['mat.scrap', 6], ['comp.rope', 1]]);
r('def.alarm_bell', 1, 'workbench1', 6, [['mat.scrap', 8], ['comp.rope', 2]]);
r('med.clean_bandage', 1, 'campfire', 4, [['mat.cloth', 2], ['drink.clean_water', 1]]);
r('mat.cloth', 3, 'workbench1', 5, [['misc.hide', 1]]);

// ---- Workbench II (blueprint) ----
r('tool.torch', 1, 'workbench2', 10, [['mat.scrap', 6], ['comp.fitting', 2], ['comp.fuel', 1], ['mat.wiring', 2]], { rank: 3 });
r('wpn.sledge', 1, 'workbench2', 8, [['mat.scrap', 10], ['mat.timber', 3]]);
r('wpn.crossbow', 1, 'workbench2', 10, [['mat.timber', 4], ['comp.spring', 3], ['mat.scrap', 4], ['comp.rope', 1]], { blueprint: 'bp.crossbow' });
r('ammo.bolt', 5, 'workbench2', 4, [['mat.scrap', 2], ['mat.plastic', 1]]);
r('wpn.nailgun', 1, 'workbench2', 12, [['mat.scrap', 6], ['mat.wiring', 4], ['comp.battery', 2], ['mat.plastic', 3]], { blueprint: 'bp.nailgun' });
r('ammo.nail_mag', 1, 'workbench2', 3, [['comp.nails', 20], ['mat.plastic', 1]]);
r('trap.bear_trap', 1, 'workbench2', 8, [['mat.scrap', 8], ['comp.spring', 2]]);
r('comp.battery', 1, 'workbench2', 6, [['mat.chemicals', 2], ['mat.scrap', 1], ['mat.plastic', 1]]);
r('comp.fuel', 1, 'workbench2', 6, [['mat.chemicals', 3], ['mat.organic', 4]]);
r('def.floodlight', 1, 'workbench2', 8, [['mat.glass', 2], ['mat.wiring', 4], ['mat.scrap', 4]], { rank: 2 });

// ---- Workbench III (Grid Workshop) ----
r('wpn.scrap_rifle', 1, 'workbench3', 14, [['mat.scrap', 12], ['comp.spring', 2], ['mat.timber', 2], ['comp.fitting', 2]], { blueprint: 'bp.scrap_rifle' });
r('ammo.rifle_round', 6, 'workbench3', 5, [['mat.scrap', 2], ['mat.chemicals', 2]]);
r('def.turret', 1, 'workbench3', 18, [['mat.scrap', 14], ['mat.wiring', 6], ['comp.circuit', 2], ['comp.battery', 2]], { blueprint: 'bp.turret' });
r('comp.circuit', 1, 'workbench3', 8, [['mat.wiring', 4], ['mat.plastic', 2], ['mat.chemicals', 1]], { rank: 4 });
r('misc.grid_fuse', 1, 'workbench3', 8, [['mat.wiring', 3], ['mat.brick', 1], ['comp.circuit', 1]], { rank: 5 });

// ---- Campfire ----
r('drink.clean_water', 1, 'campfire', 4, [['drink.dirty_water', 1]]);
r('food.cooked_meat', 1, 'campfire', 6, [['food.raw_meat', 1]]);
r('food.smoked_meat', 2, 'campfire', 14, [['food.raw_meat', 2], ['mat.timber', 1]]);
r('food.baked_potato', 1, 'campfire', 5, [['food.potato', 1]]);
r('food.flatbread', 2, 'campfire', 6, [['food.flour', 1], ['drink.clean_water', 1]]);
r('drink.herbal_tea', 1, 'campfire', 4, [['drink.clean_water', 1], ['mat.organic', 1]]);

// ---- Kitchen ----
r('food.flour', 1, 'kitchen', 4, [['food.wheat', 3]]);
r('food.omelette', 1, 'kitchen', 6, [['food.egg', 2], ['food.cabbage', 1]]);
r('food.veg_soup', 2, 'kitchen', 8, [['drink.clean_water', 1], ['food.carrot', 1], ['food.potato', 1], ['food.tomato', 1]]);
r('food.stew', 2, 'kitchen', 10, [['food.raw_meat', 1], ['food.potato', 2], ['drink.clean_water', 1]]);
r('food.cheese', 1, 'kitchen', 12, [['food.milk', 2]]);
r('food.jam', 1, 'kitchen', 8, [['food.berries', 4], ['mat.glass', 1]], { blueprint: 'bp.canning' });
r('food.canned_veg', 2, 'kitchen', 10, [['food.carrot', 1], ['food.corn', 1], ['food.cabbage', 1], ['mat.glass', 1]], { blueprint: 'bp.canning' });
r('misc.feed', 3, 'kitchen', 4, [['food.wheat', 2], ['mat.organic', 2]]);
r('med.poultice', 1, 'kitchen', 4, [['mat.organic', 3], ['mat.cloth', 1]]);

// ---- Chem lab ----
r('med.disinfectant', 2, 'chemlab', 6, [['mat.chemicals', 2], ['drink.clean_water', 1]]);
r('med.painkillers', 3, 'chemlab', 8, [['mat.chemicals', 2], ['mat.organic', 2]]);
r('med.antibiotics', 2, 'chemlab', 14, [['mat.chemicals', 3], ['mat.organic', 2], ['drink.clean_water', 1]], { blueprint: 'bp.antibiotics' });
r('med.first_aid', 1, 'chemlab', 10, [['med.clean_bandage', 2], ['med.disinfectant', 1], ['med.splint', 1], ['mat.plastic', 2]]);

export const RECIPES: readonly RecipeDef[] = list;
export const RECIPE_MAP: ReadonlyMap<string, RecipeDef> = new Map(list.map((x) => [x.id, x]));

export function recipesFor(station: StationId): RecipeDef[] {
  return list.filter((x) => x.station === station);
}

/** Station hierarchy: a higher workbench can craft lower-tier recipes. */
export function stationSatisfies(have: StationId, need: StationId): boolean {
  if (need === 'hands') return true;
  if (have === need) return true;
  const wb = ['workbench1', 'workbench2', 'workbench3'];
  const hi = wb.indexOf(have);
  const ni = wb.indexOf(need);
  if (hi >= 0 && ni >= 0) return hi >= ni;
  // a kitchen includes a campfire's capabilities
  if (have === 'kitchen' && need === 'campfire') return true;
  return false;
}
