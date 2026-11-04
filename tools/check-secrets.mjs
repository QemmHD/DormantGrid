// Static check: no secret-like strings committed (tokens, keys, private keys).
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const files = execSync('git ls-files', { encoding: 'utf8' }).split('\n').filter((f) => f && !/\.(png|jpg|webp|glb|m4a|mp3|wasm|ico)$/.test(f) && !f.includes('package-lock'));
const patterns = [
  /-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  /\bAKIA[0-9A-Z]{16}\b/,
  /\bghp_[A-Za-z0-9]{36}\b/,
  /\bgithub_pat_[A-Za-z0-9_]{60,}\b/,
  /\bsk-[A-Za-z0-9]{32,}\b/,
  /CLOUDFLARE_API_TOKEN\s*[:=]\s*['"][A-Za-z0-9_-]{30,}['"]/,
  /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/,
  /\bcfut_[A-Za-z0-9]{20,}\b/, // Cloudflare user API token
  /\bcfat_[A-Za-z0-9]{20,}\b/, // Cloudflare account API token
];
let bad = 0;
for (const f of files) {
  let txt;
  try {
    txt = readFileSync(f, 'utf8');
  } catch {
    continue;
  }
  for (const p of patterns) {
    if (p.test(txt)) {
      console.error(`secret-like string in ${f}: ${p}`);
      bad++;
    }
  }
}
if (bad) process.exit(1);
console.log(`secret scan: ${files.length} files clean`);
