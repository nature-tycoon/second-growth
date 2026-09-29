// Player tools: landscaping, planting, habitat features, removal, and wildlife introductions.

import { T, F, isWater } from './config.js';
import { PLANTS, PLANT, MIXES, MIX, L } from './data/plants.js';
import { ANIMALS, ANIMAL, many } from './data/animals.js';
import { STRUCTURES } from './world.js';
import { plantSuit } from './sim/plants.js';
import { onBiome, biome } from './biome.js';

const land = t => !isWater(t);
const DEPTH = { [T.POND]: 0.6, [T.MARSH]: 0.2, [T.CREEK]: 0.4 };

function clearForWater(w, i) {
  w.clearPlants(i);
  if (w.feature[i] !== F.CULVERT) w.feature[i] = 0;
}

function dig(terrain) {
  return (game, i) => {
    const w = game.world, t = w.terrain[i];
    if (t === terrain || t === T.RIVER || t === T.ROAD || w.struct[i] >= 0 || w.feature[i] === F.CULVERT || w.feature[i] === F.DAM) return null;
    const wasLand = land(t);
    if (terrain === T.MARSH) {
      // keep wetland plants that can handle standing water
      if (w.tree[i] && !PLANTS[w.tree[i]].mangrove) { w.tree[i] = 0; w.treeG[i] = 0; w.treeAge[i] = 0; }
      if (w.shrub[i] && !PLANTS[w.shrub[i]].wetOK) { w.shrub[i] = 0; w.shrubG[i] = 0; }
      if (w.ground[i] && !PLANTS[w.ground[i]].wetOK && !PLANTS[w.ground[i]].aquatic) { w.ground[i] = 0; w.groundG[i] = 0; }
      if (w.feature[i] !== F.LOG) w.feature[i] = 0;
    } else clearForWater(w, i);
    if (t === T.TRAIL && terrain !== T.MARSH) w.feature[i] = 0;
    w.terrain[i] = terrain;
    w.soil[i] = Math.max(w.soil[i], 0.3);
    w.carve(i % w.w, (i / w.w) | 0, DEPTH[terrain]);
    if (wasLand) game.stats.dug++;
    w.hydroDirty = true;
    return true;
  };
}

export const TOOLS = {};
const tool = t => { TOOLS[t.key] = Object.assign({ brush: true, size: 1 }, t); return TOOLS[t.key]; };

// ---------------------------------------------------------------- landscape
tool({ key: 'pond', cat: 'land', name: 'Dig pond', cost: 60, icon: { terrain: T.POND },
  desc: 'Deep, open water for ducks, turtles, fish and beavers.', apply: dig(T.POND) });
tool({ key: 'marsh', cat: 'land', name: 'Shallow marsh', cost: 35, icon: { terrain: T.MARSH },
  desc: 'Knee-deep water where cattails, frogs and herons thrive.', apply: dig(T.MARSH) });
tool({ key: 'creek', cat: 'land', name: 'Creek channel', cost: 45, icon: { terrain: T.CREEK }, size: 0,
  desc: 'Carve a flowing creek. Connect it to the river so fish can swim in. Try adding some bends.', apply: dig(T.CREEK) });
tool({ key: 'fill', cat: 'land', name: 'Fill & grade', cost: 25, icon: { terrain: T.SOIL },
  desc: 'Fill in water, or rip up old roads and gravel, leaving loose bare soil.',
  apply: (game, i) => {
    const w = game.world, t = w.terrain[i];
    if (t === T.RIVER || w.struct[i] >= 0 || w.feature[i] === F.CULVERT) return null;
    if (t === T.ROAD && biome.fixedRoads) return null; // (the suburb's streets and driveways stay)
    if (!isWater(t) && t !== T.ROAD && t !== T.GRAVEL && t !== T.MUD) return null;
    w.terrain[i] = T.SOIL;
    if (w.feature[i] === F.DAM || w.feature[i] === F.BOARDWALK) w.feature[i] = 0;
    if (isWater(t)) { w.clearPlants(i); w.hydroDirty = true; w.raiseToSurroundings(i % w.w, (i / w.w) | 0); }
    return true;
  } });
