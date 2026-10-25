// node tools/ground-obstacles-check.mjs
// Trunks and logs on the ground (js/sim/ground-obstacles.js, decision 0022): walkers go round trunks
// even in a dense stand and never get stuck, elephants push through saplings and knock them back,
// small animals go round fallen logs while big ones step over, and fliers and monkeys are untouched.
import assert from 'node:assert/strict';
import { Game } from '../js/game.js';
import { mulberry32, hash2 } from '../js/rng.js';
import { T, F, DAYS_PER_YEAR } from '../js/config.js';
import { treeTrunk, groundWalker, LOG_R, LOG_HALF } from '../js/sim/ground-obstacles.js';

globalThis.localStorage ||= { getItem() { return null; }, setItem() {}, removeItem() {} };
let passed = 0;
const check = (name, fn) => { fn(); passed++; console.log('PASS ' + name); };
function setup(map = 'pnw') {
  Math.random = mulberry32(7); const g = new Game(); g.newGame(7, 'free', 'standard', map); g.day = 20;
  const w = g.world, wl = g.wildlife; wl.agents = []; wl.flyovers = []; wl.recount(); wl.passageWait = 1e6;
  w.terrain.fill(T.SOIL); w.struct.fill(-1); w.feature.fill(0); w.fire.fill(0); w.flood.fill(0); w.tree.fill(0); w.shrub.fill(0); w.ground.fill(0); w.distWater.fill(99); wl.suit.forEach(s => s.fill(1));
  return { g, w, wl };
}
const plantId = (s, key) => +Object.entries(s.g.catalog.plants).find(([, p]) => p?.key === key)[0];
function forest(s, key, growth, x0 = 20, y0 = 24, x1 = 62, y1 = 46) {
  const id = plantId(s, key);
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) { const i = s.w.idx(x, y); s.w.tree[i] = id; s.w.treeG[i] = typeof growth === 'function' ? growth(x, y) : growth; }
}
function animal(s, key, x, y) {
  const d = s.g.catalog.animal[key], a = s.wl.spawn(d, Math.floor(x), Math.floor(y), { silent: true, age: 8 * DAYS_PER_YEAR });
  Object.assign(a, { x, y, state: 'idle', wait: 99, thirst: 0, hunger: 0, juvenile: false }); return a;
}
// Walk a to tile (tx, ty); returns the positions it passed through, or null if it never got there.
function walk(s, a, tx, ty, limit = 6000) {
  const dest = s.w.idx(tx, ty), track = [];
  assert.ok(s.wl.pathTo(a, j => j === dest, 30000), 'a route exists');
  for (let k = 0; k < limit && a.state === 'walk'; k++) { s.wl.update(0.05); track.push([a.x, a.y, a.squeeze > 0]); }
  return a.state === 'walk' ? null : track;
}
// How far inside the nearest drawn trunk a point is (positive: inside the wood).
function intoTrunk(w, x, y) {
  let worst = -Infinity;
  for (let yy = Math.floor(y) - 1; yy <= Math.floor(y) + 1; yy++) for (let xx = Math.floor(x) - 1; xx <= Math.floor(x) + 1; xx++) {
    const t = w.inb(xx, yy) && treeTrunk(w, xx, yy);
    if (t) worst = Math.max(worst, t[2] - Math.hypot(x - t[0], y - t[1]));
  }
  return worst;
}
const crossings = (s, track) => track.filter(([x, y, sq]) => !sq && intoTrunk(s.w, x, y) > 0).length;

check('Walkers of every size cross a dense mature conifer stand without passing through a trunk', () => {
  for (const key of ['vole', 'rabbit', 'deer', 'elk', 'bear']) {
    const s = setup(); forest(s, 'fir', 0.95);
    const a = animal(s, key, 18.5, 35.5), track = walk(s, a, 64, 35);
    assert.ok(track, `${key} reaches the far side`);
    const inside = crossings(s, track), squeezed = track.filter(p => p[2]).length;
    assert.equal(inside, 0, `${key} walked through a trunk on ${inside} steps`);
    assert.ok(squeezed / track.length < 0.15, `${key} squeezed through on ${squeezed} of ${track.length} steps`);
  }
});

check('Going round the trunks costs a walk little time over open ground', () => {
  const open = setup(), a = animal(open, 'deer', 18.5, 35.5), t0 = walk(open, a, 64, 35).length;
  const wood = setup(); forest(wood, 'fir', 0.95);
  const b = animal(wood, 'deer', 18.5, 35.5), t1 = walk(wood, b, 64, 35).length;
  assert.ok(t1 < t0 * 1.6, `${t1} steps through the forest vs ${t0} in the open`);
});

