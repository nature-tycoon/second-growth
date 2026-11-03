// node tools/river-fish-spread-probe.mjs [map] [years]
// Whether river fish spread over their water or bunch up for years: 10 of each river fish swim for
// a few game years, and twice a year it prints, per species, how many tiles they're on out of the
// tiles they could use, their spread (tiles, root mean square from their centre) and their states.
// A group stuck at one spot shows as a few tiles and a spread under a tile (decision 0034:
// coho at a cascade lip on pnw, 10 fish on 3 tiles after 2 years, before stepToward's hop).
const root = new URL('../', import.meta.url).href;
const { restoredGame } = await import(root + 'tools/map-audit-fixtures.mjs');
const { mulberry32 } = await import(root + 'js/rng.js');
const { passable } = await import(root + 'js/sim/animal-terrain.js');
const { DAYS_PER_YEAR } = await import(root + 'js/config.js');
globalThis.localStorage ||= { getItem() { return null; }, setItem() {}, removeItem() {} };
const map = process.argv[2] || 'pnw', YEARS = +(process.argv[3] || 2);
Math.random = mulberry32(3);
const g = restoredGame(map, 3), wl = g.wildlife, cat = g.catalog, w = g.world;
wl.agents = []; wl.flyovers = []; wl.recount(); wl.passageWait = 1e6; wl.computeSuitability();
const rng = mulberry32(4), fish = cat.animals.filter(d => d.move === 'swim' && !d.reef);
for (const d of fish) {
  const good = []; for (let j = 0; j < w.n; j++) if (wl.suit[d.index][j] > 0.2 && passable(w, j, d)) good.push(j);
  for (let k = 0; k < 10 && good.length; k++) { const j = good[Math.floor(rng() * good.length)]; wl.spawn(d, j % w.w, j / w.w | 0, { silent: true }); }
}
const days = Math.round(YEARS * DAYS_PER_YEAR);
for (let day = 0; day < days; day++) {
  for (let s = 0; s < 20; s++) wl.update(0.05);
  g.day++; wl.daily();
  if (day % Math.round(DAYS_PER_YEAR / 2) === 0 || day === days - 1) {
    const line = [];
    for (const d of fish) {
      const fs = wl.agents.filter(a => a.sp === d.index); if (!fs.length) continue;
      let good = 0; for (let j = 0; j < w.n; j++) if (wl.suit[d.index][j] > 0.2 && passable(w, j, d)) good++;
      const tiles = new Set(fs.map(a => w.idx(Math.floor(a.x), Math.floor(a.y))));
      const cx = fs.reduce((s, a) => s + a.x, 0) / fs.length, cy = fs.reduce((s, a) => s + a.y, 0) / fs.length;
      const spread = Math.sqrt(fs.reduce((s, a) => s + (a.x - cx) ** 2 + (a.y - cy) ** 2, 0) / fs.length);
      const states = {}; for (const a of fs) states[a.state] = (states[a.state] || 0) + 1;
      line.push(`${d.key} n${fs.length} on ${tiles.size} tiles of ${good} usable, spread ${spread.toFixed(1)} centre ${cx.toFixed(0)},${cy.toFixed(0)} ${JSON.stringify(states)}`);
    }
    console.log(`day ${day} (month ${g.month}): ` + line.join(' | '));
  }
}
