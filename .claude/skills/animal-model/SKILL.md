---
name: animal-model
description: Reshape or add detail to an animal's 3D model so it looks as much like the real animal as the frame budget allows, step by step against real photos with Cole judging each step. Use when Cole says an animal looks off, fake or wrong, asks for a close-up detail pass on a species, or a new species needs a model. Not for colours of whole maps, lighting or animation timing.
---

# Animal model: fit it to the real animal, one step at a time

Built from the cougar (aesthetics batch s6, 2026-11-26; record `docs/ideas/2026-11-26-aesthetics/s6.md`).
Two attempts there failed before this process worked: one shaped by eye ("super fake and weird"), one
fitted to numbers off a head-low photo ("so much worse": drooping neck, tiny face). Read 0018's rules
first (`docs/decisions/0018-animal-close-up-shading.md`): normals carry baked shading, ears are `pinna`,
eyes sit on the head surface, no new shader program.

## The loop

1. **Find the photos first.** Two or three true side-on photos of the whole animal and two side-on head
   photos, plus one head-on face, from Wikimedia Commons (CC BY, CC BY-SA, CC0 or public domain; note
   author and licence). View them, never download them into the repo.
   - Pick a **neutral pose**: walking or standing, head carried normally. Not stalking, crouching,
     looking round at the camera, lying, or with the mouth open. A head-low photo is fine for the body
     only, and says so in its note.
   - Camera traps give clean side views; zoo portraits give faces.
2. **Put them in the overlay page.** `tools/animal-photo-overlay.html?species=map:key` (`PHOTOS` at the
   top). Whole-animal photos line up by the body (tail base, front of the chest, ground line), so a head
   carried higher or lower can't throw the scale. Head photos (`head: true`) line up by the nose tip and
   the near ear's front root on the close-up model. Click the marks on the photo and paste the printed
   line into `PHOTOS`. Use "Photo with model outline" to see where the outlines part.
3. **List what's off, biggest first,** against the photo, not against memory. Typical order: leg length
   and body depth, tail, head size and carriage, then the face (eye place, muzzle, jaw, ears), then
   markings, then colour.
4. **Change one thing.** The smallest change that fixes that one item. Then look at it yourself in the
   overlay and in `tools/animal-closeup-review.html` (side, three-quarter, head on; close-up and usual
   model). If it doesn't look right to you against the photo, don't show it yet.
5. **Show Cole and wait.** One short message: what changed, the URL, the question "does X look right?".
   No commit until he says yes to the whole.
6. **When Cole says it's worse, revert first,** to the last state he approved, then change only what he
   named. Don't defend it and don't pile a fix on top of a rejected step.
7. **When Cole says "less prominent", "thicker" or similar, ask yourself what he's looking at** and
   change that feature's size or place, not just its colour (cougar: "less prominent" eye streaks meant
   shorter and higher, not thinner and paler).
8. **Fold each approved fix into this checklist,** in the same commit: say it as a rule for every
   animal (what to look for, which `quadruped()` option fixes it), not as a cougar note. Cole's
   feedback is only kept if it lands here.
9. **After each fix, look at its neighbours.** Fixes move other parts: pulling up the head's underside
   left the chin sticking out; sinking the eyes crossed them and pulled the streaks off them.

Numbers help but never decide. A model can match ten measured ratios and still look wrong (the drooped
neck). Measure to find the biggest mismatch, then judge by eye against the photo, then Cole decides.

## Cole's taste (from the cougar; holds for every animal)

- **As realistic as possible, cheaply** (Cole, 2026-11-26). The goal is the real animal, limited only by
  the frame budget, not a stylized look. That's why the work stays on the procedural builders and the
  shared animal material (shape, then soft vertex-colour markings): it costs almost nothing per frame.
  Bought high-detail models were turned down; don't offer them as the way to realism.
- **Nothing stuck on.** Parts that read as separate objects look fake: ball noses, puffy ellipsoid pads,
  big white chin lobes, sausage brows, rods floating off the face. Every added part is sized small and
  sunk into the surface so only a gentle bulge shows. If a mark can be painted, paint it.
- **Smooth, muscular limbs.** Legs taper from a full thigh or shoulder to a slim ankle over a broad paw
  or hoof; no angular bends (more rings, `legSub`), no tube "trousers" with a rim on the flank. Hind
  thighs run back into the rump (`thighBack`, `stifle`). Not chunky, not thin.
- **Hind thighs end inside the rump** (deer): side on, one line runs from the tail down the back of the
  thigh to the hock. No round thigh top showing as a shelf, no rump bulging behind the thigh ("protruding
  butt"), no thigh sticking out past the rump's sides. The thigh tapers up into the rump.
- **Backs are straight** where the animal's is (deer, antelope): a level topline that rounds off only
  near the withers and rump, not an arch.
- **Ears pinch in at the root** where they meet the head (deer, and any big-eared animal), broadest in
  the middle; size them from photos and err small ("a little too large" on the first try).
- **Face colours close to the body's**: the head no darker than the coat, white marks soft (they read
  "too strong" at full white).
