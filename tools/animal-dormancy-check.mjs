// node tools/animal-dormancy-check.mjs
import assert from 'node:assert/strict';
import { register } from 'node:module';
register('./three-loader.mjs', import.meta.url);
import { Game } from '../js/game.js';
import { BIOME_LIST } from '../js/biome.js';
import { DAYS_PER_YEAR, T, F } from '../js/config.js';
import { dormancyStatus } from '../js/data/animal-dormancy.js';
import { updateDormancy, shelteredDormant, winterShelter } from '../js/sim/animal-dormancy.js';
import { canHuntPrey, canStartHunt, scavenge, fleeFire, watch } from '../js/sim/animal-life.js';
import { wildlifeDiagnostics } from '../js/sim/wildlife-diagnostics.js';
import { mulberry32 } from '../js/rng.js';
import { tr } from '../js/i18n.js';
import '../js/lang/es.js';
const THREE = await import('three');
const { Actors } = await import('../js/render3d/actors.js');
const { Renderer } = await import('../js/render3d/scene.js');
let checks = 0;
function check(name, fn) { fn(); checks++; console.log(`PASS ${name}`); }
function setup(map = 'pnw', seed = 1987) {
  Math.random = mulberry32(seed);
  const g = new Game(); g.newGame(seed, 'free', 'standard', map); g.day = 90; g.weather = 'snow'; g.snow = 0.5;
  const w = g.world, wl = g.wildlife;
  wl.agents = []; wl.flyovers = []; wl.recount(); wl.passageWait = 1e6;
  w.terrain.fill(T.SOIL); w.feature.fill(0); w.struct.fill(-1); w.fire.fill(0);
  w.tree.fill(0); w.shrub.fill(0); w.distWater.fill(99); w.distLog.fill(99); w.nbCanopy.fill(0);
  wl.suit.forEach(s => s.fill(1));
  return g;
}
function spawn(g, key, x = 40.5, y = 30.5, opts = {}) {
  const d = g.catalog.animal[key];
  const a = g.wildlife.spawn(d, Math.floor(x), Math.floor(y), { silent: true, age: d.mature * DAYS_PER_YEAR + 10, ...opts });
  Object.assign(a, { x, y, wait: 0, hunger: 0, thirst: 0, state: 'idle', flying: false, alt: 0 }); return a;
}
function shelter(g, a, feature = F.LOG) {
  const j = g.world.idx(Math.floor(a.x), Math.floor(a.y));
  g.world.feature[j] = feature; return j;
}
function sleep(g, a) { const d = g.catalog.animals[a.sp]; assert.ok(updateDormancy(g.wildlife, a, d)); assert.ok(shelteredDormant(g.wildlife, a, d)); }
const cases = [['pnw', 'bear'], ['pnw', 'gartersnake'], ['pnw', 'turtle'], ['atlanta', 'chipmunk'], ['atlanta', 'bat'], ['atlanta', 'boxturtle']];
check('All seven map catalogs apply winter dormancy only to the six selected residents', () => {
  const selected = new Set(cases.map(([map, key]) => `${map}:${key}`)); let found = 0, entries = 0;
  for (const b of BIOME_LIST) {
    const g = setup(b.id);
    for (const d of g.catalog.animals) { entries++; assert.equal(!!d.behavior.dormancy, selected.has(`${b.id}:${d.key}`)); if (d.behavior.dormancy) found++; }
    if (b.id === 'pnw') { assert.ok(g.catalog.animal.bat.season); assert.equal(g.catalog.animal.bat.behavior.dormancy, null); }
  }
  assert.equal(found, 6); assert.ok(entries >= 200);
});
check('Selected residents shelter in winter, remain counted, and emerge in spring', () => {
  for (const [map, key] of cases) {
    const g = setup(map), a = spawn(g, key), d = g.catalog.animals[a.sp];
    shelter(g, a, key === 'bat' ? F.SNAG : F.LOG);
    if (key === 'turtle') g.world.distWater[shelter(g, a)] = 2;
    sleep(g, a); g.wildlife.recount(); assert.equal(g.wildlife.state[a.sp].pop, 1);
    assert.ok(dormancyStatus(a)); g.day = 120;
    assert.equal(updateDormancy(g.wildlife, a, d), false); assert.equal(a.state, 'idle'); assert.equal(a.dormancy, null);
  }
});
check('Animals travel to reachable shelter without teleporting and do not cross an enclosed barrier', () => {
  for (const blocked of [false, true]) {
    const g = setup(), a = spawn(g, 'bear'), w = g.world, d = g.catalog.animal.bear;
    const den = w.idx(45, 30); w.feature[den] = F.LOG;
    // Thirst must not redirect the final den waypoint toward its adjacent pond.
    a.thirst = 40; w.distWater[den] = 1; w.terrain[w.idx(46, 30)] = T.POND;
    if (blocked) for (const [x, y] of [[44,30],[46,30],[45,29],[45,31]]) w.struct[w.idx(x,y)] = 0;
    updateDormancy(g.wildlife, a, d); assert.equal(a.x, 40.5);
    if (blocked) { assert.equal(a.dormancy, undefined); return; }
    assert.equal(a.state, 'walk'); assert.equal(a.dormancy.site, den);
    const startX = a.x; let last = [a.x, a.y];
    for (let k = 0; k < 800 && a.state !== 'dormant'; k++) {
      g.wildlife.update(0.02);
      assert.ok(Math.hypot(a.x-last[0], a.y-last[1]) < 0.5, 'physical movement'); last = [a.x,a.y];
    }
    assert.equal(a.state, 'dormant'); assert.ok(a.x > startX + 3); assert.ok(Math.hypot(a.x-45.5,a.y-30.5) < 0.9);
  }
});
check('Bat winter roosts exclude summer boxes and water; suitable cavities are reached in flight', () => {
  const g = setup('atlanta'), a = spawn(g, 'bat'), w = g.world, d = g.catalog.animal.bat;
  const here = shelter(g,a,F.NESTBOX);
  assert.equal(winterShelter(g.wildlife,a,d,here), false);
  w.feature[here] = F.SNAG; w.terrain[here] = T.POND;
  assert.equal(winterShelter(g.wildlife,a,d,here), false);
  w.feature[here] = 0; w.terrain[here] = T.SOIL;
  const roost = w.idx(45,30); w.feature[roost] = F.SNAG;
  updateDormancy(g.wildlife,a,d); assert.equal(a.state,'fly'); assert.equal(a.dormancy.site,roost);
  for(let k=0;k<800 && a.state!=='dormant';k++) g.wildlife.update(0.02);
  assert.equal(a.state,'dormant'); assert.equal(a.alt,0);
});
check('Pond turtles use sheltered pond bottoms or nearby covered land; terrestrial reptiles stay dry', () => {
  const g = setup(), a = spawn(g,'turtle'), w=g.world, d=g.catalog.animal.turtle, j=shelter(g,a);
  assert.equal(winterShelter(g.wildlife,a,d,j),false,'far inland'); w.distWater[j]=2;
  assert.ok(winterShelter(g.wildlife,a,d,j)); w.terrain[j]=T.POND; w.feature[j]=0;
  assert.equal(winterShelter(g.wildlife,a,d,j),false,'open pond'); w.distLog[j]=1;
  assert.ok(winterShelter(g.wildlife,a,d,j)); sleep(g,a);
  const snake=spawn(g,'gartersnake'); assert.equal(winterShelter(g.wildlife,snake,g.catalog.animal.gartersnake,j),false);
});
check('Dormant residents stay stationary, age, pause, and use much less food without feeding or hunting', () => {
  for(const [map,key] of cases) {
    const g=setup(map), a=spawn(g,key), wl=g.wildlife;
    shelter(g,a,key==='bat'?F.SNAG:F.LOG); if(key==='turtle') g.world.distWater[shelter(g,a)]=2;
    sleep(g,a); const before={x:a.x,y:a.y,age:a.age,phase:a.phase,hunger:a.hunger};
    wl.update(0); assert.equal(a.age,before.age);
    for(let k=0;k<20;k++){wl.daily();wl.update(0.05);}
    assert.equal(a.state,'dormant'); assert.equal(a.x,before.x); assert.equal(a.y,before.y);
    assert.equal(a.phase,before.phase); assert.ok(a.age>before.age); assert.ok(a.hunger-before.hunger<=2.01);
    assert.equal(canStartHunt(a),false); assert.equal(scavenge(wl,a,g.catalog.animals[a.sp]),false);
  }
});
check('Winter arousals respect snow and keep chipmunks awake long enough to forage', () => {
  const g=setup('atlanta'), a=spawn(g,'chipmunk'), d=g.catalog.animal.chipmunk;
  shelter(g,a); sleep(g,a); a.age=a.dormancy.arouse+0.1;
  assert.equal(updateDormancy(g.wildlife,a,d),true); g.weather='clear'; g.snow=0;
  assert.equal(updateDormancy(g.wildlife,a,d),false); assert.equal(a.state,'idle');
  assert.equal(updateDormancy(g.wildlife,a,d),false); a.age+=1.1; sleep(g,a);
});
check('Fire wakes sheltered residents and preserves their escape and resleep cooldown', () => {
  for(const [map,key] of [['pnw','bear'],['atlanta','bat']]) {
    const g=setup(map), a=spawn(g,key); shelter(g,a,key==='bat'?F.SNAG:F.LOG); sleep(g,a);
    g.world.fire[g.world.idx(39,30)]=3; fleeFire(g.wildlife);
    assert.ok(a.fromFire); assert.equal(a.dormancy,null); assert.equal(a.state,key==='bat'?'fly':'flee');
    updateDormancy(g.wildlife,a,g.catalog.animals[a.sp]); assert.notEqual(a.state,'dormant');
  }
});
check('Shelter destruction, flooding and displaced or malformed saved sleepers wake safely', () => {
  for(const change of ['remove','flood','move','missing']) {
    const g=setup(), a=spawn(g,'bear'), d=g.catalog.animal.bear, j=shelter(g,a); sleep(g,a);
    if(change==='remove') g.world.feature[j]=0;
    if(change==='flood') g.world.terrain[j]=T.POND;
    if(change==='move') a.x+=4;
    if(change==='missing') a.dormancy=undefined;
    assert.equal(updateDormancy(g.wildlife,a,d),false); assert.equal(a.state,'idle');
  }
});
check('Prey cannot hide from a nearby active hunter; den occupants neither hunt nor trigger alarms', () => {
  const g=setup('atlanta'), a=spawn(g,'chipmunk'), hawk=spawn(g,'hawk',43.5,30.5), d=g.catalog.animal.chipmunk;
  shelter(g,a); assert.equal(updateDormancy(g.wildlife,a,d),false); assert.notEqual(a.state,'dormant');
  g.wildlife.remove(hawk); a.dormancyAfter=0; sleep(g,a);
  const h=spawn(g,'hawk',43.5,30.5); assert.equal(canHuntPrey(g.wildlife,h,g.catalog.animal.hawk,a),false);
  const n=setup(), snake=spawn(n,'gartersnake'); shelter(n,snake); sleep(n,snake);
  const frog=spawn(n,'treefrog',41.5,30.5); assert.equal(watch(n.wildlife,frog,n.catalog.animal.treefrog),false);
});
check('Dependent bear cubs share their mother’s den and wake when she emerges', () => {
  const g=setup(), mother=spawn(g,'bear'), cub=spawn(g,'bear',42.5,30.5,{age:1,juvenile:true});
  cub.mom=mother.id; shelter(g,mother); sleep(g,mother);
  updateDormancy(g.wildlife,cub,g.catalog.animal.bear); assert.equal(cub.dormancy.site,mother.dormancy.site);
  for(let k=0;k<800 && cub.state!=='dormant';k++) g.wildlife.update(0.02);
  assert.equal(cub.state,'dormant'); assert.equal(cub.mom,mother.id);
  mother.age=mother.dormancy.arouse+0.1; g.weather='clear';g.snow=0;
  updateDormancy(g.wildlife,mother,g.catalog.animal.bear);
  updateDormancy(g.wildlife,cub,g.catalog.animal.bear); assert.equal(cub.state,'idle');
});
check('Unrelated bears and chipmunks choose separate winter shelters while bear families can share', () => {
  for(const [map,key] of [['pnw','bear'],['atlanta','chipmunk']]) {
    const g=setup(map), a=spawn(g,key), b=spawn(g,key), d=g.catalog.animal[key];
    shelter(g,a); const other=g.world.idx(43,30); g.world.feature[other]=F.LOG; sleep(g,a);
    updateDormancy(g.wildlife,b,d); assert.notEqual(b.dormancy?.site,a.dormancy.site);
    assert.equal(b.dormancy.site,other);
  }
});
check('Winter saves retain shelter and cooldown without aliasing; old saves and spring loads recover', () => {
  const g=setup(), a=spawn(g,'bear'); shelter(g,a); sleep(g,a);
  const saved=g.wildlife.serialize(); assert.notEqual(saved.agents[0].dormancy,a.dormancy);
  const site=a.dormancy.site; saved.agents[0].dormancy.site++; assert.equal(a.dormancy.site,site); saved.agents[0].dormancy.site=site;
  g.wildlife.load(saved); const loaded=g.wildlife.agents[0]; assert.notEqual(loaded.dormancy,saved.agents[0].dormancy);
  assert.equal(updateDormancy(g.wildlife,loaded,g.catalog.animal.bear),true);
  g.day=120; updateDormancy(g.wildlife,loaded,g.catalog.animal.bear); assert.equal(loaded.state,'idle');
  const old=g.wildlife.serialize(); delete old.agents[0].dormancy; delete old.agents[0].dormancyAfter;
  g.wildlife.load(old); g.wildlife.update(0.05); assert.notEqual(g.wildlife.agents[0].state,'dormant');
});
check('A sheltered winter resident survives low food capacity but natural mortality remains active', () => {
  const g=setup(), a=spawn(g,'bear'), wl=g.wildlife; shelter(g,a); sleep(g,a); a.hunger=50;
  wl.computeSuitability=()=>{wl.state.forEach(s=>s.K=0)};
  g.rng=()=>0.1; wl.monthly(); assert.ok(wl.agents.includes(a)); assert.ok(!a.leaving);
  g.rng=()=>0; wl.monthly(); assert.ok(!wl.agents.includes(a),'natural mortality still applies');
});
check('Winter diagnostics explain paused arrivals and avoid false hunger warnings for sheltered residents', () => {
  const g=setup(), a=spawn(g,'bear'); shelter(g,a); sleep(g,a); a.hunger=50; g.difficulty='challenging'; g.wildlife.recount();
  const d=wildlifeDiagnostics(g,g.catalog.animal.bear);
  assert.equal(d.status,'Winter shelter and reduced activity'); assert.ok(d.rows.some(r=>r.key==='dormancy'));
  assert.ok(!d.rows.some(r=>r.key==='arrival'||r.key==='hunger')); assert.notEqual(tr(d.status,'es'),d.status);
});
check('Winter settlement is deferred for dormant species, without changing habitat capacity', () => {
  const g=setup('atlanta'), wl=g.wildlife;
  wl.computeSuitability=()=>{wl.state.forEach(s=>s.K=30)}; g.rng=()=>0;
  const incoming=[]; wl.immigrate=(def)=>{incoming.push(def.key);return 0}; wl.monthly();
  for(const [,key] of cases.filter(([map])=>map==='atlanta')) assert.ok(!incoming.includes(key));
  assert.ok(incoming.includes('graysquirrel')); assert.equal(wl.state[g.catalog.animal.chipmunk.index].K,30);
});
check('Hidden den occupants remain locatable and reappear after emergence; status is translated', () => {
  const g=setup(), a=spawn(g,'bear'); shelter(g,a); g.selectedAgent=a;
  const actors=new Actors(new THREE.Scene());
  actors.update(g,new THREE.Vector3(1,0,0),1); assert.ok(actors.pose.get(a.id));
  sleep(g,a); actors.update(g,new THREE.Vector3(1,0,0),2); assert.ok(!actors.pose.get(a.id));
  let centered;
  const r={actors,centerOn:(x,y)=>{centered=[x,y]}};
  Renderer.prototype.centerOnAnimal.call(r,a); assert.deepEqual(centered,[a.x,a.y]);
  assert.notEqual(tr(dormancyStatus(a),'es'),dormancyStatus(a));
  g.day=120; updateDormancy(g.wildlife,a,g.catalog.animal.bear);
  actors.update(g,new THREE.Vector3(1,0,0),3); assert.ok(actors.pose.get(a.id));
  assert.equal(g.wildlife.agents.length,1);
});
console.log(`${checks} seasonal dormancy checks passed.`);
