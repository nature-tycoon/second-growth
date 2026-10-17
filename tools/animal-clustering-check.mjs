// Seeded shared movement checks over every regional roster.
import assert from 'node:assert/strict';
import { Game } from '../js/game.js';
import { BIOME_LIST } from '../js/biome.js';
import { T, DAYS_PER_YEAR } from '../js/config.js';
import { mulberry32 } from '../js/rng.js';
import { passable } from '../js/sim/animal-terrain.js';
const audit = process.argv.includes('--audit');
const rows = [];
function setup(map) {
  Math.random = mulberry32(7321);
  const g = new Game(); g.newGame(1987, 'free', 'standard', map);
  const wl = g.wildlife, w = g.world;
  wl.agents = []; wl.flyovers = []; wl.recount(); wl.passageWait = 1e6;
  w.terrain.fill(T.SOIL); w.struct.fill(-1); w.feature.fill(0); w.fire.fill(0);
  w.tree.fill(0); w.treeG.fill(0); w.distWater.fill(99);
  return g;
}
for (const biome of BIOME_LIST) {
  const g = setup(biome.id), wl = g.wildlife, w = g.world;
  let species = 0, stranded = [], crowded = 0;
  for (const def of g.catalog.animals) {
    species++;
    wl.agents = []; wl.recount();
    w.terrain.fill(def.move === 'swim' || def.reef ? T.CREEK : T.SOIL);
    if (def.move === 'tree') { w.tree.fill(1); w.treeG.fill(1); }
    else { w.tree.fill(0); w.treeG.fill(0); }
    const s = wl.suit[def.index]; s.fill(0);
    const a = wl.spawn(def, 30, 30, { silent: true, age: 3 * DAYS_PER_YEAR });
    a.x = a.y = 30.5;
    s[w.idx(30, 30)] = 1;
    const dest = w.idx(50, 30); s[dest] = 1;
    if (def.move === 'ground' && !def.reef) {
      const canRoam = wl.roam(a, def);
      if (!canRoam) stranded.push(def.key);
      if (!audit) {
        assert.ok(canRoam, `${biome.id}/${def.key}: can cross dry ground between good patches`);
        assert.equal(a.trip, dest);
        assert.ok(a.path.every(j => passable(w, j, a) && !w.fire[j]));
        // Traversal never supplies habitat, and a burning barrier cannot be crossed.
        assert.equal(s[w.idx(40, 30)], 0);
        for (let y = 0; y < w.h; y++) w.fire[w.idx(40, y)] = 1;
        assert.equal(wl.roam(a, def), false, `${def.key}: fire barrier`);
        w.fire.fill(0);
      }
    }
    // Two equally suitable connected destinations, one already heavily occupied.
    // Run the real roaming selector repeatedly using a fixed seed.
    s.fill(0.1);
    const empty = w.idx(30, 50); s[empty] = s[dest] = 1;
    for (let k = 0; k < 16; k++) {
      const b = wl.spawn(def, 50, 30, { silent: true }); b.x = 50.5; b.y = 30.5;
      // Reservations count too, including animals still in flight/on their way.
      if (k % 2) { b.x = 70.5; b.y = 30.5; b.path = [dest]; b.state = 'walk'; }
    }
    if (def.move !== 'fly') {
      Math.random = mulberry32(99);
      let emptyTrips = 0;
      for (let k = 0; k < 24; k++) {
        a.x = a.y = 30.5;
        assert.ok(wl.roam(a, def));
        if (a.trip === empty) emptyTrips++;
      }
      if (emptyTrips < 20) crowded++;
      if (!audit) assert.ok(emptyTrips >= 20, `${biome.id}/${def.key}: ${emptyTrips}/24 trips choose unoccupied habitat`);
    }
  }
  const row = { map: biome.id, species, stranded, ignoresCrowding: crowded }; rows.push(row);
  console.log(JSON.stringify(row));
}
if (!audit) {
  const g = setup('serengeti'), wl = g.wildlife;
  const def = g.catalog.animal.elephant;
  const spawn = (x, y) => {
    const a = wl.spawn(def, x, y, { silent: true });
    a.x = x + 0.5; a.y = y + 0.5; return a;
  };
  const west = Array.from({ length: 8 }, (_, k) => spawn(10 + k % 3, 30));
  const east = Array.from({ length: 8 }, (_, k) => spawn(100 + k % 3, 30));
  for (const a of [...west, ...east]) wl.herdLeader(a);
  for (const group of [west, east]) {
    const sizes = new Map();
    for (const a of group) {
      const lead = wl.herdLeader(a);
      assert.ok(group.includes(lead), 'distant herds cannot be linked by arrival rank');
      sizes.set(lead.id, (sizes.get(lead.id) || 0) + 1);
    }
    assert.ok([...sizes.values()].every(n => n <= def.herdMax), 'herd size remains bounded');
  }
  const follower = west[2], lead = wl.herdLeader(follower);
  wl.remove(west[1]);
  assert.equal(wl.herdLeader(follower), lead, 'removing a neighbor preserves existing herd membership');
  // Followers abandon remembered solo trips before making another herd decision.
  wl.suit[def.index].fill(1);
  follower.trip = g.world.idx(60, 30);
  follower.age = 1000; follower.forageAfter = Infinity; follower.socialCooldown = Infinity;
  follower.thirst = 0; follower.slot = [1, 0];
  wl.chooseTarget(follower, def);
  assert.equal(follower.trip, null, 'a follower no longer resumes a stale independent trip');

  const reef = setup('reef'), rw = reef.wildlife;
  reef.world.terrain.fill(T.CREEK);
  const fishDef = reef.catalog.animal.chromis;
  const school = Array.from({ length: 60 }, () => rw.spawn(fishDef, 30, 30, { silent: true }));
  for (const a of school) rw.herdLeader(a);
  const leader = rw.herdLeader(school[0]);
  for (const a of school.slice(1)) { a.slot = [0.8, 0]; rw.keepWithHerd(a, fishDef); }
  assert.ok(school.slice(1).some(a => Math.hypot(...a.slot) > fishDef.herdR * 1.5), 'large schools expand old crowded slots');
  assert.equal(rw.herdLeader(school.at(-1)), leader, 'school remains together while spreading out');

  // Fixed samples make both flight paths compare exactly the same occupied/empty patches.
  const birds = setup('atlanta'), bw = birds.wildlife, bd = birds.catalog.animal.cardinal;
  const bird = bw.spawn(bd, 30, 30, { silent: true });
  const occupied = birds.world.idx(40, 30), empty = birds.world.idx(20, 30);
  bw.suit[bd.index].fill(0); bw.suit[bd.index][occupied] = bw.suit[bd.index][empty] = 1;
  for (let k = 0; k < 12; k++) {
    const b = bw.spawn(bd, 80, 30, { silent: true });
    b.state = 'fly'; b.tx = 40.5; b.ty = 30.5;
  }
  const random = Math.random;
  try {
    let k = 0; const sample = [1, 0.5, 0.5, 0, 0.5, 0.5];
    Math.random = () => sample[k++ % sample.length];
    assert.deepEqual(bw.bestTileSample(bd, 30, 30, 10, 2, bird), [20, 30], 'local flights avoid reserved landing patches');
    k = 0; const far = [occupied / birds.world.n, 0.5, empty / birds.world.n, 0.5];
    bird.x = 30.5; bird.y = 5.5;
    Math.random = () => far[k++ % far.length];
    assert.ok(bw.roam(bird, bd));
    assert.ok(bird.tx < 21, 'long flights avoid reserved landing patches');
  } finally { Math.random = random; }

  for (const [map, key, movement] of [['amazon', 'howler', 'canopy'], ['pnw', 'cutthroat', 'water'], ['pnw', 'newt', 'wet habitat'], ['reef', 'chromis', 'sea']]) {
    const game = setup(map), w = game.world, sim = game.wildlife, d = game.catalog.animal[key];
    const a = sim.spawn(d, 30, 30, { silent: true });
    sim.suit[d.index].fill(0); sim.suit[d.index][w.idx(50, 30)] = 1;
    assert.equal(sim.roam(a, d), false, `${movement} specialist cannot cross an empty dry gap`);
  }
  console.log('PASS stable local herds, expanding schools, flight reservations and specialist corridors');
}
if (!audit) console.log(`PASS clustering across ${rows.reduce((n, r) => n + r.species, 0)} species on ${rows.length} maps`);
