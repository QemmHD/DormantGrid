#!/usr/bin/env node
// Writes docs/asset-requests/audio-sfx.md and audio-music.md from assets/audio-registry.json.
// Usage: node tools/gen-audio-requests.mjs
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const reg = JSON.parse(readFileSync('assets/audio-registry.json', 'utf8'));
mkdirSync('docs/asset-requests', { recursive: true });
const all = reg.audio;
const sfx = all.filter((a) => a.kind !== 'music');
const music = all.filter((a) => a.kind === 'music');
const loud = (a) => (a.loudness?.mode === 'peak' ? `peak ${a.loudness.dbfs} dBFS` : `${a.loudness?.target} LUFS`);
const rt = (a) => (a.runtime.pending ? `pending — ${a.runtime.pending}` : a.runtime.sfx ? `plays as \`${a.runtime.sfx}\`` : a.runtime.amb ? `ambience bed \`${a.runtime.amb}\`` : `music mood \`${a.runtime.music}\``);
const dur = (a) => `${a.duration[0]}–${a.duration[1]} s`;
const files = (a) => Array.from({ length: a.variants }, (_, i) => `${a.id}_${String(i + 1).padStart(2, '0')}`).join(', ');

const head = (title, n) => `# ${title}

Generated from \`assets/audio-registry.json\` by \`node tools/gen-audio-requests.mjs\`. Do not edit by hand.

**How to deliver.**
- Drop files into \`assets/incoming/audio/\`, named \`<id>_<nn>.<ext>\` (\`nn\` = variant 01, 02 …). Accepted: WAV, FLAC, MP3, M4A/AAC, OGG.
- Add a license note next to each file: \`<file name>.license.txt\` with \`owner-created\` or \`CC0\`.
- Then run \`npm run assets:ingest\`.

**What ingest does.** Ingest rejects an ID that is not listed here and any file outside its duration range (±10%). It normalises loudness:
- Sounds up to 3 s: peak -6 dBFS, measured after encoding (AAC can overshoot short transients).
- Longer sounds: EBU R128 to the target shown.

It then encodes AAC (mono 80 kbps for SFX, UI and voice; stereo 96 kbps for ambience; stereo 128 kbps for music) and rejects anything over its size budget. Files are fetched on first use, never precached, and the synthesized sound stays the fallback.

**Recording style.** Dry and close, with no music beds under SFX. No real brands, voices or words: voices are wordless barks. Loops must loop seamlessly.

${n} IDs. "Runtime" says what plays the file today. "Pending" means ingest ships the file but nothing plays it yet.
`;

let s = head('Audio requests — 60 sound effects, ambience and voice', sfx.length) + '\n';
let i = 0;
for (const group of [...new Set(sfx.map((a) => a.group))]) {
  s += `\n## ${group}\n\n| # | ID (files) | Duration | Loudness | Budget | Runtime | Prompt |\n|---|---|---|---|---|---|---|\n`;
  for (const a of sfx.filter((x) => x.group === group)) s += `| ${++i} | \`${a.id}\` (${files(a)}) | ${dur(a)}${a.loop ? ', seamless loop' : ''} | ${loud(a)} | ${a.maxKB} KB | ${rt(a)} | ${a.prompt} |\n`;
}
writeFileSync('docs/asset-requests/audio-sfx.md', s);

let m = head('Audio requests — 6 music loops', music.length) + '\n| # | ID (file) | Duration | Loudness | Budget | Runtime | Prompt |\n|---|---|---|---|---|---|---|\n';
music.forEach((a, k) => (m += `| ${k + 1} | \`${a.id}\` (${files(a)}) | ${dur(a)}${a.loop ? ', seamless loop' : ', one-shot'} | ${loud(a)} | ${a.maxKB} KB | ${rt(a)} | ${a.prompt} |\n`));
m += `
**How the game uses the moods.** The game crossfades over about 1 s between loops:
- \`combat\` while fighting.
- \`night\` after dark.
- \`restored\` in warm, restored areas.
- \`dormant\` otherwise.

A missing mood falls back to the generative score.
`;
writeFileSync('docs/asset-requests/audio-music.md', m);
console.log(`wrote ${sfx.length} SFX/ambience/voice and ${music.length} music requests (${all.filter((a) => !a.runtime.pending).length} wired at runtime, ${all.filter((a) => a.runtime.pending).length} pending)`);
