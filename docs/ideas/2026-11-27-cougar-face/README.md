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
- Two whisker pads grown out of the muzzle, large enough that together they make its front (Cole: "too small, they should form the muzzle like a real cougar") (`surfacePatch`: a round swelling cast onto
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

Triangles: close-up 48.7k to 45.8k, usual model 20.1k to 18.9k. Cole approved the whole look on 2026-11-27 ("Looks right").
The intro film still shows the old cougar; re-film it once Cole approves the look.

Fourth round (pictures `-eyes`): the pads flatter (lift 0.75 to 0.38 of the eye size), the eyes a little
bigger (`eyeR` 0.0525 H, was 0.045) and set a little further out (`eyeOut` 0.37 to 0.40) so the pupils
clear the face; 0.43 cleared them too but bulged from the side. Brows, tear marks and the highlight
follow the eye's radius.

Stalk (pictures `cougar-stalk-*`): Cole saw the legs "weird and bent" in stalk mode. The crouch fold
(`foldLeg` in `animal-material.js`, shared by every crouching walker) bent each leg at a hard band halfway
down, tipped the paws up and swung the thigh's top out of the rump. Now the paw turns back level about
the ankle (lifted by what that would sink it), the knee bends over a broad band, and the leg's top
inside the body stays put. The review page has a "Stalking (crouched)" pose (`?pose=stalk`).
Then "too bent in, almost touching": the upper leg now turns less than the shin (t = 0.55 of the old
angle, s solved so the paw stays on the ground), so elbows and knees stay apart and the paws plant wider,
fore ones forward and hind back. Motion sweep, all maps: within limits.

Brows: a flatter version (inner ends raised, less slant toward the nose) was shown and Cole kept the
current slant ("Keep current"). Don't flatten them unasked.

Round head (pictures `round-head-*`): later the same day Cole set the fitted face aside and asked for the
week-old head back (the shared cat head before 370f080: bigger and rounder, a smooth forehead into the
muzzle, eyes on the sides, a friendly look), with the broad pink nose, and then plain black eyes and no
marks under the eyes. Built behind `fit = false` in `feline` (quadrupeds.js): true brings the fitted face
(brows, painted eyes, pads, mouth line, face fur) back. The body, ears, thicker old neck and pink nose
(broader, `nb`) stay. Intro film re-filmed.

Stalking with the round head: the thicker neck's root showed through the back as the head dipped (Cole).
Its root now sits lower and further forward in the chest (`neckLow` 0.5) and the neck is a little
slimmer (0.27 H).
Then "a hunch back": the round head hung below the shoulders. It's carried higher (by + 0.26 H, was 0.14;
the week-old one was 0.38), level with the back; flattening the back's arch made no visible difference.
Then the haunches showing and an arched back (Cole): `haunchBulk` 0.2 to 0.3, `arch` 0.06 to 0.13.
Then the neck "doesn't go all the way around" and "the torso should cover the chest" (Cole): the neck root
stays low but no longer moves forward (its underside stopped short), and the body reaches further forward
(`front` 0.53 of the length, was 0.45) with a fuller lower chest (`keel` 0.3), so the body makes the chest.
