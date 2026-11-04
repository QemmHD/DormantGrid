// Wires store + account + cloud sync + updater + co-op for the game.
import type { GameSave } from '@dg/shared';
import type { Bus } from '../game/api';
import { SaveStore, writeEmergency, exportJSON, importJSON } from '../save/store';
import { Account } from './account';
import { ApiClient, OFFLINE_ONLY } from './api';
import { CloudSync } from './sync';
import { Updater } from './updater';
import { CoopClient } from './coop';

export type SaveReason = 'autosave' | 'sleep' | 'build' | 'raid' | 'node' | 'hidden' | 'manual' | 'menu' | 'quit' | 'death';

/** Reasons that push to the cloud immediately (others are throttled to ≤ 1 / 5 min). */
const PUSH_NOW: ReadonlySet<SaveReason> = new Set<SaveReason>(['sleep', 'raid', 'node', 'hidden', 'manual', 'quit']);
/** Reasons after which a waiting app update may be applied (reload is invisible-ish). */
const SAFE_AFTER: ReadonlySet<SaveReason> = new Set<SaveReason>(['menu', 'sleep']);

export interface BootResult {
  username: string | null;
  local: GameSave | null;
  offlineOnly: boolean;
}

export class Services {
  readonly store: SaveStore;
  readonly api: ApiClient;
  readonly account: Account;
  readonly sync: CloudSync;
  readonly updater: Updater;
  readonly coop: CoopClient;
  readonly offlineOnly = OFFLINE_ONLY;
  /** set by mountNetUI */
  showClaim: (() => Promise<'claimed' | 'offline'>) | null = null;
  private saving: Promise<unknown> = Promise.resolve();
  private lifecycleInstalled = false;

  constructor(readonly bus: Bus) {
    this.store = new SaveStore(bus);
    this.api = new ApiClient();
    this.account = new Account(this.api, this.store, bus);
    this.sync = new CloudSync(this.api, this.store, this.account, bus);
    this.updater = new Updater(bus, this.api);
    this.coop = new CoopClient(bus, this.api);
    this.coop.onUpdateRequired = () => this.updater.forceRefresh();
  }

  /**
   * Call once at startup (before the main menu). Opens storage, registers the
   * service worker, signs in silently, loads the local save and reconciles it
   * with the cloud. `local` is the save to continue from (null = no save).
   */
  async boot(): Promise<BootResult> {
    await this.store.open();
    await this.updater.init();
    if (!this.offlineOnly) {
      // fire-and-forget; forces a refresh only if this build is below minClient
      void this.updater.checkMinVersion();
    }
    await this.sync.init();
    await this.account.init();
    let local = await this.store.loadLocal();
    if (this.account.hasCreds) {
      const chosen = await this.sync.pullOnStart(local);
      if (chosen && chosen !== local) {
        await this.store.saveLocal(chosen);
        local = chosen;
      }
    }
    return { username: this.account.username, local, offlineOnly: this.offlineOnly };
  }

  /**
   * First-launch username claim. Resolves immediately if already claimed,
   * offline-only, offline right now, or the player chose "play offline" before.
   */
  async ensureAccount(): Promise<void> {
    if (this.offlineOnly || this.account.username) return;
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
    if (await this.store.kvGet<boolean>('claimSkipped')) return;
    if (!this.showClaim) return;
    const r = await this.showClaim();
    if (r === 'offline') await this.store.kvSet('claimSkipped', true);
  }

  /**
   * Save locally (bumps rev + savedAt) and push to the cloud per policy.
   * Serialized: concurrent calls queue. Safe to call often.
   */
  saveLocal(save: GameSave, reason: SaveReason): Promise<void> {
    const run = async () => {
      save.rev += 1;
      save.savedAt = Date.now();
      try {
        await this.store.saveLocal(save);
        this.bus.emit({ type: 'saved', at: save.savedAt, cloud: false });
      } catch {
        writeEmergency(save);
        this.bus.emit({ type: 'toast', kind: 'bad', text: 'Could not write your save to storage. Free up space on this device.' });
      }
      if (PUSH_NOW.has(reason)) void this.sync.pushNow(save, reason);
      else void this.sync.push(save);
      if (SAFE_AFTER.has(reason)) this.updater.applyIfSafe(true);
    };
    const p = this.saving.then(run, run);
    this.saving = p;
    return p;
  }

  /** Call when at the main menu (or another safe moment) to apply a waiting update. */
  safeMoment(): boolean {
    return this.updater.applyIfSafe(true);
  }

  /**
   * Install visibilitychange/pagehide handlers. `getSave` returns the live save
   * (or null when not in a game). Writes a synchronous emergency snapshot, then
   * a normal save + cloud push; resumes co-op on return.
   */
  attachLifecycle(getSave: () => GameSave | null): void {
    if (this.lifecycleInstalled || typeof document === 'undefined') return;
    this.lifecycleInstalled = true;
    const flush = () => {
      const s = getSave();
      if (!s) return;
      s.savedAt = Date.now();
      writeEmergency({ ...s, rev: s.rev + 1 });
      void this.saveLocal(s, 'hidden');
    };
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') flush();
      else this.coop.resume();
    });
    window.addEventListener('pagehide', flush);
  }

  exportSave(save: GameSave): string {
    return exportJSON(save);
  }

  /** Validate an imported JSON save and store it as the local save. Returns it or null (with toast). */
  async importSave(text: string): Promise<GameSave | null> {
    try {
      const s = importJSON(text);
      await this.store.saveLocal(s);
      this.bus.emit({ type: 'toast', kind: 'info', text: 'Save imported.' });
      return s;
    } catch {
      this.bus.emit({ type: 'toast', kind: 'bad', text: 'That file is not a valid DORMANT GRID save.' });
      return null;
    }
  }
}
