import { describe, expect, it } from 'vitest';
import { SAVE_SCHEMA_VERSION, Rng, type GameSave } from '@dg/shared';
import {
  base64ToBytes,
  base64ToSave,
  bytesToBase64,
  decodeSave,
  encodeSave,
  mergeConflictInfo,
  migrateSave,
  newGame,
  saveToBase64,
  SaveError,
  validateSave,
} from '../src/save/index';

function sample(): GameSave {
  const s = newGame(1337, 'standard', { x: 226, z: 658 });
  s.rev = 7;
  s.savedAt = 1_700_000_000_000;
  s.playtime = 1234.5;
  s.player.inventory[0] = { id: 'mat.scrap', n: 12 };
  s.player.inventory[1] = { id: 'tool.crowbar', n: 1, d: 80 };
  s.player.conditions.push({ id: 'bleeding', t: 2 });
  s.world.removedProps = [5, 3, 3, 9];
  s.world.removedPieces = { '12': [0, 4, 5] };
  s.world.pieces.push({ id: 4, piece: 'wall', tier: 1, x: 10, y: 0, z: 12, rot: 1, hp: 200, store: [null, { id: 'food.berries', n: 3, t: 20 }] });
  s.world.survivors.push({
    id: 1, name: 'Marta Kowal', seed: 99, traits: ['stubborn', 'green_thumb'],
    stats: { str: 4, dex: 6, int: 5, cha: 7, grit: 8 }, skills: { farming: 120 }, mood: 60, loyalty: 55,
    hunger: 70, rest: 80, health: 100, job: 'auto', x: 230, z: 660, bed: 4, injured: false, alive: true,
  });
  s.world.crops.push({ plot: 4, crop: 'carrot', planted: 30, growth: 0.4, water: 0.5, nutrients: 0.8 });
  s.world.flags.tutorialDone = true;
  return s;
}

describe('save round trip', () => {
  it('newGame produces a valid current-schema save', () => {
    const s = newGame(42, 'chill', { x: 1, z: 2 });
    expect(s.schema).toBe(SAVE_SCHEMA_VERSION);
    expect(validateSave(JSON.parse(JSON.stringify(s)))).toEqual(s);
    expect(s.player.x).toBe(1);
    expect(s.world.districts.length).toBe(9);
  });

  it('encode/decode and base64 round trip preserve data', () => {
    const s = sample();
    const back = decodeSave(encodeSave(s));
    expect(back.player).toEqual(s.player);
    expect(back.world.removedProps).toEqual([3, 5, 9]); // deduped + sorted
    expect(back.world.pieces).toEqual(s.world.pieces);
    expect(back.world.survivors).toEqual(s.world.survivors);
    expect(base64ToSave(saveToBase64(s))).toEqual(back);
    const bytes = new Uint8Array([0, 1, 2, 250, 255, 128, 7]);
    for (let n = 0; n <= bytes.length; n++) expect(base64ToBytes(bytesToBase64(bytes.slice(0, n)))).toEqual(bytes.slice(0, n));
  });

  it('clamps out-of-range numbers and rejects NaN', () => {
    const raw = JSON.parse(JSON.stringify(sample()));
    raw.player.health = 500;
    raw.player.hunger = -20;
    expect(validateSave(raw).player.health).toBe(100);
    expect(validateSave(raw).player.hunger).toBe(0);
    raw.player.thirst = NaN;
    expect(() => validateSave(raw)).toThrow(SaveError);
  });

  it('conflict info reports both sides', () => {
    const a = sample();
    const b = { ...sample(), rev: 9, savedAt: a.savedAt + 1000, playtime: 3000 };
    const info = mergeConflictInfo(a, b);
    expect(info.local.rev).toBe(7);
    expect(info.cloud.playtime).toBe(3000);
    expect(info.newer).toBe('cloud');
  });
});

describe('save migrations', () => {
  it('migrates the v0 prototype format to the current schema', () => {
    const v0 = {
      v: 0,
      player: { pos: [10, 0, 20], food: 50, water: 40, health: 90, items: [{ id: 'mat.timber', n: 5 }] },
      world: { seed: 77, hour: 30, removedProps: [1, 2] },
      playtime: 600,
    };
    const s = migrateSave(v0);
    expect(s.schema).toBe(SAVE_SCHEMA_VERSION);
    expect(s.player.x).toBe(10);
    expect(s.player.z).toBe(20);
    expect(s.player.hunger).toBe(50);
    expect(s.player.thirst).toBe(40);
    expect(s.player.inventory[0]).toEqual({ id: 'mat.timber', n: 5 });
    expect(s.world.seed).toBe(77);
    expect(s.playtime).toBe(600);
  });

  it('current-schema saves pass straight through', () => {
    const s = sample();
    expect(migrateSave(JSON.parse(JSON.stringify(s))).player).toEqual(s.player);
  });

  it('rejects saves from the future', () => {
    const raw = JSON.parse(JSON.stringify(sample()));
    raw.schema = SAVE_SCHEMA_VERSION + 1;
    expect(() => migrateSave(raw)).toThrow(/future_version/);
  });
});

describe('save corruption fuzz', () => {
  const expectSaveError = (fn: () => unknown) => {
    try {
      fn();
    } catch (e) {
      expect(e).toBeInstanceOf(SaveError);
      return;
    }
    // decoding garbage must never silently succeed
    throw new Error('expected SaveError');
  };

  it('random bytes never crash, always SaveError', () => {
    const r = new Rng(9);
    for (let k = 0; k < 200; k++) {
      const b = new Uint8Array(r.int(0, 300));
      for (let i = 0; i < b.length; i++) b[i] = r.int(0, 255);
      expectSaveError(() => decodeSave(b));
    }
  });

  it('truncated saves throw SaveError', () => {
    const bytes = encodeSave(sample());
    for (const n of [0, 1, 5, Math.floor(bytes.length / 2), bytes.length - 1]) expectSaveError(() => decodeSave(bytes.slice(0, n)));
  });

  it('wrong types and garbage values throw SaveError', () => {
    const base = JSON.parse(JSON.stringify(sample()));
    const r = new Rng(31);
    const garbage = [null, 'x', 42, true, [], {}, [1, 'a'], { nested: { deep: 1 } }, -1, 1e300];
    const paths: string[][] = [
      ['player'], ['world'], ['player', 'x'], ['player', 'inventory'], ['player', 'conditions'], ['world', 'pieces'],
      ['world', 'survivors'], ['world', 'removedPieces'], ['world', 'factions'], ['world', 'districts'], ['rev'],
      ['world', 'crops'], ['world', 'flags'], ['player', 'quick'], ['world', 'townStock'],
    ];
    for (let k = 0; k < 300; k++) {
      const s = JSON.parse(JSON.stringify(base));
      const path = paths[r.int(0, paths.length - 1)];
      let o = s;
      for (let i = 0; i < path.length - 1; i++) o = o[path[i]];
      o[path[path.length - 1]] = garbage[r.int(0, garbage.length - 1)];
      try {
        const v = migrateSave(s);
        // if accepted, it must be internally valid (re-validates cleanly)
        expect(validateSave(JSON.parse(JSON.stringify(v)))).toEqual(v);
      } catch (e) {
        expect(e).toBeInstanceOf(SaveError);
      }
    }
    expectSaveError(() => migrateSave(null));
    expectSaveError(() => migrateSave('save'));
    expectSaveError(() => migrateSave([]));
    expectSaveError(() => base64ToSave('!!!not base64!!!'));
  });
});
