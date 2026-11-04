// Reputation, barter pricing, contracts, raid pressure.

import { Rng } from '@dg/shared';
import { BASE_VALUE, FACTION_MAP, type FactionId } from '../data/factions';
import { getItem } from '../data/items';

export function startingReputation(): Record<string, number> {
  const o: Record<string, number> = {};
  for (const [id, f] of FACTION_MAP) o[id] = f.startRep;
  return o;
}

export function changeRep(rep: Record<string, number>, faction: FactionId, delta: number): number {
  const cur = rep[faction] ?? FACTION_MAP.get(faction)?.startRep ?? 0;
  const next = Math.max(-100, Math.min(100, cur + (Number.isFinite(delta) ? delta : 0)));
  rep[faction] = next;
  return next;
}

export type Standing = 'hostile' | 'wary' | 'neutral' | 'friendly' | 'allied';
export function standing(rep: number): Standing {
  if (rep <= -50) return 'hostile';
  if (rep < -10) return 'wary';
  if (rep < 25) return 'neutral';
  if (rep < 60) return 'friendly';
  return 'allied';
}

export function itemValue(id: string): number {
  if (BASE_VALUE[id] !== undefined) return BASE_VALUE[id];
  const d = getItem(id);
  if (!d) return 0;
  switch (d.category) {
    case 'blueprint':
      return 60;
    case 'weapon':
    case 'tool':
      return 25;
    case 'medicine':
      return 8;
    case 'ammo':
      return 2;
    case 'food':
    case 'drink':
      return 3;
    case 'seed':
      return 2;
    default:
      return 2;
  }
}

/** Chits the faction pays for one item. Market service improves prices 15%. */
export function sellPrice(id: string, faction: FactionId, rep: number, market = false): number {
  const f = FACTION_MAP.get(faction);
  if (!f?.trades) return 0;
  const mult = (f.buys[id] ?? 0.6) * (1 + Math.max(-0.4, Math.min(0.4, rep / 200))) * (market ? 1.15 : 1);
  return Math.max(0, Math.floor(itemValue(id) * mult));
}

/** Chits to buy one item, or null if not offered at this reputation. */
export function buyPrice(id: string, faction: FactionId, rep: number, market = false): number | null {
  const f = FACTION_MAP.get(faction);
  const offer = f?.sells.find((s) => s.item === id);
  if (!f?.trades || !offer || rep < offer.minRep) return null;
  return Math.max(1, Math.ceil(offer.price * (1 - Math.max(-0.3, Math.min(0.3, rep / 250))) * (market ? 0.85 : 1)));
}

export interface Contract {
  id: string;
  faction: FactionId;
  kind: 'deliver' | 'clear' | 'escort' | 'salvage';
  title: string;
  item?: string;
  count?: number;
  district?: string;
  rewardChits: number;
  rep: number;
  expiresHour: number;
}

const DELIVER_POOL: Record<string, string[]> = {
  guild: ['mat.wiring', 'comp.circuit', 'misc.lore_tape', 'mat.glass', 'comp.battery'],
  reavers: ['food.smoked_meat', 'drink.clean_water', 'med.bandage', 'ammo.rifle_round', 'comp.fuel'],
};

export function generateContract(rng: Rng, faction: 'guild' | 'reavers', rank: number, hour: number): Contract {
  const pool = DELIVER_POOL[faction];
  const roll = rng.next();
  const id = `c.${faction}.${Math.floor(hour)}.${rng.int(0, 9999)}`;
  if (roll < 0.6) {
    const item = rng.pick(pool);
    const count = rng.int(3, 6) + rank;
    const name = getItem(item)?.name ?? item;
    return { id, faction, kind: 'deliver', title: `Deliver ${count} × ${name}`, item, count, rewardChits: Math.round(itemValue(item) * count * 1.4), rep: 4 + Math.floor(rank / 2), expiresHour: hour + 72 };
  }
  if (roll < 0.85) {
    const district = rng.pick(['market', 'industrial', 'rail', 'downtown', 'residential']);
    return { id, faction, kind: faction === 'guild' ? 'salvage' : 'clear', title: faction === 'guild' ? `Survey and strip a Grid cabinet in ${district}` : `Clear Custodian patrols near ${district}`, district, rewardChits: 30 + rank * 8, rep: 6, expiresHour: hour + 96 };
  }
  return { id, faction, kind: 'escort', title: 'Escort a caravan from the Rail Depot to Market Row', district: 'rail', rewardChits: 50 + rank * 10, rep: 8, expiresHour: hour + 48 };
}

/** Raid pressure 0..1 from reputation, wealth and visibility. */
export function raidPressure(inp: { reaverRep: number; custodianRep: number; stockValue: number; population: number; nodesOnline: number }): { reavers: number; custodians: number } {
  const wealth = Math.min(1, inp.stockValue / 1500);
  const pop = Math.min(1, inp.population / 30);
  const reavers = Math.max(0, Math.min(1, 0.15 + wealth * 0.45 + pop * 0.2 - inp.reaverRep / 150));
  const custodians = Math.max(0, Math.min(1, inp.nodesOnline * 0.06 - inp.custodianRep / 250 + 0.05));
  return { reavers, custodians };
}
