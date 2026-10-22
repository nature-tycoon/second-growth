# 0016 Carcasses break down on screen

2026-10-21. Cole asked to show a kill breaking down over time from scavenging and decay. The first
version flattened the whole body into a hide with a ribcage laid on top. Cole wanted the ribs to
grow from the spine, the torso to look as though it were being pulled away in 3D, and the end to
be a pile of bones that disappears.

## Decision

This is drawing only. A carcass's simulation (meals, lifetime, scavenger visits; 0008) is unchanged,
apart from two fields recorded at the kill so the renderer can tell how much is gone: `meals0` (the
meals it started with) and `feed` (the hunter's feeding time). Neither uses a random draw.

`carcassDecay(c)` in `js/render3d/carcass-decay.js` turns a carcass into stages. Each runs on its
age `u` (0 at the kill, 1 when it's removed) and only advances:

- `strip`: the torso's flesh drawing back. The hunter eats 30% and the scavengers 50%, a meal at a
  time; rot takes the rest by u 0.5.
- `wither`: the legs, head and tail shrinking onto their bones (u 0.35-0.65). The body is not drawn after.
- `settle`, `scatter`: the skeleton slumping flat and spreading into a pile (u 0.55-0.95).
- `gone`: the bones disappearing one by one (u 0.68-1), the skull and pelvis last.
- `dry`: the coat dulling and the meat going from red to dark brown.

The flesh is pulled in the animal shader (`decay()` in `animals/animal-material.js`), driven by a
per-instance `aDecay` (strip, wither, dry):

- Torso vertices move toward the spine line, the belly first.
- Leg vertices move onto their hip-to-foot line, the tail onto its pivot, and the head and neck onto
  the neck-to-snout line.
- A `vMeat` varying colours the pulled-back torso as meat.

The bones are one skeleton per species (`remainsGeometry`), fitted to its model by
`carcassAnatomy`. That measures the torso's spine and belly between the leg hips, each leg's hip and
foot, and the neck pivot and snout tip. The skeleton has:

- a spine;
- 9 pairs of ribs arching from the spine around the flank;
- a pelvis;
- leg bones;
- a neck and skull.

It is drawn with the carcass's own matrix, so it sits inside the body as the flesh recedes. Each
piece carries its centre, a scatter direction and the point at which it goes, so `Remains`' shader
can slump, scatter and shrink pieces individually.

## Gotchas

- Fauna pools always carry `instanceColor` (white) and `aDecay` (0). `Fauna.add(..., remains)`
  writes a slot only when it is, or was, a carcass, and uploads only then.
- Tints multiply in linear light: a multiplier of 0.4 reads as ~66% on screen. Pick colours as they
  should look and raise them to the power 2.2.
- Animal models stand on their origin (feet). A carcass rolled onto its side has its torso about
  `spineY * scale` off toward its back, and the model's z points down (side 1) or up. `Remains`
  passes where the ground is along z, `aGround`, so bones settle onto it.
- A carcass is drawn with graze 0 (head level), the pose the skeleton is fitted to.
- A skeleton takes 15-30 ms to build, once per species, when its first kill comes on screen.

## Checks

`node tools/carcass-decay-check.mjs [--print]` checks:

- the stages only advance, eating strips the body, and every bone has gone by the end;
- old carcasses without the new fields still draw;
- for all 59 species that leave a carcass across the maps, the skeleton fits inside the body and has
  18 ribs, each rising to the spine;
- pool slots reset when a live animal reuses them.

Kills were also rendered in headless Chrome: Serengeti zebra at seven stages, and a buffalo bone pile.
`moments-browser-check` passes with live animals beside a kill.
