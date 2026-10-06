import { restoredGame, successionDay } from './map-audit-fixtures.mjs';
import { PLANTS } from '../js/data/plants.js';
import { F } from '../js/config.js';
export const MAPS = ['pnw', 'amazon', 'serengeti', 'atlanta', 'chinandega', 'reef', 'sumatra'];
export function plantFixture(map) { return restoredGame(map, 1987); }
export function editPlants(g, x = 34, y = 34) {
  const w = g.world;
  // A small mixed planting/removal edit, including a region boundary.
  for (let dy = 0; dy < 3; dy++) for (let dx = 0; dx < 3; dx++) {
    const i = w.idx(x + dx, y + dy);
    for (const [ids, gs] of [[w.tree, w.treeG], [w.shrub, w.shrubG], [w.ground, w.groundG]]) {
      if (ids[i]) gs[i] = gs[i] > .5 ? .32 : .92;
    }
    if (dx === 1 && dy === 1) { w.tree[i] = 0; w.shrub[i] = 0; }
    w.feature[i] = dx === 0 ? F.FENCE : dy === 0 ? F.BOARDWALK : F.STUMP;
    w.featureAge[i] = 160;
    if (g.map === 'reef') { w.marks[i] ^= 11; (w.bleach ||= new Float32Array(w.n))[i] = .8; }
  }
}
export function growPlants(g) { successionDay(g); }
export function restoreNativeTree(g, x, y) {
  const p = PLANTS.find(p => p && p.layer === 2 && !p.invasive && !p.exotic);
  g.world.setPlant(g.world.idx(x,y), p, .6);
}
