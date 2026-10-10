// Everyday wildlife behaviour on top of the population rules: predators prowl, stalk, rush and
// feed at a kill, prey keep watch and bolt, scavengers gather at carcasses, the young play, and
// neighbours greet or spar. All of it uses Math.random, never game.rng, and the catch roll still
// happens once, on contact, so catch odds, hunger and breeding are exactly as before.

import { clamp, DAYS_PER_YEAR } from '../config.js';
import { ANIMALS, ANIMAL, preyFor, isMaleVariant } from '../data/animals.js';
import { facePoint } from './animal-positioning.js';
import { passable, canLand } from './animals.js';

// How each kind of hunter closes in. approach, creep and sprint are multiples of its usual
// speed; it creeps once inside `near` tiles and rushes once inside `rush` tiles.
const STYLES = {
  stalk: { approach: 1, near: 5, creep: 0.6, rush: 3, sprint: 2.4 },      // cats slink in low, then pounce
  chase: { approach: 1.15, near: 0, creep: 1.15, rush: 4.5, sprint: 2.1 }, // dogs and hyenas trot in, then run it down
  ambush: { approach: 0.8, near: 3, creep: 0.5, rush: 1.5, sprint: 3.2 },  // snakes, crocodiles and monitors inch closer, then strike
  stoop: { approach: 1.2, near: 0, creep: 1, rush: 2.2, sprint: 2.8, circle: true }, // raptors and fishing birds circle, then dive
  pursue: { approach: 1, near: 0, creep: 1, rush: 2.5, sprint: 1.9 },      // otters, bears and the rest
};
const KIND_STYLE = { feline: 'stalk', canine: 'chase', hyena: 'chase', snake: 'ambush', caiman: 'ambush', monitor: 'ambush' };
const CHEETAH = { ...STYLES.stalk, near: 8, rush: 5.5, sprint: 3.4 }; // a long, flat-out sprint from further away
export function huntStyle(def) {
  if (def.key === 'cheetah') return CHEETAH;
  if (def.move === 'fly') return STYLES.stoop;
  return STYLES[KIND_STYLE[def.sprite.kind]] || STYLES.pursue;
}

// Pack hunters bring their companions along on a hunt, and share the kill.
const PACK = new Set(['lion', 'hyena', 'coyote', 'giantotter']);
// Species that come in to a carcass someone else killed.
const SCAVENGERS = new Set(['vulture', 'hyena', 'coyote', 'monitor', 'eagle', 'raccoon', 'opossum', 'fox', 'coati']);
// Kinds whose rivals square up head to head (only males, where the species has a male look).
const SPARRERS = new Set(['deer', 'buffalo', 'zebra', 'impala', 'gazelle', 'giraffe', 'wildebeest', 'elephant', 'rhino', 'peccary', 'hippo']);

const byId = (wl, id) => id == null ? null : (wl.ids ? wl.ids.get(id) : wl.agents.find(o => o.id === id)) || null;
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const young = (a, def) => def.mature > 0 && a.age < def.mature * DAYS_PER_YEAR && !a.juvenile;
const ashore = def => !def.reef && (def.move === 'ground' || def.move === 'semi' || def.move === 'tree');

// Which species hunt each species on this map (Challenging adds a few, so it's rebuilt on a change).
function predatorsOf(wl, sp) {
  const eco = !!wl.game.diff.ecology;
  if (!wl.preds || wl.preds.eco !== eco || wl.preds.n !== ANIMALS.length) {
    const sets = ANIMALS.map(() => null);
    for (const d of ANIMALS) for (const k of preyFor(d, wl.game) || []) if (ANIMAL[k]) (sets[ANIMAL[k].index] ||= new Set()).add(d.index);
    wl.preds = { eco, n: ANIMALS.length, sets };
  }
  return wl.preds.sets[sp];
}

