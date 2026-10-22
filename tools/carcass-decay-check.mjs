// Checks how a kill is drawn breaking down (js/render3d/carcass-decay.js): eating and time both
// strip it, never restore it; it ends as bones that all go; carcasses without the starting counts
// still draw; every species that leaves a carcass gets a skeleton that fits inside its body, its
// ribs starting at its spine, keeping its horns, antlers or tusks; pool slots used for a carcass go
// back to a live animal's look; and animals that die naturally leave a body (sim/animal-life.js
// leaveBody) that starts whole and never crowds out a kill.
// node tools/carcass-decay-check.mjs [--print]
import { register } from 'node:module';
register('./three-loader.mjs', import.meta.url);
const THREE = await import('three');
const { carcassDecay, carcassAnatomy, remainsGeometry, Remains } = await import('../js/render3d/carcass-decay.js');
const { Fauna, carcassPhase } = await import('../js/render3d/animals/animal-pools.js');
const { buildSpecies } = await import('../js/render3d/animals/animal-model.js');
const { createAnimals, drawDef } = await import('../js/data/animals.js');
const { leaveBody, startFeed } = await import('../js/sim/animal-life.js');

let fails = 0;
const ok = (cond, msg) => { if (!cond) { fails++; console.log('FAIL', msg); } };
const print = process.argv.includes('--print');
const lum = c => c[0] * 0.3 + c[1] * 0.55 + c[2] * 0.15;

// A deer kill as sim/animal-life.js startFeed makes it: 2 days for the hunter, 25 more, 3 meals.
const max = 27, feed = 2;
const at = (t, meals) => carcassDecay({ t, max, feed, meals, meals0: 3 });

// time alone (nobody comes): every stage only advances
let prev = null;
const STAGES = ['strip', 'wither', 'settle', 'scatter', 'gone'];
for (let t = max; t >= 0; t -= 0.5) {
  const d = at(Math.max(t, 0), 3);
  if (print && t % 3 === 0) console.log(`t ${t.toFixed(1).padStart(4)}  ${STAGES.map(k => `${k} ${d[k].toFixed(2)}`).join('  ')}  dry ${d.dry.toFixed(2)}  bone ${lum(d.bone).toFixed(2)}  ${d.body ? 'body' : ''} ${d.bones ? 'bones' : ''}`);
  if (prev) {
    for (const k of STAGES) ok(d[k] >= prev[k] - 1e-9, `${k} went back at t=${t}`);
    ok(lum(d.bone) >= lum(prev.bone) - 1e-9, `bones darkened at t=${t}`);
  }
  prev = d;
}
const fresh = at(max, 3), end = at(0, 3);
ok(fresh.strip === 0 && fresh.wither === 0 && fresh.body && !fresh.bones, 'a fresh kill is whole, with no bones drawn');
ok(fresh.dry === 0 && end.dry === 1, 'a fresh kill keeps its own colours; an old one has dried');
ok(!end.body && end.gone === 1, 'at the end the flesh and every bone are gone');
const pile = at(max * 0.22, 3); // (u 0.78)
ok(!pile.body && pile.bones && pile.settle === 1 && pile.gone < 0.5, 'three-quarters through, a pile of bones with most still there');
ok(lum(end.bone) > 0.8, 'old bones are pale');

// the hunter's meal, then each scavenger meal, strips it further at the same moment
const mid = max - 4;
ok(at(max - feed, 3).strip > 0.25, 'the hunter eats about a third');
for (let m = 3; m > 0; m--) ok(at(mid, m - 1).strip > at(mid, m).strip + 0.1, `a scavenger meal (${m} -> ${m - 1} left) strips it`);

// a body left by a natural death starts whole: no hunter took the first share
const natural = carcassDecay({ t: max, max, feed: 0, meals: 3, meals0: 3, by: null });
ok(natural.strip === 0 && natural.eaten === 0, 'a natural death starts whole');
ok(carcassDecay({ t: max - 4, max, feed: 0, meals: 1, meals0: 3, by: null }).strip > 0.3, 'scavengers strip a natural death too');

