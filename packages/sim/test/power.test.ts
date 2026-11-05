// P9/P10: power gates needsPower machines; Grid water irrigates crops.
import { describe, expect, it } from 'vitest';
import { DISTRICT_KEYS, type CropSave } from '@dg/shared';
import { newGame } from '../src/save/index';
import { PIECES } from '../src/data/pieces';
import { clinicOn, districtPowered, havenPowerSource, irrigationOn } from '../src/systems/grid';
import { tickCrop } from '../src/systems/farming';

const K = DISTRICT_KEYS;
const idx = (k: string) => K.indexOf(k as (typeof K)[number]);

describe('Grid power', () => {
  it('the three powered machines are flagged needsPower', () => {
    expect(PIECES.filter((p) => p.needsPower).map((p) => p.id).sort()).toEqual(['floodlight', 'turret', 'workbench3']);
  });
  it('a new game has no power anywhere, Haven included', () => {
    const w = newGame(1, 'standard', { x: 0, z: 0 }).world;
    for (let i = 0; i < K.length; i++) expect(districtPowered(w, K, i), K[i]).toBe(false);
    expect(havenPowerSource(w, K)).toBe(null);
  });
  it('one node of three is not enough; a fully rebooted district is Powered and feeds Haven', () => {
    const w = newGame(1, 'standard', { x: 0, z: 0 }).world;
    w.districts[idx('downtown')] = { state: 1, nodesOnline: [0] };
    expect(districtPowered(w, K, idx('haven'))).toBe(false);
    w.districts[idx('market')] = { state: 2, nodesOnline: [5] };
    expect(districtPowered(w, K, idx('market'))).toBe(true);
    expect(districtPowered(w, K, idx('haven'))).toBe(true);
    expect(havenPowerSource(w, K)).toBe('market');
    // other districts are not fed by a remote one
    expect(districtPowered(w, K, idx('downtown'))).toBe(false);
  });
  it('clinic opens with a Powered hospital', () => {
    const w = newGame(1, 'standard', { x: 0, z: 0 }).world;
    expect(clinicOn(w, K)).toBe(false);
    w.districts[idx('hospital')] = { state: 2, nodesOnline: [9] };
    expect(clinicOn(w, K)).toBe(true);
  });
});

describe('Grid water', () => {
  it('irrigation starts when a Waterworks pump node syncs', () => {
    const w = newGame(1, 'standard', { x: 0, z: 0 }).world;
    expect(irrigationOn(w, K)).toBe(false);
    w.districts[idx('waterworks')] = { state: 1, nodesOnline: [11] };
    expect(irrigationOn(w, K)).toBe(true);
  });
  it('irrigated crops never dry out; unirrigated ones do', () => {
    const mk = (): CropSave => ({ plot: 1, crop: 'potato', planted: 0, growth: 0.1, water: 0.5, nutrients: 0.8 });
    const dry = mk(), wet = mk();
    for (let h = 0; h < 72; h++) {
      tickCrop(dry, 1, { hour: 8 * 24 * 30 + h, weather: 'clear', tended: 0 });
      tickCrop(wet, 1, { hour: 8 * 24 * 30 + h, weather: 'clear', tended: 0, irrigated: true });
    }
    expect(wet.water).toBeGreaterThanOrEqual(0.85);
    expect(dry.water).toBeLessThan(0.5);
    expect(wet.growth).toBeGreaterThan(dry.growth);
  });
});
