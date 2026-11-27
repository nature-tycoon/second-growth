# 0058 Horizon: the far edge melts into a sky behind the canvas

## Rules

- In the usual view the land's far edges (the two facing away from the camera) melt over `LAND_MELT`
  (7) tiles into `haze.uMeltColor` (`landMelt` in `MELT_GLSL`, `js/render3d/atmosphere.js`); the near
  edges keep their soil walls (the diorama). Off at eye level (`uMelt` 0), which has its own fog and sky.
- The page behind the transparent 3D canvas (`#backdrop`, `js/render3d/backdrop.js`) is that same
  colour as it lands on screen: `screenColor` copies three's `NeutralToneMapping`, the map's grade
  (`installGrade` returns it) and sRGB. Change the tone mapping or the grade's formula and change
  `screenColor` with it, or the far edge shows a seam.
- Anything drawn in the usual view must go through `withClouds` (or, like the reef's sea surface in
  `sea.js`, use `MELT_GLSL` itself) or it won't melt and stands out against the sky at the edge.
- The backdrop is one CSS gradient on its own layer, set at most every 120 ms and only when it changes:
  no GPU work in the frame. Its top 62% is exactly the melt colour (a tint there would outline the land
  wherever its far corner lands on screen). Saved pictures paint it (`capture`).
- The melt colour: the haze leaned toward the ground's bounce light (`MELT_LAND`), toward the light's
  colour by the hour's warmth (`MELT_SUN` x `tod.sunAmt`), darker at night (`MELT_NIGHT`). Tune there.
- A session that opens without the intro film starts at `LATE_START` (0.66 of the day) so the first
  minute runs into golden hour; the film's first visit keeps the renderer's own start (`todClock`,
  0.45), which `intro-film-check` holds to the film's last frame.
- No new shader programs (the melt is in the shared patch); check `node tools/first-frame-profile.mjs`.
- The season tint, the savanna's dry glare, the golden hour and the night are light, not 2D washes
  (2026-11-26, aesthetics s4): one shared multiplier on the diffuse light, `haze.uLightTint` in
  `withClouds` (specular untouched, so water keeps its sparkle at night), computed by `washInto` from
  `WASH_*` in scene.js, (1, 1, 1) at eye level. It is multiplied into the melt and haze colours once,
  before `screenColor`, so the backdrop still matches. Never paint a full-screen wash on the 2D layer
  again; a lit material outside `withClouds` (the reef's sea surface, `sea.js`) applies the tint itself.

## History

2026-11-26, session 1 of the [aesthetics plan](../aesthetics-plan-2026-11-26.md). Zoomed out, the farm
stopped at a hard cut over the page's fixed dark green (`#1f2c24` radial gradient in styles.css),
whatever the map, hour or weather. Fading the whole edge into the sky was considered and rejected: the
soil walls are deliberate ("like a diorama", `buildSkirt`), so only the far edges melt. The first
backdrop had a bluer top band; it outlined the land's far corner, so the top is now flat. The haze
alone read cold and foggy at golden hour, hence the lean toward the ground and the sun. Starting every
session in late afternoon would have meant re-filming the intro (its last frame must match the start
hour), so the late start applies only when no film plays.

2026-11-26, aesthetics session 4: the washes moved into the light (rule above). The old washes greyed
highlights and lifted the shadows (a translucent fill); as a multiplier on the light the medians match
the old pictures and only the highlights and shadows separate (`docs/ideas/2026-11-26-aesthetics/s4/`).
`release-scenes` never drew the 2D layer, so `value-capture --fx` puts it back for a fair comparison.
