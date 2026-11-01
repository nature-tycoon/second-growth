# 0029 Bees and butterflies at the flowers, in 3D

2026-10-31. Cole: "Improve the fake bees and butterflies on the Serengeti map and other maps where
applicable, they don't match anymore."

## What didn't match

The ambient bees and butterflies were flat ellipses painted on the 2D effects canvas over the 3D
picture (`drawEffects` in `scene.js`), 0.3 above the ground over any tile with nectar:

- they showed through tree crowns, cacti and animals, since the canvas sits on top of everything;
- they were unlit and flat beside wildlife with per-pixel coats and soft light (0018);
- every map got the same four colours, including the Serengeti and Sumatra, and in Atlanta they
  flew beside the map's real 3D monarchs, swallowtails and bumblebees, looking nothing like them;
- they hung at one height whatever was flowering, and vanished at eye level (the 2D effects are off
  there).

## Decision

They are small 3D insects drawn with the wildlife's own models and scale (`render3d/pollinators.js`):

- **Same spawning, new drawing.** Up to 40 in view, over tiles with nectar (`World.nectar`), as
  before. Each frame they go into the wildlife's instanced pools (`Fauna.add`, between `begin` and
  `end` in `Actors.update`), like visitors. So they are lit, hidden behind trees, use the far and
  close-up models by screen size, and show at eye level too (around the eye, 8 tiles).
- **At the flowers.** They hover at the height of the flowers on their tile: a flowering shrub's
  crown, or low over flowering ground. Butterflies bob and settle with their wings folded, opening
  them now and then; bees keep lower and work a flower briefly.
- **Each map's own species.** `look.ambience.pollinators` in `js/maps/*.js` lists them:
  `{ animal: 'monarch', w }` borrows the map's own species (the same model and pool), and
  `{ sprite: {...}, w }` adds one the map doesn't simulate; `w` is how common it is.

  | Map | Pollinators |
  | --- | --- |
  | PNW | western tiger swallowtail, mourning cloak, yellow-faced bumblebee |
  | Atlanta | its own monarch, tiger swallowtail and bumblebee |
  | Amazon | blue morpho, a sulphur, stingless bees |
  | Sumatra | its own Rajah Brooke's birdwing, a grass yellow, Asian honeybees |
  | Chinandega | a morpho (*Morpho peleides*), a sulphur, honeybees |
  | Serengeti | African monarch, brown-veined white, African honeybees |
  | Reef | none |

- The butterfly model gains `plain`: one ground colour, a dark margin (`edge`), faint veins and an
  optional dark tip with pale spots (`tip`). Whites, sulphurs, morphos and the African monarch all
  come from it. The monarch, swallowtail and birdwing keep their own painters.

## Not done

- They are scenery, not simulated: they don't pollinate, feed anything or show in the field guide.
  `World.nectar` is still what the simulation reads.
- A whole 2D layer of them on the effects canvas would be cheaper still, but cannot be hidden by
  the trees in front of it, which was most of what looked wrong.

## Check and cost

- `node tools/pollinator-check.mjs`: every map's list resolves to insect models that build, a bee
  and a butterfly on each land map, none on the reef, drawn 0.03-0.25 tiles across.
- Cost: `PLAY_VIEWS=play,close,closest node tools/play-profile.mjs serengeti high 1`, main (0be3dae)
  then this branch (which also has the sprawling lantana), on mains power but with a load average
  of about 5 from other agents' simulations, so read small differences as noise:

  | View | Before | After |
  | --- | --- | --- |
  | Play | 59.5 fps, drawing 3.1 ms, GPU 11.1 ms, 1.9M triangles | 59.8 fps, drawing 3.1 ms, GPU 10.7 ms, 2.2M |
  | Close | 60 fps, drawing 1.6 ms, GPU 10.4 ms, 0.7M | 59.3 fps, drawing 2.9 ms, GPU 8.2 ms, 0.7M |
  | Closest | 60 fps, drawing 1.4 ms, GPU 8.7 ms, 0.3M | 60 fps, drawing 1.5 ms, GPU 6.9 ms, 0.3M |

  All within the per-part ceilings (drawing 8 ms, GPU 11 ms). The close view's drawing rose 1.3 ms
  in this one run (plants 0.41 to 0.86, animals 0.06 to 0.13); the two games diverge, so it wants a
  repeat on a quiet machine before reading anything into it. The insects add up to three species
  pools (and their far and close models): a few draw calls.
