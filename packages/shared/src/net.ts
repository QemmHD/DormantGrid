// HTTP API and WebSocket message contracts between client and Cloudflare Worker.

export const USERNAME_RE = /^[A-Za-z0-9_-]{3,20}$/;
export const MAX_SAVE_BYTES = 512 * 1024; // compressed save blob limit
export const API_VERSION = 1;

// ---- HTTP: /api/* ----

export interface ApiError {
  ok: false;
  error: string; // machine code, e.g. 'username_taken'
  message: string; // human-readable
}

export interface ClaimRequest {
  username: string;
}
export interface ClaimResponse {
  ok: true;
  username: string;
  /** 256-bit token, hex. Client stores in IndexedDB. */
  token: string;
  /** One-time recovery code; shown once. */
  recoveryCode: string;
}

/** All authenticated requests send headers: X-DG-User, Authorization: Bearer <token> */
export interface WhoAmIResponse {
  ok: true;
  username: string;
  createdAt: number;
}

export interface RecoverRequest {
  username: string;
  recoveryCode: string;
}
/** Issues a fresh token and a fresh recovery code; old token stays valid unless revoked. */
export type RecoverResponse = ClaimResponse;

export interface LinkCreateResponse {
  ok: true;
  /** short code like 'K7Q-4MX', valid 10 minutes, single use */
  code: string;
  expiresAt: number;
}
export interface LinkRedeemRequest {
  code: string;
}
export type LinkRedeemResponse = ClaimResponse;

export interface SaveMeta {
  rev: number;
  schema: number;
  savedAt: number;
  playtime: number;
  bytes: number;
}

export interface SaveGetResponse {
  ok: true;
  meta: SaveMeta | null;
  /** base64 of deflate-compressed JSON GameSave */
  data: string | null;
}

export interface SavePutRequest {
  /** revision the client believes is current on the server (0 if none) */
  baseRev: number;
  meta: SaveMeta;
  data: string;
  /** force overwrite after conflict resolution */
  force?: boolean;
}
export interface SavePutResponse {
  ok: true;
  meta: SaveMeta;
}
export interface SaveConflictResponse {
  ok: false;
  error: 'conflict';
  message: string;
  server: SaveMeta;
}

export interface VersionResponse {
  ok: true;
  /** Builds older than this must hard-refresh. Semver-ish 'x.y.z'. */
  minClient: string;
  latest: string;
}

export interface RoomCreateResponse {
  ok: true;
  code: string; // 5 chars, A-Z0-9 without ambiguous chars
}

// ---- WebSocket: /ws/room/:code ----

export interface NetPlayerState {
  id: string; // username
  x: number;
  y: number;
  z: number;
  yaw: number;
  anim: number; // 0 idle 1 walk 2 run 3 attack 4 interact 5 dodge
  seq: number;
}

export type WorldEvent =
  | { type: 'propRemoved'; id: number }
  | { type: 'piecePlaced'; piece: import('./save').PlacedPiece }
  | { type: 'pieceRemoved'; id: number }
  | { type: 'buildingPieceRemoved'; building: number; piece: number }
  | { type: 'nodeOnline'; node: number; district: number }
  | { type: 'time'; hour: number; weather: string };

export type ClientMsg =
  | { t: 'hello'; user: string; token: string; clientVersion: string; resume?: string }
  | { t: 'state'; s: NetPlayerState }
  | { t: 'action'; seq: number; ev: WorldEvent }
  | { t: 'ping'; at: number }
  | { t: 'pingWheel'; kind: PingKind; x: number; z: number }
  | { t: 'emote'; emote: string };

export type PingKind = 'here' | 'danger' | 'loot' | 'help' | 'go';

export type ServerMsg =
  | { t: 'welcome'; you: string; host: string; players: NetPlayerState[]; resumeToken: string; hour: number; seed: number }
  | { t: 'snapshot'; players: NetPlayerState[]; at: number }
  | { t: 'event'; from: string; seq: number; ev: WorldEvent }
  | { t: 'reject'; seq: number; reason: string }
  | { t: 'join'; player: NetPlayerState }
  | { t: 'leave'; id: string; grace: boolean }
  | { t: 'pong'; at: number; server: number }
  | { t: 'ping'; from: string; kind: PingKind; x: number; z: number }
  | { t: 'emote'; from: string; emote: string }
  | { t: 'error'; error: string; message: string };

export const MAX_WS_MSG_BYTES = 8 * 1024;
export const ROOM_MAX_PLAYERS = 4;
export const NET_TICK_HZ = 10;
export const RECONNECT_GRACE_MS = 60_000;
