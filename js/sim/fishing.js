// Fish-eaters fishing (decision 0030): herons strike from the shallows, kingfishers plunge and
// eagles snatch from the surface and fly off with the fish, otters hunt in the water, bears swipe
// from the bank. Boobies plunge-dive into the sea from high up and noddies dip from the surface,
// for the small fish of the open water (surfaceFish) that the reef doesn't draw as agents. The species profiles are data (js/data/animal-fishing.js, behavior.fishing).
// A strike takes a fish the map draws if one is in reach (it is gone from the water). Where none
// is, a species that can (`unseen`) still comes up with one of the fish the water holds but the
// map doesn't draw as animals, which takes nothing from the drawn fish. Fishing feeds no one's
// population: fish-eaters stay with the habitat rules that brought them (the fish index).
import { preyFor } from '../data/animals.js';
import { F, isWater, isDeepWater, DAYS_PER_YEAR } from '../config.js';
import { canLand, passable } from './animal-terrain.js';
import { predationCatchChance } from './ecological-pressure.js';
import { facePoint } from './animal-positioning.js';
import { carryCatch, carrier } from './bird-behavior.js';
import { simRandom } from './sim-random.js';

export const isFish = d => !!d && d.move === 'swim' && !d.reef && !d.notPrey && d.sprite.kind === 'fish';
// The species' fishing profile, if it fishes this way in this game mode: not where it already
// hunts the fish as prey (Challenging gives herons, otters and eagles the fish to hunt).
export function fishing(def, game) {
  const p = def.behavior?.fishing;
  if (!p) return null;
  return preyFor(def, game)?.some(k => isFish(game.catalog.animal[k])) ? null : p;
}
// Fed from its last catch (sim-days of its age), it doesn't fish again yet.
export const fishFed = a => a.fishFed > a.age;
const STRIKE = 0.6; // (tiles from the strike that a drawn fish can be taken: within reach of a bill or feet)

function tileOf(w, x, y) { const xi = Math.floor(x), yi = Math.floor(y); return w.inb(xi, yi) ? w.idx(xi, yi) : -1; }
// Open sea: on an underwater map (the reef) everything off the dry land, elsewhere deep water.
function seaTile(w, i) {
  const d = w.catalog.definition;
  return i >= 0 && (d.look.underwater ? !d.dryLand?.(w, i) : isDeepWater(w.terrain[i]));
}
// Water that holds fish: clean enough, or where the map's fish live.
function fishyWater(wl, i, p) {
  const w = wl.game.world;
  if (p?.sea) return seaTile(w, i);
  if (i < 0 || !isWater(w.terrain[i])) return false;
  if (w.waterQ[i] > 0.3) return true;
  return wl.game.catalog.animals.some(d => isFish(d) && wl.suit[d.index]?.[i] > 0.1);
}
// Water this style fishes in: an eagle needs open water to swoop over, the others any water.
const fishable = (w, i, p) => i >= 0 && (p.sea ? seaTile(w, i) : p.style === 'snatch' ? isDeepWater(w.terrain[i]) : isWater(w.terrain[i]));
function fishNear(wl, x, y, r, p) {
  const g = wl.game, w = g.world;
  let best = null, bd = r * r;
  for (const o of wl.agents) {
    if (o.leaving || !isFish(g.catalog.animals[o.sp]) || !fishable(w, tileOf(w, o.x, o.y), p)) continue;
    const d = (o.x - x) ** 2 + (o.y - y) ** 2;
    if (d < bd) { bd = d; best = o; }
  }
  return best;
}
// One of the fish this water holds, to draw in its bill or feet: a species living here, and one an
// eagle can lift where there is one.
// A seabird comes up with one of the small fish of the open water (surfaceFish).
function unseenFish(wl, def, i, p) {
  let best = null, bs = 0;
  for (const d of wl.game.catalog.animals) {
    if (p.sea ? !d.surfaceFish : !isFish(d)) continue;
    let s = (wl.suit[d.index]?.[i] || 0) + 0.02;
    if (carrier(def) && def.carries.includes(d.key)) s *= 4;
    s *= 0.5 + simRandom();
    if (s > bs) { bs = s; best = d; }
  }
  return best;
}

