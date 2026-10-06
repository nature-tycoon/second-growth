// Read-only explanations of the same capacity and arrival rules used by Wildlife.
// Run when a species is inspected, not in the rendering or daily simulation loop.
import { T, F, MONTH_NAMES, clamp } from '../config.js';
import { ANIMALS, ANIMAL, many, preyFor } from '../data/animals.js';
import { biome } from '../biome.js';
import { passable, arrivalFinding, migrationFenceCount, SALMON_RUN_MONTH, SALMON_MIN_HABITAT } from './animals.js';
import { hungryPredator, HUNGRY_DAYS } from './ecological-pressure.js';

const amount = n => Math.max(0, n).toFixed(1);
const names = keys => keys.filter(k => ANIMAL[k]).map(k => many(ANIMAL[k])).join(', ');
const nextMonth = (months, current) => {
  for (let offset = 1; offset <= 12; offset++) if (months.includes((current + offset) % 12)) return MONTH_NAMES[(current + offset) % 12];
  return null;
};

// These are wording categories, not a second set of species thresholds. To explain a
// reduced req() multiplier, evaluate that actual function with the other resources
// abundant, then restore each category to its real value. Group alternatives (e.g.
// snags OR nest boxes) together, so adequate snags never imply missing nest boxes.
// This also detects both missing factors when their product is currently zero.
const RESOURCE_GROUPS = [
  ['forest', ['forestTiles'], [], 'Forest habitat', 'Expand the forest and give young trees time to grow.'],
  ['maturity', ['matureTiles'], [], 'Mature forest', 'Protect established forest and let young trees mature.'],
  ['meadow', ['meadowTiles'], [], 'Open habitat', 'Restore native meadow and keep some ground open.'],
  ['shelter', ['snagCount', 'nestboxCount', 'structureCount', 'bigTrees'], [], 'Nesting and shelter', 'Keep the nesting trees and shelters described in this species’ habitat needs.'],
  ['fish', ['fishIndex', 'frogIndex'], [], 'Aquatic food', 'Restore healthy water habitat and the aquatic food described in this species’ needs.'],
  ['water', ['cleanWater'], [], 'Clean connected water', 'Reconnect water to the river and improve water quality.'],
  ['berries', ['berryTiles'], [], 'Berry food', 'Grow native berry shrubs in suitable habitat.'],
  ['flowers', [], ['bloomMonths', 'nativeBloom'], 'Native flowers', 'Plant a mix of native flowers that bloom across the seasons.'],
  ['milkweed', [], ['milkweed'], 'Milkweed host plants', 'Plant milkweed for caterpillars.'],
  ['hosts', [], ['hostSwallow'], 'Caterpillar host plants', 'Plant the host plants described in this species’ habitat needs.'],
  ['caterpillars', [], ['caterpillarTrees'], 'Caterpillar food', 'Grow native trees that support caterpillars.'],
  ['canopy', [], ['canopyLargest'], 'Connected tree canopy', 'Join scattered trees into a larger canopy patch.'],
  ['shade', [], ['shadedCreek'], 'Creek shade', 'Plant native trees and shrubs along the creek.'],
  ['tidal', [], ['pondsDrained'], 'Tidal feeding habitat', 'Breach old shrimp ponds to restore tidal mudflats.'],
  ['mangrove', [], ['mangrove'], 'Mangrove habitat', 'Restore mangroves along suitable tidal water.'],
  ['beach', [], ['beach', 'beachPlants'], 'Vegetated beach', 'Protect sandy beach and restore its native dune plants.'],
  ['silvo', [], ['silvo'], 'Shaded pasture', 'Plant native shade trees in the cattle paddocks.'],
  ['coral', [], ['coral'], 'Living coral', 'Restore living coral and protect it as it grows.'],
  ['cleaners', [], ['cleanerTiles'], 'Cleaning stations', 'Protect old coral heads that support cleaning stations.'],
];

