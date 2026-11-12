// Drawing birds (part of Actors.update, actors.js): over the sea and into it, perched in a crown,
// on a snag's top or clinging to a trunk, over the treetops with an eased height, a seabird's
// plunge, the swoop on and off bark, and the tracked bird on a real limb (bird-perch.js).
import * as THREE from 'three';
import { visibleLevel } from '../sim/waterline.js';
import { LEVEL, isWater, clamp } from '../config.js';
import { trait } from '../data/animal-kinds.js';
import { clearCanopy, easeBirdHeight, holdCruise, CLIMB_ACCEL } from './flight-clearance.js';
import { seaPlunge } from './eating-pose.js';
import { treeHeight, treeLevel } from './tree-stature.js';
import { treeTrunk, snagSpot, snagTop as snagTopAt } from '../sim/ground-obstacles.js';
import { perchPoint } from './bird-perch.js';
import { crownTile } from './actors-common.js';

const CLEAR = { floor: -Infinity, clearing: false }; // (clearCanopy's crown under a flier, reused each frame)
// a snag on a bank tile stands on the dry side, as flora.js draws it
export const snagBank = (w, x, y, i) => !isWater(w.terrain[i]) && w.distWater[i] <= 2 && visibleLevel(w, x, y) != null;

// Where a bird working a trunk clings (sim/bird-behavior.js 'trunk'): the trunk as drawn
// (treeTrunk, shared with flora.js), on the side it came in from, at a height read on the tree as
// built (treeLevel, decision 0024) so it stays on the bark below the crown however tall the trunk.
export function trunkCling(flora, game, w, i, a, def, sc) {
  const t = treeTrunk(w, i % w.w, i / w.w | 0);
  if (!t) return null;
  const site = flora?.treeSites.get(i), b = a.bird, p = game.catalog.plants[w.tree[i]];
  let y;
  if (site?.geo) {
    if (!site.geo.boundingBox) site.geo.computeBoundingBox();
    y = site.transform[1] + treeLevel(site.geo, b.h) * site.transform[4];
  } else y = w.heightAt(t[0], t[1]) * LEVEL + treeHeight(p) * w.treeG[i] * b.h * 0.8;
  const off = t[2] * 0.8 + (def.sprite.size || 10) * sc * 0.012, side = b.side ?? 0;
  return { x: t[0] + Math.cos(side) * off, z: t[1] + Math.sin(side) * off, y, yaw: Math.atan2(Math.sin(side), -Math.cos(side)), trunk: t };
}

// (seabirds fly over the water, not the seabed; a booby's plunge drops faster the further it
// falls, into the sea and a little way under it, and a noddy's swoop just touches the surface)
export function seaFlightHeight(c) {
  const { a, def, mo, sc, ground, seaY } = c;
  const dive = seaPlunge(a, def);
  c.y = a.fishing?.phase === 'under' ? seaY - mo.len * sc * 1.1 : Math.max(ground, seaY) + (0.7 + a.alt * 1.2) * (1 - dive * dive);
}

// up in its crown
export function crownPerch(A, c) {
  const { game, w } = c;
  const ci = crownTile(A, c); c.perchSite = A.flora?.treeSites.get(ci); c.y += treeHeight(game.catalog.plants[w.tree[ci]]) * w.treeG[ci] * 0.55;
}

// on the snag's broken top (flora.js draws it where its tree stood, 1.68 tall at full height,
// leaning a little: ground-obstacles.js): at its own place in the tile 0.9 up, it hung in the air beside the trunk
export function snagPerch(A, c) {
  const { w } = c;
  const ci = crownTile(A, c), sx = ci % w.w, sy = (ci / w.w) | 0, bank = snagBank(w, sx, sy, ci);
  const [bx, bz] = snagSpot(w, sx, sy, bank), [tx, tz, th] = snagTopAt(w, sx, sy, ci, bank);
  c.snagTop = [tx, tz];
  c.y = w.heightAt(bx, bz) * LEVEL - 0.02 + th;
}

