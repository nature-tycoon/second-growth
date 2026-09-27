// Campaign: eight chapters on one map. Each one teaches a single idea, sets a few objectives,
// and unlocks the tools for the next step. Free Play has everything from the start.
// Each map has its own chapters (Hollis below, the Amazon ranch in campaign-amazon.js, Enkare in campaign-serengeti.js); CHAPTERS
// is refilled when the map changes.

import { T, F, H, isWater } from '../config.js';
import { ANIMAL } from '../data/animals.js';
import { TOOLS } from '../tools.js';
import { speciesPresent } from './goals.js';
import { onBiome } from '../biome.js';
import { amazonChapters } from './campaign-amazon.js';
import { serengetiChapters } from './campaign-serengeti.js';

const used = (g, ...keys) => keys.reduce((n, k) => n + (g.stats.used?.[k] || 0), 0);
const pop = (g, k) => ANIMAL[k] ? g.wildlife.state[ANIMAL[k].index].pop : 0;
const culvertGone = w => { for (let i = 0; i < w.n; i++) if (w.feature[i] === F.CULVERT) return false; return true; };
const edgeFence = w => {
  let n = 0;
  for (let x = 0; x < w.w; x++) if (w.feature[w.idx(x, 0)] === F.FENCE) n++;
  for (let y = 0; y < w.h; y++) if (w.feature[w.idx(w.w - 1, y)] === F.FENCE) n++;
  return n;
};
const wetland = w => (w.stats.counts?.[H.MARSH] || 0) + (w.stats.counts?.[H.POND] || 0);
const score = g => Math.round(g.cache.score?.total ?? 0);

// Objective helper: a check and a short progress line.
const count = (desc, get, target, unit = '') => ({ desc, check: g => get(g) >= target, prog: g => `${Math.min(get(g), target).toLocaleString()} / ${target.toLocaleString()}${unit}` });
const flag = (desc, test, doneText = 'Done', todo = 'Not yet') => ({ desc, check: test, prog: g => test(g) ? doneText : todo });

const layerTools = (sub) => Object.values(TOOLS).filter(t => t.sub === sub).map(t => t.key);
const wildlifeTools = () => Object.values(TOOLS).filter(t => t.cat === 'wildlife').map(t => t.key);
const HELPERS = { used, pop, culvertGone, edgeFence, wetland, score, count, flag, layerTools, wildlifeTools, speciesPresent };

