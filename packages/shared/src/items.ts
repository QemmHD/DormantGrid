// Item, recipe and material contracts.

export type MaterialId =
  | 'scrap'
  | 'timber'
  | 'brick'
  | 'glass'
  | 'cloth'
  | 'wiring'
  | 'plastic'
  | 'chemicals'
  | 'organic';

export const MATERIALS: readonly MaterialId[] = [
  'scrap',
  'timber',
  'brick',
  'glass',
  'cloth',
  'wiring',
  'plastic',
  'chemicals',
  'organic',
] as const;

export type ItemCategory =
  | 'material'
  | 'tool'
  | 'weapon'
  | 'ammo'
  | 'medicine'
  | 'food'
  | 'drink'
  | 'seed'
  | 'building'
  | 'trap'
  | 'defense'
  | 'station'
  | 'blueprint'
  | 'misc';

export type ToolTier = 'hands' | 'crowbar' | 'axe' | 'pickaxe' | 'saw' | 'torch';
export const TOOL_TIERS: readonly ToolTier[] = ['hands', 'crowbar', 'axe', 'pickaxe', 'saw', 'torch'] as const;

export interface FoodInfo {
  hunger: number; // restores, 0..100
  thirst: number;
  /** nutrition category used for buffs */
  group?: 'grain' | 'veg' | 'protein' | 'fruit' | 'sweet';
  /** in-game hours until spoiled; undefined = never */
  spoilHours?: number;
  /** chance to cause sickness 0..1 */
  sickness?: number;
}

export interface ToolInfo {
  tier: ToolTier;
  /** multiplier on deconstruction speed */
  speed: number;
  durability: number;
}

export interface WeaponInfo {
  kind: 'melee' | 'ranged';
  damage: number;
  /** seconds between attacks */
  cooldown: number;
  stamina: number;
  range: number;
  ammo?: string;
  durability: number;
}

export interface ItemDef {
  id: string; // e.g. 'tool.crowbar'
  name: string;
  desc: string;
  category: ItemCategory;
  weight: number; // kg
  stack: number; // max stack size
  /** icon key, resolved to atlas or Tier B asset 'icon.<id>' */
  icon: string;
  tool?: ToolInfo;
  weapon?: WeaponInfo;
  food?: FoodInfo;
  /** medicine effect */
  heals?: { health?: number; cures?: ConditionId[] };
  /** building piece id this item places */
  places?: string;
}

export type StationId = 'hands' | 'workbench1' | 'workbench2' | 'workbench3' | 'campfire' | 'kitchen' | 'chemlab';

export interface RecipeDef {
  id: string;
  out: string; // item id
  count: number;
  inputs: { item: string; count: number }[];
  station: StationId;
  /** seconds to craft */
  time: number;
  /** blueprint required (id), unlocked by default if undefined */
  blueprint?: string;
  /** min Town Rank */
  rank?: number;
}

export type ConditionId = 'bleeding' | 'fracture' | 'sick' | 'infected' | 'wellfed' | 'rested' | 'soaked';

export interface ItemStack {
  id: string;
  n: number;
  /** durability remaining for tools/weapons */
  d?: number;
  /** in-game hour the food was made / picked up (for spoilage) */
  t?: number;
}
