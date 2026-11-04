// The Grid: control node reboot state machine + district restoration states.

import type { DistrictKey, RestorationState } from '@dg/shared';

export type NodePhase = 'idle' | 'routing' | 'syncing' | 'defend' | 'online';

export const RELAYS_PER_NODE = 3;
export const SYNC_SECONDS = 12;
export const DEFEND_SECONDS = 60;
export const DEFEND_MAX_SECONDS = 120;
export const NODE_RANGE = 14; // meters the player must stay within during sync/defend
export const WAVE_TIMES = [0, 20, 40];

export interface NodeReboot {
  node: number;
  district: number;
  phase: NodePhase;
  relays: boolean[];
  /** sync progress 0..1 */
  sync: number;
  /** seconds in the defend phase */
  defendT: number;
  wavesSent: number;
  /** seconds the player has been out of range */
  awayT: number;
}

export type NodeEvent =
  | { type: 'phase'; phase: NodePhase }
  | { type: 'relay'; index: number }
  | { type: 'wave'; index: number; count: number }
  | { type: 'setback'; reason: 'left' }
  | { type: 'online' };

export function startReboot(node: number, district: number): NodeReboot {
  return { node, district, phase: 'routing', relays: new Array<boolean>(RELAYS_PER_NODE).fill(false), sync: 0, defendT: 0, wavesSent: 0, awayT: 0 };
}

/** Player activated a relay (route power). */
export function routeRelay(s: NodeReboot, index: number, out: NodeEvent[] = []): NodeEvent[] {
  if (s.phase !== 'routing' || index < 0 || index >= s.relays.length || s.relays[index]) return out;
  s.relays[index] = true;
  out.push({ type: 'relay', index });
  if (s.relays.every(Boolean)) {
    s.phase = 'syncing';
    out.push({ type: 'phase', phase: 'syncing' });
  }
  return out;
}

export interface NodeInput {
  holding: boolean;
  inRange: boolean;
  enemiesAlive: number;
  /** danger tier of the district 0..4 */
  danger: number;
  /** number of players (co-op scales waves) */
  players?: number;
}

export function tickReboot(s: NodeReboot, dt: number, inp: NodeInput, out: NodeEvent[] = []): NodeEvent[] {
  const d = Number.isFinite(dt) && dt > 0 ? Math.min(dt, 1) : 0;
  if (d === 0) return out;
  switch (s.phase) {
    case 'syncing':
      if (inp.holding && inp.inRange) s.sync = Math.min(1, s.sync + d / SYNC_SECONDS);
      else s.sync = Math.max(0, s.sync - d / (SYNC_SECONDS * 4));
      if (s.sync >= 1) {
        s.phase = 'defend';
        s.defendT = 0;
        s.wavesSent = 0;
        out.push({ type: 'phase', phase: 'defend' });
      }
      break;
    case 'defend': {
      s.defendT += d;
      while (s.wavesSent < WAVE_TIMES.length && s.defendT >= WAVE_TIMES[s.wavesSent]) {
        const count = Math.round((3 + inp.danger * 1.5 + s.wavesSent * 2) * (1 + 0.5 * Math.max(0, (inp.players ?? 1) - 1)));
        out.push({ type: 'wave', index: s.wavesSent, count });
        s.wavesSent++;
      }
      s.awayT = inp.inRange ? 0 : s.awayT + d;
      if (s.awayT > 15) {
        // fair setback, not a reset: drop back to half sync
        s.phase = 'syncing';
        s.sync = 0.5;
        s.awayT = 0;
        out.push({ type: 'setback', reason: 'left' });
        out.push({ type: 'phase', phase: 'syncing' });
        break;
      }
      const done = s.wavesSent >= WAVE_TIMES.length && ((s.defendT >= DEFEND_SECONDS && inp.enemiesAlive === 0) || s.defendT >= DEFEND_MAX_SECONDS);
      if (done) {
        s.phase = 'online';
        out.push({ type: 'phase', phase: 'online' });
        out.push({ type: 'online' });
      }
      break;
    }
    default:
      break;
  }
  return out;
}

