// Steer and move, decision 0025's second step (part of the Wildlife class, sim/animals.js): a
// walk along its path, and the one step every mover takes (stepToward), by mode: reef fish swim
// along their heading (reefStep), river fish keep to water deep enough, ground walkers never cut
// a corner or step into what they can't stand on. Spacing and settle follow in Wildlife.update.

import { T, clamp } from '../config.js';
import { isMaleVariant } from '../data/animals.js';
import { facePoint } from './animal-positioning.js';
import { endHunt, arrive } from './animal-life.js';
import { birdArrive } from './bird-behavior.js';
import { climberArrive } from './climbers.js';
import { crossGap } from './canopy-links.js';
import { fishArrive } from './fishing.js';
import { inRut } from './cervid-groups.js';
import { primateArrive } from './primate-behavior.js';
import { forageArrive } from './animal-foraging.js';
import { smoothWalk, smoothWalker } from './animal-walking.js';
import { clearSpot, resolveStep, steerAround } from './ground-obstacles.js';
import { turnRate, reefStep } from './steering.js';
import { shapeCourse, pathPoint } from './animal-course.js';
import { swimDepth, deepWaterNear, fishDepth } from './waterline.js';
import { drinkEvery } from './home-range.js';
import { passable, reefMoveSafe } from './animal-terrain.js';
import { simRandom } from './sim-random.js';
import { swimmer, standable, inRiver, spotIn, hashJitter } from './wildlife-shared.js';

export class WildlifeMove {
  // Repair an old stranded position, or a new obstruction under an animal. Preserve
  // its identity and population count, and discard the route that put it on land.
  recoverReef(a) {
    const w = this.game.world;
    let best = -1, distance = Infinity;
    for (let j = 0; j < w.n; j++) {
      const d = (j % w.w + 0.5 - a.x) ** 2 + ((j / w.w | 0) + 0.5 - a.y) ** 2;
      if (d < distance && passable(w, j, a)) { best = j; distance = d; }
    }
    if (best < 0) return false;
    a.x = best % w.w + 0.5; a.y = (best / w.w | 0) + 0.5;
    a.path = null; a.spd = 0; a.swimT = 0;
    a.forage = null; a.forageGoal = null; endHunt(a);
    a.state = a.leaving ? 'leave' : 'idle'; a.wait = 0;
    if (a.leaving) this.leaveRoute(a);
    return true;
  }

