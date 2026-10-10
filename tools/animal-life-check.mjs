// node tools/animal-life-check.mjs
// Everyday behaviour from js/sim/animal-life.js: rutting stags fight a bout head to head,
// animals get clear of a fire, and reef fish swim nose-first.
import assert from 'node:assert/strict';
import { Game } from '../js/game.js';
import { T } from '../js/config.js';
import { ANIMAL, ANIMALS, isMaleVariant } from '../js/data/animals.js';
import { greet } from '../js/sim/animal-life.js';
import { passable } from '../js/sim/animals.js';

const g = new Game();
let checks = 0;
function check(name, fn) { fn(); checks++; console.log(`PASS ${name}`); }
function reset(map = 'pnw') {
  g.newGame(1987, 'free', 'standard', map);
  g.wildlife.agents = []; g.wildlife.recount();
  const w = g.world;
  for (let y = 15; y < 50; y++) for (let x = 20; x < 70; x++) {
    const i = w.idx(x, y); w.terrain[i] = T.SOIL; w.struct[i] = -1; w.feature[i] = 0; w.tree[i] = 0; w.fire[i] = 0;
  }
}
function males(key, n) {
  const out = [];
  for (let k = 0; out.length < n && k < 200; k++) {
    const a = g.wildlife.spawn(ANIMAL[key], 40, 30, { silent: true });
    if (isMaleVariant(ANIMAL[key], a)) out.push(a); else g.wildlife.remove(a);
  }
  return out;
}
// Math.random returns these values in turn (the last one repeats)
const rigged = (fn, ...values) => { const r = Math.random; let k = 0; Math.random = () => values.length ? values[Math.min(k++, values.length - 1)] : 0; try { return fn(); } finally { Math.random = r; } };

