// Short, visible activities for resident birds. Population and breeding still
// use the existing habitat rules; nest visits do not manufacture extra births.
import { ANIMALS, preyFor } from '../data/animals.js';
import { F, isWater } from '../config.js';
import { biome } from '../biome.js';
import { canLand } from './animals.js';
import { bolt } from './animal-life.js';
import { facePoint } from './animal-positioning.js';

export const isBird = def => def?.move === 'fly' && (def.group === 'Birds' || def.group === 'Seabirds');
const groundFeeders = new Set(['robin', 'thrush', 'cardinal', 'goldfinch', 'bluebird', 'wren', 'weaver', 'roller', 'jay', 'urraca']);
const cavityKeys = new Set(['bluebird', 'chickadee', 'woodduck', 'barnowl', 'owl', 'woodpecker', 'macaw', 'lora', 'chocoyo', 'hornbill', 'toucan']);
export function birdProfile(def) {
  const kind = def.sprite.kind;
  return { ground: groundFeeders.has(def.key) || ['secretary', 'crane'].includes(kind) || kind === 'songbird' && !['sunbird', 'kingfisher', 'motmot', 'noddy'].includes(def.key),
    perch: !['heron', 'crane', 'duck', 'booby'].includes(kind),
    cavity: cavityKeys.has(def.key) || ['woodpecker', 'owl', 'macaw', 'hornbill', 'toucan'].includes(kind),
    social: ['songbird', 'macaw', 'duck', 'booby'].includes(kind), bath: kind !== 'hummer' && !biome.look.underwater };
}

