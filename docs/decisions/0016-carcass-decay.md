# 0016 Carcasses break down on screen

2026-10-21. Cole asked to show a kill breaking down over time from scavenging and decay. The first
version flattened the whole body into a hide with a ribcage laid on top. Cole wanted the ribs to
grow from the spine, the torso to look as though it were being pulled away in 3D, and the end to
be a pile of bones that disappears.

Cole then asked whether the mechanic was too gruesome. The answer was to keep it: it shows the food
web, and the low-poly style keeps it in field-guide territory. The bright red first week is the part
that could put players off, so Graphics → Carcass decay (`settings.decay`, on by default) turns it
off. Off, a kill lies whole and sinks away over its last 30%, as before this decision. Cole also
asked for a more realistic skull and pelvis, and a page showing every skeleton.

Next, Cole asked for two more things. Animals that die of old age, hunger or sickness should leave
a body too; until then they just vanished. And skeletons should keep their antlers, horns and tusks,
so the remains stay recognisable.

## Natural deaths

`leaveBody(wl, a)` in `sim/animal-life.js` runs when the monthly update removes an animal as
`'natural'`. That is the one cause behind old age, starvation, overcrowding and poor habitat. Animals
that move on instead (`leave`) leave nothing.

- **Who leaves a body:** `leavesCarcass(def)`, the same test a kill uses: length 20 or more and not
  a flyer or swimmer.
- **The body:** a carcass with no hunter (`by: null`, `feed: 0`). It has the same meals by size and
  the same 21-33 day life as a kill, so `carcassDecay` starts it whole.
- **Food:** scavengers find and eat it like a kill. This is carrion, as in nature (0001).
- **Random numbers:** it draws from `Math.random`, not the monthly `game.rng`.
- **The 16-carcass limit:** when it's full, the oldest natural body goes first, so a die-off never
  crowds out kills that hunters and their packs are feeding at.

`balance-sim restore 15` was run with six `Math.random` seeds (73621, 1101, 2202, 3303, 4404, 5505)
before (`c66d4df`) and after, on the PNW map:

| | Before | After |
|---|---|---|
| Goals completed | 15 in all 6 | 15-16 in all 6 |
| Cougar and bear | present in 5 of 6 | present in all 6 |
| Deer at Year 16 (mean) | 14 | 12 |
| Elk at Year 16 (mean) | 17.3 | 13.7 (one run fell to 2) |
| Red-legged frogs established | 6 of 6 | 3 of 6 (stuck at a single frog) |

The runs diverge early, because the bodies and the extra scavenging draw on the seeded random
numbers. So these are separate trajectories, not paired comparisons.

- **No mechanism links carcasses to deer, elk or frogs.** The PNW scavengers (coyote, raccoon)
  don't hunt them. The cougar never visits a body it didn't kill. Natural mortality is unchanged.
  Prey ignore carcasses, and the landscape of fear records hunts, not bodies.
- **Hungry predators don't leave on the difficulty this runs at:** they only leave on Challenging.
- **The differences are noise:** deer t = 0.8 and elk t = 1.3, not significant. The one elk run
  that fell to 2 had its herd arrive a year later, 3 animals instead of 5. The frog failures are the
  existing trap of a lone early frog that can't breed.

Cole confirmed that every carcass, a kill's or a natural death's, belongs to the food web. A body's
meals are finite (one per 20 units of length), and whatever the scavengers don't eat goes when its
timer ends: the decomposers' share. So carrion can't feed scavengers without limit.

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

The flesh is pulled in the animal shader (`decay()` in `animals/animal-material.js`), driven by
strip, wither and dry packed into the carcass's animation phase (see Gotchas):

- Torso vertices move toward the spine line, the belly first.
- Leg vertices move onto their hip-to-foot line, the tail onto its pivot, and the head and neck onto
  the neck-to-snout line.
- A `vMeat` varying colours the pulled-back torso as meat.

The bones are one skeleton per species (`remainsGeometry`), fitted to its model by
`carcassAnatomy`. That measures the torso's spine and belly between the leg hips, each leg's hip and
foot, and the neck pivot and snout tip. The skeleton has:

- a spine, continuing into tail vertebrae traced along the model's own tail;
- 9 pairs of ribs arching from the spine around the flank;
- shoulder blades against the ribs;
- a pelvis: a sacrum on the spine, and on each side an ilium blade flaring forward from the hip
  socket (a dark cup with a rim), and an ischium and pubis that close a loop around the obturator hole;
- leg bones traced through each model leg's own knee and hock (or elbow and wrist), at two thirds
  and one third of its height, with a foot;
- a neck;
- a skull, lofted from cross-sections: a cranium and a muzzle, eye sockets with bony rims,
  cheekbones, a nasal opening, a lower jaw with teeth, and the condyles it sits on.

The skull is measured in two parts, so each species keeps its own face (`skullFit`):

- **The eyes:** they anchor it, from `motion.eyeSpot`. That is `eyeAt` where the model has eye-shine,
  otherwise the spot the `eyes()` helper or the builder records.
