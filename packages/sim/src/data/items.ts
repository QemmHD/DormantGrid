// Item catalogue. Every item: id, name, desc, icon, valid data.
// Voice: dry, specific, human. No brands.

import type { ConditionId, FoodInfo, ItemCategory, ItemDef, ToolInfo, WeaponInfo } from '@dg/shared';

const defs: ItemDef[] = [];

function item(
  id: string,
  name: string,
  desc: string,
  category: ItemCategory,
  weight: number,
  stack: number,
  extra: Partial<ItemDef> = {},
): void {
  defs.push({ id, name, desc, category, weight, stack, icon: 'icon.' + id, ...extra });
}
const tool = (t: ToolInfo) => ({ tool: t });
const wpn = (w: WeaponInfo) => ({ weapon: w });
const food = (f: FoodInfo) => ({ food: f });
const heal = (health: number, cures: ConditionId[] = []) => ({ heals: { health, cures } });

// ---- Materials (the nine) ----
item('mat.scrap', 'Scrap Metal', 'Bent, rusted, and endlessly useful. The city left a lot of it lying around.', 'material', 0.5, 50);
item('mat.timber', 'Timber', 'Salvaged planks and beams. Smells like an old house.', 'material', 0.6, 50);
item('mat.brick', 'Brick & Concrete', 'Heavy chunks of other people’s walls. Good for building your own.', 'material', 1.2, 40);
item('mat.glass', 'Glass', 'Panes that survived. Carry them like they matter, because they do.', 'material', 0.4, 30);
item('mat.cloth', 'Cloth', 'Curtains, shirts, a flag nobody salutes anymore.', 'material', 0.1, 50);
item('mat.wiring', 'Wiring & Electronics', 'Copper, boards, and the occasional mystery chip. The Grid ran on this.', 'material', 0.2, 50);
item('mat.plastic', 'Plastic', 'It will outlive all of us. Might as well use it.', 'material', 0.15, 50);
item('mat.chemicals', 'Chemicals', 'Cleaners, solvents, fertilizer. Read the label if there is one.', 'material', 0.4, 30);
item('mat.organic', 'Organic Matter', 'Leaves, scraps, compostables. Dirt’s favorite meal.', 'material', 0.2, 50);

// ---- Components ----
item('comp.nails', 'Nails', 'A fistful of straightened nails. Somebody spent an evening on these.', 'material', 0.05, 99);
item('comp.rope', 'Rope', 'Braided cloth strips. Holds a load, holds a knot, holds a grudge.', 'material', 0.3, 20);
item('comp.tape', 'Duct Tape', 'Half a roll. The other half is holding the city together.', 'material', 0.1, 20);
item('comp.spring', 'Spring', 'Pulled from a mattress or a garage door. Still has opinions.', 'material', 0.1, 30);
item('comp.battery', 'Battery Cell', 'Holds a charge if you ask it nicely and keep it dry.', 'material', 0.3, 20);
item('comp.circuit', 'Circuit Board', 'Grid-standard control board. The little lights used to mean something.', 'material', 0.1, 20);
item('comp.fitting', 'Pipe Fitting', 'Elbows, valves and couplers. Plumbing is just Lego with consequences.', 'material', 0.3, 30);
item('comp.fuel', 'Fuel Canister', 'Siphoned and sloshing. Keep it away from your campfire and your enemies.', 'material', 1, 10);

// ---- Tools ----
item('tool.crowbar', 'Crowbar', 'Opens doors, crates, and arguments. Pries fixtures loose twice as fast as hands.', 'tool', 1.5, 1, tool({ tier: 'crowbar', speed: 1.6, durability: 300 }));
item('tool.axe', 'Scrap Axe', 'A road-sign blade on a broom handle. Fells trees and furniture without complaint.', 'tool', 2, 1, tool({ tier: 'axe', speed: 1.8, durability: 260 }));
item('tool.pickaxe', 'Pickaxe', 'For brick, concrete, and rock. Your shoulders will remember every swing.', 'tool', 2.5, 1, tool({ tier: 'pickaxe', speed: 1.8, durability: 320 }));
item('tool.saw', 'Hacksaw', 'Cuts beams, pipes and car doors cleanly. Patience sold separately.', 'tool', 1, 1, tool({ tier: 'saw', speed: 2.2, durability: 240 }));
item('tool.torch', 'Cutting Torch', 'Fuel, oxygen and a steady hand. Takes apart anything the Grid built.', 'tool', 3, 1, tool({ tier: 'torch', speed: 3, durability: 200 }));
item('tool.hammer', 'Builder’s Hammer', 'Required to place and repair structures. Also good for thinking with.', 'tool', 1, 1, tool({ tier: 'hands', speed: 1, durability: 500 }));
item('tool.hoe', 'Garden Hoe', 'Tills soil for farm plots. Older than the Grid and more reliable.', 'tool', 1.2, 1, tool({ tier: 'hands', speed: 1, durability: 400 }));
item('tool.watering_can', 'Watering Can', 'Waters a whole plot in one pour. The spout leaks a little, like everyone.', 'tool', 0.8, 1, tool({ tier: 'hands', speed: 1, durability: 600 }));
item('tool.flashlight', 'Flashlight', 'Pushes back the dark. Also tells everything in the dark exactly where you are.', 'tool', 0.4, 1, tool({ tier: 'hands', speed: 1, durability: 800 }));
item('tool.repair_kit', 'Repair Kit', 'Restores durability on one tool or weapon. Tape, wire, and optimism.', 'tool', 0.8, 5);

