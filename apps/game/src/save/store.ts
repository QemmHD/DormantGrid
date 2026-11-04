// Local-first save storage. IndexedDB ('dormant-grid': stores 'saves' + 'kv'),
// with a compressed-base64 localStorage fallback (private mode / blocked IDB),
// and a last-resort in-memory backend. Never clears data on app update.
import { openDB, type IDBPDatabase } from 'idb';
import type { GameSave, SaveMeta } from '@dg/shared';
import { base64ToBytes, bytesToBase64, decodeSave, encodeSave, migrateSave } from '@dg/sim';
import type { Bus } from '../game/api';

export const DB_NAME = 'dormant-grid';
const DB_VERSION = 1;
const MAIN = 'main';
const PREV = 'main.prev';
const LS_PREFIX = 'dg.store.';
/** synchronous emergency snapshot written on pagehide (IDB writes may not finish) */
export const EMERGENCY_KEY = 'dg.emergency';

export interface StoredSave {
  meta: SaveMeta;
  bytes: Uint8Array;
}

export type Backend = 'idb' | 'local' | 'memory';

export function metaOf(save: GameSave, bytes: number): SaveMeta {
  return { rev: save.rev, schema: save.schema, savedAt: save.savedAt, playtime: save.playtime, bytes };
}

/** Decode bytes → migrated, validated save. Throws SaveError on corruption. */
export function decodeStored(bytes: Uint8Array): GameSave {
  // decodeSave inflates, parses, migrates and validates
  return decodeSave(bytes);
}

export class SaveStore {
  backend: Backend = 'memory';
  private db: IDBPDatabase | null = null;
  private mem = new Map<string, unknown>();
  private warned = false;

  constructor(
    private bus?: Bus,
    private dbName = DB_NAME,
  ) {}

  async open(): Promise<Backend> {
    try {
      if (typeof indexedDB === 'undefined') throw new Error('no indexedDB');
      this.db = await openDB(this.dbName, DB_VERSION, {
        upgrade(db) {
          if (!db.objectStoreNames.contains('saves')) db.createObjectStore('saves');
          if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv');
        },
        blocked() {
          /* another tab holds an old version; we only ever add stores */
        },
      });
      this.backend = 'idb';
    } catch {
      this.db = null;
      this.backend = lsAvailable() ? 'local' : 'memory';
      this.warnOnce();
    }
    return this.backend;
  }

  private warnOnce(): void {
    if (this.warned) return;
    this.warned = true;
    this.bus?.emit({
      type: 'toast',
      kind: 'warm',
      text:
        this.backend === 'local'
          ? 'Private browsing: saves are kept in limited storage. Add to Home Screen for safer saves.'
          : 'This browser blocks storage. Progress will be lost when you close the game.',
    });
  }

  // ---------- raw slot access ----------
  private async getRaw(slot: string): Promise<StoredSave | null> {
    if (this.db) {
      const v = (await this.db.get('saves', slot)) as StoredSave | undefined;
      return v && v.bytes ? { meta: v.meta, bytes: toU8(v.bytes) } : null;
    }
    if (this.backend === 'local') {
      try {
        const raw = localStorage.getItem(LS_PREFIX + slot);
        if (!raw) return null;
        const o = JSON.parse(raw) as { meta: SaveMeta; data: string };
        return { meta: o.meta, bytes: base64ToBytes(o.data) };
      } catch {
        return null;
      }
    }
    return (this.mem.get('save:' + slot) as StoredSave | undefined) ?? null;
  }

  private async putRaw(slot: string, v: StoredSave): Promise<void> {
    if (this.db) {
      await this.db.put('saves', v, slot);
      return;
    }
    if (this.backend === 'local') {
      try {
        localStorage.setItem(LS_PREFIX + slot, JSON.stringify({ meta: v.meta, data: bytesToBase64(v.bytes) }));
        return;
      } catch {
        this.backend = 'memory';
        this.warned = false;
        this.warnOnce();
      }
    }
    this.mem.set('save:' + slot, v);
  }

  private async delRaw(slot: string): Promise<void> {
    if (this.db) await this.db.delete('saves', slot);
    else if (this.backend === 'local') localStorage.removeItem(LS_PREFIX + slot);
    this.mem.delete('save:' + slot);
  }

  // ---------- saves ----------
  /** Write the save as 'main', keeping the previous 'main' as 'main.prev'. */
  async saveLocal(save: GameSave): Promise<SaveMeta> {
    const bytes = encodeSave(save);
    const meta = metaOf(save, bytes.length);
    const cur = await this.getRaw(MAIN);
    if (cur && cur.meta.rev !== meta.rev) await this.putRaw(PREV, cur);
    await this.putRaw(MAIN, { meta, bytes });
    return meta;
  }

