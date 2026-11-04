// Errors don't keep custom fields across Workers RPC, so DO methods return a Result.

import { HttpError } from './util';

export type Result<T> =
  | { ok: true; value: T }
  | { ok: false; status: number; code: string; message: string; extra?: Record<string, unknown> };

export async function wrap<T>(fn: () => Promise<T>): Promise<Result<T>> {
  try {
    return { ok: true, value: await fn() };
  } catch (e) {
    if (e instanceof HttpError) return { ok: false, status: e.status, code: e.code, message: e.message, extra: e.extra };
    console.error('do_error', e instanceof Error ? e.name : typeof e);
    return { ok: false, status: 500, code: 'internal', message: 'Something went wrong on our side. Try again in a moment.' };
  }
}

export function unwrap<T>(r: Result<T>): T {
  if (r.ok) return r.value;
  throw new HttpError(r.status, r.code, r.message, r.extra);
}
