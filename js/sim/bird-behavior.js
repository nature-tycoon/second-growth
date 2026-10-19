// Short, visible activities for resident birds. Population and breeding still
// use the existing habitat rules; nest visits do not manufacture extra births.
import { preyFor } from '../data/animals.js';
import { F, clamp, isWater } from '../config.js';
import { activeCatalog } from '../data/catalog.js';
import { canLand } from './animal-terrain.js';
import { bolt } from './animal-life.js';
import { facePoint } from './animal-positioning.js';
import { travelSpeed } from './climb-pace.js';

export const isBird = def => def?.move === 'fly' && (def.group === 'Birds' || def.group === 'Seabirds');
const groundFeeders = new Set(['robin', 'thrush', 'cardinal', 'goldfinch', 'bluebird', 'wren', 'weaver', 'roller', 'jay', 'urraca']);
const cavityKeys = new Set(['bluebird', 'chickadee', 'woodduck', 'barnowl', 'owl', 'woodpecker', 'macaw', 'lora', 'chocoyo', 'hornbill', 'toucan']);
export function birdProfile(def, catalog = activeCatalog) {
  const kind = def.sprite.kind;
  return { ground: groundFeeders.has(def.key) || ['secretary', 'crane'].includes(kind) || kind === 'songbird' && !['sunbird', 'kingfisher', 'motmot', 'noddy'].includes(def.key),
    perch: !['heron', 'crane', 'duck', 'booby'].includes(kind),
    cavity: cavityKeys.has(def.key) || ['woodpecker', 'owl', 'macaw', 'hornbill', 'toucan'].includes(kind),
    social: ['songbird', 'macaw', 'duck', 'booby'].includes(kind), bath: kind !== 'hummer' && !catalog.definition.look.underwater };
}

function groundTile(w, i) {
  return !isWater(w.terrain[i]) && !w.fire[i] && w.struct[i] < 0 && !w.tree[i] && w.feature[i] !== F.SNAG;
}
// Ground feeders also work the forest floor under the trees (wrens and thrushes live there).
function forageTile(w, i) {
  return !isWater(w.terrain[i]) && !w.fire[i] && w.struct[i] < 0 && w.feature[i] !== F.SNAG;
}
function perchTile(w, i) {
  return !w.fire[i] && (w.tree[i] && w.treeG[i] > 0.55 || w.feature[i] === F.SNAG);
}
function nestTile(w, i, profile) {
  if (w.fire[i]) return false;
  if (profile.cavity) return w.feature[i] === F.NESTBOX || w.feature[i] === F.SNAG || w.tree[i] && w.treeG[i] > 0.85;
  if (w.catalog.definition.look.underwater) return w.tree[i] && w.treeG[i] > 0.55;
  return w.tree[i] && w.treeG[i] > 0.55 || w.shrub[i] && w.shrubG[i] > 0.6;
}
function bathValid(w, a, water) {
  if (!water || Math.hypot(a.x - water[0], a.y - water[1]) > 2.5) return false;
  const x = Math.floor(water[0]), y = Math.floor(water[1]);
  return w.inb(x, y) && isWater(w.terrain[w.idx(x, y)]) && w.struct[w.idx(x, y)] < 0 &&
    groundTile(w, w.idx(Math.floor(a.x), Math.floor(a.y)));
}
function nearby(wl, a, good, radius = 8, min = 0) {
  const w = wl.game.world, x = Math.floor(a.x), y = Math.floor(a.y);
  let best = -1, score = Infinity;
  for (let dy = -radius; dy <= radius; dy++) for (let dx = -radius; dx <= radius; dx++) {
    if (!w.inb(x + dx, y + dy) || dx * dx + dy * dy < min * min) continue;
    const i = w.idx(x + dx, y + dy);
    if (!good(i)) continue;
    const s = dx * dx + dy * dy + Math.random() * 3;
    if (s < score) { score = s; best = i; }
  }
  return best;
}
// Small songbirds, hummingbirds and woodpeckers never keep still for long, though even they
// settle in a tree for a while rather than flitting from crown to crown.
const BRISK = new Set(['songbird', 'hummer', 'woodpecker']);
const tileKey = a => Math.floor(a.y) * 1e4 + Math.floor(a.x);
const inTree = kind => kind === 'perch' || kind === 'preen';
function hold(wl, a, kind, t = inTree(kind) ? 5 + Math.random() * 7 : 1.5 + Math.random() * 2, water = null) {
  if (BRISK.has(wl.game.catalog.animals[a.sp].sprite.kind) && kind !== 'nest') t *= inTree(kind) ? 0.75 : 0.5;
  a.state = 'bird'; a.bird = { kind, t, water }; a.birdGoal = null;
  if (kind === 'perch' || kind === 'preen') a.perchedAt = tileKey(a);
  if (kind === 'forage') a.foragedAt = tileKey(a);
  a.flying = false; a.alt = 0; a.path = null; a.wait = t;
  a.birdGround = kind === 'forage' || kind === 'bathe';
  if (water) facePoint(a, ...water);
}
function flyTo(a, w, i, kind, x = i % w.w + 0.5, y = (i / w.w | 0) + 0.5, water = null) {
  a.bird = null; a.birdGround = false;
  a.birdGoal = { kind, i, water }; a.tx = x; a.ty = y;
  a.state = 'fly'; a.flying = true; a.path = null;
}

