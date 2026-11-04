// Small runtime-agnostic helpers (work in workerd and Node 22 for tests).

import type { ApiError } from '@dg/shared';

export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly extra?: Record<string, unknown>,
  ) {
    super(message);
  }
}

export function json(body: unknown, status = 200, headers: HeadersInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers },
  });
}

export function errorBody(code: string, message: string): ApiError {
  return { ok: false, error: code, message };
}

export function errorResponse(e: unknown): Response {
  if (e instanceof HttpError) {
    return json({ ...errorBody(e.code, e.message), ...(e.extra ?? {}) }, e.status);
  }
  // Never echo internal error details (could include data); log only the message name.
  console.error('internal_error', e instanceof Error ? e.name : typeof e);
  return json(errorBody('internal', 'Something went wrong on our side. Try again in a moment.'), 500);
}

const HEX = '0123456789abcdef';
export function toHex(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += HEX[bytes[i] >> 4] + HEX[bytes[i] & 15];
  return s;
}

export function randomBytes(n: number): Uint8Array {
  const b = new Uint8Array(n);
  crypto.getRandomValues(b);
  return b;
}

/** 256-bit device token, 64 hex chars */
export function newToken(): string {
  return toHex(randomBytes(32));
}

// Crockford-ish alphabet without ambiguous chars (no 0/O/1/I/L/U).
export const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTVWXYZ23456789';

/** Unbiased random string from CODE_ALPHABET (rejection sampling). */
export function randomCode(len: number): string {
  const n = CODE_ALPHABET.length;
  const limit = 256 - (256 % n);
  let out = '';
  while (out.length < len) {
    const buf = randomBytes(len * 2);
    for (let i = 0; i < buf.length && out.length < len; i++) {
      if (buf[i] < limit) out += CODE_ALPHABET[buf[i] % n];
    }
  }
  return out;
}

/** Recovery code: 20 chars (~98 bits) shown as XXXXX-XXXXX-XXXXX-XXXXX */
export function newRecoveryCode(): string {
  const c = randomCode(20);
  return `${c.slice(0, 5)}-${c.slice(5, 10)}-${c.slice(10, 15)}-${c.slice(15)}`;
}

/** Strip separators/whitespace and uppercase, for comparing user-typed codes. */
export function normalizeCode(code: string): string {
  return code.replace(/[\s-]/g, '').toUpperCase();
}

export async function sha256Hex(...parts: string[]): Promise<string> {
  const data = new TextEncoder().encode(parts.join('\u0000'));
  const digest = await crypto.subtle.digest('SHA-256', data);
  return toHex(new Uint8Array(digest));
}

/** Constant-time string comparison (length leak only). */
export function timingSafeEqual(a: string, b: string): boolean {
  const len = Math.max(a.length, b.length);
  let diff = a.length ^ b.length;
  for (let i = 0; i < len; i++) {
    diff |= (a.charCodeAt(i) | 0) ^ (b.charCodeAt(i) | 0);
  }
  return diff === 0;
}

/** Read a request body as text with a hard byte cap (works without content-length). */
export async function readBodyCapped(req: Request, maxBytes: number): Promise<string> {
  const declared = req.headers.get('content-length');
  if (declared !== null) {
    const n = Number(declared);
    if (!Number.isFinite(n) || n < 0) throw new HttpError(400, 'bad_request', 'Invalid content length.');
    if (n > maxBytes) throw new HttpError(413, 'too_large', 'Request body is too large.');
  }
  if (!req.body) return '';
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => undefined);
      throw new HttpError(413, 'too_large', 'Request body is too large.');
    }
    chunks.push(value);
  }
  const all = new Uint8Array(total);
  let o = 0;
  for (const c of chunks) {
    all.set(c, o);
    o += c.byteLength;
  }
  return new TextDecoder().decode(all);
}

export async function readJson(req: Request, maxBytes: number): Promise<unknown> {
  const ct = req.headers.get('content-type') ?? '';
  if (!ct.toLowerCase().startsWith('application/json')) {
    throw new HttpError(415, 'unsupported_media_type', 'Send JSON with content-type application/json.');
  }
  const text = await readBodyCapped(req, maxBytes);
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new HttpError(400, 'bad_json', 'Request body is not valid JSON.');
  }
}

export function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Simple token bucket. Not distributed: per isolate / per object instance. */
export class TokenBucket {
  private buckets = new Map<string, { tokens: number; at: number }>();
  constructor(
    private readonly capacity: number,
    private readonly refillPerSec: number,
    private readonly maxKeys = 10_000,
  ) {}
  take(key: string, now: number, cost = 1): boolean {
    let b = this.buckets.get(key);
    if (!b) {
      if (this.buckets.size >= this.maxKeys) this.prune(now);
      b = { tokens: this.capacity, at: now };
      this.buckets.set(key, b);
    }
    const elapsed = Math.max(0, now - b.at) / 1000;
    b.tokens = Math.min(this.capacity, b.tokens + elapsed * this.refillPerSec);
    b.at = now;
    if (b.tokens < cost) return false;
    b.tokens -= cost;
    return true;
  }
  private prune(now: number): void {
    const fullAfterMs = (this.capacity / this.refillPerSec) * 1000;
    for (const [k, b] of this.buckets) if (now - b.at > fullAfterMs) this.buckets.delete(k);
    if (this.buckets.size >= this.maxKeys) this.buckets.clear();
  }
}

/** Match an origin against a list of patterns supporting a single '*' wildcard per pattern. */
export function originAllowed(origin: string, patterns: string[]): boolean {
  for (const p of patterns) {
    const pat = p.trim();
    if (!pat) continue;
    if (pat === origin) return true;
    if (pat.includes('*')) {
      const re = new RegExp('^' + pat.split('*').map(escapeRe).join('[A-Za-z0-9.-]*') + '$');
      if (re.test(origin)) return true;
    }
  }
  return false;
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Compare dotted versions 'x.y.z'. Returns -1, 0, 1. Non-numeric parts count as 0. */
export function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map((x) => parseInt(x, 10) || 0);
  const pb = b.split('.').map((x) => parseInt(x, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d < 0 ? -1 : 1;
  }
  return 0;
}
