// Post-deploy gate: run tests/live-smoke.mjs up to N times (default 3) with a gap
// (default 15 s) between attempts. Logs exactly which checks failed on each attempt.
// Exits non-zero only if the LAST attempt fails.
// Usage: node tools/live-smoke-retry.mjs <url> [--offline] [--no-browser] [--attempts 3] [--gap 15]
import { spawnSync } from 'node:child_process';

const args = process.argv.slice(2);
const url = args.find((a) => /^https?:/.test(a));
if (!url) {
  console.error('usage: node tools/live-smoke-retry.mjs <url> [--offline] [--no-browser] [--attempts N] [--gap S]');
  process.exit(2);
}
const opt = (name, def) => {
  const i = args.indexOf(name);
  return i >= 0 ? Number(args[i + 1]) : def;
};
const attempts = opt('--attempts', 3);
const gap = opt('--gap', 15);
const pass = args.filter((a) => a === '--offline' || a === '--no-browser');

for (let n = 1; n <= attempts; n++) {
  const r = spawnSync('node', ['tests/live-smoke.mjs', url, ...pass], { encoding: 'utf8', timeout: 240_000 });
  const out = `${r.stdout ?? ''}${r.stderr ?? ''}`;
  const fails = out.split('\n').filter((l) => l.startsWith('FAIL') || /^\s{5}\d{3} /.test(l));
  if (r.status === 0) {
    console.log(`attempt ${n}/${attempts}: PASS`);
    process.exit(0);
  }
  console.log(`attempt ${n}/${attempts}: FAIL (${fails.length} line(s))`);
  for (const f of fails.length ? fails : [`exit ${r.status} ${r.signal ?? ''} — no FAIL lines captured`]) console.log(`  ${f}`);
  if (n < attempts) {
    console.log(`  retrying in ${gap}s…`);
    await new Promise((res) => setTimeout(res, gap * 1000));
  }
}
console.log('live smoke failed on the final attempt');
process.exit(1);