// ---------------------------------------------------------------- hunting
export function beginHunt(wl, a, def, b) {
  a.hunt = { phase: 'approach' };
  if (!PACK.has(def.key)) return;
  // the rest of the pride or pack nearby joins in, fanning out to either side
  let side = 1;
  for (const o of wl.agents) {
    if (o === a || o.sp !== a.sp || o.leaving || o.state !== 'idle' || young(o, def) || dist(o, a) > 7) continue;
    o.state = 'hunt'; o.target = b.id; o.huntTime = a.huntTime; o.path = null; o.assist = true;
    o.hunt = { phase: 'approach', flank: side * (1.1 + Math.random() * 0.8) };
    side = -side;
  }
}

export function endHunt(a) {
  a.hunt = null; a.assist = false; a.run = null; a.stoop = 0;
}

// One step of a hunt. Returns true when the hunter reaches its prey (the caller rolls the catch).
export function huntStep(wl, a, def, b, sp) {
  const S = huntStyle(def), H = a.hunt || (a.hunt = { phase: 'approach' });
  const d = dist(a, b);
  if (d * d < 0.25) return true;
  if (H.phase === 'approach' || H.phase === 'creep') {
    if (S.circle && d < S.rush + 1.4) { H.phase = 'circle'; H.t = 0.5 + Math.random() * 0.8; H.ang = Math.atan2(a.y - b.y, a.x - b.x); }
    else if (d < S.rush || (H.phase === 'creep' && a.huntTime < 0.3)) startRush(wl, a, def, b, S, d); // (or a stalk running long: now or never)
    else if (S.near && d < S.near && H.phase !== 'creep') {
      // a stalk takes the time it takes: the hunter doesn't give up halfway through one
      H.phase = 'creep';
      a.huntTime = Math.max(a.huntTime, (d - S.rush) / (def.speed * S.creep) + 2);
    }
  }
  if (H.phase === 'circle') {
    // wheel over the prey a couple of times, then fold and drop
    H.t -= dt(sp, def);
    H.ang += sp / 1.5;
    a.run = 1.1;
    if (H.t <= 0) startRush(wl, a, def, b, S, d);
    else { wl.stepToward(a, b.x + Math.cos(H.ang) * 1.5, b.y + Math.sin(H.ang) * 1.5, sp * 1.15); return false; }
  }
  let mul = H.phase === 'rush' ? S.sprint : H.phase === 'creep' ? S.creep : S.approach;
  if (H.phase === 'rush') {
    H.t -= dt(sp, def);
    if (S.circle) a.stoop = clamp(1 - d / Math.max(0.5, H.d0 || 2), 0, 1);
    if (H.t <= 0) return giveUp(wl, a, def);
  }
  a.run = mul;
  // pack members come in from the sides, then close
  let tx = b.x, ty = b.y;
  if (H.flank && H.phase !== 'rush' && d > 1.5) {
    const ux = (b.x - a.x) / d, uy = (b.y - a.y) / d;
    tx += -uy * H.flank; ty += ux * H.flank;
  }
  return (wl.stepToward(a, tx, ty, sp * mul) && tx === b.x) || (b.x - a.x) ** 2 + (b.y - a.y) ** 2 < 0.25;
}
// (sp is speed × dt, so the elapsed game time is sp / speed)
const dt = (sp, def) => sp / Math.max(0.01, def.speed);

function startRush(wl, a, def, b, S, d) {
  const H = a.hunt;
  H.phase = 'rush'; H.d0 = d;
  const sprint = def.speed * S.sprint;
  // long enough to close the gap on prey running at just over half its speed
  H.t = Math.max(1.2, d / (sprint * 0.45) * 1.6);
  a.huntTime = Math.max(a.huntTime, H.t + 0.5);
  if (!a.assist) alarm(wl, a, def, b, sprint, H.t);
}

// Out of breath: the rush failed. Stand and recover; the prey keeps running.
function giveUp(wl, a) {
  a.state = 'idle'; a.wait = 1.5 + Math.random() * 1.5;
  if (a.move === 'fly') a.flying = false;
  endHunt(a);
  return false;
}