export const CHAPTERS = [];
const pnwChapters = () => [
  {
    key: 'fields', title: 'Wake up the fields', reward: 2000,
    story: 'The old Hollis fields have been plowed and grazed for seventy years. Start small: look around, break up the compacted ground, and sow native meadow.',
    teach: 'Use <b>Inspect</b> to click the land. Then pick <b>Landscape → Loosen soil</b> and drag across a plowed field, and sow <b>Plant → Upland meadow mix</b> on top. The brush preview turns green where plants will thrive.',
    unlock: ['rip', 'mix_meadow'],
    goals: [
      flag('Inspect a tile or an animal', g => !!g.flags.inspected),
      count('Loosen 60 tiles of plowed field or pasture', g => used(g, 'rip'), 60, ' tiles'),
      count('Sow 150 tiles of upland meadow mix', g => used(g, 'mix_meadow'), 150, ' seeded'),
    ],
  },
  {
    key: 'water', title: 'Just add water', reward: 2500,
    story: 'Water is the fastest way to bring a valley back to life. Frogs, ducks and herons follow it, and the ground around it stays green through the dry summers.',
    teach: 'Dig <b>ponds</b> and <b>shallow marsh</b> in low spots (the Elevation overlay shows hollows), then brush the <b>wetland & marsh mix</b> around them. Your meadow from Chapter 1 keeps growing while you work.',
    unlock: ['pond', 'marsh', 'creek', 'fill', 'mix_wet'],
    goals: [
      count('Dig 40 tiles of pond, marsh or creek', g => g.stats.dug || 0, 40, ' tiles'),
      count('Sow 80 tiles of wetland & marsh mix', g => used(g, 'mix_wet'), 80, ' seeded'),
      count('Grow 100 tiles of native meadow', g => g.world.stats.meadow || 0, 100, ' tiles'),
    ],
  },
  {
    key: 'gates', title: 'Open the gates', reward: 3000,
    story: 'The farm is walled off from the wild. A culvert under the river road blocks fish, the boundary fence stops deer and elk, and blackberry is creeping in from the neighbours.',
    teach: '<b>Remove → Demolish</b> tears out the culvert (where the river road crosses the ditch) and fences. <b>Pull invasives</b> clears blackberry, broom and canarygrass; the brush glows pink over them.',
    unlock: ['demolish', 'pull'],
    goals: [
      flag('Remove the culvert under the river road', g => culvertGone(g.world), 'Open', 'Still blocking fish'),
      { desc: 'Tear out the fence along the north and east edges', check: g => edgeFence(g.world) === 0, prog: g => edgeFence(g.world) ? `${edgeFence(g.world)} fence tiles left` : 'Done' },
      count('Pull 30 tiles of invasive plants', g => used(g, 'pull'), 30, ' tiles'),
    ],
  },
  {
    key: 'shade', title: 'Shade the creek', reward: 3500,
    story: 'The ditch runs hot and bare in summer. Shrubs and trees along its banks cool the water, hold the soil, and give birds a place to nest.',
    teach: 'The <b>Shrubs</b> and <b>Trees</b> tabs are open now. <b>Streamside shrubs</b> and <b>pioneer trees</b> grow fast along the creek. Trees need years to mature, so plant early.',
    unlock: ['mix_riparian', 'mix_upland', 'mix_pioneer', 'mulch', ...layerTools('shrub'), ...layerTools('tree')],
    goals: [
      count('Plant 40 shrubs or trees right beside the creek', g => g.stats.creekPlanted || 0, 40, ' planted'),
      count('Plant 100 trees', g => g.stats.treesPlanted || 0, 100, ' trees'),
      count('Have 8 animal species living here', g => speciesPresent(g), 8, ' species'),
    ],
  },
  {
    key: 'homes', title: 'Homes for wildlife', reward: 4000,
    story: 'Animals need more than food. Woodpeckers carve snags, salamanders hide under logs, and bats roost in old barns. Give them places to live.',
    teach: 'The <b>Habitat</b> tools place snags, logs, rock and brush piles and nest boxes. You can also <b>rebuild a barn or shed</b> as a roost. Forest-floor and understory mixes fill in beneath young trees.',
    unlock: ['snag', 'log', 'rocks', 'brush', 'nestbox', 'build_barn', 'build_shed', 'build_house', 'build_silo', 'mix_forestfloor', 'mix_understory', 'mix_conifer', ...layerTools('ground')],
    goals: [
      count('Place 10 snags, logs, rock piles, brush piles or nest boxes', g => used(g, 'snag', 'log', 'rocks', 'brush', 'nestbox'), 10),
      count('Have 12 animal species living here', g => speciesPresent(g), 12, ' species'),
      count('Grow 250 tiles of native meadow', g => g.world.stats.meadow || 0, 250, ' tiles'),
    ],
  },
  {
    key: 'disturbance', title: 'Fire and flood', reward: 5000,
    story: 'From now on, summer wildfires and winter floods can reach the farm, just as they shape every Northwest valley. Healthy land bends and recovers.',
    teach: '<b>Controlled burns</b> clear fuel and renew meadows. Send a <b>fire crew</b> if a wildfire threatens young forest. Wetlands soak up floods; check the <b>Flood risk</b> overlay to see which land the river reaches.',
    unlock: ['burn', 'clear', 'firecrew', 'raise', 'lower'],
    events: true,
    goals: [
      count('Do a controlled burn on 25 tiles', g => used(g, 'burn'), 25, ' tiles'),
      count('Restore 120 tiles of marsh and pond', g => wetland(g.world), 120, ' tiles'),
      count('Reach an ecosystem health score of 45', score, 45),
    ],
  },
  {
    key: 'public', title: 'Open to the public', reward: 6000,
    story: 'People want to see what you have done. Visitors pay their way with donations, but crowds on the trails push shy animals away, so plan the route with care.',
    teach: 'Build <b>trailhead parking</b> beside a road (you can lay new <b>roads</b> too), then run a <b>nature trail</b> out from it. <b>Boardwalks</b> cross wetlands and <b>viewing blinds</b> let people watch without disturbing.',
    unlock: ['trail', 'boardwalk', 'blind', 'build_parking', 'build_center', 'build_road'],
    goals: [
      count('Connect 40 tiles of trail to a trailhead', g => g.visitors.facilities().parking ? g.visitors.net.length : 0, 40, ' tiles'),
      count('Welcome 300 visitors', g => g.visitors.total, 300, ' visitors'),
      { desc: 'Reach a 2.5-star visitor rating', check: g => g.visitors.rating >= 2.5, prog: g => `${g.visitors.rating.toFixed(1)} / 2.5 stars` },
    ],
  },
  {
    key: 'wild', title: 'The return of the wild', reward: 10000,
    story: 'The valley is ready for the animals that cannot walk back on their own. Bring them home, and let the beavers finish the work.',
    teach: 'The <b>Wildlife</b> tools reintroduce elk, beavers, red-legged frogs, pond turtles and cutthroat trout. Each needs the right habitat first; the tool shows what it needs.',
    unlock: wildlifeTools(),
    goals: [
      flag('Beavers build their first dam', g => !!g.flags.beaverDam, 'Done', 'Waiting on beavers'),
      count('Have 18 animal species living here', g => speciesPresent(g), 18, ' species'),
      count('Reach an ecosystem health score of 55', score, 55),
    ],
  },
];

