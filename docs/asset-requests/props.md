# Props (3D: ChatGPT can't build these)

Honest note: ChatGPT can't output real 3D models.
Every prop below already exists as built-in
(Tier A) art, so this sheet is optional.
If you use a 3D tool (Blender, a text-to-3D app,
or Kenney/Quaternius CC0 packs), follow these specs.

Format: GLB, ≤ 800 triangles, ≤ 5 materials,
1 unit = 1 m, Y up, forward −Z, pivot at the
center of the base. Textures ≤ 1024 px.
Drop into: `assets/incoming/props/`

| # | ID | Size (m) | Notes |
|---|---|---|---|
| 1 | prop.car_sedan_01 | 4.4×1.8×1.4 | Rusted, flat tires |
| 2 | prop.van_01 | 5×2×2.2 | Boxy delivery van |
| 3 | prop.bus_01 | 11×2.5×3 | City bus, broken windows |
| 4 | prop.tree_oak_01 | 6 tall | Chunky canopy blobs |
| 5 | prop.tree_pine_01 | 8 tall | Stacked cone tiers |
| 6 | prop.bush_01 | 1.2 | Rounded blob |
| 7 | prop.rock_01 | 1.5 | Faceted |
| 8 | prop.rubble_01 | 2×2×0.8 | Concrete chunks |
| 9 | prop.barrel_01 | 0.6×0.9 | Steel drum |
| 10 | prop.crate_01 | 1×1×1 | Wooden crate |
| 11 | prop.dumpster_01 | 2×1.2×1.3 | |
| 12 | prop.bench_01 | 1.8 long | |
| 13 | prop.streetlight_01 | 6 tall | Grid lamp, glow ring |
| 14 | prop.sign_01 | 2.5 tall | Blank pictogram sign |
| 15 | prop.hydrant_01 | 0.8 tall | |
| 16 | prop.fence_chain_01 | 2 wide | |
| 17 | prop.pallet_01 | 1.2×1×0.15 | |
| 18 | prop.container_01 | 6×2.4×2.6 | Shipping container |
| 19 | prop.locker_01 | 0.5×0.5×1.8 | |
| 20 | prop.shelf_01 | 1.2×0.4×1.8 | |
| 21 | prop.table_01 | 1.4×0.8×0.75 | |
| 22 | prop.chair_wood_01 | 0.5×0.5×0.9 | |
| 23 | prop.bed_01 | 2×1×0.5 | Mattress on frame |
| 24 | prop.sofa_01 | 2×0.9×0.8 | |
| 25 | prop.fridge_01 | 0.7×0.7×1.8 | |
| 26 | prop.stove_01 | 0.7×0.6×0.9 | |
| 27 | prop.terminal_01 | 0.6×0.5×1.4 | Grid lore terminal, screen #39E6D0 |
| 28 | prop.node_core_01 | 2×2×3 | Grid control node, ring motif |

## If you use an image-to-3D tool
Make a concept image first with ChatGPT:
```
Single game prop concept, 3/4 view, plain light
gray background, stylized low-poly, chunky
bevelled shapes, muted colors, flat lighting.
No text or logos. Subject: [rusted city bus
with broken windows]. Palette: #6E7479,
#8A4E32, #3A3E44.
```
Feed the image to your 3D tool, then decimate
to the triangle budget before export.
