export type Season = 'spring' | 'summer' | 'autumn' | 'winter';
export const SEASONS: readonly Season[] = ['spring', 'summer', 'autumn', 'winter'] as const;
/** In-game days per season. 4 seasons x 7 days = 28-day year. */
export const SEASON_DAYS = 7;

export interface CropDef {
  id: string; // 'potato'
  name: string;
  seed: string; // item id
  produce: string; // item id
  seasons: Season[];
  /** in-game days to ripe at ideal conditions */
  growDays: number;
  /** produce count at harvest (min..max) */
  yield: [number, number];
  /** water used per day 0..1 */
  thirst: number;
  /** nutrients used per growth cycle 0..1 */
  feed: number;
  frostHardy: boolean;
  /** seeds returned at harvest */
  seedBack: [number, number];
  /** crop family for rotation bonus */
  family: 'root' | 'fruit' | 'grain' | 'leaf';
  /** 4 visual stage names */
  stages: [string, string, string, string];
}

export const CROPS: readonly CropDef[] = [
  { id: 'potato', name: 'Potato', seed: 'seed.potato', produce: 'food.potato', seasons: ['spring', 'autumn'], growDays: 4, yield: [5, 9], thirst: 0.35, feed: 0.35, frostHardy: false, seedBack: [1, 2], family: 'root', stages: ['Sprouted', 'Leafy', 'Flowering', 'Ready to dig'] },
  { id: 'carrot', name: 'Carrot', seed: 'seed.carrot', produce: 'food.carrot', seasons: ['spring', 'summer', 'autumn'], growDays: 3, yield: [4, 7], thirst: 0.3, feed: 0.25, frostHardy: false, seedBack: [1, 3], family: 'root', stages: ['Sprouted', 'Feathery', 'Bushy', 'Ready to pull'] },
  { id: 'tomato', name: 'Tomato', seed: 'seed.tomato', produce: 'food.tomato', seasons: ['summer'], growDays: 4, yield: [6, 10], thirst: 0.6, feed: 0.35, frostHardy: false, seedBack: [1, 3], family: 'fruit', stages: ['Seedling', 'Vining', 'Green fruit', 'Ripe'] },
  { id: 'corn', name: 'Corn', seed: 'seed.corn', produce: 'food.corn', seasons: ['spring', 'summer'], growDays: 5, yield: [5, 8], thirst: 0.5, feed: 0.45, frostHardy: false, seedBack: [1, 2], family: 'grain', stages: ['Shoots', 'Knee-high', 'Tasseling', 'Ears ready'] },
  { id: 'cabbage', name: 'Cabbage', seed: 'seed.cabbage', produce: 'food.cabbage', seasons: ['autumn', 'winter'], growDays: 4, yield: [3, 5], thirst: 0.3, feed: 0.3, frostHardy: true, seedBack: [1, 2], family: 'leaf', stages: ['Seedling', 'Rosette', 'Heading', 'Firm head'] },
  { id: 'pumpkin', name: 'Pumpkin', seed: 'seed.pumpkin', produce: 'food.pumpkin', seasons: ['summer', 'autumn'], growDays: 6, yield: [2, 3], thirst: 0.5, feed: 0.5, frostHardy: false, seedBack: [2, 3], family: 'fruit', stages: ['Seedling', 'Sprawling', 'Green gourds', 'Orange & heavy'] },
  { id: 'wheat', name: 'Wheat', seed: 'seed.wheat', produce: 'food.wheat', seasons: ['spring', 'autumn'], growDays: 4, yield: [7, 12], thirst: 0.25, feed: 0.3, frostHardy: true, seedBack: [2, 3], family: 'grain', stages: ['Green blades', 'Tillering', 'Heading', 'Golden'] },
];

export const CROP_MAP: ReadonlyMap<string, CropDef> = new Map(CROPS.map((c) => [c.id, c]));
export function cropForSeed(seedItem: string): CropDef | undefined {
  return CROPS.find((c) => c.seed === seedItem);
}
