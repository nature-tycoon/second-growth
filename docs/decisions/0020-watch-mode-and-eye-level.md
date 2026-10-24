# 0020 Watch mode and eye level

2026-10-23. Cole asked for a cinematic mode just for watching, and to explore watching in first person.

## Decision

**Watch mode** (`js/ui/watch.js`, key `C`, the camera button beside the rotate buttons, or Menu →
Watch). The panels go, thin letterbox bars come in, and the camera directs itself:

- It picks an animal by what it's doing (`interest()`: a rush or hunt counts most, then carrying or
  eating a catch, sparring, fleeing, play, drinking, bugling, feeding; a young one at its mother's
  side counts extra). Recently shown species are less likely, so shots vary.
- It glides over (closer for small animals), follows for about 16 s with a slow drift round, and stays
  through a hunt or chase for up to 40 s. Every fourth shot is a wide view of the land.
- A caption names the animal and gives the inspector's status line (`UI.agentStatus`, taken out of
  `agentHTML` so both share it).
- Keystone moments still play, and the director starts a new shot once one ends.
- The game runs at whatever speed it was. The bar has the top bar's speed buttons (pause, 1–3;
  added 2026-10-24 at Cole's request), and Space and 1–3 work too. Clicks, drags and the scroll
  wheel never reach the map; they only bring up the bar (speed, Next, Eye level, Done). The − on the
  bar's end (or `H`) tucks it into one small, faint button, and then moving the mouse leaves it
  away until that button is pressed. Esc or C leaves and flies back to where the
  view was.
- **One species** (2026-10-24, Cole: "track a specific animal species"). The chip at the start of
  the bar (or `S`) lists the species out right now (awake, not leaving), most numerous first, with
  their portraits and counts. Choosing one narrows `pick()` to it: Next and each new shot move
  between its animals, wide land shots are skipped, and when it's the only one out the shot just
  carries on with it. If none are left (all gone, or asleep for winter) the director goes back to
  all animals and the chip says so. Works the same at eye level. To keep the bar tidy, the line of
  key hints it used to carry went into the buttons' tooltips. Phones are played in landscape, where
  the bar fits on one row (checked at 812×375); below 960 px wide the caption hides while the bar is
  up, since a long name would run under it. Narrower than 620 px (an upright phone, not the target)
  the chip takes its own row above the other controls.

**Eye level** (`F` in watch mode; `js/render3d/eye-camera.js`). This is a ride-along view rather than
literal first person: a perspective camera low behind the animal, a little above its head, looking
the way it faces. I chose that over a head camera because a head camera dips into the grass
whenever the animal grazes, swings with every glance, and never shows the animal you're watching.
The eye is never closer than 0.3 tiles to the ground, since a tortoise's real eye height is a wall
of grass blades. On upright phones the view widens so the animal isn't cropped.

What eye level changes in the renderer (only while it's on):

- The haze. `scene.fog` is always present but pushed out of reach (near 1e5) in the usual view. At
  eye level it closes in from 9 to 34 tiles and takes the sky light's colour, and the background is
  the same colour, so the map's edge melts into it. Keeping fog in the shaders permanently means
  switching to eye level doesn't recompile every material (a multi-second stall on weak GPUs).
- The far plane stops at 34 tiles, so the plant view (already frustum-generic) culls everything past
  the haze. `ActorView` now culls for a perspective camera too (a fixed 1.5-tile margin), and the
  animal pools choose distant models by each animal's distance (`begin(ppu, eye)`).
- Plants draw at the detail for zoom 1.6 (`Renderer.eyeDetail`): the finest models on Balanced and
  High, the in-between ones on Fast.
- The "look through" focus (focus.js) works along the line from the animal back to the eye, with a
  narrower gap, so grass and leaves right in front of the lens part.
- The shadow box covers 13 tiles around a point 7 tiles ahead of the eye.
- The 2D effects layer (water sparkles, rain streaks, particles) is skipped, because it's placed
  for the orthographic view. Only the light wash over everything stays.

**The sky at eye level** (`js/render3d/eye-sky.js`, added the same day at Cole's request: "make the
sky visible with clouds, fog, blue sky, storm, etc from the ground"). A dome round the eye shades
from the haze at the horizon to blue overhead, tinted by the time of day (gold round a low sun,
deep blue with stars and the moon at night) and greyed by cloud.

- The clouds are the same noise field whose shadows drift over the ground (`CLOUD_NOISE` in
  `atmosphere.js`), seen from below on a layer 10 tiles up, so a cloud overhead is the one shading
  the grass. At eye level those ground shadows are always on (they fade out close up in the usual
  view). Coverage follows the weather as before: mostly clear, now and then fair-weather clouds,
  broken cloud on cloudy days, and a grey veil with heavier, darker cloud in rain and snow.
- Fog follows the weather: 9–34 tiles when clear, closer when cloudy, 3–22 in rain, 2–18 in snow,
  and a dawn mist. Its colour is the dome's horizon, so the land melts into the sky.
- The clouds light up from inside with each lightning flash (below).
- Rain and snow fall round the eye: a fixed set of streaks and flakes wrapping round a box that
  travels with it, moved entirely in the vertex shader (2,400 streaks, 2,000 flakes, one draw each).
- Not under the sea (the reef keeps its water haze), and Graphics → Weather off turns the rain,
  snow and lightning off.
- Cost: the dome is drawn after the land with the depth test on, so only the visible sky's pixels
  run its shader (four noise octaves plus a lighter second sample for the sunlit side).

**Lightning strikes** (`js/render3d/lightning.js`, `Renderer.updateLightning`; Cole asked for
strikes visible from the ground and in the usual view). Some rain days, the same ones all day
(`hash2(day, 7, 3) < 0.45`), are thunderstorms. Every 3–16 s there's a flash, and 70% of flashes
have a bolt: a jagged channel (midpoint displacement) with a few forks, flickering on, dim and on
again over 0.4 s. In the usual view it lands at a random spot on screen and starts above the top of
the screen. At eye level it lands 7–26 tiles out ahead, from the cloud layer 11 tiles up, and
shows through the rain haze. The flash is the renderer's exposure (×1.45 in the usual view, ×1.7 at
eye level), so nothing recompiles and no light is added.

The bolt is one mesh of segments widened to a few pixels in the vertex shader, so it reads the
same in both cameras. Two things to know about it: each segment's far end looks on past itself
(`aOther` = 2B − A) so both ends widen the same way, and the material is double-sided, since a
strip's winding on screen depends on which way the segment runs (single-sided, every strip that
ran the "wrong" way was culled and nothing showed). Not under the sea, and Graphics → Weather off
turns it off.