// carcasses made before meals0/feed existed, or by other code, still draw sensibly
const finite = d => Object.values(d).flat().every(v => typeof v === 'boolean' || Number.isFinite(v));
ok(finite(carcassDecay({ t: 10, max: 20, meals: 2 })), 'no NaNs without meals0/feed');
ok(finite(carcassDecay({ t: 5, max: 0, meals: 0 })), 'no NaNs with max 0');

// every species that leaves a carcass: a skeleton inside its body, ribs from the spine
const maps = ['pnw', 'serengeti', 'amazon', 'sumatra', 'chinandega', 'atlanta'];
let species = 0;
for (const map of maps) {
  const build = (await import(`../js/data/animals-${map}.js`)).default;
  const list = createAnimals(build, map), defs = list.animals || list;
  for (const def of defs) {
    if (!((def.sprite?.len || 0) >= 20 && def.move !== 'swim' && def.move !== 'fly')) continue;
    species++;
    const name = `${map} ${def.key}`;
    const { geo, motion } = buildSpecies(def), a = carcassAnatomy(geo, motion), H = a.spineY - a.bellyY;
    geo.computeBoundingBox();
    const body = geo.boundingBox.clone().expandByScalar(H * 0.15);
    ok(H > 0 && a.W > 0 && a.front > a.back && a.x1 > a.x0, `${name}: torso measured (${a.spineY.toFixed(1)} over ${a.bellyY.toFixed(1)}, ${a.back.toFixed(1)}..${a.front.toFixed(1)})`);
    ok(a.hips.filter(Boolean).length === 4 && a.hips.every((h, k) => !h || h.y > a.feet[k].y), `${name}: four legs, hips above feet`);
    ok(a.snout.x > a.neck.x, `${name}: snout ahead of the neck`);
    const g = remainsGeometry(a, 3), p = g.attributes.position, box = new THREE.Box3().setFromBufferAttribute(p);
    ok(p.array.every(Number.isFinite) && ['aCenter', 'aScatter', 'aBone', 'color', 'normal'].every(k => g.attributes[k]), `${name}: bones geometry is complete`);
    ok(body.containsBox(box), `${name}: bones fit inside the body`);
    // the ribs (kind 1): each piece's top at the spine, reaching most of the way to the belly
    const pieces = new Map(), bones = g.attributes.aBone, cen = g.attributes.aCenter;
    for (let i = 0; i < p.count; i++) {
      if (Math.round(bones.getW(i)) !== 1) continue;
      const key = `${cen.getX(i)},${cen.getY(i)},${cen.getZ(i)}`;
      const e = pieces.get(key) || { top: -Infinity, low: Infinity };
      e.top = Math.max(e.top, p.getY(i)); e.low = Math.min(e.low, p.getY(i));
      pieces.set(key, e);
    }
    const ribs = [...pieces.values()];
    ok(ribs.length === 18 && ribs.every(e => Math.abs(e.top - a.spineY) < H * 0.08 && e.top - e.low > H * 0.4), `${name}: ${ribs.length} ribs, each rising to the spine`);
    ok(new Set(Array.from(bones.array).filter((_, i) => i % 4 === 0)).size > 20 && Math.max(...Array.from(bones.array).filter((_, i) => i % 4 === 0)) < 1, `${name}: bones go at different points, all before the end`);
  }
}
ok(species >= 10, `found the carcass species (${species})`);

