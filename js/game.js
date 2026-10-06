// Game state and the simulation clock.

import { arrivalMoment, momentsDaily, ARRIVAL_MOMENTS } from './sim/moments.js';
import { DAYS_PER_MONTH, DAYS_PER_YEAR, MONTH_NAMES, SPEEDS, DIFFICULTY, seasonOfMonth, money } from './config.js';
import { biome, setBiome } from './biome.js';
import { World, Border } from './world.js';
import { mulberry32 } from './rng.js';
import { updateEnvironment, updateHydrology } from './sim/environment.js';
import { updatePlants, seedRain, rootsLoosen } from './sim/plants.js';
import { Wildlife } from './sim/animals.js';
import { ANIMALS, ANIMAL, aOne } from './data/animals.js';
import { PLANTS } from './data/plants.js';
import { ecoScore, monthlyGrant, nativePlantSpecies, GOALS, speciesPresent } from './sim/goals.js';
import { Visitors } from './sim/visitors.js';
import { Events } from './sim/events.js';
import { checkCampaign } from './sim/campaign.js';

const SAVE_KEY = 'second-growth-save-v3';
const LAST_MAP_KEY = 'second-growth-last-map';
// one save slot per map (the Hollis farm keeps the original key so old saves still load)
const saveKey = map => map === 'pnw' ? SAVE_KEY : `${SAVE_KEY}-${map}`;
// a map switch in progress across a page reload (see UI.switchMap)
export const PENDING_KEY = 'second-growth-pending';

export const WORLD_ARRAYS = ['terrain', 'baseMoist', 'moist', 'soil', 'ground', 'groundG', 'shrub', 'shrubG',
  'tree', 'treeG', 'treeAge', 'feature', 'featureAge', 'struct', 'variant', 'vh', 'flood', 'fire', 'scorch', 'rx', 'marks'];
// Arrays a map or system adds to the world only once it needs them (the reef's bleaching, the
// savanna's seed bank, worn game trails, the suburb's bloom calendar): saved when they exist, and
// rebuilt with the same type on load.
export const EXTRA_ARRAYS = { bleach: Float32Array, seedbank: Uint16Array, trod: Float32Array, bloomLast: Int32Array, mulchDays: Uint16Array, browseDamage: Float32Array };

export class Game {
  constructor() {
    this.listeners = {};
    this.selectedAgent = null;
    this.cache = {};
  }

  on(ev, fn) { (this.listeners[ev] ||= []).push(fn); }
  emit(ev, ...args) { for (const fn of this.listeners[ev] || []) fn(...args); }

  // mode: 'free' (everything unlocked) or 'campaign' (chapters unlock tools as you learn)
  newGame(seed = 1987, mode = 'free', difficulty = 'standard', map = biome.id) {
    setBiome(map);
    this.map = biome.id;
    this.loaded = false; // true once a save has been loaded into this game
    this.seed = seed;
    this.mode = mode;
    this.difficulty = DIFFICULTY[difficulty] ? difficulty : 'standard';
    this.campaign = { chapter: 0 };
    this.world = biome.generate(seed);
    this.border = new Border(this.world, biome.borderCell);
    this.rng = mulberry32(seed * 31 + 7);
    this.day = 0;
    this.acc = 0;
    this.money = this.diff.startMoney;
    this.speed = 1;
    this.flags = {};
    this.stats = { planted: 0, dug: 0, removed: 0, spent: 0, earned: 0, used: {} };
    this.ledger = { in: {}, out: {} }; this.lastLedger = null;
    this.goalsDone = {};
    this.history = [];
    this.weather = 'clear';
    this.rainStreak = 0; this.dryStreak = 0;
    this.snow = 0;
    this.wildlife = new Wildlife(this);
    this.residents = null; // (maps with people living on them fill this in)
    this.visitors = new Visitors(this);
    this.events = new Events(this);
    this.refreshEnvironment();
    this.wildlife.computeSuitability();
    this.seedStartingWildlife();
    biome.onStart?.(this); // anything a map wants to note about its starting state
    this.updateScore();
    this.emit('reset');
  }

