// What do the big herbivores do to the land over the years? Runs untended farms headless and reports
// at each checkpoint: herbivore biomass in kg/ha by guild (decision 0033), the tree mix, how much of the
// land is under trees, and the meadow. --exclosure takes every large herbivore off the farm each day
// (a fence around the whole farm), for the comparison.
// --pull=mesquite,lantana pulls those species off the farm once a year (a player keeping invasives down),
// to see what the herbivores do to the native woody plants on their own.
//   node tools/herbivore-pressure.mjs [maps] [years] [seeds] [--exclosure] [--pull=keys]
//   node tools/herbivore-pressure.mjs pnw,serengeti,atlanta 200 7,11,23
// One JSON line per map and seed goes to stdout at the end; progress to stderr.

const root = new URL('../js/', import.meta.url).href;
globalThis.localStorage = { getItem() { return null; }, setItem() {}, removeItem() {} };
const { Game } = await import(root + 'game.js');
const { herbivoreTotals } = await import(root + 'sim/herbivory.js');
const { T, isWater } = await import(root + 'config.js');

const args = process.argv.slice(2).filter(a => !a.startsWith('--'));
const exclosure = process.argv.includes('--exclosure');
// --set=elk.max=40,elk.hr=60 changes species data for the run (what if there were more of them?)
const sets = (process.argv.find(a => a.startsWith('--set=')) || '').slice(6).split(',').filter(Boolean).map(t => t.split(/[.=]/));
const pull = (process.argv.find(a => a.startsWith('--pull=')) || '').slice(7).split(',').filter(Boolean);
const { removeTree } = await import(root + 'sim/plants.js');
const maps = (args[0] || 'pnw,serengeti,atlanta').split(',');
const years = +(args[1] || 200);
const seeds = (args[2] || '7').split(',').map(Number);
const CHECK = [15, 50, 100, 150, 200, 300, 400].filter(y => y <= years);
if (!CHECK.includes(years)) CHECK.push(years);
const pct = (a, b) => b ? Math.round(100 * a / b) : 0;

function snapshot(g) {
  const w = g.world, cat = g.catalog, trees = {};
  let land = 0, wooded = 0, treeN = 0, meadow = 0, forbs = 0;
  for (let i = 0; i < w.n; i++) {
    const t = w.terrain[i];
    if (isWater(t) || w.struct[i] >= 0 || t === T.ROAD) continue;
    land++;
    const tp = cat.plants[w.tree[i]];
    if (tp && w.treeG[i] > 0.35) { treeN++; trees[tp.key] = (trees[tp.key] || 0) + 1; wooded++; }
    else if (!(w.shrub[i] && w.shrubG[i] > 0.5)) {
      const gp = cat.plants[w.ground[i]];
      if (gp && !gp.aquatic && gp.light[0] >= 0.3 && w.groundG[i] > 0.35) { meadow++; if (gp.look.type === 'forb' || gp.look.type === 'tallforb') forbs++; }
    }
  }
  const mix = Object.entries(trees).sort((a, b) => b[1] - a[1]).map(([k, n]) => [k, pct(n, treeN)]);
  const herd = {};
  for (const a of g.wildlife.agents) { const d = cat.animals[a.sp]; if (d.behavior.herbivore && !a.leaving) herd[d.key] = (herd[d.key] || 0) + 1; }
  const kg = herbivoreTotals(w);
  return { trees: treeN, woodedPct: pct(wooded, land), meadowPct: pct(meadow, land), forbPct: pct(forbs, meadow), top: mix[0] || ['-', 0],
    species3: mix.filter(r => r[1] >= 3).length, mix: mix.slice(0, 7), kg: { graze: +kg.graze.toFixed(1), browse: +kg.browse.toFixed(1), heavy: +kg.heavy.toFixed(1) }, herd };
}

const results = [];
for (const map of maps) for (const seed of seeds) {
  const g = new Game();
  g.newGame(seed, 'free', 'standard', map);
  for (const [k, field, v] of sets) if (g.catalog.animal[k]) g.catalog.animal[k][field] = +v;
  const t0 = Date.now(), snaps = {};
  for (let d = 1; d <= years * 120; d++) {
    g.dailyTick();
    for (let k = 0; k < 10; k++) g.wildlife.update(0.1);
    if (pull.length && d % 120 === 60) {
      const w = g.world, ids = new Set(pull.map(k => g.catalog.plant[k]?.id).filter(Boolean));
      for (let i = 0; i < w.n; i++) {
        if (ids.has(w.tree[i])) removeTree(w, i, 'player', g.rng, { deadwood: false });
        if (ids.has(w.shrub[i])) { w.shrub[i] = 0; w.shrubG[i] = 0; }
        if (ids.has(w.understory[i])) { w.understory[i] = 0; w.understoryG[i] = 0; }
      }
    }
    if (exclosure) for (const a of g.wildlife.agents.slice()) if (g.catalog.animals[a.sp].behavior.herbivore) g.wildlife.remove(a, 'exclosure');
    if (d % 120 === 0 && CHECK.includes(d / 120)) {
      const y = d / 120, s = snaps[y] = snapshot(g);
      process.stderr.write(`${map} seed ${seed}${exclosure ? ' exclosure' : ''}${pull.length ? ' pull ' + pull : ''} y${y} (${((Date.now() - t0) / 1000).toFixed(0)} s): kg/ha graze ${s.kg.graze} browse ${s.kg.browse} heavy ${s.kg.heavy}; `
        + `wooded ${s.woodedPct}%, meadow ${s.meadowPct}% (${s.forbPct}% forbs); trees ${s.trees}: ${s.mix.map(([k, v]) => `${k} ${v}%`).join(', ')}; herd ${JSON.stringify(s.herd)}\n`);
    }
  }
  results.push({ map, seed, exclosure, snaps });
  console.log(JSON.stringify({ map, seed, exclosure, pull, final: snaps[years] }));
}