- **The cranium:** behind the eyes, as wide as the eyes are apart, or as most of the head beside
  them where that is wider (a crocodile's eyes sit close together on a broad head).
- **The muzzle:** from the eyes to the snout tip. The snout tip is the head's foremost point near eye
  level, ignoring horns and tusks, so an elephant's or tapir's trunk doesn't stretch the skull.
- **Width and depth:** at five stations along the muzzle, never more than the head's own muzzle
  there. A gharial's snout stays thin and a hippo's broad. The jaw and teeth follow it, with more
  teeth in a long jaw.
- **Eye sockets:** bigger in a short face.

So cats get a short face and big sockets, grazers a long muzzle, crocodilians a long flat snout and
elephants a dome. A model with no eye position falls back to the head's own proportions.

The horns, antlers, ossicones and tusks are the model's own geometry. Model builders tag them
`hard`, as a part option or for everything added inside an `antlers` callback, and
`geo.userData.hard` lists their vertex ranges. `carcassAnatomy` copies those triangles. The skeleton
carries them as a piece (kind 6) that shares the skull's centre, scatter and disappearance point, and
keeps its own colours rather than the bone tint. Because the skull is anchored to the eyes, they grow
from it.

Cole suggested using the head mesh itself, whitened with hollow sockets and a jaw. That would carry
the neck tube (part of the head part), ears, manes and eyeballs, so the fitted skull stays. Taking it
from the eyes gets the same alignment. The template is a grazer's: carnivores and elephants get the
same shape, which matters little because only prey leave carcasses.

It is drawn with the carcass's own matrix, so it sits inside the body as the flesh recedes. Each
piece carries its centre, a scatter direction and the point at which it goes, so `Remains`' shader
can slump, scatter and shrink pieces individually.

## Gotchas

- Tints multiply in linear light: a multiplier of 0.4 reads as ~66% on screen. Pick colours as they
  should look and raise them to the power 2.2.
- Animal models stand on their origin (feet). A carcass rolled onto its side has its torso about
  `spineY * scale` off toward its back, and the model's z points down (side 1) or up. `Remains`
  passes where the ground is along z, `aGround`, so bones settle onto it.
- A carcass is drawn with graze 0 (head level), the pose the skeleton is fitted to.
- `BufferGeometry.clone()` shares `userData` by reference. Setting a flag on a cloned part's
  `userData` sets it on the cached source geometry too, and so on every later part built from it.
  Give the part a new object: `g.userData = { ...g.userData, hard: true }`. The older `canopyFur` tag
  in `animals/model-core.js` mutates in place and may leak this way.
- Fauna shaders have no attribute to spare. WebGL guarantees 16, but ANGLE (Chrome on Windows, and
  headless Chrome) can keep one for itself, and canopy climbers already used 15. The first version of
  this feature added `aDecay` and `instanceColor`, and the langur's shader failed to link ("Too many
  attributes"; `canopy-reveal-browser-check` caught it). A carcass never moves, so its decay now
  rides in its animation phase: `carcassPhase()` in `animal-pools.js` packs strip, wither and dry
  below -100000, and the shader reads the phase as 0. The horn tag lives only in JavaScript.
  `carcass-decay-check` keeps every species at 15 or fewer.
- Skeletons are built from light, indexed primitives (`tube`, `ball`, lofts) with no welding. Ribs,
  legs and tails are continuous tubes, and the horns are copied with their shared vertices. A
  skeleton averages about 4,350 vertices and about 2.4 ms to build on an M-series Mac. The first
  version, made of capped cylinders welded and then split into loose triangles, averaged 18,700
  vertices and 6.5 ms.
- Nothing is built while loading. `Actors.warmRemains` runs 2.5 s after the game starts and builds
  skeletons in idle callbacks, one or two at a time. It only builds species already drawn alive (a
  carcass always comes from one) and picks up new arrivals every few seconds.
- The bone shader is compiled in the background with `compileAsync`, against the game's own scene.
  Its program depends on whether the sun casts shadows, which automatic quality can switch off just
  after loading, so it is compiled again whenever that changes. Without that, the first carcass
  compiled a second program.
- Anything not ready when it's needed is built on the spot, as before.

Tree-dwellers (`move: 'tree'`, the orangutans) leave no body yet, and are eaten where they're
caught. Their models are posed for climbing (an orangutan stands upright), and this skeleton is
fitted to a level body on four legs.

## Following onto the carcass

A carcass has its animal's id. When a followed animal is killed, or dies where it stands, the
camera stays on its carcass until the carcass is gone (`Input.trackFollow`,
`Renderer.followCarcass`), and the inspector says Killed or Died rather than Gone. Watch mode keeps
the shot on the carcass too, captioned with who's eating it. Panning still lets go. Small prey
eaten on the spot and fish carried off leave no carcass, so following ends there as before.
`animal-locate-check` covers it.

## Review page

`http://localhost:8347/tools/skeleton-review.html` (with the server running) shows every species
that leaves a carcass, on any map. It can show the skeleton alone, the skeleton inside a faint
outline of the body, or a carcass at any age. It can frame the whole skeleton, the skull or the
pelvis, from four angles.

## Checks

`node tools/carcass-decay-check.mjs [--print]` checks:

- the stages only advance, eating strips the body, and every bone has gone by the end;
- old carcasses without the new fields still draw;
- for all 58 species that leave a carcass across the maps, the skeleton fits inside the body and has
  18 ribs, each rising to the spine;
- 15 antlered, horned or tusked species keep them on the skeleton, touching the skull, and the zebra
  has none;
- natural deaths leave a body only for big land animals, start whole, and never displace a kill;
- pool slots reset when a live animal reuses them.

Kills were also rendered in headless Chrome: Serengeti zebra at seven stages, and a buffalo bone pile.
`moments-browser-check` passes with live animals beside a kill.
