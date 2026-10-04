// Map: Kalinda Reef, a patch of the southern Great Barrier Reef, Queensland, Australia, off a small
// sand cay with a research station on it. Bleached in two summer heatwaves, its branching coral
// has died and collapsed into loose rubble; algae has grown over it, and crown-of-thorns starfish
// are eating into what's left. An underwater map: the seabed is the "land", corals are its trees.

import buildReefPlants from '../data/plants-reef.js';
import buildReefAnimals from '../data/animals-reef.js';
import { generateReef, reefBorderCell, SEA } from './reef-world.js';
import { pop, speciesPresent } from '../sim/goals.js';
import { PLANT, PLANTS } from '../data/plants.js';
import { ANIMALS, ANIMAL } from '../data/animals.js';
import { T, F, clamp } from '../config.js';
import { moment, arrivalMoment, momentFree } from '../sim/moments.js';

const invPct = g => (g.cache.score?.invFrac ?? 1) * 100;
const st = (g, k) => g.world.stats?.[k] || 0;
const dryTile = (w, i) => w.tileH(i % w.w, (i / w.w) | 0) > SEA - 0.2;
// where the reef's animals can't go: the cay, and the ankle-deep water lapping at its beach
// (the seabed here never changes height, so it's worked out once per world)
const shoreMask = w => w._shore || (w._shore = Uint8Array.from({ length: w.n }, (_, i) => (w.tileH(i % w.w, (i / w.w) | 0) > SEA - 0.45 ? 1 : 0)));

// soft coral grown since the start (the reef starts with some)
const softNew = g => { const f = g.flags; if (f.soft0 == null && g.world.stats?.softCoral != null) f.soft0 = st(g, 'softCoral'); return f.soft0 == null ? 0 : Math.max(0, st(g, 'softCoral') - f.soft0); };
const goal = (key, name, reward, desc, check, prog) => ({ key, name, reward, desc, check, prog });
const GOALS = [
  goal('stars', 'Hold the rubble down', 1500, 'Lay 120 tiles of reef stars (Landscape → Reef stars) over the loose rubble. Young corals can\'t take hold on rubble that rolls with every swell.',
    g => (g.stats.used?.rip || 0) >= 120, g => `${Math.min(120, g.stats.used?.rip || 0)} / 120 tiles`),
  goal('cull', 'Beat the outbreak', 2500, 'Cull every crown-of-thorns starfish on the reef (Remove → Cull starfish & algae).',
    g => g.day > 5 && st(g, 'cots') === 0, g => `${st(g, 'cots')} starfish left`),
  goal('snorkel', 'Snorkelers', 2000, 'Mark a snorkel trail out from the boat landing, and welcome your first snorkelers.',
    g => (g.visitors?.total || 0) > 0, g => g.visitors?.total ? 'Done' : 'No snorkelers yet'),
  goal('coral400', 'Coral comes back', 3000, 'Grow 400 tiles of living coral. Plant nursery fragments on the reef stars.',
    g => st(g, 'coral') >= 400, g => `${st(g, 'coral').toLocaleString()} / 400 tiles`),
  goal('nemo', 'Clownfish move in', 2000, 'Clownfish settle in the reef\'s anemones. Plant more anemones for them.',
    g => pop(g, 'clownfish') >= 2, g => `${pop(g, 'clownfish')} / 2 clownfish`),
  goal('cay', 'Green the cay', 2500, 'Plant 60 tiles of the cay with spinifex, octopus bush and pisonia, to hold the sand and give seabirds somewhere to nest.',
    g => st(g, 'cayPlants') >= 60, g => `${st(g, 'cayPlants')} / 60 tiles`),
  goal('meadow', 'Seagrass meadows', 2500, 'Grow 1,500 tiles of seagrass meadow on the lagoon sand.',
    g => (g.world.stats.meadow || 0) >= 1500, g => `${(g.world.stats.meadow || 0).toLocaleString()} / 1,500 tiles`),
  goal('spawn', 'Spawning night', 3000, 'Have 100 young corals settle from the reef\'s own spawn (every November). They need clean, stable ground near living coral.',
    g => (g.flags.spawned || 0) >= 100, g => `${g.flags.spawned || 0} / 100 settled`),
  goal('algae', 'Clean reef', 3000, 'Get algae and starfish below 10% of the reef. Parrotfish and surgeonfish graze algae back for you.',
    g => invPct(g) < 10, g => `${invPct(g).toFixed(0)}% algae and starfish`),
  goal('mixed', 'A mixed reef', 3500, 'Grow five kinds of hard coral, each on at least 20 tiles. A reef with fast and tough corals together comes back from heatwaves and cyclones.',
    g => st(g, 'coralKinds') >= 5, g => `${st(g, 'coralKinds')} / 5 kinds`),
  goal('clams', 'Giants on the sand', 2500, 'Grow 12 giant clams. They sit happily on sand or rubble, and filter the water clean around them so algae struggles.',
    g => st(g, 'clams') >= 12, g => `${st(g, 'clams')} / 12 giant clams`),
  goal('garden', 'Soft coral gardens', 3000, 'Grow 150 more tiles of soft corals, sea fans and sponges among the hard corals. A spot one holds stays theirs.',
    g => softNew(g) >= 150, g => `${softNew(g)} / 150 new tiles`),
  goal('species10', 'Full of fish', 4000, 'Have 10 kinds of animals living on the reef at once.',
    g => speciesPresent(g) >= 10, g => `${speciesPresent(g)} / 10 species`),
  goal('noddy', 'Noddies nest', 3000, 'Black noddies nest in the cay\'s pisonia trees.',
    g => pop(g, 'noddy') > 0, g => `${pop(g, 'noddy')} noddies here (${st(g, 'pisonia')} pisonia trees grown)`),
  goal('humphead', 'The starfish-eater', 4000, 'A humphead wrasse moves in: one of the few fish that eats crown-of-thorns starfish.',
    g => pop(g, 'humphead') > 0, g => `${pop(g, 'humphead')} humphead wrasse here`),
  goal('coral1500', 'A living reef', 6000, 'Grow 1,500 tiles of living coral.',
    g => st(g, 'coral') >= 1500, g => `${st(g, 'coral').toLocaleString()} / 1,500 tiles`),
  goal('shark', 'Sharks patrol', 6000, 'Whitetip reef sharks hunt the reef. They only stay where there are plenty of fish.',
    g => pop(g, 'shark') > 0, g => `${pop(g, 'shark')} sharks here`),
  goal('dugong', 'Sea cows', 6000, 'A dugong comes to graze. Dugongs need big seagrass meadows.',
    g => pop(g, 'dugong') > 0, g => `${pop(g, 'dugong')} dugongs here`),
  goal('manta', 'Mantas come to be cleaned', 8000, 'Manta rays visit in winter, when there are old coral heads with cleaner fish on them.',
    g => pop(g, 'manta') > 0, g => `${pop(g, 'manta')} mantas here (May to October)`),
  goal('species16', 'Teeming', 10000, 'Have 16 kinds of animals living on and over the reef at once.',
    g => speciesPresent(g) >= 16, g => `${speciesPresent(g)} / 16 species`),
  goal('score', 'Thriving', 12000, 'Reach an ecosystem health score of 70.',
    g => (g.cache.score?.total ?? 0) >= 70, g => `${Math.round(g.cache.score?.total ?? 0)} / 70`),
];

