# Asset Pipeline

The game ships entirely on **Tier A** assets: procedural meshes, textures and audio built in code. You can drop in **Tier B** art and audio you make yourself, and it replaces the Tier A version that has the same ID. No code changes are needed.

## 1. Tiers

| Tier | Source | Status |
|---|---|---|
| A | Built in code: procedural low-poly kits, vertex color plus baked AO, generated atlases, and Web Audio synthesis | Day one, final quality |
| B | Owner-made (ChatGPT or other tools), committed to `assets/incoming/` | Optional drop-in. A failed validation falls back to Tier A |

## 2. Drop-in flow

1. Put the file in `assets/incoming/<category>/`.
2. Name it `<prefix>.<name>_<nn>.<ext>`. All lowercase, underscores, and a two-digit variant number, for example `prop.chair_wood_01.glb`.
3. Add a license note. Either:
   - a sidecar file `<file>.license.txt` (for example `owner-created` or `CC0, Kenney, kenney.nl`), or
   - a row containing the ID in `ASSETS.md`.
4. Run `npm run assets:ingest`. Add `-- --dry` to validate without writing anything.
5. Check `assets/REPORT.md`. Results go to `assets/processed/<category>/` and `assets/manifest.json`.

At runtime the client fetches `models/manifest.json` (copied from `assets/` at build time; served from `assets/` by the dev server). For every model whose registry entry is `"runtime": "live"` it loads the GLB and replaces the procedural mesh: **props** (all instances of that kind) and **rigid enemies** (the robot). If the manifest lists nothing live, no loader code is downloaded at all. A missing or broken file is reported in `window.__models` and the procedural version stays. **A failure never crashes the game.**

**Not wired yet (honest):** building GLBs and rigged character GLBs are validated by ingest (`"runtime": "pending"`) but the game still draws its procedural buildings and characters. Images and audio from the manifest are not loaded by the game yet either.

## 3. Categories, prefixes and caps

| Folder | Prefixes | Kind | Caps |
|---|---|---|---|
| `props/` | `prop` | GLB | ≤ 800 triangles, ≤ 5 materials, textures ≤ 1024 |
| `building-pieces/` | `piece` | GLB | ≤ 400 triangles, ≤ 5 materials |
| `buildings/` | `bldg` | GLB | ≤ 6,000 triangles, ≤ 5 materials, textures ≤ 1024 |
| `characters/` | `char` | GLB | ≤ 3,000 triangles, ≤ 40 bones |
| `textures/` | `tex`, `atlas` | Image | 256–1024 px, power of two, tileable |
| `decals/` | `decal` | Image | 64–1024 px, power of two, alpha required |
| `ui-icons/` | `icon` | Image | Square, 128 px output, alpha required |
| `key-art/` | `art`, `loading` | Image | 512–2048 px |
| `skyboxes/` | `sky` | Image | 512–2048 px (equirect 2:1 or a 6-face strip) |
| `audio/` | `sfx`, `amb`, `music`, `ui` | Audio | MP3, M4A or WAV. Output is AAC (.m4a) |

## 4. Model specs

- 1 unit = 1 meter. **Y is up. The front faces +Z** (the glTF convention; the game uses it too). The pivot sits at the **center of the base**.
- **Stable IDs and per-asset budgets live in `assets/registry.json`** (size in meters, triangles, texture size and MB, bones, clips, what it replaces, live/pending). Ingest checks every model against its entry: size ±35% is fine, 3× off is rejected as wrong units (with a "looks like centimeters" hint), plus pivot, a 90° rotation of long props, bones, missing clips, and resident texture MB. A model not in the registry is processed but the game won't use it. `docs/asset-requests/models-top30.md` is generated from the registry (`npm run assets:docs`).
- Apply all transforms before export. Use no cameras or lights. Names are optional.
- Triangle budgets: characters ≤ 3,000 tris and ≤ 40 bones, props ≤ 800, building pieces ≤ 400.
- Use a shared atlas per district, with ≤ 5 materials per chunk. Prefer vertex colors.
- Building pieces snap on a **4 m grid** with 3 m storeys. Walls are 4 m wide, 3 m tall and 0.3 m thick. Foundations are 4 × 4 × 0.4 m.
- Animated characters use a humanoid skeleton. Clip names: `idle`, `walk`, `run`, `attack_light`, `attack_heavy`, `dodge`, `interact`, `hit`, `die`, `sit`, `sleep`.