tool({ key: 'rip', cat: 'land', name: 'Loosen soil', cost: 4, icon: { terrain: T.FIELD },
  desc: 'Break up compacted fields and old pasture sod so native seeds can take hold.',
  apply: (game, i) => {
    const w = game.world, t = w.terrain[i];
    // (on maps with crusted hardpan, like the Serengeti range, this breaks the crust too)
    if (t !== T.FIELD && t !== T.PASTURE && !(biome.hardpan && t === T.GRAVEL)) return null;
    w.terrain[i] = T.SOIL;
    w.soil[i] = Math.min(1, w.soil[i] + 0.04);
    if (w.ground[i] && PLANTS[w.ground[i]].invasive) { w.ground[i] = 0; w.groundG[i] = 0; }
    return true;
  } });
tool({ key: 'mulch', cat: 'land', name: 'Compost & mulch', cost: 10, icon: { terrain: T.DUFF },
  desc: 'Spread compost and wood chips. Gives worn-out soil a head start.',
  apply: (game, i) => {
    const w = game.world, t = w.terrain[i];
    if (isWater(t) || t === T.ROAD || w.struct[i] >= 0 || w.soil[i] >= 0.75) return null;
    w.soil[i] = Math.min(0.8, w.soil[i] + 0.15);
    return true;
  } });

function reshape(amt) {
  return (game, i) => {
    const w = game.world;
    if (w.terrain[i] === T.RIVER || w.struct[i] >= 0) return null;
    w.shiftTile(i % w.w, (i / w.w) | 0, amt);
    // a half-moon pit dug into hardpan cracks the crust, so rain and seed can get in
    if (amt < 0 && biome.hardpan && w.terrain[i] === T.GRAVEL) { w.terrain[i] = T.SOIL; w.soil[i] = Math.min(1, w.soil[i] + 0.03); }
    return true;
  };
}
tool({ key: 'raise', cat: 'land', name: 'Raise ground', cost: 14, icon: { svg: 'raise' },
  desc: 'Build up a berm or knoll. Higher ground drains drier, which suits oak, fescue and Oregon sunshine.', apply: reshape(0.45) });
tool({ key: 'lower', cat: 'land', name: 'Lower ground', cost: 14, icon: { svg: 'lower' },
  desc: 'Scoop out a swale. Hollows collect water and stay moist, which suits sedge, camas and cedar.', apply: reshape(-0.45) });

// ---------------------------------------------------------------- planting
function plantTool(source, cost, density) {
  const species = Array.isArray(source) ? source.map(k => PLANT[k]) : [PLANT[source]];
  return (game, i, rng) => {
    const w = game.world;
    const layer = species[0].layer;
    const ids = layer === 0 ? w.ground : layer === 1 ? w.shrub : w.tree;
    if (w.ground[i] && PLANTS[w.ground[i]].sod) { // lawn: nothing takes until the sod is dug out
      if (!game.flags.sodHint) { game.flags.sodHint = true; game.notify('Nothing can be planted into lawn. Lift the sod first with Remove → Pull invasives, then plant.', 'info'); }
      return 'unsuitable';
    }
    if (ids[i]) return null;
    if (rng() > density) return null;
    // each seed ends up where it suits best: weight by suitability
    let total = 0;
    const s = species.map(p => { const v = plantSuit(w, i, p); const q = v > 0.2 ? v * v : 0; total += q; return q; });
    if (total <= 0) return 'unsuitable';
    let r = rng() * total, pick = species[0];
    for (let k = 0; k < species.length; k++) { r -= s[k]; if (r <= 0) { pick = species[k]; break; } }
    w.setPlant(i, pick, 0.1);
    game.stats.planted++;
    // tallies for the campaign: trees planted, and shrubs or trees planted right beside the creek
    if (pick.layer === 2) game.stats.treesPlanted = (game.stats.treesPlanted || 0) + 1;
    if (pick.layer > 0) {
      const x = i % w.w, y = (i / w.w) | 0;
      let creek = false;
      for (let dy = -1; dy <= 1 && !creek; dy++) for (let dx = -1; dx <= 1; dx++) if (w.inb(x + dx, y + dy) && w.terrain[w.idx(x + dx, y + dy)] === T.CREEK) { creek = true; break; }
      if (creek) game.stats.creekPlanted = (game.stats.creekPlanted || 0) + 1;
    }
    return true;
  };
}
export const bestSuit = (game, i, keys) => Math.max(...keys.map(k => plantSuit(game.world, i, PLANT[k])));

