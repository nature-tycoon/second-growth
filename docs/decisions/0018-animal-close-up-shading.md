# 0018 Animals look better up close

2026-10-23. Cole asked for animals to look better zoomed in, without making the game much slower to
draw. The plan has four steps, cheapest first:

1. **Lighting and eyes** (done): fur and feathers soften the light, creases are shaded, eyes catch
   the light.
2. **Shading baked into the models** (done, with step 1): creases measured once per model.
3. **Markings drawn per pixel** (done): spots, stripes and patches worked out in the shader, so
   they stay sharp, and the extra-dense bodies that only existed to carry them are gone.
4. **A close-up model** (done): the same animal in finer segments, so outlines stop showing
   facets, drawn only for animals large on screen and built the first time it is needed.

Bending knees and a fine fur texture would come after that, as their own decision.

## How steps 1 and 2 work

- `bakeSurface` (`render3d/animals/animal-surface.js`) runs last in `buildSpecies`. For each vertex
  it adds up how much of the sky the model's other surfaces nearby hide (out to 9% of the model's
  size): under the belly, inside the legs, where legs and neck meet the body. Folded wings are
  left out, because they spread in flight.
- The result rides in the **length of each vertex normal**: occlusion (0.3–1) plus 2 × shine (0
  for fur and skin, 1 for horns, antlers, tusks, hooves and the generic nose, 2 for eyes). There
  were two other options. A new vertex attribute won't fit, because canopy climbers already use
  every attribute some GPUs allow. Darkening the vertex colours would break the checks that compare
  exact palette colours, and would make colour and shading inseparable. Anything that reads a
  model's normals must normalize them. `simplifyAnimal` keeps the average length, so distant models
  match.
- `Model.add(..., { gloss })` tags a piece. The shared `eyes()` helper tags its eyes. Builders that
  draw their own eyes pass `gloss: 2`. A new builder that draws eyes by hand must do the same.
- The fauna shader (`FAUNA_LIGHT` in `animal-material.js`) replaces three's Lambert lighting. It
  adds:
  - Light that wraps 30% past the lit edge.
  - A rim of sheen toward the silhouette, partly neutral so dark coats still show an outline.
  - Creases that see less of the sky (fully) and of the sun (60%).
  - A sun highlight and a sky glint on eyes, and a faint highlight on shiny parts.
  - `motion.fur` is 1 for fur and feathers and 0.3 for scales, shells, fins and bare skin (`SCALY`
    in `animal-model.js`).

## Cost

- **GPU:** none measurable. `play-profile serengeti,amazon high 2` (play and close views, M5, on
  battery):

  | Map | Before | After |
  | --- | ---: | ---: |
  | Serengeti | 10.6 / 9.3 ms | 10.2 / 8.6 ms |
  | Amazon | 11.1 / 10.8 ms | 9.1 / 9.6 ms |

  60 fps throughout. The extra shader work is a few operations per animal pixel.
- **Building models:** about 60–110 ms more per map in node (Sumatra 144 → 255 ms in total). The
  worst single species went from 21 to 27 ms (jaguar 10 → 24 ms). Models are built the first time a
  species is drawn, so that is a one-time hitch when a new kind first appears. Step 3 should cut it
  back, since the bake scales with vertex count.

## How step 3 works

- `pixelCoat(kind, base, params, dark, mid)` (`model-core.js`) is a painter the shader finishes.
  Its vertices take `base` (the unmarked coat with its countershading), plus an `aCoat` attribute:
  the paint coordinate and which of the model's coats (`Model.coatSlot`, numbered from 1). Only
  marked models carry `aCoat`, so canopy climbers keep their attribute budget. The richest marked
  model uses 13 of 16.
- `COAT_GLSL` in `animal-material.js` holds one function per kind, each a GPU copy of the old JS
  painter:
  - `rosettes`: leopard and ocelot
  - `jaguar`
  - `dots`: cheetah, leopard cat, hyena
  - `spots`: heads and a jaguar's legs
  - `clouds`: clouded leopard
  - `zebra`
  - `giraffe`

  Edges are smoothed over about a pixel (`fwidth`). When a pattern's cells shrink below a couple
  of pixels, the marks fade to the coat's average tone instead of shimmering.
