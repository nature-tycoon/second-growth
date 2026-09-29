// Map: Magnolia Ridge, a subdivision in Gwinnett County outside Atlanta, Georgia. Identical homes,
// fenced lawns and Bradford pears where oak-hickory forest ran down to the Yellow River.
// The homes and streets stay; the job is to make the yards, easements and common ground into a
// neighborhood wildlife can live in: pollinator gardens that flower from spring to frost, and tree
// canopy that joins up from yard to yard, from the woods on the ridge down to the river.

import buildAtlantaPlants from '../data/plants-atlanta.js';
import buildAtlantaAnimals from '../data/animals-atlanta.js';
import { generateSubdivision, atlantaBorderCell } from './atlanta-world.js';
import { PNW_GOALS, pop, speciesPresent } from '../sim/goals.js';
import { PLANT, PLANTS, isBlooming } from '../data/plants.js';
import { plantSuit } from '../sim/plants.js';
import { riverRow } from '../world.js';
import { T, F } from '../config.js';
import { moment } from '../sim/moments.js';
import { ANIMAL } from '../data/animals.js';

const reuse = key => PNW_GOALS.find(g => g.key === key);
const st = (g, k) => g.world.stats?.[k] || 0;
// invasive plants other than the lawn (lawn has its own goal)
const invPct = g => st(g, 'land') ? 100 * Math.max(0, st(g, 'invasive') - st(g, 'turf')) / st(g, 'land') : 0;
// the count at the start of the game, remembered the first time a goal asks
const start = (g, k, now) => { const f = g.flags.startCounts || (g.flags.startCounts = {}); if (f[k] == null) f[k] = now; return f[k]; };
const fencesGone = g => Math.max(0, start(g, 'fence', st(g, 'fences')) - st(g, 'fences'));
const lawnGone = g => Math.max(0, start(g, 'turf', st(g, 'turf')) - st(g, 'turf'));
const shadePct = g => st(g, 'streetEdge') ? Math.round(100 * st(g, 'streetShade') / st(g, 'streetEdge')) : 0;
const MONTHS = ['Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov'];

// Keystone moments: a cloud of monarchs in the gardens, and the first big firefly night, which
// needs perennial natives (the plants that come back every year) left to grow for a while.
function momentsDaily(g) {
  const done = g.flags.moments || {};
  // (the monarchs' stopover is the fall migration south, September and October)
  if (done.monarchs == null && ANIMAL.monarch && g.month >= 6 && g.month <= 7) {
    const m = g.wildlife.agents.filter(a => a.sp === ANIMAL.monarch.index && !a.leaving);
    if (m.length >= 8) {
      // look at the thickest cloud of them, over the gardens (not following one butterfly)
      let best = m[0], bn = 0;
      const inGarden = a => { const w = g.world, x = Math.floor(a.x), y = Math.floor(a.y); return w.inb(x, y) && y >= 3 && w.habitat[w.idx(x, y)] === 3; }; // over a wildflower garden
      for (const a of m) { if (!inGarden(a)) continue; const k = m.filter(o => (o.x - a.x) ** 2 + (o.y - a.y) ** 2 < 25).length; if (k > bn) { bn = k; best = a; } }
      if (bn >= 4 && moment(g, 'monarchs', { x: best.x, y: best.y })) {
        // the fall migration pours through: a wave of passing monarchs drops into the flowers around them
        const W = g.wildlife, w = g.world;
        for (let k = 0; k < 14; k++) {
          const x = Math.round(best.x + (g.rng() - 0.5) * 8), y = Math.round(best.y + (g.rng() - 0.5) * 6);
          if (!w.inb(x, y)) continue;
          const a = W.spawn(ANIMAL.monarch, x, y, { silent: true, age: 0.2 * 120 });
          a.passing = true; a.age = 0.3 * 120; // (they move on south within a few weeks)
        }
      }
    }
  }
  // (firefly larvae need a year or more in the ground, so not before the second summer)
  if (done.fireflies == null && g.day >= 120 && g.month >= 3 && g.month <= 5 && g.weather !== 'rain') {
    const w = g.world;
    let n = 0, sx = 0, sy = 0;
    for (let i = 0; i < w.n; i++) {
      const p = w.ground[i] ? PLANTS[w.ground[i]] : null;
      if (p && !p.invasive && !p.exotic && p.life >= 5 && w.groundG[i] > 0.5) { n++; sx += i % w.w; sy += (i / w.w) | 0; }
    }
    if (n >= 250) moment(g, 'fireflies', { x: sx / n + 0.5, y: sy / n + 0.5 });
  }
}

