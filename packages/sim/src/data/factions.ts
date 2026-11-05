export type FactionId = 'hearth' | 'reavers' | 'guild' | 'custodians';

export interface FactionDef {
  id: FactionId;
  name: string;
  short: string;
  desc: string;
  /** starting reputation with the player */
  startRep: number;
  /** can trade at all */
  trades: boolean;
  /** what they buy at a premium (multiplier > 1) and what they sell */
  buys: Record<string, number>;
  sells: { item: string; price: number; minRep: number }[];
  /** voice sample lines used by barks/UI */
  lines: { greet: string; hostile: string; deal: string };
}

export const FACTIONS: readonly FactionDef[] = [
  {
    id: 'hearth',
    name: 'Hearth Compact',
    short: 'Hearth',
    desc: 'Your people. A handshake agreement between strangers that turned into a town. Nobody remembers who wrote the charter on the back of a pizza box, but everyone signed it.',
    startRep: 40,
    trades: false,
    buys: {},
    sells: [],
    lines: { greet: 'Kettle’s on. Mostly metaphorically.', hostile: 'We trusted you with the keys.', deal: 'Put it on the Ledger.' },
  },
  {
    id: 'reavers',
    name: 'Ashline Reavers',
    short: 'Reavers',
    desc: 'Raiders who took the Ashline rail yards and decided the rest of the city owed them rent. They sell what they strip. They strip a lot.',
    startRep: -30,
    trades: true,
    buys: { 'food.smoked_meat': 1.5, 'med.antibiotics': 2, 'ammo.rifle_round': 1.4 },
    sells: [
      { item: 'mat.scrap', price: 1, minRep: -40 },
      { item: 'comp.fuel', price: 8, minRep: -20 },
      { item: 'ammo.rifle_round', price: 4, minRep: 0 },
      { item: 'bp.scrap_rifle', price: 120, minRep: 30 },
    ],
    lines: { greet: 'Toll’s due. Smile while you pay it.', hostile: 'Strip ’em. Save the boots.', deal: 'Pleasure. Don’t make it a habit.' },
  },
  {
    id: 'guild',
    name: 'Meridian Guild',
    short: 'Guild',
    desc: 'Scavenger-engineers with clipboards and very good boots. They want the Grid back online, as long as they hold the meter.',
    startRep: 0,
    trades: true,
    buys: { 'mat.wiring': 1.6, 'comp.circuit': 2, 'misc.lore_tape': 2.5, 'misc.grid_fuse': 2 },
    sells: [
      // round 5: the first node quest needs a fuse; before this, only rare heavies dropped one
      { item: 'misc.grid_fuse', price: 24, minRep: -10 },
      { item: 'comp.battery', price: 10, minRep: -10 },
      { item: 'seed.tomato', price: 4, minRep: -10 },
      { item: 'seed.pumpkin', price: 5, minRep: 0 },
      { item: 'med.antibiotics', price: 25, minRep: 10 },
      { item: 'bp.workbench2', price: 60, minRep: 10 },
      { item: 'bp.nailgun', price: 90, minRep: 20 },
      { item: 'bp.workbench3', price: 150, minRep: 40 },
      { item: 'bp.turret', price: 180, minRep: 50 },
    ],
    lines: { greet: 'Meridian Guild, field office. Everything’s negotiable except our margin.', hostile: 'Contract terminated. So are you.', deal: 'Signed, stamped, filed under “promising.”' },
  },
  {
    id: 'custodians',
    name: 'The Custodians',
    short: 'Custodians',
    desc: 'What remains of the Grid’s own maintenance intelligence: drones, guard units and heavies still following the last order they received. The order was “protect the infrastructure.” Nobody told them people were part of it.',
    startRep: -60,
    trades: false,
    buys: {},
    sells: [],
    lines: { greet: 'CITIZEN DETECTED. PLEASE REMAIN CALM.', hostile: 'UNAUTHORIZED MAINTENANCE IN PROGRESS. CORRECTING.', deal: 'ACKNOWLEDGED.' },
  },
];

export const FACTION_MAP: ReadonlyMap<FactionId, FactionDef> = new Map(FACTIONS.map((f) => [f.id, f]));

/** Base value of items in chits for barter. */
export const BASE_VALUE: Record<string, number> = {
  'mat.scrap': 1,
  'mat.timber': 1,
  'mat.brick': 1,
  'mat.glass': 2,
  'mat.cloth': 1,
  'mat.wiring': 3,
  'mat.plastic': 1,
  'mat.chemicals': 3,
  'mat.organic': 1,
  'comp.circuit': 12,
  'comp.battery': 6,
  'comp.fuel': 5,
  'misc.lore_tape': 10,
  'misc.grid_fuse': 20,
  'food.smoked_meat': 6,
  'food.canned_veg': 6,
  'drink.clean_water': 3,
  'med.antibiotics': 15,
  'ammo.rifle_round': 2,
};
