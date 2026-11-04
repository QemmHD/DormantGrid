import type { FactionId } from './factions';

export type EnemyId =
  | 'raider_grunt'
  | 'raider_scout'
  | 'raider_brute'
  | 'raider_sniper'
  | 'raider_leader'
  | 'drone'
  | 'guard_bot'
  | 'crawler'
  | 'custodian_heavy'
  | 'hound'
  | 'boar';

export type EnemyRole = 'melee' | 'flank' | 'tank' | 'ranged' | 'leader' | 'spotter' | 'swarm' | 'charger';

export interface EnemyDef {
  id: EnemyId;
  name: string;
  faction: FactionId | 'wild';
  role: EnemyRole;
  hp: number;
  damage: number;
  /** seconds between attacks */
  cooldown: number;
  attackRange: number;
  speed: number; // m/s run
  /** detection: sight range m, hearing range m, fov degrees */
  sight: number;
  hearing: number;
  fov: number;
  /** stagger resistance 0..1 */
  poise: number;
  /** retreat below this hp fraction */
  retreatAt: number;
  /** calls nearby allies on detection */
  alerts: boolean;
  loot: { item: string; chance: number; min: number; max: number }[];
  xp: number;
  /** material of hit sparks: flesh -> blood decals, metal -> sparks */
  body: 'flesh' | 'metal';
  bark: string;
}

const L = (item: string, chance: number, min = 1, max = min) => ({ item, chance, min, max });

export const ENEMIES: readonly EnemyDef[] = [
  { id: 'raider_grunt', name: 'Reaver Grunt', faction: 'reavers', role: 'melee', hp: 60, damage: 12, cooldown: 1.1, attackRange: 2, speed: 4.2, sight: 26, hearing: 18, fov: 120, poise: 0.2, retreatAt: 0.15, alerts: true, loot: [L('mat.scrap', 0.8, 1, 4), L('wpn.pipe', 0.1), L('food.crackers', 0.3)], xp: 15, body: 'flesh', bark: 'Fresh meat on the line!' },
  { id: 'raider_scout', name: 'Reaver Scout', faction: 'reavers', role: 'flank', hp: 45, damage: 10, cooldown: 0.8, attackRange: 1.8, speed: 5.2, sight: 34, hearing: 24, fov: 140, poise: 0.1, retreatAt: 0.4, alerts: true, loot: [L('mat.cloth', 0.6, 1, 3), L('wpn.knife', 0.15), L('comp.rope', 0.3)], xp: 14, body: 'flesh', bark: 'Going around. Keep ’em talking.' },
  { id: 'raider_brute', name: 'Reaver Brute', faction: 'reavers', role: 'tank', hp: 160, damage: 24, cooldown: 1.8, attackRange: 2.4, speed: 3.4, sight: 22, hearing: 14, fov: 100, poise: 0.7, retreatAt: 0, alerts: false, loot: [L('wpn.sledge', 0.08), L('mat.scrap', 1, 3, 7), L('food.smoked_meat', 0.4)], xp: 35, body: 'flesh', bark: 'Knock knock.' },
  { id: 'raider_sniper', name: 'Reaver Marksman', faction: 'reavers', role: 'ranged', hp: 50, damage: 30, cooldown: 3, attackRange: 45, speed: 3.8, sight: 55, hearing: 20, fov: 70, poise: 0.1, retreatAt: 0.5, alerts: true, loot: [L('ammo.rifle_round', 0.7, 2, 6), L('bp.scrap_rifle', 0.04)], xp: 25, body: 'flesh', bark: 'Got a clean line.' },
  { id: 'raider_leader', name: 'Reaver Captain', faction: 'reavers', role: 'leader', hp: 220, damage: 22, cooldown: 1.2, attackRange: 2.2, speed: 4.2, sight: 34, hearing: 22, fov: 130, poise: 0.6, retreatAt: 0.25, alerts: true, loot: [L('misc.guild_chit', 1, 20, 60), L('bp.scrap_rifle', 0.25), L('med.first_aid', 0.4)], xp: 80, body: 'flesh', bark: 'Take the stores. Leave the farmers, we’ll want them next season.' },
  { id: 'drone', name: 'Patrol Drone', faction: 'custodians', role: 'spotter', hp: 30, damage: 6, cooldown: 1.5, attackRange: 12, speed: 6, sight: 40, hearing: 10, fov: 90, poise: 0, retreatAt: 0, alerts: true, loot: [L('mat.wiring', 0.9, 1, 3), L('comp.battery', 0.25)], xp: 12, body: 'metal', bark: 'CITIZEN, YOU ARE OUTSIDE CURFEW.' },
  { id: 'guard_bot', name: 'Guard Unit', faction: 'custodians', role: 'tank', hp: 200, damage: 20, cooldown: 1.6, attackRange: 2.6, speed: 2.6, sight: 26, hearing: 16, fov: 110, poise: 0.85, retreatAt: 0, alerts: true, loot: [L('mat.scrap', 1, 4, 8), L('comp.circuit', 0.35), L('comp.spring', 0.5, 1, 2)], xp: 40, body: 'metal', bark: 'PLEASE STEP AWAY FROM THE INFRASTRUCTURE.' },
  { id: 'crawler', name: 'Swarm Crawler', faction: 'custodians', role: 'swarm', hp: 14, damage: 5, cooldown: 0.6, attackRange: 1.2, speed: 5.5, sight: 14, hearing: 20, fov: 360, poise: 0, retreatAt: 0, alerts: false, loot: [L('mat.wiring', 0.4), L('mat.scrap', 0.5)], xp: 4, body: 'metal', bark: '' },
  { id: 'custodian_heavy', name: 'Custodian Heavy', faction: 'custodians', role: 'tank', hp: 600, damage: 40, cooldown: 2.4, attackRange: 3.2, speed: 2.4, sight: 36, hearing: 20, fov: 140, poise: 0.95, retreatAt: 0, alerts: true, loot: [L('comp.circuit', 1, 2, 3), L('misc.grid_fuse', 0.6), L('bp.turret', 0.2)], xp: 150, body: 'metal', bark: 'MAINTENANCE PRIORITY: ABSOLUTE.' },
  { id: 'hound', name: 'Feral Hound', faction: 'wild', role: 'melee', hp: 35, damage: 9, cooldown: 0.9, attackRange: 1.6, speed: 7, sight: 24, hearing: 30, fov: 180, poise: 0.1, retreatAt: 0.3, alerts: true, loot: [L('food.raw_meat', 0.9, 1, 2), L('misc.hide', 0.5)], xp: 10, body: 'flesh', bark: '' },
  { id: 'boar', name: 'Wild Boar', faction: 'wild', role: 'charger', hp: 90, damage: 18, cooldown: 2, attackRange: 2, speed: 6.5, sight: 16, hearing: 18, fov: 160, poise: 0.5, retreatAt: 0.2, alerts: false, loot: [L('food.raw_meat', 1, 3, 5), L('misc.hide', 0.9, 1, 2)], xp: 22, body: 'flesh', bark: '' },
];

export const ENEMY_MAP: ReadonlyMap<EnemyId, EnemyDef> = new Map(ENEMIES.map((e) => [e.id, e]));