// Planting tools come from the active map's plants and seed mixes (rebuilt when the map changes).
function addPlantTools() {
for (const m of MIXES) {
  tool({ key: m.key, cat: 'plants', sub: 'mixes', name: m.name, cost: m.cost, icon: { plant: m.species[0], mix: m.species },
    desc: m.desc, species: m.species, layer: m.layer, size: m.layer === 2 ? 2 : 2,
    apply: plantTool(m.species, m.cost, m.density) });
}
for (const p of PLANTS) {
  if (!p || !p.native) continue;
  const density = p.layer === L.GROUND ? 0.8 : p.layer === L.SHRUB ? 0.5 : 0.35;
  tool({ key: 'plant_' + p.key, cat: 'plants', sub: ['ground', 'shrub', 'tree'][p.layer], name: p.name, cost: p.cost,
    icon: { plant: p.key }, desc: p.desc, species: [p.key], layer: p.layer, size: p.layer === 2 ? 0 : 1,
    apply: plantTool(p.key, p.cost, p.layer === 2 ? 1 : density) });
}
}

// ---------------------------------------------------------------- habitat features
function featureTool(f, needsLand = true) {
  return (game, i) => {
    const w = game.world, t = w.terrain[i];
    if (w.struct[i] >= 0 || w.feature[i]) return null;
    if (needsLand && (isWater(t) || t === T.ROAD)) return null;
    if (f === F.LOG && t === T.CREEK) return null;
    w.feature[i] = f; w.featureAge[i] = 0;
    if (f === F.SNAG || f === F.NESTBOX) { /* stands among plants */ }
    else if (w.tree[i] && w.treeG[i] > 0.3) { w.feature[i] = 0; return null; }
    return true;
  };
}
tool({ key: 'snag', cat: 'features', name: 'Snag', cost: 150, brush: false, icon: { feature: F.SNAG },
  desc: 'A standing dead tree. Woodpeckers carve it, then owls, bats and ducks move into the holes.', apply: featureTool(F.SNAG) });
tool({ key: 'log', cat: 'features', name: 'Fallen log', cost: 80, brush: false, icon: { feature: F.LOG },
  desc: 'Basking spot for turtles, cover for wrens and newts, and a nursery for hemlock and huckleberry. Can go in ponds.',
  apply: (game, i) => { const w = game.world; if (w.terrain[i] === T.POND || w.terrain[i] === T.MARSH) { if (w.feature[i]) return null; w.feature[i] = F.LOG; return true; } return featureTool(F.LOG)(game, i); } });
tool({ key: 'rocks', cat: 'features', name: 'Rock pile', cost: 60, brush: false, icon: { feature: F.ROCKS },
  desc: 'Sun-warmed shelter for snakes and lizards.', apply: featureTool(F.ROCKS) });
tool({ key: 'brush', cat: 'features', name: 'Brush pile', cost: 30, brush: false, icon: { feature: F.BRUSH },
  desc: 'Instant cover for rabbits and wrens while shrubs grow in. Rots into soil over a few years.', apply: featureTool(F.BRUSH) });
tool({ key: 'nestbox', cat: 'features', name: 'Nest box', cost: 120, brush: false, icon: { feature: F.NESTBOX },
  desc: 'Stand-in tree cavity for wood ducks and roosting bats until the forest grows old.', apply: featureTool(F.NESTBOX) });