  seedStartingWildlife() {
    const wl = this.wildlife, w = this.world;
    const place = (key, n, x, y, r) => {
      const def = ANIMAL[key];
      for (let k = 0; k < n; k++) {
        const pos = wl.randomPassableNear(def, x, y, r);
        if (pos) wl.spawn(def, pos[0], pos[1], { silent: true });
      }
    };
    for (const [key, n, x, y, r] of biome.startWildlife) if (ANIMAL[key]) place(key, n, x, y, r);
    wl.recount();
  }

  get month() { return Math.floor(this.day / DAYS_PER_MONTH) % 12; }
  get year() { return Math.floor(this.day / DAYS_PER_YEAR) + 1; }
  get season() { return seasonOfMonth(this.month); }
  get dayOfMonth() { return (this.day % DAYS_PER_MONTH) + 1; }
  dateString() { return `${MONTH_NAMES[this.month]}, Year ${this.year}`; }
  seasonName() { return biome.climate.seasons[this.season]; }

  canAfford(c) { return this.money >= c; }
  // Every dollar in and out is booked under where it came from or went (see INCOME and SPENDING
  // in ui.js for the names), month by month, so the money panel can show the player what pays.
  spend(c, what = 'work') {
    if (c <= 0) return true;
    if (this.money < c) return false;
    this.money -= c; this.stats.spent += c;
    this.book('out', what, c);
    return true;
  }
  earn(c, from = 'other') { this.money += c; this.stats.earned += c; this.book('in', from, c); }
  // a bill that's paid whether or not there's money for it (trail upkeep)
  pay(c, what) { if (c > 0) { this.money -= c; this.stats.spent += c; this.book('out', what, c); } }
  book(side, key, c) {
    const l = this.ledger ||= { in: {}, out: {} };
    l[side][key] = (l[side][key] || 0) + c;
    const t = (this.stats.ledger ||= { in: {}, out: {} })[side]; // (and since the start)
    t[key] = (t[key] || 0) + c;
  }
  get diff() { return DIFFICULTY[this.difficulty] || DIFFICULTY.standard; }
  // Land trust money (grants and rewards) scales with difficulty; visitor donations don't.
  // kind is only bookkeeping (monthly, goal, discovery, chapter), so the balance can be checked
  grant(c, kind = 'other') {
    const v = Math.round(c * this.diff.grants); this.earn(v, kind === 'monthly' ? 'grant' : kind === 'discovery' ? 'discovery' : 'reward');
    const gs = this.stats.grants ||= {}; gs[kind] = (gs[kind] || 0) + v;
    return v;
  }

  // What a goal or chapter actually pays: rewards are listed at full size and paid at 60%,
  // scaled by difficulty (the UI shows this figure, so it always matches the payout).
  goalReward(r) { return Math.round(r * 0.6 * this.diff.grants); }

  notify(text, kind = 'info', loc = null) { this.emit('notify', { text, kind, loc, date: this.dateString() }); }

  refreshEnvironment() {
    this.world.hydroDirty = true;
    updateHydrology(this.world);
    updateEnvironment(this.world, this.month, this.visitors ? this.visitors.traffic : 0);
  }

  // ------------------------------------------------------------------ clock
  update(dtSec) {
    const sp = SPEEDS[this.speed];
    if (!sp) return;
    let days = Math.min(dtSec, 0.1) * sp;
    this.acc += days;
    let ticks = 0;
    while (this.acc >= 1 && ticks < 3) { this.acc -= 1; this.dailyTick(); ticks++; }
    if (this.acc > 3) this.acc = 1;
    // move wildlife in small steps
    while (days > 0) {
      const d = Math.min(days, 0.05);
      this.wildlife.update(d);
      this.visitors.update(d);
      biome.update?.(this, d);
      days -= d;
    }
  }

