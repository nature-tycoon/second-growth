// Independent restored landscapes for visual and long-term succession checks.
// These are habitat fixtures, not campaign playthroughs; no saves are read or written.
import { Game } from '../js/game.js';
import { PLANTS, PLANT } from '../js/data/plants.js';
import { plantSuit, updatePlants, seedRain, rootsLoosen } from '../js/sim/plants.js';
import { updateEnvironment } from '../js/sim/environment.js';
import { T, F, isWater } from '../js/config.js';
import { SLOPE_Y, FARM_ROAD, ESTUARY_X } from '../js/maps/chinandega-world.js';
import { isPeat, streamX } from '../js/maps/sumatra-world.js';

export const TARGETS = {
  pnw: 'Tall mixed conifers, fern understory, streamside broadleaf trees and open wetlands.',
  amazon: 'Connected evergreen rainforest, varied crowns and palms, shaded forest floor.',
  serengeti: 'Open seasonal grassland, scattered thorns and baobabs, denser riverine trees.',
  atlanta: 'Native flower gardens beneath neighborhood shade trees; houses and streets remain.',
  chinandega: 'Dry forest on slopes, open shaded cattle paddocks, living fences, mangroves and a sandy beach.',
  reef: 'Mixed coral patches on stable reef, seagrass and scattered giant clams on lagoon sand, a vegetated cay and open channels.',
  sumatra: 'Dipterocarp rainforest on mineral soil, rewetted peat swamp forest, village fruit trees.',
};

export function restoredGame(map, seed = 1987) {
  const g = new Game();
  g.newGame(seed, 'free', 'standard', map);
  g.speed = 0;
  const w = g.world, rng = g.rng;
  for (let i = 0; i < w.n; i++) {
    for (const [ids, gs] of [[w.ground, w.groundG], [w.shrub, w.shrubG], [w.tree, w.treeG]]) {
      if (ids[i] && (PLANTS[ids[i]].invasive || PLANTS[ids[i]].exotic)) { ids[i] = 0; gs[i] = 0; }
    }
    if (w.feature[i] === F.CULVERT || w.feature[i] === F.DIKE || (w.feature[i] === F.FENCE && map !== 'chinandega')) w.feature[i] = 0;
    if ((map !== 'reef' && w.terrain[i] === T.FIELD) || (map === 'serengeti' && w.terrain[i] === T.GRAVEL)) w.terrain[i] = T.SOIL;
    if (map === 'reef' && w.terrain[i] === T.GRAVEL) w.terrain[i] = T.SOIL; // stabilized rubble
    const x = i % w.w, y = (i / w.w) | 0;
    if (map === 'chinandega' && x >= ESTUARY_X && y > 55 && w.terrain[i] === T.POND) w.terrain[i] = T.MARSH; // breached shrimp ponds
    if (map === 'sumatra' && isPeat(w, i)) {
      w.baseMoist[i] = 0.64;
      // Blocked artificial canals have filled with swamp vegetation; retain the natural stream.
      const naturalStream = x >= Math.min(streamX(y), streamX(y + 1)) - 1 && x <= Math.max(streamX(y), streamX(y + 1)) + 1;
      if (w.terrain[i] === T.CREEK && !naturalStream) w.terrain[i] = T.MARSH;
    }
    w.soil[i] = Math.max(w.soil[i], 0.7);
  }
  w.hydroDirty = true;
  updateEnvironment(w, 2);
  const native = PLANTS.filter(p => p && !p.invasive && !p.exotic && !p.weedy);
  const choose = (i, opts) => {
    const fit = opts.filter(p => plantSuit(w, i, p) >= 0.5 && (p.key !== 'titan' || rng() < 0.01));
    return fit.length ? fit[Math.floor(rng() * fit.length)] : null;
  };
  const keys = list => list.map(k => PLANT[k]).filter(Boolean);
  // Plant mature crowns first, so understory choices see their shade.
  for (let i = 0; i < w.n; i++) {
    if (w.tree[i]) continue;
    const x = i % w.w, y = (i / w.w) | 0;
    let trees = native.filter(p => p.layer === 2), density = 0.3;
    if (map === 'pnw') {
      trees = keys(w.distWater[i] <= 3 ? ['alder', 'maple', 'ash', 'cottonwood', 'cedar', 'hemlock'] : ['fir', 'cedar', 'hemlock']);
      density = y < 30 || x > 70 || w.distWater[i] <= 3 ? 0.28 : 0.015;
    }
    if (map === 'serengeti') {
      trees = keys(w.distWater[i] <= 3 ? ['fevertree', 'sausage', 'sycamorefig'] : ['umbrella', 'balanites', 'baobab']);
      density = w.distWater[i] <= 3 ? 0.25 : 0.012;
    }
    if (map === 'atlanta') density = 0.07;
    if (map === 'chinandega') {
      const coast = x >= ESTUARY_X && y >= 55;
      trees = keys(coast ? ['redmangrove', 'blackmangrove', 'whitemangrove'] : w.distWater[i] <= 2 ? ['chilamate'] : ['guanacaste', 'genizaro', 'madrono', 'cortes', 'ceiba', 'guacimo']);
      density = coast || y < SLOPE_Y || w.distWater[i] <= 2 ? 0.3 : 0.025;
      if (w.feature[i] === F.FENCE) { trees = keys(['madero', 'jinocuabo']); density = 0.7; }
    }
    if (map === 'sumatra') trees = keys(isPeat(w, i) ? ['jelutong', 'nibung'] : ['meranti', 'keruing', 'tualang', 'fig', 'terap', 'petai', 'durian']);
    if (rng() < density) {
      const p = choose(i, trees);
      if (p) { w.setPlant(i, p, 1); w.treeAge[i] = (p.matureAge ?? 20) * 120; }
    }
  }
  updateEnvironment(w, 2);
  for (let i = 0; i < w.n; i++) {
    const ground = choose(i, native.filter(p => p.layer === 0));
    if (ground && !w.ground[i]) w.setPlant(i, ground, 1);
    if (!w.shrub[i] && rng() < (map === 'serengeti' || map === 'chinandega' ? 0.025 : 0.14)) {
      const p = choose(i, native.filter(p => p.layer === 1));
      if (p) w.setPlant(i, p, 1);
    }
  }
  updateEnvironment(w, 2);
  return g;
}

