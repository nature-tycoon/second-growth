# 0040 A depth-based tracking lens

## Rules

- Nothing is cut close round the followed animal. It is drawn again faintly, a little nearer the camera, so it shows through cover within about its own size (`render3d/look-through.js`), and trees farther in front stay in front.
- At eye level "about its own size" becomes most of the way back to the eye (75% of it, at most 2.5 tiles, `uLookD` in `Renderer.updateFocus`); only cover nearer the lens opens. A gap through a bush just in front of the followed animal showed it, and any animal beside it, whole, as if in front of the leaves. The branch a climber is on still shows only within about its size (`uLookNear`).
- The second draw must stay faint (`LOOK_ALPHA`): switching a material to transparent for that pass needs `needsUpdate`, or three keeps its opaque shader, which sets alpha to 1, and the animal is drawn whole over its cover (it was, in the game, until 2026-11-14).
- Cover beyond that opens over the animal's outline, a little wider the nearer the camera, with a soft rim of world-fixed leaf clumps (`render3d/focus.js`, sizes set in `Renderer` in `scene.js`). Trunks are never cut.
- Trunks are never seen through either: the look-through pass skips what lies behind the trunks within 3 tiles in front of the animal (`lookTrunks` in `scene.js`), the border forest's too (read from `flora.treeSites` by `canopyTile`). Without the border's, an animal followed beyond the fence showed through every trunk like glass (Cole, intro film, 2026-11-26).
- Any cut round the animal showed as its shape: don't bring one back. Wave 3's ellipsoid cut (`claude/wave3-s5-tracker-lens-aaed29`) was dropped for this lens when wave 3 was merged.
- Water is not cover. It writes no depth, so the look-through pass skips what lies under the creek, river or pond surface at the animal while the eye is above it, in every view (`focus.uLookWater`, set in `Renderer.updateFocus` from `terrain.waterAt`); watch mode's follow shot from above showed it too. Not the reef's sea, where the lens shows fish through coral. Without it every swimmer looked to swim on top of the water in watch mode (2026-11-14).
- What it holds is part of it: a held or eaten catch (`drawCatch` in `actors-common.js`, any animal with `a.prey` in `carry` or `feed`) is added as tracked while its holder is followed or selected, so it shows through cover with it, and `pose.meal` widens the opening (`Renderer.updateFocus`). A hawk eating a fish in a crown looked to eat nothing (Cole, 2026-11-22). Only while tracked: two more draws then, none otherwise.
- `tools/canopy-support-check.mjs` matches the shader's discard lines as text (the leaves' and the water's): update it with the shader.
- Check: `node tools/lens-depth-browser-check.mjs`; also `canopy-reveal-browser-check`.

## History

Decided 2026-11-11 (idea batch wildlife-polish, session 3). Drawing only: the simulation is unchanged.

### Context

Cole likes how the tracking lens (`render3d/focus.js`) pierces the canopy to show a followed
animal, but the ellipse cut round the animal "looks fake". His chosen fix: depth-based. Foliage
right round the animal is cut only to the animal's own outline; foliage much nearer the camera gets
a wider, soft-edged hole, sized by how much nearer it is. At eye level, a bush in front of a small
animal counts like canopy and is cut the same way.

Before: near the animal only what covered its model box opened (0030), but from just in front of
the body a round window opened too, reaching its full radius (0.85 to 1.45 tiles from above) two
radii toward the camera, with a crisp ragged edge. From above that cleared a disc of crowns, trunks
and shrubs far wider than the animal (in `tools/lens-depth-browser-check.mjs` 25 to 60% of the
view; the trunk in front of the deer was sliced off at the knee).

### Decision

One rule in `withFocusFade`, every material that uses it (foliage, shrubs, grass, bark, small
plants, buildings):

