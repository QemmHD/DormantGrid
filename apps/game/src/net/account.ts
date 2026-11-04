// Passwordless identity: claim a username once, then silent sign-in with the
// device token stored in IndexedDB. Recovery code + link-device flows.
import { USERNAME_RE, type ClaimResponse, type LinkCreateResponse } from '@dg/shared';
import type { Bus } from '../game/api';
import type { SaveStore } from '../save/store';
import { ApiFailure, type ApiClient } from './api';

/** Small client-side list; the server has the authoritative filter. */
const BLOCKED = ['fuck', 'shit', 'cunt', 'nigg', 'fag', 'rape', 'nazi', 'hitler', 'whore', 'slut', 'retard'];

/** Returns a player-facing problem with the name, or null if it looks fine. */
export function usernameProblem(name: string): string | null {
  const n = name.trim();
  if (n.length < 3) return 'At least 3 characters.';
  if (n.length > 20) return 'At most 20 characters.';
  if (!USERNAME_RE.test(n)) return 'Letters, numbers, _ and - only. No spaces.';
  const flat = n
    .toLowerCase()
    .replace(/[_-]/g, '')
    .replace(/0/g, 'o')
    .replace(/1/g, 'i')
    .replace(/3/g, 'e')
    .replace(/4/g, 'a')
    .replace(/5/g, 's')
    .replace(/7/g, 't');
  if (BLOCKED.some((w) => flat.includes(w))) return 'Pick a different name.';
  return null;
}

export type AccountState = 'none' | 'signed-in' | 'offline' | 'revoked';

export class Account {
  username: string | null = null;
  createdAt = 0;
  state: AccountState = 'none';

  constructor(
    private api: ApiClient,
    private store: SaveStore,
    private bus?: Bus,
  ) {}

  get signedIn(): boolean {
    return this.state === 'signed-in';
  }
  /** We hold credentials (may be offline right now). */
  get hasCreds(): boolean {
    return this.api.creds !== null;
  }

  /** Silent sign-in with the stored token. Never shows UI. */
  async init(): Promise<AccountState> {
    const user = await this.store.kvGet<string>('username');
    const token = await this.store.kvGet<string>('deviceToken');
    if (!user || !token) {
      this.state = 'none';
      return this.state;
    }
    this.username = user;
    this.api.creds = { user, token };
    try {
      const me = await this.api.whoami();
      this.username = me.username;
      this.createdAt = me.createdAt;
      this.state = 'signed-in';
      if (me.username !== user) await this.store.kvSet('username', me.username);
    } catch (e) {
      if (e instanceof ApiFailure && (e.status === 401 || e.status === 403)) {
        // token revoked or account gone: keep local saves, ask the player to recover
        this.state = 'revoked';
        this.bus?.emit({ type: 'toast', kind: 'bad', text: 'This device was signed out. Use your recovery code in Account to get back in.' });
      } else {
        this.state = 'offline';
      }
    }
    return this.state;
  }

  private async adopt(r: ClaimResponse): Promise<string> {
    this.api.creds = { user: r.username, token: r.token };
    this.username = r.username;
    this.state = 'signed-in';
    await this.store.kvSet('username', r.username);
    await this.store.kvSet('deviceToken', r.token);
    await this.store.kvSet('recoveryShown', false);
    await this.store.kvSet('cloudRev', 0);
    await requestPersist();
    return r.recoveryCode;
  }

  /** Claim a new username. Returns the one-time recovery code. */
  async claim(username: string): Promise<string> {
    const problem = usernameProblem(username);
    if (problem) throw new ApiFailure(400, 'invalid_username', problem);
    return this.adopt(await this.api.claim(username.trim()));
  }

  /** Recover on this device. Returns a NEW recovery code (the old one stops working). */
  async recover(username: string, code: string): Promise<string> {
    return this.adopt(await this.api.recover(username.trim(), code.trim()));
  }

  createLink(): Promise<LinkCreateResponse> {
    return this.api.linkCreate();
  }

  /** Redeem a link code from another device. Returns a NEW recovery code. */
  async redeemLink(code: string): Promise<string> {
    return this.adopt(await this.api.linkRedeem(code.trim().toUpperCase()));
  }

  async markRecoveryShown(): Promise<void> {
    await this.store.kvSet('recoveryShown', true);
  }
}

export async function requestPersist(): Promise<boolean> {
  try {
    if (typeof navigator !== 'undefined' && navigator.storage?.persist) {
      if (await navigator.storage.persisted?.()) return true;
      return await navigator.storage.persist();
    }
  } catch {
    /* ignore */
  }
  return false;
}
