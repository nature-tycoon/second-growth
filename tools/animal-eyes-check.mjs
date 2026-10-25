// Checks that every animal's eyes show: each species is built (its usual and its close-up model),
// and an eye counts as showing when enough of its surface sees out past the rest of the model
// (a ray out along its normal meets nothing), and its showing part is big enough for the head.
// Eyes are the vertices the model marks as an eye (gloss 2: a normal of length over 4, see
// render3d/animals/animal-surface.js). Fails list the species with buried or pinpoint eyes.
// node tools/animal-eyes-check.mjs [--print] [map:key …]
import { register } from 'node:module';
register('./three-loader.mjs', import.meta.url);
const THREE = await import('three');
const { buildSpecies } = await import('../js/render3d/animals/animal-model.js');
const { createAnimals } = await import('../js/data/animals.js');

const args = process.argv.slice(2), print = args.includes('--print'), only = args.filter(a => a.includes(':'));
const HEAD = 8;
const MIN_SHOWING = 0.05; // share of an eye's vertices that see out (a ball half set into the head shows about 0.4; lids and brows hide some)
const MIN_SIZE = 0.045;   // the showing eye's width over the head's height (where the eyes are)

let fails = 0;
const ok = (cond, msg) => { if (!cond) { fails++; console.log('FAIL', msg); } };

function measure(geo) {
  const pos = geo.attributes.position, nor = geo.attributes.normal, part = geo.attributes.aPart, n = pos.count;
  const isEye = i => Math.hypot(nor.getX(i), nor.getY(i), nor.getZ(i)) > 3.5;
  // everything that isn't an eye, as one mesh to cast rays at
  const index = geo.index ? geo.index.array : Uint32Array.from({ length: n }, (_, i) => i), tri = [];
  for (let t = 0; t < index.length; t += 3) if (!isEye(index[t])) tri.push(index[t], index[t + 1], index[t + 2]);
  const solid = new THREE.BufferGeometry();
  solid.setAttribute('position', pos); solid.setIndex(tri);
  const mesh = new THREE.Mesh(solid, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
  const ray = new THREE.Raycaster(), p = new THREE.Vector3(), d = new THREE.Vector3();
  // the head's height round the eyes: head vertices within a slice of x about the eyes
  const eyes = [], head = [];
  for (let i = 0; i < n; i++) (isEye(i) ? eyes : part && part.getX(i) === HEAD ? head : []).push(i);
  if (!eyes.length) return null;
  let ex = 0; for (const i of eyes) ex += pos.getX(i); ex /= eyes.length;
  const box = new THREE.Box3();
  if (!geo.boundingBox) geo.computeBoundingBox();
  const size = geo.boundingBox.getSize(new THREE.Vector3()), span = Math.max(size.x, size.y, size.z);
  const slice = head.filter(i => Math.abs(pos.getX(i) - ex) < span * 0.04);
  for (const i of slice.length ? slice : head) box.expandByPoint(p.fromBufferAttribute(pos, i));
  const headH = box.isEmpty() ? span * 0.2 : box.max.y - box.min.y;
  // one side's eye (z > 0): how much of it sees out, and how wide the showing part is
  const side = eyes.filter(i => pos.getZ(i) > 0), seen = new THREE.Box3();
  let showing = 0;
  for (const i of side) {
    d.fromBufferAttribute(nor, i).normalize();
    p.fromBufferAttribute(pos, i).addScaledVector(d, span * 0.002);
    ray.set(p, d); ray.far = span * 0.3;
    if (!ray.intersectObject(mesh, false).length) { showing++; seen.expandByPoint(p); }
  }
  const sz = seen.isEmpty() ? 0 : Math.max(seen.max.x - seen.min.x, seen.max.y - seen.min.y);
  return { showing: showing / Math.max(1, side.length), size: sz / headH };
}

const maps = ['pnw', 'serengeti', 'amazon', 'sumatra', 'chinandega', 'atlanta', 'reef'];
const rows = [];
for (const map of maps) {
  const list = createAnimals((await import(`../js/data/animals-${map}.js`)).default, map), defs = list.animals || list;
  for (const def of defs) {
    if (only.length && !only.includes(`${map}:${def.key}`)) continue;
    for (const close of [false, true]) {
      const r = measure(buildSpecies(def, { close }).geo);
      if (!r) continue; // (no eyes drawn: insects, worms, a few fish)
      const name = `${map}:${def.key}${close ? ' (close)' : ''}`;
      rows.push([name, r]);
      ok(r.showing >= MIN_SHOWING, `${name}: eyes buried (${(r.showing * 100).toFixed(0)}% showing)`);
      ok(r.size >= MIN_SIZE, `${name}: eyes too small (${(r.size * 100).toFixed(1)}% of the head's height)`);
    }
  }
}
if (print) for (const [name, r] of rows.sort((a, b) => a[1].size - b[1].size)) console.log(name.padEnd(34), `showing ${(r.showing * 100).toFixed(0).padStart(3)}%`, `size ${(r.size * 100).toFixed(1).padStart(5)}% of head`);
console.log(fails ? `${fails} failed` : `animal eyes ok (${rows.length} models)`);
process.exit(fails ? 1 : 0);
