import type { AccountRegistry, PlayerVault, WorldRoom } from './durable';

export interface Env {
  ACCOUNT_REGISTRY: DurableObjectNamespace<AccountRegistry>;
  PLAYER_VAULT: DurableObjectNamespace<PlayerVault>;
  WORLD_ROOM: DurableObjectNamespace<WorldRoom>;
  /** Workers Static Assets binding (the built game). Optional in tests. */
  ASSETS?: Fetcher;
  /** Comma-separated origin patterns allowed for cross-origin API calls (same-origin always allowed). */
  ALLOWED_ORIGINS?: string;
  MIN_CLIENT?: string;
  LATEST_CLIENT?: string;
}