// ---------------------------------------------------------------- removal
tool({ key: 'pull', cat: 'remove', name: 'Pull invasives', cost: 8, icon: { plant: 'blackberry' }, size: 1,
  desc: 'Dig out Himalayan blackberry, Scotch broom and reed canarygrass. Native plants are left alone.',
  apply: (game, i) => {
    const w = game.world;
    let n = 0;
    if (w.ground[i] && PLANTS[w.ground[i]].invasive) {
      if (PLANTS[w.ground[i]].sod && w.terrain[i] === T.PASTURE) w.terrain[i] = T.SOIL; // lifting the sod leaves bare clay
      w.ground[i] = 0; w.groundG[i] = 0; n++;
    }
    if (w.shrub[i] && PLANTS[w.shrub[i]].invasive) { w.shrub[i] = 0; w.shrubG[i] = 0; n++; }
    if (w.tree[i] && PLANTS[w.tree[i]].invasive) { w.tree[i] = 0; w.treeG[i] = 0; w.treeAge[i] = 0; n++; } // mesquite, leucaena
    if (!n) return null;
    game.stats.removed += n;
    return true;
  } });
tool({ key: 'burn', cat: 'remove', name: 'Controlled burn', cost: 3, icon: { svg: 'fire' }, size: 2,
  desc: 'A cool, careful fire keeps meadows open, the way Coast Salish peoples tended camas prairies. Paint the area to burn and the crew lights it: the fire creeps across it over a few days, burning off underbrush, saplings, invasive grass and brush piles. It stays inside the area you painted. Native meadow plants resprout and big trees come through. Rain puts it out.',
  apply: (game, i) => {
    const w = game.world;
    if (isWater(w.terrain[i]) || w.struct[i] >= 0 || w.terrain[i] === T.ROAD || w.terrain[i] === T.TRAIL) return null;
    if (w.fire[i] || w.rx[i] || w.scorch[i] > 60) return null; // already burning, or burned just now
    const fuel = w.ground[i] || w.shrub[i] || (w.tree[i] && w.treeG[i] < 0.45) || w.feature[i] === F.BRUSH || w.terrain[i] === T.PASTURE;
    if (!fuel) return null;
    w.rx[i] = 1;
    // light it here and there along the line; the rest catches as the fire creeps through
    if (!game.events.rxBurning || game.rng() < 0.2) game.events.igniteRx(i);
    return true;
  } });
tool({ key: 'clear', cat: 'remove', name: 'Clear vegetation', cost: 6, icon: { terrain: T.SOIL }, size: 1,
  desc: 'Remove every plant on the tile, native or not.',
  apply: (game, i) => {
    const w = game.world;
    if (!w.ground[i] && !w.shrub[i] && !w.tree[i]) return null;
    const sod = w.ground[i] && PLANTS[w.ground[i]].sod;
    w.clearPlants(i);
    if (sod && w.terrain[i] === T.PASTURE) w.terrain[i] = T.SOIL; // lifting the sod leaves bare clay
    return true;
  } });
tool({ key: 'clearcut', cat: 'remove', name: 'Cut trees', cost: 12, icon: { svg: 'axe' }, size: 1,
  desc: 'Fell the trees and leave everything else: grass, shrubs and wildflowers stay. Bigger trees leave a stump that rots away over a few years.',
  apply: (game, i) => {
    const w = game.world;
    if (!w.tree[i]) return null;
    const big = w.treeG[i] > 0.25;
    w.tree[i] = 0; w.treeG[i] = 0; w.treeAge[i] = 0;
    if (big && !w.feature[i]) { w.feature[i] = F.STUMP; w.featureAge[i] = 0; }
    game.stats.treesCut = (game.stats.treesCut || 0) + 1;
    return true;
  } });
