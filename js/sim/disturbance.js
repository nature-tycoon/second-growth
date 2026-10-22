// Patch disturbance other than fire (docs/decisions/0013-succession-dynamics.md §4): windstorms
// that throw down patches of trees, drought that kills trees at the dry end of their range, and a
// root-rot fungus that spreads tree to tree through its host. Fire stays in events.js. Every tree
// killed here goes through removeTree, so a sapling waiting underneath takes the gap.
//
// Each map lists what fits it in its data (definition.disturbance), and this runs from
// Events.daily after the campaign's disaster gate, scaled by the difficulty's `disasters`.

import { F, DAYS_PER_MONTH, DAYS_PER_YEAR, clamp } from '../config.js';
import { removeTree, ESTABLISHED_TREE } from './plants.js';

const N8 = [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]];

// How well a tree stands up to wind, 0..1 (1: never thrown). p.windfirm overrides it. The default
// comes from existing traits:
//   - 0.5 for any tree;
//   - conifers 0.15 less: evergreen crowns catch winter gales with their needles on, and most of
//     them root shallowly;
//   - trees of wet ground (moist[0] >= 0.5: redcedar, cottonwood, ash, swamp palms) 0.1 less: a high
//     water table keeps their roots near the surface;
//   - long-lived trees (life >= 250: oak, Brazil nut, kapok) 0.1 more: deep taproots and heavy wood.
// Wet ground makes every tree easier to throw on top of this (see rooting below).
export function windfirm(p) {
  if (p.windfirm != null) return p.windfirm;
  return clamp(0.5 - (p.conifer ? 0.15 : 0) - (p.moist[0] >= 0.5 ? 0.1 : 0) + (p.life >= 250 ? 0.1 : 0), 0.05, 0.95);
}

// The share of the 8 tiles around i without a grown tree (treeG > 0.5): a tree at a gap edge or
// alone catches the full wind. Read live, so a tree thrown in this storm exposes the next.
function openAround(w, i) {
  const x = i % w.w, y = (i / w.w) | 0;
  let open = 0, n = 0;
  for (const [dx, dy] of N8) {
    const xx = x + dx, yy = y + dy;
    if (xx < 0 || yy < 0 || xx >= w.w || yy >= w.h) continue;
    n++;
    const j = yy * w.w + xx;
    if (!w.tree[j] || w.treeG[j] <= 0.5) open++;
  }
  return n ? open / n : 1;
}

// The chance a storm of this severity throws the tree on tile i: severity × size × exposure ×
// rooting × (1 − windfirm), so a sapling bends and a big tree snaps, a tree at a gap edge goes
// before one inside the stand, and saturated soil lets the root plate tip. Size rises with the
// square of growth, as wind load does with height: a young stand mostly stands (a linear size
// cost balance-sim restore 15 about 11% of its young forest), the old giants go.
export function windKillChance(w, i, p, severity) {
  const g = clamp((w.treeG[i] - 0.3) / 0.7, 0, 1), size = g * g;
  if (!size) return 0;
  const exposure = 0.25 + 0.75 * openAround(w, i);
  const rooting = 0.6 + 0.8 * clamp((w.moist[i] - 0.45) / 0.4, 0, 1);
  return Math.min(0.95, 2 * severity * size * exposure * rooting * (1 - windfirm(p)));
}

// A heavy-tailed patch size (tiles): mostly a few trees, now and then a blowdown of hundreds.
// Truncated Pareto with exponent 1 between lo and hi.
function patchSize(rng, lo, hi) { return Math.round(lo * Math.pow(hi / lo, rng())); }