  // One step along a walk's path (state 'walk'): to the next waypoint, round anyone in the way.
  walkStep(a, def, sp, dt) {
    const w = this.game.world;
    if (a.gapTo != null || a.move === 'tree') crossGap(this, a, def, a.path?.[a.path.length - 1] ?? -1); // (down a trunk at a gap the crowns don't span, and up the far one)
    if (!a.path || !a.path.length) { a.state = 'idle'; a.run = null; a.wait = a.move === 'swim' && !def.reef ? 0.1 + simRandom() * 0.3 : def.patrol ? 0.2 + simRandom() * 0.8 : def.familyHerd && a.follow ? 0.25 : def.familyHerd && !a.greet && !a.follow ? (inRut(this.game) && isMaleVariant(def, a) && def.sprite.male?.antlers ? 0.5 + simRandom() * 1.5 : 3 + simRandom() * 4) : 0.5 + simRandom() * 3; arrive(this, a); birdArrive(this, a); primateArrive(this, a); forageArrive(this, a); fishArrive(this, a); climberArrive(this, a); return; }
    if (smoothWalker(def) && a.course?.path !== a.path) shapeCourse(this, a, def); // (a journey walks a curve: see animal-course.js)
    const j = a.path[a.path.length - 1];
    if (def.reef) { if (this.swimToward(a, j, sp * (a.pace || 1) * (a.dash || a.run || 1), dt) && (a.path.pop(), !a.path.length)) a.dash = null; return; }
    // each animal keeps to its own line through a tile and stops at its own spot in the last
    // one, so two walking the same way don't trace one track, and a group doesn't pile onto
    // a single point (a journey steers for where its course crosses the tile)
    let [ox, oy] = smoothWalker(def) ? pathPoint(w, a, a.path.length - 1).map((v, n) => v - (n ? (j / w.w | 0) : j % w.w) - 0.5) : spotIn(a, j, a.path.length === 1);
    // (a river fish's waypoint is in water deep enough to swim in, not up the bank's shallows)
    if (a.move === 'swim' && !def.reef && swimDepth(w, j % w.w + 0.5 + ox, (j / w.w | 0) + 0.5 + oy) < fishDepth(def)) {
      const p = deepWaterNear(w, j % w.w + 0.5 + ox, (j / w.w | 0) + 0.5 + oy, 0.9, fishDepth(def));
      if (p) { ox = p[0] - (j % w.w) - 0.5; oy = p[1] - (j / w.w | 0) - 0.5; }
    }
    if (a.path.length === 1 && a.restSpot?.[0] !== j) {
      const bank = !a.dormancy && this.drinks(def) && a.thirst > drinkEvery(this, a, def) * 0.5 ? this.bankSpot(a, j) : null;
      const drink = bank && bank.crowd < 0.08;
      a.restSpot = [j, ...(a.dormancy ? [j % w.w + 0.5, (j / w.w | 0) + 0.5] : drink ? [bank.x, bank.y] : this.spacing.restSpot(a, j, ox, oy))];
      // (on a low bank the dry spot can be a tile or two back from the water, off the tile
      // it walked to: remember it, or on arrival it doesn't know it's at the water and sets
      // off for the bank again, pacing back and forth without ever drinking)
      if (drink) a.bankGoal = bank;
    }
    // (a spot picked by tile can fall on a trunk: aim beside it, see ground-obstacles.js)
    const [tx, ty] = clearSpot(w, a, def, a.path.length === 1 ? a.restSpot[1] : (j % w.w) + 0.5 + ox,
      a.path.length === 1 ? a.restSpot[2] : ((j / w.w) | 0) + 0.5 + oy);
    const wading = def.crossing && w.terrain[j] === T.RIVER; // swimming the river is slow going
    // A waypoint isn't a pin that every animal must stand on. Step past occupied
    // transit points, or finish beside an occupied destination when already clear.
    const remaining = Math.hypot(a.x - tx, a.y - ty);
    if ((!smoothWalker(def) && a.path.length > 1 && remaining < 0.35 && w.idx(Math.floor(a.x), Math.floor(a.y)) === j) ||
      // (someone stands on this waypoint: on to the next, rather than braking behind them: 0025)
      (a.path.length > 1 && remaining < 0.6 && this.spacing.crowd(a, tx, ty) > 0.08) ||
      (a.path.length === 1 && remaining < 0.9 && this.spacing.crowd(a, tx, ty) > 0.08 &&
      this.spacing.crowd(a, a.x, a.y) < 0.04) ||
      // (its spot's been taken and it's getting no closer edging round the others: stop short)
      (a.path.length === 1 && remaining < 1.5 && a.moveProgress?.stalled > 0.3 && this.spacing.crowd(a, tx, ty) > 0.08) ||
      // (a herd member keeping up only needs to be near the others: held up near the end by a
      // trunk or a herd mate, it stops there instead of pressing on the spot for seconds)
      (a.follow && a.path.length === 1 && remaining < 2.5 && a.moveProgress?.stalled > 0.4)) {
      a.path.pop(); return;
    }
    const pace = (wading ? sp * 0.55 : sp) * (a.pace || 1) * (a.run || 1); // (a.run: a startled animal dashing for cover)
    // curve round anyone in the way rather than walking into them (not on a dash for cover)
    const round = a.run ? null : this.spacing.steer(a, tx, ty, standable);
    if (smoothWalker(def)) { if (smoothWalk(this, a, def, tx, ty, pace, dt, round)) a.path.pop(); }
    else if (round) { this.stepToward(a, round[0], round[1], pace * round[2]); if (Math.hypot(a.x - tx, a.y - ty) <= pace) a.path.pop(); }
    else if (this.stepToward(a, tx, ty, pace)) a.path.pop();
  }

