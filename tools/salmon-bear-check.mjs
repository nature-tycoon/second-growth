// Bears at the salmon run: the run arrives at the creek mouth, bears come to the bank and
// catch some of it, and a fed bear rests before fishing again. Run: node tools/salmon-bear-check.mjs
import assert from 'node:assert/strict';
import { Game } from '../js/game.js';
import { F, T } from '../js/config.js';
import { ANIMAL, ANIMALS } from '../js/data/animals.js';
import { mulberry32 } from '../js/rng.js';
let checks = 0;
function check(name, fn) { fn(); checks++; console.log(`PASS ${name}`); }
const SALMON = ANIMALS.find(d => d.special === 'salmon');
function run(seed) {
  Math.random = mulberry32(seed);
  const g = new Game(); g.newGame(1987, 'free', 'standard', 'pnw'); g.autosave = false; g.day = 70;
  const w = g.world, wl = g.wildlife;
  for (let i = 0; i < w.n; i++) if (w.feature[i] === F.CULVERT) w.feature[i] = 0;
  w.hydroDirty = true; g.refreshEnvironment();
  wl.agents = []; wl.recount();
  const map = wl.suit[SALMON.index]; // (a restored creek)
  for (let i = 0; i < w.n; i++) map[i] = w.terrain[i] === T.CREEK ? 1 : w.terrain[i] === T.RIVER ? 0.3 : 0;
  for (let k = 0; k < 8; k++) wl.immigrateSalmon(SALMON);
  const fish = wl.agents.filter(a => a.sp === SALMON.index);
  const atMouth = fish.filter(f => [[0, -1], [1, 0], [-1, 0]].some(([dx, dy]) => w.terrain[w.idx(Math.floor(f.x) + dx, Math.floor(f.y) + dy)] === T.CREEK)).length;
  wl.startSalmonRun();
  const bears = wl.agents.filter(a => a.sp === ANIMAL.bear.index), catches = new Map();
  const onPredation = g.onPredation.bind(g);
  g.onPredation = (a, f) => { catches.set(a.id, (catches.get(a.id) || 0) + 1); return onPredation(a, f); };
  for (let i = 0; i < 22 * 20; i++) wl.update(0.05);
  return { fish: fish.length, atMouth, bears: bears.length, catches };
}
check('Bears catch salmon at the run, but leave most of it to spawn', () => {
  let total = 0, runs = 0, fish = 0;
  for (const seed of [1, 2, 3, 4, 5, 6]) {
    const r = run(seed); runs++; fish += r.fish;
    assert.equal(r.bears, 2, 'bears come down for the run');
    assert.ok(r.atMouth >= r.fish / 2, `seed ${seed}: most salmon arrive at the creek mouth (${r.atMouth}/${r.fish})`);
    let caught = 0; for (const n of r.catches.values()) { caught += n; assert.ok(n <= 3, `a fed bear rests (${n} fish)`); }
    assert.ok(caught >= 1, `seed ${seed}: bears caught salmon`);
    total += caught;
  }
  assert.ok(total / fish < 0.6, `bears took ${total} of ${fish}`);
});
console.log(`${checks} salmon bear checks passed.`);