// ---------------------------------------------------------------- what grows on what
// Sand suits seagrass. Hard and soft corals need a hard, stable surface: on loose rubble they're
// knocked over and buried by every swell, unless reef stars or coralline algae hold it together.
// Limestone boulders dropped on the seabed give them one even out on the sand.
// Corals compete for room, not light: a spot held by a grown hard coral has no space for a soft
// coral, sponge or clam to settle, and the other way round. So the soft corals keep patches of
// their own between the hard ones for good, instead of dying out in their shade.
const MOBILE = { cots: 1, linckia: 1 }; // (starfish crawl about, rather than holding a spot)
const cemented = (w, i) => w.ground[i] === PLANT.cca?.id && w.groundG[i] > 0.4;
// who already holds this spot, if it isn't free for p (or null)
function holder(w, i, p) {
  if (MOBILE[p.key] || p.layer === 0) return null;
  if (p.layer === 2 && w.tree[i] !== p.id && w.shrub[i] && !MOBILE[PLANTS[w.shrub[i]].key] && w.shrubG[i] > 0.3) return PLANTS[w.shrub[i]];
  if (p.layer === 1 && w.shrub[i] !== p.id && w.tree[i] && w.treeG[i] > 0.3) return PLANTS[w.tree[i]];
  return null;
}
function terrainFit(w, i, p) {
  if (dryTile(w, i)) return p.cay ? 1 : 0; // (the cay is above the water: only its own plants grow there)
  if (p.cay) return 0;
  const t = w.terrain[i];
  if (p.key === 'cots') return w.tree[i] ? 1 : 0.15; // starfish go where there's coral to eat
  // (blue sea stars roam sand, rubble and reef alike, but they're scattered singly, a few to a
  // reef flat, not a carpet: a new one only settles away from the others, and only while the
  // reef has no more than it started with, about one tile in sixty)
  if (p.key === 'linckia') {
    if ((w.stats?.seastars || 0) > w.n * 0.016) return 0;
    const x = i % w.w, y = (i / w.w) | 0;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
      if ((dx || dy) && w.inb(x + dx, y + dy) && w.shrub[w.idx(x + dx, y + dy)] === p.id) return 0;
    }
    return 0.7;
  }
  if (holder(w, i, p)) return 0.05;
  if (p.key === 'fungia') return t === T.GRAVEL ? 0.8 : t === T.PASTURE ? 0.7 : 0.6; // (the coral that lies loose on rubble and sand)
  if (p.key === 'clam') return t === T.GRAVEL && !cemented(w, i) ? 0.6 : 0.9; // (giant clams sit on sand and rubble)
  if (p.key === 'halimeda') return t === T.PASTURE ? 1 : 0.5;
  const seagrass = p.key === 'halophila' || p.key === 'zostera';
  if (p.layer === 0) {
    if (seagrass) return t === T.PASTURE ? 1 : t === T.SOIL ? 0.25 : 0.06;
    if (p.key === 'cca') return t === T.PASTURE ? 0.12 : 1;
    if (p.key === 'turf') return t === T.PASTURE ? 0.3 : w.tree[i] && w.treeG[i] > 0.5 ? 0.35 : 1; // (living coral fends it off)
    return null;
  }
  if (w.feature[i] === F.ROCKS) return 0.9; // reef boulders
  if (t === T.SOIL) return 1;
  if (t === T.GRAVEL) return cemented(w, i) ? 0.65 : 0.14;
  if (t === T.PASTURE) return p.layer === 1 ? 0.25 : 0.12;
  return null;
}
function groundNote(w, i, p) {
  if (dryTile(w, i)) return p.cay ? null : 'above the waterline: only cay plants grow here';
  if (p.cay) return 'under water: cay plants only grow on the island';
  const h = holder(w, i, p);
  if (h) return `a ${h.name.toLowerCase()} already holds this spot`;
  if (p.layer === 0 || MOBILE[p.key] || p.key === 'fungia' || p.key === 'clam' || w.feature[i] === F.ROCKS) return null;
  const t = w.terrain[i];
  if (t === T.GRAVEL && !cemented(w, i)) return 'loose rubble: lay reef stars, or let coralline algae cement it, first';
  if (t === T.PASTURE) return 'bare sand: corals need something hard to grow on. Drop reef boulders first (Habitat → Reef boulders)';
  return null;
}