const GOALS = [
  { key: 'plant', name: 'First beds', reward: 1000,
    desc: 'Plant 100 native plants. Lift some lawn first (Remove → Pull invasives): nothing grows through sod.',
    check: g => g.stats.planted >= 100, prog: g => `${Math.min(100, g.stats.planted)} / 100 planted` },
  { key: 'creek', name: 'Hollins Creek', reward: 3000,
    desc: 'Shade the creek: plant shrubs and trees along 60% of its banks so the water runs cool and clean for fish, frogs and herons.',
    check: g => st(g, 'creek') > 0 && st(g, 'shadedCreek') / st(g, 'creek') >= 0.6, prog: g => `${st(g, 'creek') ? Math.round(100 * st(g, 'shadedCreek') / st(g, 'creek')) : 0}% / 60% of the creek shaded` },
  { key: 'fences', name: 'Open the backyards', reward: 2000,
    desc: 'Take down 30 tiles of backyard privacy fence. Box turtles, foxes and deer can\'t get through them, and every yard is cut off from the next.',
    check: g => fencesGone(g) >= 30, prog: g => `${Math.min(30, fencesGone(g))} / 30 fence tiles gone` },
  { key: 'lawn', name: 'Lawn to garden', reward: 2500,
    desc: 'Dig out 200 tiles of Bermuda grass lawn (Remove → Clear vegetation) and plant natives in its place before it creeps back.',
    check: g => lawnGone(g) >= 200, prog: g => `${Math.min(200, lawnGone(g))} / 200 tiles of lawn gone` },
  { key: 'milkweed', name: 'Monarch waystation', reward: 2500,
    desc: 'Grow 20 tiles of milkweed (butterfly weed in dry sun, swamp milkweed in wet spots). Monarch caterpillars eat nothing else.',
    check: g => st(g, 'milkweed') >= 20, prog: g => `${st(g, 'milkweed')} / 20 tiles of milkweed` },
  { key: 'monarch', name: 'Monarchs', reward: 3000,
    desc: 'Monarch butterflies stop to breed here on their way north in spring and south in fall.',
    check: g => pop(g, 'monarch') > 0, prog: g => `${pop(g, 'monarch')} monarchs here` },
  { key: 'bloom', name: 'Spring to frost', reward: 4000,
    desc: 'Have native flowers in bloom in every month from March to November. A bumblebee colony starves if there\'s a gap. Coreopsis and phlox in spring, coneflower and milkweed in summer, goldenrod and aster in fall.',
    check: g => st(g, 'bloomMonths') >= 9,
    prog: g => { const m = g.world.bloomSeen || []; return MONTHS.map((n, k) => (m[k] ? '✓' : '·') + n).join(' '); } },
  { key: 'bees', name: 'Bumblebee colonies', reward: 3000,
    desc: 'Have 5 bumblebees at once. They need flowers through the whole season and unmown grass to nest in.',
    check: g => pop(g, 'bumblebee') >= 5, prog: g => `${pop(g, 'bumblebee')} / 5 bumblebees` },
  { key: 'hummingbird', name: 'Ruby-throat', reward: 2000,
    desc: 'Ruby-throated hummingbirds nest in the neighborhood. Plant azalea, bergamot and cardinal flower.',
    check: g => pop(g, 'hummingbird') > 0, prog: g => `${pop(g, 'hummingbird')} hummingbirds here` },
  { key: 'raingarden', name: 'Rain gardens', reward: 2500,
    desc: 'Dig 15 tiles of rain garden (Landscape → Marsh) in low spots where the roofs and driveways drain, and plant them with the rain garden mix.',
    check: g => st(g, 'marsh') >= 15, prog: g => `${st(g, 'marsh')} / 15 tiles` },
  { key: 'pears', name: 'Pull the pears', reward: 3000,
    desc: 'Get the Bradford pears down to fewer than 5. Cut them with Remove → Cut trees, and plant oaks and redbuds in their place.',
    check: g => st(g, 'pears') < 5, prog: g => `${st(g, 'pears')} Bradford pears left` },
  { key: 'weeds', name: 'Privet and kudzu', reward: 3000,
    desc: 'Get invasive plants other than lawn below 4% of the land: privet in the river buffer, kudzu on the easement, ivy and nandina in the yards.',
    check: g => invPct(g) < 4, prog: g => `${invPct(g).toFixed(1)}% invasive` },
  { key: 'shade', name: 'Shady streets', reward: 4000,
    desc: 'Shade a third of the ground along the streets and driveways with tree canopy. It keeps summer pavement 20 degrees cooler for the people walking there.',
    check: g => shadePct(g) >= 35, prog: g => `${shadePct(g)}% / 35% of the street edge shaded` },
  { key: 'canopy', name: 'Ridge to river', reward: 6000,
    desc: 'Join the canopy up from the woods on the ridge to the trees along the Yellow River: an unbroken chain of native tree crowns, yard to yard, across both streets. Big trees on both sides of a street meet over it.',
    check: g => st(g, 'canopyLinked') > 0,
    prog: g => st(g, 'canopyLinked') ? 'Connected' : `Largest canopy: ${st(g, 'canopyLargest')} tiles, reaching row ${st(g, 'canopyReach')} of ${g.world.h}` },
  { key: 'chickadee', name: 'Caterpillar country', reward: 3000,
    desc: 'Carolina chickadees raise young here. One brood takes thousands of caterpillars, and those come from native trees, above all oaks.',
    check: g => pop(g, 'chickadee') >= 2, prog: g => `${pop(g, 'chickadee')} / 2 chickadees` },
  { key: 'flyingsquirrel', name: 'Night gliders', reward: 5000,
    desc: 'Southern flying squirrels move in. They glide tree to tree at night and need a large, connected canopy.',
    check: g => pop(g, 'flyingsquirrel') > 0, prog: g => `${pop(g, 'flyingsquirrel')} flying squirrels here` },
  { key: 'owl', name: 'Who cooks for you?', reward: 6000,
    desc: 'A barred owl settles in the neighborhood. It needs a big, unbroken canopy near water.',
    check: g => pop(g, 'owl') > 0, prog: g => `${pop(g, 'owl')} barred owls here` },
  { key: 'species15', name: 'Backyard habitat', reward: 3000,
    desc: 'Have 12 animal species living in the neighborhood at the same time.',
    check: g => speciesPresent(g) >= 12, prog: g => `${speciesPresent(g)} / 12 species` },
  reuse('trailhead'), reuse('visitors'), reuse('rating'),
  { key: 'species25', name: 'A living neighborhood', reward: 10000,
    desc: 'Have 20 animal species living here at once.',
    check: g => speciesPresent(g) >= 20, prog: g => `${speciesPresent(g)} / 20 species` },
  { key: 'score', name: 'Thriving', reward: 12000,
    desc: 'Reach an ecosystem health score of 70.',
    check: g => (g.cache.score?.total ?? 0) >= 70, prog: g => `${Math.round(g.cache.score?.total ?? 0)} / 70` },
];

