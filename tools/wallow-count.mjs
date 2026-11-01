// Wallows through the seasons on the maps with wallowing animals: node tools/wallow-count.mjs [years] [maps]
// Prints, every ten days, how many wallows there are and how many hold water (wet/all).
globalThis.localStorage = { getItem() { return null; }, setItem() {}, removeItem() {} };
const root = new URL('../js/', import.meta.url).href;
const { Game } = await import(root + 'game.js');
const { wallowCount, wallower } = await import(root + 'sim/wallows.js');
const { MONTH_NAMES, isWater } = await import(root + 'config.js');
export async function wallowSeasons(map, years, seed = 1987) {
  let s = seed; Math.random = () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296;
  const g = new Game(); g.newGame(seed, 'free', 'standard', map); const w = g.world, out = [];
  // (a farm with no wallowing animals yet, like Hollis before its elk come back: release a group)
  if (!g.wildlife.agents.some(a => wallower(g.catalog.animals[a.sp]))) {
    const def = g.catalog.animals.find(d => wallower(d)), spot = def && [...Array(w.n).keys()].find(i => w.moist[i] > 0.6 && g.wildlife.canRelease?.(def, i % w.w, (i / w.w) | 0) !== false && !isWater(w.terrain[i]));
    if (def && spot != null) for (let k = 0; k < 3; k++) g.wildlife.introduce(def, spot % w.w, (spot / w.w) | 0);
  }
  for (let d = 0; d < years * 120; d++) {
    g.dailyTick(); for (let k = 0; k < 5; k++) g.wildlife.update(0.2);
    if ((d + 1) % 10 === 0) out.push({ year: g.year, month: g.month, ...wallowCount(w), wallowers: g.wildlife.agents.filter(a => wallower(g.catalog.animals[a.sp])).length });
  }
  return out;
}
if (process.argv[1] && import.meta.url === (await import('node:url')).pathToFileURL(process.argv[1]).href) {
  const years = +(process.argv[2] || 4), maps = (process.argv[3] || 'pnw,serengeti,sumatra').split(',');
  for (const map of maps) {
    const rows = await wallowSeasons(map, years);
    console.log(map + ': ' + rows.map(r => `${MONTH_NAMES[r.month].slice(0, 3)}Y${r.year} ${r.wet}/${r.n}`).join(' '));
  }
}