// A strike at the water at x, y: true when it comes up with a fish (it is then eating it, or
// carrying it off to a perch).
export function fishStrike(wl, a, def, x, y, p = fishing(def, wl.game)) {
  if (!p) return false;
  const g = wl.game, w = g.world;
  // (a drawn fish in reach is the one taken in proportion to how full its kind is in the water:
  // few drawn fish stand for a scarce stock, which the fishers then mostly miss, so a small
  // population isn't held down; balance check in decision 0030)
  let fish = fishNear(wl, x, y, STRIKE, p);
  if (fish && p.unseen) { const st = wl.state[fish.sp]; if (simRandom() >= Math.min(1, (st?.pop || 0) / Math.max(1, st?.K || 0))) fish = null; }
  if (fish) {
    if (simRandom() >= predationCatchChance(g, fish, def, p.strike)) return false;
    const b = { id: fish.id, sp: fish.sp, x: fish.x, y: fish.y, age: fish.age, juvenile: !!fish.juvenile, alt: 0 };
    g.onPredation(a, fish);
    wl.remove(fish, 'predation');
    return caught(wl, a, def, b, p);
  }
  const i = tileOf(w, x, y);
  if (!p.unseen || !fishyWater(wl, i, p) || simRandom() >= p.strike) return false;
  const d = unseenFish(wl, def, i, p);
  if (!d) return false;
  return caught(wl, a, def, { id: -1, sp: d.index, x, y, age: Math.max(1, d.mature) * DAYS_PER_YEAR, juvenile: false, alt: 0 }, p);
}
function caught(wl, a, def, b, p) {
  a.fishFed = a.age + p.every[0] + simRandom() * (p.every[1] - p.every[0]);
  // a noddy swallows its catch on the wing as it rises from the dip
  if (p.style === 'dip' && a.fishing) { Object.assign(a.fishing, { phase: 'rise', t: 0.6 + simRandom() * 0.4, strikes: 0 }); a.stoop = 0; return true; }
  a.fishing = null; a.stoop = 0; a.goal = null;
  // an eagle carries what it can lift to a perch (and drags a heavier one to the bank: 0012)
  if (carrier(def) && carryCatch(wl, a, def, b)) return true;
  a.prey = { id: b.id, sp: b.sp, age: b.age, juvenile: b.juvenile, fish: true };
  a.carcass = null; a.path = null;
  if (p.style === 'plunge') {
    // a kingfisher flies up to a perch near the water to beat it and swallow it
    const w = wl.game.world, k = perchNear(wl, a, def, 8);
    if (k >= 0) {
      a.carry = { phase: 'lift', t: 0, i: k, tx: k % w.w + 0.5, ty: (k / w.w | 0) + 0.5, low: false, left: 20 };
      a.state = 'carry'; a.flying = true; a.alt = Math.min(a.alt || 0, 0.15); a.bird = null; a.birdGoal = null;
      return true;
    }
  }
  // swallowed where it was caught (a heron, an otter afloat, a bear on the bank)
  a.state = 'feed'; a.feedAt = [a.x, a.y]; a.feedT = p.style === 'wade' ? 0.6 + simRandom() * 0.6 : 1.5 + simRandom() * 1.5;
  if (a.move === 'fly') a.flying = false;
  facePoint(a, b.x, b.y);
  return true;
}
function perchNear(wl, a, def, r) {
  const w = wl.game.world, x0 = Math.floor(a.x), y0 = Math.floor(a.y);
  let best = -1, bd = Infinity;
  for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    if (!w.inb(x0 + dx, y0 + dy)) continue;
    const j = w.idx(x0 + dx, y0 + dy);
    if (w.fire[j] || !canLand(w, j, def) || !(w.tree[j] && w.treeG[j] > 0.55 || w.feature[j] === F.SNAG)) continue;
    const d = dx * dx + dy * dy + simRandom() * 2;
    if (d < bd) { bd = d; best = j; }
  }
  return best;
}

// Where to fish: the nearest stretch of water that holds fish. It doesn't seek out the few fish
// the map draws (each stands for many in the water); one is taken only when it happens to be in
// reach of a strike. A species that only takes the drawn fish (bears) goes after one it can see.
function fishSpot(wl, a, def, p) {
  const w = wl.game.world;
  if (!p.unseen) { const fish = fishNear(wl, a.x, a.y, p.reach, p); return fish && { x: fish.x, y: fish.y, id: fish.id }; }
  let best = null, bd = Infinity;
  for (let k = 0; k < 60; k++) {
    const x = a.x + (simRandom() * 2 - 1) * p.reach, y = a.y + (simRandom() * 2 - 1) * p.reach, i = tileOf(w, x, y);
    if (!fishable(w, i, p) || !fishyWater(wl, i, p)) continue;
    if (a.move !== 'fly' && !passable(w, i, a)) continue;
    const d = Math.hypot(x - a.x, y - a.y);
    if (d < bd) { bd = d; best = { x: Math.floor(x) + 0.5, y: Math.floor(y) + 0.5, id: null }; }
  }
  return best;
}

