// The simulation's own random numbers (decision 0035). Wildlife and visitors draw from the game's
// wildRng through simRandom(), never Math.random: three.js and the drawing draw Math.random too
// (every geometry's UUID), so a new model or a drawing jitter could otherwise change what the
// animals do. game.rng (weather, fire, events) stays a stream of its own, so a wildlife change
// doesn't reshuffle the weather either.
import { mulberry32 } from '../rng.js';

// The stream of the game last created, loaded or updated (Wildlife and Visitors updates select
// their game's); a fixed one before any game, for checks that call sim functions on their own.
let stream = mulberry32(0x5eed);
export function useSimRandom(rng) { stream = rng; }
export function simRandom() { return stream(); }

// wildRng's seed: its own stream from the run seed, not game.rng's sequence
export const wildSeed = runSeed => (Math.imul(runSeed >>> 0 ^ 0x9e3779b9, 0x85ebca6b) ^ 0x2545f491) >>> 0;