// The rush is on: the target bolts a beat later (never quite fast enough to simply outrun the
// hunter, so contact and the catch roll still decide it), and anything nearby the hunter would
// also take scatters away from it.
function alarm(wl, pred, pdef, target, sprint, time) {
  const preySet = new Set((preyFor(pdef, wl.game) || []).map(k => ANIMAL[k]?.index));
  for (const o of wl.agents) {
    if (o === pred || o.leaving || o.state === 'hunt' || ANIMALS[o.sp].reef) continue;
    if (o.sp !== target.sp && !preySet.has(o.sp)) continue;
    if ((o.x - target.x) ** 2 + (o.y - target.y) ** 2 > 25) continue;
    const odef = ANIMALS[o.sp];
    if (o === target) {
      if (o.move !== 'fly' && !o.flying) bolt(wl, o, pred, Math.min(odef.speed * 1.9, sprint * 0.5), time + 0.6, 0.12 + Math.random() * 0.18);
    } else if (o.state !== 'flee') bolt(wl, o, pred, odef.speed * (1.6 + Math.random() * 0.4), 0.7 + Math.random() * 0.6, 0.05 + Math.random() * 0.25);
  }
}

// ---------------------------------------------------------------- after the hunt
// A catch: big prey leaves a carcass the hunter feeds at (and its pack and the scavengers come to);
// small prey is eaten on the spot.
export function startFeed(wl, a, def, b) {
  const bd = ANIMALS[b.sp], big = (bd.sprite.len || 0) >= 20 && bd.move !== 'swim' && bd.move !== 'fly';
  const w = wl.game.world, x = Math.floor(a.x), y = Math.floor(a.y);
  a.carcass = null;
  // (a bird that snatched a fish from open water eats it on the wing)
  if (a.move === 'fly' && w.inb(x, y) && !canLand(w, w.idx(x, y), def)) { a.state = 'idle'; a.wait = 0; a.flying = true; return; }
  a.state = 'feed'; a.feedAt = [b.x, b.y]; facePoint(a, b.x, b.y);
  a.flying = false;
  if (!big) { a.feedT = 0.5 + Math.random() * 0.8; return; }
  a.feedT = 1.5 + (bd.sprite.len || 20) / 30 * (1 + Math.random());
  const c = { id: b.id, sp: b.sp, x: b.x, y: b.y, yaw: b.orientation ?? 0, age: b.age, side: Math.random() < 0.5 ? -1 : 1,
    by: a.sp, t: a.feedT + 7 + Math.random() * 4 };
  c.max = c.t;
  wl.carcasses.push(c);
  if (wl.carcasses.length > 16) wl.carcasses.shift();
  a.carcass = c.id;
}

// Missed: the prey keeps running (Challenging already sent it toward cover).
export function missed(wl, prey, pred) {
  const def = ANIMALS[prey.sp];
  if (prey.state === 'walk') { prey.run = 1.8; prey.alertT = 0; return; }
  if (!prey.leaving && !def.reef && def.move !== 'swim') bolt(wl, prey, pred, def.speed * 1.8, 0.8 + Math.random() * 0.5, 0);
}

// ---------------------------------------------------------------- fleeing
export function bolt(wl, a, threat, speed, time, delay = 0) {
  const def = ANIMALS[a.sp], w = wl.game.world;
  if (a.leaving || def.reef) return;
  let fx = a.x - threat.x, fy = a.y - threat.y;
  const l = Math.hypot(fx, fy);
  if (l < 1e-3) { const r = Math.random() * Math.PI * 2; fx = Math.cos(r); fy = Math.sin(r); } else { fx /= l; fy /= l; }
  a.drinkT = 0; a.drinkAt = null; a.localGoal = null; a.bankGoal = null; a.follow = false;
  a.greet = null; a.goal = null; a.sparT = 0; a.greetT = 0; a.play = false;
  if (a.move === 'fly') {
    // birds just take off and settle again a little way off
    for (let k = 0; k < 6; k++) {
      const ang = Math.atan2(fy, fx) + (Math.random() - 0.5) * 1.4, r = 4 + Math.random() * 4;
      const x = clamp(a.x + Math.cos(ang) * r, 0.5, w.w - 0.5), y = clamp(a.y + Math.sin(ang) * r, 0.5, w.h - 0.5);
      if (k < 5 && !canLand(w, w.idx(Math.floor(x), Math.floor(y)), def)) continue;
      a.tx = x; a.ty = y; a.state = 'fly'; a.flying = true; a.path = null;
      return;
    }
    return;
  }
  a.state = 'flee'; a.path = null; a.threat = threat.id;
  a.fx = fx; a.fy = fy; a.fleeT = time; a.fleeSpeed = speed; a.fleeDelay = delay;
  a.fleeSide = Math.random() < 0.5 ? -1 : 1;
  a.run = speed / Math.max(0.01, def.speed);
}