  checkMovementProgress(a, dt) {
    if (((a.state !== 'walk' || !a.path?.length) && a.state !== 'approach') || this.game.catalog.animals[a.sp].reef) {
      a.moveProgress = null;
      return;
    }
    const w = this.game.world, j = a.state === 'walk' ? a.path[a.path.length - 1] : -1;
    let tx = a.localGoal?.[0], ty = a.localGoal?.[1];
    if (j >= 0) {
      const [ox, oy] = smoothWalker(this.game.catalog.animals[a.sp]) ? pathPoint(w, a, a.path.length - 1).map((v, n) => v - (n ? (j / w.w | 0) : j % w.w) - 0.5) : spotIn(a, j, a.path.length === 1);
      const rest = a.path.length === 1 && a.restSpot?.[0] === j;
      tx = rest ? a.restSpot[1] : j % w.w + 0.5 + ox;
      ty = rest ? a.restSpot[2] : (j / w.w | 0) + 0.5 + oy;
    }
    if (tx == null || ty == null) { a.moveProgress = null; return; }
    [tx, ty] = clearSpot(w, a, this.game.catalog.animals[a.sp], tx, ty); // (where the walk aims: beside a trunk, not on it)
    const distance = Math.hypot(a.x - tx, a.y - ty), p = a.moveProgress;
    if (!p || p.j !== j || p.tx !== tx || p.ty !== ty) {
      a.moveProgress = { j, tx, ty, best: distance, stalled: 0 };
      return;
    }
    if (distance < p.best - 0.04) { p.best = distance; p.stalled = 0; }
    else p.stalled += dt;
    if (p.stalled >= 3) this.recoverMovement(a);
  }

  recoverMovement(a) {
    const w = this.game.world, approaching = a.state === 'approach';
    if (this.game.catalog.animals[a.sp].crossing && inRiver(this, a)) { // (a swimmer jammed in the river: on for the far bank)
      const y0 = Math.floor(a.y);
      if (this.pathTo(a, (j, x, y) => y < y0 - 2 - (a.id % 3) && passable(w, j, a), 4000, null, null, standable)) { a.landed = true; a.moveProgress = null; return; }
    }
    const dest = approaching ? w.idx(Math.floor(a.localGoal[0]), Math.floor(a.localGoal[1])) : a.path[0];
    const tx = dest % w.w + 0.5, ty = (dest / w.w | 0) + 0.5;
    const wasFollowing = a.follow, inTransit = !approaching && a.path.length > 1;
    a.moveProgress = null; a.restSpot = null; a.localGoal = null;
    // A fixed herd slot can be occupied by another animal for years. Let the
    // next herd decision choose a new slot instead of returning to that jam.
    if (wasFollowing) { a.slot = null; a.bachelorSlot = null; a.momSlot = null; }
    const spots = new Map();
    const freeSpot = j => {
      if (!spots.has(j)) {
        if (approaching) spots.set(j, this.bankSpot(a, j));
        else {
          const [ox, oy] = spotIn(a, j, true);
          const [x, y] = this.spacing.restSpot(a, j, ox, oy);
          spots.set(j, { x, y, crowd: this.spacing.crowd(a, x, y) });
        }
      }
      return spots.get(j);
    };
    const goal = (j, x, y) => Math.hypot(x + 0.5 - tx, y + 0.5 - ty) < 4 &&
      (freeSpot(j)?.crowd ?? Infinity) < 0.04;
    // First try walking around occupied transit tiles. If packed in on every
    // side, allow an escape through the crowd; the progress timer still bounds it.
    const clear = j => {
      const [ox, oy] = spotIn(a, j, false);
      return this.spacing.crowd(a, j % w.w + 0.5 + ox, (j / w.w | 0) + 0.5 + oy) < 0.08;
    };
    if (this.pathTo(a, goal, 900, null, clear) || this.pathTo(a, goal, 900)) {
      const j = a.path[0], spot = freeSpot(j);
      a.restSpot = [j, spot.x, spot.y];
      return;
    }
    // Long trips can extend beyond this local search. Step into nearby room,
    // then resume the original journey rather than forgetting the destination.
    if (inTransit && this.pathTo(a, (j, x, y) => Math.hypot(x + 0.5 - a.x, y + 0.5 - a.y) < 4 &&
      freeSpot(j).crowd < 0.04, 300)) {
      const j = a.path[0], spot = freeSpot(j);
      a.restSpot = [j, spot.x, spot.y];
      if (!wasFollowing) a.trip = dest;
      return;
    }
    // No reachable space right now. Rest briefly and make a fresh decision;
    // never leave a failed route running forever or teleport across a barrier.
    a.path = null; a.trip = null; a.follow = false;
    a.state = 'idle'; a.wait = 0.5 + (a.id % 7) * 0.15;
  }

