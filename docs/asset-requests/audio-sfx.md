# Audio requests — 60 sound effects, ambience and voice

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

60 IDs. "Runtime" says what plays the file today. "Pending" means ingest ships the file but nothing plays it yet.


## Footsteps

| # | ID (files) | Duration | Loudness | Budget | Runtime | Prompt |
|---|---|---|---|---|---|---|
| 1 | `sfx.step_concrete` (sfx.step_concrete_01, sfx.step_concrete_02, sfx.step_concrete_03, sfx.step_concrete_04) | 0.15–0.45 s | peak -6 dBFS | 60 KB | plays as `step` | single footstep, worn leather boot on dry cracked concrete, close mic, no reverb tail, slight grit scrape |
| 2 | `sfx.step_asphalt` (sfx.step_asphalt_01, sfx.step_asphalt_02, sfx.step_asphalt_03, sfx.step_asphalt_04) | 0.15–0.45 s | peak -6 dBFS | 60 KB | plays as `stepHard` | single footstep, heavy boot on asphalt road with loose grit, close, dry |
| 3 | `sfx.step_grass` (sfx.step_grass_01, sfx.step_grass_02, sfx.step_grass_03, sfx.step_grass_04) | 0.15–0.5 s | peak -6 dBFS | 60 KB | plays as `stepGrass` | single footstep on overgrown dry grass and weeds, soft crunch, close |
| 4 | `sfx.step_wood` (sfx.step_wood_01, sfx.step_wood_02, sfx.step_wood_03, sfx.step_wood_04) | 0.15–0.5 s | peak -6 dBFS | 60 KB | plays as `stepWood` | single footstep on old hollow wooden floorboards, slight creak |
| 5 | `sfx.step_metal` (sfx.step_metal_01, sfx.step_metal_02, sfx.step_metal_03, sfx.step_metal_04) | 0.15–0.5 s | peak -6 dBFS | 60 KB | plays as `stepMetal` | single footstep on thin steel grate or sheet metal, light ring |
| 6 | `sfx.step_wet` (sfx.step_wet_01, sfx.step_wet_02, sfx.step_wet_03, sfx.step_wet_04) | 0.15–0.5 s | peak -6 dBFS | 60 KB | plays as `stepWet` | single footstep in a shallow puddle on pavement, small splash |

## Movement

| # | ID (files) | Duration | Loudness | Budget | Runtime | Prompt |
|---|---|---|---|---|---|---|
| 7 | `sfx.jump` (sfx.jump_01, sfx.jump_02, sfx.jump_03) | 0.1–0.4 s | peak -6 dBFS | 60 KB | plays as `jump` | quick jump take-off: cloth rustle, short exhale, boot scuff |
| 8 | `sfx.land` (sfx.land_01, sfx.land_02, sfx.land_03) | 0.1–0.5 s | peak -6 dBFS | 60 KB | plays as `land` | landing from a short jump on concrete, two boots, gear rattle |
| 9 | `sfx.dodge_roll` (sfx.dodge_roll_01, sfx.dodge_roll_02, sfx.dodge_roll_03) | 0.3–0.7 s | peak -6 dBFS | 60 KB | pending — dodge roll has no own sound yet | fast dodge roll on gravel: body thud, backpack rattle, cloth swish |
| 10 | `sfx.breath_tired` (sfx.breath_tired_01, sfx.breath_tired_02, sfx.breath_tired_03) | 0.4–1.2 s | peak -6 dBFS | 60 KB | plays as `breath` | single tired exhale after sprinting, neutral adult voice, no words |

## Gather and break

