export interface LivestockDef {
  id: 'chicken' | 'goat' | 'pig';
  name: string;
  home: string; // piece id
  capacity: number; // per home piece
  feedPerDay: number; // misc.feed units
  products: { item: string; perDay: number }[];
  /** days between births when two or more are housed and fed */
  breedDays: number;
  /** butcher yield */
  butcher: { item: string; count: number }[];
  hp: number;
}

export const LIVESTOCK: readonly LivestockDef[] = [
  { id: 'chicken', name: 'Chicken', home: 'coop', capacity: 4, feedPerDay: 0.25, products: [{ item: 'food.egg', perDay: 1 }, { item: 'misc.feather', perDay: 1 }], breedDays: 6, butcher: [{ item: 'food.raw_meat', count: 1 }, { item: 'misc.feather', count: 4 }], hp: 10 },
  { id: 'goat', name: 'Goat', home: 'pen', capacity: 3, feedPerDay: 0.5, products: [{ item: 'food.milk', perDay: 1 }], breedDays: 10, butcher: [{ item: 'food.raw_meat', count: 3 }, { item: 'misc.hide', count: 1 }], hp: 40 },
  { id: 'pig', name: 'Pig', home: 'pen', capacity: 2, feedPerDay: 1, products: [{ item: 'mat.organic', perDay: 2 }], breedDays: 9, butcher: [{ item: 'food.raw_meat', count: 6 }, { item: 'misc.hide', count: 1 }], hp: 60 },
];

/** Wild game in the outskirts (hunting + trapping). */
export const GAME_ANIMALS = [
  { id: 'rabbit', name: 'Rabbit', hp: 8, flees: true, trap: 'snare', butcher: [{ item: 'food.raw_meat', count: 1 }, { item: 'misc.hide', count: 1 }] },
  { id: 'deer', name: 'Deer', hp: 50, flees: true, trap: null, butcher: [{ item: 'food.raw_meat', count: 5 }, { item: 'misc.hide', count: 2 }] },
  { id: 'crow', name: 'Crow', hp: 4, flees: true, trap: null, butcher: [{ item: 'misc.feather', count: 3 }] },
] as const;
