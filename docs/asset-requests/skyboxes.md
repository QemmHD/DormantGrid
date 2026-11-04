# Skyboxes (ChatGPT can make these, with care)

Format: PNG, 2048×1024 equirectangular (2:1).
The horizon goes exactly at mid-height.
The left and right edges must meet seamlessly.
No ground detail below the horizon (fade to the
fog color). Drop into: `assets/incoming/skyboxes/`

| # | ID | Sky |
|---|---|---|
| 1 | sky.day_clear_01 | Pale gray-blue, thin clouds. Zenith #6F8296, horizon #B4B8B4 |
| 2 | sky.day_overcast_01 | Flat gray cloud deck, #868C90 |
| 3 | sky.dusk_01 | Zenith #3C4A66, horizon #D08A5A |
| 4 | sky.night_01 | Zenith #0C1220, horizon #1E2838, faint stars |
| 5 | sky.storm_01 | Zenith #3A4048, horizon #6A7074, heavy clouds |
| 6 | sky.fog_01 | Near-uniform #7D8792 haze |

## Prompt
```
Equirectangular 360 sky panorama, 2048x1024,
2:1 ratio, horizon exactly at mid-height,
left and right edges tile seamlessly.
Stylized painterly clouds, soft, simple shapes,
muted colors. No sun disc, no ground, no
buildings, no text. Below the horizon, fade to
solid [#B4B8B4]. Sky: [pale gray-blue day with
thin high clouds], zenith [#6F8296].
```
If the seam shows, ask: "shift the image 50%
horizontally and repaint the seam".
