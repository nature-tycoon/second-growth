// Nested, seeded habitats for diagnosis only. Production density is unchanged.
import { releaseGame } from './release-fixtures.mjs';
import { ANIMALS } from '../js/data/animals.js';
import { hash2, mulberry32 } from '../js/rng.js';

export function ecosystemCounts(game) {
  const w = game.world;
  const count = a => a.reduce((n, v) => n + (v > 0 ? 1 : 0), 0);
  return { trees: count(w.tree), shrubs: count(w.shrub), groundcover: count(w.ground),
    borderTrees: count(game.border.tree), animals: game.wildlife.agents.length, day: game.day };
}

export function ecosystemSignature(game) {
  let hash = 2166136261;
  const add = bytes => { for (const value of bytes) { hash ^= value; hash = Math.imul(hash, 16777619); } };
  for (const source of [game.world, game.border]) for (const field of ['tree', 'treeG', 'shrub', 'shrubG', 'ground', 'groundG']) {
    const a = source[field]; if (a) add(new Uint8Array(a.buffer, a.byteOffset, a.byteLength));
  }
  add(new TextEncoder().encode(JSON.stringify([game.day, game.acc, game.rng.state(), game.wildlife.serialize()])));
  return (hash >>> 0).toString(16).padStart(8, '0');
}

export function performanceFixture(map, density) {
  const level = { low: [.18, 24], medium: [.5, 96], high: [1, 256] }[density];
  if (!level) throw new Error('Density must be low, medium or high');
  const fixture = releaseGame(map, 'forest'), g = fixture.game, w = g.world;
  const [fraction, population] = level;
  for (const [ids, growth, salt] of [[w.tree, w.treeG, 901], [w.shrub, w.shrubG, 902], [w.ground, w.groundG, 903]]) {
    for (let i = 0; i < w.n; i++) if (hash2(i % w.w, Math.floor(i / w.w), salt) >= fraction) { ids[i] = 0; growth[i] = 0; }
  }
  for (const field of ['tree', 'shrub', 'ground']) for (let i = 0; i < g.border[field].length; i++) {
    if (hash2(i % g.border.W, Math.floor(i / g.border.W), 904) >= fraction) {
      g.border[field][i] = 0; if (field === 'tree') g.border.treeG[i] = 0;
    }
  }
  g.refreshEnvironment(); g.wildlife.computeSuitability();
  const candidates = ANIMALS.filter(d => !d.special && d.key !== 'cattle').map(def => {
    const sites = [];
    for (let i = 0; i < w.n; i++) if (g.wildlife.suit[def.index][i] >= .35) sites.push(i);
    return { def, sites };
  }).filter(d => d.sites.length);
  if (!candidates.length) throw new Error('Fixture has no suitable wildlife habitat');
  const rng = mulberry32(72831);
  for (let k = 0; k < population; k++) {
    const { def, sites } = candidates[k % candidates.length], i = sites[Math.floor(rng() * sites.length)];
    g.wildlife.spawn(def, i % w.w + .5, Math.floor(i / w.w) + .5, { silent: true, age: 360 });
  }
  g.wildlife.recount();
  fixture.initial = ecosystemCounts(g);
  return fixture;
}
