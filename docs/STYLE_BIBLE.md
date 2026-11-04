# DORMANT GRID: Style Bible

The code copy of every value here is `apps/game/src/content/palette.ts`. If the two disagree, the code wins, and you should fix this document.

## 1. The look in one paragraph

The look is muted and gritty, but stylized. Forms are chunky and simplified, with bevelled edges, flat vertex color, and a small shared atlas for each district. There are no photoreal textures. Colors are desaturated, and the strong contrast comes from value, not hue. **Light is the hero.** Ruins sit under cold blue-gray light. Restored streets glow warm amber. Grid power is the only thing that ever glows cyan-teal, so players can read infrastructure at a glance.

## 2. Shared accents

| Token | Hex | Use |
|---|---|---|
| Grid glow (`GRID_ACCENT`) | `#39E6D0` | Live Grid conduits, node cores, powered stations, the restoration ripple. Use it nowhere else. |
| Grid dim (`GRID_ACCENT_DIM`) | `#1D5A55` | Dead conduits, offline nodes, unpowered sockets |
| Danger (`DANGER_ACCENT`) | `#E0533D` | Custodian eyes, alarms, raid warnings, hostile markers |
| Practical warm | `#FFB560` | Window glow, lamps and campfires in restored areas |
| Practical cold | `#9FB4C8` | Emergency strips and moonlit glass in ruins |

Rule: the cyan-teal glow is reserved for the Grid. Never use it for loot, UI decoration, or foliage.

## 3. District palettes

Every district has nine slots: ground, road, three wall variants (A/B/C), roof, trim, foliage, and a district accent for signage, doors and tarps.

| District | ground | road | wallA | wallB | wallC | roof | trim | foliage | accent |
|---|---|---|---|---|---|---|---|---|---|
| haven | `#5B5A4C` | `#3D3F42` | `#8A7A66` | `#6F6A5F` | `#9C8F78` | `#4A3F38` | `#C9B48F` | `#56664A` | `#D08A3C` |
| downtown | `#4C5054` | `#2F3236` | `#6E7479` | `#58606A` | `#8D8F8C` | `#3A3E44` | `#B7B2A6` | `#4D5A4A` | `#A8423A` |
| residential | `#56594A` | `#393B3D` | `#9A8C7A` | `#7D8580` | `#A59A86` | `#5A4640` | `#D2C8B4` | `#5A6B4B` | `#6F8AA0` |
| market | `#5A5448` | `#3B3936` | `#9B7F63` | `#86735F` | `#B09A7C` | `#5B4434` | `#D9C49C` | `#5B6648` | `#C0603A` |
| industrial | `#4A4944` | `#2E2E2C` | `#6B6458` | `#5A5E5C` | `#7E7466` | `#3D3A36` | `#A39A84` | `#4B5444` | `#C79A2E` |
| hospital | `#55595A` | `#36393B` | `#A3A6A2` | `#8A9496` | `#B8B6AC` | `#4B5154` | `#D6D6CF` | `#52604F` | `#9E4A4A` |
| waterworks | `#4B5552` | `#32383A` | `#6A7A78` | `#56676A` | `#7F8A82` | `#37444A` | `#A6B2AA` | `#4A5D4E` | `#4F7F96` |
| rail | `#4F4A42` | `#332F2B` | `#7A5E4C` | `#665A50` | `#8A7462` | `#3E3530` | `#B39C80` | `#515A45` | `#8C3F30` |
| outskirts | `#5C6646` | `#5A5040` | `#8C7658` | `#75684F` | `#9A8A6A` | `#5C4434` | `#C4B08A` | `#4F6A3E` | `#B5823A` |

What each district should feel like:
- **Haven Lot**: a patched-together shelter. Warm tarps, timber and amber lamps. This is the safest-looking place on the map from day one.
- **Old Downtown**: cold concrete, tall slabs, and dead red signage.
- **Residential Rows**: faded siding in sun-bleached blues and creams, gable roofs, and overgrown yards.
- **Market Row**: terracotta, awnings and stall frames, with orange as the accent.
- **Industrial Yard**: dark steel, sawtooth roofs, and hazard-yellow trim.
- **Hospital Campus**: the palest district. Clinical gray-white, with an old red cross that has faded.
- **Waterworks**: teal-gray concrete, pipes and tanks, with blue-steel accents.
- **Rail Depot**: rust-brown brick, dark sleepers, and oxide red.
- **Outskirts**: the greenest and brownest district. Fields, timber barns, and ochre.

Use vertex-color jitter of ±4% in value and ±2% in hue for each piece, so repeated kits never look stamped.

## 4. Lighting

| Rig | Sun | Sun I | Sky | Ground | Hemi I | Practical |
|---|---|---|---|---|---|---|
| `LIGHT_RUIN` | `#B8C4D0` | 1.6 | `#8A98A8` | `#3A3D42` | 0.9 | `#9FB4C8` |
| `LIGHT_RESTORED` | `#FFE2B8` | 2.0 | `#C9C2B0` | `#5A4C3C` | 1.0 | `#FFB560` |
| `LIGHT_NIGHT` | `#6F86B0` | 0.35 | `#2A3446` | `#14161C` | 0.45 | `#FFA850` |