// A storm strikes: it comes down on a grown tree (the first of a few random tiles that has one),
// then works outward from it over `area` tiles in an irregular patch, throwing trees by
// windKillChance and bringing standing snags down. Where it lands is weather, not forest
// structure: starting at the most exposed tree sent every storm to lone young trees in open
// fields (balance-sim restore 15 lost 15% of its forest tiles). Returns what it did, for the notice.
export function windstorm(game, storm) {
  const w = game.world, rng = game.rng, plants = w.catalog.plants;
  let start = -1;
  for (let k = 0; k < 24 && start < 0; k++) {
    const i = Math.floor(rng() * w.n);
    if (w.tree[i] && w.treeG[i] > 0.5) start = i;
  }
  const out = { killed: 0, established: 0, released: {}, at: start, area: 0 };
  if (start < 0) return out;
  const area = patchSize(rng, storm.patch[0], storm.patch[1]);
  const seen = new Uint8Array(w.n);
  const frontier = [start]; seen[start] = 1;
  const severity = storm.severity;
  const before = { ...w.understoryReleased };
  let sx = 0, sy = 0;
  while (frontier.length && out.area < area) {
    // grow from a random point on the edge: an irregular patch, not a disc
    const k = Math.floor(rng() * frontier.length), i = frontier[k];
    frontier[k] = frontier[frontier.length - 1]; frontier.pop();
    out.area++;
    const ti = w.tree[i];
    if (ti && rng() < windKillChance(w, i, plants[ti], severity)) {
      if (w.treeG[i] > ESTABLISHED_TREE) { out.established++; sx += i % w.w; sy += (i / w.w) | 0; }
      out.killed++;
      removeTree(w, i, 'wind', rng);
    }
    if (w.feature[i] === F.SNAG && rng() < severity) { w.feature[i] = F.LOG; w.featureAge[i] = 0; } // (dead trees come down first)
    const x = i % w.w, y = (i / w.w) | 0;
    for (const [dx, dy] of N8) {
      const xx = x + dx, yy = y + dy;
      if (xx < 0 || yy < 0 || xx >= w.w || yy >= w.h) continue;
      const j = yy * w.w + xx;
      if (!seen[j]) { seen[j] = 1; frontier.push(j); }
    }
  }
  for (const [key, v] of Object.entries(w.understoryReleased)) if (v > (before[key] || 0)) out.released[key] = v - (before[key] || 0);
  if (out.established) out.at = Math.round(sy / out.established) * w.w + Math.round(sx / out.established);
  if (out.killed) w.hydroDirty = true;
  return out;
}

// Drought (0013 §4): how deep the current dry spell is, 0..1, which treeHazard (plants.js) turns
// into extra deaths for trees near the dry end of their moisture range. A spell counts once the
// days without rain pass the map's `threshold` (set near the longest dry streak of an ordinary
// year, so it comes every several years) and is at full strength `span` days later. Later
// hydrology work changes who dies through w.moist alone.
export function droughtLevel(game, cfg) {
  if (!cfg) return 0;
  return clamp((game.dryStreak - cfg.threshold) / (cfg.span ?? 10), 0, 1) * (cfg.severity ?? 1) * game.diff.disasters;
}

// The host species of the map's pathogen, as a lookup by plant id (built once per catalog).
const HOSTS = new WeakMap();
function hostTable(catalog, cfg) {
  let t = HOSTS.get(catalog);
  if (!t) {
    t = new Uint8Array(catalog.plants.length);
    for (const key of cfg.host) if (catalog.plant[key]) t[catalog.plant[key].id] = 1;
    HOSTS.set(catalog, t);
  }
  return t;
}

const ROT_NEW = 255, ROT_SPREADS = 128;
// Root rot (laminated root rot in Douglas-fir): w.rot[i] is the infection in the roots on tile i,
// 0..255. It runs once a month:
//   - a host tree on an infected tile dies of it in about `1 / kill` years once established (its
//     roots reach the infected wood; a pole-sized fir dies as readily as a big one), a seedling a
//     quarter as fast;
//   - for its first ~10 years on a tile (rot >= ROT_SPREADS) it spreads root to root into each
//     neighbouring established host tree (4 sides), `spread` a year per neighbour;
//   - it fades by 1 a month whatever grows there, gone in about 21 years, so a patch holds
//     non-host trees for a generation and then heals.
//   - a new centre starts on a grown host `perYear` times a year.
// Each tile's infection has a fixed life, so a patch is finite and the infected area settles near
// perYear × patch size × 21 years. Spread × 10 years must stay well under 1 (spread 0.03: a patch
// of about 4 trees on average, now and then dozens). When a grown host kept its tile infected,
// every centre lived as long as fir kept coming back: a 350-year PNW run had rot on 1,300–2,300
// tiles and still growing, half of all tree deaths.
// Returns the grown trees it killed.
export function rotMonth(game, cfg) {
  const w = game.world, rng = game.rng, rot = w.rot, host = hostTable(w.catalog, cfg);
  const kill = (cfg.kill ?? 0.15) / 12, spread = cfg.spread / 12;
  const add = [];
  let killed = 0, killedAt = -1;
  for (let i = 0; i < w.n; i++) {
    const r = rot[i];
    if (!r) continue;
    rot[i] = r - 1;
    const ti = w.tree[i], g = ti && host[ti] ? w.treeG[i] : 0; // (g: the host tree's size, 0 if none)
    if (g && rng() < (g > ESTABLISHED_TREE ? kill : kill * 0.25)) {
      if (g > 0.5) { killed++; killedAt = i; }
      removeTree(w, i, 'pathogen', rng);
    }
    if (r < ROT_SPREADS) continue;
    const x = i % w.w, y = (i / w.w) | 0;
    if (x > 0) maybeInfect(w, i - 1, host, spread, rng, add);
    if (x < w.w - 1) maybeInfect(w, i + 1, host, spread, rng, add);
    if (y > 0) maybeInfect(w, i - w.w, host, spread, rng, add);
    if (y < w.h - 1) maybeInfect(w, i + w.w, host, spread, rng, add);
  }
  for (const j of add) if (!rot[j]) rot[j] = ROT_NEW;
  return { killed, at: killedAt };
}
function maybeInfect(w, j, host, spread, rng, add) {
  if (!w.rot[j] && host[w.tree[j]] && w.treeG[j] > ESTABLISHED_TREE && rng() < spread) add.push(j);
}

