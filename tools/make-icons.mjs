// Generates PWA icons and apple splash/touch icons procedurally (no external art).
import sharp from 'sharp';
import { mkdirSync } from 'node:fs';

const out = 'apps/game/public/icons';
mkdirSync(out, { recursive: true });

function svg(size, pad) {
  const s = size;
  const p = pad * s;
  const c = s / 2;
  const r = (s - 2 * p) * 0.32;
  // Dark tile, cold city silhouette, a glowing grid node ring.
  const bldg = [
    [0.18, 0.62, 0.1, 0.2], [0.29, 0.5, 0.12, 0.32], [0.42, 0.56, 0.09, 0.26],
    [0.52, 0.44, 0.13, 0.38], [0.66, 0.58, 0.1, 0.24], [0.77, 0.52, 0.08, 0.3],
  ].map(([x, y, w, h]) => `<rect x="${p + x * (s - 2 * p)}" y="${p + y * (s - 2 * p)}" width="${w * (s - 2 * p)}" height="${h * (s - 2 * p) + 1}" fill="#1c232b"/>`).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}">
  <defs>
    <radialGradient id="g" cx="50%" cy="42%" r="60%"><stop offset="0" stop-color="#2a3a40"/><stop offset="1" stop-color="#0d1014"/></radialGradient>
    <filter id="b"><feGaussianBlur stdDeviation="${s * 0.02}"/></filter>
  </defs>
  <rect width="${s}" height="${s}" fill="url(#g)"/>
  <circle cx="${c}" cy="${c * 0.86}" r="${r}" fill="none" stroke="#39E6D0" stroke-width="${s * 0.035}" filter="url(#b)" opacity="0.9"/>
  <circle cx="${c}" cy="${c * 0.86}" r="${r}" fill="none" stroke="#9ff5ea" stroke-width="${s * 0.012}"/>
  <circle cx="${c}" cy="${c * 0.86}" r="${s * 0.035}" fill="#E8A65A"/>
  ${bldg}
  <rect x="${p}" y="${p + 0.82 * (s - 2 * p)}" width="${s - 2 * p}" height="${s * 0.01}" fill="#39E6D0" opacity="0.6"/>
</svg>`;
}

await sharp(Buffer.from(svg(192, 0))).png().toFile(`${out}/icon-192.png`);
await sharp(Buffer.from(svg(512, 0))).png().toFile(`${out}/icon-512.png`);
await sharp(Buffer.from(svg(512, 0.1))).png().toFile(`${out}/icon-512-maskable.png`);
await sharp(Buffer.from(svg(180, 0))).png().toFile(`${out}/apple-touch-icon.png`);
console.log('icons written');
