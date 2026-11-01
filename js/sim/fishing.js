// Fish-eaters fishing (decision 0030): herons strike from the shallows, kingfishers plunge and
// eagles snatch from the surface and fly off with the fish, otters hunt in the water, bears swipe
// from the bank. The species profiles are data (js/data/animal-fishing.js, behavior.fishing).
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
// Water that holds fish: clean enough, or where the map's fish live.
function fishyWater(wl, i) {
  const w = wl.game.world;
  if (i < 0 || !isWater(w.terrain[i])) return false;
  if (w.waterQ[i] > 0.3) return true;
  return wl.game.catalog.animals.some(d => isFish(d) && wl.suit[d.index]?.[i] > 0.1);
}
// Water this style fishes in: an eagle needs open water to swoop over, the others any water.
const fishable = (w, i, p) => i >= 0 && (p.style === 'snatch' ? isDeepWater(w.terrain[i]) : isWater(w.terrain[i]));
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
function unseenFish(wl, def, i) {
  let best = null, bs = 0;
  for (const d of wl.game.catalog.animals) {
    if (!isFish(d)) continue;
    let s = (wl.suit[d.index]?.[i] || 0) + 0.02;
    if (carrier(def) && def.carries.includes(d.key)) s *= 4;
    s *= 0.5 + Math.random();
    if (s > bs) { bs = s; best = d; }
  }
  return best;
}

// A strike at the water at x, y: true when it comes up with a fish (it is then eating it, or
// carrying it off to a perch).
export function fishStrike(wl, a, def, x, y, p = fishing(def, wl.game)) {
  if (!p) return false;
  const g = wl.game, w = g.world;
  const fish = fishNear(wl, x, y, STRIKE, p);
  if (fish) {
    if (Math.random() >= predationCatchChance(g, fish, def, p.strike)) return false;
    const b = { id: fish.id, sp: fish.sp, x: fish.x, y: fish.y, age: fish.age, juvenile: !!fish.juvenile, alt: 0 };
    g.onPredation(a, fish);
    wl.remove(fish, 'predation');
    return caught(wl, a, def, b, p);
  }
  const i = tileOf(w, x, y);
  if (!p.unseen || !fishyWater(wl, i) || Math.random() >= p.strike) return false;
  const d = unseenFish(wl, def, i);
  if (!d) return false;
  return caught(wl, a, def, { id: -1, sp: d.index, x, y, age: Math.max(1, d.mature) * DAYS_PER_YEAR, juvenile: false, alt: 0 }, p);
}
function caught(wl, a, def, b, p) {
  a.fishFed = a.age + p.every[0] + Math.random() * (p.every[1] - p.every[0]);
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
  a.state = 'feed'; a.feedAt = [a.x, a.y]; a.feedT = p.style === 'wade' ? 0.6 + Math.random() * 0.6 : 1.5 + Math.random() * 1.5;
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
    const d = dx * dx + dy * dy + Math.random() * 2;
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
    const x = a.x + (Math.random() * 2 - 1) * p.reach, y = a.y + (Math.random() * 2 - 1) * p.reach, i = tileOf(w, x, y);
    if (!fishable(w, i, p) || !fishyWater(wl, i)) continue;
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
  if (!p || !p.strikes || p.style === 'wade' || a.leaving || fishFed(a) || Math.random() >= p.chance) return false;
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
  a.state = 'fish'; a.fishing.phase = 'watch'; a.fishing.t = 0.4 + Math.random() * 0.8;
}
function giveUp(a) {
  a.fishing = null; a.stoop = 0; a.state = 'idle'; a.wait = 0.3 + Math.random() * 0.5;
}
// Another try close by: the same fish if it is still about, else a little way along the water.
function moveOn(wl, a, f, p) {
  const w = wl.game.world;
  if (f.id != null) return;
  for (let k = 0; k < 8; k++) {
    const x = f.x + (Math.random() * 2 - 1) * 1.5, y = f.y + (Math.random() * 2 - 1) * 1.5, i = tileOf(w, x, y);
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
  if (a.move === 'fly') {
    a.flying = true;
    if (f.phase === 'go') {
      a.alt = Math.min(1, a.alt + dt * 2);
      if (wl.stepToward(a, f.x, f.y, sp)) { f.phase = 'watch'; f.t = 0.4 + Math.random() * 0.8; }
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
    if (--f.strikes > 0) { f.phase = 'watch'; f.t = 0.6 + Math.random(); moveOn(wl, a, f, p); return; }
    giveUp(a);
    return;
  }
  // an otter in the water: after the fish (or about the spot), then a dive and a grab
  if (Math.hypot(f.x - a.x, f.y - a.y) > 0.3) wl.stepToward(a, f.x, f.y, sp * (fish ? 0.9 : 0.5));
  if ((f.t -= dt) > 0) return;
  if (fishStrike(wl, a, def, a.x, a.y, p)) return;
  if (--f.strikes > 0) { f.t = 0.6 + Math.random() * 0.8; moveOn(wl, a, f, p); return; }
  giveUp(a);
}
