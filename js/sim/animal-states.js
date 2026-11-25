// Every state an animal can be in (`a.state`), in one place: decision 0056.
//
// An animal's behaviour is a state machine: Wildlife.update (animals.js) steps each animal by its
// state, and the state's step (or something that happens to it: a predator, a fence, winter) moves
// it on to the next. This table is the list of those states. It changes nothing by itself; it is
// what a person or an agent reads to learn what states exist, which function steps each one and
// which fields belong to it, and what tools/animal-state-check.mjs holds the code to:
//   - every state the code writes or compares against is listed here (a typo is caught, not run);
//   - every listed state is stepped by Wildlife.update's switch, or says what steps it (`step`);
//   - a seeded run of every map only ever shows listed states.
// An animal in a state not listed (an old save, a typo that slipped through) is sent back to idle
// by Wildlife.update instead of standing frozen for the rest of the game.
//
// `fields` are the animal's fields that only mean something in that state (set on the way in,
// read by the step); they are documentation, not enforced. Saved games store `a.state`, so a
// state is never renamed without a load step that maps the old name (animals.js `load`).
export const ANIMAL_STATES = Object.freeze({
  idle: { means: 'standing, resting or drinking; picks what to do next when `wait` runs out', step: 'chooseTarget (wildlife-intent.js)', fields: ['wait', 'drinkT', 'drinkAt', 'restAt', 'stillT', 'hover'] },
  walk: { means: 'walking a path on the ground, through the trees or in water', step: 'walkStep (wildlife-move.js)', fields: ['path', 'trip', 'walkOn', 'waitFam', 'dash', 'run'] },
  approach: { means: 'the last steps to a bank to drink', step: 'Wildlife.update', fields: ['localGoal', 'bankGoal', 'waterTrip'] },
  fly: { means: 'flying straight to (tx, ty), then landing', step: 'Wildlife.update', fields: ['tx', 'ty', 'flying', 'alt'] },
  hunt: { means: 'stalking and chasing prey', step: 'huntUpdate (wildlife-intent.js)', fields: ['hunt', 'target', 'huntTime', 'assist', 'run'] },
  carry: { means: 'a raptor flying off with its catch', step: 'carryUpdate (bird-behavior.js)', fields: ['carry', 'prey'] },
  fish: { means: 'watching the water, diving or wading for fish', step: 'fishUpdate (fishing.js)', fields: ['fishing'] },
  forage: { means: 'eating plants, digging or browsing at one tile', step: 'forageUpdate (animal-foraging.js)', fields: ['forage', 'forageGoal'] },
  primate: { means: 'a primate moving and resting through the canopy', step: 'primateUpdate (primate-behavior.js)', fields: ['fruitGoal', 'fruitMeal', 'restSpot'] },
  bird: { means: 'a bird soaring, perching or walking between flights', step: 'birdUpdate (bird-behavior.js)', fields: ['bird', 'birdGoal', 'birdGround'] },
  flee: { means: 'running from a predator or a fire', step: 'fleeUpdate (animal-life.js)', fields: ['threat', 'fleeOff', 'run'] },
  play: { means: 'young animals chasing each other', step: 'playUpdate (animal-life.js)', fields: ['target', 'playT', 'playN', 'run'] },
  spar: { means: 'two males sparring', step: 'sparUpdate (animal-life.js)', fields: ['sparWith', 'sparAt', 'sparT', 'sparLoser', 'sparLight', 'sparSince'] },
  feed: { means: 'eating a kill, a carcass, fruit or a fish where it stands', step: 'Wildlife.update', fields: ['feedT', 'feedAt', 'carcass', 'prey'] },
  leave: { means: 'walking or flying off the map, then removed', step: 'Wildlife.update', fields: ['leaveWait', 'leaveDays', 'leaving', 'path', 'tx', 'ty'] },
  dormant: { means: 'hibernating or brumating in a winter shelter', step: 'updateDormancy (animal-dormancy.js), before the switch', fields: ['dormancy'] },
});

// Flyovers (bird-passage.js) are a separate list, never in wildlife.agents; their state is their own.
export const FLYOVER_STATE = 'passage';

export function isAnimalState(s) { return Object.hasOwn(ANIMAL_STATES, s); }
