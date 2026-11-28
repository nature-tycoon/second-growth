# Cougar face and body pass (2026-11-27)

Cole's asks, in two lists, and what was built (pictures here: `cougar-<model>-<view>-before|after.jpg`,
taken with `node tools/animal-shots.mjs pnw:cougar <dir> <tag> --no-bench`).

Face
- Brows and tear marks kept, now laid on the head itself (`surfaceStrip` on `m.headGeo`): each brow a
  low ridge over the eye, longer than it, slanting down to its inner end (the serious look); the tear
  mark starts there and runs past the inner corner. Replaced the ellipsoid brows and tube streaks.
- Eyes: round pupils kept, deeper amber iris, a small highlight (a pale `gloss: 2` dot up-forward of the pupil).
- Head: fuller cheeks (`cheeks` 0.32), a gentler forehead-to-nose line (`bridge` 0.75).
- Muzzle: whisker pads shaped into the muzzle (`pads`); a short mouth line down from the nose and back
  under each pad (strips); the nose softly triangular, then bigger and pink at Cole's word.
- Ears: smaller (0.21 to 0.185 H), wider for their length (`earWidth` 1.08), warm inside (`earInner`).

Body
- `haunchBulk` (a defined haunch), `arch` (back rising gently over the loin), `tuck` 0.5, `shoulderBulk`.
- Legs: fore-leg tops narrow up into the chest (`shoulderTaper`), the thigh's top tapers and narrows
  into the rump (`thighTaper` 0.35, `thighZ` 0.75); slimmer ankles (`legR1` 0.085 H).
- Paws: compact, narrower and rounder (`pawW`, `pawH`), four toes (`toes: 4`); no cuff at the ankle.

Muzzle, third round (pictures `-muzzle`)
- Two subtle, distinct whisker pads grown out of the muzzle (`surfacePatch`: a round swelling cast onto
  the head, rim in the surface's own colour and facing), either side of a small cleft (`cleft` dips the
  midline between the loft's `pads`); the mouth line thinner and fainter.
- The muzzle narrows toward the nose (`muzzleTaper` 0.85) and runs more softly back into the cheeks
  (`muzzleBlend` 0.6).

Tried and dropped (don't retry)
- The loft's brow ridge moved forward over the eyes (`browAt` 0.6 to 0.8): buried the eyes.
- Whisker pads as separate ellipsoids: dots or white balls at every depth. Pads made only by swelling
  the loft (`pads` alone) sat on the muzzle's lower sides and never read as two from the front.
- Pads swelling the muzzle's very tip: opened a hole there (now faded to nothing at the tip).
- Flat paws (`pawH` 0.8): read as discs under each leg.

Triangles: close-up 48.7k to 45.8k, usual model 20.1k to 18.9k. Not yet judged by Cole as a whole.
The intro film still shows the old cougar; re-film it once Cole approves the look.
