// Keep model building independent of live farms and GPU instance management.
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../js/render3d/', import.meta.url));
const geometry = (await readdir(resolve(root, 'geometry'))).filter(n => n.endsWith('.js')).map(n => 'geometry/' + n);
const animals = (await readdir(resolve(root, 'animals'))).filter(n => n.endsWith('.js')).map(n => 'animals/' + n);
const files = [...geometry, ...animals, 'plant-pools.js', 'plant-materials.js', 'terrain-materials.js', 'terrain-atlas.js'];
const graph = new Map();
for (const file of files) {
  const source = await readFile(resolve(root, file), 'utf8');
  const imports = [...source.matchAll(/^import\s+[\s\S]*?\sfrom\s+['"]([^'"]+)['"];?/gm)].map(m => m[1]);
  const local = imports.filter(p => p.startsWith('.')).map(p => resolve(dirname(resolve(root, file)), p));
  graph.set(resolve(root, file), local);
  for (const dependency of local) {
    assert.ok(!/\/js\/(sim|ui|maps)\/|\/js\/(game|world|tools|input)\.js$/.test(dependency), `${file} imports gameplay code: ${dependency}`);
    if (file.startsWith('geometry/')) assert.ok(dependency.startsWith(resolve(root, 'geometry') + '/') || dependency.endsWith('/js/rng.js'), `${file}: geometry must only use geometry and deterministic RNG helpers`);
    if (file.startsWith('animals/') && !file.endsWith('animal-pools.js')) {
      assert.ok(!dependency.endsWith('/animal-pools.js'), `${file}: models and materials must not allocate instance pools`);
      if (!file.endsWith('animal-material.js')) assert.ok(!dependency.endsWith('/animal-material.js'), `${file}: model builders must not construct GPU materials`);
    }
    if (file === 'plant-pools.js') assert.ok(!dependency.endsWith('/flora.js') && !dependency.endsWith('/plant-materials.js'), 'Plant buffers must not depend on placement or material construction');
  }
  console.log('PASS ' + file + ': rendering dependencies stay within their responsibility');
}
const visiting = new Set(), complete = new Set();
function visit(file) {
  if (complete.has(file) || !graph.has(file)) return;
  assert.ok(!visiting.has(file), 'Rendering module dependency cycle at ' + file);
  visiting.add(file); graph.get(file).forEach(visit); visiting.delete(file); complete.add(file);
}
for (const file of graph.keys()) visit(file);
console.log(`PASS ${files.length} model, material and pool modules have no dependency cycles`);