// Soaring raptors (def.soar) wheel over open ground on still wings, a few tiles across and high
// over the trees, with a few wingbeats now and then, before they go to a perch or break off to hunt.
function soar(wl, a, def) {
  const w = wl.game.world, suit = wl.suit[a.sp], r = 2.5 + Math.random() * 1.5;
  const j = nearby(wl, a, j => groundTile(w, j) && suit[j] > 0.03, 6);
  const cx = clamp(j >= 0 ? j % w.w + 0.5 : a.x, r + 1, w.w - r - 1), cy = clamp(j >= 0 ? (j / w.w | 0) + 0.5 : a.y, r + 1, w.h - r - 1);
  if (cx > w.w - r - 1 || cy > w.h - r - 1) return false; // (a map too small to circle in)
  a.state = 'bird'; a.birdGoal = null; a.birdGround = false; a.flying = true; a.path = null;
  a.bird = { kind: 'soar', t: 20 + Math.random() * 20, cx, cy, r, dir: Math.random() < 0.5 ? -1 : 1,
    ang: Math.atan2(a.y - cy, a.x - cx), ph: a.phase, beat: Math.random() * 6.3 };
  return true;
}
function soarStep(wl, a, def, b, dt) {
  const sp = travelSpeed(def) * dt * 0.8;
  b.ang += b.dir * sp / b.r;
  wl.stepToward(a, b.cx + Math.cos(b.ang) * b.r, b.cy + Math.sin(b.ang) * b.r, sp * 1.2);
  a.alt = Math.min(1.6, a.alt + dt * 0.6);
  // wings held out, with a short bout of flapping every so often (a.phase drives the wingbeat)
  const neutral = Math.round(b.ph * 1.6) / 1.6;
  if (Math.sin(b.t * 0.5 + b.beat) > 0.85) b.ph += dt * 6 * (def.sprite.beat ?? 1);
  else b.ph += (neutral - b.ph) * Math.min(1, dt * 5);
  a.phase = b.ph;
}