  // Swimming on the reef: a fish doesn't walk from tile centre to tile centre. It holds a heading
  // and turns it gradually toward the next point on its path (each a little off the tile's
  // centre, so a school doesn't line up), speeds up and slows down smoothly, and rounds the
  // corners instead of stopping at them. Returns true once it's close enough to move on.
  swimToward(a, j, sp, dt) {
    const w = this.game.world, last = a.path.length === 1;
    const h1 = hashJitter(j % w.w + a.id * 7, ((j / w.w) | 0) + a.id * 3), h2 = hashJitter(((j / w.w) | 0) - a.id * 5, j % w.w + a.id);
    const tx = (j % w.w) + 0.5 + h1 * 0.7, ty = ((j / w.w) | 0) + 0.5 + h2 * 0.7;
    const dx = tx - a.x, dy = ty - a.y, d = Math.hypot(dx, dy);
    // turn toward the point, no faster than a fish can (bigger fish turn wider: turnRate), and up
    // to three times as fast when it has barely any way on, as when it hovers (hoverStep)
    let turn = Math.atan2(dy, dx) - a.heading;
    turn -= Math.round(turn / (Math.PI * 2)) * Math.PI * 2;
    const still = 1 - Math.min(1, (a.spd || 0) * dt / Math.max(sp, 1e-6));
    const rate = turnRate(this.game.catalog.animals[a.sp]) * (1 + 2 * still) * dt;
    a.heading += clamp(turn, -rate, rate);
    // ease up to cruising speed, ease off when the point is behind it or it's nearly there
    // (a.spd is in tiles a day, so the motion is the same at any frame rate)
    const want = sp / Math.max(dt, 1e-6) * (0.35 + 0.65 * Math.max(0, Math.cos(turn))) * (last ? clamp(d / 0.9, 0.25, 1) : 1);
    a.spd = (a.spd || 0) + (want - (a.spd || 0)) * Math.min(1, dt * 3);
    // (rounding a corner mustn't carry it up the beach: if it would, it stops, and so turns on the
    // spot toward the point rather than facing it in one step)
    if (!reefStep(w, a, a.spd * dt)) a.spd = 0;
    a.swimT = (a.swimT || 0) + dt;
    if (d < (last ? 0.25 : 0.55) || a.swimT > 4) { a.swimT = 0; return true; } // (or gives up on a point it keeps circling)
    return false;
  }

  glide(a, dt) {
    if (!reefStep(this.game.world, a, a.spd * dt)) a.spd = 0;
    a.spd *= Math.exp(-dt * 2.5);
  }

  stepToward(a, tx, ty, sp) {
    const def = this.game.catalog.animals[a.sp];
    [tx, ty] = clearSpot(this.game.world, a, def, tx, ty);
    let dx = tx - a.x, dy = ty - a.y;
    const d = Math.hypot(dx, dy);
    // (a reef fish swims along its heading toward it: reefToward)
    if (this.game.catalog.animals[a.sp].reef && d > sp && sp > 0) return reefToward(this.game.world, a, tx, ty, dx, dy, sp);
    // (curve round a trunk or log ahead rather than walking into it)
    if (d > 0.02 && sp > 0) { const h = steerAround(this.game.world, a, def, Math.atan2(dy, dx), Math.min(d, 1.6)); dx = Math.cos(h) * d; dy = Math.sin(h) * d; }
    const was = a.heading;
    if (d > 0.02 && sp > 0) facePoint(a, a.x + dx, a.y + dy);
    const step = Math.min(d, sp);
    let nx = d ? a.x + dx / d * step : a.x, ny = d ? a.y + dy / d * step : a.y;
    if (this.game.catalog.animals[a.sp].reef && !reefMoveSafe(this.game.world, a, nx, ny)) return false;
    // (a river fish keeps to water it can swim in: it may only move into the shallows to get out of
    // them, and across water as shallow as where it is: a catfish crossing a level marsh to a pool)
    if (a.move === 'swim' && !def.reef && d > 0) {
      if (!riverFishStep(this.game.world, a, def, nx, ny, dx, dy, step, was)) return false;
      nx = TO.x; ny = TO.y;
    }
    if (a.move !== 'fly' && !swimmer(a, this.game.catalog) && !a.leaving && !groundStep(this.game, a, nx, ny, dx, dy)) return false;
    const fromX = a.x, fromY = a.y;
    a.x = nx; a.y = ny;
    resolveStep(this, a, def, fromX, fromY);
    return d <= sp;
  }
}

