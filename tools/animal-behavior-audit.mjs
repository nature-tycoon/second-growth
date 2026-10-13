// Reproducible inventory of all regional species and the behavior systems that apply to them.
import { writeFile } from 'node:fs/promises';
import { BIOME_LIST, setBiome } from '../js/biome.js';
import { ANIMALS } from '../js/data/animals.js';
const sources = {
  waders: 'https://www.allaboutbirds.org/guide/Great_Blue_Heron/lifehistory',
  spoonbills: 'https://academy.allaboutbirds.org/roseate-spoonbills-forage/',
  coyotes: 'https://www.nps.gov/zion/learn/nature/coyote.htm',
  antelope: 'https://animals.sandiegozoo.org/animals/antelope',
  deer: 'https://www.nps.gov/articles/000/mule-deer.htm',
  giraffe: 'https://animals.sandiegozoo.org/animal-glossary/necking',
  squirrels: 'https://www.nps.gov/olym/learn/nature/douglas-squirrel.htm',
  bats: 'https://www.nps.gov/subjects/bats/all-about-bats.htm',
  anteater: 'https://animals.sandiegozoo.org/animals/giant-anteater',
  sunbear: 'https://animals.sandiegozoo.org/animals/sun-bear',
  pangolin: 'https://svw.vn/wp-content/uploads/2017/05/SVW_Sunda-Pangolin-Husbandry-Guidelines-2014.pdf',
  amphibians: 'https://www.nps.gov/grte/learn/management/upload/2019-Guides-Day-Notebook-access2.pdf',
  poisonfrog: 'https://animals.sandiegozoo.org/animals/poison-frog',
  howlers: 'https://nationalzoo.si.edu/animals/black-howler-monkey',
  sloths: 'https://www.phoenixzoo.org/wp-content/uploads/2022/05/WT-May-June-2022-Small.pdf',
  tapir: 'https://animals.sandiegozoo.org/animals/tapir',
  peccary: 'https://animals.sandiegozoo.org/animals/peccary',
  hippo: 'https://animals.sandiegozoo.org/animals/hippo',
  beetle: 'https://animals.sandiegozoo.org/animals/dung-beetle',
  seagrass: 'https://www.gbrmpa.gov.au/learn/animals/dugong',
  hawksbill: 'https://www.fisheries.noaa.gov/species/hawksbill-turtle',
  cleaning: 'https://australian.museum/blog/amri-news/news-from-lirs-learning-from-the-cleaners-and-their-clients/',
  fishEscape: 'https://apps-afsc.fisheries.noaa.gov/Quarterly/jfm2007/divrptsRACE5.htm',
  sediment: 'https://outlookreport.gbrmpa.gov.au/values/3-ecosystem-health/34-ecological-processes/342-particle-feeding',
};
const report = { researched: '2026-10-12', scope: 'Audit all regional rosters against shared behavioral guilds and existing mechanics. Sources support guild corrections; this is not a complete species-by-species ethogram.',
  sources, changes: [
    'Waders stalk and strike from land or shallows instead of circling and diving; deep-water prey needs a reachable bank.',
    'Coyotes chasing the represented small prey recruit at most one companion; other pack hunts have bounded helpers.',
    'Only successful catches or carcass meals satisfy predator hunger; airborne prey is inaccessible to terrestrial hunters in every difficulty.',
    'Aquatic prey make short escapes through passable water after a rush or failed catch.',
    'Resource-specific feeding pauses for plant, insect, nectar and benthic feeders; canopy leaf specialists retain occasional fruit meals.',
    'Male horn-bearing mammals spar; male giraffes stand alongside one another for necking. Other body types no longer lock imaginary horns.',
    'Spoonbill bills sweep sideways during lowered-head feeding, while other waders retain their strike poses.',
    'Reef cleaners meet nearby idle clients at established stations. Client cleaning never supplies a predator with food.',
    'Green turtles and dugongs nibble seagrass; hawksbills and Moorish idols nibble sponges, with bounded habitat loss.',
  ], retained: [
    'Species habitat, seasons, food-web capacities and strict population caps.',
    'Salmon runs and bear fishing; beaver dams; cervid family groups and elk rut harems.',
    'Existing primate fruit meals and canopy travel; bird pecking, nesting, bathing and preening.',
    'Reef algal grazing and crown-of-thorns control; migratory herd crossings and scavenging.',
  ], limitations: ['Game days and visual lighting are separate; nocturnal/diurnal schedules were not inferred from cosmetic lighting.',
    'Unrepresented prey such as ants, insects and plankton use existing habitat indices rather than invented population agents.',
    'No species-specific lethal fighting, disease or parasite population system was added.'], maps: [] };
for (const map of BIOME_LIST) {
  setBiome(map.id);
  report.maps.push({ map: map.id, species: ANIMALS.map(d => ({ key: d.key, name: d.name, scientificName: d.sci,
    movement: d.move, domestic: !!d.domestic, feeding: d.behavior.forage, prey: d.prey || [], challengingPrey: d.challengePrey || [],
    huntingStyle: d.prey || d.challengePrey ? d.behavior.hunt : null,
    huntCompanions: d.behavior.partners, adultMaleCombat: d.behavior.combat,
    herd: !!(d.herd || d.familyHerd), frugivore: d.frugivore, damBuilder: d.damBuilder,
    existingBirdActivities: d.move === 'fly' && ['Birds','Seabirds'].includes(d.group),
    existingPrimateMeals: ['monkey','orangutan'].includes(d.sprite.kind), max: d.max, strictMax: !!d.strictMax })) });
}
report.speciesCount = report.maps.reduce((n, m) => n + m.species.length, 0);
await writeFile(new URL('./animal-behavior-audit.json', import.meta.url), JSON.stringify(report, null, 2) + '\n');
console.log(`Audited ${report.speciesCount} regional species across ${report.maps.length} maps.`);
