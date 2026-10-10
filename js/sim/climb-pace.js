// How fast a climber moves along the drawn wood. Heavy apes place each hold
// deliberately; gibbons and monkeys travel faster.
export const climbPace = def => Math.max(.3, def.speed) * (def.sprite.ape ? .55 : 1) * (def.sprite.kind === 'orangutan' ? .8 : 1);
// The simulation moves a climber in straight lines between tiles, while the
// drawn body follows forks and crown crossings about a third longer. Keep the
// simulation within that pace, so the drawing never has to race to catch up.
export const climbSpeed = def => Math.min(def.speed, climbPace(def) * .75);
// Everyday travel speed in the simulation, in tiles per game day.
export const travelSpeed = def => def.move === 'tree' ? climbSpeed(def) : def.speed;
