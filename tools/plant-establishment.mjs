// Why does a species never show up on its own? Runs an untended farm headless and reports, for
// every species on a map: the land it could grow on, the seeds that reached the farm (and from
// where), what stopped the rest, and how many plants stand at years 15, 50, 200 and 800.
//   node tools/plant-establishment.mjs [maps] [years] [seed] [--still]
//   node tools/plant-establishment.mjs pnw,serengeti 200
// --still skips animal movement (much faster; grazing then lands only where animals were placed).
// Progress per checkpoint goes to stderr; a JSON copy to $TMPDIR/plant-establishment-<map>.json for before/after comparisons.

import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';

const root = new URL('../js/', import.meta.url).href;
globalThis.localStorage = { getItem() { return null; }, setItem() {}, removeItem() {} };
const { Game } = await import(root + 'game.js');
const { plantSuit, plantLimits } = await import(root + 'sim/plants.js');
const { T, isWater } = await import(root + 'config.js');

const args = process.argv.slice(2).filter(a => !a.startsWith('--'));
const still = process.argv.includes('--still');
const maps = (args[0] || 'pnw,serengeti,atlanta,amazon,sumatra,chinandega').split(',');
const years = +(args[1] || 200);
const seed = +(args[2] || 1987);
const CHECK = [15, 50, 100, 200, 400, 800].filter(y => y <= years);
if (!CHECK.includes(years)) CHECK.push(years);

const pct = (a, b) => b ? Math.round(100 * a / b) : 0;
// plantLimits wording → short gate names
const why = s => /shady/.test(s) ? 'shade' : /sunny/.test(s) ? 'sun' : /dry/.test(s) ? 'dry' : /wet/.test(s) ? 'wet'
  : /soil/.test(s) ? 'soil' : /standing water|ground|hardpan|rubble|sand/.test(s) ? 'ground' : 'other';

function landTile(w, i) {
  const t = w.terrain[i];
  return w.struct[i] < 0 && t !== T.ROAD && t !== T.RIVER;
}

function census(w, cat) {
  const out = {};
  for (const p of cat.plants) if (p) out[p.key] = { tiles: 0, grown: 0, suitable: 0, limits: {} };
  const ids = [w.ground, w.shrub, w.tree], gs = [w.groundG, w.shrubG, w.treeG];
  for (let i = 0; i < w.n; i++) {
    for (let l = 0; l < 3; l++) {
      const id = ids[l][i];
      if (!id) continue;
      const r = out[cat.plants[id].key];
      r.tiles++; if (gs[l][i] > 0.5) r.grown++;
    }
  }
  // Where could each species establish, ignoring who is there now? Sample land tiles.
  for (let i = 0; i < w.n; i += 3) {
    if (!landTile(w, i)) continue;
    for (const p of cat.plants) {
      if (!p) continue;
      const r = out[p.key];
      if (plantSuit(w, i, p) >= 0.3) { r.suitable += 3; continue; }
      const lim = plantLimits(w, i, p);
      for (const s of lim.length ? lim : ['marginal']) { const k = lim.length ? why(s) : 'marginal'; r.limits[k] = (r.limits[k] || 0) + 3; }
    }
  }
  return out;
}

function moistureProfile(w) {
  const bins = new Array(10).fill(0); let land = 0;
  for (let i = 0; i < w.n; i++) {
    if (!landTile(w, i) || isWater(w.terrain[i])) continue;
    land++; bins[Math.min(9, Math.floor(w.moist[i] * 10))]++;
  }
  return bins.map(b => Math.round(100 * b / land));
}

// Meadow tiles (open ground, groundcover, no shrub or tree over it) and the share that are wildflowers.
function meadow(w, cat) {
  let n = 0, f = 0;
  for (let i = 0; i < w.n; i++) {
    const id = w.ground[i];
    if (!id || w.groundG[i] < 0.35 || w.tree[i] || (w.shrub[i] && w.shrubG[i] > 0.4) || isWater(w.terrain[i])) continue;
    const p = cat.plants[id];
    if (p.invasive || p.exotic || p.aquatic) continue;
    n++; if (p.look.flower) f++;
  }
  return { n, flowers: pct(f, n) };
}

const top = (o, n = 2) => Object.entries(o).sort((a, b) => b[1] - a[1]).slice(0, n);

