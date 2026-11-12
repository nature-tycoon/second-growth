import { ANIMAL_SPEEDS } from '../config.js';
// How fast a climber moves along the drawn wood. Heavy apes place each hold
// deliberately; gibbons and monkeys travel faster.
export const climbPace = def => Math.max(def.sprite.kind === 'sloth' ? .1 : .3, def.speed) * (def.sprite.ape ? .55 : 1) * (def.sprite.kind === 'orangutan' ? .8 : 1);
// Four-limbed walker monkeys (render3d/canopy-walker-profile.js) step along a limb at most this
// many body lengths a second at normal speed, so each stride stays visible (canopyStep).
export const WALKER_STRIDES = 1.5;
// (the drawn adult body length in tiles: render3d/animal-scale.js)
export const bodyLength = def => (def.sprite.len || 14) * .0124 * (def.sprite.scale ?? 1) * (def.sprite.show ?? 1);
// Gibbons and siamangs gain one arm's stride (1.6 body lengths) per swing, SWING_CADENCE radians a second.
export const SWING_CADENCE = 2.8;
// How fast the drawn body can travel along the wood, in tiles per game day.
export function drawnClimbPace(def) {
  const perSecond = def.sprite.ape ? bodyLength(def) * 1.6 * SWING_CADENCE / (Math.PI * 2)
    : def.sprite.kind === 'monkey' ? bodyLength(def) * WALKER_STRIDES : Infinity;
  return Math.min(climbPace(def), perSecond / ANIMAL_SPEEDS[1]);
}
// The simulation moves a climber in straight lines between tiles, while the drawn
// body follows limbs, forks and crown crossings. For primates that was measured at
// 1.5-2.2 times as far (tools/monkey-movement-measure.mjs, decision 0041); squirrels
// and sloths keep the older allowance of a third. Keep the simulation within that,
// so the drawing never trails it, races to catch up or snaps forward.
export const CANOPY_ROUTE = 1.7;
const primate = def => def.sprite.kind === 'monkey' || def.sprite.kind === 'orangutan';
export const climbSpeed = def => Math.min(def.speed, primate(def) ? drawnClimbPace(def) / CANOPY_ROUTE : climbPace(def) * .75);
// Everyday travel speed in the simulation, in tiles per game day.
export const travelSpeed = def => def.move === 'tree' ? climbSpeed(def) : def.speed;
