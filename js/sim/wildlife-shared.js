// Pieces of the Wildlife class (sim/animals.js) that its parts in wildlife-*.js share: the
// Animal record, which movers swim, where an animal can stand, and a walker's own spot in a tile.

import { T, clamp } from '../config.js';
import { passable } from './animal-terrain.js';

// Every animal carries the same fields, declared here in one order (unused ones stay undefined).
// Behaviours add their own state as they go, and without this nearly every animal ended up with
// a different object layout, so the JavaScript engine fell back to slow lookups for every field
// read in the movement loop. A field not listed still works, it is only slower to reach.
export class Animal {
  id; sp; key; move; x; y; tx; ty; path; state; wait; age; heading; phase; hunger; flying; alt;
  leaving; spawner; juvenile; moveProgress; bird; birdGoal; birdGround; fruitGoal;
  drinkAt; fruitMeal; run; rutActive; haremCenter; haremAngle; satelliteSlot; waterTrip; restSpot;
  follow; wade; forageGoal; fromFire; avoidSide; drinkT; forage; recent; forageAfter; bankGoal;
  pushX; pushY; course; thirst; trip; greet; socialWith; socialUntil; localGoal; greetT; goal;
  birdAlertCheck; sparPath; sparT; sparLight; sparWith; sparAt; play; target; perchedAt; spd;
  swimT; threat; fleeOff; fx; fy; fleeT; fleeSpeed; fleeDelay; fleeSide; fleeAge; alertT; assist; hunt;
  woodLost; squeeze; trampled; dodge; dodgeOff;
  foragedAt; huntTime; playT; playN; nestSite; stoop; slot; disperse; alertUntil; carcass; feedAt;
  feedT; fruitAfter; socialCooldown; familySettled; familyRetryUntil; bachelorSlot; herdOf; mom;
  momSlot; familyFailures; patrolDir; haremOf; pace; sparStyle; sparHeading; sparLoser; rutCooldown;
  leaveWait; landed; haremSlot; haremHome; passing; nestUntil; bugleT; visit; fishFed; crossRest;
  familyBlockedBy; familyBlockedUntil; soaring; territory; territoryAfter; dormancy; dormancyAfter; range; rangeAfter; trailEdge; trailEdgeAge; walkOn;
  carry; prey; fishing; clingSide; fruitFed; ateFruitAt; climb; gapTo; cache; home; homeAfter; drinkFrom; fleeHd; jink; sparSince; settleKey; huntCool; huntCoolUntil; searchImage; headUp; headUpKey; detour;
}

// Animals that swim in open water move in any direction, diagonals too (river fish, and everything on the reef).
export const swimmer = (a, catalog) => a.move === 'swim' || !!catalog.animals[a.sp]?.reef;

// Where an animal can be: where it can walk, and for the migration also the river it swims at the
// crossing (so swimmers can sidestep a crocodile or each other instead of jamming in a line).
export function standable(w, i, a) {
  return passable(w, i, a) || (!!w.catalog.animals[a.sp]?.crossing && w.terrain[i] === T.RIVER);
}

// An animal standing (or swimming) in a river tile.
export function inRiver(wl, a) {
  const w = wl.game.world, x = Math.floor(a.x), y = Math.floor(a.y);
  return w.inb(x, y) && w.terrain[w.idx(x, y)] === T.RIVER;
}

// A migrant swimming the river at the crossing while the migration is coming over.
export function inCrossing(wl, b) {
  const c = wl.crossingAt, w = wl.game.world;
  if (!c || !(wl.game.day < c.until) || !wl.game.catalog.animals[b.sp].crossing) return false;
  const x = Math.floor(b.x), y = Math.floor(b.y);
  return w.inb(x, y) && w.terrain[w.idx(x, y)] === T.RIVER;
}

// Young that stay close beside their mother, and for how many years (never past adulthood):
// bear cubs for a year and a half, fawns and calves through their first year, elephant calves for years.
// (Rodents, rabbits and birds raise their young in a nest or burrow instead.)
export const WITH_MOM = {
  deer: 0.8, elk: 1, bear: 1.5, cougar: 1.2, bobcat: 0.7, raccoon: 0.6, coyote: 0.5, beaver: 1.5, otter: 0.8,
  wildebeest: 0.8, zebra: 1, gazelle: 0.5, impala: 0.5, topi: 0.5, hartebeest: 0.5, giraffe: 1.2, elephant: 3, buffalo: 1, warthog: 0.5, rhino: 2,
  hippo: 1.5, lion: 1.5, cheetah: 1.5, leopard: 1.5, hyena: 1, ostrich: 0.6,
  jaguar: 1.5, ocelot: 1, peccary: 0.5, tapir: 1, capybara: 0.5, anteater: 0.8, giantotter: 0.8,
};

// How far (in tiles) an animal that lives alone keeps from others of its kind; 0 for herds and groups.
export const territory = def => def.herd || def.familyHerd || def.patrol || def.reef ? 0 : clamp(Math.sqrt(def.hr) * 0.6, 1, 3);

// Where in tile j this animal walks: a small sideways offset of its own on the way through, and
// a spot of its own anywhere in the tile when it's the last one (same tile, same spot, so it
// doesn't shuffle about while standing).
export function spotIn(a, j, last) {
  if (!last) return [hashJitter(a.id, 3.7) * 0.4, hashJitter(a.id, 9.1) * 0.4];
  return [hashJitter(j + a.id * 13, a.id) * 0.9, hashJitter(a.id * 7, j - a.id) * 0.9];
}

export function hashJitter(x, y) {
  const h = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
  return (h - Math.floor(h)) * 0.8 - 0.4;
}
