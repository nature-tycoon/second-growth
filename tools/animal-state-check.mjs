// node tools/animal-state-check.mjs [days=120]
// Holds the animal state machine to its table, js/sim/animal-states.js (decision 0056):
//   1. every animal state the code writes or compares against is in the table (a typo fails here);
//   2. Wildlife.update's switch steps every listed state, or the table says what steps it instead;
//   3. an animal in an unlisted state goes back to idle rather than freezing;
//   4. a seeded run of every map only ever shows listed states, each stepped (no animal stuck).
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
globalThis.localStorage = { getItem() { return null; }, setItem() {}, removeItem() {} };
const { ANIMAL_STATES, FLYOVER_STATE, isAnimalState } = await import('../js/sim/animal-states.js');
const { Game } = await import('../js/game.js');
const { BIOME_LIST } = await import('../js/biome.js');
const { mulberry32 } = await import('../js/rng.js');

const root = fileURLToPath(new URL('../', import.meta.url));
const days = +(process.argv[2] || 120);
let checks = 0;
function check(name, fn) { fn(); checks++; console.log(`PASS ${name}`); }

// Objects whose `.state` is not an animal's: the audio context, the save status.
const NOT_ANIMAL = /(^|\.)(ctx|status|saveStatus)$/;
function scan() {
  const files = [];
  (function walk(d) { for (const f of readdirSync(d)) { const p = join(d, f); if (statSync(p).isDirectory()) walk(p); else if (p.endsWith('.js')) files.push(p); } })(join(root, 'js'));
  const seen = [];
  for (const f of files) {
    const src = readFileSync(f, 'utf8'), rel = f.slice(root.length);
    // x.state === 'v' | 'v' === x.state | x.state = <expression with 'v'> | ['v', ...].includes(x.state)
    for (const m of src.matchAll(/([\w$.?]+)\.state\s*(?:===?|!==?)\s*'([\w-]+)'|'([\w-]+)'\s*(?:===?|!==?)\s*([\w$.?]+)\.state|([\w$.?]+)\.state\s*=(?!=)([^;\n]*)|\[([^\]]*)\]\.includes\(([\w$.?]+)\.state\)/g)) {
      const obj = m[1] ?? m[4] ?? m[5] ?? m[8];
      if (NOT_ANIMAL.test(obj) || obj === 'this') continue;
      const values = m[2] ? [m[2]] : m[3] ? [m[3]] : [...(m[6] ?? m[7]).matchAll(/'([\w-]+)'/g)].map(x => x[1]);
      const line = src.slice(0, m.index).split('\n').length;
      for (const v of values) seen.push({ v, at: `${rel}:${line}` });
    }
  }
  return seen;
}

check('every state the code names is in animal-states.js', () => {
  const seen = scan();
  assert.ok(seen.length > 100, `the scan found only ${seen.length} uses: has the code's style changed?`);
  const unknown = seen.filter(s => !isAnimalState(s.v) && s.v !== FLYOVER_STATE);
  assert.deepEqual(unknown.map(s => `${s.v} at ${s.at}`), [], 'add the state to ANIMAL_STATES, or fix the typo');
  const used = new Set(seen.map(s => s.v));
  const unused = Object.keys(ANIMAL_STATES).filter(s => !used.has(s));
  assert.deepEqual(unused, [], 'a listed state no code uses: remove it from ANIMAL_STATES');
});

check("Wildlife.update steps every listed state, or the table names what does", () => {
  const src = readFileSync(join(root, 'js/sim/animals.js'), 'utf8');
  const body = src.slice(src.indexOf('switch (a.state)'), src.indexOf('recordTrailStep(this, a, def, trailX, trailY)'));
  const cases = new Set([...body.matchAll(/case '([\w-]+)':/g)].map(m => m[1]));
  assert.ok(/default:/.test(body), 'the switch lost its default (unknown state back to idle)');
  for (const s of cases) assert.ok(isAnimalState(s), `case '${s}' is not in ANIMAL_STATES`);
  for (const [s, info] of Object.entries(ANIMAL_STATES)) {
    assert.ok(info.means && info.step && Array.isArray(info.fields), `${s}: means, step and fields`);
    if (!cases.has(s)) assert.ok(!/^Wildlife\.update$/.test(info.step), `${s} says Wildlife.update steps it, but the switch has no case for it`);
  }
});

function newGame(map, seed = 1987) {
  Math.random = mulberry32(seed);
  const g = new Game(); g.newGame(seed, undefined, undefined, map, seed);
  return g;
}

check('an animal in an unlisted state goes back to idle', () => {
  const g = newGame(BIOME_LIST[0].id);
  const a = g.wildlife.agents.find(b => b.state === 'idle' && !b.gate && !b.dormancy);
  assert.ok(a, 'an idle animal to test with');
  a.state = 'wander'; a.wait = 5; a.path = [1, 2, 3];
  for (let k = 0; k < 3 && a.state === 'wander'; k++) g.wildlife.update(0.1);
  assert.equal(a.state, 'idle'); assert.equal(a.path, null);
});

check(`every map, ${days} days: animals only ever in listed states`, () => {
  for (const b of BIOME_LIST) {
    const map = b.id, g = newGame(map), counts = {};
    for (let d = 0; d < days; d++) {
      g.dailyTick();
      for (let k = 0; k < 10; k++) g.wildlife.update(0.1);
      if (d % 5) continue;
      for (const a of g.wildlife.agents) {
        assert.ok(isAnimalState(a.state), `${map} day ${d}: ${g.catalog.animals[a.sp].key} #${a.id} in state '${a.state}'`);
        counts[a.state] = (counts[a.state] || 0) + 1;
      }
    }
    console.log(`  ${map}: ${Object.entries(counts).sort((x, y) => y[1] - x[1]).map(([s, n]) => `${s} ${n}`).join(', ')}`);
  }
});

console.log(`${checks} checks passed`);