// ---------------------------------------------------------------- carrying a catch
// Raptors and owls (def.carries) take what they can lift to a perch: a moment mantled over it on
// the ground, then off in their talons. Prey too heavy to lift is eaten where it fell, and a fish
// too heavy to lift is dragged low across the water to the bank. The young of any prey are light
// enough to carry. a.prey is what is drawn in the talons (render3d/actors.js).
export const carrier = def => def.move === 'fly' && Array.isArray(def.carries);
export const liftable = (def, preyDef, prey) => !!prey.juvenile || def.carries.includes(preyDef.key);
const OWLS = new Set(['owl']);
function eatTime(def, preyDef) {
  // an owl swallows small prey whole; hawks, eagles and falcons pluck and tear it
  if (OWLS.has(def.sprite.kind) && (preyDef.sprite.len || preyDef.sprite.size || 10) <= 14) return 1.5 + Math.random() * 1.5;
  return 4 + Math.random() * 4 + (preyDef.sprite.len || preyDef.sprite.size || 10) / 4;
}
function eatHere(a, def, preyDef) {
  a.state = 'feed'; a.feedT = eatTime(def, preyDef); a.feedAt = [a.x, a.y]; a.carry = null;
  a.flying = false; a.path = null;
}
// Returns false when this catch is not one to carry (startFeed handles it as before).
export function carryCatch(wl, a, def, b) {
  if (!carrier(def)) return false;
  const w = wl.game.world, bd = wl.game.catalog.animals[b.sp];
  if (!w.inb(Math.floor(a.x), Math.floor(a.y))) return false;
  const i = w.idx(Math.floor(a.x), Math.floor(a.y)), wet = isWater(w.terrain[i]);
  a.prey = { id: b.id, sp: b.sp, age: b.age, juvenile: !!b.juvenile, fish: bd.move === 'swim' };
  a.carcass = null; a.feedAt = null;
  if (liftable(def, bd, b)) {
    const j = nearby(wl, a, j => perchTile(w, j), 10);
    if (j < 0 && !wet) { eatHere(a, def, bd); return true; }
    const k = j >= 0 ? j : nearby(wl, a, j => !isWater(w.terrain[j]) && canLand(w, j, def) && !w.fire[j], 12);
    if (k < 0) { a.prey = null; return false; }
    // mantle over a catch on open ground; a fish or a monkey in a crown is taken in one movement
    const mantle = !wet && !w.tree[i] && !a.prey.fish;
    a.carry = { phase: mantle ? 'mantle' : 'lift', t: mantle ? 0.6 + Math.random() * 0.6 : 0, i: k, tx: k % w.w + 0.5, ty: (k / w.w | 0) + 0.5, low: false, left: 20 };
  } else if (wet) {
    const k = nearby(wl, a, j => !isWater(w.terrain[j]) && canLand(w, j, def) && !w.fire[j], 12);
    if (k < 0) { a.prey = null; return false; }
    a.carry = { phase: 'lift', t: 0, i: k, tx: k % w.w + 0.5, ty: (k / w.w | 0) + 0.5, low: true, left: 20 };
  } else { eatHere(a, def, bd); return true; }
  a.state = 'carry'; a.path = null; a.bird = null; a.birdGoal = null;
  a.flying = a.carry.phase === 'lift';
  return true;
}
export function carryUpdate(wl, a, def, dt, sp) {
  const c = a.carry, w = wl.game.world, preyDef = a.prey && wl.game.catalog.animals[a.prey.sp];
  if (!c || !preyDef) { a.carry = null; a.prey = null; a.state = 'idle'; a.wait = 0.5; a.flying = false; return; }
  if (c.phase === 'mantle') {
    a.alt = Math.max(0, a.alt - dt * 3); a.flying = false;
    if ((c.t -= dt) <= 0) { c.phase = 'lift'; a.flying = true; }
    return;
  }
  // laden: lower and slower than usual; a fish too heavy to lift skims the water
  const top = c.low ? 0.08 : 0.6;
  a.alt = a.alt > top ? Math.max(top, a.alt - dt * 0.8) : Math.min(top, a.alt + dt * (c.low ? 1 : 1.5));
  c.left -= dt;
  if (wl.stepToward(a, c.tx, c.ty, sp * (c.low ? 0.4 : 0.75)) || c.left <= 0) {
    const i = w.inb(Math.floor(a.x), Math.floor(a.y)) ? w.idx(Math.floor(a.x), Math.floor(a.y)) : -1;
    if (i < 0 || !canLand(w, i, def) || w.fire[i]) {
      // the perch is gone (or it can't land here): make for the nearest other one, or let go
      const k = c.left > 0 ? nearby(wl, a, j => j !== c.i && (c.low ? !isWater(w.terrain[j]) : perchTile(w, j)) && canLand(w, j, def) && !w.fire[j], 10) : -1;
      if (k >= 0) { c.i = k; c.tx = k % w.w + 0.5; c.ty = (k / w.w | 0) + 0.5; return; }
      a.carry = null; a.prey = null; a.state = 'idle'; a.wait = 0; return;
    }
    if (perchTile(w, i)) a.perchedAt = tileKey(a);
    eatHere(a, def, preyDef);
  }
}

