// PlayerVault logic: one object per username. Holds device-token hashes, the recovery
// code hash, and the save blob with revision + last five backups.

import type { SaveMeta, SavePutRequest } from '@dg/shared';
import type { Store } from './store';
import { HttpError, newRecoveryCode, newToken, normalizeCode, sha256Hex, timingSafeEqual, toHex, randomBytes } from './util';

interface Device {
  h: string; // sha256(salt, token)
  addedAt: number;
  lastSeen: number;
}

export interface Account {
  display: string;
  key: string;
  createdAt: number;
  salt: string;
  devices: Device[];
  recovery: string; // sha256(salt, 'recovery', normalized code)
}

interface StoredSave {
  meta: SaveMeta;
  data: string;
}

interface Attempts {
  count: number;
  windowStart: number;
}

export const MAX_DEVICES = 10;
export const BACKUPS = 5;
export const AUTH_FAILS_PER_IP_PER_HOUR = 20;
export const RECOVERY_FAILS_PER_HOUR = 10;
export const SAVE_PUTS_PER_MINUTE = 20;
const HOUR = 3600_000;
const DAY = 24 * HOUR;

export interface Credentials {
  username: string;
  token: string;
  recoveryCode: string;
}

export class VaultCore {
  private putTimes: number[] = [];

  constructor(
    private readonly store: Store,
    private readonly now: () => number = Date.now,
  ) {}

  private async account(): Promise<Account | undefined> {
    return this.store.get<Account>('account');
  }

  private async countFail(key: string, max: number): Promise<void> {
    const t = this.now();
    const a = (await this.store.get<Attempts>(key)) ?? { count: 0, windowStart: t };
    if (t - a.windowStart > HOUR) {
      a.count = 0;
      a.windowStart = t;
    }
    a.count++;
    await this.store.put(key, a);
    if (a.count > max) throw new HttpError(429, 'rate_limited', 'Too many attempts. Wait a while and try again.');
  }

  private async overLimit(key: string, max: number): Promise<boolean> {
    const a = await this.store.get<Attempts>(key);
    return !!a && this.now() - a.windowStart <= HOUR && a.count >= max;
  }

  /** Called once right after the registry reserves the name. */
  async create(display: string, key: string): Promise<Credentials> {
    if (await this.account()) throw new HttpError(409, 'username_taken', 'That name is taken. Try another.');
    const salt = toHex(randomBytes(16));
    const token = newToken();
    const recoveryCode = newRecoveryCode();
    const t = this.now();
    const acc: Account = {
      display,
      key,
      createdAt: t,
      salt,
      devices: [{ h: await sha256Hex(salt, token), addedAt: t, lastSeen: t }],
      recovery: await sha256Hex(salt, 'recovery', normalizeCode(recoveryCode)),
    };
    await this.store.put('account', acc);
    return { username: display, token, recoveryCode };
  }

  /** Verify a device token. Returns the account or throws 401. Constant-time over all devices. */
  async auth(token: string, ipHash: string): Promise<Account> {
    const failKey = `rl:auth:${ipHash}`;
    if (await this.overLimit(failKey, AUTH_FAILS_PER_IP_PER_HOUR)) {
      throw new HttpError(429, 'rate_limited', 'Too many attempts. Wait a while and try again.');
    }
    const acc = await this.account();
    // Hash even when the account is missing so timing doesn't reveal existence.
    const h = await sha256Hex(acc?.salt ?? '00', token);
    let match = -1;
    if (acc) {
      for (let i = 0; i < acc.devices.length; i++) {
        if (timingSafeEqual(acc.devices[i].h, h)) match = i;
      }
    }
    if (!acc || match < 0) {
      await this.countFail(failKey, AUTH_FAILS_PER_IP_PER_HOUR);
      throw new HttpError(401, 'unauthorized', 'This device is not signed in to that account.');
    }
    const t = this.now();
    // Only write lastSeen at most daily to save SQLite row writes.
    if (t - acc.devices[match].lastSeen > DAY) {
      acc.devices[match].lastSeen = t;
      await this.store.put('account', acc);
    }
    return acc;
  }