// A decision to go fishing (kingfishers, eagles and otters; herons fish from their wading, and
// bears at the creek: sim/animals.js wade and fishCreek). Hungry, near water, at its own pace.
export function fishChoose(wl, a, def) {
  const p = fishing(def, wl.game);
  if (!p || !p.strikes || p.style === 'wade' || a.leaving || fishFed(a) || simRandom() >= p.chance) return false;
  const spot = fishSpot(wl, a, def, p);
  if (!spot) return false;
  a.bird = null; a.birdGoal = null; a.birdGround = false; a.goal = null; a.path = null; a.stoop = 0;
  a.fishing = { phase: 'go', x: spot.x, y: spot.y, id: spot.id, strikes: p.strikes, t: 0, left: 30 };
  if (a.move === 'fly') { a.state = 'fish'; a.flying = true; return true; }
  // an otter goes down to the water on its own feet and swims out to the spot
  const w = wl.game.world, near = (x, y) => Math.hypot(x + 0.5 - spot.x, y + 0.5 - spot.y);
  if (near(Math.floor(a.x), Math.floor(a.y)) < 1.2) { fishArrive(wl, a, true); return true; }
  if (wl.pathTo(a, (j, x, y) => near(x, y) < 1.2 && passable(w, j, a), 4000, near)) { a.goal = { fish: true }; return true; }
  a.fishing = null;
  return false;
}
// At the water after the walk down to it.
export function fishArrive(wl, a, here = false) {
  if (!here && !a.goal?.fish) return;
  a.goal = null;
  if (!a.fishing) return;
  a.state = 'fish'; a.fishing.phase = 'watch'; a.fishing.t = 0.4 + simRandom() * 0.8;
}
function giveUp(a) {
  a.fishing = null; a.stoop = 0; a.state = 'idle'; a.wait = 0.3 + simRandom() * 0.5;
}
// Another try close by: the same fish if it is still about, else a little way along the water.
function moveOn(wl, a, f, p) {
  const w = wl.game.world;
  if (f.id != null) return;
  for (let k = 0; k < 8; k++) {
    const x = f.x + (simRandom() * 2 - 1) * 1.5, y = f.y + (simRandom() * 2 - 1) * 1.5, i = tileOf(w, x, y);
    if (fishable(w, i, p) && (a.move === 'fly' || passable(w, i, a))) { f.x = x; f.y = y; return; }
  }
}
export function fishUpdate(wl, a, def, dt, sp) {
  const f = a.fishing, p = fishing(def, wl.game);
  if (!f || !p) { giveUp(a); return; }
  if ((f.left -= dt) <= 0) { giveUp(a); return; }
  // after a fish it saw: follow it while it is in the water
  const fish = f.id != null ? wl.ids.get(f.id) : null;
  if (f.id != null && (!fish || fish.leaving)) f.id = null;
  else if (fish) { f.x = fish.x; f.y = fish.y; }
  if (p.sea) { seaFishing(wl, a, def, f, p, dt, sp); return; }
  if (a.move === 'fly') {
    a.flying = true;
    if (f.phase === 'go') {
      a.alt = Math.min(1, a.alt + dt * 2);
      if (wl.stepToward(a, f.x, f.y, sp)) { f.phase = 'watch'; f.t = 0.4 + simRandom() * 0.8; }
      return;
    }
    if (f.phase === 'watch') {
      // a kingfisher hovers over the water, an eagle drifts over it, eyes down
      f.t -= dt; a.alt = Math.min(1, a.alt + dt);
      wl.stepToward(a, f.x, f.y, sp * 0.3);
      if (f.t <= 0) { f.phase = 'dive'; a.stoop = 0; }
      return;
    }
    // the dive: down onto the water (a kingfisher plunges in, an eagle swings its feet forward)
    a.stoop = Math.min(1, (a.stoop || 0) + dt * (p.style === 'plunge' ? 4 : 2.5));
    a.alt = Math.max(0.05, a.alt - dt * 2);
    wl.stepToward(a, f.x, f.y, sp * 0.8);
    if (a.stoop < 1) return;
    if (fishStrike(wl, a, def, a.x, a.y, p)) return;
    a.stoop = 0;
    if (--f.strikes > 0) { f.phase = 'watch'; f.t = 0.6 + simRandom(); moveOn(wl, a, f, p); return; }
    giveUp(a);
    return;
  }
  // an otter in the water: after the fish (or about the spot), then a dive and a grab
  if (Math.hypot(f.x - a.x, f.y - a.y) > 0.3) wl.stepToward(a, f.x, f.y, sp * (fish ? 0.9 : 0.5));
  if ((f.t -= dt) > 0) return;
  if (fishStrike(wl, a, def, a.x, a.y, p)) return;
  if (--f.strikes > 0) { f.t = 0.6 + simRandom() * 0.8; moveOn(wl, a, f, p); return; }
  giveUp(a);
}

