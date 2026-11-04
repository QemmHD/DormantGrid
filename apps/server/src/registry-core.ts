// AccountRegistry logic: one global object. Owns username uniqueness and link-device codes.
// Device tokens and recovery hashes live in each user's PlayerVault so authenticated
// requests touch only one Durable Object.

import { HttpError, normalizeCode, randomCode, sha256Hex } from './util';
import type { Store } from './store';

export interface NameRecord {
  display: string;
  createdAt: number;
}

interface LinkRecord {
  key: string; // username key
  expiresAt: number;
}

interface Attempts {
  count: number;
  windowStart: number;
}

export const LINK_TTL_MS = 10 * 60 * 1000;
export const CLAIMS_PER_IP_PER_HOUR = 5;
export const LINK_REDEEM_FAILS_PER_IP_PER_HOUR = 10;
export const LINK_CREATES_PER_USER_PER_HOUR = 6;
const HOUR = 3600_000;

export class RegistryCore {
  constructor(
    private readonly store: Store,
    private readonly now: () => number = Date.now,
  ) {}

  /** Throws if over the limit, otherwise counts one attempt. */
  private async limit(key: string, max: number): Promise<void> {
    const t = this.now();
    const a = (await this.store.get<Attempts>(key)) ?? { count: 0, windowStart: t };
    if (t - a.windowStart > HOUR) {
      a.count = 0;
      a.windowStart = t;
    }
    if (a.count >= max) {
      throw new HttpError(429, 'rate_limited', 'Too many attempts. Wait a while and try again.');
    }
    a.count++;
    await this.store.put(key, a);
  }

  /** Atomically reserve a username (case-insensitive). Durable Objects serialize calls, so get+put is atomic. */
  async claim(display: string, key: string, ipHash: string): Promise<NameRecord> {
    const existing = await this.store.get<NameRecord>(`name:${key}`);
    if (existing) throw new HttpError(409, 'username_taken', 'That name is taken. Try another.');
    await this.limit(`rl:claim:${ipHash}`, CLAIMS_PER_IP_PER_HOUR);
    const rec: NameRecord = { display, createdAt: this.now() };
    await this.store.put(`name:${key}`, rec);
    return rec;
  }

  /** Undo a claim if creating the vault failed. */
  async release(key: string, createdAt: number): Promise<void> {
    const rec = await this.store.get<NameRecord>(`name:${key}`);
    if (rec && rec.createdAt === createdAt) await this.store.delete(`name:${key}`);
  }

  async lookup(key: string): Promise<NameRecord | null> {
    return (await this.store.get<NameRecord>(`name:${key}`)) ?? null;
  }

  /** Create a short single-use link code for an authenticated user. */
  async createLink(key: string): Promise<{ code: string; expiresAt: number }> {
    await this.limit(`rl:linkc:${key}`, LINK_CREATES_PER_USER_PER_HOUR);
    // Invalidate this user's previous outstanding code.
    const prev = await this.store.get<string>(`linkof:${key}`);
    if (prev) await this.store.delete(`link:${prev}`);
    let raw = '';
    for (let i = 0; i < 8; i++) {
      raw = randomCode(6);
      if (!(await this.store.get(`link:${await sha256Hex('link', raw)}`))) break;
    }
    const h = await sha256Hex('link', raw);
    const expiresAt = this.now() + LINK_TTL_MS;
    await this.store.put<LinkRecord>(`link:${h}`, { key, expiresAt });
    await this.store.put(`linkof:${key}`, h);
    return { code: `${raw.slice(0, 3)}-${raw.slice(3)}`, expiresAt };
  }

  /** Redeem a link code. Single use; failures are rate-limited per IP. Returns the username key. */
  async redeemLink(code: string, ipHash: string): Promise<{ key: string; display: string }> {
    const raw = normalizeCode(code);
    const failKey = `rl:linkr:${ipHash}`;
    const t = this.now();
    const fails = (await this.store.get<Attempts>(failKey)) ?? { count: 0, windowStart: t };
    if (t - fails.windowStart > HOUR) {
      fails.count = 0;
      fails.windowStart = t;
    }
    if (fails.count >= LINK_REDEEM_FAILS_PER_IP_PER_HOUR) {
      throw new HttpError(429, 'rate_limited', 'Too many attempts. Wait a while and try again.');
    }
    const h = await sha256Hex('link', raw);
    const rec = /^[A-Z0-9]{6}$/.test(raw) ? await this.store.get<LinkRecord>(`link:${h}`) : undefined;
    if (!rec || rec.expiresAt < t) {
      if (rec) await this.store.delete(`link:${h}`);
      fails.count++;
      await this.store.put(failKey, fails);
      throw new HttpError(400, 'invalid_link_code', 'That code is wrong or has expired. Make a new one on your other device.');
    }
    await this.store.delete(`link:${h}`);
    await this.store.delete(`linkof:${rec.key}`);
    const name = await this.store.get<NameRecord>(`name:${rec.key}`);
    if (!name) throw new HttpError(400, 'invalid_link_code', 'That account no longer exists.');
    return { key: rec.key, display: name.display };
  }
}