// A new infection centre on a grown host tree, if the few tiles tried turn one up.
function seedRot(game, cfg) {
  const w = game.world, rng = game.rng, host = hostTable(w.catalog, cfg);
  for (let k = 0; k < 20; k++) {
    const i = Math.floor(rng() * w.n);
    if (host[w.tree[i]] && w.treeG[i] > 0.5 && !w.rot[i]) { w.rot[i] = ROT_NEW; return i; }
  }
  return -1;
}

const names = (catalog, keys) => keys.map(k => catalog.plant[k]?.name.toLowerCase() ?? k);
const list = a => a.length < 2 ? a.join('') : a.slice(0, -1).join(', ') + ' and ' + a.at(-1);

// The notice for a storm that opened a noticeable gap. It goes to the Field Journal too.
function stormNews(game, storm, r) {
  const w = game.world;
  const top = Object.entries(r.released).sort((a, b) => b[1] - a[1]).slice(0, 2).map(([k]) => k);
  const loc = { x: (r.at % w.w) + 0.5, y: ((r.at / w.w) | 0) + 0.5 };
  game.notify(`${storm.name} has blown down ${r.established} trees, leaving a gap in the canopy and fallen logs. Windthrow is how old forest renews itself: light reaches the ground, and the logs feed fungi and insects and shelter small animals for decades.` +
    (top.length ? ` Young ${list(names(game.catalog, top))} that ${top.length > 1 ? 'were' : 'was'} waiting under the canopy ${top.length > 1 ? 'are' : 'is'} taking over the gap.` : ' Seedlings will fill the gap within a few years.'), storm.warn ? 'warn' : 'info', loc);
}

// Called by Events.daily once the campaign allows disasters (free play: from the start).
export function disturbanceDaily(game) {
  const def = game.catalog.definition.disturbance;
  const w = game.world;
  w.drought = droughtLevel(game, def?.drought);
  if (!def) return;
  const rng = game.rng, m = game.month, k = game.diff.disasters;
  for (const storm of def.storms || []) {
    if (!storm.months.includes(m)) continue;
    // perYear storms spread over the storm months
    if (rng() >= storm.perYear * k / (storm.months.length * DAYS_PER_MONTH)) continue;
    const r = windstorm(game, storm);
    game.stats.storms = (game.stats.storms || 0) + 1;
    if (r.established >= (storm.notice ?? 10)) stormNews(game, storm, r);
  }
  const rot = def.pathogen;
  if (rot) {
    if (rng() < rot.perYear * k / DAYS_PER_YEAR) seedRot(game, rot);
    if (game.day % DAYS_PER_MONTH === 0) {
      const r = rotMonth(game, rot);
      if (r.killed && !game.flags.rotSeen) {
        game.flags.rotSeen = true;
        game.notify(rot.news, 'info', { x: (r.at % w.w) + 0.5, y: ((r.at / w.w) | 0) + 0.5 });
      }
    }
  }
}

// The tile inspector's line for an infected tile (null if there's nothing to say).
export function disturbanceTileNote(game, i) {
  const rot = game.catalog.definition.disturbance?.pathogen;
  return rot && game.world.rot[i] ? rot.note : null;
}
