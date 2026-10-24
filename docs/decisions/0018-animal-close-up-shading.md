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
- Still painted per vertex: the tiger (its own builder and a plain-density body), the zebra's face
  and legs, the clouded leopard's legs and head, and bird plumage.

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
  Felines keep their own haunches (`muscles: false`), and pillar legs are unchanged.
- **Neck:** a tube rooted low in the chest, deep and flattened side to side where it leaves the
  shoulders, narrowing to the head. Before, it was one straight limb.

Cost: the usual models have 3% more triangles over those 51 species (520k to 537k, at most +25%
on the small coyote), the close-up models 1% more. Building them got slightly faster (1.37 to
1.18 s for all of them, usual and close), since a tube costs less than limbs with ball joints.

## Review

`http://localhost:8347/tools/animal-closeup-review.html` draws nine animals large under the
game's lights, camera angle and tone mapping. Framing can also show the game's own closest, usual
and zoomed-out scales, and Model switches to the close-up model (`?model=close`). `?bench=1` times each animal filling a Retina-size frame. `node tools/animal-closeup-capture.mjs [out] [query]`
saves its frames and a contact sheet. `CLOSEUP_ROOT=<checkout>` renders another checkout (copy the
page into it first).