| # | ID (files) | Duration | Loudness | Budget | Runtime | Prompt |
|---|---|---|---|---|---|---|
| 11 | `sfx.hit_wood` (sfx.hit_wood_01, sfx.hit_wood_02, sfx.hit_wood_03, sfx.hit_wood_04) | 0.1–0.6 s | peak -6 dBFS | 60 KB | plays as `hitWood` | crowbar striking a wooden pallet, dry crack, short |
| 12 | `sfx.hit_metal` (sfx.hit_metal_01, sfx.hit_metal_02, sfx.hit_metal_03, sfx.hit_metal_04) | 0.1–0.7 s | peak -6 dBFS | 60 KB | plays as `hitMetal` | crowbar striking a car door panel, metallic clang with short ring |
| 13 | `sfx.hit_stone` (sfx.hit_stone_01, sfx.hit_stone_02, sfx.hit_stone_03, sfx.hit_stone_04) | 0.1–0.6 s | peak -6 dBFS | 60 KB | plays as `hitStone` | hammer striking brick and concrete rubble, dull chip with grit |
| 14 | `sfx.hit_glass` (sfx.hit_glass_01, sfx.hit_glass_02, sfx.hit_glass_03) | 0.1–0.8 s | peak -6 dBFS | 60 KB | plays as `hitGlass` | tool hitting a window pane: crack and small shards falling |
| 15 | `sfx.break_small` (sfx.break_small_01, sfx.break_small_02, sfx.break_small_03) | 0.3–1.2 s | peak -6 dBFS | 60 KB | plays as `break` | small wooden crate breaking apart: splinter, pieces falling |
| 16 | `sfx.break_big` (sfx.break_big_01, sfx.break_big_02, sfx.break_big_03) | 0.6–2 s | peak -6 dBFS | 60 KB | plays as `breakBig` | large metal object torn apart: wrench, crunch, debris settling |
| 17 | `sfx.collapse` (sfx.collapse_01, sfx.collapse_02) | 1–4 s | -18 LUFS | 90 KB | plays as `collapse` | section of brick wall collapsing: rumble, bricks tumbling, dust settle |
| 18 | `sfx.pry_crowbar` (sfx.pry_crowbar_01, sfx.pry_crowbar_02, sfx.pry_crowbar_03) | 0.3–1 s | peak -6 dBFS | 60 KB | pending — no pry-specific event yet | crowbar prying a stuck panel: creak, strain, pop |
| 19 | `sfx.cloth_tear` (sfx.cloth_tear_01, sfx.cloth_tear_02, sfx.cloth_tear_03) | 0.2–0.8 s | peak -6 dBFS | 60 KB | pending — no cloth-specific event yet | tearing old fabric curtain, rough rip |
| 20 | `sfx.pickup` (sfx.pickup_01, sfx.pickup_02, sfx.pickup_03, sfx.pickup_04) | 0.05–0.35 s | peak -6 dBFS | 60 KB | plays as `pickup` | small items dropped into a canvas backpack, soft clink |

## Combat

| # | ID (files) | Duration | Loudness | Budget | Runtime | Prompt |
|---|---|---|---|---|---|---|
| 21 | `sfx.swing` (sfx.swing_01, sfx.swing_02, sfx.swing_03, sfx.swing_04) | 0.1–0.4 s | peak -6 dBFS | 60 KB | plays as `swing` | pipe swung through the air, whoosh |
| 22 | `sfx.hit_flesh` (sfx.hit_flesh_01, sfx.hit_flesh_02, sfx.hit_flesh_03, sfx.hit_flesh_04) | 0.1–0.5 s | peak -6 dBFS | 60 KB | plays as `hitFlesh` | blunt hit on a padded jacket, muffled thump, not gory |
| 23 | `sfx.player_hurt` (sfx.player_hurt_01, sfx.player_hurt_02, sfx.player_hurt_03, sfx.player_hurt_04) | 0.2–0.6 s | peak -6 dBFS | 60 KB | plays as `hurt` | short pained grunt, neutral adult voice, no words |
| 24 | `sfx.shot_rifle` (sfx.shot_rifle_01, sfx.shot_rifle_02, sfx.shot_rifle_03) | 0.3–1.5 s | peak -6 dBFS | 70 KB | plays as `shot` | improvised rifle shot outdoors, sharp crack, short urban echo |
| 25 | `sfx.bow_release` (sfx.bow_release_01, sfx.bow_release_02, sfx.bow_release_03) | 0.2–0.6 s | peak -6 dBFS | 60 KB | plays as `bow` | bow string release and arrow whoosh |
| 26 | `sfx.shield_block` (sfx.shield_block_01, sfx.shield_block_02, sfx.shield_block_03) | 0.15–0.6 s | peak -6 dBFS | 60 KB | pending — enemy shield block uses hitMetal pitched up | heavy steel riot shield deflecting a blow, bright clank |
| 27 | `sfx.boar_charge` (sfx.boar_charge_01, sfx.boar_charge_02) | 0.6–1.5 s | peak -6 dBFS | 60 KB | pending — boar charge uses a pitched grunt | wild boar squeal and hoof thunder starting a charge |
| 28 | `sfx.heavy_slam` (sfx.heavy_slam_01, sfx.heavy_slam_02) | 0.6–1.8 s | peak -6 dBFS | 80 KB | pending — heavy slam uses breakBig | giant robot slamming fists into the ground: deep boom, metal groan |
| 29 | `sfx.laser_lock` (sfx.laser_lock_01, sfx.laser_lock_02) | 0.4–1.4 s | peak -6 dBFS | 60 KB | pending — marksman telegraph is visual only | rising electronic targeting tone, thin and tense |
| 30 | `sfx.drone_hum` (sfx.drone_hum_01, sfx.drone_hum_02) | 0.6–2 s | peak -6 dBFS | 60 KB | plays as `drone` | small surveillance quadcopter passing: buzzing rotors, slight doppler |

