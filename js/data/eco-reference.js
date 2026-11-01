// What each map's land looks like intact: the "reference ecosystem" the Ecosystem Report
// measures the player against (decision 0031), and the published figures its carbon estimate
// uses. Each number's source is in the decision record; keep the two in step.
//
// agb:     above-ground biomass of a mature natural stand, tonnes dry matter per hectare
//          (IPCC 2019 Refinement, Vol. 4 Ch. 4, Table 4.7)
// href:    the stand's typical canopy height in metres; a species' own heightM scales its share
// soc:     soil organic carbon to 30 cm under native vegetation, t C/ha (IPCC 2019, Table 2.3)
// socWet:  the same for wetland soils (marsh and pond beds)
// fLU:     how much of that soil carbon long-farmed land keeps (IPCC 2006, Vol. 4 Table 5.5,
//          long-term cultivated); restored soil climbs back to 1
// grass:   above-ground biomass of the grass and herb layer, t d.m./ha (IPCC 2006 Table 6.4)
// cover:   the share of the land each kind of habitat takes in the reference
// wet:     share of the land in marsh and pond
// big:     share of the land under big old native trees; dead: share with a log or snag
// apex:    the map's top predators (the food web's top level)
// herbivores: live large-herbivore biomass of the intact ecosystem, kg per hectare [low, high];
//          its middle is where herbivore pressure on plants reaches 63% of full (decision 0033)
// stages:  the five stages on the road from where the farm starts to the reference

export const REFERENCE = {
  pnw: {
    name: 'Old-growth Douglas-fir forest',
    agb: 354.1, href: 50, soc: 64, socWet: 135, fLU: 0.69, grass: 2.7,
    cover: { meadow: 0.1, shrub: 0.1, forest: 0.7, old: 0.35 }, wet: 0.06, big: 0.2, dead: 0.06,
    apex: ['cougar', 'bear'],
    herbivores: [20, 50], // Roosevelt elk 10.8–16/km² in Olympic old growth (Houston et al. 1987), plus black-tailed deer
    stages: ['Worn-out farm', 'Recovering', 'Young woodland', 'Maturing forest', 'Old-growth-like'],
  },
  atlanta: {
    name: 'Piedmont oak and hickory woods',
    agb: 84.5, href: 30, soc: 55, socWet: 135, fLU: 0.69, grass: 2.7,
    cover: { meadow: 0.15, shrub: 0.15, forest: 0.55, old: 0.2 }, wet: 0.03, big: 0.12, dead: 0.04,
    apex: ['coyote', 'hawk', 'owl'],
    herbivores: [5, 15], // white-tailed deer, 8–25/km² (McCabe & McCabe 1997; Côté et al. 2004)
    stages: ['Lawns and sod', 'Recovering', 'Young woods', 'Maturing woods', 'Piedmont-woods-like'],
  },
  serengeti: {
    name: 'Intact acacia savanna',
    agb: 69.6, href: 12, soc: 21, socWet: 22, fLU: 0.58, grass: 2.3,
    cover: { meadow: 0.6, shrub: 0.1, forest: 0.15, old: 0.04 }, wet: 0.02, big: 0.03, dead: 0.01,
    apex: ['lion', 'leopard', 'hyena', 'cheetah'],
    herbivores: [100, 200], // East African savanna on over 500 mm of rain, 10,000–20,000 kg/km² (Coe et al. 1976)
    stages: ['Bare, overgrazed range', 'Recovering', 'Grassland returning', 'Maturing savanna', 'Intact-savanna-like'],
  },
  amazon: {
    name: 'Amazon rainforest',
    agb: 307.1, href: 35, soc: 38, socWet: 68, fLU: 0.48, grass: 6.2,
    cover: { meadow: 0.02, shrub: 0.05, forest: 0.8, old: 0.45 }, wet: 0.03, big: 0.25, dead: 0.06,
    apex: ['jaguar', 'harpy', 'anaconda'],
    herbivores: [3, 10], // Neotropical forest ungulates and capybara (Robinson & Redford 1986)
    stages: ['Burned cattle pasture', 'Recovering', 'Young secondary forest', 'Maturing forest', 'Rainforest-like'],
  },
  sumatra: {
    name: 'Lowland dipterocarp rainforest',
    agb: 413.1, href: 45, soc: 52, socWet: 49, fLU: 0.48, grass: 6.2,
    cover: { meadow: 0.02, shrub: 0.05, forest: 0.85, old: 0.5 }, wet: 0.03, big: 0.3, dead: 0.06,
    apex: ['tiger', 'clouded', 'serpenteagle'],
    herbivores: [5, 20], // Southeast Asian rainforest elephants, tapir, deer and rhino
    stages: ['Oil palm estate', 'Recovering', 'Young secondary forest', 'Maturing forest', 'Rainforest-like'],
  },
  chinandega: {
    name: 'Pacific dry forest and mangroves',
    agb: 127.5, href: 25, soc: 50, socWet: 22, fLU: 0.58, grass: 2.3,
    cover: { meadow: 0.15, shrub: 0.15, forest: 0.5, old: 0.2 }, wet: 0.05, big: 0.12, dead: 0.03,
    apex: ['ocelot', 'crocodile', 'guaco'],
    herbivores: [10, 40], // Pacific dry forest deer, peccary and tapir
    stages: ['Worn-out pasture', 'Recovering', 'Young dry forest', 'Maturing forest', 'Dry-forest-like'],
  },
  // An underwater map: its "trees" are corals, which aren't counted as carbon (a growing reef
  // gives off a little CO2 as it builds limestone). Its carbon is the seagrass meadows' and the
  // cay's trees; its vital signs are a reef's own (see reefVitals in sim/eco-metrics.js).
  reef: {
    name: 'A living coral reef',
    reef: true,
    agb: 38.3, href: 12, soc: 0, socWet: 0, fLU: 1, grass: 0,
    coral: 1500, oldCoral: 150, coralKinds: 5, softCoral: 300, seagrass: 1500,
    apex: ['shark', 'blacktip', 'trevally'],
    stages: ['Bleached rubble', 'Recovering', 'Coral returning', 'Maturing reef', 'Living-reef-like'],
  },
};

// Carbon in dry plant matter (IPCC 2006, Vol. 4 Table 4.3 default)
export const CARBON_FRACTION = 0.47;
// One tile: the 180-acre maps are 120 x 90 tiles, so a tile is about 67 m2
export const TILE_HA = 72.84 / (120 * 90);
// Carbon buried each year by mangrove and seagrass mud, t C/ha/yr (Mcleod et al. 2011)
export const BURIAL = { mangrove: 2.26, seagrass: 1.38 };
// Living seagrass leaves and roots, t C/ha (Fourqurean et al. 2012)
export const SEAGRASS_LIVING = 2.52;
export const SEAGRASS = ['halophila', 'zostera'];
// CO2 per tonne of carbon, and a typical passenger car's CO2 a year (US EPA, 2019 revision)
export const CO2_PER_C = 44 / 12;
export const CAR_CO2_YEAR = 4.63;

export const referenceFor = map => REFERENCE[map] || REFERENCE.pnw;