// ---- Melee weapons ----
item('wpn.knife', 'Kitchen Knife', 'Quick and quiet. Also the only way to butcher game properly.', 'weapon', 0.3, 1, wpn({ kind: 'melee', damage: 14, cooldown: 0.45, stamina: 6, range: 1.6, durability: 200 }));
item('wpn.pipe', 'Lead Pipe', 'Heavy, honest, and already at hand. Every survivor’s first weapon.', 'weapon', 1.8, 1, wpn({ kind: 'melee', damage: 20, cooldown: 0.7, stamina: 10, range: 2, durability: 300 }));
item('wpn.machete', 'Machete', 'Clears brush and bad intentions. Keep it sharp.', 'weapon', 1, 1, wpn({ kind: 'melee', damage: 26, cooldown: 0.6, stamina: 9, range: 2.1, durability: 260 }));
item('wpn.spiked_bat', 'Spiked Bat', 'A bat with nails in it. Subtle as a brass band.', 'weapon', 1.4, 1, wpn({ kind: 'melee', damage: 30, cooldown: 0.75, stamina: 12, range: 2.1, durability: 220 }));
item('wpn.spear', 'Rebar Spear', 'Reach beats bravery. Keeps hounds at a polite distance.', 'weapon', 1.6, 1, wpn({ kind: 'melee', damage: 24, cooldown: 0.65, stamina: 10, range: 2.8, durability: 240 }));
item('wpn.sledge', 'Sledgehammer', 'Staggers anything with legs or treads. Slow enough to regret a miss.', 'weapon', 4, 1, wpn({ kind: 'melee', damage: 48, cooldown: 1.25, stamina: 22, range: 2.2, durability: 400 }));

// ---- Ranged + ammo ----
item('wpn.bow', 'Recurve Bow', 'Quiet, cheap, recoverable arrows. The hunter’s first friend.', 'weapon', 1, 1, wpn({ kind: 'ranged', damage: 28, cooldown: 0.9, stamina: 8, range: 40, ammo: 'ammo.arrow', durability: 250 }));
item('wpn.crossbow', 'Crossbow', 'Spring-steel limbs from a car suspension. Hits like an apology you can’t refuse.', 'weapon', 2.5, 1, wpn({ kind: 'ranged', damage: 46, cooldown: 1.6, stamina: 4, range: 50, ammo: 'ammo.bolt', durability: 300 }));
item('wpn.nailgun', 'Rigged Nail Gun', 'Battery-fed, mag-loaded, overclocked. Voids every warranty that ever existed.', 'weapon', 2.2, 1, wpn({ kind: 'ranged', damage: 16, cooldown: 0.22, stamina: 1, range: 22, ammo: 'ammo.nail_mag', durability: 260 }));
item('wpn.scrap_rifle', 'Scrap Rifle', 'Pipe barrel, hand-turned bolt. Loud enough to bring the whole street.', 'weapon', 3.5, 1, wpn({ kind: 'ranged', damage: 70, cooldown: 1.4, stamina: 2, range: 80, ammo: 'ammo.rifle_round', durability: 200 }));
item('ammo.arrow', 'Arrow', 'Fletched with cloth. Often recoverable, if you’re brave.', 'ammo', 0.05, 40);
item('ammo.bolt', 'Crossbow Bolt', 'Rebar point, plastic vanes.', 'ammo', 0.08, 30);
item('ammo.nail_mag', 'Nail Magazine', 'A strip of 20 nails for the rigged nail gun.', 'ammo', 0.2, 10);
item('ammo.rifle_round', 'Rifle Round', 'Hand-packed. Count them. Then count them again.', 'ammo', 0.04, 30);

