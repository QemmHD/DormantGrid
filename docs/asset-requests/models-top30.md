# Top 30 models: request sheet (generated)

> Generated from `assets/registry.json` by `tools/gen-model-requests.mjs`. Edit the registry, not this file.

## Read this first (honest notes)

- **ChatGPT cannot output a finished, rigged GLB.** It *can* produce two useful things, so every entry has two prompts:
  1. **Reference sheet prompt** (image). Feed the image to an image-to-3D tool (for example Meshy, Tripo, Rodin or Hunyuan3D) or model it by hand in Blender.
  2. **Blender script prompt**, only for simple rigid shapes. ChatGPT writes a Python script; you run it in Blender (Scripting tab, Run) and it exports the GLB directly.
- **Characters need a rig** to animate: auto-rig the mesh (Mixamo or AccuRIG), then add the listed clips. The game's procedural animation can't drive an imported skeleton yet, so rigged characters are **validated but not used in game yet** (`runtime: pending`).
- **Buildings are validated but not drawn yet** (`runtime: pending`). The game's buildings are destructible piece by piece and their footprints vary, so a single GLB can't replace them without more work. Props and the robot enemy are **live**: drop them in and they replace the procedural versions.
- **Procedural fallback always stays.** A missing, broken or over-budget model is reported in `assets/REPORT.md` and the game keeps the built-in version.

## Rules for every model

- GLB, 1 unit = 1 m, **Y up, front faces +Z** (the glTF standard), pivot at the **center of the base** (characters: between the feet).
- Apply all transforms. No cameras or lights. At most 5 materials. Textures at most the listed size (power of two).
- File name: `<ID>_01.glb` (variants `_02`, `_03`...). Folder: `assets/incoming/<folder>/`. Add `<file>.license.txt` containing `owner-created` (or the real license).
- Run `npm run assets:ingest`, then read `assets/REPORT.md`. Ingest checks the size against the table (±35% ok, 3x off = rejected as wrong units), the pivot, a 90° rotation, triangles, bones, clips, and texture memory.
- **iPhone budgets:** triangles are per instance; "typical visible" shows how many draw at once, so a prop's real cost is tris × visible. Texture MB is resident GPU memory (RGBA + mips). The whole game must stay under 150 MB of textures and 300k visible triangles. Prop budgets here are set so a full swap stays near today's procedural cost; after adding models, run `node tests/budget-tris.mjs` (fails over 300k).

## Summary

| # | ID | Folder | Size W×H×D (m) | Tris | Texture | Tex MB | Rig / clips | Typical visible | In game |
|---|---|---|---|---|---|---|---|---|---|
| 1 | `bldg.haven_shelter` | buildings/ | 16 × 7.5 × 12 | 5000 | 1024 px | 5.4 | — | 1 | pending |
| 2 | `bldg.grid_node` | buildings/ | 5 × 6 × 5 | 3000 | 1024 px | 5.4 | — | 1 | pending |
| 3 | `bldg.townhouse` | buildings/ | 8 × 7 × 10 | 3000 | 1024 px | 5.4 | — | 1 | pending |
| 4 | `bldg.apartment_block` | buildings/ | 16 × 13 × 12 | 5000 | 1024 px | 5.4 | — | 1 | pending |
| 5 | `bldg.corner_shop` | buildings/ | 10 × 7 × 10 | 3500 | 1024 px | 5.4 | — | 1 | pending |
| 6 | `bldg.office_tower` | buildings/ | 16 × 22 × 16 | 6000 | 1024 px | 5.4 | — | 1 | pending |
| 7 | `bldg.clinic` | buildings/ | 14 × 8 × 12 | 4000 | 1024 px | 5.4 | — | 1 | pending |
| 8 | `bldg.warehouse` | buildings/ | 20 × 9 × 16 | 3000 | 1024 px | 5.4 | — | 1 | pending |
| 9 | `bldg.factory` | buildings/ | 24 × 12 × 18 | 5000 | 1024 px | 5.4 | — | 1 | pending |
| 10 | `bldg.pumphouse` | buildings/ | 10 × 7 × 8 | 3000 | 1024 px | 5.4 | — | 1 | pending |
| 11 | `char.player` | characters/ | 0.6 × 1.8 × 0.4 | 3000 | 1024 px | 5.4 | ≤40 bones; idle, walk, run, interact, attack_light, attack_heavy, dodge, hit, die | 1 | pending |
| 12 | `char.survivor` | characters/ | 0.6 × 1.75 × 0.4 | 2500 | 1024 px | 5.4 | ≤40 bones; idle, walk, run, interact, sit, sleep, hit | 1 | pending |
| 13 | `char.raider_grunt` | characters/ | 0.65 × 1.8 × 0.45 | 3000 | 1024 px | 5.4 | ≤40 bones; idle, walk, run, attack_light, attack_heavy, hit, die | 1 | pending |
| 14 | `char.raider_brute` | characters/ | 0.9 × 2 × 0.6 | 3000 | 1024 px | 5.4 | ≤40 bones; idle, walk, run, attack_heavy, hit, die | 1 | pending |
| 15 | `char.robot_sentinel` | characters/ | 1.2 × 2.3 × 1 | 3000 | 1024 px | 5.4 | rigid (no bones) | 1 | **live** |
| 16 | `prop.car_sedan` | props/ | 1.8 × 1.45 × 4.3 | 900 | 512 px | 1.4 | — | 40 | **live** |
| 17 | `prop.van_delivery` | props/ | 2 × 2.2 × 5 | 900 | 512 px | 1.4 | — | 10 | **live** |
| 18 | `prop.bus_city` | props/ | 2.5 × 3 × 11.2 | 1200 | 1024 px | 5.4 | — | 3 | **live** |
| 19 | `prop.container_shipping` | props/ | 2.5 × 2.6 × 6 | 400 | 512 px | 1.4 | — | 8 | **live** |
| 20 | `prop.dumpster` | props/ | 2 × 1.4 × 1.45 | 400 | 512 px | 1.4 | — | 10 | **live** |
| 21 | `prop.barrel_steel` | props/ | 0.6 × 0.9 × 0.6 | 200 | 256 px | 0.35 | — | 40 | **live** |
| 22 | `prop.crate_wood` | props/ | 0.72 × 0.7 × 0.72 | 150 | 256 px | 0.35 | — | 40 | **live** |
| 23 | `prop.barrier_jersey` | props/ | 2.9 × 0.82 × 0.62 | 150 | 256 px | 0.35 | — | 10 | **live** |
| 24 | `prop.cone_traffic` | props/ | 0.36 × 0.66 × 0.36 | 120 | 256 px | 0.35 | — | 20 | **live** |
| 25 | `prop.streetlight` | props/ | 0.3 × 5.6 × 1.3 | 300 | 256 px | 0.35 | — | 20 | **live** |
| 26 | `prop.bench` | props/ | 1.8 × 0.9 × 0.6 | 300 | 256 px | 0.35 | — | 10 | **live** |
| 27 | `prop.sign_street` | props/ | 0.8 × 2.5 × 0.1 | 100 | 256 px | 0.35 | — | 20 | **live** |
| 28 | `prop.tree_oak` | props/ | 3.4 × 4.6 × 3.4 | 300 | 512 px | 1.4 | — | 120 | **live** |
| 29 | `prop.tree_pine` | props/ | 3.2 × 5 × 3.2 | 200 | 512 px | 1.4 | — | 120 | **live** |
| 30 | `prop.bush` | props/ | 1.6 × 1 × 1.6 | 120 | 256 px | 0.35 | — | 80 | **live** |

If every model shipped at its texture budget at once: 97.6 MB resident (budget 150 MB).

## Key buildings

### 1. `bldg.haven_shelter`

- **What:** Haven's community shelter: a converted two-storey brick school annex. Boarded lower windows, patched tin roof, warm amber string lights, a hand-painted (no text) mural, sandbags at the door, rain barrels, a rooftop water tank.
- **Size:** 16 m wide (X) x 7.5 m tall (Y) x 12 m deep (Z)
- **Budget:** ≤ 5000 triangles, texture ≤ 1024 px (5.4 MB resident)
- **File:** `assets/incoming/buildings/bldg.haven_shelter_01.glb` + `bldg.haven_shelter_01.glb.license.txt`
- **Replaces:** building `shelter`; in game: pending (validated only)

Reference sheet prompt (paste into ChatGPT):

```
Create a clean building elevation sheet for a 3D artist to model from. Subject: Haven's community shelter: a converted two-storey brick school annex. Boarded lower windows, patched tin roof, warm amber string lights, a hand-painted (no text) mural, sandbags at the door, rain barrels, a rooftop water tank. Real-world size: 16 m wide (X) x 7.5 m tall (Y) x 12 m deep (Z). Keep these proportions exactly in every view. Views: front elevation, side elevation, back elevation and a 3/4 aerial view, all orthographic, on a plain light-grey background, evenly spaced, same scale in every view, with a thin 1 m scale bar. Show material breaks clearly (paint, metal, wood, glass) as flat color areas. Design for a low-poly game model of about 5000 triangles: big readable shapes, no thin fiddly details, no fur or foliage cards. Style: DORMANT GRID, a stylized post-collapse town. Muted, gritty, NOT photoreal. Chunky simplified shapes with bevelled edges, low-poly friendly forms, desaturated colors with strong light/dark contrast, flat even lighting (no baked shadows or highlights). The only glow color is Grid cyan-teal #39E6D0 and only on power hardware. No text, no logos, no brands, no real-world trademarks, no watermark.
```

