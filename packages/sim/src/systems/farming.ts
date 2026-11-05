// Crops: soil moisture + nutrients, seasons, weather, frost, rotation, 4 visual stages.

import type { CropSave } from '@dg/shared';
import { Rng } from '@dg/shared';
import { CROP_MAP, SEASONS, SEASON_DAYS, cropForSeed, type CropDef, type Season } from '../data/crops';
import { LIVESTOCK, type LivestockDef } from '../data/livestock';
import { WEATHER_FX, dayOfSeason, hourOfDay, isFrost, seasonOf, type Weather } from './time';

export interface CropEnv {
  hour: number;
  weather: Weather;
  /** plot connected to Grid water */
  irrigated?: boolean;
  /** 0..1 how well tended (farmer attention); untended still grows slower */
  tended?: number;
  /** perk growth bonus, e.g. 0.15 */
  growthBonus?: number;
}

export interface CropTickResult {
  stageChanged: boolean;
  ripened: boolean;
  frostHit: boolean;
}

const clamp01 = (v: number) => (Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0);

export function cropDef(c: CropSave): CropDef | undefined {
  return CROP_MAP.get(c.crop);
}

/** 0..3 visual stage; 3 = ripe. */
export function cropStage(growth: number): 0 | 1 | 2 | 3 {
  if (growth >= 1) return 3;
  if (growth >= 0.6) return 2;
  if (growth >= 0.25) return 1;
  return 0;
}

export function inSeason(def: CropDef, season: Season): boolean {
  return def.seasons.includes(season);
}

export function canPlant(seedItem: string, hour: number): boolean {
  const def = cropForSeed(seedItem);
  return !!def && inSeason(def, seasonOf(hour));
}

/** Would a crop planted now ripen before its growing window closes? (UI warning + survivor planning) */
export function willRipenInTime(def: CropDef, hour: number): boolean {
  const season = seasonOf(hour);
  if (!inSeason(def, season)) return false;
  const next = SEASONS[(SEASONS.indexOf(season) + 1) % 4];
  if (inSeason(def, next)) return true;
  const daysLeft = SEASON_DAYS - dayOfSeason(hour) - hourOfDay(hour) / 24;
  return def.growDays * 1.15 <= daysLeft;
}

/** Plant into a plot. `prev` is the plot's previous CropSave (for rotation + soil carry-over). */
export function plant(plot: number, seedItem: string, hour: number, prev?: CropSave): CropSave | null {
  const def = cropForSeed(seedItem);
  if (!def || !inSeason(def, seasonOf(hour))) return null;
  if (prev && prev.crop && prev.growth < 1 && CROP_MAP.has(prev.crop)) return null; // occupied
  return {
    plot,
    crop: def.id,
    planted: hour,
    growth: 0,
    water: prev ? prev.water : 0.5,
    nutrients: prev ? prev.nutrients : 0.8,
    lastCrop: prev?.crop || prev?.lastCrop,
  };
}

export function rotationBonus(c: CropSave): number {
  const def = cropDef(c);
  const last = c.lastCrop ? CROP_MAP.get(c.lastCrop) : undefined;
  if (!def || !last) return 1;
  return last.family !== def.family ? 1.15 : 0.92;
}

/** Growth multiplier given conditions (for UI tooltips too). */
export function growthFactor(c: CropSave, env: CropEnv): number {
  const def = cropDef(c);
  if (!def) return 0;
  const season = seasonOf(env.hour);
  if (!inSeason(def, season)) return 0.4; // lingering into the next season: slowed
  const waterF = c.water > 0.15 ? 1 : 0.2 + c.water * 4;
  const soilF = 0.5 + 0.5 * c.nutrients;
  const tendF = 0.75 + 0.35 * clamp01(env.tended ?? 0);
  return waterF * soilF * tendF * rotationBonus(c) * (1 + (env.growthBonus ?? 0));
}

export function tickCrop(c: CropSave, dtHours: number, env: CropEnv): CropTickResult {
  const res: CropTickResult = { stageChanged: false, ripened: false, frostHit: false };
  const def = cropDef(c);
  const dt = Number.isFinite(dtHours) && dtHours > 0 ? Math.min(dtHours, 48) : 0;
  if (!def || dt === 0) return res;
  const fx = WEATHER_FX[env.weather] ?? WEATHER_FX.clear;
  // water balance
  c.water = clamp01(c.water + fx.watering * dt - (def.thirst / 24) * dt * (env.weather === 'clear' ? 1.2 : 1));
  if (env.irrigated) c.water = Math.max(c.water, 0.85);
  if (c.growth >= 1) return res;
  const before = cropStage(c.growth);
  let g = (growthFactor(c, env) / (def.growDays * 24)) * dt;
  if (!def.frostHardy && isFrost(env.hour, env.weather)) {
    g = -0.01 * dt;
    res.frostHit = true;
  }
  const prevGrowth = c.growth;
  c.growth = clamp01(c.growth + g);
  c.nutrients = clamp01(c.nutrients - def.feed * Math.max(0, c.growth - prevGrowth));
  const after = cropStage(c.growth);
  res.stageChanged = after !== before;
  res.ripened = after === 3 && before !== 3;
  return res;
}

/**
 * Game hours until a crop is ripe at today's growth rate (UI growth timer). 0 when ripe,
 * Infinity when it is not growing. Assumes the soil stays as it is now; watering speeds it up.
 */
export function hoursToRipe(c: CropSave, env: CropEnv): number {
  const def = cropDef(c);
  if (!def) return Infinity;
  if (c.growth >= 1) return 0;
  const f = growthFactor(c, env);
  if (f <= 0) return Infinity;
  return ((1 - c.growth) * def.growDays * 24) / f;
}

export function waterCrop(c: CropSave): void {
  c.water = 1;
}
export function fertilize(c: CropSave): void {
  c.nutrients = clamp01(c.nutrients + 0.5);
}

/** Harvest a ripe crop. Returns produce + seeds and turns the plot fallow (crop ''). */
export function harvest(c: CropSave, rng: Rng, bonus = 0): { item: string; count: number }[] {
  const def = cropDef(c);
  if (!def || c.growth < 1) return [];
  const soilQ = 0.75 + 0.5 * c.nutrients;
  const n = Math.max(1, Math.round(rng.int(def.yield[0], def.yield[1]) * soilQ) + bonus);
  const seeds = rng.int(def.seedBack[0], def.seedBack[1]);
  c.lastCrop = def.id;
  c.crop = '';
  delete c.ripeAt;
  delete c.mine;
  c.growth = 0;
  return [
    { item: def.produce, count: n },
    { item: def.seed, count: seeds },
  ];
}

/** Livestock: one in-game day. */
export function livestockDay(def: LivestockDef, count: number, feedAvailable: number, rng: Rng, daysSinceBirth: number): { products: { item: string; count: number }[]; feedUsed: number; births: number; starving: boolean } {
  const n = Math.max(0, Math.floor(count));
  const need = def.feedPerDay * n;
  const used = Math.min(need, Math.max(0, feedAvailable));
  const fedRatio = need > 0 ? used / need : 1;
  const products: { item: string; count: number }[] = [];
  for (const p of def.products) {
    let c = 0;
    for (let i = 0; i < n; i++) if (rng.chance(p.perDay * fedRatio)) c++;
    if (c > 0) products.push({ item: p.item, count: c });
  }
  const births = n >= 2 && fedRatio > 0.9 && daysSinceBirth >= def.breedDays ? 1 : 0;
  return { products, feedUsed: used, births, starving: fedRatio < 0.5 };
}

export { LIVESTOCK };
