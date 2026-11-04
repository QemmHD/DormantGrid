// Cloud save sync with revision checks. Local is always the source of truth for
// play; the cloud is a synced copy. Conflicts ask the player (keep cloud / keep
// this device). Offline: retry with backoff, never block play.
import type { GameSave, SaveMeta } from '@dg/shared';
import { base64ToSave, saveToBase64 } from '@dg/sim';
import type { Bus, NetStatus } from '../game/api';
import type { SaveStore } from '../save/store';
import type { Account } from './account';
import { ApiFailure, conflictServerMeta, type ApiClient } from './api';

export interface ConflictSide {
  rev: number;
  savedAt: number;
  playtime: number;
}
export interface ConflictInfo {
  local: ConflictSide;
  cloud: ConflictSide;
}
export type ConflictChoice = 'cloud' | 'device';

export type StartDecision = 'none' | 'local' | 'cloud' | 'conflict';

/**
 * Pure decision table for boot.
 * @param local meta of the local save (null if none)
 * @param cloud meta of the cloud save (null if none)
 * @param cloudRev last cloud rev this device acknowledged (0 = never synced)
 */
export function decideStart(local: ConflictSide | null, cloud: ConflictSide | null, cloudRev: number): StartDecision {
  if (!local && !cloud) return 'none';
  if (!cloud) return 'local';
  if (!local) return 'cloud';
  if (cloud.rev === cloudRev) return 'local'; // cloud unchanged since our last sync
  if (cloudRev > 0 && cloud.rev > cloudRev && local.rev <= cloudRev) return 'cloud'; // only cloud moved
  if (cloudRev === 0 && local.playtime < 60) return 'cloud'; // fresh device with a throwaway local game
  if (cloudRev === 0 && cloud.playtime < 60) return 'local';
  return 'conflict';
}

export type PushResult = 'ok' | 'throttled' | 'skipped' | 'offline' | 'conflict-cloud' | 'conflict-device' | 'error';

export interface SyncOptions {
  minIntervalMs?: number;
  now?: () => number;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (h: unknown) => void;
}

const MIN_INTERVAL = 5 * 60_000;
const BACKOFF = [15_000, 30_000, 60_000, 120_000, 300_000];

export class CloudSync {
  cloudRev = 0;
  status: NetStatus = 'offline';
  lastPushAt = 0;
  /** game installs this: called when the player chooses the cloud copy */
  onLoadSave: ((save: GameSave) => void) | null = null;
  /** UI installs this: shows the conflict dialog */
  onConflict: ((info: ConflictInfo) => Promise<ConflictChoice>) | null = null;
  private pending: GameSave | null = null;
  private retryTimer: unknown = null;
  private failures = 0;
  private inFlight: Promise<PushResult> | null = null;
  private readonly minInterval: number;
  private readonly now: () => number;
  private readonly setTimer: (fn: () => void, ms: number) => unknown;
  private readonly clearTimer: (h: unknown) => void;