## 5. Texture specs

- Tileables are 512 or 1024 px. Icons are 128 px with transparency. UI and sky images go up to 2048. **Nothing larger ships.**
- Lighting must be flat, with no baked shadows or highlights. They must tile seamlessly. Use the district palette hex codes from `docs/STYLE_BIBLE.md`.
- Output format: WebP, quality 82, or 90 with alpha. KTX2 (Basis) is planned for when an encoder is available in CI. Until then WebP stays within the 150 MB resident budget, because only a few district atlases are resident at once.

## 6. Audio specs

- SFX: mono, 44.1 kHz, ≤ 2 s, peaking at −1 dBFS. Supply 3–5 variants of each (`_01`…`_05`), because the engine picks one at random and shifts its pitch.
- Ambience: stereo, 30–90 s, with a seamless loop. Music: stereo, 60–180 s, looping, with the BPM and key noted in the request sheet.
- Output is AAC at 96 kbps for SFX and ambience and 128 kbps for music. iOS plays AAC and MP3 reliably. Do not rely on OGG.

## 7. What the ingest tool does

`tools/ingest.mjs`, run with `npm run assets:ingest`, does the following for each file:
1. **Validates:**
   - the name pattern and the prefix for its folder
   - the file extension and size limit
   - the license note (CC0, owner-created or permissive only; NC, ND and unknown are rejected)
   - image dimensions, square shape and alpha
   - model triangles, bones and materials, and (for registry IDs) real size from the bounds, pivot, orientation, rig/clips and texture memory
2. **Optimizes:**
   - **Images:** sharp resizes them within the caps (power of two where required) and writes WebP.
   - **Models:** `gltf-transform optimize --compress meshopt --texture-compress webp --texture-size <cap>`. A model up to 1.5× over its triangle budget is simplified automatically. Beyond that it is rejected. The texture format is set explicitly because the default auto mode can make PNGs larger. Meshopt is used instead of Draco so animated models work.
   - **Audio:** if ffmpeg exists, files are converted to AAC .m4a. Otherwise MP3 and M4A files are copied and other formats are rejected.
3. **Records:** writes `assets/manifest.json` (`{ version, assets: { id: { path, kind, bytes, w?, h?, tris?, bones?, clips?, size?, texMB?, stable?, replaces?, runtime?, loop?, license, source } } }`) and `assets/REPORT.md`.
4. **Never aborts** on one bad file. It logs the file and moves on. Half-written output is deleted.

## 8. Licensing

Every non-generated file is logged in `ASSETS.md` with its source, author and license. Only CC0, owner-created or clearly permissive licenses are allowed. No ripped assets, and no copyrighted characters, brands or logos. Everything is self-hosted, and nothing is hotlinked at runtime.

## 9. Request sheets

`docs/asset-requests/` contains prompts you can paste into ChatGPT, one sheet per category. ChatGPT can make images (textures, decals, icons, key art, skies). It **cannot** output finished or rigged 3D models or audio. For models, `models-top30.md` gives each entry a reference-sheet image prompt (for an image-to-3D tool or a modeler) and, for simple rigid shapes, a prompt that makes ChatGPT write a Blender script which builds and exports the GLB. Keep the Tier A versions otherwise; they are complete.

Tests: `node tests/ingest-glb.mjs` (validation on generated GLBs) and `node tests/models-flow.mjs` (ingest → build → the game swaps the crate and robot models in, and a missing file falls back).
