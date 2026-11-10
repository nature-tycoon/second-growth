// How an animal is drawn eating (decision 0039). Drawing only: it reads the feeding states the
// simulation already has (forage meals, carcass feeds, fruit meals) and never changes them, so
// there is one eating style per kind of food rather than one per species:
//   crop   grass, seeds, insects, fruit and dung on the ground: head down, nodding as it bites;
//   browse a shrub (head level) or a tree (head reaching up), tugging as it strips;
//   tear   a carcass: head down, pulling back hard every so often;
//   snap   fish: a quick dart forward at plankton or a catch, nose-down at algae, coral, sponge or seagrass.
// Fruit and leaf meals of monkeys and apes are the hand-to-mouth pose (actors.js, eatPose).
// Fruit birds in a fruiting crown (bird-behavior.js 'fruit'), by their `eatsFruit` trait: fruitHead.
import { trait } from '../data/animal-kinds.js';
const UNDER = new Set(['algae', 'coral', 'sponge', 'seagrass', 'sediment']);
// Animals with no meal of their own in the simulation that are drawn nibbling now and then
// while they stand, as grazers are (`idleEat` 'nibble', js/data/animal-kinds.js): tortoises and
// pond turtles on plants, ostriches and ground hornbills picking at the ground, beavers on stems
// at the bank, ducks dabbling.
export const nibbles = (def, a) => trait(def, 'idleEat') === 'nibble' && !def.reef && !a.flying;

// The head's target (1 down, 0 level, below 0 up) for an animal at a meal, or null when it isn't
// eating. `w` is the world (to tell a browsed shrub from a tree).
export function mealHead(a, w, time) {
  const bite = Math.sin(time * 6 + a.id * 1.3);
  if (a.state === 'feed') return 0.85 + 0.15 * bite - (Math.sin(time * 1.7 + a.id) > 0.85 ? 0.35 : 0);
  if (a.state !== 'forage' || !a.forage || a.forage.food === 'cleaned') return null;
  const { food, i } = a.forage;
  if (food === 'browse' || food === 'leaves') {
    const shrub = w.shrub[i] && w.shrubG[i] > 0.3;
    return (shrub ? 0.25 : -0.45) + 0.12 * Math.max(0, bite);
  }
  return a.flying ? 1 : 0.85 + 0.15 * bite;
}

// The head of a fruit bird at its meal in a crown (1 down, 0 level, below 0 up), by how it eats:
//   toss  a toucan or hornbill reaches out and down for a fruit, plucks it with a tug, then
//         throws its head back to toss it down its throat;
//   chew  a parrot bites at the fruit with its head low, chewing, and looks up now and then;
//   peck  a bulbul pecks berries off one after another, gulping each.
export function fruitHead(def, a, time) {
  const style = trait(def, 'eatsFruit'), t = time + a.id * 1.37;
  if (style === 'toss') {
    const u = (t / 2.6) % 1; // (about one fruit every two or three seconds)
    return u < 0.45 ? 0.55 + 0.2 * Math.sin(u * 40) * (u > 0.3 ? 1 : 0.3) : u < 0.6 ? 0.35 : u < 0.75 ? -0.7 : 0;
  }
  if (style === 'chew') return Math.sin(t * 0.6) > 0.8 ? 0 : 0.55 + 0.1 * Math.sin(t * 9);
  return Math.sin(t * 2.2) > 0.2 ? 0.85 : Math.sin(t * 1.1) > 0.6 ? -0.25 : 0.1;
}

// A seabird's plunge or swoop at the sea (sim/fishing.js, the 'dive' and 'dip' styles): 0 to 1, how
// far into it it is (1 through the time it is under or touching the surface), or 0.
export function seaPlunge(a, def) {
  if (a.state !== 'fish' || !def.behavior.fishing?.sea) return 0;
  const ph = a.fishing?.phase;
  return ph === 'dive' ? a.stoop || 0 : ph === 'under' || ph === 'touch' ? 1 : 0;
}

// A fish's snap at its food: how far forward it darts (0 to 1 of the reach) and how far its nose
// tips down, or null when it isn't feeding. River fish have no meals in the simulation; drawn idle,
// they pick at drifting food every so often.
export function fishSnap(a, def, time) {
  const food = a.state === 'forage' ? a.forage?.food : a.state === 'feed' ? 'prey' : null; // (a hunting fish at its catch)
  const drift = !food && !def.reef && a.state === 'idle';
  if (!food && !drift || food === 'starfish' || food === 'cleaning' || food === 'cleaned') return null;
  const pulse = Math.max(0, Math.sin(time * (drift ? 0.7 : 1.6) + a.id * 2.7));
  const dart = pulse ** 10;
  return { dart, nose: UNDER.has(food) ? 0.35 + 0.15 * dart : 0.1 * dart };
}