- **Antlers and horns root on the cranium**, between the eyes and the ears, never behind or over the
  ears. Moving the head or ears means moving the roots with them: `carcass-decay-check` fails when the
  roots leave the skull (the deer's did after s7's shorter skull).
- **Parts grow out of the body.** A tail leaves the rump below the topline, thick at the root, with no
  mound over it. A neck leaves the top of the chest; no long, drooping neck.
- **Head carried as the animal carries it,** small moves only. A big move of the head made the neck
  look absurd.
- **Eyes are the face.** Set them forward where the photos put them, sunk, under a brow ridge (as the
  lion's are), with the animal's eye shape (a cat's has a pointed inner corner), and painted: iris,
  pupil, rim on the eyeball (`eyeColor` may be a painter, see `catEye`). Never black beads.
- **Mouth and chin:** a strong but slim chin, a lip line where it meets the muzzle, the upper lip
  parted under the nose. Not a fat lower lip.
- **Check the head head-on, not only side on.** A cat's skull is broad across the top, widest about
  the eyes, with the ears at its corners; the shared head is widest low (a pear). Widen the upper half
  (`crown`), not with an extra ball (that shows as lumps).
- **No double chin, no fat neck.** The head's underside runs cleanly from the chin back to a lean
  throat (`skullUnder`, `jawDepth`, a slimmer `neckR`). The lower jaw still shows under the mouth: long
  enough to taper back into the jaw's line, neither a lump that sticks out nor tucked away to nothing.
- **Streaks and marks belong to their features:** a cat's tear streak starts at the brow's inner end
  and runs down past the eye's inner corner.
- **Markings soft and placed exactly:** fur, not paint. Short marks where the animal has them (eye
  streaks from the inner corner), pale and dark patches with soft edges (`catFace` in quadrupeds.js).
- **No thin painted lines or outlines.** A dark outline round the muzzle and creases on the brow read
  as "dirty and smeared"; keep markings to broad soft patches and short shaped marks.
- **Brows: thick and as long as the eye, shallow out of the face.** Cole thinks of the face as a plane:
  "less prominent" means less depth perpendicular to it, not shorter or thinner. Turn the part to lie
  along the face's slope and cut only that dimension. A brow sits over the top of the eyeball, a
  little in front of it, so the eye never clips through it (and leaves no gap).
- **Eyes look natural and relaxed, not bulgy or starey.** Set them into the head so little eyeball
  shows from the side (`eyeOut`). Pupils round and clearly formed: paint them on an eyeball turned to
  look along the gaze (`eyeColor` painter with `gaze`, so rings of `u.y` are the pupil and iris), never
  on the side of a sphere (they stretch into slits). Both eyes look the same way, ahead; head on, each
  pupil sits in the middle of its eye (turn the gaze out to match how the eyes are set, or they look
  crossed). The iris covers all of the eye that shows: a black band on the side reads as a second pupil.
  Pupils a little small rather than big.
- **Brows, tear marks and the mouth are laid on the head, not added to it** (Cole, cougar 2026-11-27:
  ellipsoid brows and tube streaks read as "separate rods or dangling pieces"). Use `surfaceStrip` on
  `m.headGeo`: a brow is a low ridge over the eyeball (`lift`), longer than the eye so its faded ends sit
  past it, slanting down to its inner end for an alert, serious look; the tear mark starts there; the
  mouth is a short line down from the nose between the pads, then back under each pad. A strip's ends
  fade by themselves; a square-cut end shows as a pale block.
- **Whisker pads are part of the muzzle**, never balls: sunk ellipsoids showed as dots or white balls
  at every depth tried, and swelling the loft (`pads`) only filled its lower sides. Grow each pad out of
  the muzzle with `surfacePatch` just under the nose, either side of a small `cleft`; narrow the muzzle
  toward the nose (`muzzleTaper`) and soften it into the cheeks (`muzzleBlend`). A cat's nose is small, softly triangular (broad top, narrowing to the
  cleft) and lies on the muzzle's slope; Cole wants the cougar's pink and a little bigger. A `bridge`
  above default gives a straighter forehead-to-nose line, but it raises the face round the eyes:
  check they still show.
- **Eyes read from a distance with a highlight**: a tiny pale `gloss: 2` dot up and forward of the pupil,
  tagged `eye`. A brow ridge moved forward in the loft (`browAt` near the eyes) buried them: keep the
  loft's brow back and shape the brow with a strip.
- **Ears a little smaller and rounder than first guessed** (`earWidth` above 1 for round ears), with a
  restrained warm inside (`earInner`), not the default grey-pink.
- **Words of size and place are about one dimension.** When Cole says "less prominent", "thicker",
  "narrow", ask which axis he means if it isn't plain, rather than changing the obvious one twice.

## Herd animals (from the black-tailed deer, s7)

- **Find who shares the builder first** (`sprite.kind`): the deer builder draws five species. Put the
  fitted shape behind one sprite field (`slender`) so the rest draw as before until they're fitted.
- **Count triangles in node, per change** (`buildSpecies(def)` and `{ close: true }`), before looking:
  more leg rings and split hooves added 5k to a 10k close-up in one step. Aim at about +10% on the
  close-up and +5% on the usual model for an animal seen in dozens.
- A painted eye costs about 300 triangles (finer sphere): on a herd animal paint it on the close-up
  only (`eyeFar` gives the usual model a plain colour). Face markings: `headSeg` adds head rings only.
- Mark a face by the surface's facing, not its height: `top = u.y / hypot(u.y, u.z)` in a head painter is
  1 on top of the head and 0 at the side. Height bands ran along the side of the face as stripes.
- Cole's first look (deer): ears "a little too large", head "too dark", white marks "too strong". Start
  pointed ears at about 0.3 of body depth, face markings soft (white at most 0.6), the face only a
  little greyer than the body.
- Cole's second look (deer): ears should "pinch in near the head" (ear shape `deer`: narrow root, broad
  middle) and the back "a little straighter, too rounded" (`flatBack` on the body loft: level topline,
  ends round off late).