// ---- Medicine ----
item('med.bandage', 'Rag Bandage', 'Stops bleeding. Not clean enough to stop infection.', 'medicine', 0.1, 10, heal(5, ['bleeding']));
item('med.clean_bandage', 'Clean Bandage', 'Boiled cloth. Stops bleeding and keeps wounds honest.', 'medicine', 0.1, 10, heal(10, ['bleeding', 'infected']));
item('med.splint', 'Splint', 'Two boards and some rope. Sets a fracture so you can walk like a person again.', 'medicine', 0.6, 5, heal(5, ['fracture']));
item('med.disinfectant', 'Disinfectant', 'Stings in a way that means it’s working.', 'medicine', 0.3, 10, heal(0, ['infected']));
item('med.antibiotics', 'Antibiotics', 'Clinic-grade pills. Cures sickness and infection. Worth more than gold, which is worth nothing.', 'medicine', 0.05, 10, heal(10, ['sick', 'infected']));
item('med.painkillers', 'Painkillers', 'Takes the edge off. Restores a little health and a lot of morale.', 'medicine', 0.05, 20, heal(20));
item('med.poultice', 'Herbal Poultice', 'Crushed garden herbs in cloth. Grandmother-approved, mildly effective.', 'medicine', 0.1, 10, heal(12, ['sick']));
item('med.first_aid', 'First Aid Kit', 'Everything a careful person keeps in one box. Restores health and treats most things.', 'medicine', 0.8, 5, heal(50, ['bleeding', 'infected', 'fracture']));