  dailyTick() {
    const prevMonth = this.month;
    this.day++;
    const w = this.world;
    const st = updateEnvironment(w, this.month, this.visitors.traffic);
    updatePlants(this);
    seedRain(this);
    if (this.day % 5 === 0) rootsLoosen(this);
    for (const [key, sp] of Object.entries(this.flags.arrivals || {})) if (arrivalMoment(this, key, ANIMAL[sp])) delete this.flags.arrivals[key];
    momentsDaily(this);
    this.wildlife.daily();
    this.visitors.daily();
    this.events.daily();
    checkCampaign(this);
    biome.daily?.(this); // anything a map runs for itself each day
    // weather
    const r = this.rng();
    const m = this.month;
    if (this.weatherDays > 0) this.weatherDays--;
    else {
      const rain = r < biome.climate.rain[m];
      // Dec-Feb storms sometimes come in cold enough to snow, most often in January
      const sn = biome.climate.snow;
      const snow = rain && !!sn && sn.months.includes(m) && this.rng() < sn.chance(m);
      this.weather = snow ? 'snow' : rain ? 'rain' : this.rng() < 0.3 ? 'cloud' : 'clear';
      this.weatherDays = 1 + Math.floor(this.rng() * 3);
    }
    const wet = this.weather === 'rain' || this.weather === 'snow';
    // snowpack: builds on snowy days, rain washes it away, winter sun melts it slowly, spring fast
    const winter = !!biome.climate.snow && biome.climate.snow.months.includes(m);
    if (this.weather === 'snow') {
      this.snow = Math.min(1, (this.snow || 0) + 0.22);
      if (this.snow > 0.4 && !this.flags.firstSnow) {
        this.flags.firstSnow = true;
        this.notify('Snow is settling over the valley. It lingers on high, open ground and melts first under the trees. The spring melt will feed your wetlands.', 'season');
      }
    }
    else if (this.snow) this.snow = Math.max(0, this.snow - (this.weather === 'rain' ? 0.18 : winter ? 0.025 : 0.2));
    this.rainStreak = wet ? this.rainStreak + 1 : 0;
    this.dryStreak = wet ? 0 : this.dryStreak + 1;
    w.renderDirty = true;
    if (this.month !== prevMonth) this.monthlyTick(prevMonth);
    this.emit('day', st);
  }

  monthlyTick(prevMonth) {
    const m = this.month;
    this.wildlife.monthly();
    this.cache.nativePlants = nativePlantSpecies(this.world);
    const score = this.updateScore();
    const grant = this.grant(monthlyGrant(this, score.total) * (biome.grantScale ?? 1), 'monthly');
    this.lastGrant = grant;
    this.visitors.monthEnd();
    // close the month's books (the map's own sales on the 1st, the grant and the visitors are all in)
    this.lastLedger = this.ledger || { in: {}, out: {} }; this.ledger = { in: {}, out: {} };
    // season tips teach the first year; after that the top bar says the season
    if (m % 3 === 0 && this.year === 1) {
      const tips = biome.climate.tips;
      this.notify(`${this.seasonName()} has arrived. ${tips[this.season]}`, 'season');
    }
    this.history.push({ day: this.day, score: score.total, species: speciesPresent(this), money: this.money, visitors: this.visitors.monthly, inv: score.invFrac || 0 });
    this.checkInvasives(score.invFrac || 0);
    if (this.history.length > 400) this.history.shift();
    this.checkGoals();
    this.emit('month', { grant });
    if (m === 0 && this.day > 0) {
      // a short year-in-review instead of a bare date
      const lastYear = this.history.find(h => h.day >= this.day - DAYS_PER_YEAR - 1) || this.history[0];
      const ds = Math.round(score.total - (lastYear?.score ?? score.total)), dn = speciesPresent(this) - (lastYear?.species ?? 0);
      const sign = v => (v > 0 ? '+' : '') + v;
      this.notify(`Year ${this.year} begins. Over the past year health went ${sign(ds)} to ${Math.round(score.total)}, and ${speciesPresent(this)} species live here (${sign(dn)}).`, 'season');
    }
    if (this.autosave !== false) this.save();
  }