  /** Load newest valid local save: main → main.prev; also considers the emergency snapshot. */
  async loadLocal(): Promise<GameSave | null> {
    let best: GameSave | null = null;
    let fellBack = false;
    for (const slot of [MAIN, PREV]) {
      const raw = await this.getRaw(slot);
      if (!raw) continue;
      try {
        best = decodeStored(raw.bytes);
        break;
      } catch {
        fellBack = true;
      }
    }
    const em = readEmergency();
    if (em && (!best || em.rev > best.rev)) {
      best = em;
      await this.saveLocal(em).catch(() => undefined);
    }
    clearEmergency();
    if (fellBack) {
      this.bus?.emit({
        type: 'toast',
        kind: best ? 'warm' : 'bad',
        text: best ? 'Your latest save was damaged. Restored the one before it.' : 'Your local save was damaged and could not be restored.',
      });
    }
    return best;
  }

  async localMeta(): Promise<SaveMeta | null> {
    return (await this.getRaw(MAIN))?.meta ?? null;
  }

  async hasLocal(): Promise<boolean> {
    return (await this.getRaw(MAIN)) !== null || (await this.getRaw(PREV)) !== null;
  }

  /** Explicit player action only (e.g. "start over"). Never called on update. */
  async clearLocal(): Promise<void> {
    const cur = await this.getRaw(MAIN);
    if (cur) await this.putRaw('main.deleted', cur); // one undo slot
    await this.delRaw(MAIN);
    await this.delRaw(PREV);
  }

  // ---------- key/value ----------
  async kvGet<T>(key: string): Promise<T | undefined> {
    if (this.db) return (await this.db.get('kv', key)) as T | undefined;
    if (this.backend === 'local') {
      try {
        const raw = localStorage.getItem(LS_PREFIX + 'kv.' + key);
        return raw === null ? undefined : (JSON.parse(raw) as T);
      } catch {
        return undefined;
      }
    }
    return this.mem.get('kv:' + key) as T | undefined;
  }

  async kvSet(key: string, v: unknown): Promise<void> {
    if (this.db) {
      await this.db.put('kv', v, key);
      return;
    }
    if (this.backend === 'local') {
      try {
        localStorage.setItem(LS_PREFIX + 'kv.' + key, JSON.stringify(v));
        return;
      } catch {
        /* fall through */
      }
    }
    this.mem.set('kv:' + key, v);
  }

  async kvDel(key: string): Promise<void> {
    if (this.db) await this.db.delete('kv', key);
    else if (this.backend === 'local') localStorage.removeItem(LS_PREFIX + 'kv.' + key);
    this.mem.delete('kv:' + key);
  }

  close(): void {
    this.db?.close();
    this.db = null;
  }
}

function toU8(b: unknown): Uint8Array {
  if (b instanceof Uint8Array) return b;
  if (b instanceof ArrayBuffer) return new Uint8Array(b);
  if (ArrayBuffer.isView(b)) return new Uint8Array(b.buffer, b.byteOffset, b.byteLength);
  return new Uint8Array(0);
}

function lsAvailable(): boolean {
  try {
    const k = '__dg_probe';
    localStorage.setItem(k, '1');
    localStorage.removeItem(k);
    return true;
  } catch {
    return false;
  }
}

/** Synchronous snapshot for pagehide/visibilitychange (IndexedDB may not finish). */
export function writeEmergency(save: GameSave): boolean {
  try {
    localStorage.setItem(EMERGENCY_KEY, bytesToBase64(encodeSave(save)));
    return true;
  } catch {
    return false;
  }
}

function readEmergency(): GameSave | null {
  try {
    const raw = localStorage.getItem(EMERGENCY_KEY);
    if (!raw) return null;
    return decodeStored(base64ToBytes(raw));
  } catch {
    return null;
  }
}

function clearEmergency(): void {
  try {
    localStorage.removeItem(EMERGENCY_KEY);
  } catch {
    /* ignore */
  }
}

// ---------- JSON export / import (safety net) ----------
export function exportJSON(save: GameSave): string {
  return JSON.stringify({ format: 'dormant-grid-save', version: 1, save }, null, 0);
}

/** Parse an exported file (or a bare GameSave JSON). Throws SaveError / SyntaxError. */
export function importJSON(text: string): GameSave {
  if (text.length > 16 * 1024 * 1024) throw new Error('File is too large to be a save.');
  const o = JSON.parse(text) as unknown;
  const inner = o && typeof o === 'object' && (o as { format?: unknown }).format === 'dormant-grid-save' ? (o as { save: unknown }).save : o;
  // the sim validator is lenient (fills defaults); an import must look like a real save
  if (!inner || typeof inner !== 'object') throw new Error('Not a save file.');
  const o2 = inner as Record<string, unknown>;
  if (typeof o2.player !== 'object' || o2.player === null || typeof o2.world !== 'object' || o2.world === null) throw new Error('Not a save file.');
  return migrateSave(inner);
}