// ---- each mode's step (stepToward above takes them in turn)

// Reef fish: never slides sideways at a target (hunting, leaving); it turns its nose toward it,
// no faster than a fish can, and swims along its heading, easing off in a tight turn.
function reefToward(w, a, tx, ty, dx, dy, sp) {
  let turn = Math.atan2(dy, dx) - a.heading;
  turn -= Math.round(turn / (Math.PI * 2)) * Math.PI * 2;
  const rate = sp * 3.5; // (a turning circle: so much turn for each tile it swims)
  a.heading += clamp(turn, -rate, rate);
  const step = sp * Math.max(0.25, Math.cos(turn));
  reefStep(w, a, step);
  return Math.hypot(tx - a.x, ty - a.y) <= sp;
}

// River fish: where its step (nx, ny) lands, in TO; false when there's no way on.
const TO = { x: 0, y: 0 };
function riverFishStep(w, a, def, nx, ny, dx, dy, step, was) {
  const here = swimDepth(w, a.x, a.y), need = fishDepth(def), swims = (x, y) => { const t = swimDepth(w, x, y); return t >= need || t > here || here < need && t >= here; };
  if (!swims(nx, ny)) {
    // it follows the channel round a shallow bar: the nearest heading either side that keeps to
    // swimmable water. Held up half a day all the same (a creek running downhill is a staircase
    // of pools, shallow at each lip: swimDepth), it hops the lip to the first swimmable water
    // within a third of a tile ahead, as trout and salmon leap a riffle; it never rests in the
    // shallows, where steering.js would put it back in the pool behind. Without this, fish
    // pressed against one lip for years and the ones behind piled up at it.
    const h0 = Math.atan2(dy, dx), ux = Math.cos(h0), uy = Math.sin(h0);
    let found = false;
    if (a.moveProgress?.stalled > 0.5) for (let t = step; !found && t <= Math.max(step, 0.35); t += 0.05) {
      if (swimDepth(w, a.x + ux * t, a.y + uy * t) >= need) { nx = a.x + ux * t; ny = a.y + uy * t; found = true; }
    }
    // (the side it went round last time first: trying left then right afresh each step, a fish
    // along a lip went left one step and right the next, its heading flipping half round a frame)
    const side = a.detour || 1;
    for (let k = 0; !found && k < 6; k++) {
      const s = k & 1 ? -side : side, turn = (k >> 1) * 0.5 + 0.5, x = a.x + Math.cos(h0 + s * turn) * step, y = a.y + Math.sin(h0 + s * turn) * step;
      if (swims(x, y)) { nx = x; ny = y; found = true; a.detour = s; }
    }
    if (!found) { a.heading = was; return false; } // (no way round: it stays as it was, not nosing at the bank)
    facePoint(a, nx, ny); // (nose first round the bar: facing the target, it slid sideways along the bank)
  }
  TO.x = nx; TO.y = ny;
  return true;
}

// Ground walkers (and anything else that isn't swimming, flying or leaving): false when the step
// (nx, ny) can't be taken, after sliding along the open side.
function groundStep(game, a, nx, ny, dx, dy) {
  const w = game.world, x0 = Math.floor(a.x), y0 = Math.floor(a.y);
  // (an animal stranded where it can't stand, say in a pond, may still move about its own tile
  // and step out of it: otherwise every step lands in the same tile and it freezes there)
  // (and the migration swims the river at the crossing, walking in from beyond the map's edge)
  const crosser = !!game.catalog.animals[a.sp].crossing;
  const can = (xx, yy) => !w.inb(xx, yy) ? crosser && !w.inb(x0, y0) : passable(w, w.idx(xx, yy), a) || (crosser && w.terrain[w.idx(xx, yy)] === T.RIVER);
  const safe = (x, y) => {
    const xx = Math.floor(x), yy = Math.floor(y);
    return (can(xx, yy) || (xx === x0 && yy === y0)) && (xx === x0 || yy === y0 || can(xx, y0) && can(x0, yy));
  };
  if (!safe(nx, ny)) {
    // Tile offsets and spacing can turn an orthogonal route into a diagonal
    // corner cut. Slide along its open side; never step into the obstruction.
    if (Math.abs(dx) > 0.001 && safe(nx, a.y)) a.x = nx;
    else if (Math.abs(dy) > 0.001 && safe(a.x, ny)) a.y = ny;
    return false;
  }
  return true;
}
