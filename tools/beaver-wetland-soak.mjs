// Beaver wetlands over a long untouched run (decision 0034): beaver numbers and room, dams, the
// ponds behind them, beaver meadow, marsh, willow on wet ground, and why the creek's tiles can't
// take a dam. A measure, not a check.
//   node tools/beaver-wetland-soak.mjs [years=300] [every=25] [--map=pnw] [--run-seed=1] [--difficulty=challenging] [--invasives=0] [--restore]
// --restore runs the scripted Hollis restoration first (invasives pulled by the creek, riparian
// willow and alder planted, beavers brought in: tools/hollis-restore-plan.mjs), then leaves it be.

const root = new URL('../js/', import.meta.url).href;
globalThis.localStorage = { getItem() { return null; }, setItem() {}, removeItem() {} };
const { Game } = await import(root + 'game.js');
const { T, F } = await import(root + 'config.js');
const bp = await import(root + 'sim/beaver-ponds.js');
const { ToolActions } = await import(root + 'tool-actions.js');
const { hollisRestorePlan } = await import('./hollis-restore-plan.mjs');
const args = process.argv.slice(2).filter(a => !a.startsWith('--'));
const flag = name => process.argv.find(a => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const years = +(args[0] || 300), every = +(args[1] || 25);
const runSeed = +(flag('run-seed') ?? 1);
const g = new Game();
g.newGame(1987, 'free', flag('difficulty') || 'challenging', flag('map') || 'pnw', runSeed >>> 0);
const w = g.world, P = g.catalog.plants, beaver = g.catalog.animals.find(a => a.damBuilder);
if (flag('invasives') === '0') g.invasives = false; // (the Invasive species setting off: none take root, and the starting ones go)
if (flag('invasives') === '0') for (let i = 0; i < w.n; i++) {
  if (w.ground[i] && P[w.ground[i]].invasive) { w.ground[i] = 0; w.groundG[i] = 0; }
  if (w.shrub[i] && P[w.shrub[i]].invasive) { w.shrub[i] = 0; w.shrubG[i] = 0; }
  if (w.tree[i] && P[w.tree[i]].invasive) { w.tree[i] = 0; w.treeG[i] = 0; }
}
const plan = process.argv.includes('--restore') ? hollisRestorePlan(g, ToolActions) : null;
const notes = { built: 0, washed: 0 };
g.on('notify', n => { if (/built a dam/.test(n.text)) notes.built++; if (/dam has washed out/.test(n.text)) notes.washed++; });

// why each dam went: the food round it, and how far the nearest beaver was
const breaks = [];
const wl = g.wildlife, breakDam = wl.breakDam.bind(wl);
wl.breakDam = site => {
  const x = site % w.w + 0.5, y = ((site / w.w) | 0) + 0.5;
  const near = Math.min(99, ...wl.agents.filter(a => g.catalog.animals[a.sp].damBuilder).map(a => Math.max(Math.abs(a.x - x), Math.abs(a.y - y))));
  breaks.push(`Y${g.year} food ${bp.beaverFood(w, site).toFixed(1)} beaver ${near.toFixed(0)} tiles`);
  return breakDam(site);
};

const why = () => {
  // each creek tile: the first rule of damSiteOK it fails
  const out = { ok: 0, gap: 0, full: 0, food: 0, small: 0, other: 0 };
  const dams = []; for (let i = 0; i < w.n; i++) if (w.feature[i] === F.DAM && !(w.marks[i] & 4)) dams.push(i);
  let creek = 0; for (let i = 0; i < w.n; i++) if (w.terrain[i] === T.CREEK || (w.terrain[i] === T.POND && w.waterOwner?.[i] >= 0 && g.water?.base[i] === T.CREEK)) creek++;
  const cap = Math.max(1, Math.floor(creek / bp.CREEK_PER_DAM));
  for (let i = 0; i < w.n; i++) {
    if (w.terrain[i] !== T.CREEK || w.feature[i]) continue;
    if (bp.damSiteOK(g, i)) { out.ok++; continue; }
    const x = i % w.w, y = (i / w.w) | 0;
    if (g.water && w.waterOwner[i] >= 0 && g.water.basins[w.waterOwner[i]]?.kind === 'dam') out.other++;
    else if (dams.some(j => Math.max(Math.abs(j % w.w - x), Math.abs(((j / w.w) | 0) - y)) <= bp.DAM_GAP)) out.gap++;
    else if (dams.length >= cap) out.full++;
    else if (bp.beaverFood(w, i) < bp.FOOD_MIN * 1.5) out.food++;
    else out.small++;
  }
  return { ...out, creek, cap };
};

const line = () => {
  const st = g.wildlife.state[beaver.index];
  let dams = 0, damPond = 0, damOpen = 0, meadow = 0, marsh = 0, pond = 0, willowWet = 0, willowAll = 0, beaverFoodWet = 0;
  const willow = g.catalog.plant?.willow?.id ?? P.findIndex(p => p?.key === 'willow');
  for (let i = 0; i < w.n; i++) {
    if (w.feature[i] === F.DAM && !(w.marks[i] & 4)) dams++;
    const t = w.terrain[i];
    if (g.water && w.waterOwner[i] >= 0 && g.water.basins[w.waterOwner[i]]?.kind !== 'pond' && (t === T.POND || t === T.MARSH)) { damPond++; if (t === T.POND) damOpen++; }
    if (bp.isMeadow(w, i)) meadow++;
    if (t === T.MARSH) marsh++;
    if (t === T.POND) pond++;
    const wet = t === T.MARSH || w.moist[i] >= 0.65;
    if (w.shrub[i] === willow) { willowAll++; if (wet) willowWet++; }
    if (wet && w.shrub[i] && P[w.shrub[i]].beaverFood) beaverFoodWet++;
  }
  const y = why();
  console.log(`Y${String(g.year).padStart(3)} beaver ${st.pop}/${st.K.toFixed(1)} dams ${dams} (built ${notes.built}, washed ${notes.washed}) damPool ${damPond} (open ${damOpen}) meadow ${meadow} marsh ${marsh} pond ${pond} willow ${willowWet}/${willowAll} woodyWet ${beaverFoodWet} | creek ${y.creek} maxDams ${y.cap} sites ok ${y.ok} gap ${y.gap} atCap ${y.full} food ${y.food} small ${y.small} inPool ${y.other}`);
};
line();
const t0 = Date.now();
for (let d = 0; d < years * 120; d++) {
  plan?.day(d);
  g.dailyTick();
  for (let k = 0; k < 10; k++) g.wildlife.update(0.1);
  if ((d + 1) % (120 * every) === 0) line();
}
console.log('dams let go:', breaks.join('; '));
console.log('ms/day', ((Date.now() - t0) / (years * 120)).toFixed(2));