// ---------------------------------------------------------------- the reef's own day
// Marine heatwaves, crown-of-thorns starfish, and the fish that graze the algae.
function reefDaily(g) {
  const w = g.world, rng = g.rng, n = w.n;
  if (!w.bleach || w.bleach.length !== n) w.bleach = new Float32Array(n);
  const B = w.bleach, f = g.flags, year = Math.floor(g.day / 120), dom = g.day % 10;

  // Marine heatwaves. The weather bureau's seasonal outlook gives a month's warning (in November):
  // then the water may sit a degree or two too warm for weeks through the summer, and corals
  // expel the algae that feed and colour them. Whether a coral bleaches, and whether it recovers,
  // depends on how tough its kind is, how deep it sits, whether it's under shade cloth, and how
  // clean the water around it is (algae and flood plumes make it worse).
  if (g.month === 8 && dom === 0 && f.heatYear !== year) {
    f.heatYear = year;
    // (none on Relaxed; otherwise about one summer in four, and never two summers running: the
    // reef always gets at least a year to recover)
    if (year >= 1 && g.difficulty !== 'relaxed' && year - (f.heatLastYear ?? -9) >= 2 && rng() < 0.25 * (g.diff?.disasters ?? 1)) {
      f.heatLastYear = year;
      f.heatSoon = { sev: 0.6 + rng() * 0.6, len: 18 + Math.floor(rng() * 26) };
      g.notify(`Heat outlook: the weather bureau expects the water over the reef to run ${f.heatSoon.sev > 0.9 ? 'two' : 'one and a half'} degrees too warm this summer, from December. To protect the corals: string shade cloth over the ones you care about most (Landscape → Shade cloth), keep the algae down (dirty water makes bleaching worse), and remember that boulder and brain corals, and corals in deeper water, cope far better than staghorn and table coral.`, 'warn');
    }
  }
  if (g.month === 9 && dom === 0 && f.heatSoon) {
    f.heat = { left: f.heatSoon.len, sev: f.heatSoon.sev, hit: 0, dead: 0 };
    f.heatSoon = null;
    g.notify(`Marine heatwave: the water over the reef is ${f.heat.sev > 0.9 ? 'two' : 'one and a half'} degrees warmer than normal. The corals are starting to bleach. If it doesn't last too long, most will recover.`, 'warn');
  }
  const heat = f.heat && f.heat.left > 0 ? f.heat : null, plume = f.plume && f.plume.left > 0;
  const turf = PLANT.turf?.id;
  for (let i = 0; i < n; i++) {
    const tp = w.tree[i] ? PLANTS[w.tree[i]] : null, sp = w.shrub[i] ? PLANTS[w.shrub[i]] : null;
    const sens = Math.max(tp?.bleach || 0, sp?.bleach || 0);
    if (!sens) { B[i] = 0; continue; }
    const dirty = (w.ground[i] === turf && w.groundG[i] > 0.4 ? 0.3 : 0) + (plume ? 0.2 : 0);
    if (heat) {
      const depth = SEA - w.tileH(i % w.w, (i / w.w) | 0), cool = clamp((depth - 4) / 8, 0, 0.5); // (deeper water stays a little cooler)
      const shade = w.marks[i] & 8 ? 0.75 : 0; // (shade cloth: much less sun on a hot, still day)
      const b0 = B[i];
      B[i] = Math.min(1, B[i] + 0.03 * heat.sev * sens * (1 - cool) * (1 - shade) * (1 + dirty));
      if (b0 < 0.5 && B[i] >= 0.5) heat.hit++;
    } else if (B[i] > 0) B[i] = Math.max(0, B[i] - (dirty ? 0.012 : 0.024)); // recovering, slowly, once the water cools (faster in clean water)
    // coral bleached white for too long starves
    if (B[i] > 0.8 && rng() < 0.012 * (B[i] - 0.6) / 0.4 * (tp ? (tp.bleach ?? 1) : 1)) {
      if (tp) { w.tree[i] = 0; w.treeG[i] = 0; w.treeAge[i] = 0; if (w.terrain[i] !== T.SOIL) w.terrain[i] = T.GRAVEL; } // dead branches collapse into rubble
      if (sp && sp.bleach) { w.shrub[i] = 0; w.shrubG[i] = 0; }
      if (!w.ground[i] || PLANTS[w.ground[i]].key !== 'cca') { w.ground[i] = turf; w.groundG[i] = 0.2; } // and algae moves in
      B[i] = 0;
      if (f.heat) f.heat.dead++;
    }
  }
  if (heat && --heat.left === 0) {
    g.notify(`The heatwave is over. ${heat.hit} corals bleached${heat.dead ? `, and ${heat.dead} have already died` : ''}. The rest have a few weeks to take their algae back, faster where the water is clean. Heat-tolerant boulder and brain corals, and corals under shade cloth, came through best.`, heat.dead > 40 ? 'bad' : 'info');
  }
  // the shade cloths come in at the end of summer (and each one is a job for the dive team again next year)
  if (g.month === 0 && dom === 0) {
    let k = 0;
    for (let i = 0; i < n; i++) if (w.marks[i] & 8) { w.marks[i] &= ~8; k++; }
    if (k) { w.renderDirty = true; g.notify(`Summer's over: the dive team has taken in the shade cloth over ${k} tiles of reef until next summer.`, 'info'); }
  }

  // Crown-of-thorns starfish eat the coral they sit on, and when it's gone they crawl on to the
  // next coral, or starve. Fish pick off young starfish, so a reef full of fish keeps them few;
  // and they breed once a summer, when only a flood plume's nutrients let many of their larvae
  // survive. So outbreaks follow plumes, and a healthy reef wears them down between times.
  const cots = PLANT.cots?.id;
  const fishy = clamp(speciesPresent(g) / 14, 0, 1);
  if (cots) {
    const eaten = 0.0012 + 0.0025 * fishy, moved = new Set();
    for (let i = 0; i < n; i++) {
      if (w.shrub[i] !== cots || moved.has(i)) continue;
      if (rng() < eaten) { w.shrub[i] = 0; w.shrubG[i] = 0; continue; }
      if (w.tree[i]) {
        w.treeG[i] -= 0.006 * w.shrubG[i];
        if (w.treeG[i] < 0.08) { w.tree[i] = 0; w.treeG[i] = 0; w.treeAge[i] = 0; if (!w.ground[i]) { w.ground[i] = turf; w.groundG[i] = 0.2; } }
        continue;
      }
      // its coral is gone: look for more next door
      if (rng() < 0.3) {
        const x = i % w.w, y = (i / w.w) | 0, o = Math.floor(rng() * 8);
        let to = -1;
        for (let k = 0; k < 8 && to < 0; k++) {
          const [dx, dy] = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]][(k + o) % 8];
          if (!w.inb(x + dx, y + dy)) continue;
          const j = w.idx(x + dx, y + dy);
          if (w.tree[j] && w.treeG[j] > 0.3 && !w.shrub[j]) to = j;
        }
        if (to >= 0) { w.shrub[to] = cots; w.shrubG[to] = w.shrubG[i]; w.shrub[i] = 0; w.shrubG[i] = 0; moved.add(to); continue; }
      }
      if ((w.shrubG[i] -= 0.02) < 0.05) { w.shrub[i] = 0; w.shrubG[i] = 0; }
    }
    // their spawning, in the warm water of January
    if (g.month === 10 && dom === 2 && f.cotsSpawnYear !== year) {
      f.cotsSpawnYear = year;
      const adults = [];
      for (let i = 0; i < n; i++) if (w.shrub[i] === cots && w.shrubG[i] > 0.4) adults.push(i);
      const rich = g.day < (f.cotsBoostUntil || 0); // (a flood plume fed the larvae)
      const want = Math.round(adults.length * (rich ? 2.6 : 0.35) * (1 - 0.7 * fishy));
      let k = 0;
      for (let t = 0; t < want * 8 && k < want; t++) {
        const a = adults[Math.floor(rng() * adults.length)], x = a % w.w + Math.round((rng() * 2 - 1) * 7), y = ((a / w.w) | 0) + Math.round((rng() * 2 - 1) * 7);
        if (!w.inb(x, y)) continue;
        const j = w.idx(x, y);
        if (w.tree[j] && w.treeG[j] > 0.3 && !w.shrub[j]) { w.shrub[j] = cots; w.shrubG[j] = 0.15; k++; }
      }
      if (k >= 10) g.notify(rich
        ? `The crown-of-thorns starfish spawned, and with the nutrients the flood plume left in the water, ${k} young ones have survived to settle on the coral. Cull them while they're small.`
        : `The crown-of-thorns starfish spawned, and ${k} young ones have settled on the coral. The more fish on the reef, the fewer of them survive.`, 'warn', { x: adults[0] % w.w, y: (adults[0] / w.w) | 0 });
    }
  }
  // Now and then (every several years) a new outbreak drifts in from the reefs up-current.
  if (cots && rng() < 0.0005 * (g.day < (f.cotsBoostUntil || 0) ? 8 : 1) * (g.diff?.disasters ?? 1) && g.day > 240 && !st(g, 'cots')) {
    const x0 = rng() < 0.5 ? 2 + Math.floor(rng() * 8) : w.w - 10 + Math.floor(rng() * 8), y0 = Math.floor(w.h * 0.5 + rng() * w.h * 0.35);
    let k = 0;
    for (let y = y0 - 4; y <= y0 + 4; y++) for (let x = x0 - 6; x <= x0 + 6; x++) {
      if (!w.inb(x, y)) continue;
      const i = w.idx(x, y);
      if (w.tree[i] && !w.shrub[i] && rng() < 0.4) { w.shrub[i] = cots; w.shrubG[i] = 0.4; k++; }
    }
    if (k) g.notify('A crown-of-thorns outbreak has drifted in on the current and is eating into the coral. Cull them before they spread.', 'warn', { x: x0, y: y0 });
  }

  // Giant clams filter the water as they feed: turf algae struggles around them.
  const clam = PLANT.clam?.id;
  if (clam && turf) for (let i = 0; i < n; i++) {
    if (w.shrub[i] !== clam || w.shrubG[i] < 0.5) continue;
    const x = i % w.w, y = (i / w.w) | 0;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
      if (!w.inb(x + dx, y + dy)) continue;
      const j = w.idx(x + dx, y + dy);
      if (w.ground[j] === turf && (w.groundG[j] -= 0.01) < 0.06) { w.ground[j] = 0; w.groundG[j] = 0; }
    }
  }

  reefMoments(g);

  // Herbivores at work: parrotfish and surgeonfish graze algae down around wherever they are.
  // ...and the humphead wrasse eats crown-of-thorns starfish, one of the very few things that will.
  const grazers = { parrotfish: 0.14, tang: 0.08 };
  if (turf) for (const a of g.wildlife.agents) {
    const key = ANIMALS[a.sp]?.key, bite = grazers[key];
    if (!bite && key !== 'humphead') continue;
    const ax = Math.floor(a.x), ay = Math.floor(a.y);
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
      if (!w.inb(ax + dx, ay + dy)) continue;
      const i = w.idx(ax + dx, ay + dy);
      if (bite && w.ground[i] === turf && (w.groundG[i] -= bite) < 0.06) { w.ground[i] = 0; w.groundG[i] = 0; }
      if (key === 'humphead' && w.shrub[i] === cots && (w.shrubG[i] -= 0.12) < 0.05) { w.shrub[i] = 0; w.shrubG[i] = 0; }
    }
  }

  // Coral spawning: a few nights after the November full moon, every coral on the reef releases its
  // eggs at once. The larvae drift for days, then settle on clean, stable ground near living reef
  // (reef stars, cemented rubble), not on loose rubble or under a mat of algae.
  if (g.month === 8 && dom === 4 && f.spawnYear !== year) {
    f.spawnYear = year;
    // (soft corals spawn too, and about a quarter of what settles is soft coral)
    const kinds = ['staghorn', 'staghorn', 'tablecoral', 'montipora', 'brain', 'boulder'].map(k => PLANT[k]).filter(Boolean);
    const softs = ['softcoral', 'softcoral', 'seafan'].map(k => PLANT[k]).filter(Boolean);
    let settled = 0, sx = 0, sy = 0;
    for (let i = 0; i < n; i++) {
      if (w.tree[i] || w.shrub[i] || dryTile(w, i) || w.distForest[i] > 4) continue;
      const t = w.terrain[i];
      if (!(t === T.SOIL || (t === T.GRAVEL && cemented(w, i)) || w.feature[i] === F.ROCKS)) continue;
      if (w.ground[i] === turf && w.groundG[i] > 0.3) continue;
      if (rng() > 0.06) continue;
      const list = rng() < 0.25 && softs.length ? softs : kinds;
      w.setPlant(i, list[Math.floor(rng() * list.length)], 0.06, 0); settled++; sx += i % w.w; sy += (i / w.w) | 0;
    }
    f.spawned = (f.spawned || 0) + settled;
    f.spawnDay = g.day; // (the slicks of spawn rise that night: see the renderer)
    // the first big spawning of a reef the player has rebuilt is a keystone moment
    if (settled >= 30 && st(g, 'coral') >= 300 && !(g.flags.moments || {}).spawning && momentFree(g)) {
      moment(g, 'spawning', { x: sx / settled + 0.5, y: sy / settled + 0.5 });
      settled = -settled; // (the moment tells the story instead of the usual note)
    }
    if (settled < 0) settled = 0; else g.notify(settled > 10
      ? `The corals spawned last night: pink clouds of eggs drifted up off the whole reef at once. ${settled} young corals have settled on clean, stable ground near the living reef.`
      : `The corals spawned last night, but almost no larvae found anywhere to settle${settled ? ` (${settled})` : ''}. They need stable, clean ground near living coral: reef stars or cemented rubble, free of algae.`, settled > 10 ? 'good' : 'info');
  }

  // Cyclones: some summers one tracks across the reef, and its swell smashes branching and plate
  // corals into rubble in a wide band, most in the shallows. Massive corals ride it out, and rubble
  // held down by reef stars stays put.
  if (g.month === 9 && dom === 1 && f.cycloneYear !== year) {
    f.cycloneYear = year;
    if (year >= 1 && rng() < 0.22 * (g.diff?.disasters ?? 1)) f.cycloneDay = g.day + 3 + Math.floor(rng() * 55); // (some time in the summer)
  }
  if (f.cycloneDay && g.day === f.cycloneDay) {
    f.cycloneDay = 0;
    const cy = Math.floor(w.h * (0.4 + rng() * 0.5)), half = 12 + Math.floor(rng() * 8);
    let broken = 0;
    for (let y = Math.max(0, cy - half); y < Math.min(w.h, cy + half); y++) for (let x = 0; x < w.w; x++) {
      const i = w.idx(x, y), depth = SEA - w.tileH(x, y), hit = clamp(1.5 - depth * 0.22, 0.3, 1) * (1 - Math.abs(y - cy) / half * 0.5);
      const tp = w.tree[i] ? PLANTS[w.tree[i]] : null, sp = w.shrub[i] ? PLANTS[w.shrub[i]] : null;
      if (tp && rng() < (tp.fragile ? 0.45 : 0.03) * hit) { w.tree[i] = 0; w.treeG[i] = 0; w.treeAge[i] = 0; if (w.terrain[i] !== T.SOIL) w.terrain[i] = T.GRAVEL; broken++; }
      if (sp && sp.fragile && rng() < 0.3 * hit) { w.shrub[i] = 0; w.shrubG[i] = 0; }
      if (w.ground[i] && (PLANTS[w.ground[i]].key === 'zostera' || PLANTS[w.ground[i]].key === 'halophila')) w.groundG[i] *= 0.7;
    }
    g.weather = 'rain';
    g.notify(`Cyclone! A tropical cyclone passed over the reef in the night, and its waves broke ${broken} corals into rubble. Branching corals regrow fast; the old boulders came through.`, broken > 60 ? 'bad' : 'warn', { x: w.w / 2, y: cy });
  }

  // Flood plumes: after big wet-season rains on the mainland, the rivers carry mud and fertiliser
  // out across the lagoon. The water clouds over, algae booms, and the extra nutrients feed
  // crown-of-thorns larvae, so outbreaks follow a year or two later.
  if ((g.month >= 10 || g.month === 0) && g.rainStreak >= 3 && f.plumeYear !== g.day - (g.day % 120) && rng() < 0.08 * (g.diff?.disasters ?? 1)) {
    f.plumeYear = g.day - (g.day % 120);
    f.plume = { left: 22 };
    f.cotsBoostUntil = g.day + 300;
    g.notify('A flood plume: after heavy rain on the mainland, the rivers have pushed muddy, fertiliser-rich water out over the reef. Algae will boom for a few weeks, and the nutrients feed crown-of-thorns larvae: watch for an outbreak.', 'warn');
  }
  if (f.plume && f.plume.left > 0) {
    f.plume.left--;
    for (let i = 0; i < n; i++) {
      const gid = w.ground[i];
      if (gid === turf) w.groundG[i] = Math.min(1, w.groundG[i] + 0.008);
      else if (!gid && w.terrain[i] === T.GRAVEL && rng() < 0.01) { w.ground[i] = turf; w.groundG[i] = 0.15; }
      else if (gid && PLANTS[gid].key === 'zostera') w.groundG[i] = Math.max(0.1, w.groundG[i] - 0.002); // (shaded by the murky water)
    }
  }
}