const TURNS = [0, 0.45, -0.45, 0.9, -0.9, 1.4, -1.4, 2, -2];
export function fleeUpdate(wl, a, def, dt) {
  const th = byId(wl, a.threat), w = wl.game.world;
  if (a.fleeDelay > 0) {
    // the moment it notices: head up, staring at the danger
    a.fleeDelay -= dt;
    if (th && !a.play) { facePoint(a, th.x, th.y); a.alertT = 0.3; }
    return;
  }
  a.fleeT -= dt;
  if (th) {
    const dx = a.x - th.x, dy = a.y - th.y, l = Math.hypot(dx, dy);
    if (l > 1e-3 && l < 8) { a.fx = a.fx * 0.85 + dx / l * 0.15; a.fy = a.fy * 0.85 + dy / l * 0.15; }
    const n = Math.hypot(a.fx, a.fy) || 1; a.fx /= n; a.fy /= n;
  }
  const step = a.fleeSpeed * dt, base = Math.atan2(a.fy, a.fx);
  let moved = false;
  if (a.fleeT > 0) for (const off of TURNS) {
    const ang = base + off * a.fleeSide, c = Math.cos(ang), s = Math.sin(ang);
    const nx = a.x + c * step, ny = a.y + s * step, lx = a.x + c * Math.max(step, 0.45), ly = a.y + s * Math.max(step, 0.45);
    if (!w.inb(Math.floor(lx), Math.floor(ly)) || !w.inb(Math.floor(nx), Math.floor(ny))) continue;
    if (!passable(w, w.idx(Math.floor(lx), Math.floor(ly)), a) || !passable(w, w.idx(Math.floor(nx), Math.floor(ny)), a)) continue;
    a.x = nx; a.y = ny; facePoint(a, nx + c, ny + s);
    if (off) { a.fx = a.fx * 0.6 + c * 0.4; a.fy = a.fy * 0.6 + s * 0.4; }
    moved = true;
    break;
  }
  if (moved) return;
  // safe (or cornered): stop and look back
  a.state = 'idle'; a.run = null; a.fleeT = 0;
  a.wait = a.play ? 0.3 + Math.random() * 0.5 : 0.6 + Math.random();
  if (th && !a.play) { facePoint(a, th.x, th.y); a.alertT = 1.2 + Math.random(); }
  a.play = false; a.threat = null;
}

// ---------------------------------------------------------------- daily choices
// Prey keep an eye out: a predator close by makes them stop and stare, then drift away from it;
// one that's very close, or hunting, makes them bolt (and their companions go too).
export function watch(wl, a, def) {
  if (!ashore(def) || a.juvenile) return false;
  const preds = predatorsOf(wl, a.sp);
  if (!preds) return false;
  let p = null, bd = 36;
  for (const o of wl.agents) {
    if (!preds.has(o.sp) || o.leaving) continue;
    const d2 = (o.x - a.x) ** 2 + (o.y - a.y) ** 2;
    if (d2 < bd) { bd = d2; p = o; }
  }
  if (!p) return false;
  const d = Math.sqrt(bd), stalked = p.state === 'hunt' && p.target === a.id;
  // (a hunter's own target freezes: the hunt decides what happens next)
  if (!stalked && p.state !== 'feed' && (d < 3 || p.state === 'hunt')) {
    bolt(wl, a, p, def.speed * 1.7, 0.6 + Math.random() * 0.5);
    for (const o of wl.agents) if (o !== a && o.sp === a.sp && o.state !== 'flee' && !o.leaving && dist(o, a) < 4) bolt(wl, o, p, ANIMALS[o.sp].speed * 1.7, 0.5 + Math.random() * 0.5, 0.05 + Math.random() * 0.2);
    return true;
  }
  if (stalked || !(a.alertUntil > a.age)) {
    a.alertT = 1.2 + Math.random() * 1.5; a.wait = a.alertT; facePoint(a, p.x, p.y);
    a.alertUntil = a.age + 4;
    return true;
  }
  const far = (d + 4) ** 2;
  return wl.pathTo(a, (j, x, y) => (x + 0.5 - p.x) ** 2 + (y + 0.5 - p.y) ** 2 > far, 500);
}