// ------------------------------------------------------------------ the suburb's own counts
// Run after each day's habitat update (see sim/environment.js).
function suburbStats(w, s, month) {
  const n = w.n, W = w.w, Hh = w.h;
  const milk = [PLANT.butterflyweed?.id, PLANT.swampmilkweed?.id], pear = PLANT.callery?.id, turf = PLANT.turf?.id;
  let milkweed = 0, hostSwallow = 0, catTrees = 0, pears = 0, turfN = 0, fences = 0, marsh = 0, bloom = 0, edge = 0, shade = 0;
  // a native tree crown big enough to count as canopy
  const crown = i => { const t = w.tree[i]; if (!t || w.treeG[i] < 0.5) return 0; const p = PLANTS[t]; return p.invasive || p.exotic ? 0 : w.treeG[i] >= 0.85 ? 2 : 1; };
  for (let i = 0; i < n; i++) {
    const g = w.ground[i], sh = w.shrub[i], tr = w.tree[i], t = w.terrain[i];
    if (g && w.groundG[i] > 0.4) {
      if (milk.includes(g)) milkweed++;
      if (g === turf) turfN++;
      const p = PLANTS[g];
      if (!p.invasive && !p.exotic && isBlooming(p, month)) bloom++;
    }
    if (sh && w.shrubG[i] > 0.4) { const p = PLANTS[sh]; if (p.host === 'swallowtail') hostSwallow++; if (!p.invasive && !p.exotic && isBlooming(p, month)) bloom++; }
    if (tr && w.treeG[i] > 0.5) {
      const p = PLANTS[tr];
      if (tr === pear) pears++;
      if (p.host === 'swallowtail') hostSwallow++;
      if (p.caterpillars) catTrees++;
      if (!p.invasive && p.nectar?.months.includes(month)) bloom += 2;
    }
    if (w.feature[i] === F.FENCE) fences++;
    if (t === T.MARSH) marsh++;
    // the street edge: the ground right beside the pavement, where people walk
    if (t !== T.ROAD && w.struct[i] < 0 && t !== T.RIVER) {
      const x = i % W, y = (i / W) | 0;
      if ((x > 0 && w.terrain[i - 1] === T.ROAD) || (x < W - 1 && w.terrain[i + 1] === T.ROAD) || (y > 0 && w.terrain[i - W] === T.ROAD) || (y < Hh - 1 && w.terrain[i + W] === T.ROAD)) {
        edge++; if (w.canopy[i] >= 0.5) shade++;
      }
    }
  }
  // Connected canopy: native crowns that touch (side by side or corner to corner) are one
  // network, and big crowns reach across a gap of up to two tiles, over a street or a driveway.
  const par = w._canopyPar && w._canopyPar.length === n ? w._canopyPar : (w._canopyPar = new Int32Array(n));
  const find = a => { while (par[a] !== a) { par[a] = par[par[a]]; a = par[a]; } return a; };
  const kind = new Uint8Array(n);
  for (let i = 0; i < n; i++) { kind[i] = crown(i); par[i] = i; }
  for (let i = 0; i < n; i++) {
    if (!kind[i]) continue;
    const x = i % W, y = (i / W) | 0, reach = kind[i] === 2 ? 3 : 1;
    for (let dy = 0; dy <= reach; dy++) for (let dx = -reach; dx <= reach; dx++) {
      if (dy === 0 && dx <= 0) continue;
      const xx = x + dx, yy = y + dy;
      if (xx < 0 || xx >= W || yy >= Hh) continue;
      const j = yy * W + xx;
      if (!kind[j]) continue;
      if ((Math.abs(dx) > 1 || dy > 1) && kind[j] !== 2) continue; // only two big crowns meet across a gap
      const a = find(i), b = find(j); if (a !== b) par[a] = b;
    }
  }
  const size = new Int32Array(n), top = new Int32Array(n).fill(Hh), bottom = new Int32Array(n).fill(-1);
  for (let i = 0; i < n; i++) if (kind[i]) { const r = find(i), y = (i / W) | 0; size[r]++; top[r] = Math.min(top[r], y); bottom[r] = Math.max(bottom[r], y); }
  const net = w.canopyNet && w.canopyNet.length === n ? w.canopyNet : (w.canopyNet = new Float32Array(n));
  let largest = 0, linked = 0, reach = 0;
  for (let i = 0; i < n; i++) {
    if (!kind[i]) { net[i] = 0; continue; }
    const r = find(i);
    net[i] = size[r];
    if (size[r] > largest) largest = size[r];
    // the ridge woods touch the top rows; the river woods start a few rows above the water
    if (top[r] <= 3) reach = Math.max(reach, bottom[r]);
    if (top[r] <= 3 && bottom[r] >= riverRow(i % W, Hh) - 6) linked = 1;
  }
  // The bloom calendar: which months of the growing season have had real native bloom in the past year.
  w.bloomTick = (w.bloomTick || 0) + 1;
  const last = w.bloomLast || (w.bloomLast = new Int32Array(12).fill(-9999));
  if (bloom >= 12) last[month] = w.bloomTick; // a garden or two in flower is enough to count the month
  const seen = [];
  for (let m = 0; m < 9; m++) seen.push(w.bloomTick - last[m] < 125 ? 1 : 0);
  w.bloomSeen = seen;
  Object.assign(s, {
    milkweed, hostSwallow, caterpillarTrees: catTrees, pears, turf: turfN, fences, marsh, nativeBloom: bloom,
    bloomMonths: seen.reduce((a, b) => a + b, 0), streetEdge: edge, streetShade: shade,
    canopyLargest: largest, canopyLinked: linked, canopyReach: reach,
  });
}