### 2. `bldg.grid_node`

- **What:** Dormant Grid control node: a squat concrete-and-steel substation pylon with a waist-high terminal, cable trays running into the ground, and a ring of cyan-teal (#39E6D0) light strips that are dark when off. Bolted access panels, warning chevrons in faded paint, no text.
- **Size:** 5 m wide (X) x 6 m tall (Y) x 5 m deep (Z)
- **Budget:** ≤ 3000 triangles, texture ≤ 1024 px (5.4 MB resident)
- **File:** `assets/incoming/buildings/bldg.grid_node_01.glb` + `bldg.grid_node_01.glb.license.txt`
- **Replaces:** node `control`; in game: pending (validated only)

Reference sheet prompt (paste into ChatGPT):

```
Create a clean building elevation sheet for a 3D artist to model from. Subject: Dormant Grid control node: a squat concrete-and-steel substation pylon with a waist-high terminal, cable trays running into the ground, and a ring of cyan-teal (#39E6D0) light strips that are dark when off. Bolted access panels, warning chevrons in faded paint, no text. Real-world size: 5 m wide (X) x 6 m tall (Y) x 5 m deep (Z). Keep these proportions exactly in every view. Views: front elevation, side elevation, back elevation and a 3/4 aerial view, all orthographic, on a plain light-grey background, evenly spaced, same scale in every view, with a thin 1 m scale bar. Show material breaks clearly (paint, metal, wood, glass) as flat color areas. Design for a low-poly game model of about 3000 triangles: big readable shapes, no thin fiddly details, no fur or foliage cards. Style: DORMANT GRID, a stylized post-collapse town. Muted, gritty, NOT photoreal. Chunky simplified shapes with bevelled edges, low-poly friendly forms, desaturated colors with strong light/dark contrast, flat even lighting (no baked shadows or highlights). The only glow color is Grid cyan-teal #39E6D0 and only on power hardware. No text, no logos, no brands, no real-world trademarks, no watermark.
```

Blender script prompt (paste into ChatGPT, run the script in Blender):

```
Write a single Python script for Blender 4.x that builds this game asset from primitives and exports it as GLB: Dormant Grid control node: a squat concrete-and-steel substation pylon with a waist-high terminal, cable trays running into the ground, and a ring of cyan-teal (#39E6D0) light strips that are dark when off. Bolted access panels, warning chevrons in faded paint, no text. Exact size: 5 m wide (X) x 6 m tall (Y) x 5 m deep (Z); 1 Blender unit = 1 m. Model it so the FRONT faces +Y in Blender (it becomes +Z in glTF) and the base sits on Z=0 centered on the origin. Use bevelled cubes/cylinders (bevel 0.02-0.05 m), at most 5 materials with flat base colors (Principled BSDF base color only, no textures), apply all transforms and modifiers, merge into ONE mesh object, triangulate, keep it under 3000 triangles (print the triangle count at the end). Delete the default cube/camera/light first. Export with bpy.ops.export_scene.gltf(filepath='//bldg.grid_node_01.glb', export_format='GLB', export_yup=True, export_apply=True, export_cameras=False, export_lights=False). Colors: muted and desaturated; Grid hardware may use #39E6D0 as an emissive accent only.
```

### 3. `bldg.townhouse`

- **What:** Two-storey suburban townhouse, gable roof with a dormer, covered porch with two steps, siding with brick base, one broken window, gutters, a chimney. Neglected but structurally intact.
- **Size:** 8 m wide (X) x 7 m tall (Y) x 10 m deep (Z)
- **Budget:** ≤ 3000 triangles, texture ≤ 1024 px (5.4 MB resident)
- **File:** `assets/incoming/buildings/bldg.townhouse_01.glb` + `bldg.townhouse_01.glb.license.txt`
- **Replaces:** building `house`; in game: pending (validated only)

Reference sheet prompt (paste into ChatGPT):

```
Create a clean building elevation sheet for a 3D artist to model from. Subject: Two-storey suburban townhouse, gable roof with a dormer, covered porch with two steps, siding with brick base, one broken window, gutters, a chimney. Neglected but structurally intact. Real-world size: 8 m wide (X) x 7 m tall (Y) x 10 m deep (Z). Keep these proportions exactly in every view. Views: front elevation, side elevation, back elevation and a 3/4 aerial view, all orthographic, on a plain light-grey background, evenly spaced, same scale in every view, with a thin 1 m scale bar. Show material breaks clearly (paint, metal, wood, glass) as flat color areas. Design for a low-poly game model of about 3000 triangles: big readable shapes, no thin fiddly details, no fur or foliage cards. Style: DORMANT GRID, a stylized post-collapse town. Muted, gritty, NOT photoreal. Chunky simplified shapes with bevelled edges, low-poly friendly forms, desaturated colors with strong light/dark contrast, flat even lighting (no baked shadows or highlights). The only glow color is Grid cyan-teal #39E6D0 and only on power hardware. No text, no logos, no brands, no real-world trademarks, no watermark.
```

### 4. `bldg.apartment_block`

- **What:** Four-storey brick walk-up apartment block, flat roof with parapet and water tank, stacked windows with stone sills and lintels, a fire escape on one side, a recessed entry with a metal awning.
- **Size:** 16 m wide (X) x 13 m tall (Y) x 12 m deep (Z)
- **Budget:** ≤ 5000 triangles, texture ≤ 1024 px (5.4 MB resident)
- **File:** `assets/incoming/buildings/bldg.apartment_block_01.glb` + `bldg.apartment_block_01.glb.license.txt`
- **Replaces:** building `apartment`; in game: pending (validated only)

Reference sheet prompt (paste into ChatGPT):

```
Create a clean building elevation sheet for a 3D artist to model from. Subject: Four-storey brick walk-up apartment block, flat roof with parapet and water tank, stacked windows with stone sills and lintels, a fire escape on one side, a recessed entry with a metal awning. Real-world size: 16 m wide (X) x 13 m tall (Y) x 12 m deep (Z). Keep these proportions exactly in every view. Views: front elevation, side elevation, back elevation and a 3/4 aerial view, all orthographic, on a plain light-grey background, evenly spaced, same scale in every view, with a thin 1 m scale bar. Show material breaks clearly (paint, metal, wood, glass) as flat color areas. Design for a low-poly game model of about 5000 triangles: big readable shapes, no thin fiddly details, no fur or foliage cards. Style: DORMANT GRID, a stylized post-collapse town. Muted, gritty, NOT photoreal. Chunky simplified shapes with bevelled edges, low-poly friendly forms, desaturated colors with strong light/dark contrast, flat even lighting (no baked shadows or highlights). The only glow color is Grid cyan-teal #39E6D0 and only on power hardware. No text, no logos, no brands, no real-world trademarks, no watermark.
```

### 5. `bldg.corner_shop`

- **What:** Two-storey corner shop: big ground-floor display windows with mullions, a torn fabric awning, a blank sign board (no text), roll-down shutter half open, apartment windows above, rooftop AC unit.
- **Size:** 10 m wide (X) x 7 m tall (Y) x 10 m deep (Z)
- **Budget:** ≤ 3500 triangles, texture ≤ 1024 px (5.4 MB resident)
- **File:** `assets/incoming/buildings/bldg.corner_shop_01.glb` + `bldg.corner_shop_01.glb.license.txt`
- **Replaces:** building `shop`; in game: pending (validated only)

Reference sheet prompt (paste into ChatGPT):

```
Create a clean building elevation sheet for a 3D artist to model from. Subject: Two-storey corner shop: big ground-floor display windows with mullions, a torn fabric awning, a blank sign board (no text), roll-down shutter half open, apartment windows above, rooftop AC unit. Real-world size: 10 m wide (X) x 7 m tall (Y) x 10 m deep (Z). Keep these proportions exactly in every view. Views: front elevation, side elevation, back elevation and a 3/4 aerial view, all orthographic, on a plain light-grey background, evenly spaced, same scale in every view, with a thin 1 m scale bar. Show material breaks clearly (paint, metal, wood, glass) as flat color areas. Design for a low-poly game model of about 3500 triangles: big readable shapes, no thin fiddly details, no fur or foliage cards. Style: DORMANT GRID, a stylized post-collapse town. Muted, gritty, NOT photoreal. Chunky simplified shapes with bevelled edges, low-poly friendly forms, desaturated colors with strong light/dark contrast, flat even lighting (no baked shadows or highlights). The only glow color is Grid cyan-teal #39E6D0 and only on power hardware. No text, no logos, no brands, no real-world trademarks, no watermark.
```

### 6. `bldg.office_tower`

- **What:** Mid-rise downtown office: concrete frame with grid of dark glass panels, some shattered, a lobby with revolving door frame, rooftop antenna mast and HVAC boxes, faint cyan service lights at the roofline (off).
- **Size:** 16 m wide (X) x 22 m tall (Y) x 16 m deep (Z)
- **Budget:** ≤ 6000 triangles, texture ≤ 1024 px (5.4 MB resident)
- **File:** `assets/incoming/buildings/bldg.office_tower_01.glb` + `bldg.office_tower_01.glb.license.txt`
- **Replaces:** building `office`; in game: pending (validated only)

Reference sheet prompt (paste into ChatGPT):

```
Create a clean building elevation sheet for a 3D artist to model from. Subject: Mid-rise downtown office: concrete frame with grid of dark glass panels, some shattered, a lobby with revolving door frame, rooftop antenna mast and HVAC boxes, faint cyan service lights at the roofline (off). Real-world size: 16 m wide (X) x 22 m tall (Y) x 16 m deep (Z). Keep these proportions exactly in every view. Views: front elevation, side elevation, back elevation and a 3/4 aerial view, all orthographic, on a plain light-grey background, evenly spaced, same scale in every view, with a thin 1 m scale bar. Show material breaks clearly (paint, metal, wood, glass) as flat color areas. Design for a low-poly game model of about 6000 triangles: big readable shapes, no thin fiddly details, no fur or foliage cards. Style: DORMANT GRID, a stylized post-collapse town. Muted, gritty, NOT photoreal. Chunky simplified shapes with bevelled edges, low-poly friendly forms, desaturated colors with strong light/dark contrast, flat even lighting (no baked shadows or highlights). The only glow color is Grid cyan-teal #39E6D0 and only on power hardware. No text, no logos, no brands, no real-world trademarks, no watermark.
```

### 7. `bldg.clinic`

- **What:** Small two-storey clinic: pale plaster walls, a covered ambulance bay, a generic medical cross symbol (plain, no text), wide entrance doors, rooftop vents, a ramp with railing.
- **Size:** 14 m wide (X) x 8 m tall (Y) x 12 m deep (Z)
- **Budget:** ≤ 4000 triangles, texture ≤ 1024 px (5.4 MB resident)
- **File:** `assets/incoming/buildings/bldg.clinic_01.glb` + `bldg.clinic_01.glb.license.txt`
- **Replaces:** building `clinic`; in game: pending (validated only)

Reference sheet prompt (paste into ChatGPT):

```
Create a clean building elevation sheet for a 3D artist to model from. Subject: Small two-storey clinic: pale plaster walls, a covered ambulance bay, a generic medical cross symbol (plain, no text), wide entrance doors, rooftop vents, a ramp with railing. Real-world size: 14 m wide (X) x 8 m tall (Y) x 12 m deep (Z). Keep these proportions exactly in every view. Views: front elevation, side elevation, back elevation and a 3/4 aerial view, all orthographic, on a plain light-grey background, evenly spaced, same scale in every view, with a thin 1 m scale bar. Show material breaks clearly (paint, metal, wood, glass) as flat color areas. Design for a low-poly game model of about 4000 triangles: big readable shapes, no thin fiddly details, no fur or foliage cards. Style: DORMANT GRID, a stylized post-collapse town. Muted, gritty, NOT photoreal. Chunky simplified shapes with bevelled edges, low-poly friendly forms, desaturated colors with strong light/dark contrast, flat even lighting (no baked shadows or highlights). The only glow color is Grid cyan-teal #39E6D0 and only on power hardware. No text, no logos, no brands, no real-world trademarks, no watermark.
```

### 8. `bldg.warehouse`

- **What:** Industrial warehouse: corrugated metal walls over a concrete plinth, sawtooth roof with skylight glazing, one large roller door, a loading dock with rubber bumpers, rust streaks.
- **Size:** 20 m wide (X) x 9 m tall (Y) x 16 m deep (Z)
- **Budget:** ≤ 3000 triangles, texture ≤ 1024 px (5.4 MB resident)
- **File:** `assets/incoming/buildings/bldg.warehouse_01.glb` + `bldg.warehouse_01.glb.license.txt`
- **Replaces:** building `warehouse`; in game: pending (validated only)

Reference sheet prompt (paste into ChatGPT):

```
Create a clean building elevation sheet for a 3D artist to model from. Subject: Industrial warehouse: corrugated metal walls over a concrete plinth, sawtooth roof with skylight glazing, one large roller door, a loading dock with rubber bumpers, rust streaks. Real-world size: 20 m wide (X) x 9 m tall (Y) x 16 m deep (Z). Keep these proportions exactly in every view. Views: front elevation, side elevation, back elevation and a 3/4 aerial view, all orthographic, on a plain light-grey background, evenly spaced, same scale in every view, with a thin 1 m scale bar. Show material breaks clearly (paint, metal, wood, glass) as flat color areas. Design for a low-poly game model of about 3000 triangles: big readable shapes, no thin fiddly details, no fur or foliage cards. Style: DORMANT GRID, a stylized post-collapse town. Muted, gritty, NOT photoreal. Chunky simplified shapes with bevelled edges, low-poly friendly forms, desaturated colors with strong light/dark contrast, flat even lighting (no baked shadows or highlights). The only glow color is Grid cyan-teal #39E6D0 and only on power hardware. No text, no logos, no brands, no real-world trademarks, no watermark.
```

Blender script prompt (paste into ChatGPT, run the script in Blender):

```
Write a single Python script for Blender 4.x that builds this game asset from primitives and exports it as GLB: Industrial warehouse: corrugated metal walls over a concrete plinth, sawtooth roof with skylight glazing, one large roller door, a loading dock with rubber bumpers, rust streaks. Exact size: 20 m wide (X) x 9 m tall (Y) x 16 m deep (Z); 1 Blender unit = 1 m. Model it so the FRONT faces +Y in Blender (it becomes +Z in glTF) and the base sits on Z=0 centered on the origin. Use bevelled cubes/cylinders (bevel 0.02-0.05 m), at most 5 materials with flat base colors (Principled BSDF base color only, no textures), apply all transforms and modifiers, merge into ONE mesh object, triangulate, keep it under 3000 triangles (print the triangle count at the end). Delete the default cube/camera/light first. Export with bpy.ops.export_scene.gltf(filepath='//bldg.warehouse_01.glb', export_format='GLB', export_yup=True, export_apply=True, export_cameras=False, export_lights=False). Colors: muted and desaturated; Grid hardware may use #39E6D0 as an emissive accent only.
```

### 9. `bldg.factory`

- **What:** Brick factory hall with a tall brick chimney, steel-framed windows, pipe runs on the outside wall, a gantry crane rail over a side yard, faded paint bands, no text.
- **Size:** 24 m wide (X) x 12 m tall (Y) x 18 m deep (Z)
- **Budget:** ≤ 5000 triangles, texture ≤ 1024 px (5.4 MB resident)
- **File:** `assets/incoming/buildings/bldg.factory_01.glb` + `bldg.factory_01.glb.license.txt`
- **Replaces:** building `factory`; in game: pending (validated only)

Reference sheet prompt (paste into ChatGPT):

```
Create a clean building elevation sheet for a 3D artist to model from. Subject: Brick factory hall with a tall brick chimney, steel-framed windows, pipe runs on the outside wall, a gantry crane rail over a side yard, faded paint bands, no text. Real-world size: 24 m wide (X) x 12 m tall (Y) x 18 m deep (Z). Keep these proportions exactly in every view. Views: front elevation, side elevation, back elevation and a 3/4 aerial view, all orthographic, on a plain light-grey background, evenly spaced, same scale in every view, with a thin 1 m scale bar. Show material breaks clearly (paint, metal, wood, glass) as flat color areas. Design for a low-poly game model of about 5000 triangles: big readable shapes, no thin fiddly details, no fur or foliage cards. Style: DORMANT GRID, a stylized post-collapse town. Muted, gritty, NOT photoreal. Chunky simplified shapes with bevelled edges, low-poly friendly forms, desaturated colors with strong light/dark contrast, flat even lighting (no baked shadows or highlights). The only glow color is Grid cyan-teal #39E6D0 and only on power hardware. No text, no logos, no brands, no real-world trademarks, no watermark.
```

### 10. `bldg.pumphouse`

- **What:** Waterworks pumphouse: stout brick building with arched windows, big valve wheels and pipes entering the ground, a small cupola vent on the roof, a metal stair to a side door.
- **Size:** 10 m wide (X) x 7 m tall (Y) x 8 m deep (Z)
- **Budget:** ≤ 3000 triangles, texture ≤ 1024 px (5.4 MB resident)
- **File:** `assets/incoming/buildings/bldg.pumphouse_01.glb` + `bldg.pumphouse_01.glb.license.txt`
- **Replaces:** building `pumphouse`; in game: pending (validated only)

Reference sheet prompt (paste into ChatGPT):

```
Create a clean building elevation sheet for a 3D artist to model from. Subject: Waterworks pumphouse: stout brick building with arched windows, big valve wheels and pipes entering the ground, a small cupola vent on the roof, a metal stair to a side door. Real-world size: 10 m wide (X) x 7 m tall (Y) x 8 m deep (Z). Keep these proportions exactly in every view. Views: front elevation, side elevation, back elevation and a 3/4 aerial view, all orthographic, on a plain light-grey background, evenly spaced, same scale in every view, with a thin 1 m scale bar. Show material breaks clearly (paint, metal, wood, glass) as flat color areas. Design for a low-poly game model of about 3000 triangles: big readable shapes, no thin fiddly details, no fur or foliage cards. Style: DORMANT GRID, a stylized post-collapse town. Muted, gritty, NOT photoreal. Chunky simplified shapes with bevelled edges, low-poly friendly forms, desaturated colors with strong light/dark contrast, flat even lighting (no baked shadows or highlights). The only glow color is Grid cyan-teal #39E6D0 and only on power hardware. No text, no logos, no brands, no real-world trademarks, no watermark.
```

Blender script prompt (paste into ChatGPT, run the script in Blender):

```
Write a single Python script for Blender 4.x that builds this game asset from primitives and exports it as GLB: Waterworks pumphouse: stout brick building with arched windows, big valve wheels and pipes entering the ground, a small cupola vent on the roof, a metal stair to a side door. Exact size: 10 m wide (X) x 7 m tall (Y) x 8 m deep (Z); 1 Blender unit = 1 m. Model it so the FRONT faces +Y in Blender (it becomes +Z in glTF) and the base sits on Z=0 centered on the origin. Use bevelled cubes/cylinders (bevel 0.02-0.05 m), at most 5 materials with flat base colors (Principled BSDF base color only, no textures), apply all transforms and modifiers, merge into ONE mesh object, triangulate, keep it under 3000 triangles (print the triangle count at the end). Delete the default cube/camera/light first. Export with bpy.ops.export_scene.gltf(filepath='//bldg.pumphouse_01.glb', export_format='GLB', export_yup=True, export_apply=True, export_cameras=False, export_lights=False). Colors: muted and desaturated; Grid hardware may use #39E6D0 as an emissive accent only.
```

## Characters

### 11. `char.player`

- **What:** The player: a capable 30-something scavenger-engineer, gender-neutral build, weathered work jacket with reflective tape, utility belt, chunky backpack with a coiled cable, scarf, boots, short practical hair. Readable silhouette from behind.
- **Size:** 0.6 m wide (X) x 1.8 m tall (Y) x 0.4 m deep (Z)
- **Budget:** ≤ 3000 triangles, texture ≤ 1024 px (5.4 MB resident), ≤ 40 bones, clips: idle, walk, run, interact, attack_light, attack_heavy, dodge, hit, die
- **File:** `assets/incoming/characters/char.player_01.glb` + `char.player_01.glb.license.txt`
- **Replaces:** character `player`; in game: pending (validated only)

Reference sheet prompt (paste into ChatGPT):

```
Create a clean character turnaround sheet for a 3D artist to model from. Subject: The player: a capable 30-something scavenger-engineer, gender-neutral build, weathered work jacket with reflective tape, utility belt, chunky backpack with a coiled cable, scarf, boots, short practical hair. Readable silhouette from behind. Real-world size: 0.6 m wide (X) x 1.8 m tall (Y) x 0.4 m deep (Z). Keep these proportions exactly in every view. Views: front, left side, back and 3/4 views, full body, neutral A-pose with arms 30 degrees from the body, feet slightly apart, on a plain light-grey background, evenly spaced, same scale in every view, with a thin 1 m scale bar. Clothing regions should be clearly separated flat color areas (good for texture baking and recoloring). Hands open, no props in hands. Design for a low-poly game model of about 3000 triangles: big readable shapes, no thin fiddly details, no fur or foliage cards. Style: DORMANT GRID, a stylized post-collapse town. Muted, gritty, NOT photoreal. Chunky simplified shapes with bevelled edges, low-poly friendly forms, desaturated colors with strong light/dark contrast, flat even lighting (no baked shadows or highlights). The only glow color is Grid cyan-teal #39E6D0 and only on power hardware. No text, no logos, no brands, no real-world trademarks, no watermark.
```

### 12. `char.survivor`

- **What:** A Haven settler base body in neutral layered clothing (patched coat over a hoodie, cargo trousers, boots) designed to be tinted: keep clothing regions flat-colored so the game can recolor shirt/trousers/accent per survivor.
- **Size:** 0.6 m wide (X) x 1.75 m tall (Y) x 0.4 m deep (Z)
- **Budget:** ≤ 2500 triangles, texture ≤ 1024 px (5.4 MB resident), ≤ 40 bones, clips: idle, walk, run, interact, sit, sleep, hit
- **File:** `assets/incoming/characters/char.survivor_01.glb` + `char.survivor_01.glb.license.txt`
- **Replaces:** character `survivor`; in game: pending (validated only)

Reference sheet prompt (paste into ChatGPT):

```
Create a clean character turnaround sheet for a 3D artist to model from. Subject: A Haven settler base body in neutral layered clothing (patched coat over a hoodie, cargo trousers, boots) designed to be tinted: keep clothing regions flat-colored so the game can recolor shirt/trousers/accent per survivor. Real-world size: 0.6 m wide (X) x 1.75 m tall (Y) x 0.4 m deep (Z). Keep these proportions exactly in every view. Views: front, left side, back and 3/4 views, full body, neutral A-pose with arms 30 degrees from the body, feet slightly apart, on a plain light-grey background, evenly spaced, same scale in every view, with a thin 1 m scale bar. Clothing regions should be clearly separated flat color areas (good for texture baking and recoloring). Hands open, no props in hands. Design for a low-poly game model of about 2500 triangles: big readable shapes, no thin fiddly details, no fur or foliage cards. Style: DORMANT GRID, a stylized post-collapse town. Muted, gritty, NOT photoreal. Chunky simplified shapes with bevelled edges, low-poly friendly forms, desaturated colors with strong light/dark contrast, flat even lighting (no baked shadows or highlights). The only glow color is Grid cyan-teal #39E6D0 and only on power hardware. No text, no logos, no brands, no real-world trademarks, no watermark.
```

### 13. `char.raider_grunt`

- **What:** Ashline raider grunt: rust-red cloth wraps, mismatched sheet-metal shoulder and chest plates, a respirator half-mask, goggles, hooded, holding nothing (weapons are separate). Menacing but not gory.
- **Size:** 0.65 m wide (X) x 1.8 m tall (Y) x 0.45 m deep (Z)
- **Budget:** ≤ 3000 triangles, texture ≤ 1024 px (5.4 MB resident), ≤ 40 bones, clips: idle, walk, run, attack_light, attack_heavy, hit, die
- **File:** `assets/incoming/characters/char.raider_grunt_01.glb` + `char.raider_grunt_01.glb.license.txt`
- **Replaces:** character `raider`; in game: pending (validated only)

Reference sheet prompt (paste into ChatGPT):

```
Create a clean character turnaround sheet for a 3D artist to model from. Subject: Ashline raider grunt: rust-red cloth wraps, mismatched sheet-metal shoulder and chest plates, a respirator half-mask, goggles, hooded, holding nothing (weapons are separate). Menacing but not gory. Real-world size: 0.65 m wide (X) x 1.8 m tall (Y) x 0.45 m deep (Z). Keep these proportions exactly in every view. Views: front, left side, back and 3/4 views, full body, neutral A-pose with arms 30 degrees from the body, feet slightly apart, on a plain light-grey background, evenly spaced, same scale in every view, with a thin 1 m scale bar. Clothing regions should be clearly separated flat color areas (good for texture baking and recoloring). Hands open, no props in hands. Design for a low-poly game model of about 3000 triangles: big readable shapes, no thin fiddly details, no fur or foliage cards. Style: DORMANT GRID, a stylized post-collapse town. Muted, gritty, NOT photoreal. Chunky simplified shapes with bevelled edges, low-poly friendly forms, desaturated colors with strong light/dark contrast, flat even lighting (no baked shadows or highlights). The only glow color is Grid cyan-teal #39E6D0 and only on power hardware. No text, no logos, no brands, no real-world trademarks, no watermark.
```

### 14. `char.raider_brute`

- **What:** Ashline brute: big, broad, heavier plate armor made from a car door and road signs (blank, no text), welding mask, thick gloves, slow heavy stance.
- **Size:** 0.9 m wide (X) x 2 m tall (Y) x 0.6 m deep (Z)
- **Budget:** ≤ 3000 triangles, texture ≤ 1024 px (5.4 MB resident), ≤ 40 bones, clips: idle, walk, run, attack_heavy, hit, die
- **File:** `assets/incoming/characters/char.raider_brute_01.glb` + `char.raider_brute_01.glb.license.txt`
- **Replaces:** character `raider_brute`; in game: pending (validated only)

Reference sheet prompt (paste into ChatGPT):

```
Create a clean character turnaround sheet for a 3D artist to model from. Subject: Ashline brute: big, broad, heavier plate armor made from a car door and road signs (blank, no text), welding mask, thick gloves, slow heavy stance. Real-world size: 0.9 m wide (X) x 2 m tall (Y) x 0.6 m deep (Z). Keep these proportions exactly in every view. Views: front, left side, back and 3/4 views, full body, neutral A-pose with arms 30 degrees from the body, feet slightly apart, on a plain light-grey background, evenly spaced, same scale in every view, with a thin 1 m scale bar. Clothing regions should be clearly separated flat color areas (good for texture baking and recoloring). Hands open, no props in hands. Design for a low-poly game model of about 3000 triangles: big readable shapes, no thin fiddly details, no fur or foliage cards. Style: DORMANT GRID, a stylized post-collapse town. Muted, gritty, NOT photoreal. Chunky simplified shapes with bevelled edges, low-poly friendly forms, desaturated colors with strong light/dark contrast, flat even lighting (no baked shadows or highlights). The only glow color is Grid cyan-teal #39E6D0 and only on power hardware. No text, no logos, no brands, no real-world trademarks, no watermark.
```

### 15. `char.robot_sentinel`

- **What:** Custodian sentinel robot: a rigid (unrigged) bipedal security machine, chunky industrial plating in off-white and graphite, a single cyclopean sensor eye that glows cyan-teal (#39E6D0), hydraulic pistons at the knees, a shoulder-mounted light. One solid piece; the game animates it procedurally.
- **Size:** 1.2 m wide (X) x 2.3 m tall (Y) x 1 m deep (Z)
- **Budget:** ≤ 3000 triangles, texture ≤ 1024 px (5.4 MB resident)
- **File:** `assets/incoming/characters/char.robot_sentinel_01.glb` + `char.robot_sentinel_01.glb.license.txt`
- **Replaces:** enemy `bot`; in game: **live**

Reference sheet prompt (paste into ChatGPT):

```
Create a clean robot model sheet for a 3D artist to model from. Subject: Custodian sentinel robot: a rigid (unrigged) bipedal security machine, chunky industrial plating in off-white and graphite, a single cyclopean sensor eye that glows cyan-teal (#39E6D0), hydraulic pistons at the knees, a shoulder-mounted light. One solid piece; the game animates it procedurally. Real-world size: 1.2 m wide (X) x 2.3 m tall (Y) x 1 m deep (Z). Keep these proportions exactly in every view. Views: front, left side, back and 3/4 views, full body, neutral A-pose with arms 30 degrees from the body, feet slightly apart, on a plain light-grey background, evenly spaced, same scale in every view, with a thin 1 m scale bar. Show material breaks clearly (paint, metal, wood, glass) as flat color areas. Design for a low-poly game model of about 3000 triangles: big readable shapes, no thin fiddly details, no fur or foliage cards. Style: DORMANT GRID, a stylized post-collapse town. Muted, gritty, NOT photoreal. Chunky simplified shapes with bevelled edges, low-poly friendly forms, desaturated colors with strong light/dark contrast, flat even lighting (no baked shadows or highlights). The only glow color is Grid cyan-teal #39E6D0 and only on power hardware. No text, no logos, no brands, no real-world trademarks, no watermark.
```

## Props

### 16. `prop.car_sedan`

- **What:** Abandoned compact sedan, rounded 1990s-ish generic shape (no brand), flat tires, rusted wheel arches, dusty cracked windows, a crumpled fender.
- **Size:** 1.8 m wide (X) x 1.45 m tall (Y) x 4.3 m deep (Z)
- **Budget:** ≤ 900 triangles, texture ≤ 512 px (1.4 MB resident)
- **File:** `assets/incoming/props/prop.car_sedan_01.glb` + `prop.car_sedan_01.glb.license.txt`
- **Replaces:** prop `car`; in game: **live**

Reference sheet prompt (paste into ChatGPT):

```
Create a clean prop model sheet for a 3D artist to model from. Subject: Abandoned compact sedan, rounded 1990s-ish generic shape (no brand), flat tires, rusted wheel arches, dusty cracked windows, a crumpled fender. Real-world size: 1.8 m wide (X) x 1.45 m tall (Y) x 4.3 m deep (Z). Keep these proportions exactly in every view. Views: front, side, top and 3/4 views, all orthographic, on a plain light-grey background, evenly spaced, same scale in every view, with a thin 1 m scale bar. Show material breaks clearly (paint, metal, wood, glass) as flat color areas. Design for a low-poly game model of about 900 triangles: big readable shapes, no thin fiddly details, no fur or foliage cards. Style: DORMANT GRID, a stylized post-collapse town. Muted, gritty, NOT photoreal. Chunky simplified shapes with bevelled edges, low-poly friendly forms, desaturated colors with strong light/dark contrast, flat even lighting (no baked shadows or highlights). The only glow color is Grid cyan-teal #39E6D0 and only on power hardware. No text, no logos, no brands, no real-world trademarks, no watermark.
```

### 17. `prop.van_delivery`

- **What:** Boxy delivery van, sliding side door half open, roof rack, faded paint, no logos.
- **Size:** 2 m wide (X) x 2.2 m tall (Y) x 5 m deep (Z)
- **Budget:** ≤ 900 triangles, texture ≤ 512 px (1.4 MB resident)
- **File:** `assets/incoming/props/prop.van_delivery_01.glb` + `prop.van_delivery_01.glb.license.txt`
- **Replaces:** prop `van`; in game: **live**

Reference sheet prompt (paste into ChatGPT):

```
Create a clean prop model sheet for a 3D artist to model from. Subject: Boxy delivery van, sliding side door half open, roof rack, faded paint, no logos. Real-world size: 2 m wide (X) x 2.2 m tall (Y) x 5 m deep (Z). Keep these proportions exactly in every view. Views: front, side, top and 3/4 views, all orthographic, on a plain light-grey background, evenly spaced, same scale in every view, with a thin 1 m scale bar. Show material breaks clearly (paint, metal, wood, glass) as flat color areas. Design for a low-poly game model of about 900 triangles: big readable shapes, no thin fiddly details, no fur or foliage cards. Style: DORMANT GRID, a stylized post-collapse town. Muted, gritty, NOT photoreal. Chunky simplified shapes with bevelled edges, low-poly friendly forms, desaturated colors with strong light/dark contrast, flat even lighting (no baked shadows or highlights). The only glow color is Grid cyan-teal #39E6D0 and only on power hardware. No text, no logos, no brands, no real-world trademarks, no watermark.
```

### 18. `prop.bus_city`

- **What:** City bus, broken side windows, flat-fronted, doors jammed open, roof vents, a blank destination display (no text).
- **Size:** 2.5 m wide (X) x 3 m tall (Y) x 11.2 m deep (Z)
- **Budget:** ≤ 1200 triangles, texture ≤ 1024 px (5.4 MB resident)
- **File:** `assets/incoming/props/prop.bus_city_01.glb` + `prop.bus_city_01.glb.license.txt`
- **Replaces:** prop `bus`; in game: **live**

Reference sheet prompt (paste into ChatGPT):

```
Create a clean prop model sheet for a 3D artist to model from. Subject: City bus, broken side windows, flat-fronted, doors jammed open, roof vents, a blank destination display (no text). Real-world size: 2.5 m wide (X) x 3 m tall (Y) x 11.2 m deep (Z). Keep these proportions exactly in every view. Views: front, side, top and 3/4 views, all orthographic, on a plain light-grey background, evenly spaced, same scale in every view, with a thin 1 m scale bar. Show material breaks clearly (paint, metal, wood, glass) as flat color areas. Design for a low-poly game model of about 1200 triangles: big readable shapes, no thin fiddly details, no fur or foliage cards. Style: DORMANT GRID, a stylized post-collapse town. Muted, gritty, NOT photoreal. Chunky simplified shapes with bevelled edges, low-poly friendly forms, desaturated colors with strong light/dark contrast, flat even lighting (no baked shadows or highlights). The only glow color is Grid cyan-teal #39E6D0 and only on power hardware. No text, no logos, no brands, no real-world trademarks, no watermark.
```

### 19. `prop.container_shipping`

- **What:** 20 ft shipping container, corrugated sides, locking bars on the doors, scraped paint, no logos or text.
- **Size:** 2.5 m wide (X) x 2.6 m tall (Y) x 6 m deep (Z)
- **Budget:** ≤ 400 triangles, texture ≤ 512 px (1.4 MB resident)
- **File:** `assets/incoming/props/prop.container_shipping_01.glb` + `prop.container_shipping_01.glb.license.txt`
- **Replaces:** prop `container`; in game: **live**

Reference sheet prompt (paste into ChatGPT):

```
Create a clean prop model sheet for a 3D artist to model from. Subject: 20 ft shipping container, corrugated sides, locking bars on the doors, scraped paint, no logos or text. Real-world size: 2.5 m wide (X) x 2.6 m tall (Y) x 6 m deep (Z). Keep these proportions exactly in every view. Views: front, side, top and 3/4 views, all orthographic, on a plain light-grey background, evenly spaced, same scale in every view, with a thin 1 m scale bar. Show material breaks clearly (paint, metal, wood, glass) as flat color areas. Design for a low-poly game model of about 400 triangles: big readable shapes, no thin fiddly details, no fur or foliage cards. Style: DORMANT GRID, a stylized post-collapse town. Muted, gritty, NOT photoreal. Chunky simplified shapes with bevelled edges, low-poly friendly forms, desaturated colors with strong light/dark contrast, flat even lighting (no baked shadows or highlights). The only glow color is Grid cyan-teal #39E6D0 and only on power hardware. No text, no logos, no brands, no real-world trademarks, no watermark.
```

Blender script prompt (paste into ChatGPT, run the script in Blender):

```
Write a single Python script for Blender 4.x that builds this game asset from primitives and exports it as GLB: 20 ft shipping container, corrugated sides, locking bars on the doors, scraped paint, no logos or text. Exact size: 2.5 m wide (X) x 2.6 m tall (Y) x 6 m deep (Z); 1 Blender unit = 1 m. Model it so the FRONT faces +Y in Blender (it becomes +Z in glTF) and the base sits on Z=0 centered on the origin. Use bevelled cubes/cylinders (bevel 0.02-0.05 m), at most 5 materials with flat base colors (Principled BSDF base color only, no textures), apply all transforms and modifiers, merge into ONE mesh object, triangulate, keep it under 400 triangles (print the triangle count at the end). Delete the default cube/camera/light first. Export with bpy.ops.export_scene.gltf(filepath='//prop.container_shipping_01.glb', export_format='GLB', export_yup=True, export_apply=True, export_cameras=False, export_lights=False). Colors: muted and desaturated; Grid hardware may use #39E6D0 as an emissive accent only.
```

### 20. `prop.dumpster`

- **What:** Commercial dumpster, lid propped slightly open, side lift pockets, small caster wheels, rusted green paint.
- **Size:** 2 m wide (X) x 1.4 m tall (Y) x 1.45 m deep (Z)
- **Budget:** ≤ 400 triangles, texture ≤ 512 px (1.4 MB resident)
- **File:** `assets/incoming/props/prop.dumpster_01.glb` + `prop.dumpster_01.glb.license.txt`
- **Replaces:** prop `dumpster`; in game: **live**

Reference sheet prompt (paste into ChatGPT):

```
Create a clean prop model sheet for a 3D artist to model from. Subject: Commercial dumpster, lid propped slightly open, side lift pockets, small caster wheels, rusted green paint. Real-world size: 2 m wide (X) x 1.4 m tall (Y) x 1.45 m deep (Z). Keep these proportions exactly in every view. Views: front, side, top and 3/4 views, all orthographic, on a plain light-grey background, evenly spaced, same scale in every view, with a thin 1 m scale bar. Show material breaks clearly (paint, metal, wood, glass) as flat color areas. Design for a low-poly game model of about 400 triangles: big readable shapes, no thin fiddly details, no fur or foliage cards. Style: DORMANT GRID, a stylized post-collapse town. Muted, gritty, NOT photoreal. Chunky simplified shapes with bevelled edges, low-poly friendly forms, desaturated colors with strong light/dark contrast, flat even lighting (no baked shadows or highlights). The only glow color is Grid cyan-teal #39E6D0 and only on power hardware. No text, no logos, no brands, no real-world trademarks, no watermark.
```

Blender script prompt (paste into ChatGPT, run the script in Blender):

```
Write a single Python script for Blender 4.x that builds this game asset from primitives and exports it as GLB: Commercial dumpster, lid propped slightly open, side lift pockets, small caster wheels, rusted green paint. Exact size: 2 m wide (X) x 1.4 m tall (Y) x 1.45 m deep (Z); 1 Blender unit = 1 m. Model it so the FRONT faces +Y in Blender (it becomes +Z in glTF) and the base sits on Z=0 centered on the origin. Use bevelled cubes/cylinders (bevel 0.02-0.05 m), at most 5 materials with flat base colors (Principled BSDF base color only, no textures), apply all transforms and modifiers, merge into ONE mesh object, triangulate, keep it under 400 triangles (print the triangle count at the end). Delete the default cube/camera/light first. Export with bpy.ops.export_scene.gltf(filepath='//prop.dumpster_01.glb', export_format='GLB', export_yup=True, export_apply=True, export_cameras=False, export_lights=False). Colors: muted and desaturated; Grid hardware may use #39E6D0 as an emissive accent only.
```

### 21. `prop.barrel_steel`

- **What:** 55-gallon steel drum with two rolling hoops, dented, chipped paint, a bung cap on top.
- **Size:** 0.6 m wide (X) x 0.9 m tall (Y) x 0.6 m deep (Z)
- **Budget:** ≤ 200 triangles, texture ≤ 256 px (0.35 MB resident)
- **File:** `assets/incoming/props/prop.barrel_steel_01.glb` + `prop.barrel_steel_01.glb.license.txt`
- **Replaces:** prop `barrel`; in game: **live**

Reference sheet prompt (paste into ChatGPT):

```
Create a clean prop model sheet for a 3D artist to model from. Subject: 55-gallon steel drum with two rolling hoops, dented, chipped paint, a bung cap on top. Real-world size: 0.6 m wide (X) x 0.9 m tall (Y) x 0.6 m deep (Z). Keep these proportions exactly in every view. Views: front, side, top and 3/4 views, all orthographic, on a plain light-grey background, evenly spaced, same scale in every view, with a thin 1 m scale bar. Show material breaks clearly (paint, metal, wood, glass) as flat color areas. Design for a low-poly game model of about 200 triangles: big readable shapes, no thin fiddly details, no fur or foliage cards. Style: DORMANT GRID, a stylized post-collapse town. Muted, gritty, NOT photoreal. Chunky simplified shapes with bevelled edges, low-poly friendly forms, desaturated colors with strong light/dark contrast, flat even lighting (no baked shadows or highlights). The only glow color is Grid cyan-teal #39E6D0 and only on power hardware. No text, no logos, no brands, no real-world trademarks, no watermark.
```

Blender script prompt (paste into ChatGPT, run the script in Blender):

```
Write a single Python script for Blender 4.x that builds this game asset from primitives and exports it as GLB: 55-gallon steel drum with two rolling hoops, dented, chipped paint, a bung cap on top. Exact size: 0.6 m wide (X) x 0.9 m tall (Y) x 0.6 m deep (Z); 1 Blender unit = 1 m. Model it so the FRONT faces +Y in Blender (it becomes +Z in glTF) and the base sits on Z=0 centered on the origin. Use bevelled cubes/cylinders (bevel 0.02-0.05 m), at most 5 materials with flat base colors (Principled BSDF base color only, no textures), apply all transforms and modifiers, merge into ONE mesh object, triangulate, keep it under 200 triangles (print the triangle count at the end). Delete the default cube/camera/light first. Export with bpy.ops.export_scene.gltf(filepath='//prop.barrel_steel_01.glb', export_format='GLB', export_yup=True, export_apply=True, export_cameras=False, export_lights=False). Colors: muted and desaturated; Grid hardware may use #39E6D0 as an emissive accent only.
```

### 22. `prop.crate_wood`

- **What:** Nailed wooden supply crate, slatted, reinforced corners, stenciled blank panel (no text).
- **Size:** 0.72 m wide (X) x 0.7 m tall (Y) x 0.72 m deep (Z)
- **Budget:** ≤ 150 triangles, texture ≤ 256 px (0.35 MB resident)
- **File:** `assets/incoming/props/prop.crate_wood_01.glb` + `prop.crate_wood_01.glb.license.txt`
- **Replaces:** prop `crate`; in game: **live**

Reference sheet prompt (paste into ChatGPT):

```
Create a clean prop model sheet for a 3D artist to model from. Subject: Nailed wooden supply crate, slatted, reinforced corners, stenciled blank panel (no text). Real-world size: 0.72 m wide (X) x 0.7 m tall (Y) x 0.72 m deep (Z). Keep these proportions exactly in every view. Views: front, side, top and 3/4 views, all orthographic, on a plain light-grey background, evenly spaced, same scale in every view, with a thin 1 m scale bar. Show material breaks clearly (paint, metal, wood, glass) as flat color areas. Design for a low-poly game model of about 150 triangles: big readable shapes, no thin fiddly details, no fur or foliage cards. Style: DORMANT GRID, a stylized post-collapse town. Muted, gritty, NOT photoreal. Chunky simplified shapes with bevelled edges, low-poly friendly forms, desaturated colors with strong light/dark contrast, flat even lighting (no baked shadows or highlights). The only glow color is Grid cyan-teal #39E6D0 and only on power hardware. No text, no logos, no brands, no real-world trademarks, no watermark.
```

Blender script prompt (paste into ChatGPT, run the script in Blender):

```
Write a single Python script for Blender 4.x that builds this game asset from primitives and exports it as GLB: Nailed wooden supply crate, slatted, reinforced corners, stenciled blank panel (no text). Exact size: 0.72 m wide (X) x 0.7 m tall (Y) x 0.72 m deep (Z); 1 Blender unit = 1 m. Model it so the FRONT faces +Y in Blender (it becomes +Z in glTF) and the base sits on Z=0 centered on the origin. Use bevelled cubes/cylinders (bevel 0.02-0.05 m), at most 5 materials with flat base colors (Principled BSDF base color only, no textures), apply all transforms and modifiers, merge into ONE mesh object, triangulate, keep it under 150 triangles (print the triangle count at the end). Delete the default cube/camera/light first. Export with bpy.ops.export_scene.gltf(filepath='//prop.crate_wood_01.glb', export_format='GLB', export_yup=True, export_apply=True, export_cameras=False, export_lights=False). Colors: muted and desaturated; Grid hardware may use #39E6D0 as an emissive accent only.
```

### 23. `prop.barrier_jersey`

- **What:** Concrete jersey barrier, chipped edges, faded yellow reflective stripe, lifting slots at the base.
- **Size:** 2.9 m wide (X) x 0.82 m tall (Y) x 0.62 m deep (Z)
- **Budget:** ≤ 150 triangles, texture ≤ 256 px (0.35 MB resident)
- **File:** `assets/incoming/props/prop.barrier_jersey_01.glb` + `prop.barrier_jersey_01.glb.license.txt`
- **Replaces:** prop `barrier`; in game: **live**

Reference sheet prompt (paste into ChatGPT):

```
Create a clean prop model sheet for a 3D artist to model from. Subject: Concrete jersey barrier, chipped edges, faded yellow reflective stripe, lifting slots at the base. Real-world size: 2.9 m wide (X) x 0.82 m tall (Y) x 0.62 m deep (Z). Keep these proportions exactly in every view. Views: front, side, top and 3/4 views, all orthographic, on a plain light-grey background, evenly spaced, same scale in every view, with a thin 1 m scale bar. Show material breaks clearly (paint, metal, wood, glass) as flat color areas. Design for a low-poly game model of about 150 triangles: big readable shapes, no thin fiddly details, no fur or foliage cards. Style: DORMANT GRID, a stylized post-collapse town. Muted, gritty, NOT photoreal. Chunky simplified shapes with bevelled edges, low-poly friendly forms, desaturated colors with strong light/dark contrast, flat even lighting (no baked shadows or highlights). The only glow color is Grid cyan-teal #39E6D0 and only on power hardware. No text, no logos, no brands, no real-world trademarks, no watermark.
```

Blender script prompt (paste into ChatGPT, run the script in Blender):

```
Write a single Python script for Blender 4.x that builds this game asset from primitives and exports it as GLB: Concrete jersey barrier, chipped edges, faded yellow reflective stripe, lifting slots at the base. Exact size: 2.9 m wide (X) x 0.82 m tall (Y) x 0.62 m deep (Z); 1 Blender unit = 1 m. Model it so the FRONT faces +Y in Blender (it becomes +Z in glTF) and the base sits on Z=0 centered on the origin. Use bevelled cubes/cylinders (bevel 0.02-0.05 m), at most 5 materials with flat base colors (Principled BSDF base color only, no textures), apply all transforms and modifiers, merge into ONE mesh object, triangulate, keep it under 150 triangles (print the triangle count at the end). Delete the default cube/camera/light first. Export with bpy.ops.export_scene.gltf(filepath='//prop.barrier_jersey_01.glb', export_format='GLB', export_yup=True, export_apply=True, export_cameras=False, export_lights=False). Colors: muted and desaturated; Grid hardware may use #39E6D0 as an emissive accent only.
```

### 24. `prop.cone_traffic`

- **What:** Traffic cone with a square base and one reflective band, scuffed orange.
- **Size:** 0.36 m wide (X) x 0.66 m tall (Y) x 0.36 m deep (Z)
- **Budget:** ≤ 120 triangles, texture ≤ 256 px (0.35 MB resident)
- **File:** `assets/incoming/props/prop.cone_traffic_01.glb` + `prop.cone_traffic_01.glb.license.txt`
- **Replaces:** prop `cone`; in game: **live**

Reference sheet prompt (paste into ChatGPT):

```
Create a clean prop model sheet for a 3D artist to model from. Subject: Traffic cone with a square base and one reflective band, scuffed orange. Real-world size: 0.36 m wide (X) x 0.66 m tall (Y) x 0.36 m deep (Z). Keep these proportions exactly in every view. Views: front, side, top and 3/4 views, all orthographic, on a plain light-grey background, evenly spaced, same scale in every view, with a thin 1 m scale bar. Show material breaks clearly (paint, metal, wood, glass) as flat color areas. Design for a low-poly game model of about 120 triangles: big readable shapes, no thin fiddly details, no fur or foliage cards. Style: DORMANT GRID, a stylized post-collapse town. Muted, gritty, NOT photoreal. Chunky simplified shapes with bevelled edges, low-poly friendly forms, desaturated colors with strong light/dark contrast, flat even lighting (no baked shadows or highlights). The only glow color is Grid cyan-teal #39E6D0 and only on power hardware. No text, no logos, no brands, no real-world trademarks, no watermark.
```

Blender script prompt (paste into ChatGPT, run the script in Blender):

```
Write a single Python script for Blender 4.x that builds this game asset from primitives and exports it as GLB: Traffic cone with a square base and one reflective band, scuffed orange. Exact size: 0.36 m wide (X) x 0.66 m tall (Y) x 0.36 m deep (Z); 1 Blender unit = 1 m. Model it so the FRONT faces +Y in Blender (it becomes +Z in glTF) and the base sits on Z=0 centered on the origin. Use bevelled cubes/cylinders (bevel 0.02-0.05 m), at most 5 materials with flat base colors (Principled BSDF base color only, no textures), apply all transforms and modifiers, merge into ONE mesh object, triangulate, keep it under 120 triangles (print the triangle count at the end). Delete the default cube/camera/light first. Export with bpy.ops.export_scene.gltf(filepath='//prop.cone_traffic_01.glb', export_format='GLB', export_yup=True, export_apply=True, export_cameras=False, export_lights=False). Colors: muted and desaturated; Grid hardware may use #39E6D0 as an emissive accent only.
```

### 25. `prop.streetlight`

- **What:** Utility street lamp: tapered steel pole, single arm reaching toward +Z, flat lamp head with a lens on its underside (keep the lens a separate material so it can glow).
- **Size:** 0.3 m wide (X) x 5.6 m tall (Y) x 1.3 m deep (Z)
- **Budget:** ≤ 300 triangles, texture ≤ 256 px (0.35 MB resident)
- **File:** `assets/incoming/props/prop.streetlight_01.glb` + `prop.streetlight_01.glb.license.txt`
- **Replaces:** prop `streetlight`; in game: **live**

Reference sheet prompt (paste into ChatGPT):

```
Create a clean prop model sheet for a 3D artist to model from. Subject: Utility street lamp: tapered steel pole, single arm reaching toward +Z, flat lamp head with a lens on its underside (keep the lens a separate material so it can glow). Real-world size: 0.3 m wide (X) x 5.6 m tall (Y) x 1.3 m deep (Z). Keep these proportions exactly in every view. Views: front, side, top and 3/4 views, all orthographic, on a plain light-grey background, evenly spaced, same scale in every view, with a thin 1 m scale bar. Show material breaks clearly (paint, metal, wood, glass) as flat color areas. Design for a low-poly game model of about 300 triangles: big readable shapes, no thin fiddly details, no fur or foliage cards. Style: DORMANT GRID, a stylized post-collapse town. Muted, gritty, NOT photoreal. Chunky simplified shapes with bevelled edges, low-poly friendly forms, desaturated colors with strong light/dark contrast, flat even lighting (no baked shadows or highlights). The only glow color is Grid cyan-teal #39E6D0 and only on power hardware. No text, no logos, no brands, no real-world trademarks, no watermark.
```

Blender script prompt (paste into ChatGPT, run the script in Blender):

```
Write a single Python script for Blender 4.x that builds this game asset from primitives and exports it as GLB: Utility street lamp: tapered steel pole, single arm reaching toward +Z, flat lamp head with a lens on its underside (keep the lens a separate material so it can glow). Exact size: 0.3 m wide (X) x 5.6 m tall (Y) x 1.3 m deep (Z); 1 Blender unit = 1 m. Model it so the FRONT faces +Y in Blender (it becomes +Z in glTF) and the base sits on Z=0 centered on the origin. Use bevelled cubes/cylinders (bevel 0.02-0.05 m), at most 5 materials with flat base colors (Principled BSDF base color only, no textures), apply all transforms and modifiers, merge into ONE mesh object, triangulate, keep it under 300 triangles (print the triangle count at the end). Delete the default cube/camera/light first. Export with bpy.ops.export_scene.gltf(filepath='//prop.streetlight_01.glb', export_format='GLB', export_yup=True, export_apply=True, export_cameras=False, export_lights=False). Colors: muted and desaturated; Grid hardware may use #39E6D0 as an emissive accent only.
```

### 26. `prop.bench`

- **What:** Park bench, wooden slats on cast-iron sides, one slat missing, front faces +Z.
- **Size:** 1.8 m wide (X) x 0.9 m tall (Y) x 0.6 m deep (Z)
- **Budget:** ≤ 300 triangles, texture ≤ 256 px (0.35 MB resident)
- **File:** `assets/incoming/props/prop.bench_01.glb` + `prop.bench_01.glb.license.txt`
- **Replaces:** prop `bench`; in game: **live**

Reference sheet prompt (paste into ChatGPT):

```
Create a clean prop model sheet for a 3D artist to model from. Subject: Park bench, wooden slats on cast-iron sides, one slat missing, front faces +Z. Real-world size: 1.8 m wide (X) x 0.9 m tall (Y) x 0.6 m deep (Z). Keep these proportions exactly in every view. Views: front, side, top and 3/4 views, all orthographic, on a plain light-grey background, evenly spaced, same scale in every view, with a thin 1 m scale bar. Show material breaks clearly (paint, metal, wood, glass) as flat color areas. Design for a low-poly game model of about 300 triangles: big readable shapes, no thin fiddly details, no fur or foliage cards. Style: DORMANT GRID, a stylized post-collapse town. Muted, gritty, NOT photoreal. Chunky simplified shapes with bevelled edges, low-poly friendly forms, desaturated colors with strong light/dark contrast, flat even lighting (no baked shadows or highlights). The only glow color is Grid cyan-teal #39E6D0 and only on power hardware. No text, no logos, no brands, no real-world trademarks, no watermark.
```

Blender script prompt (paste into ChatGPT, run the script in Blender):

```
Write a single Python script for Blender 4.x that builds this game asset from primitives and exports it as GLB: Park bench, wooden slats on cast-iron sides, one slat missing, front faces +Z. Exact size: 1.8 m wide (X) x 0.9 m tall (Y) x 0.6 m deep (Z); 1 Blender unit = 1 m. Model it so the FRONT faces +Y in Blender (it becomes +Z in glTF) and the base sits on Z=0 centered on the origin. Use bevelled cubes/cylinders (bevel 0.02-0.05 m), at most 5 materials with flat base colors (Principled BSDF base color only, no textures), apply all transforms and modifiers, merge into ONE mesh object, triangulate, keep it under 300 triangles (print the triangle count at the end). Delete the default cube/camera/light first. Export with bpy.ops.export_scene.gltf(filepath='//prop.bench_01.glb', export_format='GLB', export_yup=True, export_apply=True, export_cameras=False, export_lights=False). Colors: muted and desaturated; Grid hardware may use #39E6D0 as an emissive accent only.
```

### 27. `prop.sign_street`

- **What:** Street sign on a thin pole, rectangular plate with a simple pictogram arrow (no text), bent slightly, faces +Z.
- **Size:** 0.8 m wide (X) x 2.5 m tall (Y) x 0.1 m deep (Z)
- **Budget:** ≤ 100 triangles, texture ≤ 256 px (0.35 MB resident)
- **File:** `assets/incoming/props/prop.sign_street_01.glb` + `prop.sign_street_01.glb.license.txt`
- **Replaces:** prop `sign`; in game: **live**

Reference sheet prompt (paste into ChatGPT):

```
Create a clean prop model sheet for a 3D artist to model from. Subject: Street sign on a thin pole, rectangular plate with a simple pictogram arrow (no text), bent slightly, faces +Z. Real-world size: 0.8 m wide (X) x 2.5 m tall (Y) x 0.1 m deep (Z). Keep these proportions exactly in every view. Views: front, side, top and 3/4 views, all orthographic, on a plain light-grey background, evenly spaced, same scale in every view, with a thin 1 m scale bar. Show material breaks clearly (paint, metal, wood, glass) as flat color areas. Design for a low-poly game model of about 100 triangles: big readable shapes, no thin fiddly details, no fur or foliage cards. Style: DORMANT GRID, a stylized post-collapse town. Muted, gritty, NOT photoreal. Chunky simplified shapes with bevelled edges, low-poly friendly forms, desaturated colors with strong light/dark contrast, flat even lighting (no baked shadows or highlights). The only glow color is Grid cyan-teal #39E6D0 and only on power hardware. No text, no logos, no brands, no real-world trademarks, no watermark.
```

Blender script prompt (paste into ChatGPT, run the script in Blender):

```
Write a single Python script for Blender 4.x that builds this game asset from primitives and exports it as GLB: Street sign on a thin pole, rectangular plate with a simple pictogram arrow (no text), bent slightly, faces +Z. Exact size: 0.8 m wide (X) x 2.5 m tall (Y) x 0.1 m deep (Z); 1 Blender unit = 1 m. Model it so the FRONT faces +Y in Blender (it becomes +Z in glTF) and the base sits on Z=0 centered on the origin. Use bevelled cubes/cylinders (bevel 0.02-0.05 m), at most 5 materials with flat base colors (Principled BSDF base color only, no textures), apply all transforms and modifiers, merge into ONE mesh object, triangulate, keep it under 100 triangles (print the triangle count at the end). Delete the default cube/camera/light first. Export with bpy.ops.export_scene.gltf(filepath='//prop.sign_street_01.glb', export_format='GLB', export_yup=True, export_apply=True, export_cameras=False, export_lights=False). Colors: muted and desaturated; Grid hardware may use #39E6D0 as an emissive accent only.
```

### 28. `prop.tree_oak`

- **What:** Stylized deciduous tree: short trunk, three chunky faceted canopy blobs (not leaf cards), muted olive green. Low poly is the look.
- **Size:** 3.4 m wide (X) x 4.6 m tall (Y) x 3.4 m deep (Z)
- **Budget:** ≤ 300 triangles, texture ≤ 512 px (1.4 MB resident)
- **File:** `assets/incoming/props/prop.tree_oak_01.glb` + `prop.tree_oak_01.glb.license.txt`
- **Replaces:** prop `tree`; in game: **live**

Reference sheet prompt (paste into ChatGPT):

```
Create a clean prop model sheet for a 3D artist to model from. Subject: Stylized deciduous tree: short trunk, three chunky faceted canopy blobs (not leaf cards), muted olive green. Low poly is the look. Real-world size: 3.4 m wide (X) x 4.6 m tall (Y) x 3.4 m deep (Z). Keep these proportions exactly in every view. Views: front, side, top and 3/4 views, all orthographic, on a plain light-grey background, evenly spaced, same scale in every view, with a thin 1 m scale bar. Show material breaks clearly (paint, metal, wood, glass) as flat color areas. Design for a low-poly game model of about 300 triangles: big readable shapes, no thin fiddly details, no fur or foliage cards. Style: DORMANT GRID, a stylized post-collapse town. Muted, gritty, NOT photoreal. Chunky simplified shapes with bevelled edges, low-poly friendly forms, desaturated colors with strong light/dark contrast, flat even lighting (no baked shadows or highlights). The only glow color is Grid cyan-teal #39E6D0 and only on power hardware. No text, no logos, no brands, no real-world trademarks, no watermark.
```

### 29. `prop.tree_pine`

- **What:** Stylized pine: short trunk, three stacked faceted cone tiers, dark muted green.
- **Size:** 3.2 m wide (X) x 5 m tall (Y) x 3.2 m deep (Z)
- **Budget:** ≤ 200 triangles, texture ≤ 512 px (1.4 MB resident)
- **File:** `assets/incoming/props/prop.tree_pine_01.glb` + `prop.tree_pine_01.glb.license.txt`
- **Replaces:** prop `pine`; in game: **live**

Reference sheet prompt (paste into ChatGPT):

```
Create a clean prop model sheet for a 3D artist to model from. Subject: Stylized pine: short trunk, three stacked faceted cone tiers, dark muted green. Real-world size: 3.2 m wide (X) x 5 m tall (Y) x 3.2 m deep (Z). Keep these proportions exactly in every view. Views: front, side, top and 3/4 views, all orthographic, on a plain light-grey background, evenly spaced, same scale in every view, with a thin 1 m scale bar. Show material breaks clearly (paint, metal, wood, glass) as flat color areas. Design for a low-poly game model of about 200 triangles: big readable shapes, no thin fiddly details, no fur or foliage cards. Style: DORMANT GRID, a stylized post-collapse town. Muted, gritty, NOT photoreal. Chunky simplified shapes with bevelled edges, low-poly friendly forms, desaturated colors with strong light/dark contrast, flat even lighting (no baked shadows or highlights). The only glow color is Grid cyan-teal #39E6D0 and only on power hardware. No text, no logos, no brands, no real-world trademarks, no watermark.
```

### 30. `prop.bush`

- **What:** Low rounded shrub made of two or three faceted blobs, muted green, flat bottom.
- **Size:** 1.6 m wide (X) x 1 m tall (Y) x 1.6 m deep (Z)
- **Budget:** ≤ 120 triangles, texture ≤ 256 px (0.35 MB resident)
- **File:** `assets/incoming/props/prop.bush_01.glb` + `prop.bush_01.glb.license.txt`
- **Replaces:** prop `bush`; in game: **live**

Reference sheet prompt (paste into ChatGPT):

```
Create a clean prop model sheet for a 3D artist to model from. Subject: Low rounded shrub made of two or three faceted blobs, muted green, flat bottom. Real-world size: 1.6 m wide (X) x 1 m tall (Y) x 1.6 m deep (Z). Keep these proportions exactly in every view. Views: front, side, top and 3/4 views, all orthographic, on a plain light-grey background, evenly spaced, same scale in every view, with a thin 1 m scale bar. Show material breaks clearly (paint, metal, wood, glass) as flat color areas. Design for a low-poly game model of about 120 triangles: big readable shapes, no thin fiddly details, no fur or foliage cards. Style: DORMANT GRID, a stylized post-collapse town. Muted, gritty, NOT photoreal. Chunky simplified shapes with bevelled edges, low-poly friendly forms, desaturated colors with strong light/dark contrast, flat even lighting (no baked shadows or highlights). The only glow color is Grid cyan-teal #39E6D0 and only on power hardware. No text, no logos, no brands, no real-world trademarks, no watermark.
```