// Predators that have just eaten lie up for a while; hungry ones go looking for prey.
export function prowl(wl, a, def) {
  const diet = preyFor(def, wl.game);
  if (!diet || def.reef || a.juvenile) return false;
  if (a.hunger < 3 && Math.random() < 0.45) { a.wait = 2 + Math.random() * 3; return true; }
  if (a.hunger < 5 || Math.random() < 0.5) return false;
  const preySet = new Set(diet.map(k => ANIMAL[k]?.index));
  let b = null, bd = 24 * 24;
  for (const o of wl.agents) {
    if (!preySet.has(o.sp) || o.leaving) continue;
    const d2 = (o.x - a.x) ** 2 + (o.y - a.y) ** 2;
    if (d2 < bd) { bd = d2; b = o; }
  }
  if (!b || bd < 64) return false;
  if (a.move === 'fly') {
    const ang = Math.random() * Math.PI * 2;
    a.tx = b.x + Math.cos(ang) * 4; a.ty = b.y + Math.sin(ang) * 4; a.state = 'fly'; a.flying = true;
    return true;
  }
  return wl.pathTo(a, (j, x, y) => (x + 0.5 - b.x) ** 2 + (y + 0.5 - b.y) ** 2 < 36, 2500, (x, y) => Math.hypot(x + 0.5 - b.x, y + 0.5 - b.y));
}

// Scavengers (and the hunter's pack) come to a carcass and feed.
export function scavenge(wl, a, def) {
  if (!wl.carcasses.length || a.juvenile) return false;
  const scav = SCAVENGERS.has(def.key);
  let c = null, bd = Infinity;
  for (const k of wl.carcasses) {
    if (!scav && k.by !== a.sp) continue;
    const r = scav ? (def.move === 'fly' ? 40 : 22) : 10, d = Math.hypot(k.x - a.x, k.y - a.y);
    if (d < r && d < bd && k.t > 1) { bd = d; c = k; }
  }
  if (!c || Math.random() > 0.75) return false;
  if (wl.agents.filter(o => o.state === 'feed' && o.carcass === c.id).length >= 5) return false;
  if (bd < 1.4) { feedAt(a, c); return true; }
  a.goal = { carcass: c.id };
  if (a.move === 'fly') {
    const ang = Math.random() * Math.PI * 2, r = 0.6 + Math.random() * 0.5;
    a.tx = c.x + Math.cos(ang) * r; a.ty = c.y + Math.sin(ang) * r; a.state = 'fly'; a.flying = true;
    return true;
  }
  if (wl.pathTo(a, (j, x, y) => Math.hypot(x + 0.5 - c.x, y + 0.5 - c.y) < 1.2, 3000, (x, y) => Math.hypot(x + 0.5 - c.x, y + 0.5 - c.y))) return true;
  a.goal = null;
  return false;
}
function feedAt(a, c) {
  a.state = 'feed'; a.feedT = 1 + Math.random() * 1.5; a.feedAt = [c.x, c.y]; a.carcass = c.id;
  a.flying = false; a.path = null;
  facePoint(a, c.x, c.y);
}