## Craft and build

| # | ID (files) | Duration | Loudness | Budget | Runtime | Prompt |
|---|---|---|---|---|---|---|
| 31 | `sfx.craft` (sfx.craft_01, sfx.craft_02, sfx.craft_03) | 0.3–1.2 s | peak -6 dBFS | 60 KB | plays as `craft` | quick workbench crafting: ratchet, tap of hammer, clink |
| 32 | `sfx.place` (sfx.place_01, sfx.place_02, sfx.place_03) | 0.2–0.8 s | peak -6 dBFS | 60 KB | plays as `place` | placing a heavy timber plank: thud, settle |
| 33 | `sfx.deny` (sfx.deny_01, sfx.deny_02) | 0.1–0.4 s | peak -6 dBFS | 60 KB | plays as `deny` | soft muted negative click, not harsh |
| 34 | `sfx.eat` (sfx.eat_01, sfx.eat_02) | 0.3–1 s | peak -6 dBFS | 60 KB | plays as `eat` | opening a can and a few bites, quiet |
| 35 | `sfx.drink` (sfx.drink_01, sfx.drink_02) | 0.3–1 s | peak -6 dBFS | 60 KB | plays as `drink` | unscrewing a bottle and two gulps |
| 36 | `sfx.level_up` (sfx.level_up_01, sfx.level_up_02) | 0.6–1.6 s | peak -6 dBFS | 60 KB | plays as `levelUp` | warm rising three-note chime on a struck metal pipe, hopeful |

## UI

| # | ID (files) | Duration | Loudness | Budget | Runtime | Prompt |
|---|---|---|---|---|---|---|
| 37 | `ui.click` (ui.click_01, ui.click_02) | 0.03–0.2 s | peak -6 dBFS | 60 KB | plays as `click` | soft tactile button click, analog switch |
| 38 | `ui.open` (ui.open_01, ui.open_02) | 0.1–0.4 s | peak -6 dBFS | 60 KB | plays as `open` | canvas pack flap opening, brief |
| 39 | `ui.close` (ui.close_01, ui.close_02) | 0.1–0.4 s | peak -6 dBFS | 60 KB | plays as `close` | canvas pack flap closing, brief |
| 40 | `ui.perk_take` (ui.perk_take_01) | 0.4–1.2 s | peak -6 dBFS | 60 KB | pending — perk taken uses levelUp | bright confirming chime with a low warm pad |
| 41 | `ui.toast_warm` (ui.toast_warm_01) | 0.1–0.5 s | peak -6 dBFS | 60 KB | pending — toasts are silent | gentle positive notification blip |
| 42 | `ui.toast_bad` (ui.toast_bad_01) | 0.1–0.5 s | peak -6 dBFS | 60 KB | pending — toasts are silent | low muted warning blip |

## Grid

| # | ID (files) | Duration | Loudness | Budget | Runtime | Prompt |
|---|---|---|---|---|---|---|
| 43 | `sfx.power_up` (sfx.power_up_01, sfx.power_up_02) | 0.8–2.5 s | peak -6 dBFS | 70 KB | plays as `powerUp` | electrical substation powering up: transformer hum swelling, relay clicks |
| 44 | `sfx.node_ping` (sfx.node_ping_01, sfx.node_ping_02) | 0.2–0.8 s | peak -6 dBFS | 60 KB | plays as `node` | clean electronic interface ping, cyan-cold, short |
| 45 | `sfx.reboot_sting` (sfx.reboot_sting_01) | 2–4 s | -18 LUFS | 100 KB | pending — node online plays powerUp + levelUp | triumphant short sting: low hum bloom into a bright chord, lights-on feeling |
| 46 | `sfx.relay_route` (sfx.relay_route_01, sfx.relay_route_02) | 0.4–1.2 s | peak -6 dBFS | 60 KB | pending — relay routed uses powerUp | heavy breaker switch thrown, spark crackle |
| 47 | `sfx.alarm` (sfx.alarm_01, sfx.alarm_02) | 0.6–2 s | peak -6 dBFS | 60 KB | plays as `alarm` | old municipal alarm whoop, distant |