  // Warn as invasive cover crosses 10%, 20% and 30%, pointing at the worst patch. The warning
  // resets once the player beats it back, so it can fire again if it creeps back.
  checkInvasives(frac) {
    const steps = [0.1, 0.2, 0.3];
    let lvl = this.flags.invWarn || 0;
    if (lvl > 0 && frac < steps[lvl - 1] * 0.7) this.flags.invWarn = --lvl;
    if (lvl >= steps.length || frac < steps[lvl]) return;
    this.flags.invWarn = lvl + 1;
    const w = this.world, B = 8, bw = Math.ceil(w.w / B), cells = new Map(), kinds = {};
    for (let i = 0; i < w.n; i++) {
      for (const id of [w.ground[i], w.shrub[i]]) {
        if (!id || !PLANTS[id].invasive) continue;
        kinds[id] = (kinds[id] || 0) + 1;
        const c = Math.floor((i % w.w) / B) + Math.floor(((i / w.w) | 0) / B) * bw;
        cells.set(c, (cells.get(c) || 0) + 1);
      }
    }
    let best = -1, bn = 0;
    for (const [c, n] of cells) if (n > bn) { bn = n; best = c; }
    const top = Object.entries(kinds).sort((a, b) => b[1] - a[1])[0];
    const name = top ? PLANTS[top[0]].name.replace(/^(Himalayan|Scotch|Reed) /, m => m) : 'Invasive plants';
    const loc = best >= 0 ? { x: (best % bw) * B + B / 2, y: Math.floor(best / bw) * B + B / 2 } : null;
    const pct = Math.round(frac * 100);
    this.notify(`Invasives are spreading: they now cover ${pct}% of the land, mostly ${name.toLowerCase()}. Click to see the worst patch. Pull it, burn it, or shade it out with trees and shrubs.`, 'warn', loc);
    this.emit('invasive', { pct });
  }

  updateScore() {
    const s = ecoScore(this);
    this.cache.score = s;
    return s;
  }

  checkGoals() {
    for (const g of GOALS) {
      if (this.goalsDone[g.key]) continue;
      if (g.check(this)) {
        this.goalsDone[g.key] = this.day;
        const paid = this.grant(g.reward * 0.6, 'goal');
        this.notify(`Goal complete: ${g.name}! The ${biome.funder || 'land trust'} awarded a ${money(paid)} grant.`, 'goal');
        this.emit('goal', g);
      }
    }
  }

  onDiscover(def, a) {
    const bonus = this.grant(150, 'discovery');
    this.notify(`New species! ${aOne(def).replace(/^a/, 'A')} has arrived on the farm. (+${money(bonus)} discovery grant)`, 'discover', a);
    this.emit('discover', def);
    // (its keystone moment waits until the newcomers are well inside: see arrivalMoment)
    if (ARRIVAL_MOMENTS[def.key]) (this.flags.arrivals ||= {})[ARRIVAL_MOMENTS[def.key]] = def.key;
  }

  onPredation(pred, prey) {
    const pd = ANIMALS[pred.sp], py = ANIMALS[prey.sp];
    this.stats.predations = (this.stats.predations || 0) + 1;
    const key = `${pd.key}>${py.key}`;
    this.cache.hunts ||= {};
    if (!this.cache.hunts[key] || ['deer', 'elk'].includes(py.key)) {
      this.cache.hunts[key] = true;
      this.notify(`${aOne(pd).replace(/^a/, 'A')} caught ${aOne(py)}. The food web is working.`, 'info', pred);
    }
  }

  // ------------------------------------------------------------------ save / load
  save() {
    try {
      const w = this.world;
      const arrays = {};
      for (const k of WORLD_ARRAYS) arrays[k] = toB64(w[k]);
      for (const k of Object.keys(EXTRA_ARRAYS)) if (w[k]) arrays[k] = { n: w[k].length, b: toB64(w[k]) };
      const data = {
        v: 1, seed: this.seed, day: this.day, money: this.money, speed: this.speed, flags: this.flags,
        stats: this.stats, goalsDone: this.goalsDone, history: this.history,
        world: { arrays, structures: w.structures, w: w.w, h: w.h, bloomTick: w.bloomTick },
        wildlife: this.wildlife.serialize(), rng: this.rng.state(), cache: { hunts: this.cache.hunts },
        visitors: this.visitors.serialize(), events: this.events.serialize(), lastGrant: this.lastGrant, ledger: this.ledger, lastLedger: this.lastLedger,
        mode: this.mode, campaign: this.campaign, difficulty: this.difficulty, snow: this.snow || 0, map: this.map,
        plants: PLANTS.map(p => p?.key || ''), // so a later version with a changed plant list can still read it
      };
      localStorage.setItem(saveKey(this.map), JSON.stringify(data));
      localStorage.setItem(LAST_MAP_KEY, this.map);
      return true;
    } catch (e) {
      console.warn('Save failed', e);
      return false;
    }
  }