- Rosettes and dots are laid out round the body's axis in model space, like the jaguar's, so they
  run on over the shoulders, neck and haunches. Before, each sphere and tube got its own unrelated
  grid, and that showed as hatching on the neck. Cat heads get small solid spots.
- A body with a per-pixel coat uses the plain fine loft (56 × 36) instead of 84 × 60 or 128 × 88.
- Triangles:

  | Model | Before | After |
  | --- | ---: | ---: |
  | Jaguar | 41.1k | 22.6k |
  | Leopard, ocelot, cheetah, clouded leopard, leopard cat | about 17.6k | about 11.6k |
  | Zebra | 23.3k | 17.3k |
  | Giraffe | 20.9k | 14.9k |

  The distant models shrank too (jaguar 10.7k to 7.8k).
- **Cost:** `?bench=1` on the review page times one animal filling a 1440 × 900 frame at 2×. Every
  species matches step 1 within noise, except the clouded leopard at +0.6 ms: its blotches check
  27 neighbouring cells per pixel. Building models got cheaper too, since the crease bake has fewer
  vertices: Amazon 204 to 118 ms, and the jaguar 40 to 13 ms.
- **Adding a pattern:** write the painter as `pixelCoat(...)`, add a GLSL function with the same
  signature to `COAT_GLSL` and name it in `COAT_FN`. Avoid GLSL reserved words such as `patch`. A
  painter that wraps a `pixelCoat` in another function loses the tag and draws unmarked.
- **More species (2026-10-24).** Every marking that was blurred, aliased or lost on a coarse mesh
  moved to the shader too. New patterns in `COAT_GLSL`:
  - `tiger`, `tigerLegs`, `tigerHead`: the tiger's stripes, leg bars and face, laid out in model
    space as its JS painters were, so they run on across body, shoulders, thighs and neck. The
    countershading stays in the vertex colours.
  - `rings`: rings along a tail or tube (`u.x` along it): tiger, clouded leopard, leopard cat,
    cheetah, raccoon and coati tails, the zebra's mane and face, the armadillo's bands.
  - `lines`: stripes along the back by angle round the spine (chipmunk).
  - `flank`: a band along the flank over a pale belly, in model space (gazelle, impala).
    `pixelCoat(..., { legs: false })` keeps it off the legs, where it would ring each one.
  - `monitor`: bands and spots over monitor lizards, iguanas and anoles, in model space so body,
    neck and tail line up; the legs get the spots only.
  - `snake`: all five snakes, ported from their painter. The vertex colours keep the old painted
    markings, which the shader fades to when the scales get too small to draw.
  - Existing patterns took on more: `spots` on the clouded leopard's and leopard cat's legs and
    heads, the bobcat's head and the poison frog; `dots` on the bobcat's body.
- Triangles:

  | Model | Before | After |
  | --- | ---: | ---: |
  | Tiger (usual / close-up) | 16.9k / 41.8k | 15.1k / 37.4k |
  | Snakes, all five | 9.9k / 11.0k | 6.8k / 11.5k |
  | Monitor, iguana, ctenosaur, anole | 7.0k / 16.9k | 3.5k / 8.0k |

  The snake body was 144 × 32 only to carry its markings; 128 × 24 keeps the garter's stripes on
  vertices (`snake-model-check` reads them) and the skin over 90% of the model. Lizards drop to
  the plain loft. Gazelle and bobcat keep their small plain body (`coatFine: false`), since a
  per-pixel coat otherwise raises a quadruped's body to the fine loft.
- **Cost:** `?bench=1`, on battery, noisy (±1 ms between runs): no species slower beyond the noise.
  Blotches drawn from cells (`clouds`) cost about 0.5 ms more on the clouded leopard's legs and
  head, so those use `spots` instead. `play-profile serengeti high 2` (on battery, capped at
  30 fps): GPU 16.7 / 14.1 / 12.4 / 13.7 ms before, 15.1 / 12.8 / 13.1 / 14.4 ms after (play,
  wide, top speed, close), within noise. The Amazon run timed out on both checkouts that day
  (12% battery, Low Power Mode), so it still wants measuring on mains power.
