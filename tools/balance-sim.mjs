// Headless balance check: runs the simulation for N years and prints yearly stats.
//   node tools/balance-sim.mjs idle 10        (leave the farm alone)
//   node tools/balance-sim.mjs restore 15 x   (scripted restoration; a 3rd arg prints the event log)

const root = new URL('../js/', import.meta.url).href;
globalThis.localStorage = { getItem(){return null}, setItem(){}, removeItem(){} };
const { Game } = await import(root + 'game.js');
const { TOOLS, brushTiles } = await import(root + 'tools.js');
const { ANIMALS } = await import(root + 'data/animals.js');
const { T, F } = await import(root + 'config.js');
const mode = process.argv[2] || 'idle';
const years = +(process.argv[3] || 10);
const g = new Game(); g.newGame(1987);
const notes = [];
g.on('notify', n => notes.push(`[${g.dateString()}] ${n.text}`));
const w = g.world;
const use = (key, x, y, r=1) => { const t = TOOLS[key]; let n=0; for (const i of (t.brush ? brushTiles(w,x,y,r) : [w.idx(x,y)])) { const c = t.costFor ? t.costFor(g,i) : t.cost; if (c>0 && !g.canAfford(c)) continue; if (t.apply(g,i,Math.random)===true){ if(c>0) g.spend(c); else if (c<0) g.earn(-c); n++;} } return n; };
const rect = (key,x0,y0,x1,y1,step=1,r=0) => { let n=0; for (let y=y0;y<=y1;y+=step) for (let x=x0;x<=x1;x+=step) n+=use(key,x,y,r); return n; };
function restoreYear1() {
  use('demolish', 36, 50);
  for (let x=0;x<w.w;x++) use('demolish', x, 0);
  for (let y=0;y<w.h;y++) use('demolish', w.w-1, y);
  // pull invasives near creek
  for (let y=1;y<56;y++) for (let x=33;x<=49;x++) use('pull',x,y,0);
  // riparian shrubs & pioneer trees along creek
  for (let y=2;y<55;y+=1) { use('mix_riparian',35,y,1); use('mix_riparian',37,y,1); use('mix_riparian',45,Math.min(y,30),1); use('mix_riparian',47,Math.min(y,30),1);}
  for (let y=2;y<55;y+=3) { use('mix_pioneer',34,y,0); use('mix_pioneer',38,y,0); if (y<30){use('mix_pioneer',44,y,0);use('mix_pioneer',48,y,0);} }
  // marsh by ditch
  rect('marsh', 38, 38, 43, 43);
  rect('mix_wet', 37,37,44,44);
  // field A meadow
  rect('rip', 4, 27, 30, 45);
  rect('mix_meadow', 4, 27, 30, 45);
}
function visitorsYear2() {
  use('build_parking', 30, 19);
  for (let x = 32; x <= 35; x++) use('trail', x, 20, 0);
  for (let y = 20; y <= 44; y++) use('trail', 34, y, 0);
  for (let x = 34; x <= 60; x++) use('trail', x, 44, 0);
  use('blind', 39, 45);
}
function restoreYear2() {
  visitorsYear2();
  rect('rip', 51,3,76,15); rect('mix_pioneer',51,3,76,15,2); rect('mix_conifer',52,4,76,15,3);
  rect('pull',0,0,79,55);
  use('snag',40,36); use('snag',44,44); use('log',40,40); use('log',41,41); use('nestbox',39,37);
  use('intro_beaver', 36, 40);
}
function restoreYear3() {
  rect('rip', 40,35,76,51); rect('mix_meadow', 40,35,60,51); rect('mix_upland',60,35,76,51,2); rect('mix_pioneer',62,36,76,51,3);
  rect('mix_understory', 51,3,76,15,2);
}
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
  if (mode==='restore') { if (d===5) restoreYear1(); if (d===125) restoreYear2(); if (d===245) restoreYear3(); }
  g.dailyTick();
  for (let k=0;k<10;k++) g.wildlife.update(0.1);
  if ((d+1) % 120 === 0) line();
}
console.log('ms/day', ((Date.now()-t0)/(years*120)).toFixed(2), 'goals', Object.keys(g.goalsDone).join(','));
if (process.argv[4]) console.log(notes.slice(-60).join('\n'));
