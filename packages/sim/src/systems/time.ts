// Game time, day/night, seasons and weather. 1 game hour = DAY_REAL_SECONDS/24 real seconds.

import { hash2 } from '@dg/shared';
import { SEASONS, SEASON_DAYS, type Season } from '../data/crops';

export const DAY_REAL_SECONDS_DEFAULT = 24 * 60; // 24 real minutes
export const START_HOUR = 7; // new games start at 07:00 day 0
export const SUNRISE = 6;
export const SUNSET = 20;

export type Weather = 'clear' | 'overcast' | 'rain' | 'fog' | 'storm';
export const WEATHERS: readonly Weather[] = ['clear', 'overcast', 'rain', 'fog', 'storm'] as const;
export const WEATHER_BLOCK_HOURS = 4;

export function gameHoursPerRealSecond(dayRealSeconds = DAY_REAL_SECONDS_DEFAULT): number {
  return 24 / Math.max(60, dayRealSeconds);
}

export function dayOf(hour: number): number {
  return Math.floor(hour / 24);
}
export function hourOfDay(hour: number): number {
  return ((hour % 24) + 24) % 24;
}
export function seasonOf(hour: number): Season {
  return SEASONS[Math.floor(dayOf(hour) / SEASON_DAYS) % 4];
}
export function dayOfSeason(hour: number): number {
  return dayOf(hour) % SEASON_DAYS;
}
export function yearOf(hour: number): number {
  return Math.floor(dayOf(hour) / (SEASON_DAYS * 4));
}
export function isNight(hour: number): boolean {
  const h = hourOfDay(hour);
  return h < SUNRISE || h >= SUNSET;
}
export function clockString(hour: number): string {
  const h = hourOfDay(hour);
  const hh = Math.floor(h);
  const mm = Math.floor((h - hh) * 60);
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

export interface SunState {
  /** elevation in radians (-PI/2..PI/2), negative below horizon */
  elevation: number;
  /** azimuth in radians, 0 = east, PI = west */
  azimuth: number;
  /** 0 night .. 1 full day, smooth at dawn/dusk */
  daylight: number;
  /** 0..1 how 'golden' the light is (dawn/dusk) */
  golden: number;
}

export function sunAt(hour: number, season: Season = 'summer'): SunState {
  const h = hourOfDay(hour);
  const dayLen = SUNSET - SUNRISE;
  const t = (h - SUNRISE) / dayLen; // 0 sunrise, 1 sunset
  const maxElev = season === 'winter' ? 0.75 : season === 'summer' ? 1.2 : 1.0;
  const azimuth = t * Math.PI;
  const e = Math.sin(t * Math.PI);
  const daylight = Math.max(0, Math.min(1, (t < 0 || t > 1 ? -0.2 : e) * 3 + 0.1));
  const golden = t >= -0.05 && t <= 1.05 ? Math.max(0, 1 - Math.abs(e) * 3.2) : 0;
  const elevation = t < 0 || t > 1 ? -0.3 : Math.sin(t * Math.PI) * maxElev;
  return { elevation, azimuth, daylight, golden };
}

const TRANSITIONS: Record<Season, Record<Weather, number[]>> = (() => {
  // rows: from weather -> weights to [clear, overcast, rain, fog, storm]
  const base: Record<Weather, number[]> = {
    clear: [6, 2, 0.8, 0.5, 0.2],
    overcast: [2, 3, 2, 0.8, 0.5],
    rain: [1, 2.5, 2.5, 0.7, 0.8],
    fog: [2, 2, 0.6, 2, 0.1],
    storm: [0.5, 2, 2.5, 0.3, 0.8],
  };
  const tweak = (mul: number[]): Record<Weather, number[]> => {
    const o = {} as Record<Weather, number[]>;
    for (const w of WEATHERS) o[w] = base[w].map((v, i) => v * mul[i]);
    return o;
  };
  return {
    spring: tweak([1, 1, 1.3, 1, 0.8]),
    summer: tweak([1.5, 0.8, 0.6, 0.4, 1.4]),
    autumn: tweak([0.8, 1.3, 1.3, 1.6, 0.9]),
    winter: tweak([0.8, 1.5, 0.7, 1.8, 0.5]),
  };
})();

export function nextWeather(cur: Weather, season: Season, r01: number): Weather {
  const row = TRANSITIONS[season][cur] ?? TRANSITIONS[season].clear;
  const total = row.reduce((a, b) => a + b, 0);
  let x = r01 * total;
  for (let i = 0; i < row.length; i++) {
    x -= row[i];
    if (x <= 0) return WEATHERS[i];
  }
  return 'clear';
}

let memo: { seed: number; block: number; w: Weather } | null = null;
/** Deterministic weather for (seed, hour): Markov chain stepped every WEATHER_BLOCK_HOURS. */
export function weatherAt(seed: number, hour: number): Weather {
  const block = Math.max(0, Math.floor(hour / WEATHER_BLOCK_HOURS));
  let b = 0;
  let w: Weather = 'clear';
  if (memo && memo.seed === seed && memo.block <= block) {
    b = memo.block;
    w = memo.w;
  }
  while (b < block) {
    b++;
    w = nextWeather(w, seasonOf(b * WEATHER_BLOCK_HOURS), hash2(seed ^ 0x5eed, b) / 4294967296);
  }
  memo = { seed, block, w };
  return w;
}

export interface WeatherFx {
  rain: number; // 0..1 precipitation
  fog: number; // fog density multiplier (1 = normal)
  light: number; // sunlight multiplier
  wind: number; // 0..1
  lightning: boolean;
  /** waters crops this much per hour (0..1 moisture) */
  watering: number;
}

export const WEATHER_FX: Record<Weather, WeatherFx> = {
  clear: { rain: 0, fog: 1, light: 1, wind: 0.2, lightning: false, watering: 0 },
  overcast: { rain: 0, fog: 1.4, light: 0.7, wind: 0.4, lightning: false, watering: 0 },
  rain: { rain: 0.7, fog: 1.8, light: 0.55, wind: 0.5, lightning: false, watering: 0.12 },
  fog: { rain: 0, fog: 4, light: 0.6, wind: 0.05, lightning: false, watering: 0.01 },
  storm: { rain: 1, fog: 2.4, light: 0.4, wind: 1, lightning: true, watering: 0.2 },
};

/** Frost on winter nights and cold early-spring/late-autumn mornings. */
export function isFrost(hour: number, weather: Weather): boolean {
  const s = seasonOf(hour);
  const h = hourOfDay(hour);
  const cold = h < 8 || h > 21;
  if (s === 'winter') return cold || weather === 'clear';
  if ((s === 'autumn' && dayOfSeason(hour) >= SEASON_DAYS - 2) || (s === 'spring' && dayOfSeason(hour) <= 1)) return cold && weather === 'clear';
  return false;
}
