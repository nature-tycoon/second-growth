// Small planted landscapes using real game arrays and plant models; no browser saves.
import { Game } from '../js/game.js';
import { PLANT } from '../js/data/plants.js';
import { T } from '../js/config.js';
import { hash2, valueNoise } from '../js/rng.js';
import { plantAffinity } from '../js/plant-patterns.js';
export const VEGETATION_SCENES = {
  groves: { map: 'pnw', pass: 'groves', name: 'Woodland groves and clearing', target: [40, 0.8, 32], zoom: 0.85,
    note: 'Identical planted trees before and after: gently wider mature crowns, varied heights and young trees around an open clearing.' },
  amazonforest: { map: 'amazon', name: 'Amazon jade canopy', target: [40, .7, 32], zoom: 1.15,
    note: 'Layered jade foliage, lighter pioneer crowns and native orchid and coral accents.' },
  sumatraforest: { map: 'sumatra', name: 'Sumatra emerald forest', target: [40, .7, 32], zoom: 1.15,
    note: 'Deep emerald trees with fern greens and bronze dry-season tones.' },
  garden: { map: 'atlanta', name: 'Native flower garden', target: [40, 0.2, 32], zoom: 2.4,
    note: 'Coneflowers, black-eyed Susans, milkweed, bee balm and goldenrod in soft overlapping drifts.' },
  prairie: { map: 'pnw', name: 'Spring prairie', target: [40, 0.1, 32], zoom: 2.4,
    note: 'Camas, lupine, yarrow and sunshine flowers, with open paths through the meadow.' },
  savannah: { map: 'serengeti', name: 'Serengeti grassland', target: [40, 0.4, 32], zoom: 1.15,
    note: 'Tall red oat bunchgrass and seed heads, shorter grazing lawns, umbrella thorns and a baobab.' },
  woodland: { map: 'pnw', pass: 'evergreen', name: 'Pacific Northwest woodland', target: [40, 0.65, 32], zoom: 1.15,
    note: 'Douglas-fir, cedar, hemlock, maple and oak, with recognizable branches and a fern understory.' },
  southern: { map: 'atlanta', pass: 'evergreen', name: 'Southern shade trees', target: [40, 0.65, 32], zoom: 1.15,
    note: 'White oak, loblolly pine, magnolia, dogwood and redbud, with layered crowns and flowering branches.' },
  acai: { map: 'amazon', tree: 'acai', name: 'Açaí palm — specimen', target: [40.5,1.05,32.5], zoom: 3.1,
    note: 'Clumping palm: inspect the attachment and feathered shape of its arching fronds.' },
  nibung: { map: 'sumatra', tree: 'nibung', name: 'Nibung palm — specimen', target: [40.5,1.05,32.5], zoom: 3.1,
    note: 'Native swamp palm: inspect its slender stems and drooping pinnate fronds.' },
  buriti: { map: 'amazon', tree: 'buriti', name: 'Buriti palm — specimen', target: [40.5,1.2,32.5], zoom: 3.1,
    note: 'Fan palm: inspect the radiating leaf divisions and their supporting stalks.' },
  oilpalm: { map: 'sumatra', tree: 'oilpalm', name: 'Oil palm — specimen', target: [40.5,.8,32.5], zoom: 3.6,
    note: 'Retained after review: feathered fronds, old leaf bases and fruit bunches already define this palm well.' },
  baobab: { map: 'serengeti', tree: 'baobab', name: 'Baobab — specimen', target: [40.5,.9,32.5], zoom: 3.6,
    note: 'Retained after review: the swollen trunk, stubby branches and sparse crown already give it a clear silhouette.' },
  umbrella: { map: 'serengeti', tree: 'umbrella', name: 'Umbrella thorn — specimen', target: [40.5,.85,32.5], zoom: 3.6,
    note: 'Inspect the spreading forked limbs and broad, flat canopy.' },
  fevertree: { map: 'serengeti', tree: 'fevertree', name: 'Fever tree — specimen', target: [40.5,1.05,32.5], zoom: 3.1,
    note: 'Inspect the yellow bark and taller spreading canopy.' },
  mangrove: { map: 'chinandega', tree: 'redmangrove', name: 'Red mangrove — specimen', target: [40.5,.55,32.5], zoom: 4.3,
    note: 'Inspect the prop roots and the connection between trunk, branches and crown.' },
  fir: { map: 'pnw', tree: 'fir', pass: 'evergreen', name: 'Douglas-fir — specimen', target: [40.5,1.1,32.5], zoom: 3.1,
    note: 'Branch-supported needle foliage with an irregular pyramidal outline.' },
  cedar: { map: 'pnw', tree: 'cedar', pass: 'evergreen', name: 'Western redcedar — specimen', target: [40.5,.95,32.5], zoom: 3.1,
    note: 'Flattened foliage sprays on spreading branches.' },
  hemlock: { map: 'pnw', tree: 'hemlock', pass: 'evergreen', name: 'Western hemlock — specimen', target: [40.5,1,32.5], zoom: 3.1,
    note: 'Fine uneven foliage, drooping branch ends and a bent leader.' },
  loblolly: { map: 'atlanta', tree: 'loblolly', pass: 'evergreen', name: 'Loblolly pine — specimen', target: [40.5,1.1,32.5], zoom: 3.1,
    note: 'An open high crown with needle bundles at the ends of branches.' },
  pnwshrubs: { map: 'pnw', pass: 'evergreen', name: 'Northwest flowering shrubs', target: [40, .28, 32], zoom: 2.8,
    bushes: ['rose','salal','dogwood','blackberry','elderberry','oregongrape'],
    note: 'Previously finished shrub flowers, retained in this pass. Change the season to inspect their bloom windows.' },
  southernshrubs: { map: 'atlanta', pass: 'evergreen', name: 'Southern flowering shrubs', target: [40, .3, 32], zoom: 2.8,
    bushes: ['hydrangea','sweetspire','elderberry','buttonbush','beautyberry','azalea'],
    note: 'The earlier azalea, hydrangea and other shrub flowers have been restored. June shows the most species together.' },
  tropicalshrubs: { map: 'sumatra', pass: 'evergreen', name: 'Rainforest flowering shrubs', target: [40, .3, 32], zoom: 2.8,
    bushes: ['melastoma','ixora','chromolaena'],
    note: 'Previously finished rainforest shrub flowers, retained in this pass.' },
  hydrangea: { map: 'atlanta', bush: 'hydrangea', month: 2, pass: 'evergreen', name: 'Oakleaf hydrangea — blooms', target: [40.5,.3,32.5], zoom: 8,
    note: 'Restored the earlier white flower clusters. Blooms in May and June.' },
  salal: { map: 'pnw', bush: 'salal', month: 2, pass: 'evergreen', name: 'Salal — blooms', target: [40.5,.3,32.5], zoom: 8,
    note: 'Retained the earlier pink petal model. Blooms in May and June.' },
  azalea: { map: 'atlanta', bush: 'azalea', month: 0, pass: 'evergreen', name: 'Piedmont azalea — blooms', target: [40.5,.3,32.5], zoom: 8,
    note: 'Restored the earlier open pink petals. Blooms in March and April.' },
  buttonbush: { map: 'atlanta', bush: 'buttonbush', month: 3, pass: 'evergreen', name: 'Buttonbush — blooms', target: [40.5,.3,32.5], zoom: 8,
    note: 'Retained the earlier open pincushion model. Blooms in June and July.' },
  piper: { map: 'amazon', bush: 'piper', month: 10, pass: 'evergreen', name: 'Spiked pepper — fruit', target: [40.5,.3,32.5], zoom: 8,
    note: 'The Amazon shrub currently uses pale fruit balls in January and February. Identification comparison; retained for now.' },
  spicebush: { map: 'atlanta', bush: 'spicebush', month: 0, pass: 'evergreen', name: 'Spicebush — blooms', target: [40.5,.3,32.5], zoom: 8,
    note: 'Atlanta’s small yellow flowers in March; red berries appear in September.' },
};