**Thunder** (`js/audio/thunder.js`, `Music.thunder`; added 2026-10-23). Each strike pushes where it
landed onto `lightning.strikes` (`{}` for a flash in the clouds), and the UI's per-frame audio pass
drains it. The listener is the middle of the view, or the eye at eye level. Thunder comes
`0.25 + d / 16` s after the flash (d in tiles: a stylized speed of sound, so it rolls in a second or
two later, not ten), softer and through a lower low-pass the farther it is, panned to its side.
Bolts nearer than about 32 tiles crack or clap; farther ones and cloud flashes (2.5–6.5 s later)
rumble. At most two rolls play at once, each at a slightly different speed. They're real recordings
per 0002: Jud McCranie's "Thunder crack 2B", Jonathan Hunt's "Thunder Claps" (both CC BY-SA 4.0) and
Bidgee's Darwin "Thunder" (CC BY 3.0), all Wikimedia Commons, four clips (385 KB) that download on
the first storm day. They were cut in Chrome and encoded with macOS `afconvert`, as this Mac had no
ffmpeg; `tools/prepare-field-audio.py` would re-encode them with its own filters.
`node tools/thunder-check.mjs`.

**The reef at eye level** (2026-10-24, Cole: the water looked too clear, so far fish read as near
ones; a clipped line where water meets air; a grey sky; too shallow). Under the sea is its own case
in `updateEye`:

- The water closes in from 0.5 to 13 tiles (air: 9 to 34), and the eye's far plane drops to 14
  (`WATER_FAR`), which also culls more. Its colour is what the seabed's own veil scatters
  (atmosphere.js's `sea` uniforms at the eye's depth, dimmed with the daylight, browner in a flood
  plume) instead of the old grey-green haze.
- The surface is drawn from below (sea.js, double-sided): the sky through Snell's window overhead
  with the sun in it, and a silvery mirror of the water past it. The surface goes on past the map's
  edge at eye level, and it fogs like the land.
- Gotcha: three's fog goes on *after* tone mapping, in screen colours (`fogColor` is the fog colour
  converted to sRGB). A ShaderMaterial that fogs to the linear colour before tone mapping ends
  slightly off the background and leaves a visible band at the horizon. sea.js mixes in
  `uFogOut` after `colorspace_fragment` for that reason.
- The eye stays on the animal's side of the surface (`EyeCamera.update(…, seaY)`): under it for a
  manta near the top, above it for a booby on the water. It used to straddle it, half air, half water.
  Above the water the usual sky and haze apply.
- Depth was left alone. The lagoon is 1 to 3 tiles deep (median 1.25), a few metres at the reef
  animals' drawn scale, which is right for a lagoon and reef flat. It read as shallower because the
  34-tile view made the water a thin, wide sheet and the eye sat just under the surface.

## Evidence

Measured on Enkare Conservancy (year 9, 402 animals, Fast). Triangles are a fair comparison here;
the preview tab's frame rate wasn't, since it read 1–2 fps in both views.

| view | triangles |
|---|---|
| usual view, zoom 0.62 | 1.44M |
| eye level, first try (nothing culled, every animal in detail, finest plants) | 5.5M |
| eye level, animals culled and distant models, finest plants | 1.29M |
| eye level, as shipped (plant detail 1.6) | 0.38–1.17M across five animals |

`node tools/watch-check.mjs` checks where the eye sits (behind, above, never under the ground or
in the grass), that it snaps to a new animal and eases after the same one, the wider phone view,
perspective culling, and distant models by distance.

## Open

- Eye level hasn't been measured on the low-end target (Intel HD 520). Run `tools/play-profile.mjs`
  with watch mode on before promoting it beyond the watch bar.
- Lightning never starts a fire. It's drawing only; PNW's "dry lightning strike" fires are still
  the fire events' own.
- The sky's cost on the low-end GPU is unmeasured, like the rest of eye level.
- Canopy climbers (monkeys, orangutans) at eye level are untested by eye. On the reef, a seabird
  followed above the water is checked only in `watch-check.mjs`, not by eye.