// ---- Food & drink ----
item('food.canned_beans', 'Canned Beans', 'Pre-collapse beans. Ageless. Mildly dented.', 'food', 0.4, 10, food({ hunger: 30, thirst: -2, group: 'protein' }));
item('food.crackers', 'Stale Crackers', 'Salty, dry, and somehow still crunchy.', 'food', 0.2, 10, food({ hunger: 12, thirst: -6, group: 'grain' }));
item('food.raw_meat', 'Raw Meat', 'Cook it. Seriously.', 'food', 0.5, 10, food({ hunger: 10, thirst: 0, group: 'protein', spoilHours: 36, sickness: 0.55 }));
item('food.cooked_meat', 'Grilled Meat', 'Char on the outside, dinner on the inside.', 'food', 0.4, 10, food({ hunger: 35, thirst: -3, group: 'protein', spoilHours: 72 }));
item('food.smoked_meat', 'Smoked Meat', 'Keeps for weeks. Tastes like a campfire story.', 'food', 0.3, 20, food({ hunger: 30, thirst: -5, group: 'protein', spoilHours: 480 }));
item('food.egg', 'Egg', 'Fresh from the coop. The chickens want you to know they worked hard.', 'food', 0.06, 12, food({ hunger: 6, thirst: 0, group: 'protein', spoilHours: 120, sickness: 0.15 }));
item('food.omelette', 'Omelette', 'Eggs, greens, a pan. Civilization in one dish.', 'food', 0.3, 5, food({ hunger: 32, thirst: 2, group: 'protein', spoilHours: 48 }));
item('food.milk', 'Goat Milk', 'Warm, rich, and short-lived.', 'drink', 0.5, 5, food({ hunger: 8, thirst: 20, group: 'protein', spoilHours: 36 }));
item('food.cheese', 'Goat Cheese', 'Milk with patience. Lasts much longer.', 'food', 0.3, 10, food({ hunger: 22, thirst: -4, group: 'protein', spoilHours: 360 }));
item('food.potato', 'Potato', 'Edible raw if you hate yourself. Better baked.', 'food', 0.2, 20, food({ hunger: 8, thirst: 0, group: 'veg', spoilHours: 360 }));
item('food.baked_potato', 'Baked Potato', 'Crisp skin, soft heart. Like most of the people in Haven.', 'food', 0.2, 10, food({ hunger: 25, thirst: 0, group: 'veg', spoilHours: 72 }));
item('food.carrot', 'Carrot', 'Crunchy, orange, honest.', 'food', 0.1, 20, food({ hunger: 10, thirst: 3, group: 'veg', spoilHours: 240 }));
item('food.tomato', 'Tomato', 'Sun-warm and splitting at the seams.', 'food', 0.15, 20, food({ hunger: 8, thirst: 8, group: 'fruit', spoilHours: 96 }));
item('food.corn', 'Corn', 'Sweet if picked young. Starchy if picked late. Either way, food.', 'food', 0.25, 20, food({ hunger: 14, thirst: 0, group: 'grain', spoilHours: 168 }));
item('food.cabbage', 'Cabbage', 'A cannonball of leaves. Survives frost and insults.', 'food', 0.6, 10, food({ hunger: 14, thirst: 5, group: 'veg', spoilHours: 300 }));
item('food.pumpkin', 'Pumpkin', 'Heavy, cheerful, keeps through winter.', 'food', 2, 5, food({ hunger: 30, thirst: 4, group: 'veg', spoilHours: 600 }));
item('food.wheat', 'Wheat Bundle', 'Not food yet. Grind it into flour first.', 'food', 0.3, 30, food({ hunger: 2, thirst: -2, group: 'grain' }));
item('food.flour', 'Flour', 'Ground wheat in a cloth sack.', 'food', 0.5, 20, food({ hunger: 3, thirst: -4, group: 'grain' }));
item('food.flatbread', 'Flatbread', 'Flour, water, hot stone. The oldest recipe in the world.', 'food', 0.2, 10, food({ hunger: 22, thirst: -3, group: 'grain', spoilHours: 120 }));
item('food.berries', 'Wild Berries', 'From the outskirts hedges. Mostly the safe kind.', 'food', 0.1, 30, food({ hunger: 5, thirst: 4, group: 'fruit', spoilHours: 48, sickness: 0.03 }));
item('food.jam', 'Berry Jam', 'Sugar and fruit in a jar. Morale you can spread.', 'food', 0.4, 10, food({ hunger: 18, thirst: 0, group: 'sweet' }));
item('food.canned_veg', 'Home-Canned Vegetables', 'Your own jar, your own label. Lasts until you’re hungry.', 'food', 0.5, 10, food({ hunger: 28, thirst: 4, group: 'veg' }));
item('food.veg_soup', 'Vegetable Soup', 'Whatever the garden had, in a pot. Fills you up and warms you through.', 'food', 0.5, 5, food({ hunger: 38, thirst: 15, group: 'veg', spoilHours: 48 }));
item('food.stew', 'Hearty Stew', 'Meat, potatoes, and time. The best meal in the ruins.', 'food', 0.6, 5, food({ hunger: 55, thirst: 10, group: 'protein', spoilHours: 48 }));
item('drink.dirty_water', 'Dirty Water', 'From a puddle, a gutter, or worse. Boil it or gamble.', 'drink', 0.5, 10, food({ hunger: 0, thirst: 25, sickness: 0.35 }));
item('drink.clean_water', 'Clean Water', 'Boiled or pumped. The single most valuable thing you can carry.', 'drink', 0.5, 10, food({ hunger: 0, thirst: 35 }));
item('drink.herbal_tea', 'Herbal Tea', 'Garden herbs, hot water. Soothes the stomach.', 'drink', 0.4, 10, food({ hunger: 2, thirst: 30, group: 'veg' }), );
item('drink.soda', 'Flat Soda', 'Pre-collapse sugar water. Warm, flat, glorious.', 'drink', 0.4, 10, food({ hunger: 4, thirst: 18, group: 'sweet' }));

// ---- Seeds ----
item('seed.potato', 'Seed Potatoes', 'Plant in spring or autumn. Hardy and forgiving.', 'seed', 0.1, 30);
item('seed.carrot', 'Carrot Seeds', 'Spring through autumn. Likes loose soil.', 'seed', 0.02, 50);
item('seed.tomato', 'Tomato Seeds', 'Summer crop. Needs lots of water.', 'seed', 0.02, 50);
item('seed.corn', 'Corn Seeds', 'Spring into summer. Tall, thirsty, generous.', 'seed', 0.03, 50);
item('seed.cabbage', 'Cabbage Seeds', 'Autumn and winter. Shrugs off frost.', 'seed', 0.02, 50);
item('seed.pumpkin', 'Pumpkin Seeds', 'Summer into autumn. Slow, heavy, worth it.', 'seed', 0.03, 50);
item('seed.wheat', 'Wheat Seeds', 'Spring and autumn. The base of bread and patience.', 'seed', 0.02, 50);