- Still painted per vertex, and why:
  - Bird plumage: another agent was reshaping `birds.js` at the time.
  - Fish and reef patterns: small and seen through water, and their bands already read cleanly.
  - Butterflies, beetles and bees: never large on screen.
  - The palm civet's faint spot rows and the wildebeest's brindle bands: soft marks that already
    read on their fine bodies.
  - The topi's patches, the tiger's whisker pads and ruff: large or tiny blocks that per-pixel
    drawing would not change.
  - Crease shading on the elephants' and rhinos' hides: texture, not markings.

## How step 4 works

- `buildSpecies(def, { close: true })` builds the same model with every segment count 1.6 times
  finer (`Model.seg`, `CLOSE` in `model-core.js`): legs, tubes, the body loft, and spheres swapped
  for finer ones (`FINER`). Pieces painted from their own shape keep theirs. Only the geometry is
  used: poses, contact, head reach and picking still come from the usual model, so the close model
  has the same attributes and parts and stays within 1.4% of its size.
- `Fauna.add` draws it when the body covers more than `CLOSE_PIXELS` (64 CSS pixels, in
  `animal-lod.js`). At the game's closest zoom a zebra is about 96, a fox about 60, so it starts
  from about three times zoomed in, and in watch mode for the animals nearby. The selected animal
  gets it too.
- The close models are built in idle time, one per idle moment (`Fauna.closeUp`), so a herd
  coming into view draws the usual model for a frame or two instead of hitching. The slowest takes
  20–60 ms.
- Triangles: about twice the usual model on average, at most 2.6 times (topi, hartebeest: 14.8k
  to 38.6k).
- **Cost:** with seven zebras drawn close up at the closest zoom, 0.17M more triangles and no
  measurable GPU time (9.4 against 9.2 ms, M5). `PLAY_VIEWS=closest node tools/play-profile.mjs`
  measures the closest zoom, and says how many animals it drew close up.
- **What changed from the plan:** nostrils, eyelids, hooves and claws are not modelled. Finer
  segments everywhere were simpler, fix the faceting that showed most, and need nothing per
  species. Added details could come later, per species, on top of this.
- A check that counts drawn animals must add `close.count`, as well as `far.count`.

## Body shape (after step 4)

Cole said some animals looked fake or blobby. The 51 mammals built by `quadruped()` (deer, dogs,
cats, antelope, pigs, raccoons and the rest) shared three faults: a sausage body, legs hanging under
it like posts, and heads on thin pipe necks. All three are fixed in `quadruped()`, so they carry
to every one of them:

- **Waist and chest:** `loftBody` takes `tuck` (the belly rises toward the hind legs) and `keel`
  (the chest drops between the forelegs), shaping only the underside. Default 0.4 and 0.1 in
  `quadruped()`. Heavy animals set a small `tuck` (buffalo, warthog, peccary, beaver, rhino,
  elephant). Other `loftBody` callers default to 0, so they are unchanged.
- **Thighs and shoulders:** each leg is one smooth tube (`smoothLegs` is now the default). It
  starts wide and oval from front to back inside the body and narrows to the knee. Its top wears
  the flank's coat, never the belly's, shading into the leg colour toward the knee (`legPaint`).
  The hind thigh's top reaches back toward the rump (to 41% of the body length behind its middle),
  so the back of the thigh runs down from the buttock to the hock without a notch under the rump.
  Only long legs get the thigh: its width scales with leg length over body depth (`lk`, 0 at
  half the depth or less, so raccoons, otters and beavers keep slim legs). On long legs the knee
  (stifle) and the elbow sit up at the belly line, as on a deer; lower, the knee jutted forward
  and the leg looked bent backwards.
  Felines use these legs too (their fixed haunch and shoulder balls are gone, since the legs swung
  out from under them); a per-pixel coat is re-made over the blended colour (`legPaint`), so
  markings carry on down the leg. `muscles: false` still opts a species out. Pillar legs are unchanged.