for (const map of maps) {
  const g = new Game();
  g.newGame(seed, 'free', 'standard', map);
  const w = g.world, cat = g.catalog;
  const log = {};
  for (const p of cat.plants) if (p) log[p.key] = { from: {}, fail: {}, unsuited: {}, oddsGround: 0, oddsGrazed: 0, germ: 0, waits: 0 };
  w.seedLog = (p, i, reason) => {
    const r = log[p.key];
    const src = w.seedFrom || 'other';
    r.from[src] = (r.from[src] || 0) + 1;
    if (!reason) { r.germ++; return; }
    if (reason === 'waits') { r.waits++; return; } // (a tree sapling taking the understory slot under a living tree, 0028)
    if (reason === 'same') return;
    r.fail[reason] = (r.fail[reason] || 0) + 1;
    if (reason === 'unsuited') for (const s of plantLimits(w, i, p).slice(0, 1)) { const k = why(s); r.unsuited[k] = (r.unsuited[k] || 0) + 1; }
    else if (reason === 'odds') { if (w.grazed?.[i] > 0.1) r.oddsGrazed++; if (w.ground[i] && w.groundG[i] > 0.6) r.oddsGround++; }
  };
  const snaps = {};
  const moist0 = moistureProfile(w);
  const t0 = Date.now();
  for (let d = 1; d <= years * 120; d++) {
    g.dailyTick();
    if (!still) for (let k = 0; k < 10; k++) g.wildlife.update(0.1);
    if (d % 120 === 0 && CHECK.includes(d / 120)) {
      const y = d / 120;
      snaps[y] = census(w, cat);
      const trees = cat.plants.filter(p => p && p.layer === 2), total = trees.reduce((s, p) => s + snaps[y][p.key].tiles, 0);
      const m = meadow(w, cat), present = cat.plants.filter(p => p && !p.invasive && !p.exotic && snaps[y][p.key].tiles).length;
      process.stderr.write(`${map} year ${y} (${((Date.now() - t0) / 1000).toFixed(0)} s): ${present} natives present; meadow ${m.n} tiles, ${m.flowers}% flowering species; trees ${total}: `
        + trees.map(p => [p.key, snaps[y][p.key].tiles]).filter(r => r[1]).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k, n]) => `${k} ${pct(n, total)}%`).join(', ') + '\n');
    }
  }
  const last = snaps[years];
  const trees = cat.plants.filter(p => p && p.layer === 2);
  console.log(`\n=== ${map}: ${years} years untended, seed ${seed}${still ? ', animals still' : ''} ===`);
  console.log(`land moisture (share of land tiles in 0.0-0.1 … 0.9-1.0), start: ${moist0.join(' ')}`);
  console.log(`                                                  year ${years}: ${moistureProfile(w).join(' ')}`);
  for (const y of CHECK) {
    const total = trees.reduce((s, p) => s + snaps[y][p.key].tiles, 0);
    console.log(`trees at year ${y} (${total}): ` + trees.map(p => [p.key, snaps[y][p.key].tiles]).filter(r => r[1]).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} ${pct(n, total)}%`).join(', '));
  }
  console.log(['species'.padEnd(13), 'L', 'suit%'.padStart(6), 'arrived'.padStart(8), 'from'.padEnd(26), 'germ'.padStart(6),
    ...CHECK.map(y => `y${y}`.padStart(6)), '  blocked by (share of failed seeds)', '| unsuitable land is'].join(' '));
  const landN = (() => { let n = 0; for (let i = 0; i < w.n; i++) if (landTile(w, i)) n++; return n; })();
  const rows = [];
  for (const p of cat.plants) {
    if (!p) continue;
    const r = log[p.key];
    const arrived = Object.values(r.from).reduce((a, b) => a + b, 0);
    const fails = Object.values(r.fail).reduce((a, b) => a + b, 0);
    const blocked = top(r.fail, 3).map(([k, n]) => {
      let s = `${k} ${pct(n, fails)}%`;
      if (k === 'unsuited') s += ` (${top(r.unsuited, 2).map(([u]) => u).join('/')})`;
      if (k === 'odds' && n) s += ` (${pct(r.oddsGround, n)}% in sward, ${pct(r.oddsGrazed, n)}% grazed)`;
      return s;
    }).join(', ');
    const lim = top(last[p.key].limits, 2);
    const suitSum = Object.values(last[p.key].limits).reduce((a, b) => a + b, 0) || 1;
    rows.push({ key: p.key, layer: p.layer, invasive: p.invasive, suitable: pct(last[p.key].suitable, landN),
      arrived, from: r.from, germ: r.germ, waits: r.waits, alive: Object.fromEntries(CHECK.map(y => [y, snaps[y][p.key].tiles])), fail: r.fail, unsuited: r.unsuited, limits: last[p.key].limits });
    console.log([(p.invasive ? '*' : ' ') + p.key.padEnd(12), p.layer, String(pct(last[p.key].suitable, landN)).padStart(6), String(arrived).padStart(8),
      top(r.from, 3).map(([k, n]) => `${k} ${pct(n, arrived)}`).join(' ').padEnd(26), String(r.germ + (r.waits ? `+${r.waits}u` : '')).padStart(6),
      ...CHECK.map(y => String(snaps[y][p.key].tiles).padStart(6)), ' ', blocked,
      '|', lim.map(([k, n]) => `${k} ${pct(n, suitSum)}%`).join(' ')].join(' '));
  }
  console.log(`(${((Date.now() - t0) / 1000).toFixed(0)} s; suit% = share of land a seed could take on at year ${years}; germ +Nu = saplings waiting under a tree; * invasive)`);
  writeFileSync(`${tmpdir()}/plant-establishment-${map}.json`, JSON.stringify({ map, years, seed, still, moist0, rows }, null, 1));
}