// horns, antlers and tusks stay on the skeleton (the adult male look, where there is one)
const HORNED = { pnw: ['elk', 'deer'], serengeti: ['wildebeest', 'buffalo', 'giraffe', 'rhino', 'elephant', 'warthog', 'impala', 'gazelle', 'topi'], sumatra: ['sumrhino', 'gajah', 'sambar', 'boar'] };
for (const [map, keys] of Object.entries(HORNED)) {
  const list = createAnimals((await import(`../js/data/animals-${map}.js`)).default, map), defs = list.animals || list;
  for (const key of keys) {
    const base = defs.find(d => d.key === key);
    if (!base) { ok(false, `${map} ${key}: species found`); continue; }
    const def = base.sprite.male ? { ...base, sprite: { ...base.sprite, ...base.sprite.male } } : base;
    const { geo, motion } = buildSpecies(def), a = carcassAnatomy(geo, motion), g = remainsGeometry(a, 3), kinds = g.attributes.aBone;
    let n = 0; for (let i = 0; i < kinds.count; i++) if (Math.round(kinds.getW(i)) === 6) n++;
    ok(a.hard && n === a.hard.attributes.position.count && n > 30, `${map} ${key}: skeleton keeps its horns, antlers or tusks (${n} vertices)`);
    // and they grow from the skull: each separate horn, antler or tusk touches it
    const skullPts = [], hardPts = [], p = g.attributes.position;
    for (let i = 0; i < p.count; i++) { const w = Math.round(kinds.getW(i)); if (w === 5) skullPts.push(new THREE.Vector3().fromBufferAttribute(p, i)); else if (w === 6) hardPts.push(new THREE.Vector3().fromBufferAttribute(p, i)); }
    const gap = Math.min(...hardPts.filter(v => v.z > 0).map(v => Math.min(...skullPts.map(q => q.distanceTo(v)))));
    ok(gap < a.skull.len * 0.08, `${map} ${key}: horns, antlers or tusks touch the skull (gap ${(gap / a.skull.len).toFixed(3)} skull lengths)`);
  }
}
{
  const list = createAnimals((await import('../js/data/animals-serengeti.js')).default, 'serengeti'), zebra = (list.animals || list).find(d => d.key === 'zebra');
  ok(!carcassAnatomy(buildSpecies(zebra).geo).hard, 'a zebra has nothing hard to keep');
}

// natural deaths: big land animals leave a body, small, flying and swimming ones don't; a full
// list sheds the oldest natural body before any kill
{
  const list = createAnimals((await import('../js/data/animals-serengeti.js')).default, 'serengeti'), defs = list.animals || list;
  const wl = { carcasses: [], agents: [], game: { catalog: { animals: defs }, world: { inb: () => true, idx: () => 0 } } };
  const idx = key => defs.findIndex(d => d.key === key), an = (key, id) => ({ id, sp: idx(key), x: 10, y: 10, age: 900, orientation: 0.5 });
  ok(leaveBody(wl, an('wildebeest', 1)) && wl.carcasses.length === 1, 'a wildebeest that dies naturally leaves a body');
  const c = wl.carcasses[0];
  ok(c.by == null && c.meals === c.meals0 && c.meals > 0 && c.t >= 21 && c.t <= 33 && c.max === c.t, 'the body has meals for scavengers and lasts 21-33 days');
  const small = defs.find(d => !((d.sprite.len || 0) >= 20 && d.move !== 'swim' && d.move !== 'fly') && d.move === 'ground'), bird = defs.find(d => d.move === 'fly');
  ok(!leaveBody(wl, { ...an('zebra', 2), sp: defs.indexOf(small) }) && !leaveBody(wl, { ...an('zebra', 3), sp: defs.indexOf(bird) }), `no body for small animals (${small.key}) or birds (${bird.key})`);
  ok(!leaveBody(wl, { ...an('zebra', 4), leaving: true }), 'no body for an animal walking off the map');
  wl.carcasses = [];
  for (let k = 0; k < 8; k++) wl.carcasses.push({ id: 100 + k, by: idx('lion'), t: 20, max: 20, meals: 1, meals0: 1 });
  for (let k = 0; k < 8; k++) leaveBody(wl, an('zebra', 200 + k));
  leaveBody(wl, an('zebra', 300));
  ok(wl.carcasses.length === 16 && wl.carcasses.filter(o => o.by != null).length === 8 && !wl.carcasses.some(o => o.id === 200), 'a full list drops the oldest natural body, never a kill');
}