- **Neck:** a tube rooted low in the chest, deep and flattened side to side where it leaves the
  shoulders, narrowing to the head. Before, it was one straight limb.

Cost: the usual models have 3% more triangles over those 51 species (520k to 537k, at most +25%
on the small coyote), the close-up models 1% more. Building them got slightly faster (1.37 to
1.18 s for all of them, usual and close), since a tube costs less than limbs with ball joints.

**Heads.** The head was a ball with a smaller ball stuck on for the muzzle, and up close read as
exactly that. `headLoft` in `quadruped()` makes it one smooth surface instead: the skull's oval
flows into a muzzle that narrows toward the nose (long muzzles only; a cat's stays blunt), the
forehead runs down into the bridge of the nose, the jaw line runs straight from under the ear to
the chin, and a brow over the eyes and cheeks below them stand out a little (`brow`, `cheeks`,
default 0.08). Round the eyes and between the ears the surface is the old oval, so eyes, ears,
antlers, horns and each species' own face pieces sit where they did. Paint still gets `u` as on a
sphere (`u.x` from the back of the skull to the nose). The muzzle's own colour (`muzzle`) blends
in where it leaves the skull; on a per-pixel coat the markings fade out over the muzzle instead
(`coatFade`: the vertex's coat slot set up to 0.45 under its number, which the shader reads as
how far to show them), so spotted cats keep a plain muzzle. `roundHead: true` brings back the
two balls for a species the shape doesn't suit. Cost: 1.4% more triangles over the 48 species
(the usual models, 481k to 487k, at most +4.8% on the raccoon), 1.6% on the close-up models.
Review: Framing → The head (`framing=head`) on the review page.

**Birds.** The 56 birds share `bird()` in `birds.js`, and read as a ball for a body with a second
ball for a head. Now:

- **Body:** a sculpted sphere (`sculpt`, its own 16×11 sphere, 26×17 close up) whose front half
  is the old ellipsoid (so chest bands, bibs and flank patches still sit on it) and whose back
  half narrows and lengthens into the tail, with the belly sweeping up to the vent and the back
  kept straight. Paint still gets the unit sphere's `u`, so every plumage paints as before. The
  tail roots at the new rump (`bodyAt`).
- **Neck:** short-necked birds get a tube rooted broad in the chest, narrowing to the head's own
  width, coloured from back and breast into the head, so breast, nape and head make one outline.
  Their head now bends from that root (the neck's pivot), so the neck stays inside the back when
  the bird pecks. Ducks' necks swell into the breast the same way (the mallard drake's collar
  rides on it), and a vulture's bare neck reaches forward out of a ruff at the front of the body.
- **Folded wings** take the body's radius at each point along them (`Model.wing`'s `R` may be a
  function), so they lie on the shoulder and taper in over the rump instead of standing off it as
  a fin over the back. Coverts are nearer the body colour (4% lighter, not 10%).
- **Hawks and eagles** (`raptor`): a longer, narrower body, a smaller head with a flat crown and
  a bony brow over each eye (`brow`), and a deep bill that arches into a downward hook with a
  waxy cere at its base (`cere`). Every hooked bill (vultures, macaws, the secretarybird) uses the
  hook tube. The red-tailed hawk's bill is dark now, as it is in life.

Cost: 3.7% more triangles over the 56 birds (337k to 350k; at most +9% on the hawks and eagles),
6% on the close-up models. Review: Pose → Flying (`pose=fly`, framed on the spread wings).

## Review

`http://localhost:8347/tools/animal-closeup-review.html` draws nine animals large under the
game's lights, camera angle and tone mapping. Framing can also show the game's own closest, usual
and zoomed-out scales, and Model switches to the close-up model (`?model=close`). `?bench=1` times each animal filling a Retina-size frame. `node tools/animal-closeup-capture.mjs [out] [query]`
saves its frames and a contact sheet. `CLOSEUP_ROOT=<checkout>` renders another checkout (copy the
page into it first).
