# Characters (3D: optional)

Honest note: ChatGPT can't make rigged,
animated 3D characters. The game ships with
procedural, parametric characters and
procedural animation (Tier A). Use this sheet
only with a dedicated 3D or rigging tool
(for example Quaternius CC0 rigs, or a
text-to-3D tool plus auto-rigging).

Format: GLB, ≤ 3,000 triangles, ≤ 40 bones,
1 unit = 1 m, Y up, facing +Z, pivot between
the feet. Height about 1.75 m.
Clips: idle, walk, run, attack_light,
attack_heavy, dodge, interact, hit, die, sit,
sleep.
Drop into: `assets/incoming/characters/`

In game today: ingest validates rigged characters, but the game
still draws its procedural characters (an imported skeleton isn't
driven yet). The rigid robot enemy is used in game. See
`models-top30.md` for exact IDs, sizes and prompts.

| # | ID | Who |
|---|---|---|
| 1 | char.player_01 | Player: work jacket, backpack, scarf |
| 2 | char.survivor_a_01 | Settler, patched coat |
| 3 | char.survivor_b_01 | Settler, overalls |
| 4 | char.survivor_c_01 | Settler, hoodie, apron |
| 5 | char.reaver_grunt_01 | Ashline raider, rust-red cloth, sheet-metal armor |
| 6 | char.reaver_brute_01 | Big raider, welded shield |
| 7 | char.guild_trader_01 | Meridian engineer, hazard-band harness |
| 8 | char.drone_01 | Patrol drone, white shell, red eye |
| 9 | char.guardbot_01 | Guard bot, squat, tanky |
| 10 | char.crawler_01 | Small crawler machine |
| 11 | char.heavy_01 | Custodian heavy, 3 m tall |
| 12 | char.hound_01 | Feral hound |
| 13 | char.boar_01 | Boar |
| 14 | char.chicken_01 | Chicken |
| 15 | char.goat_01 | Goat |

Concept-art prompt (images ChatGPT CAN make):
```
Character turnaround sheet, front, side and
back, plain gray background, stylized low-poly
game character, chunky proportions, bevelled
shapes, muted colors, flat lighting, no text.
Character: [Ashline Reaver raider, rust-red
cloth wraps, sheet-metal shoulder fins, goggles].
Colors: #8C3F30 #6B6458 #3D3A36.
```