// Isolate succession and seasonal moisture from stochastic fire, grazing and player upkeep.
export function successionDay(g) {
  g.day++;
  updateEnvironment(g.world, g.month);
  updatePlants(g);
  seedRain(g);
  if (g.day % 5 === 0) rootsLoosen(g);
}

export function landscapeMetrics(g) {
  const w = g.world;
  updateEnvironment(w, g.month);
  let land = 0, crowns = 0, open = 0, paddocks = 0, paddockTrees = 0, swampTrees = 0;
  let clams = 0, sand = 0, sandClams = 0;
  for (let i = 0; i < w.n; i++) {
    const y = (i / w.w) | 0;
    if (!isWater(w.terrain[i]) && w.struct[i] < 0 && w.terrain[i] !== T.ROAD) {
      land++;
      if (w.tree[i] && w.treeG[i] > 0.5) crowns++;
      if (w.canopy[i] < 0.3) open++;
    }
    if (g.map === 'chinandega' && y >= SLOPE_Y && y < FARM_ROAD && !isWater(w.terrain[i]) && w.feature[i] !== F.FENCE && w.distWater[i] > 3) {
      paddocks++; if (w.tree[i] && w.treeG[i] > 0.5) paddockTrees++;
    }
    if (g.map === 'sumatra' && w.terrain[i] === T.MARSH && w.tree[i] && w.treeG[i] > 0.5) swampTrees++;
    if (g.map === 'reef') {
      const hasClam = w.shrub[i] === PLANT.clam.id;
      if (hasClam) clams++;
      if (w.terrain[i] === T.PASTURE) { sand++; if (hasClam) sandClams++; }
    }
  }
  const pct = (n, d) => d ? +(100 * n / d).toFixed(1) : 0;
  return { map: g.map, elapsedYears: g.day / 120, treeTilesPct: pct(crowns, land), openTilesPct: pct(open, land), paddockTreePct: pct(paddockTrees, paddocks), swampTrees, forest: w.stats.forest, meadow: w.stats.meadow,
    ...(g.map === 'reef' ? { clams, sandClamPct: pct(sandClams, sand) } : {}) };
}
