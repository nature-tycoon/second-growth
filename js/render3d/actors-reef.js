// Drawing reef animals (part of Actors.update, actors.js): each at its own depth between the
// seabed and the surface, schools dropping into the coral from a hunter, over the coral heads, a
// longtom skipping away, and a wrasse eating a crown-of-thorns starfish.
import { LEVEL, clamp } from '../config.js';
import { coralFloor } from './flight-clearance.js';
import { climberSpot } from './flora.js';

// A fish that escapes by skipping across the surface (a longtom). While a hunter is rushing it, or
// it is still darting off after a miss, it makes runs of two or three low leaps clear of the water,
// swims a moment, and goes again. Drawing only: the hunt and the catch roll are the simulation's.
// The pose keeps the run's clock. Returns 0..1 through the current leap, or -1 in the water.
const SKIP = 0.6, SKIP_GAP = 0.05, SKIP_REST = 0.4; // (seconds: a long, low skip, a touch on the water, and a breather)
export function escapeSkip(st, chased, time) {
  if (st.skip) {
    const t = time - st.skip.t0, k = Math.floor(t / (SKIP + SKIP_GAP));
    if (k < st.skip.n) { const u = (t - k * (SKIP + SKIP_GAP)) / SKIP; return u <= 1 ? u : -1; }
    if (t < st.skip.n * (SKIP + SKIP_GAP) + SKIP_REST) return -1;
    st.skip = null;
  }
  if (chased) st.skip = { t0: time, n: 2 + ((st.skipRuns = (st.skipRuns || 0) + 1) % 2) };
  return -1;
}

// under the sea: fish, turtles and rays swim at their own depth between the seabed and the
// surface (clownfish right down in their anemone, sharks and mantas well up off the bottom),
// drifting gently up and down
export function reefHeight(A, c) {
  const { game, w, a, def, st, k, frameDt, time, seaY, ground, chased, hunters } = c;
  let y;
  // (each one wanders slowly up and down through its own band of water, so a school isn't a flat sheet)
  const room = Math.max(0.15, seaY - ground - 0.12);
  const sw = def.sprite.swim ?? 0.3, amp = Math.min(1, sw / 0.3); // (clownfish keep down in their anemone)
  const band = clamp(sw + amp * (0.12 * Math.sin(time * 0.11 + a.id * 1.7) + 0.06 * Math.sin(time * 0.29 + a.id * 4.1)), 0.04, 0.9);
  st.depth = st.depth == null ? band : st.depth + (band - st.depth) * k * 0.3;
  y = def.benthic ? ground + 0.008 : Math.min(seaY - 0.08, ground + 0.06 + room * st.depth + Math.sin(time * 0.9 + a.id * 2.3) * Math.min(0.04, room * 0.06));
  if (def.sprite.dive) {
    // (a hunter within three tiles: the school drops into the coral below at once, and drifts
    // back up slowly once it has gone; the coral lift below settles each fish right on top of its
    // own tile's coral, not down in the sand)
    let scared = chased.has(a.id) || a.state === 'flee';
    for (let h = 0; h < hunters.length && !scared; h++) scared = (hunters[h].x - a.x) ** 2 + (hunters[h].y - a.y) ** 2 < 9;
    st.dive = clamp((st.dive || 0) + (scared ? 3 : -0.4) * frameDt, 0, 1);
    if (st.dive > 0) y += (ground + 0.03 - y) * st.dive;
  }
  // (and over the coral heads, by body size: flight-clearance.js)
  // (looked up every fourth frame, each fish on its own frame; the lift eases between)
  if (!def.benthic && (st.coralFloor == null || (A.frameNo + a.id & 3) === 0)) st.coralFloor = coralFloor(w, game.catalog.plants, a, def);
  const lift = def.benthic ? 0 : Math.max(0, st.coralFloor - y);
  st.coralLift = st.coralLift == null ? lift : st.coralLift + (lift - st.coralLift) * Math.min(1, k * 1.5);
  if (st.coralLift > 0.001) y = Math.min(seaY - 0.08, y + st.coralLift);
  if (def.sprite.escape === 'skip') {
    const p = escapeSkip(st, game.speed > 0 && (chased.has(a.id) || a.dash > 1), time);
    st.skipP = p; // (scene.js splashes where it leaves the water and lands)
    if (p >= 0) { y = seaY - 0.04 + Math.sin(p * Math.PI) * 0.5; st.pitch = Math.cos(p * Math.PI) * 0.45; } else st.pitch = 0;
  }
  c.y = y;
}

// A humphead wrasse eating a crown-of-thorns starfish turns to it, tips nose-down and puts its
// mouth on it, rocking as it bites (the meal is on the starfish's tile; this finds the mouth a spot).
export function munchTarget(c) {
  const { game, w, a, def, st, k } = c;
  const munch = def.reef && a.state === 'forage' && a.forage?.food === 'starfish' && w.shrub[a.forage.i] ? a.forage.i : -1;
  st.munch = (st.munch || 0) + ((munch >= 0 ? 1 : 0) - (st.munch || 0)) * Math.min(1, k * 0.8);
  if (munch >= 0) st.munchAt = climberSpot(w, game.catalog, munch, (x, z) => w.heightAt(x, z) * LEVEL);
  c.munch = munch;
}

export function munchPose(c) {
  const { F, a, def, st, sc, time, returning } = c;
  let { ax, az, y } = c;
  if (st.munchAt && st.munch > 0.01 && !returning) {
    const [mx, my, mz] = st.munchAt, m = st.munch;
    const tilt = 0.55 + Math.sin(time * 2.6 + a.id) * 0.12, nose = F.noseReach(def) * sc;
    const reach = nose * Math.cos(tilt), cx = mx - Math.cos(st.yaw) * reach, cz = mz + Math.sin(st.yaw) * reach;
    ax += (cx - ax) * m; az += (cz - az) * m; y += (my + nose * Math.sin(tilt) + 0.01 - y) * m;
    st.pitch = -tilt * m;
  } else if (st.munchAt) { st.munchAt = null; st.munch = 0; st.pitch = 0; }
  c.ax = ax; c.az = az; c.y = y;
}