function groundTile(w, i) {
  return !isWater(w.terrain[i]) && !w.fire[i] && w.struct[i] < 0 && !w.tree[i] && w.feature[i] !== F.SNAG;
}
function perchTile(w, i) {
  return !w.fire[i] && (w.tree[i] && w.treeG[i] > 0.55 || w.feature[i] === F.SNAG);
}
function nestTile(w, i, profile) {
  if (w.fire[i]) return false;
  if (profile.cavity) return w.feature[i] === F.NESTBOX || w.feature[i] === F.SNAG || w.tree[i] && w.treeG[i] > 0.85;
  if (biome.look.underwater) return w.tree[i] && w.treeG[i] > 0.55;
  return w.tree[i] && w.treeG[i] > 0.55 || w.shrub[i] && w.shrubG[i] > 0.6;
}
function bathValid(w, a, water) {
  if (!water || Math.hypot(a.x - water[0], a.y - water[1]) > 2.5) return false;
  const x = Math.floor(water[0]), y = Math.floor(water[1]);
  return w.inb(x, y) && isWater(w.terrain[w.idx(x, y)]) && w.struct[w.idx(x, y)] < 0 &&
    groundTile(w, w.idx(Math.floor(a.x), Math.floor(a.y)));
}
function nearby(wl, a, good, radius = 8) {
  const w = wl.game.world, x = Math.floor(a.x), y = Math.floor(a.y);
  let best = -1, score = Infinity;
  for (let dy = -radius; dy <= radius; dy++) for (let dx = -radius; dx <= radius; dx++) {
    if (!w.inb(x + dx, y + dy)) continue;
    const i = w.idx(x + dx, y + dy);
    if (!good(i)) continue;
    const s = dx * dx + dy * dy + Math.random() * 3;
    if (s < score) { score = s; best = i; }
  }
  return best;
}
function hold(a, kind, t = 1.5 + Math.random() * 2, water = null) {
  a.state = 'bird'; a.bird = { kind, t, water }; a.birdGoal = null;
  a.flying = false; a.alt = 0; a.path = null; a.wait = t;
  a.birdGround = kind === 'forage' || kind === 'bathe';
  if (water) facePoint(a, ...water);
}
function flyTo(a, w, i, kind, x = i % w.w + 0.5, y = (i / w.w | 0) + 0.5, water = null) {
  a.bird = null; a.birdGround = false;
  a.birdGoal = { kind, i, water }; a.tx = x; a.ty = y;
  a.state = 'fly'; a.flying = true; a.path = null;
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
    if (p === a || p.leaving || p.state === 'feed' || !birdThreat(ANIMALS[p.sp], def, wl.game)) continue;
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
  const i = w.idx(x, y), profile = birdProfile(def), roll = Math.random();
  const suit = wl.suit[a.sp];
  // A breeding bird returns to a remembered suitable site. Removing the tree,
  // snag or nest box makes it choose another; the visit is a visible routine.
  if (def.breed?.includes(wl.game.month) && roll < 0.16) {
    if (a.nestSite == null || !nestTile(w, a.nestSite, profile))
      a.nestSite = nearby(wl, a, j => nestTile(w, j, profile) && suit[j] > 0.05);
    if (a.nestSite >= 0) {
      if (a.nestSite === i) hold(a, 'nest');
      else flyTo(a, w, a.nestSite, 'nest');
      return true;
    }
  }
  if (profile.bath && roll < 0.28) {
    const bank = wl.bankSpot(a);
    if (bank) {
      if (Math.hypot(a.x - bank.x, a.y - bank.y) > 0.09) flyTo(a, w, i, 'bathe', bank.x, bank.y, bank.water);
      else hold(a, 'bathe', 1.5 + Math.random() * 2, bank.water);
      return true;
    }
    const j = nearby(wl, a, j => w.distWater[j] === 1 && groundTile(w, j) && !!wl.bankSpot(a, j), 6);
    if (j >= 0) {
      const spot = wl.bankSpot(a, j); flyTo(a, w, j, 'bathe', spot.x, spot.y, spot.water); return true;
    }
  }
  if (profile.ground && roll < 0.68) {
    if (groundTile(w, i) && suit[i] > 0.03) {
      // Short hops between adjacent feeding spots, with a pecking pause at the end.
      const j = nearby(wl, a, j => j !== i && groundTile(w, j) && suit[j] > 0.03, 1);
      if (j >= 0 && Math.random() < 0.55 && wl.pathTo(a, k => k === j, 12, null, k => groundTile(w, k))) {
        a.flying = false; a.alt = 0; a.birdGround = true; a.birdGoal = { kind: 'forage', i: j }; return true;
      }
      hold(a, 'forage'); return true;
    }
    const j = nearby(wl, a, j => groundTile(w, j) && suit[j] > 0.05, 5);
    if (j >= 0) { flyTo(a, w, j, 'forage'); return true; }
  }
  if (profile.perch && roll < 0.9) {
    if (perchTile(w, i)) { hold(a, Math.random() < 0.4 ? 'preen' : 'perch', 2 + Math.random() * 4); return true; }
    const j = nearby(wl, a, j => perchTile(w, j) && suit[j] > 0.03);
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
  const w = wl.game.world, i = w.idx(Math.floor(a.x), Math.floor(a.y)), def = ANIMALS[a.sp];
  if (!w.inb(Math.floor(a.x), Math.floor(a.y)) || !canLand(w, i, def) || w.fire[i]) return;
  if (goal.kind === 'forage' && !groundTile(w, i) || goal.kind === 'perch' && !perchTile(w, i) ||
    goal.kind === 'nest' && !nestTile(w, i, birdProfile(def))) return;
  if (goal.kind === 'bathe' && !bathValid(w, a, goal.water)) return;
  hold(a, goal.kind, undefined, goal.water);
}
export function birdUpdate(wl, a, def, dt) {
  const w = wl.game.world, i = w.idx(Math.floor(a.x), Math.floor(a.y)), b = a.bird;
  if (!b) { a.state = 'idle'; a.wait = 0.5; return; }
  a.birdAlertCheck = (a.birdAlertCheck || 0) - dt;
  if (a.birdAlertCheck <= 0) { a.birdAlertCheck = 0.3; if (birdAlarm(wl, a, def)) return; }
  b.t -= dt;
  const invalid = w.fire[i] || (b.kind === 'perch' || b.kind === 'preen') && !perchTile(w, i) ||
    b.kind === 'forage' && !groundTile(w, i) || b.kind === 'nest' && !nestTile(w, i, birdProfile(def)) ||
    b.kind === 'bathe' && !bathValid(w, a, b.water);
  if (invalid || b.t <= 0) { a.bird = null; a.state = 'idle'; a.wait = invalid ? 0 : 0.3 + Math.random() * 0.5; }
}