export const campaignOn = g => g.mode === 'campaign';
export const campaignDone = g => campaignOn(g) && g.campaign.chapter >= CHAPTERS.length;
export const currentChapter = g => campaignOn(g) ? CHAPTERS[g.campaign.chapter] || null : null;

// The tools the player may use (null means everything, as in Free Play).
export function unlockedTools(g) {
  if (!campaignOn(g) || campaignDone(g)) return null;
  const set = new Set();
  for (let k = 0; k <= g.campaign.chapter; k++) for (const t of CHAPTERS[k].unlock) set.add(t);
  return set;
}
export function toolUnlocked(g, key) { const s = unlockedTools(g); return !s || s.has(key); }
export function chapterOfTool(key) { return CHAPTERS.findIndex(c => c.unlock.includes(key)); }
// Wildfires and floods arrive with Chapter 6 in the campaign.
export function disturbanceOn(g) {
  if (!campaignOn(g) || campaignDone(g)) return true;
  return CHAPTERS.slice(0, g.campaign.chapter + 1).some(c => c.events);
}

// Called every day: completes the chapter once all its goals are met.
export function checkCampaign(g) {
  const ch = currentChapter(g);
  if (!ch) return;
  if (!ch.goals.every(o => o.check(g))) return;
  g.campaign.chapter++;
  g.grant(ch.reward * 0.6, 'chapter');
  g.emit('chapter', { done: ch, next: currentChapter(g), index: g.campaign.chapter - 1 });
}

// All plant tools a chapter makes available, for describing the unlocks.
export function toolNames(keys) {
  return keys.map(k => TOOLS[k]).filter(Boolean);
}

// the chapters for whichever map is being played (built after that map's tools exist)
const BUILDERS = { pnw: pnwChapters, amazon: () => amazonChapters(HELPERS), serengeti: () => serengetiChapters(HELPERS) };
onBiome(b => { CHAPTERS.length = 0; CHAPTERS.push(...(BUILDERS[b.id] ? BUILDERS[b.id]() : [])); });