// A flyover passing, flight clearance over the crowns, a hop on the ground, and the eased height
// of a bird between flight, the treetops and its perch.
export function birdHeight(c) {
  const { game, w, a, def, st, frameDt, time, flying, returning } = c;
  let { y } = c;
  // Moving between crowns of different heights, a climber (or a perched bird hopping along a
  // branch) rises or drops smoothly with a little hop, instead of snapping to each tree's height.
  if (a.passing) y = a.flightY + (a.passage.swoop ? Math.sin(a.passage.t * 1.8 + a.passage.phase) * 0.12 : 0);
  // over the treetops: the crowns under it and just ahead, unless it's on its way down (flight-clearance.js)
  // (looking about a second and a half of its flight ahead, 1.4 to 6 tiles, so it starts a
  // climb early enough to make it a gentle one)
  if (flying && def.move === 'fly') y = clearCanopy(w, game.catalog.plants, a, def, y, CLEAR, a.x - st.px, a.y - st.py,
    clamp(1.5 * Math.hypot(a.x - st.px, a.y - st.py) / Math.max(1 / 120, time - (st.t ?? time - 0.016)), 1.4, 6));
  else { CLEAR.floor = -Infinity; CLEAR.clearing = false; }
  if (a.birdGround && a.state === 'walk' && trait(def, 'hops')) y += Math.abs(Math.sin(a.phase * Math.PI)) * 0.045;
  // A bird's height eases between flight, the treetops it clears and its perch, rather than
  // jumping a tile's tree height when it takes off, lands, or crosses from open ground to trees.
  if (def.move === 'fly' && !def.reef && !a.passing) {
    // (in level flight it holds its height: a climb when the way ahead needs one, then only a
    // long shallow glide back down, so a forest or a dip in the ground isn't a bob: holdCruise)
    const level = CLEAR.clearing && st.fly > 0.9;
    if (st.birdY == null || returning || st.sc == null) { st.birdY = holdCruise(st, y, false, 0); st.birdVy = 0; }
    // (a seabird's plunge is a fall, not a glide: the drawn height keeps to it, and carries its speed on under the water)
    else if (a.fishing?.phase === 'dive' && seaPlunge(a, def) > 0) { st.birdVy = (y - st.birdY) / Math.max(1 / 120, frameDt); st.birdY = holdCruise(st, y, false, 0); }
    // (every change of height is a slant capped by its speed: easeBirdHeight)
    else st.birdY = easeBirdHeight(st, holdCruise(st, y, level, frameDt), 6 * (level ? 1 : 1.2),
      Math.hypot(a.x - st.px, a.y - st.py) / Math.max(1 / 120, frameDt), frameDt);
    // (a bird in full flight that finds itself in a crown, a new heading pointing straight into
    // a tall tree, climbs out of it hard, up to 4 tiles a second, but by its climb rate, not a
    // jump in height; taking off, it climbs out of its own tree at the usual ease)
    if (st.fly > 0.9 && st.birdY < CLEAR.floor) st.birdVy = Math.max(st.birdVy, Math.min(4, st.birdVy + 2 * CLIMB_ACCEL * frameDt,
      Math.sqrt(2 * CLIMB_ACCEL * 0.8 * Math.max(0, st.cruise - st.birdY)))); // (braking in time to level off over it)
    y = st.birdY;
  }
  c.y = y;
}

// a plunging booby points its bill at the sea and sweeps its wings back; a noddy tips down into
// its swoop (it follows the plunge in, and eases out of it once it is up)
export function plungePose(c) {
  const { a, def, st, k } = c;
  const plunge = seaPlunge(a, def);
  st.plunge = plunge >= (st.plunge || 0) ? plunge : st.plunge + (plunge - st.plunge) * Math.min(1, k * 0.8);
  if (st.plunge > 0.001) {
    const f = st.plunge * st.plunge * (3 - 2 * st.plunge), dives = def.behavior.fishing?.style === 'dive';
    c.posePitch -= (dives ? 1.25 : 0.4) * f;
    if (dives) c.poseFly = st.fly * (1 - 0.85 * f);
  }
}

