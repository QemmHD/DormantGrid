export type PerkTrack = 'scavenger' | 'builder' | 'fighter' | 'provider';

export interface PerkDef {
  id: string;
  track: PerkTrack;
  tier: number; // 1..8, requires previous tier in the same track
  name: string;
  desc: string;
  /** numeric effect keys consumed by systems */
  fx: Record<string, number>;
}

const P = (track: PerkTrack, tier: number, id: string, name: string, desc: string, fx: Record<string, number>): PerkDef => ({ id: `perk.${track}.${id}`, track, tier, name, desc, fx });

export const PERKS: readonly PerkDef[] = [
  P('scavenger', 1, 'light_fingers', 'Light Fingers', 'Deconstruct 15% faster.', { deconSpeed: 0.15 }),
  P('scavenger', 2, 'pack_mule', 'Pack Mule', '+15 kg carry weight.', { carry: 15 }),
  P('scavenger', 3, 'eye_for_wire', 'Eye for Wire', 'Wiring yields +1 from electronics.', { wiringBonus: 1 }),
  P('scavenger', 4, 'careful_hands', 'Careful Hands', 'Salvage one extra glass from anything that has it.', { glassSafe: 1 }),
  P('scavenger', 5, 'blueprint_hunter', 'Blueprint Hunter', 'Double chance to find blueprints.', { bpChance: 1 }),
  P('scavenger', 6, 'quiet_work', 'Quiet Work', 'Salvaging makes half the noise: enemies hear it from 8 m, not 16 m.', { deconNoise: -0.5 }),
  P('scavenger', 7, 'magnet', 'Magnet', 'Pickup range +100%.', { pickupRange: 1 }),
  P('scavenger', 8, 'strip_it_all', 'Strip It All', 'Every salvage yields one extra material.', { salvageBonus: 1 }),
  P('builder', 1, 'square_and_level', 'Square and Level', 'Building costs 10% less.', { buildCost: -0.1 }),
  P('builder', 2, 'load_bearing', 'Load Bearing', 'Structures keep 10% more stability per hop.', { stability: 0.1 }),
  P('builder', 3, 'patch_job', 'Patch Job', 'Survivor repairs restore 50% more and cost half the scrap.', { repair: 0.5 }),
  P('builder', 4, 'site_foreman', 'Site Foreman', 'Survivors on Build & Repair work 25% faster while you are in Haven.', { crewSpeed: 0.25 }),
  P('builder', 5, 'brickwork', 'Brickwork', 'Brick pieces have +25% hp.', { brickHp: 0.25 }),
  P('builder', 6, 'tinkerer', 'Tinkerer', 'Tools lose durability 30% slower.', { durability: -0.3 }),
  P('builder', 7, 'grid_wright', 'Gridwright', 'Turrets fire 30% faster and floodlights reach 50% farther.', { turretRate: 0.3, floodRange: 0.5 }),
  P('builder', 8, 'master_builder', 'Master Builder', 'Reinforced pieces cost 25% less.', { reinforcedCost: -0.25 }),
  P('fighter', 1, 'second_wind', 'Second Wind', 'Stamina regenerates 20% faster.', { staminaRegen: 0.2 }),
  P('fighter', 2, 'heavy_hands', 'Heavy Hands', 'Melee damage +15%.', { melee: 0.15 }),
  P('fighter', 3, 'light_step', 'Light Step', 'Dodge costs 25% less stamina.', { dodgeCost: -0.25 }),
  P('fighter', 4, 'steady_aim', 'Steady Aim', 'Ranged damage +15%.', { ranged: 0.15 }),
  P('fighter', 5, 'shadow', 'Shadow', 'Enemies notice you 30% slower.', { stealth: 0.3 }),
  P('fighter', 6, 'takedown', 'Takedown', 'Sneak attacks deal triple damage.', { sneakMult: 3 }),
  P('fighter', 7, 'thick_skin', 'Thick Skin', 'Take 15% less damage.', { armor: 0.15 }),
  P('fighter', 8, 'warden', 'Warden', 'Guards defend 25% better while you are in Haven.', { guardDamage: 0.25 }),
  P('provider', 1, 'green_thumb', 'Green Thumb', 'Crops you plant grow 15% faster.', { growth: 0.15 }),
  P('provider', 2, 'iron_stomach', 'Iron Stomach', 'Half the sickness chance from food and water.', { sickness: -0.5 }),
  P('provider', 3, 'camp_cook', 'Camp Cook', 'Cooked meals restore 20% more.', { cooking: 0.2 }),
  P('provider', 4, 'tracker', 'Tracker', 'Hounds and boars within 80 m show on your minimap.', { tracker: 1 }),
  P('provider', 5, 'field_medic', 'Field Medic', 'Medicine heals 30% more.', { medicine: 0.3 }),
  P('provider', 6, 'preserver', 'Preserver', 'Food spoils 40% slower.', { spoil: -0.4 }),
  P('provider', 7, 'big_harvest', 'Big Harvest', '+1 produce per harvest.', { harvest: 1 }),
  P('provider', 8, 'heart_of_haven', 'Heart of Haven', 'Survivor mood +10 while you are in town.', { townMood: 10 }),
];

export const PERK_MAP: ReadonlyMap<string, PerkDef> = new Map(PERKS.map((p) => [p.id, p]));

/** Sum a numeric effect across owned perks. */
export function perkFx(owned: readonly string[], key: string): number {
  let s = 0;
  for (const id of owned) s += PERK_MAP.get(id)?.fx[key] ?? 0;
  return s;
}

export function canTakePerk(owned: readonly string[], id: string, points: number): boolean {
  const p = PERK_MAP.get(id);
  if (!p || points <= 0 || owned.includes(id)) return false;
  if (p.tier === 1) return true;
  return PERKS.some((q) => q.track === p.track && q.tier === p.tier - 1 && owned.includes(q.id));
}

/** XP needed for the next perk point. */
export function xpForLevel(level: number): number {
  return Math.round(100 * Math.pow(level, 1.35));
}
