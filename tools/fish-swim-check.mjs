// Swimmers' body wave and tail fin: in step with each other and with how fast the fish moves.
// Run: node tools/fish-swim-check.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { register } from 'node:module';
register('./three-loader.mjs', import.meta.url);
const { loadAnimals, ANIMALS } = await import('../js/data/animals.js');
const { buildSpecies } = await import('../js/render3d/fauna.js');
const { adultAnimalScale } = await import('../js/render3d/animal-scale.js');
const actors = fs.readFileSync(new URL('../js/render3d/actors.js', import.meta.url), 'utf8');
const material = fs.readFileSync(new URL('../js/render3d/animals/animal-material.js', import.meta.url), 'utf8');
const STRIDE = +actors.match(/const SWIM_STRIDE = ([\d.]+)/)[1];
let checks = 0;
function check(name, test) { test(); checks++; console.log(`PASS ${name}`); }

const swimmers = [];
for (const map of ['pnw', 'atlanta', 'amazon', 'reef', 'sumatra', 'chinandega', 'serengeti']) {
  loadAnimals((await import(`../js/data/animals-${map}.js`)).default);
  for (const def of ANIMALS) {
    const { geo, motion } = buildSpecies(def); geo.dispose();
    if (motion.swims) swimmers.push({ map, def, motion, len: motion.len * adultAnimalScale(def.sprite) });
  }
}

check('Every fish and shark swims with the shared wave', () => {
  assert.ok(swimmers.filter(s => s.def.sprite.kind === 'fish').length > 15);
  assert.ok(swimmers.some(s => s.def.key === 'blacktip') && swimmers.some(s => s.def.key === 'trout'));
  for (const { map, def, motion } of swimmers) assert.ok(motion.wave > 0 && motion.waveK > 0, `${map}/${def.key}`);
});

check('The body wave travels back faster than the fish swims, as a real one does (slip 0.3-0.8)', () => {
  // the tail beats once per STRIDE body lengths moved; the wave covers one wavelength per beat
  for (const { map, def, motion } of swimmers) {
    const ratio = (2 * Math.PI / motion.waveK) / (STRIDE * motion.len);
    const kind = def.sprite.kind;
    if (kind === 'fish' || kind === 'shark') assert.ok(ratio > 1.25 && ratio < 3, `${map}/${def.key}: wave ${ratio.toFixed(2)}x its swimming speed`);
  }
});

check('The tail fin turns with the body wave, not on a clock of its own', () => {
  const tail = material.slice(material.indexOf('} else if (tail) {'), material.indexOf('} else if (aPart > 8.5 && uTongue'));
  assert.ok(/if \(uWave > 0\.0\)[\s\S]*cos\(aPivot\.x \* uWaveK - ph \* 1\.4\)/.test(tail), 'the fin reads the wave at its root');
  assert.ok(/sin\(transformed\.x \* uWaveK - ph \* 1\.4\)/.test(material), 'the body wave runs on the same phase');
  assert.ok(/mo\.swims \? st\.swimPhase/.test(actors), 'swimmers draw from the distance-driven phase');
});

check('A blacktip covers more of its body lengths a day than a coral trout', () => {
  const at = key => swimmers.find(s => s.map === 'reef' && s.def.key === key);
  const bl = s => s.def.speed / s.len;
  assert.ok(bl(at('blacktip')) > bl(at('trout')) * 1.1, `blacktip ${bl(at('blacktip')).toFixed(2)}, trout ${bl(at('trout')).toFixed(2)} body lengths a day`);
  assert.ok(at('blacktip').def.speed > at('shark').def.speed * 1.4, 'faster than the whitetip, which rests by day');
});

console.log(`${checks} fish swim checks passed.`);
