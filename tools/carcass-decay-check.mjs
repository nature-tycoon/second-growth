// Checks how a kill is drawn breaking down (js/render3d/carcass-decay.js): eating and time both
// strip it, never restore it; it ends as bones that all go; carcasses without the starting counts
// still draw; every species that leaves a carcass gets a skeleton that fits inside its body, its
// ribs starting at its spine; and pool slots used for a carcass go back to a live animal's look.
// node tools/carcass-decay-check.mjs [--print]
import { register } from 'node:module';
register('./three-loader.mjs', import.meta.url);
const THREE = await import('three');
const { carcassDecay, carcassAnatomy, remainsGeometry, Remains } = await import('../js/render3d/carcass-decay.js');
const { Fauna } = await import('../js/render3d/animals/animal-pools.js');
const { buildSpecies } = await import('../js/render3d/animals/animal-model.js');
const { createAnimals } = await import('../js/data/animals.js');

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
  if (print && t % 3 === 0) console.log(`t ${t.toFixed(1).padStart(4)}  ${STAGES.map(k => `${k} ${d[k].toFixed(2)}`).join('  ')}  body ${lum(d.tint).toFixed(2)}  bone ${lum(d.bone).toFixed(2)}  ${d.body ? 'body' : ''} ${d.bones ? 'bones' : ''}`);
  if (prev) {
    for (const k of STAGES) ok(d[k] >= prev[k] - 1e-9, `${k} went back at t=${t}`);
    ok(lum(d.bone) >= lum(prev.bone) - 1e-9, `bones darkened at t=${t}`);
  }
  prev = d;
}
const fresh = at(max, 3), end = at(0, 3);
ok(fresh.strip === 0 && fresh.wither === 0 && fresh.body && !fresh.bones, 'a fresh kill is whole, with no bones drawn');
ok(Math.abs(lum(fresh.tint) - 1) < 1e-9, 'a fresh kill keeps its own colours');
ok(!end.body && end.gone === 1, 'at the end the flesh and every bone are gone');
const pile = at(max * 0.22, 3); // (u 0.78)
ok(!pile.body && pile.bones && pile.settle === 1 && pile.gone < 0.5, 'three-quarters through, a pile of bones with most still there');
ok(lum(end.bone) > 0.8, 'old bones are pale');

// the hunter's meal, then each scavenger meal, strips it further at the same moment
const mid = max - 4;
ok(at(max - feed, 3).strip > 0.25, 'the hunter eats about a third');
for (let m = 3; m > 0; m--) ok(at(mid, m - 1).strip > at(mid, m).strip + 0.1, `a scavenger meal (${m} -> ${m - 1} left) strips it`);

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
    const { geo } = buildSpecies(def), a = carcassAnatomy(geo), H = a.spineY - a.bellyY;
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

// pools: a carcass tints and decays its slot; next frame a live animal in that slot is back to normal
const scene = new THREE.Scene(), F = new Fauna(scene), def = { key: 'deer', sprite: { kind: 'deer', len: 30, h: 20, leg: 10 } };
F.begin(); F.add(def, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, Math.PI / 2, null, false, { tint: [0.4, 0.35, 0.28], strip: 0.7, wither: 0.2, dry: 0.4 }); F.end();
const pool = F.species.get(F.modelKey(def)), col = pool.mesh.instanceColor.array, dec = pool.decay.array;
const D = 3;
ok(Math.abs(col[0] - 0.4) < 1e-6 && Math.abs(dec[0] - 0.7) < 1e-6 && Math.abs(dec[1] - 0.2) < 1e-6 && Math.abs(dec[2] - 0.4) < 1e-6, 'a carcass slot carries its tint and decay');
F.begin(); F.add(def, 0, 0, 0, 0, 1, 0, 0, 0, 0); F.end();
ok(col[0] === 1 && col[1] === 1 && col[2] === 1 && dec[0] === 0 && dec[1] === 0 && dec[2] === 0, 'a live animal reusing the slot is whole and white again');
F.begin();
for (let k = 0; k < 40; k++) F.add(def, k, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, null, false, k === 3 ? { tint: [0.5, 0.5, 0.5], strip: 0.5, wither: 0 } : null);
F.end();
ok(pool.mesh.instanceColor.array[9] === 0.5 && pool.decay.array[3 * D] === 0.5 && pool.mesh.instanceColor.array[12] === 1, 'tints and decay survive the pool growing');

const R = new Remains(scene), anatomy = carcassAnatomy(pool.geo), d = carcassDecay({ t: 5, max: 20, meals: 0, meals0: 2, feed: 1 });
R.begin(); for (let k = 0; k < 20; k++) R.add('deer', anatomy, k, 0, 0, 0, k % 2 ? Math.PI / 2 : -Math.PI / 2, 0.02, 0.1, d); R.end();
const rp = R.pools.get('deer');
ok(rp.mesh.count === 20 && Math.abs(rp.state.getX(19) - d.gone) < 1e-6 && Math.abs(rp.ground.getX(19) - 5) < 1e-4 && Math.abs(rp.ground.getX(18) + 5) < 1e-4, 'bones pool grows and keeps state, ground on the down side');
R.begin(); R.end();
ok(!rp.mesh.visible, 'no bones drawn without carcasses');

console.log(fails ? `${fails} failure(s)` : `carcass decay: all checks pass (${species} species)`);
process.exit(fails ? 1 : 0);
