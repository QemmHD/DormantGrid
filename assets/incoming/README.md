# Drop your art and audio here

1. Put each file in its category folder (create the folder if it is missing):
   `props/`, `building-pieces/`, `characters/`, `textures/`, `decals/`,
   `ui-icons/`, `key-art/`, `skyboxes/`, `audio/`.
2. Name each file with its ID from the request sheet in `docs/asset-requests/`,
   for example `prop.chair_wood_01.glb` or `tex.concrete_downtown_01.png`.
   Use lowercase, underscores, and a two-digit number at the end.
3. Add a license note. Either make a text file next to the asset with the same
   name plus `.license.txt` (for example `tex.concrete_downtown_01.png.license.txt`
   containing `owner-created`), or add a line with the ID to `ASSETS.md`.
4. Run `npm run assets:ingest`, or just commit and ask Claude to run it.
5. Read `assets/REPORT.md`. Anything that failed keeps the built-in look and
   never breaks the game.

Accepted formats: images as PNG, JPG or WebP; models as GLB; audio as MP3, M4A
or WAV (WAV is converted). Full specs: `docs/ASSET_PIPELINE.md`.