## World

| # | ID (files) | Duration | Loudness | Budget | Runtime | Prompt |
|---|---|---|---|---|---|---|
| 48 | `sfx.thunder` (sfx.thunder_01, sfx.thunder_02) | 2–6 s | -20 LUFS | 120 KB | plays as `thunder` | distant rolling thunder over a city |
| 49 | `sfx.bird_chirp` (sfx.bird_chirp_01, sfx.bird_chirp_02, sfx.bird_chirp_03) | 0.5–2.5 s | peak -6 dBFS | 60 KB | plays as `chirp` | two or three city songbird chirps, morning |
| 50 | `sfx.fire_crackle` (sfx.fire_crackle_01) | 2–5 s | -24 LUFS | 90 KB | pending — campfire is silent apart from the ambience | campfire crackle, small pops, loopable-feeling texture |
| 51 | `sfx.raid_horn` (sfx.raid_horn_01) | 1.5–3.5 s | -18 LUFS | 90 KB | pending — raid warning uses alarm | ragged improvised air horn blown twice from far away, menacing |

## Ambience by district state

| # | ID (files) | Duration | Loudness | Budget | Runtime | Prompt |
|---|---|---|---|---|---|---|
| 52 | `amb.dormant` (amb.dormant_01) | 20–60 s, seamless loop | -26 LUFS | 900 KB | ambience bed `dormant` | empty ruined city: low wind through broken windows, distant metal creak, no birds, no traffic |
| 53 | `amb.stabilized` (amb.stabilized_01) | 20–60 s, seamless loop | -26 LUFS | 900 KB | ambience bed `stabilized` | quiet ruined street with a few birds and a distant dog, light wind |
| 54 | `amb.powered` (amb.powered_01) | 20–60 s, seamless loop | -26 LUFS | 900 KB | ambience bed `powered` | restored street: soft electrical hum from street lamps, birds, distant generator |
| 55 | `amb.thriving` (amb.thriving_01) | 20–60 s, seamless loop | -26 LUFS | 900 KB | ambience bed `thriving` | small lively town square: distant indistinct chatter, hammering, chickens, birds |
| 56 | `amb.rain` (amb.rain_01) | 20–60 s, seamless loop | -26 LUFS | 900 KB | ambience bed `rain` | steady rain on rooftops and pavement, gutters running, no thunder |

## Survivor and faction voices

| # | ID (files) | Duration | Loudness | Budget | Runtime | Prompt |
|---|---|---|---|---|---|---|
| 57 | `vo.survivor_greet` (vo.survivor_greet_01, vo.survivor_greet_02, vo.survivor_greet_03, vo.survivor_greet_04) | 0.6–2 s | peak -6 dBFS | 60 KB | pending — barks are subtitles only | friendly tired adult voice, short greeting with no clear words (gibberish), warm |
| 58 | `vo.survivor_worried` (vo.survivor_worried_01, vo.survivor_worried_02, vo.survivor_worried_03, vo.survivor_worried_04) | 0.6–2 s | peak -6 dBFS | 60 KB | pending — barks are subtitles only | worried adult voice, short anxious murmur, no clear words |
| 59 | `vo.reaver_shout` (vo.reaver_shout_01, vo.reaver_shout_02, vo.reaver_shout_03, vo.reaver_shout_04) | 0.5–1.5 s | peak -6 dBFS | 60 KB | pending — raider barks are subtitles only | rough raider shout, aggressive, no clear words |
| 60 | `vo.custodian_announce` (vo.custodian_announce_01, vo.custodian_announce_02, vo.custodian_announce_03) | 1–3 s | peak -6 dBFS | 60 KB | pending — Custodian lines are subtitles only | synthetic municipal PA announcement voice, calm robotic tone, unintelligible |
