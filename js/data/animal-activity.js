// How a hunter shares its time between hunting, resting and its own activities (decision 0014).
// hungry: sim-days after a meal ends before it hunts in earnest; search: days after which it starts
// moving toward prey; rest: the chance a fed animal lies up at a decision, for `bout` days; digest:
// days after a meal it always lies up; soar: the chance a fed soaring raptor circles instead.
// seek: it starts a hunt itself when hungry and prey is near, rather than only on its daily roll.
// Game-scale numbers: a sim-day is about 1.4 s, and a walk to prey takes days. A meal lasts long
// enough that kills per hunter stay near what the population balance was tuned for (hunts that
// fail less often would otherwise empty the vole meadows: decision 0014).
const BIG_CATS = new Set(['lion', 'tiger', 'leopard', 'jaguar', 'cougar', 'clouded']);
const WATER_SNAKES = new Set(['anaconda', 'python']);
const MID = new Set(['bobcat', 'ocelot', 'leopardcat', 'coyote', 'fox', 'hyena']);
// (the old prowl rule, kept for ambushers, waders, otters and fish)
const DEFAULT = { hungry: 7, search: 5, rest: 0.45, fed: 3, bout: [2, 5], digest: 0, soar: 0, seek: false };
export function activityProfileFor(def) {
  if (!def.prey && !def.challengePrey) return null;
  // Big cats rest most of the day and hunt every few days (lions rest 18–20 hours a day).
  if (BIG_CATS.has(def.key)) return { ...DEFAULT, hungry: 8, search: 6, rest: 0.8, fed: 8, bout: [1.5, 3], digest: 2, seek: true };
  if (def.key === 'cheetah') return { ...DEFAULT, hungry: 6, search: 4, rest: 0.6, fed: 6, bout: [1, 2.5], digest: 1.5, seek: true };
  if (MID.has(def.key)) return { ...DEFAULT, hungry: 7, search: 5, rest: 0.55, fed: 7, bout: [1, 2.5], digest: 1, seek: true };
  // Raptors and owls: a fed red-tail circles high for long spells; others sit on a perch.
  if (def.move === 'fly' && ['raptor', 'owl'].includes(def.sprite.kind))
    return { ...DEFAULT, hungry: 7, search: 5, rest: 0.4, fed: 7, bout: [1, 2], digest: 1, soar: def.soar ? 0.7 : 0, seek: true };
  // Snakes lie in wait (lieInWait in sim/animal-life.js), the water snakes at the water's edge, and
  // after swallowing a meal lie up for days digesting it: an anaconda or python eats only now and then.
  if (def.sprite.kind === 'snake') return { ...DEFAULT, hungry: 9, search: 99, rest: 0.8, fed: 9, bout: [2, 5], digest: 5, lieInWait: true, atWater: WATER_SNAKES.has(def.key) };
  return DEFAULT;
}
// Night animals (behavior.nocturnal) are out from sunset until just before dawn, as drawn, and by
// day are tucked into their roosts (a snag, a box, a barn) and not drawn. The simulation has no
// clock of its own (a drawn day lasts months of game time), so this is the drawing's day: `out` is
// the renderer's nightOut, 0 by day to 1 at night, and each animal comes out at its own point in
// the dusk, so they stream out one by one rather than all at once.
export const roostingNow = (a, def, out) => !!def?.behavior?.nocturnal && out != null && out < 0.15 + ((a.id * 0.618) % 1) * 0.7;
// Hunger at which a hunter stops resting and hunts (and leaves off patrols, soaring and the like).
export const huntHunger = def => def.behavior?.activity?.hungry ?? DEFAULT.hungry;