// Seabirds at sea. A booby flies out high and glides over the water looking down, folds and
// plunges straight in, stays under a moment, and comes up with a fish to swallow afloat, or sits a
// moment and flies up to try again. A noddy flies low, swoops down to snatch at the surface on the
// wing and rises again, swallowing its catch as it goes. a.stoop is how far down the plunge or
// swoop it is (drawn by render3d/actors.js).
const HIGH = { dive: 1.6, dip: 0.45 };
function seaFishing(wl, a, def, f, p, dt, sp) {
  const high = HIGH[p.style] ?? 1;
  if (f.phase === 'go' || f.phase === 'watch') {
    a.flying = true; a.stoop = 0;
    a.alt = a.alt < high ? Math.min(high, a.alt + dt * 1.2) : Math.max(high, a.alt - dt);
    if (f.phase === 'go') {
      if (wl.stepToward(a, f.x, f.y, sp)) { f.phase = 'watch'; f.t = 1 + simRandom() * 1.5; f.ang = Math.atan2(a.y - f.y, a.x - f.x); }
      return;
    }
    // gliding round over the spot, looking down, until it is high enough and sees one
    f.ang = (f.ang || 0) + dt * 1.1;
    wl.stepToward(a, f.x + Math.cos(f.ang) * 1.2, f.y + Math.sin(f.ang) * 1.2, sp * 0.6);
    if ((f.t -= dt) <= 0 && a.alt >= high * 0.9) { f.phase = 'dive'; a.stoop = 0; }
    return;
  }
  if (f.phase === 'dive') {
    // (a booby's plunge takes a good half second from the top, a noddy's swoop a little less;
    // the drawn drop speeds up as it falls: actors.js)
    a.stoop = Math.min(1, a.stoop + dt * (p.style === 'dive' ? 1.6 : 2.2));
    wl.stepToward(a, f.x, f.y, sp * (p.style === 'dive' ? 0.25 : 0.7));
    if (a.stoop < 1) return;
    f.phase = p.style === 'dive' ? 'under' : 'touch'; f.t = p.style === 'dive' ? 0.35 + simRandom() * 0.4 : 0.12;
    return;
  }
  if (f.phase === 'under' || f.phase === 'touch') {
    if (p.style === 'dip') wl.stepToward(a, f.x + Math.cos(f.ang || 0), f.y + Math.sin(f.ang || 0), sp * 0.6); // (skimming on)
    if ((f.t -= dt) > 0) return;
    if (fishStrike(wl, a, def, a.x, a.y, p)) return;
    // came up empty: a booby sits a moment on the water, then flies up to try again
    f.strikes--;
    if (p.style === 'dive') { f.phase = 'surface'; f.t = 0.5 + simRandom() * 0.8; a.flying = false; a.stoop = 0; a.alt = 0; return; }
    f.phase = 'rise'; f.t = 0.5; a.stoop = 0;
    return;
  }
  if (f.phase === 'surface') {
    if ((f.t -= dt) > 0) return;
    if (f.strikes <= 0) { giveUp(a); return; }
    moveOn(wl, a, f, p); f.phase = 'watch'; f.t = 1.2 + simRandom(); a.flying = true;
    return;
  }
  // rising from a dip, with or without a fish, to look again (or go off fed)
  a.flying = true; a.alt = Math.min(high, a.alt + dt * 1.5);
  wl.stepToward(a, f.x + Math.cos(f.ang || 0) * 1.5, f.y + Math.sin(f.ang || 0) * 1.5, sp * 0.7);
  if ((f.t -= dt) > 0) return;
  if (f.strikes <= 0 || fishFed(a)) { giveUp(a); return; }
  moveOn(wl, a, f, p); f.phase = 'watch'; f.t = 0.6 + simRandom();
}