// Small birds also recognize nearby raptors, cats and snakes as threats, even
// where that interaction is not part of the map's modeled population food web.
function birdThreat(pred, def, game) {
  return preyFor(pred, game)?.includes(def.key) ||
    ['songbird', 'hummer', 'woodpecker'].includes(def.sprite.kind) &&
    ['raptor', 'owl', 'cat', 'snake', 'monitor'].includes(pred.sprite.kind);
}
// A flock lifts together when one notices a close predator. Pollinators and
// airborne passersby are not recruited.
export function birdAlarm(wl, a, def) {
  if (!isBird(def) || a.leaving || a.fromFire) return false;
  let threat = null, best = 16;
  for (const p of wl.agents) {
    if (p === a || p.leaving || p.state === 'feed' || !birdThreat(wl.game.catalog.animals[p.sp], def, wl.game)) continue;
    const d = (a.x - p.x) ** 2 + (a.y - p.y) ** 2;
    if (d < best) { best = d; threat = p; }
  }
  if (!threat) return false;
  for (const b of wl.agents) if (b.sp === a.sp && !b.leaving && !b.flying && b.state !== 'hunt' &&
    (b.x - a.x) ** 2 + (b.y - a.y) ** 2 < 16) {
    b.bird = null; b.birdGoal = null; b.birdGround = false;
    bolt(wl, b, threat, def.speed * 2, 1, 0, 5);
  }
  // The deciding bird can still be aloft just after landing.
  if (a.state !== 'fly') bolt(wl, a, threat, def.speed * 2, 1, 0, 5);
  return true;
}

export function birdChoose(wl, a, def) {
  if (!isBird(def) || a.leaving || a.fromFire) return false;
  if (birdAlarm(wl, a, def)) return true;
  // Hungry hunters and scavengers keep their existing feeding priorities.
  if ((preyFor(def, wl.game) || def.key === 'vulture') && a.hunger >= 3) return false;
  const w = wl.game.world, x = Math.floor(a.x), y = Math.floor(a.y);
  if (!w.inb(x, y)) return false;
  const i = w.idx(x, y), profile = birdProfile(def, wl.game.catalog), roll = Math.random();
  const suit = wl.suit[a.sp];
  if (def.soar && Math.random() < 0.35 && soar(wl, a, def)) return true;
  // A breeding bird returns to a remembered suitable site. Removing the tree,
  // snag or nest box makes it choose another; the visit is a visible routine.
  if (def.breed?.includes(wl.game.month) && roll < 0.16) {
    if (a.nestSite == null || !nestTile(w, a.nestSite, profile))
      a.nestSite = nearby(wl, a, j => nestTile(w, j, profile) && suit[j] > 0.05);
    if (a.nestSite >= 0) {
      if (a.nestSite === i) hold(wl, a, 'nest');
      else flyTo(a, w, a.nestSite, 'nest');
      return true;
    }
  }
  if (profile.bath && roll < 0.28) {
    const bank = wl.bankSpot(a);
    if (bank) {
      if (Math.hypot(a.x - bank.x, a.y - bank.y) > 0.09) flyTo(a, w, i, 'bathe', bank.x, bank.y, bank.water);
      else hold(wl, a, 'bathe', 1.5 + Math.random() * 2, bank.water);
      return true;
    }
    const j = nearby(wl, a, j => w.distWater[j] === 1 && groundTile(w, j) && !!wl.bankSpot(a, j), 6);
    if (j >= 0) {
      const spot = wl.bankSpot(a, j); flyTo(a, w, j, 'bathe', spot.x, spot.y, spot.water); return true;
    }
  }
  if (profile.ground && roll < 0.68) {
    if (forageTile(w, i) && suit[i] > 0.03) {
      // Short hops between adjacent feeding spots, with a pecking pause at the end.
      const j = nearby(wl, a, j => j !== i && forageTile(w, j) && suit[j] > 0.03, 1);
      // (one pecking pause per spot, then on to the next)
      if (j >= 0 && (a.foragedAt === tileKey(a) || Math.random() < 0.55) && wl.pathTo(a, k => k === j, 12, null, k => forageTile(w, k))) {
        a.flying = false; a.alt = 0; a.birdGround = true; a.birdGoal = { kind: 'forage', i: j }; return true;
      }
      if (a.foragedAt !== tileKey(a)) { hold(wl, a, 'forage'); return true; }
    }
    const j = nearby(wl, a, j => j !== i && forageTile(w, j) && suit[j] > 0.05, 5, 2);
    if (j >= 0) { flyTo(a, w, j, 'forage'); return true; }
  }
  if (profile.perch && roll < 0.9) {
    // A spell or two in a tree, then on to another a few trees away, not the next trunk over.
    if (perchTile(w, i) && (a.perchedAt !== tileKey(a) || Math.random() < 0.5)) { hold(wl, a, Math.random() < 0.4 ? 'preen' : 'perch'); return true; }
    const j = nearby(wl, a, j => j !== i && perchTile(w, j) && suit[j] > 0.03, 8, 3);
    if (j >= 0) { flyTo(a, w, j, 'perch'); return true; }
  }
  if (profile.social && roll >= 0.9) {
    const j = nearby(wl, a, j => j !== i && !w.fire[j] && canLand(w, j, def) && suit[j] > 0.08, 6);
    if (j >= 0) {
      let n = 0;
      for (const b of wl.agents) if (b.sp === a.sp && !b.leaving && (b.state === 'idle' || b.state === 'bird') &&
        (b.x - a.x) ** 2 + (b.y - a.y) ** 2 < 16 && n++ < 6) {
        flyTo(b, w, j, profile.perch && perchTile(w, j) ? 'perch' : 'rest', j % w.w + 0.25 + Math.random() * 0.5, (j / w.w | 0) + 0.25 + Math.random() * 0.5);
      }
      return a.state === 'fly';
    }
  }
  return false;
}

