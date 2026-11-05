# Audio requests — 6 music loops

Generated from `assets/audio-registry.json` by `node tools/gen-audio-requests.mjs`. Do not edit by hand.

**How to deliver.**
- Drop files into `assets/incoming/audio/`, named `<id>_<nn>.<ext>` (`nn` = variant 01, 02 …). Accepted: WAV, FLAC, MP3, M4A/AAC, OGG.
- Add a license note next to each file: `<file name>.license.txt` with `owner-created` or `CC0`.
- Then run `npm run assets:ingest`.

**What ingest does.** Ingest rejects an ID that is not listed here and any file outside its duration range (±10%). It normalises loudness:
- Sounds up to 3 s: peak -6 dBFS, measured after encoding (AAC can overshoot short transients).
- Longer sounds: EBU R128 to the target shown.

It then encodes AAC (mono 80 kbps for SFX, UI and voice; stereo 96 kbps for ambience; stereo 128 kbps for music) and rejects anything over its size budget. Files are fetched on first use, never precached, and the synthesized sound stays the fallback.

**Recording style.** Dry and close, with no music beds under SFX. No real brands, voices or words: voices are wordless barks. Loops must loop seamlessly.

6 IDs. "Runtime" says what plays the file today. "Pending" means ingest ships the file but nothing plays it yet.

| # | ID (file) | Duration | Loudness | Budget | Runtime | Prompt |
|---|---|---|---|---|---|---|
| 1 | `music.dormant` (music.dormant_01) | 60–150 s, seamless loop | -18 LUFS | 2600 KB | music mood `dormant` | ambient exploration loop, sparse detuned piano and soft analog pads, minor key, 72 BPM, lonely but curious, seamless loop |
| 2 | `music.restored` (music.restored_01) | 60–150 s, seamless loop | -18 LUFS | 2600 KB | music mood `restored` | warm town loop, acoustic guitar and soft pads, dorian, 84 BPM, hopeful, seamless loop |
| 3 | `music.night` (music.night_01) | 60–150 s, seamless loop | -18 LUFS | 2600 KB | music mood `night` | night tension loop, low drones, sparse metallic pulses, 64 BPM, uneasy, seamless loop |
| 4 | `music.combat` (music.combat_01) | 45–120 s, seamless loop | -18 LUFS | 2600 KB | music mood `combat` | combat loop, driving low toms and gritty synth bass, 120 BPM, tense not heroic, seamless loop |
| 5 | `music.reboot` (music.reboot_01) | 20–45 s, one-shot | -18 LUFS | 2600 KB | pending — node online plays a synth swell | node-online triumph cue: pads swell into a bright major chord with a pulsing arpeggio, 100 BPM, ends cleanly |
| 6 | `music.title` (music.title_01) | 60–150 s, seamless loop | -18 LUFS | 2600 KB | pending — title screen uses the generative score | title theme loop: slow piano melody over warm pads, hopeful melancholy, 70 BPM, seamless loop |

**How the game uses the moods.** The game crossfades over about 1 s between loops:
- `combat` while fighting.
- `night` after dark.
- `restored` in warm, restored areas.
- `dormant` otherwise.

A missing mood falls back to the generative score.
