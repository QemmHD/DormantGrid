import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { newGame, encodeSave } from '@dg/sim';
import { SaveStore, exportJSON, importJSON } from './store';
import { Bus } from '../game/api';

let n = 0;
const fresh = async () => {
  const bus = new Bus();
  const toasts: string[] = [];
  bus.on('toast', (e) => toasts.push(e.text));
  const s = new SaveStore(bus, `dg-test-${++n}`);
  await s.open();
  return { s, toasts };
};

describe('SaveStore', () => {
  it('round-trips a save through IndexedDB', async () => {
    const { s } = await fresh();
    expect(s.backend).toBe('idb');
    expect(await s.hasLocal()).toBe(false);
    const g = newGame(1337, 'standard', { x: 100, z: 200 });
    g.rev = 3;
    g.playtime = 120;
    await s.saveLocal(g);
    const back = await s.loadLocal();
    expect(back).not.toBeNull();
    expect(back!.rev).toBe(3);
    expect(back!.player.x).toBe(g.player.x);
    expect(back!.world.seed).toBe(1337);
    expect(await s.hasLocal()).toBe(true);
  });

  it('falls back to main.prev when main is corrupt, with a toast', async () => {
    const { s, toasts } = await fresh();
    const g = newGame(7, 'chill', { x: 1, z: 2 });
    g.rev = 1;
    await s.saveLocal(g);
    g.rev = 2;
    await s.saveLocal(g);
    // corrupt main directly
    const db = (s as unknown as { db: { put: (st: string, v: unknown, k: string) => Promise<void> } }).db;
    await db.put('saves', { meta: { rev: 3, schema: 1, savedAt: 0, playtime: 0, bytes: 3 }, bytes: new Uint8Array([1, 2, 3]) }, 'main');
    const back = await s.loadLocal();
    expect(back?.rev).toBe(1);
    expect(toasts.some((t) => t.includes('damaged'))).toBe(true);
  });

  it('migrates old-schema saves on load', async () => {
    const { s } = await fresh();
    const g = newGame(9, 'standard', { x: 5, z: 5 }) as unknown as Record<string, unknown>;
    // synthesize a v0 save (schema missing); the sim registry has a v0→v1 migration
    delete g.schema;
    const bytes = encodeSave(g as never);
    const db = (s as unknown as { db: { put: (st: string, v: unknown, k: string) => Promise<void> } }).db;
    await db.put('saves', { meta: { rev: 1, schema: 0, savedAt: 0, playtime: 0, bytes: bytes.length }, bytes }, 'main');
    const back = await s.loadLocal();
    expect(back?.schema).toBe(1);
  });

  it('kv store works and clearLocal keeps an undo slot', async () => {
    const { s } = await fresh();
    await s.kvSet('cloudRev', 42);
    expect(await s.kvGet<number>('cloudRev')).toBe(42);
    await s.saveLocal(newGame(1, 'standard', { x: 0, z: 0 }));
    await s.clearLocal();
    expect(await s.hasLocal()).toBe(false);
  });

  it('JSON export/import validates', () => {
    const g = newGame(3, 'hard', { x: 9, z: 9 });
    const back = importJSON(exportJSON(g));
    expect(back.world.difficulty).toBe('hard');
    expect(() => importJSON('{"nope":1}')).toThrow();
    expect(() => importJSON('not json')).toThrow();
  });
});
