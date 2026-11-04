# Audio (ChatGPT can't make this)

Honest note: ChatGPT can't produce audio files.
The game has procedural Web Audio SFX and music
(Tier A). Use this list with an audio tool or a
music generator, or with CC0 packs (Kenney,
Freesound CC0 only, logged in ASSETS.md).

Formats: WAV, MP3 or M4A. Ingest converts to AAC.
SFX: mono, ≤ 2 s, peaking at −1 dBFS, 3–5 variants
each (`_01`…`_05`).
Loops: stereo, seamless, no fade at the ends.
Drop into: `assets/incoming/audio/`

## SFX
| # | ID | Description |
|---|---|---|
| 1 | sfx.hit_metal_01..05 | Crowbar on sheet metal |
| 2 | sfx.hit_wood_01..05 | Axe into timber |
| 3 | sfx.hit_stone_01..05 | Pickaxe on concrete |
| 4 | sfx.break_wood_01..03 | Crate splinters |
| 5 | sfx.break_glass_01..03 | Window shatter |
| 6 | sfx.collapse_01..03 | Wall section falls, debris |
| 7 | sfx.pickup_01..03 | Soft chime, material collected |
| 8 | sfx.craft_done_01 | Satisfying clunk plus chime |
| 9 | sfx.place_piece_01..03 | Building piece snaps |
| 10 | sfx.footstep_concrete_01..05 | |
| 11 | sfx.footstep_grass_01..05 | |
| 12 | sfx.footstep_wood_01..05 | |
| 13 | sfx.swing_01..03 | Melee whoosh |
| 14 | sfx.flesh_hit_01..03 | Muted, not gory |
| 15 | sfx.drone_alert_01 | Rising synth chirp |
| 16 | sfx.node_sync_01 | Building hum, 6 s |
| 17 | sfx.node_online_01 | Big warm power-up swell, 3 s |
| 18 | sfx.raid_horn_01 | Distant horn, 3 s |
| 19 | ui.tap_01..03 | Soft UI tick |
| 20 | ui.open_01, ui.close_01 | Panel whoosh |

## Ambience loops
| # | ID | Mood | Length |
|---|---|---|---|
| 21 | amb.ruins_day_01 | Wind, distant metal creaks | 60 s |
| 22 | amb.ruins_night_01 | Low drone, insects, far machine hum | 60 s |
| 23 | amb.haven_01 | Fire crackle, murmur, tools | 60 s |
| 24 | amb.rain_01 | Steady rain on tin and asphalt | 45 s |
| 25 | amb.outskirts_01 | Birds, wind in grass | 60 s |
| 26 | amb.machines_01 | Servo whine, hum (near patrols) | 30 s |

## Music (layered, loops)
| # | ID | Mood | BPM | Key | Length |
|---|---|---|---|---|---|
| 27 | music.ruin_pad_01 | Cold, sparse pad, low drone | 70 | D minor | 96 s |
| 28 | music.ruin_pulse_01 | Tension pulse layer for 27 | 70 | D minor | 96 s |
| 29 | music.restored_01 | Warm acoustic guitar motif | 84 | D major | 96 s |
| 30 | music.restored_layer_01 | Strings/whistle layer for 29 | 84 | D major | 96 s |
| 31 | music.danger_01 | Percussion plus distorted bass | 120 | D minor | 64 s |
| 32 | music.title_01 | Hopeful but worn theme | 76 | D major | 120 s |
| 33 | music.restore_sting_01 | One-shot reveal swell | n/a | D major | 8 s |

Layers that share a BPM and key must have the
same length so they stay in sync.
