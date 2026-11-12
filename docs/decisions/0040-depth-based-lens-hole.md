# 0040 A depth-based tracking lens

Decided 2026-11-11 (idea batch wildlife-polish, session 3). Drawing only: the simulation is unchanged.

## Context

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

## Decision

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
- **Nearer the camera, wider.** `near` is how far a fragment sits in front of the body, as a share
  of the way to the eye at eye level (`uFocusInvD`) or of four window radii from above. The gap
  opens from `near` 0.25 and reaches the full window radius at 0.8 (0.05 to 0.7 while the animal
  was still cut out; nearer, it read as a circle round an animal in a crown).
- **Measured on screen.** At eye level the gap's width is taken at the animal's depth (the
  `focusSide` projection), so leaves right at the lens open about as wide on screen as leaves
  halfway there, instead of a cylinder that fills the near view. From above (orthographic) this
  is the same as before.
- **A soft rim.** Over the outer third of the gap the leaves thin out, by leaf-sized specks fixed in
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

## Cost

Look-through: two draws of one animal a frame, only while an animal is selected, and a depth clear.

A handful of extra ALU operations and one more value-noise call (8 hashes), only for
fragments in the soft rim, and only while an animal is selected (`uFocusAmt > 0`). No new uniforms, passes or textures. Within the drawing budget of the
2026-10-23 review.

## Check

`node tools/lens-depth-browser-check.mjs`: a deer and a brush rabbit in wildrye under big-leaf
maples from four sides (from above), and each behind a huckleberry at eye level, through the real `EyeCamera`: from four
sides, swung 0.5 rad off the line (the bush half in the way) and lifted to look down over it. Asserts at least 95% of
the animal shows; prints how much of the view the lens opened; saves
`tools/release-output/lens-depth-*.png`, and `-cut.png` beside each: what the lens took from the
floor plants in red (trees hidden), to judge the cut's shape round the animal. The older checks still apply:
`tools/follow-support-browser-check.mjs` (the support stays: palm 86 to 92% kept with the ellipsoid, old code 82 to
89%) and `tools/canopy-reveal-browser-check.mjs` (leaves over a langur open: 80 of 80 pass).
`tools/canopy-support-check.mjs` matches the shader's discard line as text.

## Related unmerged work

`claude/wave3-s5-tracker-lens-aaed29` (2026-11-09) reworked the same shader differently (an
ellipsoid body cut, a gap starting from the outline) and is not on main. Cole then turned down a
screen-space dithered edge; the rim here thins by world-fixed leaf clumps instead. Merging both
conflicts in `focus.js`: pick one (see `docs/ideas/2026-11-11-wildlife-polish/s3.md`).

## Tried after: see-through trees by leaf clumps (2026-11-11, not kept)

The see-through trees mode (`Flora.setFade`) blends leaves at 28% opacity, which draws crowns out of
order where they overlap. Leaving out whole leaf clumps instead (the lens rim's noise, opaque, no
sorting) was tried and dropped: a leaf mass is a closed shell drawn one side only, so cutting parts
of it shows its hollow inside as crescents and rings, and crowns read as eaten. Doing it well needs
whole leaf masses dropped at a time, which the merged plant models don't record.
