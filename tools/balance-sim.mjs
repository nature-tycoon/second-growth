// Headless balance check: runs the simulation for N years and prints yearly stats.
//   node tools/balance-sim.mjs idle 10        (leave the farm alone)
//   node tools/balance-sim.mjs restore 15 x   (scripted restoration; a 3rd arg prints the event log)
// --map=serengeti runs another map (restore is the Hollis plan, so pnw only; other maps run idle).
// --run-seed=N picks the run seed (weather, fires, wildlife: decision 0035), as calibrate.mjs does per seed.
// --json prints one JSON line at the end instead (vital signs, species and herbivores at the start
// and the end), for tools/calibrate.mjs.

const root = new URL('../js/', import.meta.url).href;
globalThis.localStorage = { getItem(){return null}, setItem(){}, removeItem(){} };
const { Game } = await import(root + 'game.js');
const { ToolActions } = await import(root + 'tool-actions.js');
const { ecoMetrics } = await import(root + 'sim/eco-metrics.js');
const { hollisRestorePlan } = await import('./hollis-restore-plan.mjs');
const args = process.argv.slice(2).filter(a => !a.startsWith('--'));
const flag = name => process.argv.find(a => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const json = process.argv.includes('--json');
const mode = args[0] || 'idle';
const years = +(args[1] || 10);
const runSeed = flag('run-seed'); // (the run seed, decision 0035: weather, fires and wildlife; left out, the fixed default)
const g = new Game(); g.newGame(1987, undefined, undefined, flag('map') || undefined, runSeed == null ? undefined : +runSeed >>> 0);
if (mode === 'restore' && g.map !== 'pnw') throw new Error('restore is the Hollis (pnw) plan; use idle on other maps');
const notes = [];
g.on('notify', n => notes.push(`[${g.dateString()}] ${n.text}`));
const w = g.world;
const plan = mode === 'restore' ? hollisRestorePlan(g, ToolActions) : null;
const ANIMALS = g.catalog.animals;
const line = () => {
  const s = g.cache.score;
  const pops = ANIMALS.map((a,k)=>[a.key,g.wildlife.state[k].pop,g.wildlife.state[k].K]).filter(p=>p[1]>0||p[2]>=1).map(p=>`${p[0]}:${p[1]}/${p[2].toFixed(1)}`).join(' ');
  const st = w.stats;
  const v = g.visitors;
  console.log(`Y${g.year} ${g.dateString()} $${Math.round(g.money)} score=${s.total.toFixed(1)} nat=${(s.nativeFrac*100).toFixed(0)}% inv=${(s.invFrac*100).toFixed(1)}% farm=${(s.farmFrac*100).toFixed(0)}% meadow=${st.meadow} forest=${st.forest} mature=${st.mature} snags=${st.snags} plants=${s.nativePlants} visitors=${v.monthly} rating=${v.rating.toFixed(1)} vinc=$${v.income} fires=${g.events.lastFire} floods=${g.events.lastFlood}\n   ${pops}`);
};
// The numbers calibrate.mjs compares with the map's reference (decision 0031)
const snapshot = () => {
  const m = ecoMetrics(g), s = g.cache.score;
  const vitals = {}, parts = {};
  for (const v of m.vitals) { vitals[v.key] = v.score; for (const p of v.parts) parts[p.key] = { value: p.value, target: p.target, score: p.score }; }
  const species = {};
  ANIMALS.forEach((a, k) => { if (!a.domestic) species[a.key] = { pop: g.wildlife.state[k].pop, K: g.wildlife.state[k].K }; });
  return { year: g.year, score: s.total, nativeFrac: s.nativeFrac, invFrac: s.invFrac, overall: m.overall, stage: m.stage,
    vitals, parts, species, apex: m.reference.apex, herbivores: m.herbivores && { total: m.herbivores.total, range: m.herbivores.range } };
};
const start = json ? snapshot() : (line(), null);
const t0 = Date.now();
for (let d = 0; d < years*120; d++) {
  plan?.day(d);
  g.dailyTick();
  for (let k=0;k<10;k++) g.wildlife.update(0.1);
  if ((d+1) % 120 === 0 && !json) line();
}
const msDay = (Date.now()-t0)/(years*120);
if (json) console.log(JSON.stringify({ map: g.map, mode, years, msDay, start, end: snapshot() }));
else console.log('ms/day', msDay.toFixed(2), 'goals', Object.keys(g.goalsDone).join(','));
if (args[2]) console.log(notes.slice(-60).join('\n'));
