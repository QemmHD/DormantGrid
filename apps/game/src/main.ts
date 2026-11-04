// Entry point: boot sequence, iOS Safari hardening, then hand off to Game.
import { errors } from './core/errors';
import { LOADING_TIPS } from './content/tips';

errors.install();

// iOS Safari hardening: block pinch-zoom, double-tap zoom, rubber-banding.
document.addEventListener('gesturestart', (e) => e.preventDefault());
document.addEventListener('dblclick', (e) => e.preventDefault());
let lastTouchEnd = 0;
document.addEventListener(
  'touchend',
  (e) => {
    const now = Date.now();
    if (now - lastTouchEnd < 300 && (e.target as HTMLElement)?.tagName !== 'INPUT') e.preventDefault();
    lastTouchEnd = now;
  },
  { passive: false },
);
if ('ontouchstart' in window || navigator.maxTouchPoints > 0) document.documentElement.classList.add('touch');

const fill = document.getElementById('boot-fill') as HTMLElement;
const tip = document.getElementById('boot-tip') as HTMLElement;
let tipIdx = Math.floor(Math.random() * LOADING_TIPS.length);
const showTip = () => {
  const t = LOADING_TIPS[tipIdx % LOADING_TIPS.length];
  tip.textContent = typeof t === 'string' ? t : String((t as { text?: string }).text ?? '');
  tipIdx++;
};
showTip();
const tipTimer = window.setInterval(showTip, 4500);

export function bootProgress(p: number, label?: string): void {
  fill.style.width = `${Math.round(Math.min(1, p) * 100)}%`;
  if (label) tip.dataset.label = label;
}

export function bootDone(): void {
  window.clearInterval(tipTimer);
  const el = document.getElementById('boot')!;
  el.classList.add('hide');
  setTimeout(() => el.remove(), 800);
}

async function start() {
  bootProgress(0.1);
  if (new URLSearchParams(location.search).has('spike')) {
    const { runSpike } = await import('./spike');
    bootProgress(0.6);
    await runSpike();
    bootDone();
    return;
  }
  if (new URLSearchParams(location.search).get('ui') === 'harness') {
    const { runHarness } = await import('./ui/harness');
    await runHarness();
    bootDone();
    return;
  }
  const { Game } = await import('./game/game');
  bootProgress(0.3);
  const game = new Game();
  (window as unknown as { __dg: unknown }).__dg = game;
  await game.boot((p) => bootProgress(0.3 + p * 0.7));
  bootDone();
}

start().catch((e) => {
  errors.push(`boot failed: ${e?.message ?? e}`);
  tip.textContent = 'Something went wrong while waking the city. Pull down to reload, or reopen the app.';
  console.error(e);
});
