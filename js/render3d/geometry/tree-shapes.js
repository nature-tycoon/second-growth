// Tree shape definitions as plain data, with no three.js, so the simulation can read trunk sizes
// (sim/ground-obstacles.js) without loading the geometry builders.
export const CONIFER_HABITS = {
  fir:     { lobes: 7, profile: 0.95, sag: 0.18, curl: 0.12, drop: 1.9, gap: 0.16, base: 0.15, trunkR: 0.065 },
  cedar:   { lobes: 9, profile: 0.78, sag: 0.5, curl: 0.3, drop: 2.3, gap: 0.08, base: 0.1, trunkR: 0.09 },
  hemlock: { lobes: 10, profile: 0.9, sag: 0.38, curl: 0.05, drop: 2.1, gap: 0.1, base: 0.13, trunkR: 0.06, nod: 0.5 },
};

export const TREE_SHAPES = {
  mangrove:   { kind: 'mangrove', height: 1.2, radius: 0.45 },
  fir:        { kind: 'conifer', height: 2.3, radius: 0.38, tiers: 8, habit: 'fir' },
  cedar:      { kind: 'conifer', height: 1.95, radius: 0.48, tiers: 7, droop: 0.14, habit: 'cedar' },
  hemlock:    { kind: 'conifer', height: 2.1, radius: 0.35, tiers: 9, droop: 0.09, lean: 0.65, habit: 'hemlock' },
  alder:      { kind: 'broad', height: 1.6, rx: 0.36, ry: 0.5, blobs: 10, trunkH: 0.8, trunkR: 0.045 },
  cottonwood: { kind: 'broad', height: 2.35, rx: 0.38, ry: 0.85, blobs: 13, trunkH: 0.95, trunkR: 0.065 },
  maple:      { kind: 'broad', height: 1.7, rx: 0.6, ry: 0.52, blobs: 14, trunkH: 0.68, trunkR: 0.075, lobes: 3 },
  ash:        { kind: 'broad', height: 1.55, rx: 0.42, ry: 0.46, blobs: 11, trunkH: 0.72, trunkR: 0.055 },
  oak:        { kind: 'broad', height: 1.35, rx: 0.64, ry: 0.38, blobs: 14, trunkH: 0.5, trunkR: 0.085, lobes: 4, habit: 'spread' },
  // Amazon
  inga:       { kind: 'broad', height: 1.55, rx: 0.56, ry: 0.4, blobs: 12, trunkH: 0.65, trunkR: 0.06, lobes: 2 },
  balsa:      { kind: 'broad', height: 1.95, rx: 0.46, ry: 0.5, blobs: 10, trunkH: 1.0, trunkR: 0.065 },
  mahogany:   { kind: 'broad', height: 2.3, rx: 0.64, ry: 0.55, blobs: 15, trunkH: 1.1, trunkR: 0.085, lobes: 3 },
  ipe:        { kind: 'broad', height: 2.05, rx: 0.6, ry: 0.44, blobs: 13, trunkH: 1.0, trunkR: 0.07, lobes: 3 },
  fig:        { kind: 'broad', height: 2.15, rx: 0.78, ry: 0.55, blobs: 16, trunkH: 0.85, trunkR: 0.11, lobes: 4 },
  leucaena:   { kind: 'broad', height: 1.2, rx: 0.42, ry: 0.32, blobs: 9, trunkH: 0.62, trunkR: 0.04 },
  cecropia:   { kind: 'cecropia', height: 2.0 },
  palm:       { kind: 'palm', height: 1.9, stems: 3 },
  oilpalm:    { kind: 'oilpalm', height: 2.3 },
  banana:     { kind: 'banana', height: 0.9 },
  fanpalm:    { kind: 'fanpalm', height: 2.3 },
  emergent:   { kind: 'emergent', height: 3.2, rx: 0.95, ry: 0.32, trunkR: 0.1 },
  kapok:      { kind: 'emergent', height: 3.4, rx: 1.05, ry: 0.3, trunkR: 0.11, buttress: true },
  // Serengeti
  umbrella:   { kind: 'emergent', height: 1.55, rx: 1.0, ry: 0.17, trunkR: 0.06, fork: 0.42 },
  fevertree:  { kind: 'emergent', height: 1.9, rx: 0.78, ry: 0.26, trunkR: 0.065, fork: 0.5 },
  balanites:  { kind: 'broad', height: 1.3, rx: 0.5, ry: 0.46, blobs: 11, trunkH: 0.55, trunkR: 0.06 },
  commiphora: { kind: 'broad', height: 1.1, rx: 0.48, ry: 0.3, blobs: 7, trunkH: 0.55, trunkR: 0.07 },
  sausage:    { kind: 'broad', height: 1.55, rx: 0.78, ry: 0.5, blobs: 15, trunkH: 0.6, trunkR: 0.085, lobes: 3 },
  mesquite:   { kind: 'broad', height: 1.0, rx: 0.7, ry: 0.32, blobs: 12, trunkH: 0.35, trunkR: 0.045, lobes: 3 },
  baobab:     { kind: 'baobab', height: 1.9 },
  // Atlanta
  pine:       { kind: 'conifer', height: 2.4, radius: 0.48, tiers: 5, base: 0.57, habit: 'pine' }, // loblolly: tall bare trunk, high needle sprays
  magnolia:   { kind: 'broad', height: 1.75, rx: 0.4, ry: 0.78, blobs: 15, trunkH: 0.3, trunkR: 0.06, habit: 'spire' },        // dense, tall, rounded cone
  understory: { kind: 'broad', height: 1.0, rx: 0.56, ry: 0.26, blobs: 11, trunkH: 0.48, trunkR: 0.04, lobes: 3, habit: 'layered' }, // dogwood, redbud: flat layered crowns
  vase:       { kind: 'broad', height: 1.25, rx: 0.5, ry: 0.36, blobs: 11, trunkH: 0.62, trunkR: 0.035, lobes: 3, habit: 'vase' },  // crepe myrtle
  // Nicaragua
  guanacaste: { kind: 'broad', height: 2.0, rx: 1.02, ry: 0.5, blobs: 20, trunkH: 0.75, trunkR: 0.12, lobes: 4 },   // a huge wide dome
  raintree:   { kind: 'broad', height: 1.75, rx: 0.98, ry: 0.36, blobs: 18, trunkH: 0.72, trunkR: 0.1, lobes: 4 },   // genízaro: a broad umbrella
  mangrovebush: { kind: 'broad', height: 0.95, rx: 0.48, ry: 0.36, blobs: 11, trunkH: 0.26, trunkR: 0.05, lobes: 2 }, // black and white mangroves
  euphorbia:  { kind: 'euphorbia', height: 1.6 },
  // Great Barrier Reef corals (the reef map draws them as its "trees")
  staghorn:   { kind: 'staghorn', height: 0.55 },  // branching Acropora thickets
  tablecoral: { kind: 'tablecoral', height: 0.5 }, // a wide flat plate on a short stalk
  boulder:    { kind: 'boulder', height: 0.5 },    // massive Porites: a lumpy dome, centuries old
  brain:      { kind: 'brain', height: 0.36 },     // a rounded dome with meandering grooves
  plating:    { kind: 'plating', height: 0.42 },   // Montipora: whorls of thin, overlapping plates like a cabbage
  pisonia:    { kind: 'broad', height: 1.45, rx: 0.62, ry: 0.42, blobs: 13, trunkH: 0.5, trunkR: 0.09, lobes: 3 }, // the cay's soft-wooded forest tree
};
