# 0019 Bare soil up close

October 2026.

## Problem

At eye level (watch mode, `F`) the ground near the camera is drawn from the 64-pixel tile textures stretched over hundreds of screen pixels. Bare soil and mud were worst: they are drawn with the grass texture tinted brown, so up close they showed blurry brown grass blades. Serengeti's hardpan (gravel there) showed blurry pale blobs.

## Decision

The ground shader paints bare earth per pixel, the way animal coats are painted (0018), only where the ground is bare **and** close enough that a tile's texture is stretched (`soilNear`: a pixel narrower than about one texel, 1/64 of a tile). There the tile's texture gives way to its average colour (`tileMean`, a coarse mip read at the cell's middle) and `bareEarth` in `render3d/terrain-materials.js` draws:

- small rounded clods (a jittered cell pattern, warped by noise so it doesn't look like paving), each its own shade and height;
- the odd pebble: one cell in 20 on soil, most cells on gravel, none in sand or mud;
- fine grit and pale specks from the noise texture;
- a bump from the painted height, so clods and stones catch the sun.

Each layer fades to its average once it's finer than a pixel, so nothing shimmers and the usual top-down view never pays for it.

Each tile says how bare it is (`Terrain.updateSurface`): soil, mud, plowed fields and gravel are bare; groundcover growing on them, a closing canopy and burning change that. The amount and a mud bit sit in the low 6 bits of the tile texture's green channel (the rotation keeps the top 2). Blue still marks crisp-edged tiles with 0, and for soft tiles says the kind of bare ground: 255 earth, 200 stones, 150 sand. Gravel is crusted earth on `hardpan` maps (Serengeti), sand on `look.sand` maps and stones elsewhere, including the reef's rubble. Worn game trails get the same soil. After rain, soil softens toward mud: flatter clods and no pale specks, but never bigger ones. The clod pattern is scaled from the map's corner, so any clod size that changes over time (it once followed the wetness) slides the whole pattern across the ground while rain starts and dries.

## Cost

Measured on Cole's Mac at 3840×2160, at eye level looking over ground that is mostly bare (the worst case), timing the terrain with the painting on and off in one session:

- Balanced and High: about +1.5–2 ms a frame (about 12 → 14 ms).
- Fast: about +0.4 ms, within noise. Fast keeps only the flattened texture and grit, with no clods, stones or bump (`GROUND_FAST`).
- Top-down view at ordinary zoom: nothing. No pixel is close enough to qualify, and the extra code costs nothing when it doesn't run (checked with the painting compiled in but switched off at run time).

Cost-saving choices: a sine-free hash giving three values per cell, the four nearest cells instead of nine, and three noise patterns packed into one texture (red as before, green a second field, blue one four times finer), so one lookup gives the warp and one the grit.

## Not done

- Grass with sparse cover still shows the stretched grass texture up close.
- Roads and trails tiles (crisp) keep their texture. Only the worn-trail overlay gets soil.
- No measurement on the Intel HD 520 target. Fast is what it runs, and Fast's cost is within noise here.

Check: `node tools/bare-soil-check.mjs`.