// every species' animal shader stays within 15 vertex attributes: WebGL guarantees 16, but ANGLE
// (Chrome on Windows, and headless Chrome here) can keep one for itself, so the canopy climbers'
// 15 was already the most that links ("Too many attributes"). Counted as the pool geometry's
// attributes plus 4 for the instance matrix.
{
  const F2 = new Fauna(new THREE.Scene());
  let worst = 0, worstName = '';
  for (const map of [...maps, 'reef']) {
    const list = createAnimals((await import(`../js/data/animals-${map}.js`)).default, map), defs = list.animals || list;
    for (const base of defs) for (const def of [base, ...(base.sprite.male ? [{ ...base, key: base.key + '-male', sprite: { ...base.sprite, ...base.sprite.male } }] : [])]) {
      const p = F2.pool(def), n = Object.keys(p.geo.attributes).length + 4 + (p.mesh.instanceColor ? 1 : 0);
      if (n > worst) { worst = n; worstName = `${map} ${def.key}`; }
    }
  }
  ok(worst <= 15, `animal shaders use at most 15 vertex attributes (most: ${worst}, ${worstName})`);
  if (print) console.log(`vertex attributes: at most ${worst} (${worstName})`);
}

// pools: a carcass carries its decay in its animation phase (decoded as the shader does); the
// next frame a live animal in that slot has its own phase again
const decode = ph => { const c = -ph - 100000; return [c % 64, Math.floor(c / 64) % 64, Math.floor(c / 4096)].map(v => v / 63); };
for (const d of [{ strip: 0, wither: 0, dry: 0 }, { strip: 1, wither: 1, dry: 1 }, { strip: 0.7, wither: 0.2, dry: 0.4 }]) {
  const out = decode(carcassPhase(d));
  ok(carcassPhase(d) < -99999 && out.every((v, k) => Math.abs(v - [d.strip, d.wither, d.dry][k]) <= 0.5 / 63 + 1e-9), `decay ${JSON.stringify(d)} survives the phase encoding`);
}
const scene = new THREE.Scene(), F = new Fauna(scene), def = { key: 'deer', sprite: { kind: 'deer', len: 30, h: 20, leg: 10 } };
F.begin(); F.add(def, 0, 0, 0, 0, 1, 2.5, 0, 0, 0, 0, Math.PI / 2, null, false, { strip: 0.7, wither: 0.2, dry: 0.4 }); F.end();
const pool = F.species.get(F.modelKey(def)), anim = pool.anim.array;
ok(!pool.mesh.instanceColor && !pool.geo.attributes.aDecay && anim[0] === carcassPhase({ strip: 0.7, wither: 0.2, dry: 0.4 }), 'a carcass slot carries its decay in its phase, with no attribute of its own');
F.begin(); F.add(def, 0, 0, 0, 0, 1, 2.5, 0, 0, 0); F.end();
ok(anim[0] === 2.5, 'a live animal reusing the slot has its own phase');

const R = new Remains(scene), anatomy = carcassAnatomy(pool.geo), d = carcassDecay({ t: 5, max: 20, meals: 0, meals0: 2, feed: 1 });
R.begin(); for (let k = 0; k < 20; k++) R.add('deer', anatomy, k, 0, 0, 0, k % 2 ? Math.PI / 2 : -Math.PI / 2, 0.02, 0.1, d); R.end();
const rp = R.pools.get('deer');
ok(rp.mesh.count === 20 && Math.abs(rp.state.getX(19) - d.gone) < 1e-6 && Math.abs(rp.ground.getX(19) - 5) < 1e-4 && Math.abs(rp.ground.getX(18) + 5) < 1e-4, 'bones pool grows and keeps state, ground on the down side');
R.begin(); R.end();
ok(!rp.mesh.visible, 'no bones drawn without carcasses');

console.log(fails ? `${fails} failure(s)` : `carcass decay: all checks pass (${species} species)`);
process.exit(fails ? 1 : 0);