// Young of the same kind chase each other about, taking turns.
export function play(wl, a, def) {
  if (!ashore(def) || !young(a, def) || Math.random() > 0.3) return false;
  let o = null, bd = 25;
  for (const b of wl.agents) {
    if (b === a || b.sp !== a.sp || b.leaving || !young(b, def) || (b.state !== 'idle' && b.state !== 'walk')) continue;
    const d2 = (b.x - a.x) ** 2 + (b.y - a.y) ** 2;
    if (d2 < bd) { bd = d2; o = b; }
  }
  if (!o) return false;
  chase(wl, a, o, 0);
  return true;
}
function chase(wl, a, o, n) {
  a.state = 'play'; a.target = o.id; a.playT = 0.5 + Math.random() * 0.6; a.playN = n; a.run = 1.7; a.path = null;
  bolt(wl, o, a, ANIMALS[o.sp].speed * 1.5, a.playT + 0.3, 0.05);
  if (o.state === 'flee') o.play = true;
  facePoint(a, o.x, o.y);
}
export function playUpdate(wl, a, def, sp) {
  const o = byId(wl, a.target), w = wl.game.world;
  a.playT -= dt(sp, def);
  if (o && !o.leaving) {
    const nx = a.x + Math.sign(o.x - a.x) * 0.3, ny = a.y + Math.sign(o.y - a.y) * 0.3;
    const ok = w.inb(Math.floor(nx), Math.floor(ny)) && passable(w, w.idx(Math.floor(nx), Math.floor(ny)), a);
    const caught = dist(a, o) < 0.45 || (ok && wl.stepToward(a, o.x, o.y, sp * 1.7));
    if (ok && !caught && a.playT > 0) return;
    // tag: the other one turns and gives chase
    if (ok && a.playN < 3 && o.state === 'flee' && o.play) { o.fleeT = 0; o.play = false; a.state = 'idle'; chase(wl, o, a, a.playN + 1); a.play = true; return; }
    if (o.state === 'flee' && o.play) o.fleeT = 0;
  }
  a.state = 'idle'; a.wait = 0.5 + Math.random(); a.run = null; a.target = null;
}

// Now and then an adult goes over to another of its kind: they touch noses, or two rivals
// square up and spar for a while.
export function greet(wl, a, def) {
  if (!ashore(def) || young(a, def) || Math.random() > (def.herd ? 0.06 : 0.12)) return false;
  let o = null, bd = 49;
  for (const b of wl.agents) {
    if (b === a || b.sp !== a.sp || b.leaving || b.state !== 'idle' || young(b, def)) continue;
    const d2 = (b.x - a.x) ** 2 + (b.y - a.y) ** 2;
    if (d2 < bd) { bd = d2; o = b; }
  }
  if (!o) return false;
  a.greet = o.id;
  if (bd < 1.7 * 1.7) { meet(wl, a); return true; }
  const ox = Math.floor(o.x), oy = Math.floor(o.y);
  if (wl.pathTo(a, (j, x, y) => Math.max(Math.abs(x - ox), Math.abs(y - oy)) <= 1, 400)) {
    o.wait = Math.max(o.wait, 1.5); // (it waits for the visitor)
    return true;
  }
  a.greet = null;
  return false;
}
function meet(wl, a) {
  const o = byId(wl, a.greet), def = ANIMALS[a.sp];
  a.greet = null;
  if (!o || o.leaving || o.state !== 'idle' || dist(a, o) > 2.2) return;
  const t = 1.5 + Math.random() * 2;
  facePoint(a, o.x, o.y); facePoint(o, a.x, a.y);
  a.wait = t; o.wait = Math.max(o.wait, t);
  const rivals = SPARRERS.has(def.sprite.kind) && (!def.sprite.male || (isMaleVariant(def, a) && isMaleVariant(def, o)));
  if (rivals && Math.random() < 0.6) { a.sparT = o.sparT = t; }
  else { a.greetT = o.greetT = t; }
}

// Arrived at the end of a walk or a flight with something in mind.
export function arrive(wl, a) {
  if (a.greet != null) meet(wl, a);
  if (a.goal?.carcass != null) {
    const c = wl.carcasses.find(k => k.id === a.goal.carcass);
    a.goal = null;
    if (c && Math.hypot(c.x - a.x, c.y - a.y) < 1.6) feedAt(a, c);
  }
}
