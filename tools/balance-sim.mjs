// Headless balance check: runs the simulation for N years and prints yearly stats.
//   node tools/balance-sim.mjs idle 10        (leave the farm alone)
//   node tools/balance-sim.mjs restore 15 x   (scripted restoration; a 3rd arg prints the event log)

const root = new URL('../js/', import.meta.url).href;
globalThis.localStorage = { getItem(){return null}, setItem(){}, removeItem(){} };
const { Game } = await import(root + 'game.js');
const { ToolActions } = await import(root + 'tool-actions.js');
const { ANIMALS } = await import(root + 'data/animals.js');
const { T, F } = await import(root + 'config.js');
const { hollisRestorePlan } = await import('./hollis-restore-plan.mjs');
const mode = process.argv[2] || 'idle';
const years = +(process.argv[3] || 10);
const g = new Game(); g.newGame(1987);
const notes = [];
g.on('notify', n => notes.push(`[${g.dateString()}] ${n.text}`));
const w = g.world;
const plan = mode === 'restore' ? hollisRestorePlan(g, ToolActions) : null;
const line = () => {
  const s = g.cache.score;
  const pops = ANIMALS.map((a,k)=>[a.key,g.wildlife.state[k].pop,g.wildlife.state[k].K]).filter(p=>p[1]>0||p[2]>=1).map(p=>`${p[0]}:${p[1]}/${p[2].toFixed(1)}`).join(' ');
  const st = w.stats;
  const v = g.visitors;
  console.log(`Y${g.year} ${g.dateString()} $${Math.round(g.money)} score=${s.total.toFixed(1)} nat=${(s.nativeFrac*100).toFixed(0)}% inv=${(s.invFrac*100).toFixed(1)}% farm=${(s.farmFrac*100).toFixed(0)}% meadow=${st.meadow} forest=${st.forest} mature=${st.mature} snags=${st.snags} plants=${s.nativePlants} visitors=${v.monthly} rating=${v.rating.toFixed(1)} vinc=$${v.income} fires=${g.events.lastFire} floods=${g.events.lastFlood}\n   ${pops}`);
};
line();
const t0 = Date.now();
for (let d = 0; d < years*120; d++) {
  plan?.day(d);
  g.dailyTick();
  for (let k=0;k<10;k++) g.wildlife.update(0.1);
  if ((d+1) % 120 === 0) line();
}
console.log('ms/day', ((Date.now()-t0)/(years*120)).toFixed(2), 'goals', Object.keys(g.goalsDone).join(','));
if (process.argv[4]) console.log(notes.slice(-60).join('\n'));