/** Restoration state from infrastructure + people. */
export function restorationFor(inp: { nodesOnline: number; nodesTotal: number; residents: number; rank: number; key?: DistrictKey }): RestorationState {
  const { nodesOnline, nodesTotal, residents, rank } = inp;
  if (inp.key === 'haven') {
    // Haven starts stabilized; grows with people and rank
    if (rank >= 7 && residents >= 15) return 4;
    if (residents >= 6) return 3;
    if (rank >= 3) return 2;
    return 1;
  }
  if (nodesOnline <= 0) return 0;
  if (nodesOnline < nodesTotal) return 1;
  if (residents < 3) return 2;
  if (rank < 6 || residents < 6) return 3;
  return 4;
}

export interface RestorationFx {
  /** key light color hex and intensity multiplier */
  light: string;
  lightMul: number;
  /** ambient/fog tint */
  fog: string;
  /** street/window lights on (0..1 fraction of fixtures lit) */
  lamps: number;
  /** hostile spawn multiplier */
  hostile: number;
  /** vegetation lushness 0..1 (planters, flowers, cleared rubble) */
  plants: number;
  /** ambient survivor density per cell */
  people: number;
  /** music layer names */
  music: string[];
  ambience: string;
  /** fraction of rubble/debris props hidden */
  cleanup: number;
}

export const RESTORATION_FX: Record<RestorationState, RestorationFx> = {
  0: { light: '#8fa3b8', lightMul: 0.85, fog: '#5d6b78', lamps: 0, hostile: 1, plants: 0.15, people: 0, music: ['drone'], ambience: 'ruin_wind', cleanup: 0 },
  1: { light: '#a9b4bd', lightMul: 0.9, fog: '#6c7680', lamps: 0.1, hostile: 0.7, plants: 0.25, people: 0.2, music: ['drone', 'pulse'], ambience: 'ruin_calm', cleanup: 0.2 },
  2: { light: '#e8c48a', lightMul: 1, fog: '#8a8378', lamps: 0.7, hostile: 0.35, plants: 0.4, people: 0.5, music: ['pulse', 'keys'], ambience: 'powered_hum', cleanup: 0.45 },
  3: { light: '#f2c27a', lightMul: 1.05, fog: '#9a8a74', lamps: 0.9, hostile: 0.15, plants: 0.7, people: 1, music: ['keys', 'acoustic'], ambience: 'town_life', cleanup: 0.75 },
  4: { light: '#ffcf86', lightMul: 1.1, fog: '#a8977c', lamps: 1, hostile: 0.05, plants: 1, people: 1.6, music: ['keys', 'acoustic', 'strings'], ambience: 'town_bustle', cleanup: 1 },
};

/** The Grid accent color used for powered infrastructure everywhere. */
export const GRID_ACCENT = '#3fe0c5';

export type ServiceId = 'haven' | 'workshop' | 'housing' | 'market' | 'foundry' | 'clinic' | 'water' | 'trade_depot' | 'farms';
export const DISTRICT_SERVICE: Record<DistrictKey, ServiceId> = {
  haven: 'haven',
  downtown: 'workshop',
  residential: 'housing',
  market: 'market',
  industrial: 'foundry',
  hospital: 'clinic',
  waterworks: 'water',
  rail: 'trade_depot',
  outskirts: 'farms',
};
export const SERVICE_DESC: Record<ServiceId, string> = {
  haven: 'Home. Beds, fires, and the Ledger.',
  workshop: 'Grid workshop power: powered stations work town-wide.',
  housing: 'Habitable homes: survivor cap +8.',
  market: 'Market stalls: better trade prices with every faction.',
  foundry: 'Foundry: reinforced building pieces cost 25% less.',
  clinic: 'Clinic: injured survivors heal twice as fast; antibiotics craftable.',
  water: 'Running water: irrigation and clean water taps in Haven.',
  trade_depot: 'Trade depot: faction caravans visit every 3 days.',
  farms: 'Outskirts farms: survivors can farm the old fields.',
};

/** Services open from Powered (2) upward. */
export function servicesOpen(states: { key: DistrictKey; state: RestorationState }[]): ServiceId[] {
  return states.filter((d) => d.state >= 2).map((d) => DISTRICT_SERVICE[d.key]);
}