Rules:
1. Blend the rig by restoration state: 0 is pure ruin, 4 is pure restored. Interpolate in linear space.
2. Use one directional light and one hemisphere light. Practical lights are emissive vertex color plus a fake glow sprite, not real lights. Allow at most 4 real point lights near the player, and only for campfires and node cores.
3. At night, restored areas show warm window glow. Ruins stay dark apart from Grid-dim conduits and Custodian red eyes.
4. Shadows: one cascade near the player only, on the High tier. On Low and Medium, use baked vertex AO and a blob shadow under characters.

## 5. Fog and sky

Fog is distance fog that matches the sky horizon. Values by restoration state (`FOG_BY_STATE`, daytime):

| State | Color | Near | Far |
|---|---|---|---|
| 0 Ruin | `#7D8792` | 40 | 210 |
| 1 Stabilized | `#868C90` | 50 | 240 |
| 2 Powered | `#939089` | 60 | 270 |
| 3 Inhabited | `#A39A88` | 70 | 300 |
| 4 Thriving | `#B0A48C` | 80 | 330 |
| Night | `#1A2030` | 25 | 170 |

Sky gradients (zenith to horizon): day `#6F8296` to `#B4B8B4`, dusk `#3C4A66` to `#D08A5A`, night `#0C1220` to `#1E2838`, storm `#3A4048` to `#6A7074`.

Post-processing stays cheap: light bloom (Grid glow and practicals only), a vignette at 0.25, a color-grade LUT or curves, and fog. Do not add SSAO, SSR, depth of field, or motion blur.

## 6. Shape language

- **Chunky and readable.** Silhouettes read from 30 m away. Anything under 0.3 m becomes vertex color, not geometry.
- **Bevel every hard edge** with a single 4–8 cm chamfer. Nothing is razor sharp.
- **A slight wrongness in ruins.** Ruined pieces lean 1–3°, roofs sag, and windows are boarded or punched out. Restored pieces sit straight and plumb.
- **Rectangles for the old city, circles for the Grid.** Grid hardware (nodes, conduits, pylons) uses rounded, circular forms with ring motifs. Human-built things are boxy.
- **Factions by silhouette:**
  - Hearth: round lanterns and patched fabric.
  - Ashline Reavers: spikes and sheet-metal fins in rust red.
  - Meridian Guild: clean tool rigs and yellow-and-black hazard banding.
  - Custodians: smooth white-gray shells and a single red eye. A cyan core only once they are allied.

## 7. Materials

- Use vertex colors plus one shared atlas per district, 1024 px maximum. Keep 5 or fewer materials per chunk.
- Roughness is high everywhere (0.8–0.95). Only glass, wet asphalt and Grid hardware drop to 0.3–0.5.
- No metalness above 0.3, except on Grid hardware.
- Rust, grime and moss are vertex-color gradients from the base upward, not textures.
- Rain wets the world. Lower ground roughness and darken the albedo by 10%. Puddles are cheap decal quads.
- Gore is subtle: dark blood decals (`#5A1A16`) that fade over 60 s, and warm hit sparks (`#FFC46A`). There is no dismemberment.

## 8. UI tokens

- **Font:** the system stack (`-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Segoe UI', Roboto, …`). Monospace (`ui-monospace, 'SF Mono', Menlo`) is for Grid terminals only.
- **Text sizes:** small 13, body 15, large 18, title 28, hero 44. A user text-scale of 0.85 to 1.4 multiplies all of them.
- **Colors:**

  | Token | Hex | Token | Hex |
  |---|---|---|---|
  | bg | `#14171A` | text | `#ECE6D8` |
  | panelSolid | `#1C2024` | textDim | `#A39D90` |
  | panelRaised | `#252A2F` | textFaint | `#6E6A62` |
  | grid | `#39E6D0` | amber | `#F0A856` |
  | danger | `#E0533D` | ok | `#8CC68A` |
  | warn | `#E6C25A` | | |

  The panel color is `rgba(20,23,26,0.86)` and dividers are `rgba(230,222,205,0.14)`.
- **Meters:** hunger `#D9A05B`, thirst `#6FB3D6`, stamina `#D6D27A`, sleep `#9A8FD0`, health `#D9605A`.
- **Colorblind mode:** ok becomes `#5AA0E6`, and danger and health become `#F0A030`. Always pair color with an icon or shape as well.
- **Spacing scale:** 0, 4, 8, 12, 16, 24, 32, 48 px. **Radii:** sm 6, md 10, lg 16, pill 999.
- **Touch targets:** 44 px minimum, with 8 px between buttons.
- **Motion:** fast 120 ms, base 220 ms, slow 420 ms. Use ease-out `cubic-bezier(0.22,1,0.36,1)`. Panels slide and fade in, and nothing pops in.

## 9. Do and don't

**Do**
- Make restoration visible from across the map: warmer light, lit windows, laundry lines, planters, people.
- Keep the HUD minimal. Show meters only when they change or are low.
- Use the Grid glow sparingly so it always means "power".
- Vary every repeated kit with vertex jitter, decay and props.
- Keep text dry, specific and human.

**Don't**
- Use pure black (`#000`) or pure white (`#FFF`) anywhere in the world.
- Use saturated primary colors outside the accent slots.
- Use photoreal textures, lens flares, chromatic aberration, or heavy screen-space effects.
- Use the cyan-teal glow for anything that is not the Grid.
- Show real brands, logos, copyrighted characters, or readable real-world trademarks.
- Place text-heavy signage that would need localizing. Use pictograms.