// ------------------------------------------------------------------ gardens that close over
// A native garden fills its own gaps: where a plant dies or a bed was left bare, its neighbours
// seed into it within weeks in the growing season, so the beds stay full and no clay shows.
const openGround = (w, i) => { const t = w.terrain[i]; return w.struct[i] < 0 && (t === T.SOIL || t === T.PASTURE || t === T.MUD || t === T.FIELD) && w.feature[i] !== F.FENCE; };
function fillGaps(g) {
  if (g.month > 7 || g.weather === 'snow') return;
  const w = g.world, W = w.w, rng = g.rng;
  for (let i = 0; i < w.n; i++) {
    if (w.ground[i] || !openGround(w, i)) continue;
    const x = i % W, y = (i / W) | 0, nb = [];
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const xx = x + dx, yy = y + dy;
      if (xx < 0 || yy < 0 || xx >= W || yy >= w.h) continue;
      const j = yy * W + xx, id = w.ground[j];
      if (id && w.groundG[j] > 0.5 && !PLANTS[id].invasive && !PLANTS[id].exotic) nb.push(id);
    }
    if (nb.length < 1 || rng() > 0.05 + 0.06 * nb.length) continue;
    const p = PLANTS[nb[Math.floor(rng() * nb.length)]];
    if (plantSuit(w, i, p) > 0.15) { w.setPlant(i, p, 0.18); w.renderDirty = true; }
  }
}

