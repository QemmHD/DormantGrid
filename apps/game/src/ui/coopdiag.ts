// Co-op diagnostics overlay (Settings → Co-op diagnostics): connection state, round-trip
// time, snapshot age and a desync counter, plus "Copy co-op report" for two-device tests.
import type { CoopClient } from '../net/coop';
import type { Settings } from '../game/api';
import { S } from './strings';
import { tap } from './dom';

export class CoopDiag {
  readonly el: HTMLDivElement;
  private lines: HTMLDivElement;
  private pre: HTMLPreElement;
  private t = 0;

  constructor(
    private coop: CoopClient,
    private settings: () => Settings,
    private toast: (text: string) => void,
  ) {
    this.el = document.createElement('div');
    this.el.className = 'coop-diag';
    this.el.setAttribute('data-coop-diag', '');
    const title = document.createElement('b');
    title.textContent = S.coopDiag.title;
    this.lines = document.createElement('div');
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn small';
    btn.textContent = S.coopDiag.copy;
    btn.setAttribute('data-coop-copy', '');
    tap(btn, () => void this.copy());
    this.pre = document.createElement('pre');
    this.pre.className = 'coop-report';
    this.el.append(title, this.lines, btn, this.pre);
    for (const ev of ['touchstart', 'touchend', 'mousedown'] as const) this.el.addEventListener(ev, (e) => e.stopPropagation());
    document.getElementById('ui')?.append(this.el);
    this.refresh();
  }

  /** call each frame; redraws 4×/s */
  update(dt: number): void {
    this.t -= dt;
    if (this.t > 0) return;
    this.t = 0.25;
    this.refresh();
  }

  private refresh(): void {
    const on = this.settings().coopDiag;
    this.el.style.display = on ? '' : 'none';
    if (!on) return;
    const c = this.coop;
    const age = c.snapshotAge();
    const rows = [
      S.coopDiag.state(c.status, c.code, c.playerIds.length + (c.status === 'online' ? 1 : 0)),
      S.coopDiag.rtt(Math.round(c.rtt)),
      S.coopDiag.age(Number.isFinite(age) ? Math.round(age) : null),
      S.coopDiag.desync(c.desyncs, c.diag.rejects, c.diag.outOfOrder),
      S.coopDiag.reconnects(c.diag.reconnects),
    ];
    const html = rows.map((r) => `<div>${r}</div>`).join('');
    if (this.lines.innerHTML !== html) this.lines.innerHTML = html;
    this.el.dataset.status = c.status;
  }

  private async copy(): Promise<void> {
    const text = JSON.stringify(this.coop.report(), null, 2);
    this.pre.textContent = text;
    try {
      await navigator.clipboard.writeText(text);
      this.toast(S.coopDiag.copied);
    } catch {
      // no clipboard permission (or iOS without a gesture): show it selected instead
      this.pre.style.display = 'block';
      const r = document.createRange();
      r.selectNodeContents(this.pre);
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(r);
      this.toast(S.coopDiag.copyFailed);
    }
  }
}
