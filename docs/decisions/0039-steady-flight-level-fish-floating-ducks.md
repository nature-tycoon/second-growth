# 0039 Steady flight, level reef fish, ducks on the creek, an eased follow camera

## Rules

- Drawing only: the simulation is unchanged.
- A bird in level flight holds a cruise height (`holdCruise` in `render3d/flight-clearance.js`): it climbs when the way ahead needs it and glides down only after `HOLD` (1.5 s), at `GLIDE`. It climbs out of a crown it finds itself in by its climb rate (`CLIMB_ACCEL`), never a jump in height. The look-ahead is about 1.5 s of flight, 1.4 to 6 tiles.
- Reef fish swim over a smoothed seabed (`smoothSeabed`), and their lift over coral and rock eases like a body (`easeCoralLift`). Both reset when the animal comes back into view (`returning`).
- Floaters float at the drawn water (`Actors.floatLevel`), not `waterSurfaceY`; where the drawn water is too shallow they stand on the bank. No shadow afloat.
- The follow camera's height rides a spring within 0.25 tiles of the animal (`followHeight`).
- Check: `node tools/motion-smoothness-check.mjs`.

## History

Decided 2026-11-11 (idea batch wildlife-polish, session 2). Drawing only: the simulation is unchanged.

### Context

Cole: bird flight "bobs jerkily up and down"; a mallard sat submerged near a creek edge; reef fish
"rise and fall over coral" and the follow camera is bumpy.

- **Birds.** The drawn height of a flier was its flight height over the ground under it, or over the
  crowns about a second ahead (`clearCanopy`), worked out afresh every frame and eased toward
  (`easeBirdHeight`). Over a forest it climbed over each crown and sank between them; over rolling
  ground it followed each rise. A bird that found itself inside a crown was lifted out at 8 tiles a
  second (0.4 tiles in one frame), and a climb stopped dead at the top (climb rate 3 to 0 in one
  frame). The wing beat doesn't move the body (`uBob` is off in flight), so the bob was all height.
- **Reef fish.** A fish's height was a fraction of the water between the seabed right under it and
  the surface, so it rose and fell with every rock and hollow. Its lift over coral eased at a fixed
  rate, so a coral head coming into a big fish's 0.7-tile look-ahead lifted a grouper or a dugong
  0.3 tiles in one frame.
- **Ducks.** Floaters floated at `waterSurfaceY`, the tile's lowest corner plus its fill. The drawn
  creek sheet (`terrain.waterAt`) takes the highest level of the tiles round a corner, so on a creek
  stepping down from pool to pool it stands above that, and over the bank's edge there's drawn water
  where the tile isn't water at all. In a PNW soak 486 of 7064 afloat duck samples were under the
  drawn surface, by up to 0.09 tiles.
- **Camera.** Following an animal in the usual view centred on its drawn height exactly, every frame.

### Decision

- **A held cruise height** (`holdCruise` in `render3d/flight-clearance.js`). In level flight a bird
  climbs as soon as the way ahead needs it, but comes down only after the way has been lower for
  1.5 s (`HOLD`), and then as a shallow glide, 0.35 tiles a second (`GLIDE`). It looks about 1.5 s
  of its flight ahead (1.4 to 6 tiles) so it starts climbs early. Off level flight (take-off,
  landing, a stoop) it's the plain target as before.
- `easeBirdHeight` brakes in time: its climb rate is never more than it can stop from by the
  target, so a climb rounds off into level flight. A bird inside a crown climbs out by its climb
  rate (up to 4 tiles a second), not by a jump in height.
- **Reef fish over a smoothed seabed** (`smoothSeabed`): the height averaged over a ring 1.2 tiles
  round it, eased. The seabed right under it is a floor too, with the coral (`coralFloor`). The
  lift over both eases like a body (`easeCoralLift`): up at most 2 tiles a second, down a quarter of
  that, its rate building and fading. Big fish look 1.4 tiles ahead for coral, not 0.7.
- **Ducks and every other floater** (`FLOATERS` in `render3d/actors.js`) float at the drawn
  surface where there is one (`Actors.floatLevel`), and on drawn water off a water tile wherever
  it's deep enough to float; where it isn't, they stand on the bank. No ground shadow afloat.
- **The follow camera's height eases** (`followHeight` in `render3d/animal-camera.js`): a critically
  damped spring, never more than 0.25 tiles (`FOLLOW_LAG`) from the animal. Across and along the
  ground it still follows exactly, so a fast animal doesn't slide off-centre. A new animal, one
  that moved a tile or more since the last frame, or one whose own height jumped more than half a
  tile in a frame (the tree it was in is gone) is centred outright. The eye-level camera already
  eased its position; it gets the smoother animal heights for free.

### Measured (`tools/motion-smoothness-check.mjs`, frames 0.05 s apart)

| | before | after |
|---|---|---|
| PNW birds, level flight: jolt 99% (tiles a frame) | 0.213 | 0.0225 |
| PNW birds: quick up-and-downs a minute | 7.3 | 0.4 |
| Atlanta birds: jolt 99% / quick bobs a minute | 0.098 / 10.5 | 0.0225 / 0.7 |
| Reef fish swimming: jolt 99% / quick bobs a minute | 0.036 / 3.1 | 0.010 / 2.0 |
| Reef fish: biggest one-frame lift over coral | 0.3 | 0.02 |
| Camera following reef fish: jolt 99% | (= the fish) | 0.0035, at most 0.21 tiles behind |
| PNW ducks afloat under the drawn surface | 486 of 7064 | 0 |

0.0225 is `CLIMB_ACCEL` times a frame squared: the eased climb's own acceleration, the most any
smooth climb can show. `follow-height-probe` (robin): worst frame 0.59 → 0.22 tiles, jolt 0.077 →
0.023. `Actors.update` cost unchanged in node (0.05 ms reef, 0.08 ms PNW per frame).

### Consequences and gotchas

- `flight-canopy-check`: the take-off grace is now 1 s (was 0.6 s). Out of a tall crown, a climb
  with no jump in it takes about a second; after that, fliers are inside a crown less often than
  before (0–0.3% of samples against 0.1–0.3%). Its jolt limit is now 0.05 (was 0.4).
- `animal-locate-check` now asks for exact centring across the ground and the camera's height
  within `FOLLOW_LAG` of the body (it asked for the body pinned exactly every frame, the opposite of
  an eased camera), and checks a running salmon's leap on the fish, not the camera.
- A bird in level flight can be up to 1.5 s plus a glide higher than its plain flight height: over
  a clearing just past a forest it stays up at crown height for a moment. That's the point.
- Any new floater kind goes in `FLOATERS`; it floats by `floatLevel`, not `waterSurfaceY`.
- Checks: `tools/motion-smoothness-check.mjs` (birds, reef fish, ducks, camera), `flight-canopy-check`,
  `reef-coral-clearance-check`, `bird-landing-check`.