tool({ key: 'demolish', cat: 'remove', name: 'Demolish', cost: 0, icon: { svg: 'demolish' }, size: 0,
  desc: 'Tear out fences, old buildings, the road culvert, or habitat features. Buildings and machinery sell for salvage.',
  costFor: (game, i) => {
    const w = game.world;
    if (w.struct[i] >= 0) { const s = w.structures[w.struct[i]]; const d = STRUCTURES[s.type]; return d.permanent ? 0 : d.removeCost - d.salvage; }
    const f = w.feature[i];
    if (w.terrain[i] === T.TRAIL && !f) return 2;
    if (f === F.CULVERT) return 4000;
    if (f === F.DIKE) return 60;
    if (biome.fixedRoads && f === F.BOARDWALK && (w.terrain[i - 1] === T.ROAD || w.terrain[i + 1] === T.ROAD)) return 0;
    if (f === F.FENCE) return 10;
    if (f && f !== F.DAM) return 20;
    return 0;
  },
  apply: (game, i) => {
    const w = game.world;
    if (w.struct[i] >= 0) {
      const s = w.structures[w.struct[i]];
      if (STRUCTURES[s.type].permanent) {
        if (!game.flags.permanentHint) { game.flags.permanentHint = true; game.notify('People live here: the homes, the clubhouse and the streets stay. Work around them. Every yard can still be a garden.', 'info'); }
        return null;
      }
      game.notify(`${STRUCTURES[s.type].name} removed. The ground underneath is bare soil now.`, 'info');
      w.removeStructure(w.struct[i]);
      return true;
    }
    const f = w.feature[i];
    if (w.terrain[i] === T.TRAIL && !f) { w.terrain[i] = T.SOIL; return true; }
    if (!f || f === F.DAM) return null;
    if (biome.fixedRoads && f === F.BOARDWALK && (w.terrain[i - 1] === T.ROAD || w.terrain[i + 1] === T.ROAD)) return null; // the street's bridge over the creek stays
    if (f === F.DIKE) {
      // breach it: cut through to tidal marsh, and the pond behind starts to drain (see the map's daily)
      w.feature[i] = 0; w.terrain[i] = T.MARSH; w.clearPlants(i); w.hydroDirty = true;
      if (!game.flags.breachHint) { game.flags.breachHint = true; game.notify('The dike is breached. Over the next few weeks the tide will flood in and out of the old pond, and it will turn to tidal mud and marsh. Mangrove seedlings will drift in on the tide and take root, fastest next to healthy mangroves.', 'good', { x: i % w.w + 0.5, y: ((i / w.w) | 0) + 0.5 }); }
      return true;
    }
    if (f === F.CULVERT) {
      w.feature[i] = 0; w.hydroDirty = true;
      game.notify('The culvert is out! The creek now flows freely into the river, and fish can reach the upper creek.', 'good');
    } else w.feature[i] = 0;
    return true;
  } });

tool({ key: 'firecrew', cat: 'remove', name: 'Fire crew', cost: 40, icon: { svg: 'crew' }, size: 2,
  desc: 'Call in a crew to put out a wildfire. Only works on tiles that are burning.',
  apply: (game, i) => game.events.extinguish(i) || null });

// ---------------------------------------------------------------- visitors
const openLand = (w, i) => !isWater(w.terrain[i]) && w.terrain[i] !== T.ROAD && w.struct[i] < 0;
tool({ key: 'trail', cat: 'visitors', name: 'Nature trail', cost: 6, icon: { terrain: T.TRAIL }, size: 0,
  desc: 'A packed-earth footpath. Connect it to a trailhead parking lot. Trails also act as firebreaks, but people on them disturb shy wildlife nearby.',
  apply: (game, i) => {
    const w = game.world;
    if (!openLand(w, i) || w.terrain[i] === T.TRAIL) return null;
    const f = w.feature[i];
    if (f && f !== F.FENCE && f !== F.BRUSH && f !== F.ROCKS) return null;
    w.terrain[i] = T.TRAIL; w.feature[i] = 0;
    w.ground[i] = 0; w.groundG[i] = 0; w.shrub[i] = 0; w.shrubG[i] = 0;
    if (w.tree[i] && w.treeG[i] < 0.6) { w.tree[i] = 0; w.treeG[i] = 0; }
    return true;
  } });
tool({ key: 'boardwalk', cat: 'visitors', name: 'Boardwalk', cost: 45, icon: { feature: F.BOARDWALK }, size: 0,
  desc: 'A raised walkway across marsh, ponds and creeks, so the trail can take people right into the wetlands.',
  apply: (game, i) => {
    const w = game.world, t = w.terrain[i];
    if (!(t === T.MARSH || t === T.POND || t === T.CREEK || t === T.MUD) || w.feature[i]) return null;
    w.feature[i] = F.BOARDWALK;
    return true;
  } });