check('Rutting bull elk square up head to head, hold the stance, and the loser gives ground', () => {
  reset(); while (g.month !== 7) g.day++;
  const [a, b] = males('elk', 2), wl = g.wildlife;
  a.x = 39.5; a.y = 30.5; b.x = 40.8; b.y = 30.7; a.wait = b.wait = 99;
  assert.equal(rigged(() => greet(wl, a, ANIMAL.elk)), true);
  assert.equal(a.state, 'spar'); assert.equal(b.state, 'spar'); assert.equal(a.sparWith, b.id);
  const loser = a.sparLoser === a.id ? a : b, winner = loser === a ? b : a;
  let settled = null;
  for (let s = 0; s < 200 && a.state === 'spar'; s++) {
    wl.update(0.05);
    if (a.state === 'spar' && Math.hypot(a.x - a.sparAt[0], a.y - a.sparAt[1]) < 0.02 && settled == null) settled = Math.hypot(a.x - b.x, a.y - b.y);
  }
  // about one body length apart, so heads and antlers meet rather than bodies overlapping
  assert.ok(settled > 0.9 && settled < 1.3, `stance ${settled}`);
  assert.notEqual(a.state, 'spar');
  assert.equal(loser.state, 'flee'); assert.notEqual(winner.state, 'flee');
});
check('Out of the rut, stags fight far less; does never fight', () => {
  reset(); while (g.month !== 2) g.day++;
  const wl = g.wildlife, [a, b] = males('deer', 2);
  a.x = 39.5; a.y = 30.5; b.x = 40.7; b.y = 30.6; a.wait = b.wait = 99;
  rigged(() => greet(wl, a, ANIMAL.deer), 0, 0.5); // (it goes over to the other buck; out of season the odds of a fight are 25%)
  assert.notEqual(a.state, 'spar'); assert.ok(a.greetT > 0);
  reset(); while (g.month !== 7) g.day++;
  const does = [];
  for (let k = 0; does.length < 2 && k < 200; k++) { const d = wl.spawn(ANIMAL.deer, 40, 30, { silent: true }); if (!isMaleVariant(ANIMAL.deer, d)) does.push(d); else wl.remove(d); }
  does[0].x = 39.5; does[1].x = 40.6; does[0].y = does[1].y = 30.5; does[0].wait = does[1].wait = 99;
  rigged(() => greet(wl, does[0], ANIMAL.deer));
  assert.notEqual(does[0].state, 'spar');
});
check('In the rut bull elk gather harems, keep their cows close, and a winning rival takes them', () => {
  reset(); while (g.month !== 7) g.day++;
  const wl = g.wildlife, [b1, b2] = males('elk', 2), cows = [];
  for (let k = 0; cows.length < 6 && k < 200; k++) { const c = wl.spawn(ANIMAL.elk, 40, 30, { silent: true }); if (!isMaleVariant(ANIMAL.elk, c)) cows.push(c); else wl.remove(c); }
  b1.x = 40.5; b1.y = 30.5; b2.x = 52.5; b2.y = 30.5;
  cows.forEach((c, k) => { c.x = 37.5 + k; c.y = 33.5; });
  let fights = 0, spread = 0, n = 0;
  for (let s = 0; s < 1200 && g.month === 7; s++) {
    wl.update(0.05);
    if (s % 20 === 0) { const keep = g.day; wl.daily(); g.day = keep; }
    if (b1.state === 'spar' && b1.sparT > 0.4 && b1.sparT < 0.45) fights++;
    const owned = cows.filter(c => c.haremOf != null && wl.agents.includes(c));
    for (const c of owned) { const bull = wl.agents.find(o => o.id === c.haremOf); if (bull) { spread += Math.hypot(c.x - bull.x, c.y - bull.y); n++; } }
  }
  assert.ok(cows.some(c => c.haremOf === b1.id || c.haremOf === b2.id), 'cows joined a harem');
  assert.ok(n && spread / n < 4.5, `cows stay near their bull (${(spread / n).toFixed(2)})`);
  // a satellite that wins the bout takes the harem
  for (const c of cows) c.haremOf = b1.id;
  b1.x = 40.5; b2.x = 41.8; b1.y = b2.y = 30.5; b1.state = b2.state = 'idle'; b2.wait = 99;
  assert.equal(rigged(() => greet(wl, b1, ANIMAL.elk)), true); b1.sparLoser = b2.sparLoser = b1.id;
  for (let s = 0; s < 200 && b1.state === 'spar'; s++) wl.update(0.05);
  assert.ok(cows.every(c => c.haremOf === b2.id), 'harem passes to the winner');
  // after the rut, harems break up
  while (g.month === 7 || g.month === 8 || g.month === 6) g.day++;
  wl.daily();
  assert.ok(cows.every(c => c.haremOf == null));
});
check('Animals near a fire run clear of it without stepping onto burning ground', () => {
  for (const map of ['pnw', 'serengeti']) {
    reset(map); const wl = g.wildlife, w = g.world;
    const keys = ANIMALS.filter(d => !d.reef && d.move !== 'swim' && d.move !== 'tree').map(d => d.key).slice(0, 10);
    for (const k of keys) for (let n = 0; n < 2; n++) wl.spawn(ANIMAL[k], 48 + n, 32 + (n & 1), { silent: true });
    for (let y = 26; y < 40; y++) for (const x of [44, 45]) w.fire[w.idx(x, y)] = 3;
    const mean = () => wl.agents.reduce((s, a) => s + a.x, 0) / wl.agents.length, x0 = mean();
    for (let s = 0; s < 40; s++) {
      wl.update(0.05);
      for (const a of wl.agents) assert.equal(w.fire[w.idx(Math.floor(a.x), Math.floor(a.y))], 0, `${map}/${a.key} on fire`);
    }
    assert.ok(mean() > x0 + 2, `${map}: ${x0} -> ${mean()}`);
  }
});
check('Reef predators turn and swim nose-first at their prey', () => {
  g.newGame(1987, 'free', 'standard', 'reef'); g.wildlife.agents = []; g.wildlife.recount();
  const wl = g.wildlife, w = g.world;
  // open water with room for a straight run of seven tiles
  let sx = -1, sy = -1;
  for (let y = 10; y < w.h - 10 && sx < 0; y++) for (let x = 10; x < w.w - 20; x++) {
    let ok = true;
    for (let dy = -2; dy <= 2 && ok; dy++) for (let dx = -1; dx <= 8 && ok; dx++) ok = passable(w, w.idx(x + dx, y + dy), { move: 'ground', key: 'shark' });
    if (ok) { sx = x; sy = y; break; }
  }
  assert.ok(sx >= 0);
  const prey = wl.spawn(ANIMAL.tang, sx + 6, sy, { silent: true }), shark = wl.spawn(ANIMAL.shark, sx, sy, { silent: true });
  prey.wait = 99; shark.hd = Math.PI / 2; // (facing away, at right angles to its prey)
  shark.state = 'hunt'; shark.target = prey.id; shark.huntTime = 5;
  let sideways = 0, moved = 0;
  for (let s = 0; s < 60 && shark.state === 'hunt'; s++) {
    const x = shark.x, y = shark.y; wl.update(0.05);
    const d = Math.hypot(shark.x - x, shark.y - y); if (d < 1e-4) continue;
    let off = Math.abs(Math.atan2(shark.y - y, shark.x - x) - shark.hd) % (Math.PI * 2); if (off > Math.PI) off = Math.PI * 2 - off;
    moved += d; if (off > 0.6) sideways += d;
  }
  assert.ok(moved > 0.5 && sideways / moved < 0.05, `${sideways}/${moved}`);
});
console.log(`${checks} animal life checks passed.`);