export function vegetationFixture(scene, month = 2, patterned = true) {
  const def = VEGETATION_SCENES[scene], g = new Game(); g.newGame(1987, 'free', 'standard', def.map);
  const w = g.world;
  for (const key of ['ground', 'groundG', 'shrub', 'shrubG', 'tree', 'treeG', 'feature', 'featureAge', 'marks']) w[key].fill(0);
  for (const key of ['ground', 'shrub', 'tree', 'treeG']) g.border[key].fill(0);
  w.struct.fill(-1); w.terrain.fill(T.SOIL); w.soil.fill(0.8); w.moist.fill(0.55); w.baseMoist.fill(0.55);
  w.vh.fill(0); g.wildlife.agents.length = 0; g.day = month * 10;
  const put = (key, x, y, growth = 1) => { const p = PLANT[key]; if (p) w.setPlant(w.idx(x, y), p, growth); };
  if (def.tree) { put(def.tree,40,32); return g; }
  if (def.bush) { put(def.bush,40,32); return g; }
  if (def.bushes) {
    def.bushes.forEach((key,k) => put(key,38 + k % 3 * 2,31 + Math.floor(k / 3) * 2));
    return g;
  }
  const ground = scene === 'garden' ? ['coneflower', 'blackeyed', 'butterflyweed', 'beebalm', 'coreopsis', 'mountainmint', 'goldenrod', 'bluestem']
    : scene === 'prairie' ? ['camas', 'lupine', 'yarrow', 'sunshine', 'fescue']
    : scene === 'savannah' ? ['redoat', 'stargrass', 'finger', 'sporobolus']
    : scene === 'amazonforest' ? ['adiantum', 'cyperus', 'calathea']
    : scene === 'sumatraforest' ? ['kelakai', 'purun', 'resam']
    : scene === 'woodland' || scene === 'groves' ? ['fern', 'sedge', 'yarrow'] : ['sedge', 'phlox', 'mountainmint'];
  const species = ground.map(k => PLANT[k]).filter(Boolean);
  for (let y = 24; y < 41; y++) for (let x = 30; x < 51; x++) {
    // Winding gaps leave breathing room between beds, rather than a solid square carpet.
    const path = Math.abs(x - 40 - Math.sin(y * 0.45) * 1.3) < (scene === 'savannah' ? 0.4 : 0.65);
    if (path || hash2(x, y, 991) < 0.05) continue;
    const weights = species.map(p => patterned ? plantAffinity(p, x, y) * (scene === 'savannah' && p.key === 'redoat' ? 2 : 1) : 1);
    let draw = hash2(x, y, 986) * weights.reduce((a, b) => a + b, 0), pick = species[0];
    for (let k = 0; k < species.length; k++) { draw -= weights[k]; if (draw <= 0) { pick = species[k]; break; } }
    w.setPlant(w.idx(x, y), pick, 0.75 + valueNoise(x, y, 5, 92) * 0.25);
  }
  if (scene === 'savannah') {
    put('umbrella', 36, 29); put('umbrella', 43, 26, 0.82); put('baobab', 46, 32); put('fevertree', 33, 34);
    put('aloe', 46, 33); put('grewia', 35, 29);
  }
  if (scene === 'groves') {
    const trees = ['fir', 'cedar', 'hemlock', 'alder', 'maple'];
    for (let y = 26; y <= 38; y++) for (let x = 32; x <= 48; x++) {
      const grove = Math.min(Math.hypot((x - 36) / 4.4, (y - 29) / 3.2),
        Math.hypot((x - 44) / 3.8, (y - 30) / 3.7), Math.hypot((x - 35) / 3, (y - 36) / 2.4));
      const clearing = Math.hypot((x - 40) / 2.5, (y - 35) / 3.2);
      if (grove > 1.12 || clearing < 1 || hash2(x, y, 251) < 0.12) continue;
      const species = hash2(x, y, 252);
      put(trees[species < .38 ? 0 : species < .63 ? 1 : species < .85 ? 2 : species < .94 ? 3 : 4],
        x, y, grove > .88 ? .28 + hash2(x, y, 253) * .32 : .72 + hash2(x, y, 253) * .28);
      if (hash2(x, y, 254) > .6) put('salal', x, y);
      put('fern', x, y);
    }
  }
  if (scene === 'woodland') {
    for (const [key, x, y] of [['fir', 35, 28], ['cedar', 38, 29], ['hemlock', 41, 27], ['maple', 44, 30], ['oak', 46, 33], ['alder', 34, 33]]) put(key, x, y);
    for (let y = 26; y < 36; y++) for (let x = 33; x < 47; x++) if ((x + y) % 3) put('fern', x, y);
    put('salal', 38, 30); put('salmonberry', 34, 34);
  }
  if (scene === 'amazonforest' || scene === 'sumatraforest') {
    const trees = scene === 'amazonforest' ? ['cecropia','inga','balsa','kapok','mahogany','acai'] : ['meranti','jelutong','keruing','fig','nibung','tualang'];
    const shrubs = scene === 'amazonforest' ? ['heliconia','piper','guadua'] : ['rattan','ginger','ixora'];
    for (const [k, x, y] of [[0,35,29],[1,38,27],[2,42,28],[3,44,31],[4,46,33],[5,34,33]]) put(trees[k],x,y);
    shrubs.forEach((key, k) => put(key, 36 + k * 3, 33 + k % 2));
  }
  if (scene === 'southern') for (const [key, x, y] of [['whiteoak', 35, 29], ['loblolly', 38, 27], ['magnolia', 42, 28], ['dogwood', 44, 31], ['redbud', 46, 33]]) put(key, x, y);
  return g;
}
