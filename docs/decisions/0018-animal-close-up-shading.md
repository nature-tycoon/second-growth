# 0018 Animals look better up close

2026-10-23. Cole asked for animals to look better zoomed in, without making the game much slower to
draw. The plan has four steps, cheapest first:

1. **Lighting and eyes** (done): fur and feathers soften the light, creases are shaded, eyes catch
   the light.
2. **Shading baked into the models** (done, with step 1): creases measured once per model.
3. **Markings drawn per pixel** (open): spots, stripes and patches worked out in the shader from
   the model's own coordinates, so they stay sharp. Then the extra-dense bodies that only exist to
   carry markings can go (jaguar 41k triangles, lion 26k, zebra 23k, against a 7k average).
4. **A close-up model** (open): smoother legs and heads, plus nostrils, lids, hooves and claws, only
   for animals more than about 300 pixels long on screen, built the first time it is needed.

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

## Review

`http://localhost:8347/tools/animal-closeup-review.html` draws nine animals large under the
game's lights, camera angle and tone mapping. `node tools/animal-closeup-capture.mjs [out] [query]`
saves its frames and a contact sheet. `CLOSEUP_ROOT=<checkout>` renders another checkout (copy the
page into it first).
