// Savanna grass recovery (docs/decisions/0036-savanna-grass-recovery.md): the pioneer legumes fade
// on recovered soil but the pioneers hold crusted hardpan; grazers spread grass seed in their dung on
// the Serengeti and draw no random numbers on maps without it; a grass fire root-kills lantana
// standing in grass but not inside a bare thicket; groundcover burns by its own fuel.
//   node tools/savanna-grass-check.mjs
// The 200-year picture: node tools/succession-check.mjs --map serengeti --mode idle --years 200 --veg --seeds 1,2
// and tools/savanna-sward-probe.mjs for the meadow's species.
import assert from 'node:assert/strict';
globalThis.localStorage = { getItem() { return null; }, setItem() {}, removeItem() {} };
let lcg = 5;
Math.random = () => ((lcg = (lcg * 1103515245 + 12345) % 2147483648) / 2147483648);
const { Game } = await import('../js/game.js');
const { plantSuit } = await import('../js/sim/plants.js');
const { grazeDay } = await import('../js/sim/grazing.js');
const { T } = await import('../js/config.js');

let checks = 0;
function check(name, fn) { fn(); checks++; console.log('PASS ' + name); }
const game = map => { const g = new Game(); g.newGame(1987, 'free', 'standard', map, 77); return g; };
// a clear, sunny, dry tile with nothing on it
function clear(w, i, terrain = T.SOIL) {
  w.terrain[i] = terrain; w.flood[i] = 0; w.struct[i] = -1; w.moist[i] = 0.3; w.canopy[i] = 0;
  w.tree[i] = 0; w.treeG[i] = 0; w.shrub[i] = 0; w.shrubG[i] = 0; w.ground[i] = 0; w.groundG[i] = 0; w.feature[i] = 0;
}

check('Pioneer legumes fade on recovered soil, below the perennial grasses, but hold crusted hardpan', () => {
  const g = game('serengeti'), w = g.world, P = g.catalog.plant, i = w.idx(40, 40);
  clear(w, i); w.soil[i] = 0.9;
  const rich = k => plantSuit(w, i, P[k]);
  for (const legume of ['crotalaria', 'indigofera', 'sporobolus'])
    for (const grass of ['redoat', 'finger']) assert.ok(rich(grass) > rich(legume) + 0.2, `${grass} ${rich(grass).toFixed(2)} over ${legume} ${rich(legume).toFixed(2)} on rich soil`);
  w.soil[i] = 0.1;
  assert.ok(rich('crotalaria') >= 0.9, `rattlepod on poor soil: ${rich('crotalaria').toFixed(2)}`);
  // on the crust nothing else roots, so the pioneers keep their footing however rich the soil
  w.terrain[i] = T.GRAVEL; w.soil[i] = 0.9;
  for (const k of ['crotalaria', 'indigofera', 'sporobolus']) assert.ok(rich(k) >= 0.5, `${k} on crusted hardpan: ${rich(k).toFixed(2)}`);
  assert.ok(rich('redoat') < 0.3, 'red oat grass still cannot root in the crust');
});

check('Grazers drop grass seed on bare ground on the Serengeti; on other maps no random number is drawn', () => {
  const g = game('serengeti'), w = g.world, P = g.catalog.plant, def = g.catalog.animal.wildebeest;
  const x0 = 60, y0 = 40, R = 4;
  for (let y = y0 - R; y <= y0 + R; y++) for (let x = x0 - R; x <= x0 + R; x++) {
    const i = w.idx(x, y); clear(w, i); w.soil[i] = 0.6;
    if ((x + y) % 2) { w.ground[i] = P.finger.id; w.groundG[i] = 0.9; } // grass to eat, bare soil to land on
  }
  const suit = g.wildlife.suit[def.index];
  for (let y = y0 - R; y <= y0 + R; y++) for (let x = x0 - R; x <= x0 + R; x++) { const i = w.idx(x, y); suit[i] = 1; w.graze[i] = w.ground[i] ? 0.9 : 0.1; }
  g.day = 0; // March, the long rains: seed in spread
  assert.ok(g.catalog.definition.climate.spread[g.month] > 0.5);
  const bare = () => { let n = 0; for (let y = y0 - R; y <= y0 + R; y++) for (let x = x0 - R; x <= x0 + R; x++) if (!w.ground[w.idx(x, y)]) n++; return n; };
  const before = bare();
  for (let d = 0; d < 400; d++) grazeDay(g, def, x0, y0);
  assert.ok(before - bare() >= 3, `grass took on ${before - bare()} of ${before} bare tiles from dung`);
  // Hollis: grazers feed, but the run's random sequence is untouched
  const h = game('pnw'), hd = h.catalog.animal.elk;
  let draws = 0; const rng = h.rng; h.rng = () => { draws++; return rng(); };
  for (let d = 0; d < 50; d++) grazeDay(h, hd, 45, 35);
  assert.equal(draws, 0, 'no dung seed without map.dungSeed');
});

check('A grass fire root-kills lantana standing in grass, not inside a bare thicket', () => {
  const g = game('serengeti'), w = g.world, P = g.catalog.plant, ev = g.events;
  let inGrass = 0, inThicket = 0;
  const N = 200;
  for (let k = 0; k < N; k++) {
    const x = 10 + (k % 20) * 3, y = 10 + Math.floor(k / 20) * 3;
    for (const [dx, dy] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) { const j = w.idx(x + dx, y + dy); clear(w, j); w.ground[j] = P.redoat.id; w.groundG[j] = 0.9; }
    const i = w.idx(x, y); w.shrub[i] = P.lantana.id; w.shrubG[i] = 0.8;
    ev.burnTile(i); if (!w.shrub[i]) inGrass++;
    for (const [dx, dy] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) { const j = w.idx(x + dx, y + dy); clear(w, j); w.shrub[j] = P.lantana.id; w.shrubG[j] = 0.9; }
    ev.burnTile(i); if (!w.shrub[i]) inThicket++;
    else assert.ok(w.shrubG[i] <= 0.12, 'a thicket lantana burns back to a sprout');
  }
  assert.ok(inGrass > N * 0.35 && inGrass < N * 0.7, `${inGrass} of ${N} root-killed in full grass (about 0.6 x 0.9)`);
  assert.equal(inThicket, 0, 'none root-killed inside a thicket with no grass');
});

check('Red oat grass burns by its own fuel, hotter than other native grass', () => {
  const g = game('serengeti'), w = g.world, P = g.catalog.plant, ev = g.events, i = w.idx(30, 30);
  clear(w, i); w.moist[i] = 0.1;
  w.ground[i] = P.redoat.id; w.groundG[i] = 0.9; const red = ev.fuel(w, i);
  w.ground[i] = P.finger.id; const finger = ev.fuel(w, i);
  assert.ok(red > finger * 1.5, `red oat ${red.toFixed(2)} against finger grass ${finger.toFixed(2)}`);
});

console.log(`savanna-grass-check: ${checks} checks passed`);