// ---- Traps ----
item('trap.snare', 'Rope Snare', 'Catches rabbits and the occasional careless raider’s ankle.', 'trap', 0.5, 5);
item('trap.bear_trap', 'Jaw Trap', 'Spring steel teeth. Pins whatever steps in it for a few seconds.', 'trap', 3, 3);
item('trap.tripwire', 'Tripwire Alarm', 'Cans on a wire. Wakes Haven when something crosses it.', 'trap', 0.4, 5);
item('trap.spike_pit', 'Spike Strip', 'Rebar spikes in a board. Slows and hurts anything that crosses.', 'trap', 4, 3);

// ---- Defenses ----
item('def.barricade', 'Spike Barricade', 'Sharpened timber and scrap. Raiders go around, or go through slowly.', 'defense', 8, 3, { places: 'barricade' });
item('def.alarm_bell', 'Alarm Bell', 'A rung bell calls every guard in Haven to the walls.', 'defense', 3, 2, { places: 'alarm' });
item('def.turret', 'Scrap Turret', 'A rifle on a swivel with a motion sensor. Needs Grid power and ammo.', 'defense', 12, 2, { places: 'turret' });
item('def.floodlight', 'Floodlight', 'Grid-powered. Things that hunt in the dark hate it.', 'defense', 4, 3, { places: 'floodlight' });

// ---- Misc ----
item('misc.fertilizer', 'Compost Fertilizer', 'Restores soil nutrients on one plot. Smells like progress.', 'misc', 1, 20);
item('misc.feed', 'Animal Feed', 'Grain and scraps. Keeps livestock fed for a day.', 'misc', 0.5, 30);
item('misc.hide', 'Hide', 'Tanned skin from hunted game. Becomes cloth, straps, and armor.', 'misc', 0.8, 20);
item('misc.feather', 'Feathers', 'For fletching arrows. Also, tragically, for pillows.', 'misc', 0.01, 50);
item('misc.grid_fuse', 'Grid Fuse', 'A ceramic fuse stamped with the Grid sigil. Control nodes eat these during a reboot.', 'misc', 0.3, 10);
item('misc.guild_chit', 'Guild Chit', 'Meridian Guild scrip. Accepted at every Guild stall, valued at whatever they say.', 'misc', 0.01, 999);
item('misc.lore_tape', 'Data Tape', 'A Grid maintenance log on magnetic tape. Play it at a lore terminal.', 'misc', 0.1, 20);

// ---- Blueprints (picking one up unlocks the recipe permanently) ----
item('bp.workbench2', 'Blueprint: Machinist’s Bench', 'Plans for a second-tier workbench with a vise and a drill press.', 'blueprint', 0, 1);
item('bp.workbench3', 'Blueprint: Grid Workshop', 'A Grid technician’s bench layout, with powered tools.', 'blueprint', 0, 1);
item('bp.crossbow', 'Blueprint: Crossbow', 'Hand-drawn plans. Someone underlined “do NOT dry fire” three times.', 'blueprint', 0, 1);
item('bp.nailgun', 'Blueprint: Rigged Nail Gun', 'A Guild engineer’s napkin sketch. Surprisingly precise.', 'blueprint', 0, 1);
item('bp.scrap_rifle', 'Blueprint: Scrap Rifle', 'A Reaver armorer’s notes, taken off a Reaver armorer.', 'blueprint', 0, 1);
item('bp.turret', 'Blueprint: Scrap Turret', 'Custodian sentry schematics, annotated in a human hand.', 'blueprint', 0, 1);
item('bp.reinforced', 'Blueprint: Reinforced Building', 'Load tables for steel-framed walls. Raids stop at these.', 'blueprint', 0, 1);
item('bp.chemlab', 'Blueprint: Chem Station', 'A hospital pharmacy layout. Makes medicine possible again.', 'blueprint', 0, 1);
item('bp.antibiotics', 'Blueprint: Antibiotics', 'A dog-eared synthesis sheet from the Hospital Campus.', 'blueprint', 0, 1);
item('bp.canning', 'Blueprint: Canning', 'Jars, lids, heat, and timing. Food that outlasts winter.', 'blueprint', 0, 1);

export const ITEMS: readonly ItemDef[] = defs;
export const ITEM_MAP: ReadonlyMap<string, ItemDef> = new Map(defs.map((d) => [d.id, d]));

export function getItem(id: string): ItemDef | undefined {
  return ITEM_MAP.get(id);
}

/** Stack limit for an item id (1 for unknown, never 0). */
export function stackLimit(id: string): number {
  return ITEM_MAP.get(id)?.stack ?? 1;
}