  private async issueDevice(acc: Account): Promise<Credentials> {
    const token = newToken();
    const recoveryCode = newRecoveryCode();
    const t = this.now();
    acc.devices.push({ h: await sha256Hex(acc.salt, token), addedAt: t, lastSeen: t });
    if (acc.devices.length > MAX_DEVICES) {
      acc.devices.sort((a, b) => b.lastSeen - a.lastSeen);
      acc.devices.length = MAX_DEVICES;
    }
    // Recovery codes are single-use: every issuance rotates the code.
    acc.recovery = await sha256Hex(acc.salt, 'recovery', normalizeCode(recoveryCode));
    await this.store.put('account', acc);
    return { username: acc.display, token, recoveryCode };
  }

  /** Recovery-code sign-in on a new device. Rotates the recovery code. */
  async recover(code: string): Promise<Credentials> {
    const failKey = 'rl:recover';
    if (await this.overLimit(failKey, RECOVERY_FAILS_PER_HOUR)) {
      throw new HttpError(429, 'rate_limited', 'Too many attempts. Wait an hour and try again.');
    }
    const acc = await this.account();
    const h = await sha256Hex(acc?.salt ?? '00', 'recovery', normalizeCode(code));
    if (!acc || !timingSafeEqual(acc.recovery, h)) {
      await this.countFail(failKey, RECOVERY_FAILS_PER_HOUR);
      throw new HttpError(401, 'invalid_recovery', 'That recovery code does not match this username.');
    }
    return this.issueDevice(acc);
  }

  /** Add a device after a valid link-code redeem (registry already verified the code). */
  async addDevice(): Promise<Credentials> {
    const acc = await this.account();
    if (!acc) throw new HttpError(404, 'not_found', 'That account no longer exists.');
    return this.issueDevice(acc);
  }

  async getSave(): Promise<{ meta: SaveMeta | null; data: string | null }> {
    const s = await this.store.get<StoredSave>('save');
    return s ? { meta: s.meta, data: s.data } : { meta: null, data: null };
  }

  async listBackups(): Promise<SaveMeta[]> {
    const out: SaveMeta[] = [];
    for (let i = 0; i < BACKUPS; i++) {
      const b = await this.store.get<StoredSave>(`backup:${i}`);
      if (b) out.push(b.meta);
    }
    return out;
  }

  /**
   * Store a save. Rules:
   *  - baseRev must equal the server's current rev (0 when none) and meta.rev must be greater,
   *    otherwise 409 conflict (unless force).
   *  - force stores anyway with rev = max(meta.rev, server.rev + 1).
   *  - The previous save rotates into backup:0..4 (newest first).
   */
  async putSave(req: SavePutRequest): Promise<SaveMeta> {
    const t = this.now();
    this.putTimes = this.putTimes.filter((x) => t - x < 60_000);
    if (this.putTimes.length >= SAVE_PUTS_PER_MINUTE) {
      throw new HttpError(429, 'rate_limited', 'Saving too often. The game will retry shortly.');
    }
    this.putTimes.push(t);

    const cur = await this.store.get<StoredSave>('save');
    const serverRev = cur?.meta.rev ?? 0;
    const meta: SaveMeta = { ...req.meta, bytes: req.data.length };
    if (!req.force && (req.baseRev !== serverRev || meta.rev <= serverRev)) {
      throw new HttpError(409, 'conflict', 'The cloud save changed on another device.', { server: cur?.meta ?? null });
    }
    if (req.force) meta.rev = Math.max(meta.rev, serverRev + 1);
    if (cur) {
      for (let i = BACKUPS - 1; i > 0; i--) {
        const prev = await this.store.get<StoredSave>(`backup:${i - 1}`);
        if (prev) await this.store.put(`backup:${i}`, prev);
      }
      await this.store.put('backup:0', cur);
    }
    await this.store.put<StoredSave>('save', { meta, data: req.data });
    return meta;
  }
}
