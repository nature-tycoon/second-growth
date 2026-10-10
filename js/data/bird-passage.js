// Species used only for passage when the map has no resident definition. They
// stay outside ANIMALS, preserving save indices and the resident food web.
const bird = (key, name, sci, sprite, desc) => ({ key, name, sci, sprite, desc,
  move: 'fly', group: 'Passing birds', mature: 1, speed: 8, shy: 0.2 });
export const PASSAGE_SPECIES = {
  canada_goose: bird('canada_goose', 'Canada goose', 'Branta canadensis',
    { kind: 'duck', goose: true, size: 25, color: '#807668', breast: '#d3cbbb', head: '#242421', bill: '#242421', tail: '#30302a', beat: 0.55 },
    'Geese travel together in a V formation. This flock is passing over the property.'),
  barn_swallow: bird('barn_swallow', 'Barn swallow', 'Hirundo rustica',
    { kind: 'songbird', size: 11, color: '#233f56', head: '#233f56', breast: '#e5b78b', face: '#9e492e', wingShape: 'pointed', forkTail: true, tailLength: 0.7, tailWidth: 0.055, beat: 1.35 },
    'A fork-tailed aerial insect hunter. Passing flocks make low, sweeping flights.'),
  great_egret: bird('great_egret', 'Great egret', 'Ardea alba',
    { kind: 'heron', size: 23, color: '#ecece3', breast: '#f5f3ea', head: '#f5f3ea', bill: '#d8ae32', beat: 0.65 },
    'A white wetland bird with broad wings and slow wingbeats. This group is travelling between wetlands.'),
  white_stork: bird('white_stork', 'White stork', 'Ciconia ciconia',
    { kind: 'heron', stork: true, size: 27, color: '#eeeae0', breast: '#f4f0e8', head: '#f4f0e8', flight: '#282825', bill: '#b44736', beat: 0.5 },
    'Migrating storks cross East Africa on broad wings. These birds are passing through.'),
  black_vulture: bird('black_vulture', 'Black vulture', 'Coragyps atratus',
    { kind: 'vulture', size: 24, color: '#292b2b', breast: '#323332', head: '#555652', bill: '#aaaa9b', flight: '#292b2b', wingtip: '#bebfb9', darkRuff: true, beat: 0.55 },
    'A dark scavenger that soars with other vultures. This group is passing over the property.'),
  hanging_parrot: bird('hanging_parrot', 'Blue-crowned hanging parrot', 'Loriculus galgulus',
    { kind: 'macaw', shortTail: true, size: 10, color: '#3c963d', breast: '#64b23f', head: '#38883b', cap: '#3476b1', tail: '#32934b', beat: 1.2 },
    'A small green parrot from Southeast Asia, including Sumatra. This group is crossing between forest patches.'),
};

// Reuse resident species where appropriate; a flyover of that species still
// contributes nothing to its resident population or habitat requirements.
export const PASSAGE_ROUTES = {
  pnw: { geese: ['canada_goose'], songbirds: ['robin'], swallows: ['barn_swallow'] },
  atlanta: { geese: ['canada_goose'], songbirds: ['cardinal', 'bluebird'], swallows: ['barn_swallow'], goldfinches: ['goldfinch'] },
  amazon: { egrets: ['great_egret'], parrots: ['macaw'], macaws: ['macaw'] },
  serengeti: { storks: ['white_stork'], weavers: ['weaver'], vultures: ['vulture'], egrets: ['great_egret'] },
  chinandega: { parrots: ['lora', 'chocoyo'], egrets: ['egret'], storks: ['egret'], swallows: ['barn_swallow'], vultures: ['black_vulture'] },
  sumatra: { hornbills: ['hornbill'], parrots: ['hanging_parrot'], egrets: ['great_egret'], swallows: ['barn_swallow'] },
  reef: { egrets: ['booby'], swallows: ['noddy'] },
};
