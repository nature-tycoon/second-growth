// Traits: what an animal does, asked by name wherever behaviour or drawing differs, instead of
// asking which species it is (AGENTS.md: ask a trait, never a species name). Each drawn body kind
// (sprite.kind) has defaults here; a species overrides any of them with a field of the same name
// on its definition (js/data/animals-*.js), so a new species needs data only, and a fix written
// for one animal reaches every animal with the trait.
//
//   idleEat       'graze': standing idle, it lowers its head to graze now and then (actors.js), and
//                 turns its back to water with its head up rather than seem to drink backwards
//                 (steering.js); 'nibble': drawn nibbling the same way, off reef and not in flight,
//                 with no meal of its own in the simulation (eating-pose.js, decision 0039)
//   floats        on open water it floats or paddles at the surface (actors.js)
//   alwaysFlying  drawn on the wing even when the simulation has it at rest: bats, and mantas
//                 "flying" through the water (actors.js)
//   flitsLow      flies low over the flowers rather than up over the trees (actors.js)
//   sitsInCrowns  false: a landed bird stays on the ground or water, not up in a tree's crown,
//                 unless it is at its nest (actors.js)
//   crownHeight   how far up a tree's height a climber sits in the crown (actors.js; default 0.62)
//   hops          a bird that hops as it walks on the ground (actors.js)
//   climb         how a tree climber gets about the crowns (canopy-motion.js, animal-model.js):
//                 'walk' on all fours along the branches, 'clamber' four-handed and slow,
//                 'hang' upside down beneath them; an ape's long arms (sprite.ape) make it 'swing'
//   firmSkin      scales, shells, skin or fins: a firmer edge to the light than fur or feathers
//                 (animal-model.js)
//   groundFeed    a bird that feeds on the ground (bird-behavior.js)
//   perches       false: a bird that never picks a tree to perch in (bird-behavior.js)
//   nestHole      a bird that nests in a cavity: a tree hole or a nest box (bird-behavior.js)
//   flocks        a sociable bird, gathering with its own kind (bird-behavior.js)
//   bathes        false: a bird that doesn't bathe in puddles and pools (bird-behavior.js)
//   trunkFeed     a bird that forages on tree trunks, clinging upright, pecking and drumming
//                 (bird-behavior.js, decision 0030)
//   restless      a small bird that never keeps still for long (bird-behavior.js)
//   fearsHunters  a small bird that takes any bird-eater about (scaresSmallBirds) for a threat,
//                 even one outside the map's food web (bird-behavior.js)
//   scaresSmallBirds  small birds take it for a threat (bird-behavior.js)
//   eatsFruit     a bird that flies to fruiting crowns in season for short meals there, and how it
//                 eats: 'toss' plucks a fruit and tosses it back to swallow (toucans, hornbills),
//                 'chew' bites at it with its head low (parrots), 'peck' pecks berries off
//                 (bird-behavior.js; drawn by eating-pose.js fruitHead)
//   fishes        how a bird fishes, a style in js/data/animal-fishing.js: 'dive' plunges from height
//                 into the sea (boobies, gannets), 'dip' snatches from the surface on the wing
//                 (noddies, terns) (fishing.js)
//   jinks         a runner that escapes by cutting hard to one side as its hunter closes in, so the
//                 faster hunter overshoots: hares, gazelles, impala, deer (animal-life.js, decision 0026)
//
// Traits set on a species only (no kind default):
//   wallow        { size, rut }: it wears a wallow in damp ground, `size` how big a dish (1 for an
//                 elk), `rut` only in the rut (the bulls' wallows) (wallows.js, decision 0034)
//   leaps         a canopy walker that leaps the gap between crowns in an arc (canopy-motion.js)
//   carrionSoar   hungry with no carcass in sight, it goes up and searches from the soar (bird-behavior.js)
//   cleans        keeps a cleaning station: picks parasites off reef fish that come to it (animal-foraging.js)
//   surfaceFish   a fish of the open water near the surface, the kind seabirds come up with (fishing.js)
//   seagrassBite  how much seagrass one meal crops (animal-foraging.js; default 0.01)
//   bottomDweller a river fish that lies on the bed of its pool, not up near the surface (actors.js)
//   fishDepth     how much water a river fish keeps to, in height levels (waterline.js fishDepth;
//                 default FISH_DEPTH): at least its drawn body's height, so it never shows its back

const graze = { idleEat: 'graze' }, nibble = { idleEat: 'nibble' }, firm = { firmSkin: true };
const smallBird = { restless: true, fearsHunters: true };

export const KIND_TRAITS = {
  deer: { ...graze, jinks: true }, rabbit: { ...graze, jinks: true }, rodent: graze, peccary: graze, agouti: graze,
  gazelle: { ...graze, jinks: true }, impala: { ...graze, jinks: true }, buffalo: graze, warthog: graze,
  capybara: { ...graze, floats: true }, tapir: { ...graze, floats: true },
  zebra: { ...graze, floats: true }, wildebeest: { ...graze, floats: true }, // (the migrating herds swim the river)
  rhino: { ...graze, ...firm }, elephant: { ...graze, ...firm }, hippo: { ...graze, ...firm, floats: true },
  turtle: { ...nibble, ...firm, floats: true }, beaver: { ...nibble, floats: true }, ostrich: nibble,
  otter: { floats: true }, frog: { ...firm, floats: true }, newt: { ...firm, floats: true },
  caiman: { ...firm, floats: true }, snake: { ...firm, floats: true, scaresSmallBirds: true },
  monitor: { ...firm, scaresSmallBirds: true },
  fish: firm, butterflyfish: firm, idol: firm, shark: firm, dolphin: firm, dugong: firm,
  seacucumber: firm, urchin: firm, beetle: firm, pangolin: firm, armadillo: firm, person: firm,
  ray: { ...firm, alwaysFlying: true }, bat: { alwaysFlying: true },
  butterfly: { flitsLow: true }, bee: { ...firm, flitsLow: true },
  monkey: { climb: 'walk', crownHeight: 0.9 }, orangutan: { climb: 'clamber', crownHeight: 0.9 }, sloth: { climb: 'hang' },
  songbird: { ...smallBird, groundFeed: true, flocks: true, hops: true },
  hummer: { ...smallBird, bathes: false },
  woodpecker: { ...smallBird, nestHole: true, trunkFeed: true },
  duck: { ...nibble, floats: true, perches: false, sitsInCrowns: false, flocks: true },
  booby: { floats: true, perches: false, flocks: true, fishes: 'dive' },
  heron: { perches: false, sitsInCrowns: false }, crane: { perches: false, sitsInCrowns: false, groundFeed: true },
  secretary: { groundFeed: true }, hornbill: { ...nibble, nestHole: true, eatsFruit: 'toss' },
  macaw: { nestHole: true, flocks: true, eatsFruit: 'chew' }, toucan: { nestHole: true, eatsFruit: 'toss' },
  owl: { nestHole: true, scaresSmallBirds: true }, raptor: { scaresSmallBirds: true },
};

// The species' own value, else its kind's default (undefined when neither sets it).
export const trait = (def, name) => def[name] ?? KIND_TRAITS[def.sprite?.kind]?.[name];

export const climbStyle = def => def.sprite?.ape ? 'swing' : trait(def, 'climb');

// The fields above a species may set (contracts.js checks them).
export const TRAIT_BOOLEANS = 'floats alwaysFlying flitsLow sitsInCrowns hops firmSkin groundFeed perches nestHole flocks bathes trunkFeed restless fearsHunters scaresSmallBirds leaps carrionSoar cleans jinks surfaceFish bottomDweller';
