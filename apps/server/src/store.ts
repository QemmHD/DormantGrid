// Storage abstraction so Durable Object logic can be unit-tested in Node.
// In production this wraps DurableObjectStorage (SQLite-backed KV API).

export interface Store {
  get<T>(key: string): Promise<T | undefined>;
  put<T>(key: string, value: T): Promise<void>;
  delete(key: string): Promise<boolean>;
  /** List keys with a prefix (bounded). */
  list<T>(prefix: string, limit?: number): Promise<Map<string, T>>;
}

export class MemoryStore implements Store {
  readonly data = new Map<string, unknown>();
  async get<T>(key: string): Promise<T | undefined> {
    const v = this.data.get(key);
    return v === undefined ? undefined : (structuredClone(v) as T);
  }
  async put<T>(key: string, value: T): Promise<void> {
    this.data.set(key, structuredClone(value));
  }
  async delete(key: string): Promise<boolean> {
    return this.data.delete(key);
  }
  async list<T>(prefix: string, limit = 1000): Promise<Map<string, T>> {
    const out = new Map<string, T>();
    for (const k of [...this.data.keys()].sort()) {
      if (k.startsWith(prefix)) {
        out.set(k, structuredClone(this.data.get(k)) as T);
        if (out.size >= limit) break;
      }
    }
    return out;
  }
}

/** Minimal shape of DurableObjectStorage we use (keeps this file free of workers-types coupling). */
export interface DOStorageLike {
  get<T>(key: string): Promise<T | undefined>;
  put<T>(key: string, value: T): Promise<void>;
  delete(key: string): Promise<boolean>;
  list<T>(options: { prefix: string; limit?: number }): Promise<Map<string, T>>;
}

export class DOStore implements Store {
  constructor(private readonly s: DOStorageLike) {}
  get<T>(key: string): Promise<T | undefined> {
    return this.s.get<T>(key);
  }
  put<T>(key: string, value: T): Promise<void> {
    return this.s.put<T>(key, value);
  }
  delete(key: string): Promise<boolean> {
    return this.s.delete(key);
  }
  list<T>(prefix: string, limit = 1000): Promise<Map<string, T>> {
    return this.s.list<T>({ prefix, limit });
  }
}