  constructor(
    private api: ApiClient,
    private store: SaveStore,
    private account: Account,
    private bus?: Bus,
    opts: SyncOptions = {},
  ) {
    this.minInterval = opts.minIntervalMs ?? MIN_INTERVAL;
    this.now = opts.now ?? (() => Date.now());
    this.setTimer = opts.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
    this.clearTimer = opts.clearTimer ?? ((h) => clearTimeout(h as ReturnType<typeof setTimeout>));
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => {
        if (this.pending) void this.pushNow(this.pending, 'online');
      });
    }
  }

  async init(): Promise<void> {
    this.cloudRev = (await this.store.kvGet<number>('cloudRev')) ?? 0;
  }

  private setStatus(s: NetStatus): void {
    if (this.status === s) return;
    this.status = s;
    this.bus?.emit({ type: 'net', status: s });
  }

  private get enabled(): boolean {
    return !this.api.offlineOnly && this.account.hasCreds && this.account.state !== 'revoked';
  }

  /** Throttled push (autosave cadence). */
  push(save: GameSave): Promise<PushResult> {
    this.pending = save;
    if (!this.enabled) return Promise.resolve('skipped');
    if (this.now() - this.lastPushAt < this.minInterval) return Promise.resolve('throttled');
    return this.pushNow(save, 'interval');
  }

  /** Immediate push for key events (sleep, raid ended, node rebooted, app hidden). */
  pushNow(save: GameSave, _reason = 'event'): Promise<PushResult> {
    this.pending = save;
    if (!this.enabled) return Promise.resolve('skipped');
    if (this.inFlight) return this.inFlight.then(() => (this.pending ? this.doPush(this.pending, false) : 'ok'));
    this.inFlight = this.doPush(save, false).finally(() => {
      this.inFlight = null;
    });
    return this.inFlight;
  }

  private async doPush(save: GameSave, force: boolean): Promise<PushResult> {
    this.setStatus('syncing');
    let data: string;
    try {
      data = saveToBase64(save);
    } catch {
      this.setStatus('error');
      return 'error';
    }
    const meta: SaveMeta = { rev: save.rev, schema: save.schema, savedAt: save.savedAt, playtime: save.playtime, bytes: data.length };
    try {
      const res = await this.api.putSave({ baseRev: this.cloudRev, meta, data, force: force || undefined });
      await this.ack(res.meta.rev);
      if (res.meta.rev > save.rev) save.rev = res.meta.rev; // forced push may bump rev
      this.lastPushAt = this.now();
      this.failures = 0;
      if (this.pending === save) this.pending = null;
      this.setStatus('online');
      this.bus?.emit({ type: 'saved', at: this.now(), cloud: true });
      return 'ok';
    } catch (e) {
      const server = conflictServerMeta(e);
      if (server || (e instanceof ApiFailure && e.status === 409)) return this.resolveConflict(save);
      if (e instanceof ApiFailure && e.status === 401) {
        this.account.state = 'revoked';
        this.setStatus('error');
        return 'error';
      }
      if (e instanceof ApiFailure && (e.network || e.status >= 500 || e.status === 429)) {
        this.setStatus('offline');
        this.scheduleRetry();
        return 'offline';
      }
      this.setStatus('error');
      return 'error';
    }
  }

  private scheduleRetry(): void {
    if (this.retryTimer !== null) return;
    const ms = BACKOFF[Math.min(this.failures, BACKOFF.length - 1)];
    this.failures++;
    this.retryTimer = this.setTimer(() => {
      this.retryTimer = null;
      if (this.pending) void this.pushNow(this.pending, 'retry');
    }, ms);
  }

  private async ack(rev: number): Promise<void> {
    this.cloudRev = rev;
    await this.store.kvSet('cloudRev', rev);
    await this.store.kvSet('lastSync', this.now());
  }

  /** Fetch cloud save (null meta = none). */
  async fetchCloud(): Promise<{ meta: SaveMeta; save: GameSave } | null> {
    const r = await this.api.getSave();
    if (!r.meta || !r.data) return null;
    return { meta: r.meta, save: base64ToSave(r.data) };
  }

  private async resolveConflict(local: GameSave): Promise<PushResult> {
    this.setStatus('conflict');
    let cloud: { meta: SaveMeta; save: GameSave } | null = null;
    try {
      cloud = await this.fetchCloud();
    } catch {
      cloud = null;
    }
    if (!cloud) {
      // cloud vanished or unreadable: our copy wins
      return (await this.doPush(local, true)) === 'ok' ? 'conflict-device' : 'error';
    }
    const choice = await this.ask({ local: side(local), cloud: metaSide(cloud.meta) });
    if (choice === 'device') {
      this.cloudRev = cloud.meta.rev;
      return (await this.doPush(local, true)) === 'ok' ? 'conflict-device' : 'error';
    }
    await this.ack(cloud.meta.rev);
    cloud.save.rev = Math.max(cloud.save.rev, cloud.meta.rev);
    this.pending = null;
    this.onLoadSave?.(cloud.save);
    this.setStatus('online');
    return 'conflict-cloud';
  }

  private ask(info: ConflictInfo): Promise<ConflictChoice> {
    if (this.onConflict) return this.onConflict(info);
    // no UI: newest wins
    return Promise.resolve(info.local.savedAt >= info.cloud.savedAt ? 'device' : 'cloud');
  }

  /**
   * Boot-time reconciliation. Returns the save the game should start from
   * (may be the local one, the cloud one, or null for a new game).
   */
  async pullOnStart(local: GameSave | null): Promise<GameSave | null> {
    if (!this.enabled) return local;
    let cloud: { meta: SaveMeta; save: GameSave } | null;
    try {
      this.setStatus('syncing');
      cloud = await this.fetchCloud();
      this.setStatus('online');
    } catch (e) {
      this.setStatus(e instanceof ApiFailure && e.status === 401 ? 'error' : 'offline');
      return local;
    }
    const d = decideStart(local ? side(local) : null, cloud ? metaSide(cloud.meta) : null, this.cloudRev);
    switch (d) {
      case 'none':
        return null;
      case 'local':
        if (local && (!cloud || local.rev > this.cloudRev || this.cloudRev !== cloud.meta.rev)) void this.pushNow(local, 'boot');
        return local;
      case 'cloud':
        await this.ack(cloud!.meta.rev);
        cloud!.save.rev = Math.max(cloud!.save.rev, cloud!.meta.rev);
        return cloud!.save;
      case 'conflict': {
        const choice = await this.ask({ local: side(local!), cloud: metaSide(cloud!.meta) });
        if (choice === 'cloud') {
          await this.ack(cloud!.meta.rev);
          cloud!.save.rev = Math.max(cloud!.save.rev, cloud!.meta.rev);
          return cloud!.save;
        }
        this.cloudRev = cloud!.meta.rev;
        await this.doPush(local!, true);
        return local;
      }
    }
  }
}

function side(s: GameSave): ConflictSide {
  return { rev: s.rev, savedAt: s.savedAt, playtime: s.playtime };
}

function metaSide(m: SaveMeta): ConflictSide {
  return { rev: m.rev, savedAt: m.savedAt, playtime: m.playtime };
}
