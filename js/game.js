// Game state and the simulation clock.

import { DAYS_PER_MONTH, DAYS_PER_YEAR, MONTH_NAMES, SEASONS, SPEEDS, seasonOfMonth, money } from './config.js';
import { World, Border, generateFarm } from './world.js';
import { mulberry32 } from './rng.js';
import { updateEnvironment, updateHydrology } from './sim/environment.js';
import { updatePlants, seedRain } from './sim/plants.js';
import { Wildlife } from './sim/animals.js';
import { ANIMALS, ANIMAL, aOne } from './data/animals.js';
import { ecoScore, monthlyGrant, nativePlantSpecies, GOALS, speciesPresent } from './sim/goals.js';
import { Visitors } from './sim/visitors.js';
import { Events } from './sim/events.js';

const SAVE_KEY = 'second-growth-save-v2';
const RAIN = [0.45, 0.35, 0.3, 0.2, 0.08, 0.08, 0.2, 0.45, 0.6, 0.65, 0.65, 0.55];

const WORLD_ARRAYS = ['terrain', 'baseMoist', 'moist', 'soil', 'ground', 'groundG', 'shrub', 'shrubG',
  'tree', 'treeG', 'treeAge', 'feature', 'featureAge', 'struct', 'variant', 'vh', 'flood', 'fire', 'scorch'];

export class Game {
  constructor() {
    this.listeners = {};
    this.selectedAgent = null;
    this.cache = {};
  }

  on(ev, fn) { (this.listeners[ev] ||= []).push(fn); }
  emit(ev, ...args) { for (const fn of this.listeners[ev] || []) fn(...args); }

  newGame(seed = 1987) {
    this.seed = seed;
    this.world = generateFarm(seed);
    this.border = new Border(this.world);
    this.rng = mulberry32(seed * 31 + 7);
    this.day = 0;
    this.acc = 0;
    this.money = 30000;
    this.speed = 1;
    this.flags = {};
    this.stats = { planted: 0, dug: 0, removed: 0, spent: 0, earned: 0 };
    this.goalsDone = {};
    this.history = [];
    this.weather = 'clear';
    this.rainStreak = 0; this.dryStreak = 0;
    this.wildlife = new Wildlife(this);
    this.visitors = new Visitors(this);
    this.events = new Events(this);
    this.refreshEnvironment();
    this.wildlife.computeSuitability();
    this.seedStartingWildlife();
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
    place('vole', 4, 60, 10, 6);
    place('robin', 3, 17, 16, 5);
    place('raccoon', 1, 22, 15, 3);
    place('mallard', 2, 62, 25, 2);
    place('treefrog', 4, 62, 25, 3);
    wl.recount();
  }

  get month() { return Math.floor(this.day / DAYS_PER_MONTH) % 12; }
  get year() { return Math.floor(this.day / DAYS_PER_YEAR) + 1; }
  get season() { return seasonOfMonth(this.month); }
  get dayOfMonth() { return (this.day % DAYS_PER_MONTH) + 1; }
  dateString() { return `${MONTH_NAMES[this.month]}, Year ${this.year}`; }
  seasonName() { return SEASONS[this.season]; }

  canAfford(c) { return this.money >= c; }
  spend(c) {
    if (c <= 0) return true;
    if (this.money < c) return false;
    this.money -= c; this.stats.spent += c;
    return true;
  }
  earn(c) { this.money += c; this.stats.earned += c; }

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
    this.wildlife.daily();
    this.visitors.daily();
    this.events.daily();
    // weather
    const r = this.rng();
    const m = this.month;
    if (this.weatherDays > 0) this.weatherDays--;
    else {
      const rain = r < RAIN[m];
      const snow = rain && (m >= 9 && m <= 11) && this.rng() < 0.12;
      this.weather = snow ? 'snow' : rain ? 'rain' : this.rng() < 0.3 ? 'cloud' : 'clear';
      this.weatherDays = 1 + Math.floor(this.rng() * 3);
    }
    const wet = this.weather === 'rain' || this.weather === 'snow';
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
    const grant = monthlyGrant(this, score.total);
    this.earn(grant);
    this.lastGrant = grant;
    this.visitors.monthEnd();
    if (m % 3 === 0) {
      const tips = [
        'Spring: seeds germinate and migrant birds return. A great time to plant.',
        'Summer: dry weather. Plants grow slower and streams get warm without shade.',
        'Autumn: berries ripen, leaves turn, and coho salmon run in October if they can get upstream.',
        'Winter: rain soaks the valley. Most plants rest, but owls and eagles are busy.',
      ];
      this.notify(`${this.seasonName()} has arrived. ${tips[this.season]}`, 'season');
    }
    this.history.push({ day: this.day, score: score.total, species: speciesPresent(this), money: this.money, visitors: this.visitors.monthly });
    if (this.history.length > 400) this.history.shift();
    this.checkGoals();
    this.emit('month', { grant });
    if (m === 0 && this.day > 0) this.notify(`Year ${this.year} begins. The land trust has granted ${money(this.stats.earned)} so far.`, 'season');
    this.save();
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
        this.earn(g.reward);
        this.notify(`Goal complete: ${g.name}! The land trust awarded a ${money(g.reward)} grant.`, 'goal');
        this.emit('goal', g);
      }
    }
  }

  onDiscover(def, a) {
    const bonus = 250;
    this.earn(bonus);
    this.notify(`New species! ${aOne(def).replace(/^a/, 'A')} has arrived on the farm. (+${money(bonus)} discovery grant)`, 'discover', a);
    this.emit('discover', def);
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
      const data = {
        v: 1, seed: this.seed, day: this.day, money: this.money, speed: this.speed, flags: this.flags,
        stats: this.stats, goalsDone: this.goalsDone, history: this.history,
        world: { arrays, structures: w.structures },
        wildlife: this.wildlife.serialize(), rng: this.rng.state(), cache: { hunts: this.cache.hunts },
        visitors: this.visitors.serialize(), events: this.events.serialize(), lastGrant: this.lastGrant,
      };
      localStorage.setItem(SAVE_KEY, JSON.stringify(data));
      return true;
    } catch (e) {
      console.warn('Save failed', e);
      return false;
    }
  }

  static hasSave() {
    try { return !!localStorage.getItem(SAVE_KEY); } catch { return false; }
  }
  static clearSave() { try { localStorage.removeItem(SAVE_KEY); } catch { /* ignore */ } }

  load() {
    let data;
    try { data = JSON.parse(localStorage.getItem(SAVE_KEY)); } catch { return false; }
    if (!data || data.v !== 1) return false;
    const w = new World();
    for (const k of WORLD_ARRAYS) fromB64(data.world.arrays[k], w[k]);
    w.structures = data.world.structures;
    this.seed = data.seed;
    this.world = w;
    this.border = new Border(w);
    this.rng = mulberry32(1); this.rng.setState(data.rng);
    this.day = data.day; this.acc = 0; this.money = data.money; this.speed = data.speed || 1;
    this.flags = data.flags; this.stats = data.stats; this.goalsDone = data.goalsDone; this.history = data.history || [];
    this.weather = 'clear';
    this.rainStreak = 0; this.dryStreak = 0;
    this.lastGrant = data.lastGrant || 0;
    this.cache = { hunts: data.cache?.hunts || {} };
    this.wildlife = new Wildlife(this);
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
