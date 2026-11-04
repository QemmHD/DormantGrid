// Typed fetch client for the Worker's /api/* routes (same origin).
// When built with VITE_OFFLINE_ONLY=1 (GitHub Pages fallback) every call fails
// fast with code 'offline_only' and the game stays fully playable.
import type {
  ClaimResponse,
  LinkCreateResponse,
  RoomCreateResponse,
  SaveConflictResponse,
  SaveGetResponse,
  SaveMeta,
  SavePutRequest,
  SavePutResponse,
  VersionResponse,
  WhoAmIResponse,
} from '@dg/shared';

export const OFFLINE_ONLY: boolean = (() => {
  try {
    return import.meta.env?.VITE_OFFLINE_ONLY === '1';
  } catch {
    return false;
  }
})();

/** Error thrown by every API call. `status` 0 = network/timeout. */
export class ApiFailure extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly body: unknown = null,
  ) {
    super(message);
    this.name = 'ApiFailure';
  }
  get network(): boolean {
    return this.status === 0;
  }
}

const FRIENDLY: Record<string, string> = {
  offline: "You're offline. Your progress is saved on this device and will sync later.",
  timeout: 'The server took too long to answer. Try again in a moment.',
  offline_only: 'Online features are not available in this build.',
  unauthorized: 'This device is no longer signed in.',
  rate_limited: 'Too many tries. Wait a minute and try again.',
  server: 'The server had a problem. Your progress is safe on this device.',
  bad_response: 'The server sent something unexpected. Try again later.',
};

export function friendly(e: unknown): string {
  if (e instanceof ApiFailure) return e.message || FRIENDLY[e.code] || FRIENDLY.server;
  return FRIENDLY.server;
}

export interface Creds {
  user: string;
  token: string;
}

type FetchFn = (input: string, init?: RequestInit) => Promise<Response>;

export interface ApiOptions {
  base?: string;
  fetchFn?: FetchFn;
  timeoutMs?: number;
  offlineOnly?: boolean;
}

function isObj(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null && !Array.isArray(x);
}

function isMeta(x: unknown): x is SaveMeta {
  return isObj(x) && typeof x.rev === 'number' && typeof x.schema === 'number' && typeof x.savedAt === 'number' && typeof x.playtime === 'number';
}

function isClaim(x: unknown): x is ClaimResponse {
  return isObj(x) && x.ok === true && typeof x.username === 'string' && typeof x.token === 'string' && typeof x.recoveryCode === 'string';
}

export class ApiClient {
  creds: Creds | null = null;
  readonly base: string;
  readonly offlineOnly: boolean;
  private fetchFn: FetchFn;
  private timeoutMs: number;

  constructor(opts: ApiOptions = {}) {
    this.base = opts.base ?? '/api';
    this.fetchFn = opts.fetchFn ?? ((i, init) => fetch(i, init));
    this.timeoutMs = opts.timeoutMs ?? 10_000;
    this.offlineOnly = opts.offlineOnly ?? OFFLINE_ONLY;
  }

  async request<T>(method: 'GET' | 'POST' | 'PUT', path: string, body?: unknown, auth = false, check?: (x: unknown) => boolean): Promise<T> {
    if (this.offlineOnly) throw new ApiFailure(0, 'offline_only', FRIENDLY.offline_only);
    const headers: Record<string, string> = {};
    if (body !== undefined) headers['content-type'] = 'application/json';
    if (auth) {
      if (!this.creds) throw new ApiFailure(401, 'unauthorized', FRIENDLY.unauthorized);
      headers['X-DG-User'] = this.creds.user;
      headers['Authorization'] = `Bearer ${this.creds.token}`;
    }
    const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      ctl?.abort();
    }, this.timeoutMs);
    let res: Response;
    try {
      res = await this.fetchFn(this.base + path, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: ctl?.signal,
        cache: 'no-store',
        credentials: 'omit',
      });
    } catch {
      throw new ApiFailure(0, timedOut ? 'timeout' : 'offline', timedOut ? FRIENDLY.timeout : FRIENDLY.offline);
    } finally {
      clearTimeout(timer);
    }
    let data: unknown = null;
    try {
      data = await res.json();
    } catch {
      data = null;
    }
    if (!res.ok || !isObj(data) || data.ok !== true) {
      const code = isObj(data) && typeof data.error === 'string' ? data.error : res.status === 429 ? 'rate_limited' : res.status >= 500 ? 'server' : 'bad_response';
      const msg = isObj(data) && typeof data.message === 'string' && data.message.length < 300 ? data.message : FRIENDLY[code] ?? FRIENDLY.server;
      throw new ApiFailure(res.status || 500, code, msg, data);
    }
    if (check && !check(data)) throw new ApiFailure(res.status, 'bad_response', FRIENDLY.bad_response, data);
    return data as T;
  }

  version(): Promise<VersionResponse> {
    return this.request('GET', '/version', undefined, false, (x) => isObj(x) && typeof x.minClient === 'string');
  }
  claim(username: string): Promise<ClaimResponse> {
    return this.request('POST', '/claim', { username }, false, isClaim);
  }
  whoami(): Promise<WhoAmIResponse> {
    return this.request('GET', '/whoami', undefined, true, (x) => isObj(x) && typeof x.username === 'string');
  }
  recover(username: string, recoveryCode: string): Promise<ClaimResponse> {
    return this.request('POST', '/recover', { username, recoveryCode }, false, isClaim);
  }
  linkCreate(): Promise<LinkCreateResponse> {
    return this.request('POST', '/link/create', {}, true, (x) => isObj(x) && typeof x.code === 'string' && typeof x.expiresAt === 'number');
  }
  linkRedeem(code: string): Promise<ClaimResponse> {
    return this.request('POST', '/link/redeem', { code }, false, isClaim);
  }
  getSave(): Promise<SaveGetResponse> {
    return this.request('GET', '/save', undefined, true, (x) => isObj(x) && (x.meta === null || isMeta(x.meta)) && (x.data === null || typeof x.data === 'string'));
  }
  /** Resolves with the new meta, or throws ApiFailure(409,'conflict') whose `.body.server` is the cloud meta. */
  putSave(req: SavePutRequest): Promise<SavePutResponse> {
    return this.request('PUT', '/save', req, true, (x) => isObj(x) && isMeta(x.meta));
  }
  createRoom(seed?: number): Promise<RoomCreateResponse> {
    return this.request('POST', '/room', seed === undefined ? {} : { seed }, true, (x) => isObj(x) && typeof x.code === 'string');
  }
}

export function conflictServerMeta(e: unknown): SaveMeta | null {
  if (e instanceof ApiFailure && e.status === 409 && isObj(e.body)) {
    const s = (e.body as unknown as SaveConflictResponse).server;
    return isMeta(s) ? s : null;
  }
  return null;
}