- **Close round the animal, nothing is cut: it shows through** (2026-11-11, `render3d/look-through.js`).
  After the scene, the tracked animal is drawn again over everything at 42%: the depth buffer is
  cleared, its own depth laid down (so it hides its own far side), then its colour blended in where
  it is nearest. Its hidden parts show faintly through the leaves, grass or trunk in front, its
  visible parts look as they were. `Fauna.add` records where the tracked animal went
  (`fauna.tracked`); the pass copies that one instance into a one-instance mesh on layer 7 sharing
  the species' geometry and material. History: the model's box cut first (0030), then its box with
  ragged faces, then an ellipsoid fitted to it (ported from wave3-s5, e0ac9e2), then a jagged circle
  on screen: Cole saw each as its shape (a rectangle, an oval) round the animal, worst for an animal
  in a tree or bush. Any cut close round the animal draws its own outline through the leaves, so
  none is made. The tree an animal is in now stays whole (the palm under a langur 100% kept, was 82
  to 92% with the cuts).
- **Only close cover is seen through; trees in front stay in front** (2026-11-11, Cole: the animal
  seemed to walk in front of foreground trees). The look-through pass draws the animal a set
  distance nearer the camera along each line of sight (`withLookShift`: same place on screen, its
  light and shade from where it really is) and tests it against the scene's depth: cover within
  `uLookD` of its front (its own size times 1.2 plus 0.15, from `Renderer.updateFocus`; its far
  parts reach as far again as it is deep) shows it, anything farther in front hides it. The gap
  opens exactly what lies farther than that (`past` in focus.js), and its core is the animal's
  outline across the screen (`uFocusBodyR`), so foliage farther in front never hides it.
- **A climber is seen on its branch** (2026-11-11, Cole: an orangutan looked to float in the
  leaves). The occupied tree's wood (`canopyBark`, `withLookShift({ near: true })`) is drawn in the
  same pass, only within `uLookD` of the animal and fading out from 40% of it (`Flora.lookNear`).