tool({ key: 'blind', cat: 'visitors', name: 'Viewing blind', cost: 900, brush: false, icon: { feature: F.BLIND },
  desc: 'A screened hide beside a trail. Visitors see more wildlife and bother it far less.',
  apply: (game, i) => {
    const w = game.world;
    if (!openLand(w, i) || w.feature[i] || w.terrain[i] === T.TRAIL) return null;
    w.feature[i] = F.BLIND; w.shrub[i] = 0; w.tree[i] = 0; w.treeG[i] = 0;
    return true;
  } });
tool({ key: 'build_road', cat: 'visitors', name: 'Gravel road', cost: 40, icon: { terrain: T.ROAD }, size: 0,
  desc: 'Lay a farm road. Visitors drive in on roads, and trailhead parking has to sit beside one. Roads block nothing, but they are bare ground for wildlife.',
  apply: (game, i) => {
    const w = game.world, t = w.terrain[i];
    if (isWater(t) || t === T.ROAD || w.struct[i] >= 0) return null;
    const f = w.feature[i];
    if (f && f !== F.FENCE && f !== F.BRUSH && f !== F.ROCKS && f !== F.LOG) return null;
    w.terrain[i] = T.ROAD; w.feature[i] = 0;
    w.clearPlants(i);
    return true;
  } });
function buildTool(type, desc, { cat = 'visitors', needsRoad = true, done = null } = {}) {
  const d = STRUCTURES[type];
  return tool({ key: 'build_' + type, cat, name: needsRoad ? d.name : 'Rebuild ' + d.name.toLowerCase(), cost: d.build, brush: false, icon: { svg: type },
    desc, footprint: [d.w, d.h],
    apply: (game, i) => {
      const w = game.world, x = i % w.w, y = (i / w.w) | 0;
      let road = false;
      for (let yy = y; yy < y + d.h; yy++) for (let xx = x; xx < x + d.w; xx++) {
        if (!w.inb(xx, yy)) return 'blocked';
        const j = w.idx(xx, yy);
        if (!openLand(w, j) || w.terrain[j] === T.TRAIL || w.feature[j] === F.CULVERT) { game.notify(`Not enough clear, dry ground for the ${d.name.toLowerCase()} here.`, 'warn'); return 'blocked'; }
      }
      for (let yy = y - 1; yy <= y + d.h; yy++) for (let xx = x - 1; xx <= x + d.w; xx++) {
        if (!w.inb(xx, yy)) continue;
        const j = w.idx(xx, yy), t = w.terrain[j];
        if (t === T.ROAD || (w.struct[j] >= 0 && w.structures[w.struct[j]]?.type === 'parking')) road = true;
      }
      if (needsRoad && !road) { game.notify(`The ${d.name.toLowerCase()} has to sit right beside a road${type === 'center' ? ' or parking lot' : ''} so people can drive in.`, 'warn'); return 'blocked'; }
      for (let yy = y; yy < y + d.h; yy++) for (let xx = x; xx < x + d.w; xx++) {
        const j = w.idx(xx, yy);
        w.terrain[j] = T.GRAVEL;
      }
      w.addStructure(type, x, y);
      if (done) { game.notify(done, 'good'); return true; }
      game.notify(type === 'parking' ? 'Trailhead parking built. Now lay a trail out from it into the best habitat.' : 'The visitor center is open. Visitors give more, and the gift shop and exhibits raise your rating.', 'good');
      return true;
    } });
}
buildTool('parking', 'Where visitors park and start their walk. Must be next to a road. Holds about 220 visitors a month.');
buildTool('center', 'Exhibits, a gift shop and restrooms. Visitors give more and rate the preserve higher. Must be next to a road or parking lot.');
// Farm buildings you tore down can go back up. Old buildings are roosts for bats, owls and swallows.
const roost = { cat: 'features', needsRoad: false };
buildTool('barn', 'A timber barn. Its loft is a roost for little brown bats and a nest site for owls and swallows.', { ...roost, done: 'The barn is up. Bats and owls will find the loft.' });
buildTool('shed', 'A small equipment shed. Raccoons and bats move into sheds like this.', { ...roost, done: 'Shed rebuilt.' });
buildTool('house', 'Put the farmhouse back up, as a caretaker\'s home. Bats roost in the attic.', { ...roost, done: 'The farmhouse stands again.' });
buildTool('silo', 'A grain silo. Swifts and bats roost inside tall old silos.', { ...roost, done: 'Silo rebuilt.' });

