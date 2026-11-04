import { Rng, type PlacedPiece, type WorldSave } from '@dg/shared';
import { addItem, createInventory } from '../src/systems/inventory';
import { generateSurvivor, STOCK_SLOTS } from '../src/systems/survivors';

export function townFixture(seed: number, survivors: number, plots: number, beds = survivors): WorldSave {
  const rng = new Rng(seed);
  let id = 1;
  const pieces: PlacedPiece[] = [];
  const add = (piece: string, x: number, z: number) => pieces.push({ id: id++, piece, tier: 1, x, y: 0, z, rot: 0, hp: 100 });
  add('campfire', 600, 600);
  add('kitchen', 604, 600);
  add('storage', 606, 604);
  add('workbench1', 596, 604);
  for (let i = 0; i < beds; i++) add('bed', 580 + (i % 8) * 2, 580 + Math.floor(i / 8) * 3);
  for (let i = 0; i < plots; i++) add('farm_plot', 620 + (i % 5) * 4, 600 + Math.floor(i / 5) * 4);
  const world: WorldSave = {
    seed,
    genVersion: 2,
    hour: 7,
    weather: 'clear',
    removedProps: [],
    removedPieces: {},
    pieces,
    nextPieceId: id,
    drops: [],
    survivors: [],
    crops: [],
    districts: [],
    factions: {},
    townStock: createInventory(STOCK_SLOTS),
    blueprints: [],
    quests: {},
    flags: {},
    difficulty: 'standard',
  };
  for (let i = 0; i < survivors; i++) world.survivors.push(generateSurvivor(rng, i + 1, 600, 600));
  const st = world.townStock;
  // a mid-game larder: ~5 days of preserved food and a mixed seed bank
  addItem(st, 'food.canned_beans', survivors * 6);
  addItem(st, 'food.crackers', survivors * 2);
  for (const seed of ['seed.potato', 'seed.carrot', 'seed.wheat', 'seed.corn', 'seed.tomato', 'seed.cabbage', 'seed.pumpkin']) addItem(st, seed, plots * 2);
  addItem(st, 'mat.scrap', 40);
  addItem(st, 'mat.timber', 40);
  return world;
}