- **The animal passes behind trunks** (2026-11-11, Cole: it still seemed to pass in front of a
  tree). Up to 8 trunks within 3 tiles in front of it (`treeTrunk`, nearest first, up to where the
  crown begins: `trunkH` or a conifer's `base`) go to the look-through pass (`focus.uLookTrunks`);
  what of the animal has one of them on its line to the camera isn't drawn there.
- **The gap stays on the animal.** It used to ease toward it (a tenth of a second behind), so it
  trailed a walking animal: a mushroom it had passed went on being opened. Only its size eases now.
- **No shading on what stays.** The gap's dark walls were drawn on the trunks it no longer cuts,
  a dark patch that followed small animals walking behind a tree.
- **Trunks are never opened** (near their axis): a trunk in front of the animal stays in front of
  it, and a cut across one showed as a straight line. Limbs up in the crown still go with the leaves.
- **Nearer the camera, a little wider.** Past the core the gap widens with `near`, how far a
  fragment sits in front of the body as a share of the way to the eye at eye level, or of four
  window radii from above, full at 0.7. The extra width is small and scales with the animal (Cole:
  it was too wide): from above 0.06 to 0.3 tiles (`0.05 + h * 0.35`), on a branch to 0.25, at eye
  level half the eye's size up to 0.25. It was 0.85 to 1.45 tiles for every animal.
- **Measured on screen.** At eye level the gap's width is taken at the animal's depth (the
  `focusSide` projection), so leaves right at the lens open about as wide on screen as leaves
  halfway there, instead of a cylinder that fills the near view. From above (orthographic) this
  is the same as before.
- **A soft rim.** Over a band just past the open core (30% of its width) the leaves thin out, by leaf-sized specks fixed in
  the world (`focusNoise` at 22 per tile). Still a discard, so nothing to depth-sort, and the specks
  hold still as the view moves. A screen-space dither was tried first; at a pixel ratio of 1 it
  read as a grainy stipple.
- **Bushes at eye level.** They already open like canopy wherever they stand in front of the animal:
  the floor-plant `keep` rule spares a plant only when all of it shows below the animal's feet or
  off to its side. Nothing extra was needed; the check's rabbit behind a huckleberry shows whole
  from four sides.
- **Trunks below the animal stay.** The stretch of a trunk that shows below the animal's feet on
  screen can't cover it, so it stays (bark only, near the trunk's axis; its limbs still go with
  the leaves, or they'd read as a dead tree). Before, a trunk in front of a deer was cut off midway.

The gap's shaded walls now follow the new gap and only where it has opened (`near` past 0.05), so
leaves beside the animal aren't darkened either.

### Cost

Look-through: two draws of one animal a frame, only while an animal is selected, and a depth clear.

A handful of extra ALU operations and one more value-noise call (8 hashes), only for
fragments in the soft rim, and only while an animal is selected (`uFocusAmt > 0`). No new uniforms, passes or textures. Within the drawing budget of the
2026-10-23 review.

### Check

`node tools/lens-depth-browser-check.mjs`: a deer and a brush rabbit in wildrye under big-leaf
maples from four sides (from above), and each behind a huckleberry at eye level, through the real `EyeCamera`: from four
sides, swung 0.5 rad off the line (the bush half in the way) and lifted to look down over it. Asserts that no layer of cover (leaves, bushes, grass) hides more than 5% of
the animal (taking it away shows no more of it); a trunk may; prints how much of the view the lens opened; saves
`tools/release-output/lens-depth-*.png`, and `-cut.png` beside each: what the lens took from the
floor plants in red (trees hidden), to judge the cut's shape round the animal. The older checks still apply:
`tools/follow-support-browser-check.mjs` (the support stays: palm 86 to 92% kept with the ellipsoid, old code 82 to
89%) and `tools/canopy-reveal-browser-check.mjs` (leaves over a langur open: 80 of 80 pass).
`tools/canopy-support-check.mjs` matches the shader's discard line as text.

### Related work, since merged

`claude/wave3-s5-tracker-lens-aaed29` (2026-11-09) reworked the same shader differently (an
ellipsoid body cut, a gap starting from the outline). Cole chose this lens; when wave 3 was merged
(2026-11-11) its `focus.js` and `scene.js` lens changes and `tracker-lens-browser-check` were left out.

### Tried after: see-through trees by leaf clumps (2026-11-11, not kept)

The see-through trees mode (`Flora.setFade`) blends leaves at 28% opacity, which draws crowns out of
order where they overlap. Leaving out whole leaf clumps instead (the lens rim's noise, opaque, no
sorting) was tried and dropped: a leaf mass is a closed shell drawn one side only, so cutting parts
of it shows its hollow inside as crescents and rings, and crowns read as eaten. Doing it well needs
whole leaf masses dropped at a time, which the merged plant models don't record.

### 2026-11-14: water

Cole: the river dolphin swam above the water and the beaver walked on it, in watch mode only. The
heights were right (the dolphin's back and head clear the surface, the beaver floats with its back
out); the eye camera follows its animal, so the lens was on, and its second draw of the animal at 42%
showed the whole body through the water, which writes no depth. The look-through pass now discards
what is under the drawn water at the animal (`uLookWater`), so the water draws over it as usual.
Watched in the game on the Amazon river and a Hollis pond.

### 2026-11-14: eye-level occlusion

Cole: animals still sometimes showed in front of foliage when they walked past it, at eye level.
Two causes, both the lens. The eye rides about 1.3 tiles behind a rabbit, so a bush 0.4 in front of it
was past the see-through depth (its size) and the lens cut a gap through it over the rabbit's
outline: the followed rabbit, and a second one beside it, showed at full strength through the leaves
(80% and 61% of their hidden parts, measured against the same view with the lens off). And the
faint second draw wasn't faint in the game: `transparent` was flipped without `needsUpdate`, so the
opaque shader (`#define OPAQUE`, alpha 1) drew the animal whole over everything within its size.
At eye level cover is now seen through over 75% of the way back to the eye (60% still opened a leaf reaching toward the lens beside it), and the pass switches
shaders: the followed rabbit shows at 35-42% through the bush, the other rabbit stays hidden.
Before/after stills (with a no-lens view) were taken in the game in
`tools/release-output/eye-occlusion/` (not kept in the repo).