// On the bark or a snag's top, and the swoop between there and flight.
export function anchorPose(c) {
  const { a, def, st, k, frameDt, time, returning, cling, snagTop } = c;
  let { ax, az } = c;
  st.trunk = cling?.trunk ?? null; // (the trunk it clings to, which the tracking lens keeps: focus.js)
  if (cling) {
    // upright against the bark, facing it, the head hammering in bursts
    ax = cling.x; az = cling.z;
    st.pitch = (st.pitch || 0) + (1.2 - (st.pitch || 0)) * Math.min(1, k * 2);
    st.graze = Math.sin(time * 0.9 + a.id * 2.1) > 0.1 ? (Math.sin(time * 26 + a.id) > 0 ? 0.9 : 0.15) : 0.3;
  } else {
    if (snagTop) [ax, az] = snagTop;
    if (def.move === 'fly' && st.pitch) st.pitch += (0 - st.pitch) * Math.min(1, k * 2);
  }
  // (a bird letting go of a trunk or a snag's top, or landing on one, swoops between the bark
  // and where it flies rather than jumping there: the gap fades over about half a second)
  if (def.move === 'fly' && !def.reef) {
    const anchor = cling ? 1 : snagTop ? 2 : 0;
    if (!returning && st.anchor != null && anchor !== st.anchor && st.drawnX != null) { st.offX = (st.offX || 0) + st.drawnX - ax; st.offZ = (st.offZ || 0) + st.drawnZ - az; }
    if (returning) st.offX = st.offZ = 0;
    st.anchor = anchor;
    if (st.offX || st.offZ) {
      const fade = Math.exp(-frameDt * 6); st.offX *= fade; st.offZ *= fade;
      if (Math.abs(st.offX) + Math.abs(st.offZ) < 1e-3) st.offX = st.offZ = 0;
      ax += st.offX; az += st.offZ;
    }
    st.drawnX = ax; st.drawnZ = az;
  }
  c.ax = ax; c.az = az;
}

// The bird being tracked, perched in a tree, sits on one of its real limbs (see bird-perch.js);
// the others keep their place in the crown. Moving onto a limb, off it (selected or let go,
// or taking off) or between limbs, the jump fades out over a moment as an offset, so the
// drawn bird never trails behind one that's flying away.
export function perchLimb(A, c) {
  const { game, w, a, st, k, returning, perchSite, snagTop, canopySites } = c;
  let { ax, az, y } = c;
  const tracked = a === A.followAgent || a === game.selectedAgent;
  const spot = perchSite && tracked ? perchPoint(perchSite, a.x, a.y, A.perchGoal, st.limbSite === perchSite ? st.limbSpot : -1) : -1;
  const onLimb = spot >= 0;
  st.limbSite = onLimb ? perchSite : null; st.limbSpot = spot; // (it keeps its limb until it leaves the tree)
  if (onLimb) { ax = A.perchGoal.x; az = A.perchGoal.z; y = A.perchGoal.y; }
  if (st.sc != null && !returning && (onLimb !== !!st.onLimb || onLimb && st.limbAt.distanceToSquared(A.perchGoal) > 1e-4))
    (st.perchOffset ||= new THREE.Vector3()).set(st.x - ax, st.y - y, st.z - az);
  else if (returning) st.perchOffset?.set(0, 0, 0);
  st.onLimb = onLimb;
  if (onLimb) (st.limbAt ||= new THREE.Vector3()).copy(A.perchGoal);
  const off = st.perchOffset;
  if (off && off.lengthSq() > 1e-6) { ax += off.x; y += off.y; az += off.z; off.multiplyScalar(1 - Math.min(1, k * 1.2)); }
  if (onLimb && tracked) A.perchBough.show(perchSite, spot, A.perchGoal); // (a conifer's bough under it: bird-perch.js)
  // (the focus window opens everything in front of the bird being tracked: keep the snag it's on solid, as a tree's wood is)
  if (snagTop && tracked) { const site = A.snagSite(w, Math.floor(snagTop[0]), Math.floor(snagTop[1])); if (site) canopySites.add(site); }
  if (onLimb) {
    st.canopyY = y;
    // (the focus window opens the whole tree in front of it: keep the limb it sits on solid, as for a climber)
    if (A.flora.treeSites.get(perchSite.tile) === perchSite) canopySites.add(perchSite);
  }
  c.ax = ax; c.az = az; c.y = y;
}