export function resourceDiagnostics(def, globals) {
  const factor = clamp(def.req(globals), 0, 1.5);
  if (factor >= 1) return [];
  const abundant = { ...globals, stats: { ...globals.stats } };
  for (const [, fields, stats] of RESOURCE_GROUPS) {
    for (const k of fields) abundant[k] = 1e6;
    for (const k of stats) abundant.stats[k] = 1e6;
  }
  const ceiling = clamp(def.req(abundant), 0, 1.5);
  return RESOURCE_GROUPS.flatMap(([key, fields, stats, title, text]) => {
    const probe = { ...abundant, stats: { ...abundant.stats } };
    for (const k of fields) probe[k] = globals[k];
    for (const k of stats) probe.stats[k] = globals.stats?.[k];
    return clamp(def.req(probe), 0, 1.5) < ceiling - 0.001 ? [{ key, title, text }] : [];
  }).map(row => {
    // On the reef these shared simulation counters represent coral and seagrass.
    if (biome.look.underwater && row.key === 'forest') return { ...row, title: 'Coral habitat', text: 'Restore living coral and protect it as it grows.' };
    if (biome.look.underwater && row.key === 'meadow') return { ...row, title: 'Seagrass habitat', text: 'Restore a larger area of healthy seagrass.' };
    return row;
  });
}

export function arrivalAccess(game, def) {
  const w = game.world;
  if (def.crossing) {
    const fences = migrationFenceCount(w);
    return { blocked: fences > 4, partial: false, kind: 'migration', fences };
  }
  if (def.move === 'fly' || !def.sources.length) return { blocked: false, partial: false };
  let possible = 0, open = 0, fenced = 0;
  const consider = i => {
    possible++;
    if (passable(w, i, def)) open++;
    else if (def.fenced && w.feature[i] === F.FENCE) fenced++;
  };
  // Swimming species use the river regardless of their source labels. Other
  // southern arrivals use the same bottom five river rows as immigrate().
  if (def.move === 'swim' || def.sources.includes('S')) {
    for (let x = 0; x < w.w; x++) for (let y = w.h - 1; y > w.h - 6; y--) {
      if (w.terrain[w.idx(x, y)] !== T.RIVER) continue;
      let entryY = y;
      if (def.move === 'ground') while (entryY > 0 && !passable(w, w.idx(x, entryY), def)) entryY--;
      consider(w.idx(x, entryY));
    }
  }
  if (def.move !== 'swim') for (const edge of def.sources) {
    if (edge === 'N') for (let x = 0; x < w.w; x++) consider(w.idx(x, 0));
    if (edge === 'W') for (let y = 0; y < w.h; y++) consider(w.idx(0, y));
    if (edge === 'E') for (let y = 0; y < w.h - 6; y++) consider(w.idx(w.w - 1, y));
  }
  return { blocked: open === 0, partial: open > 0 && open < possible, kind: fenced ? 'fence' : def.move === 'tree' ? 'canopy' : 'entry' };
}