// the big arrivals: each a keystone moment the first time
function reefMoments(g) {
  for (const [key, sp] of [['humphead', 'humphead'], ['dugong', 'dugong'], ['manta', 'manta']]) if (ANIMAL[sp] && pop(g, sp) > 0) arrivalMoment(g, key, ANIMAL[sp]);
}

// counts for goals and the manta's cleaning stations
function reefStats(w, s) {
  let coral = 0, cots = 0, cleaner = 0, bleached = 0, cay = 0, pisonia = 0, clams = 0, soft = 0, stars = 0;
  const star = PLANT.linckia?.id, clam = PLANT.clam?.id, cid = PLANT.cots?.id, boulder = PLANT.boulder?.id, brain = PLANT.brain?.id, pis = PLANT.pisonia?.id, kinds = {};
  for (let i = 0; i < w.n; i++) {
    const tp = w.tree[i] ? PLANTS[w.tree[i]] : null;
    if (tp && !tp.cay && w.treeG[i] > 0.3) { coral++; kinds[tp.key] = (kinds[tp.key] || 0) + 1; if ((w.tree[i] === boulder || w.tree[i] === brain) && w.treeAge[i] > 40 * 120) cleaner++; }
    if (w.shrub[i] === cid) cots++;
    else if (w.shrub[i] === star) stars++;
    else if (w.shrub[i] === clam && w.shrubG[i] > 0.5) clams++;
    if (w.shrub[i] && w.shrubG[i] > 0.4 && ['softcoral', 'seafan', 'sponge'].includes(PLANTS[w.shrub[i]].key)) soft++;
    if (w.bleach && w.bleach[i] > 0.5) bleached++;
    if ((tp?.cay && w.treeG[i] > 0.3) || (w.shrub[i] && PLANTS[w.shrub[i]].cay) || (w.ground[i] && PLANTS[w.ground[i]].cay && w.groundG[i] > 0.3)) cay++;
    if (w.tree[i] === pis && w.treeG[i] > 0.45) pisonia++;
  }
  s.coral = coral; s.cots = cots; s.cleanerTiles = cleaner; s.bleached = bleached; s.cayPlants = cay; s.pisonia = pisonia; s.clams = clams; s.softCoral = soft; s.seastars = stars;
  s.coralKinds = Object.values(kinds).filter(k => k >= 20).length; // (hard corals growing on at least 20 tiles each)
}

