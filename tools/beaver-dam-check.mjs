// Beaver dams: abandoned dams wash out, Demolish pulls them apart, and either way the pond
// drains back to a flowing creek. Run: node tools/beaver-dam-check.mjs
import assert from 'node:assert/strict';
import { Game } from '../js/game.js';
import { T, F } from '../js/config.js';
import { ANIMAL } from '../js/data/animals.js';
import { TOOLS } from '../js/tools.js';
let checks = 0;
function check(name, fn) { fn(); checks++; console.log(`PASS ${name}`); }
function farm() {
  const g = new Game(); g.newGame(1987, 'free', 'standard', 'pnw'); g.autosave = false;
  g.wildlife.agents = []; g.wildlife.recount(); return g;
}
const SITE = [54, 58];
// creek tiles within reach of the pool, and whether the creek still runs through the site
function creekAround(w, site) {
  const out = new Set(), x0 = site % w.w, y0 = (site / w.w) | 0;
  for (let dy = -5; dy <= 5; dy++) for (let dx = -5; dx <= 5; dx++) if (w.inb(x0 + dx, y0 + dy)) {
    const j = w.idx(x0 + dx, y0 + dy); if (w.terrain[j] === T.CREEK) out.add(j);
  }
  return out;
}
function ponds(w, site) { let n = 0; const x0 = site % w.w, y0 = (site / w.w) | 0;
  for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) if (w.inb(x0 + dx, y0 + dy) && w.terrain[w.idx(x0 + dx, y0 + dy)] === T.POND) n++;
  return n; }
function connected(w, site, creek) {
  // the creek through the site reaches beyond the old pool on two sides
  const x0 = site % w.w, y0 = (site / w.w) | 0, seen = new Set([site]), q = [site];
  let reachedFar = 0;
  while (q.length) { const i = q.shift(), x = i % w.w, y = (i / w.w) | 0;
    if (Math.max(Math.abs(x - x0), Math.abs(y - y0)) >= 4) reachedFar++;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const j = w.idx(x + dx, y + dy);
      if (!seen.has(j) && (w.terrain[j] === T.CREEK || w.terrain[j] === T.RIVER) && Math.max(Math.abs(x + dx - x0), Math.abs(y + dy - y0)) <= 5) { seen.add(j); q.push(j); } } }
  return reachedFar >= 2;
}
check('Demolishing a beaver dam drains its pond back to the original creek', () => {
  const g = farm(), w = g.world, site = w.idx(...SITE), before = creekAround(w, site), ponds0 = ponds(w, site);
  g.wildlife.buildDam(site);
  assert.ok(ponds(w, site) > ponds0, 'the dam made a pond');
  assert.equal(TOOLS.demolish.apply(g, site), true);
  assert.notEqual(w.feature[site], F.DAM);
  assert.deepEqual([...creekAround(w, site)].sort(), [...before].sort(), 'creek restored tile for tile');
  assert.equal(ponds(w, site), ponds0);
  assert.equal(g.wildlife.dams, 0);
});
check('An abandoned dam washes out within a couple of years; a tended one stays', () => {
  for (const tended of [false, true]) {
    const g = farm(), w = g.world, site = w.idx(...SITE);
    g.wildlife.buildDam(site);
    if (tended) { const b = g.wildlife.spawn(ANIMAL.beaver, SITE[0] + 1, SITE[1], { silent: true }); b.x = SITE[0] + 1.5; b.y = SITE[1] + 0.5; }
    let day = 0;
    for (; day < 720 && w.feature[site] === F.DAM; day++) {
      w.featureAge[site]++; // (the plant pass ages features daily)
      for (const a of g.wildlife.agents) { a.x = SITE[0] + 1.5; a.y = SITE[1] + 0.5; a.leaving = false; }
      g.wildlife.damDay();
    }
    if (tended) assert.equal(w.feature[site], F.DAM, 'tended dam stands');
    else { assert.notEqual(w.feature[site], F.DAM, 'abandoned dam washes out'); assert.ok(day > 60, `not before half a year (${day})`); assert.ok(connected(w, site), 'creek flows again'); }
  }
});
check('Dams from older saves (no record of the drowned channel) still reopen the creek', () => {
  const g = farm(), w = g.world, site = w.idx(...SITE);
  g.wildlife.buildDam(site);
  for (let i = 0; i < w.n; i++) w.marks[i] &= ~(16 | 32);
  assert.ok(!connected(w, site), 'the pool interrupts the creek');
  g.wildlife.breakDam(site);
  assert.ok(connected(w, site), 'a channel is cut back through the old pond');
});
check('Canal blocks are not beaver dams: they neither wash out nor demolish', () => {
  const g = farm(), w = g.world, site = w.idx(...SITE);
  w.feature[site] = F.DAM; w.marks[site] |= 4; w.featureAge[site] = 500;
  for (let d = 0; d < 400; d++) g.wildlife.damDay();
  assert.equal(w.feature[site], F.DAM);
  assert.equal(TOOLS.demolish.apply(g, site), null);
});
console.log(`${checks} beaver dam checks passed.`);