export function wildlifeDiagnostics(game, def) {
  const wl = game.wildlife, st = wl.state[def.index], rows = [];
  const add = (key, tone, title, text) => rows.push({ key, tone, title, text });
  const access = arrivalAccess(game, def);
  const inSeason = !def.season || def.season.includes(game.month);
  const low = st.K < def.minK;
  const needMore = low || st.pop >= st.K;
  if (game.diff.ecology && def.browseRate && !biome.look.underwater) add('browsing', 'info', 'Browses young trees', 'In Challenging, browsing can kill saplings. Brush piles shelter nearby young trees; establish protected patches before opening more wildlife corridors.');
  if (game.diff.ecology) {
    if (preyFor(def, game)) {
      add('predation', 'info', 'Hunts live prey', biome.look.underwater
        ? 'Every successful hunt removes a prey animal. Coral structure and seagrass give prey cover. Failed hunts do not feed predators; hungry adults breed less and may move on.'
        : 'Every successful hunt removes a prey animal. Shrubs and tall groundcover shelter prey; brush, logs and rock piles help small animals hide. Failed hunts do not feed predators; hungry adults breed less and may move on.');
      const hungry = wl.agents.filter(a => a.sp === def.index && !a.leaving && hungryPredator(game, a, def)).length;
      if (hungry) add('hunger', 'warn', 'Predators are short of food', `${hungry} adults have gone at least ${HUNGRY_DAYS} days without a catch. Restore connected prey habitat; these adults cannot breed until they feed and may move away.`);
    }
    const hunters = ANIMALS.filter(d => preyFor(d, game)?.includes(def.key));
    if (hunters.length) {
      const present = hunters.reduce((n, d) => n + wl.state[d.index].pop, 0);
      add('hunted', present ? 'warn' : 'info', 'Part of the prey population', `Predators here: ${present}. Potential hunters: ${names(hunters.map(d => d.key))}. Successful catches reduce this population; habitat and shelter help survivors recover.`);
    }
  }
  if (def.special === 'salmon') {
    const w = game.world;
    let disconnected = 0, poorWater = 0, riverEntry = false;
    for (let i = 0; i < w.n; i++) {
      if (w.terrain[i] === T.CREEK) {
        if (!w.connected[i]) disconnected++;
        else if (wl.suit[def.index][i] <= 0.25) poorWater++;
      }
      if (w.terrain[i] === T.RIVER && w.connected[i] && (i / w.w | 0) > w.h - 6) riverEntry = true;
    }
    const habitat = st.salmonHabitat || 0;
    if (habitat < SALMON_MIN_HABITAT) add('habitat', 'warn', 'Spawning habitat is not ready', `${habitat} of ${SALMON_MIN_HABITAT} suitable creek tiles. Salmon need connected, clean creek habitat.`);
    else add('habitat', 'good', 'Spawning habitat is ready', `${habitat} suitable creek tiles are available for the run.`);
    if (disconnected) add('passage', 'warn', 'Fish passage', `${disconnected} creek tiles are cut off from the river. Remove blocking culverts or reconnect the channel.`);
    if (poorWater) add('quality', 'warn', 'Creek quality', `${poorWater} connected creek tiles are not suitable for spawning. Grow shade along the banks to improve water quality.`);
    if (!riverEntry) add('access', 'warn', 'River entry is missing', 'Restore river water along the southern edge so salmon can enter.');
    if (game.month !== SALMON_RUN_MONTH) add('season', 'info', 'Waiting for the run season', 'Adult salmon runs arrive in October. Young fish follow a separate seasonal cycle.');
    else add('season', 'info', 'Run season', 'The adult run is checked at the start of October. Habitat work after that check prepares the next run.');
    return { status: habitat < SALMON_MIN_HABITAT || !riverEntry ? 'Prepare the salmon run' : st.pop > 0 ? 'Salmon are here' : 'Waiting for the salmon run', tone: habitat < SALMON_MIN_HABITAT || !riverEntry ? 'warn' : 'info', rows };
  }

  if (!inSeason) add('season', 'info', 'Outside the visiting season', `The next visiting season starts in ${nextMonth(def.season, game.month)}. An absence this month is expected.`);
  if (def.season && st.lastYear > 0 && st.pop === 0) add('returning', 'info', 'Previous visitors remember this place', 'Returning migrants can attempt to come back at the start of their visiting season, even before new arrivals discover the habitat. Keep their habitat healthy.');
  if (access.blocked || (access.partial && (access.kind === 'fence' || access.kind === 'canopy'))) {
    const tone = access.blocked ? 'warn' : 'info';
    const title = access.blocked ? 'Arrival access is blocked' : 'Some entry points are blocked';
    const text = access.kind === 'migration' ? `${access.fences} north-edge fence tiles remain. Remove the migration fence so herds can pass through to the park.`
      : access.kind === 'fence' ? 'Open fences along this species’ source edges to give it more ways in.'
      : access.kind === 'canopy' ? 'Grow trees to the source edges. Tree-dwelling animals need grown canopy or snags at their entry points.'
      : 'Restore usable entry points along this species’ source edges. Buildings or unsuitable terrain can block entry.';
    add('access', tone, title, text);
  }
  add('capacity', low ? 'warn' : 'good', low ? 'Not enough support yet' : 'Habitat can support this species', def.domestic
    ? `Current capacity: ${amount(st.K)}. ${st.pop} living here now.`
    : `Current capacity: ${amount(st.K)}; new natural arrivals need at least ${amount(def.minK)}. ${st.pop} living here now.`);
  if (st.baseK < def.minK) add('habitat', 'warn', 'Suitable habitat is too limited', `Expand the habitat described above. The species habitat overlay shows where conditions suit it.`);
  if (st.resourceFactor < 1) {
    const limits = resourceDiagnostics(def, wl.g);
    for (const row of limits) add(`resource-${row.key}`, needMore ? 'warn' : 'info', row.title, row.text);
    if (!limits.length) add('resources', needMore ? 'warn' : 'info', 'Additional habitat needs', 'The landscape does not fully meet this species’ additional needs. Follow its habitat advice above.');
  }
  if (st.preyK != null && (st.preyK < def.minK || st.preyK < Math.min(st.habitatK, def.max))) add('prey', needMore ? 'warn' : 'info', 'Limited by prey', `Current prey supports ${amount(st.preyK)} animals. Restore habitat for ${names(preyFor(def, game))} to support more.`);
  if (st.hostK != null && (st.hostK < def.minK || st.hostK < Math.min(st.habitatK, def.max, st.preyK ?? Infinity))) add('hosts', needMore ? 'warn' : 'info', 'Needs animals to follow', `Current herds support ${amount(st.hostK)}. Restore habitat for ${names(def.needs)}; this species depends on them without hunting them.`);
  const loss = st.calmK - st.baseK;
  if (loss > 0.05 && loss / Math.max(st.calmK, 0.001) > 0.05) add('disturbance', needMore ? 'warn' : 'info', 'Disturbance reduces habitat', 'Disturbance is reducing suitable habitat. Keep busy visitor routes away from quiet wildlife areas.');
  if (st.rawK - st.calmK > 0.05) add('disaster', 'info', 'Fire or flooding reduces habitat', 'Active fire or flooding is temporarily reducing suitable habitat. Protect habitat and reassess as it recovers.');

  let status, tone = 'info';
  if (def.domestic) { status = 'Managed herd'; add('managed', 'info', status, 'These are domestic animals. Wild immigration does not replenish the herd.'); }
  else if (!inSeason) status = 'Waiting for the visiting season';
  else if (st.pop > st.K * 1.1) { status = 'Population exceeds current capacity'; tone = 'warn'; add('overcrowded', tone, status, 'Some animals may leave as the population adjusts. Expand habitat or address the limits listed here.'); }
  else if (access.blocked && st.pop === 0) { status = 'Arrival access is blocked'; tone = 'warn'; }
  else if (low) { status = 'More habitat support is needed'; tone = 'warn'; }
  else if (st.pop >= st.K) { status = 'At current capacity'; add('full', 'info', status, 'There is no room for natural arrivals right now. Improve the limiting habitat or food supply to support more.'); }
  else if (st.pop > 0) { status = 'Established with room to grow'; tone = 'good'; }
  else if (!def.sources.length || def.mig <= 0) { status = def.intro ? 'Reintroduction is needed' : 'No natural arrival'; add('arrival', 'info', status, def.intro ? 'Use the Wildlife tools once suitable habitat is ready.' : 'This species has no natural immigration in this map.'); }
  else if (arrivalFinding(def, st) === 0) { status = 'New habitat is still being discovered'; add('arrival', 'info', status, 'Keep conditions suitable across monthly checks. Newly suitable habitat needs time before natural arrivals can begin.'); }
  else { status = 'Ready for a possible natural arrival'; tone = 'good'; add('arrival', 'info', 'Waiting for discovery', 'Conditions allow natural arrivals. Arrival is chance-based at monthly checks; there is no guaranteed date.'); }
  return { status, tone, rows };
}
