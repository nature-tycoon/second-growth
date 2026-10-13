// Farm-owned values have one set of defaults for starting and restoring a game.
// World arrays and live simulation objects are assembled by Game; listeners and
// browser preferences belong to the session and are deliberately outside this state.
import { DIFFICULTY, SPEEDS } from './config.js';
import { assertFarmState } from './data/contracts.js';

/** @param {{seed?:number, mode?:import('./data/contracts.js').GameMode, difficulty?:import('./data/contracts.js').Difficulty, map?:string}} [options]
 * @returns {import('./data/contracts.js').FarmState} */
export function createFarmState({ seed = 1987, mode = 'free', difficulty = 'standard', map = 'pnw' } = {}) {
  const level = DIFFICULTY[difficulty] ? difficulty : 'standard';
  const state = {
    seed, map, mode, difficulty: level, campaign: { chapter: 0 },
    day: 0, acc: 0, money: DIFFICULTY[level].startMoney, speed: 1,
    flags: {}, stats: { planted: 0, dug: 0, removed: 0, spent: 0, earned: 0, used: {} },
    ledger: { in: {}, out: {} }, lastLedger: null, lastGrant: 0,
    goalsDone: {}, history: [], weather: 'clear', weatherDays: 0,
    rainStreak: 0, dryStreak: 0, snow: 0, cache: {}, selectedAgent: null,
    residents: null, frugivoreCount: 0,
  };
  assertFarmState(state);
  return state;
}

const SAVED_FIELDS = ['seed', 'day', 'money', 'flags', 'stats', 'goalsDone', 'history',
  'mode', 'campaign', 'snow', 'weather', 'weatherDays', 'rainStreak', 'dryStreak',
  'lastGrant', 'ledger', 'lastLedger'];

/** @param {import('./data/contracts.js').FarmSave} data
 * @param {string} map
 * @returns {import('./data/contracts.js').FarmState} */
export function restoreFarmState(data, map) {
  const state = createFarmState({ seed: data.seed, mode: data.mode, difficulty: data.difficulty, map });
  const statsDefaults = state.stats;
  for (const key of SAVED_FIELDS) if (data[key] != null) state[key] = data[key];
  // A farm opens running, including older saves made while paused.
  state.speed = data.speed > 0 && SPEEDS[data.speed] != null ? data.speed : 1;
  state.stats = { ...statsDefaults, ...state.stats, used: state.stats.used ?? {} };
  // Derived caches are rebuilt; only notification history is persisted.
  state.cache.hunts = data.cache?.hunts || {};
  assertFarmState(state, 'save.farm');
  return state;
}
