# Textures (ChatGPT can make these)

Format: PNG, 1024×1024, seamless tiling.
Drop into: `assets/incoming/textures/`
Add `<file>.license.txt` with `owner-created`.

## List
| # | ID | Description |
|---|---|---|
| 1 | tex.asphalt_cracked_01 | Cracked asphalt, faded lane paint |
| 2 | tex.sidewalk_slab_01 | Square concrete sidewalk slabs |
| 3 | tex.concrete_wall_01 | Stained poured concrete |
| 4 | tex.brick_red_01 | Old red brick, worn mortar |
| 5 | tex.siding_wood_01 | Horizontal painted siding, peeling |
| 6 | tex.metal_corrugated_01 | Corrugated metal, light rust |
| 7 | tex.roof_shingle_01 | Asphalt shingles, mossy |
| 8 | tex.planks_floor_01 | Wooden floor planks |
| 9 | tex.tile_clinic_01 | Pale clinic floor tiles |
| 10 | tex.grass_patchy_01 | Patchy grass and dirt |
| 11 | tex.dirt_field_01 | Plowed field rows |
| 12 | tex.gravel_rail_01 | Rail ballast gravel |
| 13 | tex.rubble_01 | Broken concrete rubble |
| 14 | tex.rust_plate_01 | Rusted steel plate |
| 15 | tex.tarp_canvas_01 | Patched canvas tarp |

## Batch prompt A (ground), IDs 1, 2, 10, 11, 12, 13
```
Make a seamless tiling game texture,
1024x1024, top-down, flat even lighting,
NO baked shadows, NO highlights, NO text.
Stylized, muted, slightly painterly, low detail
(reads well when small on a phone).
Subject: [cracked asphalt with faded lane paint]
Palette: ground #4C5054, road #2F3236,
trim #B7B2A6. Desaturated.
Edges must tile perfectly on all four sides.
```
Swap the [subject] and colors for each ID:
- 2: concrete slabs, #8D8F8C / #6E7479
- 10: patchy grass, #5C6646 / #4F6A3E / #5A5040
- 11: plowed rows, #5A5040 / #75684F
- 12: rail gravel, #4F4A42 / #332F2B
- 13: rubble, #8E8C86 / #6B6458

## Batch prompt B (walls), IDs 3–9, 14, 15
```
Seamless tiling stylized wall texture, 1024x1024,
front view, flat lighting, no shadows, no text.
Chunky simplified detail, muted colors,
slight grime gradient near the bottom edge only
if it still tiles. Subject: [old red brick]
Colors: #8C5444, #7A5E4C, mortar #B39C80.
```
Color hints:
- 3: #6E7479 / #58606A
- 5: #9A8C7A / #6F8AA0
- 6: #6B6458 / #8A4E32
- 7: #5A4640 / #4F6A3E
- 8: #8A6A48 / #75684F
- 9: #D6D6CF / #A3A6A2
- 14: #8A4E32 / #5A5E5C
- 15: #4F6670 / #C4B08A

## Tips
- Ask "make it tile seamlessly" again if the
  edges show seams.
- Keep it simple. Busy texture turns to noise on
  a phone.