// ------------------------------------------------------------------ the neighbours come outside
// The greener the neighborhood, the more people walk out of their front doors: to stand in the
// gardens, stroll the shady streets, and watch the creek. Nobody comes out in the rain, and fewer
// in winter.
let RID = 1e6;
function natureFrac(w) { const s = w.stats || {}; return s.land ? (s.native || 0) / s.land : 0; }
function residentTarget(g) {
  if (g.weather === 'rain' || g.weather === 'snow') return 0;
  const f = Math.max(0, Math.min(1, (natureFrac(g.world) - 0.12) / 0.55));
  return Math.round((1 + 34 * f) * (g.season === 3 ? 0.4 : 1));
}
const doorOf = s => [s.x + 1.5, s.turn ? s.y - 0.4 : s.y + s.h + 0.4];
const walkable = (w, i) => w.struct[i] < 0 && w.feature[i] !== F.FENCE && (w.terrain[i] !== T.CREEK || w.feature[i] === F.BOARDWALK) && w.terrain[i] !== T.POND && w.terrain[i] !== T.RIVER;
// what draws people to a spot: flowers in bloom, shade, the creek, and wildlife nearby
function appeal(w, i) {
  const t = w.terrain[i];
  let a = w.nectar[i] * 2 + (w.canopy[i] > 0.4 ? 0.8 : 0) + (w.distWater[i] <= 1 ? 0.7 : 0);
  if (t === T.ROAD) a += 0.4; // (a walk down the street)
  if (w.ground[i] && PLANTS[w.ground[i]].sod) a *= 0.2;
  return a;
}
function bfs(w, from, goal, cap = 1600) {
  const W = w.w, prev = new Map([[from, -1]]), q = [from];
  for (let h = 0; h < q.length && q.length < cap; h++) {
    const i = q[h];
    if (i !== from && goal(i)) { const path = []; for (let k = i; k !== from; k = prev.get(k)) path.push(k); return path; } // (reversed: pop() gives the next step)
    const x = i % W, y = (i / W) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const xx = x + dx, yy = y + dy;
      if (xx < 0 || yy < 0 || xx >= W || yy >= w.h) continue;
      const j = yy * W + xx;
      if (prev.has(j) || !walkable(w, j)) continue;
      prev.set(j, i); q.push(j);
    }
  }
  return null;
}
function newOuting(g, p) {
  const w = g.world, W = w.w, x0 = Math.floor(p.x), y0 = Math.floor(p.y);
  if (!w.inb(x0, y0)) return false;
  // somewhere nice within a short walk, weighted toward the most appealing spots
  let best = -1, bs = 0;
  for (let k = 0; k < 40; k++) {
    const x = x0 + Math.round((g.rng() - 0.5) * 22), y = y0 + Math.round((g.rng() - 0.5) * 16);
    if (!w.inb(x, y)) continue;
    const i = w.idx(x, y);
    if (!walkable(w, i)) continue;
    const a = appeal(w, i) + g.rng() * 0.3;
    if (a > bs) { bs = a; best = i; }
  }
  if (best < 0) return false;
  const path = bfs(w, w.idx(x0, y0), i => i === best);
  if (!path) return false;
  p.path = path; p.pause = 0;
  return true;
}
function residentsDaily(g) {
  const want = residentTarget(g), homes = g.world.structures.filter(s => s && s.type === 'home');
  const list = g.residents || (g.residents = []);
  g.cache.residentsWanted = want;
  // more come out a few at a time; when there are too many (rain, evening), some head home
  for (let k = 0; k < 3 && list.filter(p => !p.home).length < want; k++) {
    const h = homes[Math.floor(g.rng() * homes.length)];
    if (!h) break;
    const [x, y] = doorOf(h);
    const p = { id: RID++, x, y, hx: x, hy: y, look: Math.floor(g.rng() * 8), phase: g.rng() * 10, pause: 1 + g.rng() * 2, path: null, trips: 1 + Math.floor(g.rng() * 3), home: false };
    list.push(p);
  }
  let extra = list.filter(p => !p.home).length - want;
  for (const p of list) if (extra > 0 && !p.home) { p.home = true; p.path = null; p.pause = 0; extra--; }
}
function residentsUpdate(g, dt) {
  const list = g.residents;
  if (!list || !list.length) return;
  const w = g.world, sp = 1.8 * dt; // tiles a day: an easy stroll
  for (let k = list.length - 1; k >= 0; k--) {
    const p = list[k];
    p.phase += dt * 6;
    if (p.pause > 0) { p.pause -= dt; continue; }
    if (!p.path || !p.path.length) {
      if (p.home) {
        // back at the door: go inside
        if (Math.hypot(p.x - p.hx, p.y - p.hy) < 0.8) { list.splice(k, 1); continue; }
        const goal = w.idx(Math.floor(p.hx), Math.floor(p.hy));
        p.path = w.inb(Math.floor(p.x), Math.floor(p.y)) ? bfs(w, w.idx(Math.floor(p.x), Math.floor(p.y)), i => i === goal) : null;
        if (!p.path) { list.splice(k, 1); continue; }
      } else if (p.trips-- > 0 && newOuting(g, p)) {
        // (on to the next spot)
      } else { p.home = true; continue; }
    }
    const j = p.path[p.path.length - 1], tx = (j % w.w) + 0.5, ty = ((j / w.w) | 0) + 0.5;
    const dx = tx - p.x, dy = ty - p.y, d = Math.hypot(dx, dy);
    if (d <= sp) { p.x = tx; p.y = ty; p.path.pop(); if (!p.path.length && !p.home) p.pause = 3 + g.rng() * 6; } // stop and look for a while
    else { p.x += dx / d * sp; p.y += dy / d * sp; }
  }
}

