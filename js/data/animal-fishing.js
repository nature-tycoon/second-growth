// How fish-eaters catch fish (decision 0030). Used where a species doesn't already hunt fish as
// prey in the game mode being played (on Challenging, herons, otters and eagles hunt the fish
// themselves: sim/animal-life.js). style:
//   wade:   stands in the shallows and strikes with its bill (herons, egrets, storks)
//   plunge: dives from the air into the water and flies up to a perch with it (kingfishers)
//   snatch: swoops low over open water and takes a fish from the surface in its feet (eagles)
//   swipe:  stands at the edge of a creek and swipes or pins one (bears)
//   swim:   hunts in the water and eats its catch afloat (otters)
//   dive:   plunge-dives from high over the sea, a moment under, and surfaces to swallow its catch
//           on the water or fly up and try again (boobies, gannets)
//   dip:    flies low over the sea and snatches from the surface on the wing (noddies, terns)
// every: sim-days fed after a catch before it fishes again; strike: the chance a strike at a fish
// lands; unseen: a strike where no fish is drawn can still come up with one, from the fish the
// water holds that the map doesn't draw as animals (its fish index), and takes nothing from the
// fish that are drawn; reach: tiles it looks for water or a fish; chance: of fishing at a
// decision while hungry; strikes: per bout, before it gives up and goes back to its other routines;
// sea: it fishes the sea for the small fish of the open water (surfaceFish), not the map's river fish.
// (most plunges and dips come up empty: a booby's dives catch about a third of the time, a tern's
// dips less often)
import { trait } from './animal-kinds.js';

const STYLES = {
  wade: { every: [2, 5], strike: 0.45, unseen: true, reach: 0, chance: 1, strikes: 1 },
  plunge: { every: [2, 4], strike: 0.4, unseen: true, reach: 7, chance: 0.6, strikes: 3 },
  snatch: { every: [4, 8], strike: 0.45, unseen: true, reach: 14, chance: 0.5, strikes: 3 },
  swipe: { every: [6, 12], strike: 0.22, unseen: false, reach: 10, chance: 0.35, strikes: 0 },
  swim: { every: [2, 5], strike: 0.4, unseen: true, reach: 10, chance: 0.6, strikes: 4 },
  dive: { every: [1, 3], strike: 0.3, unseen: true, reach: 14, chance: 0.6, strikes: 4, sea: true },
  dip: { every: [0.5, 1.5], strike: 0.22, unseen: true, reach: 10, chance: 0.6, strikes: 6, sea: true },
};
export const FISHING_STYLES = Object.keys(STYLES);
// (the spoonbill sweeps for shrimp, the crane and sun bear don't fish, the stork-billed and belted
// kingfishers and the herons do)
const BY_KEY = {
  heron: 'wade', egret: 'wade', stork: 'wade', cocoi: 'wade',
  kingfisher: 'plunge', amkingfisher: 'plunge',
  eagle: 'snatch',
  bear: 'swipe',
  otter: 'swim', giantotter: 'swim',
};
// (a species' own `fishes` trait, or its kind's: js/data/animal-kinds.js)
export function fishingProfileFor(def) {
  const style = trait(def, 'fishes') ?? BY_KEY[def.key];
  return style ? { style, ...STYLES[style] } : null;
}
