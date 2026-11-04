# Building pieces (3D: optional)

Honest note: ChatGPT can't output 3D. The
built-in kits cover every piece. Use this sheet
only if you make models in another tool.

Format: GLB, ≤ 400 triangles each,
1 unit = 1 m, Y up, front faces +Z, pivot at the
base center. Snap grid: 4 m cells, 3 m storeys
(sizes below match `packages/sim/src/data/pieces.ts`).
In game today: validated by ingest only; the game
still draws its procedural pieces.
Drop into: `assets/incoming/building-pieces/`

Tiers per piece: `scrap`, `timber`, `brick`,
`reinforced`. Example: `piece.wall_timber_01`.

| # | ID stem | Size (m) |
|---|---|---|
| 1 | piece.foundation_<tier>_01 | 4×4×0.4 |
| 2 | piece.wall_<tier>_01 | 4×3×0.3 |
| 3 | piece.doorway_<tier>_01 | 4×3×0.3, 1.3×2.4 opening |
| 4 | piece.window_<tier>_01 | 4×3×0.3, 1.6×1.4 opening |
| 5 | piece.floor_<tier>_01 | 4×4×0.25 |
| 6 | piece.roof_<tier>_01 | 4×4×0.4 |
| 7 | piece.stairs_<tier>_01 | 4×4 run, 3 rise |
| 8 | piece.fence_<tier>_01 | 4×1.3×0.2 |
| 9 | piece.door_<tier>_01 | 1×2.2 |

City kit pieces, for the procedural town
(per district, e.g. `piece.facade_downtown_01`):
facade, corner, storefront, awning, cornice,
roof_cap, chimney, fire_escape.

Concept prompt for reference images:
```
Modular game building piece, front view and
3/4 view on a plain gray background, stylized
low-poly, bevelled edges, muted colors, flat
lighting, no text. Piece: [timber wall panel
made of rough planks with metal patch plates].
Colors: #8A6A48 #75684F #8A4E32.
```