// ---------------------------------------------------------------- wildlife introductions
function addWildlifeTools() {
for (const a of ANIMALS) {
  if (!a.intro) continue;
  tool({ key: 'intro_' + a.key, cat: 'wildlife', name: a.name, cost: a.intro, brush: false, icon: { animal: a.key },
    desc: a.desc, animal: a.key, hint: a.hint,
    apply: (game, i) => {
      const w = game.world, x = i % w.w, y = (i / w.w) | 0;
      const err = game.wildlife.canIntroduce(a, x, y);
      if (err) { game.notify(err, 'warn'); return 'blocked'; }
      const out = game.wildlife.introduce(a, x, y);
      game.notify(`You released ${out.length} ${many(a)}. Now it's up to the habitat.`, 'good', out[0]);
      game.flags['intro_' + a.key] = true;
      return true;
    } });
}
}

// Swap in the planting and reintroduction tools for the current map.
// Each map can re-word the fixed tools (which invasives to pull, what a pond is for).
const TOOL_BASE = {};
onBiome(b => {
  for (const k of Object.keys(TOOLS)) if (TOOLS[k].cat === 'plants' || TOOLS[k].cat === 'wildlife') delete TOOLS[k];
  for (const [k, base] of Object.entries(TOOL_BASE)) Object.assign(TOOLS[k], base);
  for (const [k, o] of Object.entries(b.toolText || {})) {
    TOOL_BASE[k] ||= Object.fromEntries(Object.keys(o).map(f => [f, TOOLS[k][f]]));
    Object.assign(TOOLS[k], o);
  }
  addPlantTools();
  addWildlifeTools();
});

export const CATEGORIES = [
  { key: 'inspect', name: 'Inspect', icon: 'inspect', desc: 'Click tiles and animals to learn about them.' },
  { key: 'land', name: 'Landscape', icon: 'shovel', desc: 'Shape water and soil.' },
  { key: 'plants', name: 'Plant', icon: 'sprout', desc: 'Brush in native plants.' },
  { key: 'features', name: 'Habitat', icon: 'log', desc: 'Place snags, logs and shelters.' },
  { key: 'remove', name: 'Remove', icon: 'axe', desc: 'Pull invasives and tear out the old farm.' },
  { key: 'wildlife', name: 'Wildlife', icon: 'paw', desc: 'Reintroduce species that can\'t get here on their own.' },
  { key: 'visitors', name: 'Visitors', icon: 'hiker', desc: 'Trails and facilities. Visitors earn money but disturb shy wildlife.' },
];

export const PLANT_TABS = [
  { key: 'mixes', name: 'Seed mixes' }, { key: 'ground', name: 'Groundcover' },
  { key: 'shrub', name: 'Shrubs' }, { key: 'tree', name: 'Trees' },
];

export const BRUSH_SIZES = [0, 1, 2, 3, 5];

// Tiles covered by a brush of radius r centred on (x, y).
export function brushTiles(w, x, y, r) {
  const out = [];
  for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    if (dx * dx + dy * dy > r * r + r * 0.8) continue;
    const xx = x + dx, yy = y + dy;
    if (w.inb(xx, yy)) out.push(w.idx(xx, yy));
  }
  return out;
}

// What a tool costs on this tile at the current difficulty (salvage earnings aren't scaled).
export function toolCost(game, tool, i) {
  const c = tool.costFor ? tool.costFor(game, i) : tool.cost;
  return c > 0 ? Math.round(c * (game.diff?.costs ?? 1)) : c;
}
export function listPrice(game, tool) { return Math.round(tool.cost * (game.diff?.costs ?? 1)); }

export { MIX, ANIMAL };