// Shade cloth: strung just under the surface over a patch of reef through a heatwave, it cuts the
// sun on the corals under it, and they bleach far less. It's a summer's job for the dive team:
// it comes in again at the end of February.
const SHADE_CLOTH = {
  key: 'shadecloth', cat: 'land', name: 'Shade cloth', cost: 12, size: 1, icon: { svg: 'shade' },
  desc: 'String shade cloth just under the surface over the reef for the summer. Corals under it bleach far less in a marine heatwave. It only protects what is under it, so save it for the corals you most want to keep; the dive team takes it in at the end of February.',
  apply: (game, i) => {
    const w = game.world;
    if (w.marks[i] & 8 || dryTile(w, i)) return null;
    w.marks[i] |= 8;
    return true;
  },
};

const MOMENTS = {
  spawning: {
    title: 'The reef spawns',
    text: 'A few nights after the November full moon, the corals have all spawned at once. Pink and cream bundles of eggs and sperm drift up off every colony and gather in slicks at the surface, where they break open and mix. In a week the larvae that survive will settle and become new corals: the reef you rebuilt is seeding itself.',
    night: true, spawn: true,
  },
  humphead: {
    title: 'The starfish-eater',
    text: 'A humphead wrasse has moved onto the reef: a gentle green giant as long as a person, with a bulging forehead and thick lips. It is one of the very few animals that eats crown-of-thorns starfish, spines and all, and it only settles where the reef is big and healthy. Humpheads can live thirty years.',
  },
  dugong: {
    title: 'A sea cow in the meadow',
    text: 'A dugong is grazing the seagrass you grew, pulling up whole plants roots and all and leaving a winding trail of bare sand behind it. Dugongs need big, healthy meadows, and they have been vanishing from much of the coast as the seagrass goes. Where they graze, the meadow grows back thicker.',
  },
  manta: {
    title: 'A manta at the cleaning station',
    text: 'A reef manta ray has glided in out of the blue to an old coral head, and hangs over it, wings barely moving, while the cleaner wrasse pick it over. Mantas remember good cleaning stations and come back to them winter after winter: Kalinda Reef is on its map now.',
  },
};

