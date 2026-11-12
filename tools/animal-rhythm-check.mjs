// node tools/animal-rhythm-check.mjs
// Species traits that gate everyday behaviour (data in js/data/animal-behavior.js):
// - plays: only the young of mammals that play-chase do (Cole saw a Pacific chorus frog "Playing").
// - nocturnal: bats (and flying squirrels) are out from sunset to before dawn as drawn, and in their
//   roosts by day (Cole saw a bat flying around in daylight). Counts bats drawn by day and by night.
import { forceSimRandom, forcedSimRandom } from '../js/sim/sim-random.js';
import assert from 'node:assert/strict';
import { register } from 'node:module';
register('./three-loader.mjs', import.meta.url);
import { Game } from '../js/game.js';
import { BIOME_LIST, mapCatalog } from '../js/biome.js';
import { DAYS_PER_YEAR, T } from '../js/config.js';
import { play } from '../js/sim/animal-life.js';
import { roostingNow } from '../js/data/animal-activity.js';
import { tr } from '../js/i18n.js';
import '../js/lang/es.js';
const THREE = await import('three');
const { Actors } = await import('../js/render3d/actors.js');
let checks = 0;
function check(name, fn) { fn(); checks++; console.log(`PASS ${name}`); }
const fixed = (v, fn) => { const r = forcedSimRandom(); forceSimRandom(() => v); try { return fn(); } finally { forceSimRandom(r); } };
function setup(map) {
  const g = new Game(); g.newGame(1987, 'free', 'standard', map);
  g.wildlife.agents = []; g.wildlife.flyovers = []; g.wildlife.passageWait = 1e6; g.wildlife.recount();
  const w = g.world;
  for (let y = 20; y < 40; y++) for (let x = 20; x < 50; x++) { const i = w.idx(x, y); w.terrain[i] = T.SOIL; w.struct[i] = -1; w.tree[i] = 0; w.feature[i] = 0; w.fire[i] = 0; }
  return g;
}
const spawnYoung = (g, key, x, y) => { const a = g.wildlife.spawn(g.catalog.animal[key], x, y, { silent: true }); Object.assign(a, { x: x + 0.5, y: y + 0.5, juvenile: true, age: 5, state: 'idle', wait: 99 }); return a; };

check('Only mammals play, and never the slow solitary ones; no amphibian, reptile, fish, bird or insect', () => {
  for (const b of BIOME_LIST) for (const d of mapCatalog(b.id).animals) {
    const plays = d.behavior.plays;
    if (d.group !== 'Mammals') assert.equal(plays, false, `${b.id}/${d.key} (${d.group}) must not play`);
    if (['sloth', 'armadillo', 'anteater', 'pangolin', 'bat'].includes(d.sprite.kind)) assert.equal(plays, false, `${b.id}/${d.key}`);
  }
  assert.equal(mapCatalog('pnw').animal.elk.behavior.plays, true);
});
check('Two young chorus frogs side by side never start a game of tag; two fawns do', () => {
  const g = setup('pnw'), wl = g.wildlife;
  const f = spawnYoung(g, 'treefrog', 30, 30); spawnYoung(g, 'treefrog', 31, 30);
  assert.equal(fixed(0, () => play(wl, f, g.catalog.animal.treefrog)), false);
  assert.notEqual(f.state, 'play');
  const d = spawnYoung(g, 'deer', 30, 34); spawnYoung(g, 'deer', 31, 34);
  assert.equal(fixed(0, () => play(wl, d, g.catalog.animal.deer)), true);
  assert.equal(d.state, 'play');
});
check('Bats (and flying squirrels) are the night animals, on every map that has them', () => {
  for (const b of BIOME_LIST) for (const d of mapCatalog(b.id).animals)
    assert.equal(d.behavior.nocturnal, d.sprite.kind === 'bat' || d.key === 'flyingsquirrel', `${b.id}/${d.key}`);
});
check('No bat is drawn by day; they come out one by one at dusk and all are out at night', () => {
  for (const map of ['pnw', 'atlanta', 'chinandega', 'sumatra']) {
    const g = setup(map), bat = g.catalog.animals.find(d => d.sprite.kind === 'bat');
    const bats = [];
    for (let k = 0; k < 20; k++) { const a = g.wildlife.spawn(bat, 25 + k, 30, { silent: true }); Object.assign(a, { x: 25.5 + k, y: 30.5, state: 'fly', flying: true, alt: 1, tx: 25.5 + k, ty: 31 }); bats.push(a); }
    const robin = g.catalog.animals.find(d => d.group === 'Birds');
    const bird = g.wildlife.spawn(robin, 22, 22, { silent: true });
    const actors = new Actors(new THREE.Scene());
    const drawn = (out, t) => { actors.nightOut = out; actors.update(g, new THREE.Vector3(1, 0, 0), t); return bats.filter(a => actors.pose.get(a.id)).length; };
    assert.equal(drawn(0, 1), 0, `${map}: bats drawn at midday`);
    assert.ok(actors.pose.get(bird.id), `${map}: day animals still drawn`);
    const dusk = drawn(0.5, 2);
    assert.ok(dusk > 0 && dusk < bats.length, `${map}: some out at dusk, not all (${dusk}/${bats.length})`);
    assert.equal(drawn(1, 3), bats.length, `${map}: all out at night`);
    assert.equal(drawn(undefined, 4), bats.length, 'with no drawn clock (the day cycle off) bats fly as before');
    assert.equal(roostingNow(bats[0], bat, 0), true);
    assert.notEqual(tr('Roosting until dusk', 'es'), 'Roosting until dusk');
  }
});
console.log(`${checks} rhythm checks passed.`);