  static saveKey(map) { return saveKey(map); }
  static hasSave(map = Game.lastMap()) {
    try { return !!localStorage.getItem(saveKey(map)); } catch { return false; }
  }
  static clearSave(map = Game.lastMap()) { try { localStorage.removeItem(saveKey(map)); } catch { /* ignore */ } }
  // the map played most recently (the one "Continue" opens)
  static lastMap() {
    try { const m = localStorage.getItem(LAST_MAP_KEY); if (m && localStorage.getItem(saveKey(m))) return m; } catch { /* ignore */ }
    return 'pnw';
  }

  load(map = Game.lastMap()) {
    let data;
    try { data = JSON.parse(localStorage.getItem(saveKey(map))); } catch { return false; }
    if (!data || data.v !== 1) return false;
    setBiome(data.map || 'pnw');
    this.map = biome.id;
    this.loaded = true;
    // Every map has a fixed size. A save whose grid doesn't match it (a smaller map's farm that an
    // older version loaded into a full-size grid and saved again) is scrambled, so don't open it:
    // the caller starts a fresh farm instead.
    const fresh = biome.generate(1), ww = fresh.w, wh = fresh.h;
    if (atob(data.world.arrays.terrain).length !== ww * wh) { console.warn('Discarding a scrambled save for', biome.id); return false; }
    const w = new World(ww, wh);
    for (const k of WORLD_ARRAYS) if (data.world.arrays[k]) fromB64(data.world.arrays[k], w[k]);
    for (const [k, Type] of Object.entries(EXTRA_ARRAYS)) { const a = data.world.arrays[k]; if (a?.b) { w[k] = new Type(a.n); fromB64(a.b, w[k]); } }
    if (data.world.bloomTick != null) w.bloomTick = data.world.bloomTick;
    // plants are stored by number: match them up by name if the map's plant list has changed since
    // the save, and don't open a save whose plants can't be matched (it would crash, or show the wrong ones)
    // (a plant that's been replaced says which one it was: duku became banana, say)
    const find = k => { const i = PLANTS.findIndex(p => p?.key === k); return i >= 0 ? i : PLANTS.findIndex(p => p?.was === k); };
    const ids = data.plants ? data.plants.map(find) : null;
    for (const k of ['ground', 'shrub', 'tree']) {
      const a = w[k];
      for (let i = 0; i < a.length; i++) {
        if (!a[i]) continue;
        const id = ids ? ids[a[i]] : a[i];
        if (ids && id === -1) { a[i] = 0; continue; } // a plant this version no longer has
        if (id == null || !PLANTS[id]) { console.warn('Discarding a save with unknown plants for', biome.id); return false; }
        a[i] = id;
      }
    }
    w.structures = data.world.structures;
    this.seed = data.seed;
    this.world = w;
    this.border = new Border(w, biome.borderCell);
    this.rng = mulberry32(1); this.rng.setState(data.rng);
    this.day = data.day; this.acc = 0; this.money = data.money; this.speed = data.speed || 1;
    this.flags = data.flags; this.stats = data.stats; this.goalsDone = data.goalsDone; this.history = data.history || [];
    this.stats.used ||= {};
    this.mode = data.mode || 'free'; // saves from before the campaign are free play
    this.campaign = data.campaign || { chapter: 0 };
    this.difficulty = data.difficulty || 'standard';
    this.snow = data.snow || 0;
    this.weather = 'clear';
    this.rainStreak = 0; this.dryStreak = 0;
    this.lastGrant = data.lastGrant || 0;
    this.ledger = data.ledger || { in: {}, out: {} }; this.lastLedger = data.lastLedger || null;
    this.cache = { hunts: data.cache?.hunts || {} };
    this.wildlife = new Wildlife(this);
    this.residents = null; // (maps with people living on them fill this in)
    this.visitors = new Visitors(this); this.visitors.load(data.visitors);
    this.events = new Events(this); this.events.load(data.events);
    w.heightDirty = true;
    this.refreshEnvironment();
    this.wildlife.load(data.wildlife);
    this.wildlife.computeSuitability();
    this.cache.nativePlants = nativePlantSpecies(w);
    this.updateScore();
    this.emit('reset');
    return true;
  }
}

function toB64(arr) {
  const u8 = new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength);
  let s = '';
  for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
  return btoa(s);
}
function fromB64(str, arr) {
  const s = atob(str);
  const u8 = new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength);
  for (let i = 0; i < s.length && i < u8.length; i++) u8[i] = s.charCodeAt(i);
}