check('No one gets stuck: many walkers on random trips through a mixed broadleaf wood all arrive', () => {
  const s = setup(); forest(s, 'maple', (x, y) => 0.3 + 0.7 * hash2(x, y, 5), 10, 10, 70, 60);
  const keys = ['deer', 'elk', 'bear', 'cougar', 'rabbit', 'raccoon'];
  const rng = mulberry32(3);
  for (let n = 0; n < 24; n++) {
    const a = animal(s, keys[n % keys.length], 12.5 + rng() * 56, 12.5 + rng() * 46);
    const tx = 12 + Math.floor(rng() * 56), ty = 12 + Math.floor(rng() * 46);
    assert.ok(walk(s, a, tx, ty), `${a.key} from (${a.x.toFixed(1)}, ${a.y.toFixed(1)}) reaches (${tx}, ${ty})`);
    s.wl.remove(a, 'test');
  }
});

check('Hunters and fleeing prey (stepToward) also keep out of trunks', () => {
  const s = setup(); forest(s, 'cedar', 0.95);
  const a = animal(s, 'cougar', 22.5, 30.5);
  let inside = 0, k = 0;
  for (; k < 4000 && Math.hypot(a.x - 58.5, a.y - 40.5) > 0.3; k++) {
    s.wl.stepToward(a, 58.5, 40.5, 0.05);
    if (!(a.squeeze > 0) && intoTrunk(s.w, a.x, a.y) > 0) inside++;
  }
  assert.ok(k < 4000, 'arrives');
  assert.equal(inside, 0);
});

check('Elephants push through saplings, knocking them back, but go round mature trunks', () => {
  const s = setup('serengeti'); forest(s, 'umbrella', 0.25);
  const before = s.w.treeG.slice();
  const a = animal(s, 'elephant', 18.5, 35.5), t0 = walk(s, a, 64, 35);
  assert.ok(t0, 'reaches the far side of the thicket');
  let hit = 0;
  for (let i = 0; i < s.w.n; i++) if (before[i] && s.w.treeG[i] < before[i]) hit++;
  assert.ok(hit >= 10, `knocked back ${hit} saplings on the way`);
  const brushed = t0.filter(([x, y]) => intoTrunk(s.w, x, y) > -0.12).length; // (body against the stem)
  assert.ok(brushed > 20, `walks straight through the saplings rather than round them (${brushed} steps against a stem)`);
  // ...and a grown stand: round the trunks
  const m = setup('serengeti'); forest(m, 'balanites', 0.95);
  const b = animal(m, 'elephant', 18.5, 35.5), t1 = walk(m, b, 64, 35);
  assert.ok(t1, 'crosses a mature woodland');
  const inside = crossings(m, t1);
  assert.ok(inside <= t1.length * 0.02, `inside a mature trunk on ${inside} of ${t1.length} steps`);
});

check('Small animals go round fallen logs; deer step over them', () => {
  const into = (w, x, y) => {
    for (let yy = Math.floor(y) - 1; yy <= Math.floor(y) + 1; yy++) for (let xx = Math.floor(x) - 1; xx <= Math.floor(x) + 1; xx++) {
      if (!w.inb(xx, yy) || w.feature[w.idx(xx, yy)] !== F.LOG) continue;
      const rot = hash2(xx, yy, 13) * 6.28, hx = Math.cos(rot) * LOG_HALF, hy = -Math.sin(rot) * LOG_HALF, cx = xx + 0.5, cy = yy + 0.5;
      const t = Math.max(-1, Math.min(1, ((x - cx) * hx + (y - cy) * hy) / (hx * hx + hy * hy)));
      if (Math.hypot(x - cx - hx * t, y - cy - hy * t) < LOG_R) return true;
    }
    return false;
  };
  const logs = s => { for (let y = 26; y <= 44; y++) for (let x = 24; x <= 58; x++) if ((x + y) % 2 === 0) s.w.feature[s.w.idx(x, y)] = F.LOG; };
  const s = setup(); logs(s);
  const v = animal(s, 'vole', 20.5, 35.5), tv = walk(s, v, 62, 35);
  assert.ok(tv, 'the vole gets through the log field');
  const over = tv.filter(([x, y, sq]) => !sq && into(s.w, x, y)).length;
  assert.ok(over <= tv.length * 0.01, `vole on top of a log on ${over} of ${tv.length} steps`);
  const d = setup(); logs(d);
  const b = animal(d, 'deer', 20.5, 35.5), td = walk(d, b, 62, 35);
  assert.ok(td.some(([x, y]) => into(d.w, x, y)), 'the deer steps straight over logs');
});

check('Fliers, climbers and every primate ignore wood on the ground', () => {
  const pnw = setup(), sum = setup('sumatra');
  assert.equal(groundWalker(pnw.g.catalog.animal.robin, { move: 'fly' }), false);
  assert.equal(groundWalker(sum.g.catalog.animal.macaque, { move: 'ground' }), false, 'macaques walk on the ground but are left alone');
  assert.equal(groundWalker(sum.g.catalog.animal.orangutan, { move: 'tree' }), false);
  assert.equal(groundWalker(pnw.g.catalog.animal.deer, { move: 'ground' }), true);
});

console.log(`${passed} checks passed`);