function atlantaDaily(g) {
  momentsDaily(g);
  fillGaps(g);
  residentsDaily(g);
}

export default {
  id: 'atlanta',
  name: 'Atlanta suburbs',
  farm: 'Magnolia Ridge',
  region: 'Gwinnett County, Georgia',
  blurb: 'A 2006 subdivision where the oak woods used to be: identical houses, fenced Bermuda-grass yards, a Bradford pear out front, and a creek straightened into a mown ditch.',
  campaign: false,
  image: 'assets/maps/atlanta.jpg',
  // neighbors on the greenway trail give a little, often
  visitorValue: 0.8,
  // the streets, driveways and houses stay: people live here
  fixedRoads: true,
  lat: 33.95, lon: -84.02,
  pinLabel: 'se',
  plants: buildAtlantaPlants,
  animals: buildAtlantaAnimals,
  goals: GOALS,
  generate: generateSubdivision,
  borderCell: atlantaBorderCell,
  stats: suburbStats,
  // trees and shrubs don't seed themselves into established meadows and gardens here
  meadowsHold: true,
  daily: atlantaDaily,
  update: residentsUpdate,
  // an established native garden keeps invasives out, and fills its own gaps
  nativesHold: true,
  startView: { x: 36, y: 27, zoom: 0.85 },
  // remember how much fence and lawn the subdivision started with, for the goals
  onStart: g => { const s = g.world.stats || {}; g.flags.startCounts = { fence: s.fences || 0, turf: s.turf || 0 }; },
  startWildlife: [['graysquirrel', 4, 36, 52, 16], ['cardinal', 3, 20, 20, 10], ['opossum', 2, 20, 52, 6], ['cottontail', 3, 36, 2, 20],
    ['anole', 4, 36, 26, 20], ['bluegill', 6, 48, 51, 2], ['raccoon', 2, 56, 52, 6], ['toad', 2, 48, 49, 3]],
  startText: 'Spring, Year 1. The Bradford pears are in full, smelly bloom, the mowers are out, and Hollins Creek runs muddy and bare down its mown ditch.',
  story: `<p><b>The Magnolia Ridge homeowners' association has voted to go wild</b>, and asked you to lead it. In 2006 a builder clear-cut the oak woods here, scraped off the topsoil and laid out two streets of identical houses. Every yard got the same sod, the same boxwood and the same Bradford pear. Hollins Creek, which used to wind through the woods, runs down the middle in a straightened, mown ditch. Almost nothing lives here. The houses and streets are staying (people live here), but the yards, the creek and the common ground are yours to turn into a neighborhood that wildlife can share.</p>`,
  rules: [
    'You don\'t buy animals or upgrades. <b>You build habitat</b>, and wildlife follows its own rules: it wanders in from the woods on the ridge and the river when there\'s room, raises young, and moves on when there isn\'t enough.',
    '<b>The homes and streets stay.</b> You can\'t demolish houses, the clubhouse, the pavement or the street bridges over the creek. Fences can come down, and every yard can become a garden.',
    '<b>Lawn is a green desert.</b> Bermuda grass sod feeds nothing and nothing can be planted into it. Lift it with Remove → Pull invasives and plant at once, before it creeps back. Boxwood and crepe myrtle feed almost nothing either.',
    '<b>Flowers from spring to frost.</b> Bees and butterflies need something blooming every month from March to November, and the right caterpillar food plants: milkweed for monarchs, tulip poplar and spicebush for swallowtails, oaks for nearly everything.',
    '<b>Connect the canopy.</b> Squirrels, owls and flying squirrels travel through the treetops. Plant trees where their crowns will touch, yard to yard, and line the streets so the crowns meet overhead.',
    '<b>Invasives</b> came with the subdivision: Bradford pear, privet, nandina, English ivy, and kudzu climbing out of the easement. Cut, pull and replace them.',
    '<b>People are part of it.</b> Neighbors walk the greenway and the shady streets. A trail from a trailhead into the gardens and the river woods brings them out.',
  ],
  firstYear: [
    'Lift some <b>lawn</b> (Remove → Pull invasives) and sow a <b>pollinator garden</b> in the sunny yards.',
    'Plant <b>butterfly weed</b> for the monarchs, and <b>shade trees</b> along the street where the crowns can meet.',
    'Plant <b>shrubs and trees along Hollins Creek</b> to shade it, and dig a <b>rain garden</b> or two where the yards drain toward it.',
    'Pull the <b>privet</b> along the back fences and the creek, and cut the <b>Bradford pears</b>.',
  ],
  toolText: {
    pull: { icon: { plant: 'privet' }, desc: 'Dig out privet, nandina, English ivy, Japanese honeysuckle, kudzu and Bradford pear seedlings. Native plants are left alone.' },
    marsh: { name: 'Rain garden', desc: 'Dig a shallow basin that catches runoff from roofs, driveways and the street and lets it soak in. Plant it with the rain garden mix.' },
    pond: { desc: 'A wildlife pond: fish-free ponds are where toads and spring peepers breed.' },
    burn: { desc: 'A small, careful burn clears privet seedlings and dead growth in a meadow. Not near the houses.' },
    clear: { desc: 'Strip a tile back to bare soil: lawn, boxwood, whatever is on it. Then plant natives.' },
  },
  structureNames: { parking: 'Greenway trailhead', center: 'Nature center' },
  habitatNames: {
    FARM: 'Turf lawn', INVASIVE: 'Invasive tangle', MEADOW: 'Wildflower garden', SHRUB: 'Native shrubs',
    YOUNG_FOREST: 'Young canopy', MATURE_FOREST: 'Mature canopy', RIPARIAN: 'River buffer', CREEK: 'Outlet channel', BARE: 'Bare clay', DEVELOPED: 'Homes & streets',
  },
  terrainNames: { PASTURE: 'Lawn', GRAVEL: 'Riprap', MUD: 'Bare clay', FIELD: 'Graded lot', ROAD: 'Street' },

  climate: {
    seasons: ['Spring', 'Summer', 'Fall', 'Winter'],
    // Atlanta: rain all year, summer thunderstorms, a dry spell in early fall, mild winters
    rain: [0.34, 0.3, 0.3, 0.34, 0.38, 0.32, 0.22, 0.2, 0.26, 0.32, 0.34, 0.32],
    growth: [0.9, 1.0, 1.0, 0.95, 0.85, 0.85, 0.85, 0.7, 0.45, 0.2, 0.2, 0.4],
    spread: [1.0, 1.0, 1.0, 0.9, 0.8, 0.8, 0.9, 0.9, 0.6, 0.3, 0.3, 0.6],
    moist: [0.06, 0.04, 0.02, 0.0, -0.02, -0.04, -0.08, -0.08, 0.0, 0.06, 0.08, 0.08],
    snow: { months: [10], chance: () => 0.06 }, // a dusting in January, once in a while
    fireMonths: [6, 7],
    fireRate: 0.3, fireGap: 90, crownFires: false,
    floodMonths: [0, 11, 10],
    tips: [
      'Spring: the best time to plant, and the pears and privet are easy to spot in bloom.',
      'Summer: long, hot and humid. Water new plantings, and let the meadows grow tall.',
      'Fall: goldenrod and aster feed the monarchs heading for Mexico. Plant trees now.',
      'Winter: mild and wet. Leave the seed heads standing for the birds, and the leaves on the beds.',
    ],
    fireCause: ['Lightning in a dry spell', 'A cigarette thrown from a car on Ridge Road'],
  },
  seedRain: {
    N: ['whiteoak', 'tulippoplar', 'loblolly', 'sweetgum', 'dogwood', 'redmaple', 'fern', 'phlox', 'kudzu'],
    E: ['callery', 'callery', 'privet', 'nandina', 'turf', 'ivy'],
    W: ['callery', 'privet', 'honeysuckle', 'turf'],
    S: ['sycamore', 'riverbirch', 'redmaple', 'privet', 'privet', 'sedge', 'switchgrass'],
  },
  windSeeds: ['redmaple', 'tulippoplar', 'loblolly', 'sweetgum', 'goldenrod', 'aster', 'swampmilkweed', 'butterflyweed'],
  berrySeeds: ['privet', 'nandina', 'honeysuckle', 'callery', 'beautyberry', 'elderberry', 'spicebush', 'dogwood', 'blackcherry'],
  floodSeeds: ['sycamore', 'riverbirch', 'sedge', 'switchgrass', 'privet'],
  burnSeeds: ['bluestem', 'goldenrod', 'aster', 'blackeyed', 'coreopsis', 'honeysuckle'],

  text: {
    edges: { N: 'the Ridge woods to the north', E: 'the next subdivision to the east', S: 'the Yellow River', W: 'Ridge Road and the subdivision across it' },
    creekFish: 'bluegill', culvertBlocks: 'fish', fenceBlocks: 'box turtles, foxes and deer',
    flood: 'The Yellow River is up!',
    floodOut: 'Fresh silt covers the river buffer. Sycamore and river birch seed into it, and so does privet.',
    fireOutRain: 'The grass will come back from the roots within weeks.',
    fireOut: 'Most of it was lawn and mulch. Native meadow plants resprout.',
    crownOut: 'Standing dead trees will host woodpeckers and owls.',
  },
  look: {
    // humid Southern light: soft, green, a little hazy in summer
    grade: { gain: [1.0, 1.01, 0.98], lift: [0.004, 0.004, 0.002], sat: 1.04, contrast: 1.06 },
    pasture: ['#7cae4c', '#86b452', '#98a45a', '#b2a878'], // sod: green in spring and summer, dormant tan by winter
    soil: [0.4, 0.29, 0.2], mud: [0.6, 0.33, 0.22],        // planting beds are mulched; raw red clay only where banks erode
    asphalt: true,                                          // paved streets, not dirt tracks
    picket: true,                                           // white picket fences
    lush: true,                                             // mature wildflower beds drawn thick and full
    water: { pond: [0.36, 0.46, 0.4, 0.85], creek: [0.4, 0.5, 0.44, 0.8], river: [0.44, 0.4, 0.3, 0.9], marsh: [0.4, 0.5, 0.36, 0.55] }, // the Yellow River runs red-brown with clay
    light: [
      { sun: 0xfff6ea, sunI: 2.7, sky: 0xe4eef4, ground: 0x5a6a3a, hemiI: 1.2 },
      { sun: 0xfff2e0, sunI: 2.85, sky: 0xe2ecf0, ground: 0x5a6a38, hemiI: 1.2 },
      { sun: 0xffecd4, sunI: 2.6, sky: 0xe8eaee, ground: 0x66623e, hemiI: 1.15 },
      { sun: 0xfff4ea, sunI: 2.3, sky: 0xe0e6ec, ground: 0x5e604a, hemiI: 1.18 },
    ],
    ambience: {
      leaves: [0, 0, 0.9, 0.2], fluff: [0.4, 0.5, 0.6, 0], mist: [0.25, 0.15, 0.2, 0.3],
      leafColors: ['#d0402a', '#e8b030', '#b8603a', '#8a2a4a'],
      petals: [0.8, 0, 0, 0.15],                            // blossom falling from redbud, dogwood and cherry
      flocks: [['songbirds', 'swallows'], ['swallows', 'songbirds'], ['geese', 'songbirds', 'goldfinches'], ['goldfinches', 'goldfinches', 'geese']],
    },
    tint: ['rgba(255,250,235,0)', 'rgba(255,245,220,0.015)', 'rgba(255,240,220,0.01)', 'rgba(240,244,250,0)'],
  },
};
