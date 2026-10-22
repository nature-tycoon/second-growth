// Checks how a kill is drawn breaking down (js/render3d/carcass-decay.js): eating and time both
// strip it, never restore it; the ribs show once it's stripped; it darkens as it rots and the bones
// bleach; carcasses without the starting counts still draw; and a pool slot tinted for a carcass
// goes back to white when a live animal takes it. node tools/carcass-decay-check.mjs [--print]
import { register } from 'node:module';
register('./three-loader.mjs', import.meta.url);
const THREE = await import('three');
const { carcassDecay, remainsGeometry, Remains } = await import('../js/render3d/carcass-decay.js');
const { Fauna } = await import('../js/render3d/animals/animal-pools.js');

let fails = 0;
const ok = (cond, msg) => { if (!cond) { fails++; console.log('FAIL', msg); } };
const print = process.argv.includes('--print');
const lum = c => c[0] * 0.3 + c[1] * 0.55 + c[2] * 0.15;

// A deer kill as sim/animal-life.js startFeed makes it: 2 days for the hunter, 25 more, 3 meals.
const max = 27, feed = 2;
const at = (t, meals) => carcassDecay({ t, max, feed, meals, meals0: 3 });

// time alone (nobody comes): flesh only falls, body darkens, bones bleach, and it sinks at the end
let prev = null;
for (let t = max; t >= 0; t -= 0.5) {
  const d = at(Math.max(t, 0.01), 3);
  if (print && t % 3 === 0) console.log(`t ${t.toFixed(1).padStart(4)}  flesh ${d.flesh.toFixed(2)}  rot ${d.rot.toFixed(2)}  sink ${d.sink.toFixed(2)}  body ${lum(d.tint).toFixed(2)}  bone ${lum(d.bone).toFixed(2)}  ${d.bones ? 'bones' : ''}`);
  if (prev) {
    ok(d.flesh <= prev.flesh + 1e-9, `flesh rose as time passed at t=${t}`);
    ok(d.rot >= prev.rot - 1e-9, `rot fell at t=${t}`);
    ok(lum(d.bone) >= lum(prev.bone) - 1e-9, `bones darkened at t=${t}`);
    ok(d.sink >= prev.sink - 1e-9, `rose out of the ground at t=${t}`);
  }
  prev = d;
}
const fresh = at(max, 3), end = at(0.01, 3);
ok(fresh.flesh > 0.99 && !fresh.bones && fresh.sink === 0, 'a fresh kill is whole, with no bones showing and not sunk');
ok(Math.abs(lum(fresh.tint) - 1) < 1e-9, 'a fresh kill keeps its own colours');
ok(end.flesh < 0.05 && end.bones && end.sink > 0.9, 'at the end it is bones, sinking away');
ok(lum(end.tint) < 0.45, 'a rotted kill is dark');
ok(lum(end.bone) > 0.9, 'old bones are pale');

// the hunter's meal, then each scavenger meal, strips it further at the same moment
const mid = max - 6;
ok(at(max - feed, 3).flesh < at(max - 0.01, 3).flesh - 0.25, 'the hunter eats about a third');
for (let m = 3; m > 0; m--) ok(at(mid, m - 1).flesh < at(mid, m).flesh - 0.1, `a scavenger meal (${m} -> ${m - 1} left) strips it`);
// (the ribs stand about a quarter of the body's depth high: they show through once flesh < ~0.26)
ok(at(mid, 0).flesh < 0.26 && at(mid, 3).flesh > 0.26 && at(mid, 0).bones, 'stripped by scavengers, the ribs show well before rot alone would bare them');
ok(at(mid, 0).tint[1] < at(mid, 3).tint[1], 'an eaten kill shows redder (less green) than an untouched one');

// carcasses made before meals0/feed existed, or by other code, still draw sensibly
const legacy = carcassDecay({ t: 10, max: 20, meals: 2 });
ok(Object.values(legacy).flat().every(v => typeof v === 'boolean' || Number.isFinite(v)), 'no NaNs without meals0/feed');
ok(Number.isFinite(carcassDecay({ t: 5, max: 0, meals: 0 }).flesh), 'no NaNs with max 0');

// geometry: finite, lying on the ground, about unit length
const g = remainsGeometry(), p = g.attributes.position;
const box = new THREE.Box3().setFromBufferAttribute(p);
ok(p.array.every(Number.isFinite) && g.attributes.color && g.attributes.normal, 'bones geometry is complete');
ok(box.min.y > -0.05 && box.max.x - box.min.x > 0.8 && box.max.x - box.min.x < 1.3, `bones lie on the ground, about unit length (${box.min.toArray().map(v => v.toFixed(2))} .. ${box.max.toArray().map(v => v.toFixed(2))})`);

// pools: a carcass tints its slot and flattens it; the next frame a live animal in that slot is white
const scene = new THREE.Scene(), F = new Fauna(scene), def = { key: 'deer', sprite: { kind: 'deer', len: 30, h: 20, leg: 10 } };
F.begin(); F.add(def, 0, 0, 0, 0, 1, 0, 0, 0, 0.6, 0, Math.PI / 2, null, false, { flat: 0.3, tint: [0.4, 0.35, 0.28] }); F.end();
const pool = F.species.get(F.modelKey(def)), col = pool.mesh.instanceColor.array;
ok(Math.abs(col[0] - 0.4) < 1e-6 && Math.abs(col[2] - 0.28) < 1e-6, 'a carcass slot carries its tint');
const m = new THREE.Matrix4(), s = new THREE.Vector3();
pool.mesh.getMatrixAt(0, m); m.decompose(new THREE.Vector3(), new THREE.Quaternion(), s);
ok(Math.abs(s.z - 0.3) < 1e-6 && Math.abs(s.x - 1) < 1e-6, 'a carcass is flattened across its body');
F.begin(); F.add(def, 0, 0, 0, 0, 1, 0, 0, 0, 0); F.end();
ok(col[0] === 1 && col[1] === 1 && col[2] === 1, 'a live animal reusing the slot is white again');
F.begin();
for (let k = 0; k < 40; k++) F.add(def, k, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, null, false, k === 3 ? { flat: 1, tint: [0.5, 0.5, 0.5] } : null);
F.end();
ok(pool.mesh.instanceColor.array[3 * 3] === 0.5 && pool.mesh.instanceColor.array[4 * 3] === 1, 'tints survive the pool growing');

const R = new Remains(scene);
R.begin(); for (let k = 0; k < 20; k++) R.add(k, 0, 0, 0, 1, 0.5, k % 2 ? 1 : -1, [1, 0.9, 0.8]); R.end();
ok(R.mesh.count === 20 && Math.abs(R.mesh.instanceColor.array[19 * 3 + 2] - 0.8) < 1e-6, 'bones pool grows and keeps colours');
R.begin(); R.end();
ok(!R.mesh.visible, 'no bones drawn without carcasses');

console.log(fails ? `${fails} failure(s)` : 'carcass decay: all checks pass');
process.exit(fails ? 1 : 0);