- Cole's third look (deer): hind thighs "stick off", then a "protruding butt": the back of the thigh must
  meet the back of the rump near the tail. Raise the thigh's top toward the tail (`thighUp` ~0.2) and
  reach it back (`thighBack`), narrow side to side (`thighZ`); pulling it forward leaves the rump
  bulging over the thigh as a ledge. Too high (0.3) cuts a hard V on the flank. Then "taper into the
  rump at the top instead of forming a shelf": the thigh's round top end is the shelf; narrow it toward
  the top (`thighTaper` ~0.75) and reach it back to fill the notch under the rump (`thighBack` ~0.22 H).
- `col()` in model-core returns a **shared cached** colour: `col(s.color).lerp(...)` repaints every part
  using that colour (it greyed the deer's whole coat). Always `.clone()` before `lerp` or `multiply`.
- In the review page's sun, antlers and horns cast dark streaks on the face: compare with the before
  picture before chasing them as paint.
- **Relatives of a fitted animal start from its fitted build** (flight-cats s6: white-tailed deer, elk,
  sambar from the black-tailed deer): turn the build on (`slender`), then add per-species sprite fields
  that default to the fitted animal's values, so it stays byte-identical (hash its geometry before and
  after; `docs/ideas/2026-11-27-flight-cats/s6.md`). Deer fields: `earSize`, `earWide`, `earShape`,
  `tailLen`, `tailW`, `tailFringe`, `tailTop`, `depth` (shallower body, belly kept: the thigh top and tail
  follow it down, or they poke out of the rump as knobs), `headSize`, `snoutLen`, `muzzleDepth`, `legs`,
  `rump` (painted patch), `neck` (dark head and neck, its cape fading onto the shoulders), `face` strengths.
- **Cats start from the fitted cougar** (flight-cats s7): every `feline` but the lion takes the cougar's
  build (face strips and pads, painted eye `catEye`, face fur `catFace`, legs, paws, tail form); a species
  changes it through sprite fields that default to the cougar's values (`legs`, `legR0`, `legR1`, `chest`,
  `haunch`, `tuck`, `neckR`, `headSize`, `snout`, `eyeSize`, `iris`, `irisIn`, `noseTone`, `ear`, `ears`,
  `earW`, `earWidth`, `earInner`, `earSpot`, `tufts`, `cheeks`, `facePale`, `lip`, `browTone`, `tearTone`,
  `tailLen`, `tailR`, `tailDrop`, `tailTip`) and its own soft face marks (`catMarks`, chosen by coat).
  Hash the cougar's geometry before and after: it must stay byte-identical.