export default {
  id: 'reef',
  name: 'Great Barrier Reef',
  farm: 'Kalinda Reef',
  region: 'Great Barrier Reef, Australia',
  blurb: 'A patch of the southern reef off a little sand cay, bleached in two summer heatwaves: dead coral rubble, smothering algae, and a crown-of-thorns outbreak eating what\'s left.',
  campaign: false,
  campaignEnd: '',
  image: 'assets/maps/reef.jpg',
  // snorkelers: they come out by boat to the cay's landing and swim the snorkel trails, and pay well
  visitorValue: 2,
  funder: 'marine park', // (who pays the grants)
  // dead coral rubble is the reef's "hardpan": nothing settles on it until it's held still
  hardpan: true,
  sandBed: true,
  // snorkel trails are lines of buoys over the reef, not paths cut through it
  buoyTrails: true,
  // the planting panel and field guide: the reef's "trees" are hard corals, its "shrubs" soft corals and the rest
  plantTabs: { mixes: 'Nursery mixes', ground: 'Seagrass & algae', shrub: 'Soft corals & more', tree: 'Hard corals' },
  layerNames: ['Seagrass or algae', 'Soft coral', 'Hard coral'],
  categoryDesc: { plants: 'Plant corals, seagrass and island plants.', land: 'Hold the rubble still, and shade the reef in a heatwave.', features: 'Drop limestone boulders: shelter for fish, and somewhere hard for corals to grow.', remove: 'Cull crown-of-thorns starfish, scrape back algae, and lift buoys.' },
  lat: -23.4, lon: 151.9, pinLabel: 'sw', // (below the pin, clear of the map's right edge)
  plants: buildReefPlants,
  animals: buildReefAnimals,
  goals: GOALS,
  generate: generateReef,
  borderCell: reefBorderCell,
  terrainFit, groundNote,
  dryLand: (w, i) => shoreMask(w)[i] === 1,
  deadTree: (w, i) => { if (w.terrain[i] !== T.SOIL) w.terrain[i] = T.GRAVEL; },
  daily: reefDaily,
  // health score: the reef's own habitats, and living coral in place of a healthy creek
  scoreHabitats: [['MEADOW', 20], ['SHRUB', 15], ['YOUNG_FOREST', 20], ['MATURE_FOREST', 15]],
  plantSpeciesTarget: 16,
  scoreWater: g => ({ name: 'Living coral cover', pts: 10 * clamp((g.world.stats?.coral || 0) / 1500, 0, 1), max: 10 }),
  stats: reefStats,
  startView: { x: 56, y: 52, zoom: 0.7 },
  startWildlife: [['parrotfish', 2, 60, 58, 6], ['chromis', 8, 34, 72, 3], ['butterfly', 2, 18, 56, 3], ['tang', 3, 86, 66, 4]],
  startText: 'Autumn, Year 1. The water is cooling again after a hard summer. A few parrotfish and a school of chromis hang on around the coral that survived.',
  story: `<p><b>The marine park has asked you to bring Kalinda Reef back.</b> Two summers of marine heatwaves bleached it white, and most of its branching coral died. The dead thickets collapsed into loose rubble that rolls with every swell, so young corals can't settle; algae has grown over it, and crown-of-thorns starfish are eating into the coral that's left. But the old boulder corals came through, and coral larvae drift in on the current every spawning season, looking for somewhere to settle.</p>`,
  rules: [
    'You don\'t buy animals or upgrades. <b>You build habitat</b>, and the fish follow: they drift in from the rest of the reef when there\'s coral and food for them, and leave when there isn\'t.',
    '<b>Rubble is the problem.</b> Coral can\'t grow on rubble that rolls in the swell. <b>Lay reef stars</b> to hold it still, or sow <b>coralline algae</b> to cement it, then plant <b>coral fragments</b> from the nursery.',
    '<b>Corals spawn</b> after the November full moon, and their larvae settle on clean, stable surfaces. Algae smothers those surfaces; <b>parrotfish and surgeonfish</b> graze it back.',
    '<b>Crown-of-thorns starfish</b> eat coral. A few are normal; outbreaks strip reefs bare. They breed each summer, and flood plumes let far more of their young survive; a reef full of fish eats most of them. <b>Cull them</b> whenever they turn up.',
    '<b>Marine heatwaves</b> come some summers (never on Relaxed) and bleach the corals; the weather bureau warns you in November. Short ones they survive; long ones kill the branching corals. <b>Boulder and brain corals</b> are much tougher, deeper water stays cooler, <b>shade cloth</b> protects the corals under it for the summer, and corals in clean water (little algae) bleach less and recover faster.',
    '<b>Sand</b> is for seagrass, but <b>reef boulders</b> dropped on it give corals somewhere to grow, and mushroom corals and giant clams live on it anyway.',
    '<b>Corals compete for room</b>: a spot held by a soft coral, sponge or clam stays theirs, so plant soft coral gardens between the hard corals and they\'ll hold their own.',
    '<b>Seagrass</b> on the lagoon sand is a nursery for young fish, and grazing for green turtles and dugongs.',
    '<b>Cyclones</b> some summers break branching corals into rubble, and <b>flood plumes</b> from the mainland\'s rivers cloud the water, feed the algae and set off starfish outbreaks.',
    '<b>Snorkelers</b> come out by boat to the cay. Mark <b>snorkel trails</b> from the boat landing over the reef: the more fish and coral they see, the more they give.',
    '<b>The cay</b> is bare sand. Plant spinifex, octopus bush and pisonia trees, and seabirds will nest there.',
  ],
  firstYear: [
    '<b>Cull the crown-of-thorns starfish</b> in the east before they spread.',
    'Lay <b>reef stars</b> over the rubble near the surviving coral, and plant <b>coral nursery fragments</b> on them.',
    'Sow <b>coralline algae</b> (the Rubble starter mix) on rubble you can\'t cover with stars yet.',
    'Plant <b>seagrass</b> in the lagoon, and a few <b>anemones</b> for clownfish.',
    'Lay a <b>snorkel trail</b> out from the boat landing to the surviving coral, so snorkelers start paying for the work.',
  ],
  tools: [SHADE_CLOTH],
  moments: MOMENTS,
  hideTools: ['pond', 'marsh', 'creek', 'fill', 'mulch', 'raise', 'lower', 'snag', 'log', 'brush', 'nestbox', 'burn', 'clear', 'clearcut', 'firecrew',
    'build_barn', 'build_shed', 'build_house', 'build_silo', 'build_road', 'build_parking', 'boardwalk', 'blind'],
  toolText: {
    rip: { name: 'Reef stars', icon: { terrain: T.SOIL }, desc: 'Lay reef stars: small steel frames, coated in sand, pegged down in a web over loose rubble so it stops rolling. Plant coral fragments on them; in a few years the coral grows over them and you can\'t see them.' },
    pull: { name: 'Cull starfish & algae', icon: { plant: 'cots' }, desc: 'Divers cull crown-of-thorns starfish one by one, and scrape back turf algae. Native corals and seagrass are left alone.' },
    rocks: { name: 'Reef boulders', brush: true, size: 1, cost: 25, desc: 'Drop limestone boulders on the seabed: instant shelter for fish, and something hard for corals to grow on, even out on the sand where nothing else can hold them. Plant nursery fragments on them.' },
    trail: { name: 'Snorkel trail', desc: 'Mark out a snorkel trail with a line of buoys, starting from the boat landing on the cay. Snorkelers swim it face-down at the surface and look down at the reef; the coral and fish under it are left alone. Run it past the best coral.' },
    build_center: { desc: 'A reef centre beside the boat landing: tanks, a guide on the boat, and a place to hire masks. Snorkelers give more and rate the reef higher.' },
  },
  structureNames: { house: 'Research station', shed: 'Dive shed', silo: 'Rainwater tank', parking: 'Boat landing', center: 'Reef centre' },
  habitatNames: {
    BARE: 'Coral rubble', FARM: 'Bare sand', INVASIVE: 'Algae and starfish', MEADOW: 'Seagrass meadow', SHRUB: 'Soft coral garden',
    YOUNG_FOREST: 'Young reef', MATURE_FOREST: 'Old reef', RIPARIAN: 'Reef edge', DEVELOPED: 'The cay',
  },
  terrainNames: { PASTURE: 'Sand', GRAVEL: 'Dead coral rubble', SOIL: 'Stable reef (reef stars)', MUD: 'Silt' },

  climate: {
    // Mar–May autumn, Jun–Aug winter (dry, clear, the mantas come), Sep–Nov spring (corals spawn), Dec–Feb summer (wet, hot: heatwaves)
    seasons: ['Autumn', 'Winter', 'Spring', 'Summer'],
    rain: [0.38, 0.3, 0.24, 0.16, 0.12, 0.1, 0.1, 0.12, 0.2, 0.34, 0.48, 0.5],
    growth: [0.95, 0.85, 0.75, 0.6, 0.55, 0.6, 0.75, 0.9, 1.0, 1.0, 1.0, 1.0],
    spread: [0.4, 0.3, 0.25, 0.2, 0.2, 0.3, 0.5, 0.8, 1.4, 1.2, 0.6, 0.5], // (mass spawning in November and December)
    moist: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    snow: null,
    fireMonths: [], fireRate: 0, fireGap: 9999, crownFires: false,
    floodMonths: [],
    tips: [
      'Autumn: the water cools after summer. Bleached corals that survived are taking their colour back.',
      'Winter: clear, calm water. Manta rays come in to the old coral heads to be cleaned.',
      'Spring: the corals spawn after the November full moon. Clean, stable rubble gives the larvae somewhere to settle.',
      'Summer: the hottest water of the year, when a marine heatwave can bleach the corals.',
    ],
    fireCause: ['Lightning'],
  },
  seedRain: {
    N: ['halophila', 'zostera', 'halophila'],
    E: ['staghorn', 'tablecoral', 'brain', 'cca', 'softcoral', 'turf', 'turf'],
    W: ['staghorn', 'tablecoral', 'boulder', 'cca', 'seafan', 'turf'],
    S: ['seafan', 'softcoral', 'staghorn', 'tablecoral'],
  },
  windSeeds: ['staghorn', 'tablecoral', 'cca', 'turf'], // (coral larvae drift in on the current, and settle anywhere they can)
  berrySeeds: ['halophila'],
  floodSeeds: ['halophila'],
  burnSeeds: ['halophila'],

  text: {
    edges: { N: 'the lagoon to the north', E: 'the reef to the east', S: 'the open ocean', W: 'the reef to the west' },
    creekFish: 'fish', culvertBlocks: 'fish', fenceBlocks: 'fish',
    migrantsLeave: ['Heading back out to sea for the summer', 'They remember good places and come back next winter if it is still here.'],
    flood: 'A big swell is running!', floodOut: '', fireOutRain: '', fireOut: '', crownOut: '',
    hardpanHint: 'This is loose coral rubble: it rolls in every swell, so young coral can\'t take hold. Lay reef stars first (Landscape → Reef stars), or sow the Rubble starter mix so coralline algae can cement it.',
    hardpanTip: 'loose rubble: lay reef stars first',
    hardpanLimit: 'loose rubble: lay reef stars, or let coralline algae cement it, first',
  },
  look: {
    grade: { gain: [0.99, 1.01, 1.02], lift: [0, 0.004, 0.008], sat: 1.08, contrast: 1.06 },
    pasture: ['#e6dcc0', '#e2dac2', '#e8dec2', '#eae0c2'], // pale coral sand
    soil: [0.74, 0.7, 0.62], mud: [0.6, 0.56, 0.48],
    water: { pond: [0.2, 0.55, 0.6, 0.9], creek: [0.2, 0.55, 0.6, 0.8], river: [0.1, 0.4, 0.55, 0.9], marsh: [0.3, 0.55, 0.55, 0.55] },
    structures: { parking: 'jetty' },
    underwater: { level: SEA, shallow: [0.09, 0.44, 0.46], deep: [0.02, 0.15, 0.32], surface: [0.24, 0.66, 0.68] },
    light: [
      { sun: 0xfff6e8, sunI: 2.8, sky: 0xd8ecf4, ground: 0x5a8a8a, hemiI: 1.25 },
      { sun: 0xfff8f0, sunI: 2.7, sky: 0xd8eaf4, ground: 0x5a8890, hemiI: 1.22 },
      { sun: 0xfff6e8, sunI: 2.85, sky: 0xd8eef4, ground: 0x5a8c8a, hemiI: 1.25 },
      { sun: 0xfff2e0, sunI: 2.95, sky: 0xdceef2, ground: 0x5a8e88, hemiI: 1.28 },
    ],
    ambience: {
      leaves: [0, 0, 0, 0], fluff: [0, 0, 0, 0], mist: [0, 0, 0, 0],
      leafColors: ['#f0f0e8'],
      flocks: [['egrets'], ['egrets'], ['egrets', 'swallows'], ['egrets']],
    },
    tint: ['rgba(255,255,255,0)', 'rgba(255,255,255,0)', 'rgba(255,255,255,0)', 'rgba(255,250,235,0.01)'],
  },
};
