# 0028 The real moon and a deeper clear-day sky

2026-10-31. Cole asked to "make the moon look more like the real moon with texture" and to "make the
sky bluer on clear days".

## Where they show

Only at eye level (watch mode's ride-along view and walking, `eye-sky.js`). The usual view looks down
on the land and draws no sky or moon: what reads as "sky" there is the hemisphere light's colour on
the ground and in the water, and that's left alone, since bluing it would tint every map's land.

## Decision

**The moon** (`js/render3d/moon.js`). Its face is the real near side, worked out once at start-up into
a 128 px texture (64 KB, no download, no image file): the maria placed at their real selenographic
latitudes and longitudes and real sizes (Imbrium, Serenitatis, Tranquillitatis, Crisium, Fecunditatis,
Nectaris, Nubium, Humorum, Procellarum as a ragged chain, Frigoris as a thin northern band), their
edges broken up with noise so they run into each other, pale mottled highlands, and the bright young
craters (Tycho with rays, Copernicus, Kepler, Aristarchus). It's always full: the game's nights are
always moonlit (the land's moonlight never changes), so phases would show a dark moon over a moonlit
land.

- It turns the right way for the map's latitude (`lat` on the map definition). `moonAxes` points the
  face's north at the sky's north pole (the scene's north is -z), so it's north up from the
  Cascades and Atlanta, upside down from the reef, and on its side near the equator (Serengeti,
  Amazon, Sumatra), as people there see it.
- The disc is the same size as before (about 3 degrees: six times the real half degree, so it reads
  on a phone). It darkens a little toward the edge, as a full moon does.

**The clear-day sky** (`updateSky` in scene.js, and the dome's gradient in eye-sky.js). On a clear day
with the sun well up (elevation over 24 to 44 degrees) the zenith moves toward a deep blue
(`SKY_DEEP`) and the horizon toward a pale, milky band (`SKY_PALE`), and the gradient between them
steepens, so the deep colour is reached about 30 degrees up and the pale band hugs the horizon
(the real Rayleigh look). Before, the blend was so gradual that the sky halfway up was still part
horizon colour, which greyed any deeper blue.

- `SKY_BLUE` (0..1) is the strength. Cole was shown three (0.4, 0.7, 1.0) side by side on the
  Serengeti and the Amazon and picked 0.7, the medium one.
- Each map's `look.skyHaze` (0 dry and clear .. 1 humid) holds the blue back and whitens the horizon:
  Serengeti 0.1, PNW 0.15, reef 0.2, Chinandega 0.35, Atlanta 0.45, Amazon 0.6, Sumatra 0.65. The
  map's sky light colour still tints it as before (Amazon's burning season stays smoky).
- Dawn, golden hour, dusk, night, cloudy days, rain, snow and storms get exactly the colours they
  had: the clear factor is 0 for all of them (cloud cover past about 0.54, a storm, the night, or a
  sun under 24 degrees).

## Cost

No new draw calls or per-frame allocations. The dome gains one uniform and a texture lookup that
only runs on the moon's own pixels at night. The usual view runs none of this.

## Uncertain

- The scene's north is taken as -z (Chinandega's volcano stands "off the north edge" at -z). If that's
  wrong, the moon near the equator is tipped the wrong way round; north and south hemispheres are
  still right.
- The moon still rides where the game's night "sun" is, low in the sky (6 to 7 degrees). Nothing
  ties its place in the sky to the date.

## Check

`node tools/watch-check.mjs`: the face has dark seas where the real ones are and Tycho brightest,
the face turns with latitude, a clear sky is deeper blue than a cloudy one, a cloudy day keeps
its old colours, and the humid tropics are milkier than the savanna.
