// Service-worker update flow: new versions are fetched in the background and
// applied only at safe moments (main menu, or right after an autosave/sleep).
// Never touches IndexedDB, never signs the player out.
import { GAME_VERSION } from '@dg/shared';
import type { Bus } from '../game/api';
import type { ApiClient } from './api';

export type RegisterFn = (opts: {
  immediate?: boolean;
  onNeedRefresh?: () => void;
  onOfflineReady?: () => void;
  onRegisterError?: (e: unknown) => void;
}) => (reload?: boolean) => Promise<void>;

const UPDATED_FLAG = 'dg.updated';
const FORCE_FLAG = 'dg.forceRefreshAt';

export function cmpVersion(a: string, b: string): number {
  const pa = a.split(/[.-]/).map((x) => parseInt(x, 10) || 0);
  const pb = b.split(/[.-]/).map((x) => parseInt(x, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length, 3); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d < 0 ? -1 : 1;
  }
  return 0;
}

export interface UpdaterOptions {
  register?: RegisterFn | null;
  reload?: () => void;
  session?: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | null;
  now?: () => number;
}

export class Updater {
  needRefresh = false;
  offlineReady = false;
  private updateSW: ((reload?: boolean) => Promise<void>) | null = null;
  private applying = false;
  private readonly reload: () => void;
  private readonly session: UpdaterOptions['session'];
  private readonly now: () => number;

  constructor(
    private bus: Bus | undefined,
    private api: ApiClient | null,
    private opts: UpdaterOptions = {},
  ) {
    this.reload = opts.reload ?? (() => location.reload());
    this.session = opts.session !== undefined ? opts.session : safeSession();
    this.now = opts.now ?? (() => Date.now());
  }

  async init(): Promise<void> {
    // show the "Updated" toast once after an update reload
    try {
      const v = this.session?.getItem(UPDATED_FLAG);
      if (v) {
        this.session?.removeItem(UPDATED_FLAG);
        this.bus?.emit({ type: 'toast', kind: 'info', text: `Updated to v${GAME_VERSION}. Your progress is safe.` });
      }
    } catch {
      /* ignore */
    }
    let register = this.opts.register;
    if (register === undefined) {
      if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) register = null;
      else {
        try {
          register = (await import('./sw-register')).registerSW as unknown as RegisterFn;
        } catch {
          register = null;
        }
      }
    }
    if (!register) return;
    try {
      this.updateSW = register({
        immediate: true,
        onNeedRefresh: () => {
          this.needRefresh = true;
          this.bus?.emit({ type: 'update-ready' });
        },
        onOfflineReady: () => {
          this.offlineReady = true;
        },
        onRegisterError: () => {
          /* dev or unsupported: ignore */
        },
      });
    } catch {
      this.updateSW = null;
    }
  }

  /**
   * Apply a waiting update if this is a safe moment. Returns true if a reload
   * is underway. Call at the main menu and right after autosave/sleep saves.
   */
  applyIfSafe(isSafeMoment: boolean): boolean {
    if (!isSafeMoment || !this.needRefresh || this.applying || !this.updateSW) return false;
    this.applying = true;
    try {
      this.session?.setItem(UPDATED_FLAG, '1');
    } catch {
      /* ignore */
    }
    void this.updateSW(true).catch(() => {
      this.applying = false;
    });
    return true;
  }

  /** Force-refresh builds older than the server's minClient. Returns true if refreshing. */
  async checkMinVersion(): Promise<boolean> {
    if (!this.api || this.api.offlineOnly) return false;
    let min: string;
    try {
      min = (await this.api.version()).minClient;
    } catch {
      return false;
    }
    if (cmpVersion(GAME_VERSION, min) >= 0) return false;
    return this.forceRefresh();
  }

  /** Called on version mismatch (e.g. co-op close code 4006). Loop-guarded. */
  forceRefresh(): boolean {
    try {
      const last = Number(this.session?.getItem(FORCE_FLAG) ?? 0);
      if (last && this.now() - last < 60_000) {
        this.bus?.emit({ type: 'toast', kind: 'bad', text: 'A required update could not be installed. Close and reopen the app.' });
        return false;
      }
      this.session?.setItem(FORCE_FLAG, String(this.now()));
      this.session?.setItem(UPDATED_FLAG, '1');
    } catch {
      /* ignore */
    }
    this.bus?.emit({ type: 'toast', kind: 'warm', text: 'Updating to the latest version…' });
    if (this.updateSW && this.needRefresh) void this.updateSW(true).catch(() => this.reload());
    else this.reload();
    return true;
  }
}

function safeSession(): Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | null {
  try {
    return typeof sessionStorage !== 'undefined' ? sessionStorage : null;
  } catch {
    return null;
  }
}