- **Unfitted cats stood too tall for their length** (flight-cats s8: jaguar and leopard a quarter to a third
  too tall against side-on photos, so they read as stubby). Fix it with `h` and `leg` (drawing only), never
  `len`: the simulation reads `len` (carcass meals, path look-ahead, grazing). Lowering `h` shrinks the
  head and the eyes with it: raise `headSize`, then check the eyes apart, since `eyeSize` does not follow
  `headSize` (the jaguar's went from buried to staring and back: 1.35 too big, 1.1 too small, 1.2).
  More s8 fields: `headX`, `headY` (head place: a jaguar's lower and closer in), `headTall` (a long low
  skull), `rosette` (rosette size, jaguar and leopard), `legSpot`, `headSpot`, `tailSpot` (spot sizes; a
  leopard's legs and tail spotted), `cheekPale`, `cheekSize` (a tiger's white cheeks), `stripes` (the tiger
  on the cat build: `tigerGround`, the old stripe shaders).
- **The overlay's ground is the model's lowest point, tail included.** A tail hanging below the paws sets
  the ground line and shifts the whole photo (the tiger's `tailDrop` 1.3 did): keep the tip above the paws.
- **Read photo marks off the photo's own pixels.** A thumbnail shown in a viewer may be scaled (a
  900-pixel thumbnail displayed 960 wide put every mark 7% off): divide by the size you actually measured on.
- **Head size is a photo question, not a memory one**: the elk's ears looked right "small" from field-guide
  numbers and came out half the size of a cow's in profile. Size ears and heads in the overlay's head mode.
- Cole's first look at the deer batch (2026-11-27, approved after): the mouse-deer's neck "too long"
  (head moved back to sit close in front of the shoulders, snout lengthened to keep the face's length),
  the elk's nose "too wide/thick" (`muzzleWidth` and `muzzleDepth`). A head carried far forward to match a
  photo reads as a long neck in 3D: keep the neck short and put the length in the face.
- **Chevrotains and other small hunched animals**: measure leg length as ground to belly against body
  depth (the mouse-deer's legs are about 0.55 of it), and set the hind legs back under the rump (`hindX`).

## Toolbox

- Shape options in `quadruped()` (`js/render3d/animals/model-core.js`), each defaulting to the old
  look so one species can use it without changing the rest: `legRoot`, `thighBack`, `stifle`, `paw`,
  `legSub`, `eyeFwd`, `eyeOut`, `eyeColor`, `noseColor`, `muzzleDepth`, `jawDepth`, `brow`, `earTurn`,
  `earUp`, `earSide`, `earFwd`, `earTurn` (pointed ears too), `earWidth`, `browAt`, `bridge`, `pads`, `surfaceStrip` (marks and ridges on the head), `noseSize`, `headSeg`, `eyeFar`, `flatBack`, `thighZ`, `thighUp`, `thighTaper`, `hindX`, ear shape `deer`, `neckPath`/`neckRadii`, plus the older `hip`, `shoulder`, `chest`, `haunch`,
  `tuck`, `sag`, `wide`. Add a new option there rather than a per-species branch, defaulted off.
- A species-specific look goes behind a trait or a sprite field (the cougar: the plain coat), never a
  species name (`node tools/species-name-count.mjs`).
- Markings: vertex colours through `headPaint`/`muzzle` painters `(u, p)` using model positions; set
  `detail: true` so the head has enough vertices for soft edges. Never a new `pixelCoat` kind for one
  animal (a coat adds its kind to the program key: a new shader program).
- Face points for review tools: `motion.faceMarks` (nose, eye, ear root and tip, brow).
- Before/after pictures and shading cost (nine views, one from behind for tails and rumps): `nice -n 15 node tools/animal-shots.mjs <map:key> <dir> <tag>
  [compare species]`. Take "before" pictures before the first change (or from a detached worktree of
  the base commit with `CLOSEUP_ROOT`).

## Budget (realism has to fit in it)

- No new shader program: no new `pixelCoat` kind or material for one species (`first-frame-profile`).
- Triangles by how many are on screen at once: a rare animal (one or two on a map: cougar, bear) may
  carry about 20k in its usual model and 50k in the close-up (cougar: 19.1k / 46.4k); a herd or flock
  animal stays near its current count, since dozens draw at once. `perf-guard-check` must stay within
  10% (or the rise is checked against the budget and the baseline refreshed with the change).
- Detail goes where the camera sees it up close: the close-up model (drawn above `CLOSE_PIXELS`) and the
  face first; `detail: true` only where markings need the vertices.
- Shading cost: `tools/animal-shots.mjs` bench beside a similar species, same within noise.
- No extra animated parts (processor cost per animal per frame).

## Checks before the commit

`node tools/animal-eyes-check.mjs`, `node tools/motion-sweep-check.mjs <map>` (foot slide and sinking
after leg or paw changes), `node tools/animal-culling-check.mjs`, `node tools/perf-guard-check.mjs`,
`node tools/first-frame-profile.mjs` (no new shader programs), `node tools/species-name-count.mjs`,
then the headless suite through the `checker` subagent. Read `.claude/skills/testing/SKILL.md` first;
close extra tabs, leave one preview for Cole.

## Done when

Cole says the animal looks right. Then: pictures (before/after, the eight views) in the batch's folder,
a short record of what changed and why (and what Cole rejected, so it isn't tried again), one commit
with your hunks only, and any new `quadruped()` option noted in 0018's rules.