export function birdArrive(wl, a) {
  const goal = a.birdGoal;
  if (!goal) return;
  a.birdGoal = null;
  const w = wl.game.world, i = w.idx(Math.floor(a.x), Math.floor(a.y)), def = wl.game.catalog.animals[a.sp];
  if (!w.inb(Math.floor(a.x), Math.floor(a.y)) || !canLand(w, i, def) || w.fire[i]) return;
  if (goal.kind === 'forage' && !forageTile(w, i) || goal.kind === 'perch' && !perchTile(w, i) ||
    goal.kind === 'nest' && !nestTile(w, i, birdProfile(def, wl.game.catalog))) return;
  if (goal.kind === 'bathe' && !bathValid(w, a, goal.water)) return;
  hold(wl, a, goal.kind, undefined, goal.water);
}
export function birdUpdate(wl, a, def, dt) {
  const w = wl.game.world, i = w.idx(Math.floor(a.x), Math.floor(a.y)), b = a.bird;
  if (!b) { a.state = 'idle'; a.wait = 0.5; return; }
  a.birdAlertCheck = (a.birdAlertCheck || 0) - dt;
  if (a.birdAlertCheck <= 0) { a.birdAlertCheck = 0.3; if (birdAlarm(wl, a, def)) return; }
  b.t -= dt;
  if (b.kind === 'soar') {
    // (a hungry hawk breaks off to hunt: prowl picks up the search from up here)
    if (w.fire[i] || b.t <= 0 || a.hunger >= 3 && preyFor(def, wl.game)) { a.bird = null; a.state = 'idle'; a.wait = 0; }
    else soarStep(wl, a, def, b, dt);
    return;
  }
  const invalid = w.fire[i] || (b.kind === 'perch' || b.kind === 'preen') && !perchTile(w, i) ||
    b.kind === 'forage' && !forageTile(w, i) || b.kind === 'nest' && !nestTile(w, i, birdProfile(def, wl.game.catalog)) ||
    b.kind === 'bathe' && !bathValid(w, a, b.water);
  if (invalid || b.t <= 0) { a.bird = null; a.state = 'idle'; a.wait = invalid ? 0 : 0.3 + Math.random() * 0.5; }
}
