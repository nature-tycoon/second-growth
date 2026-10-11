// Shared deterministic habitat and animal fixtures; never imported by production gameplay.
import { ANIMALS, ANIMAL, isMaleVariant } from '../js/data/animals.js';
import { BIOME_LIST, biome } from '../js/biome.js';
import { T, DAYS_PER_YEAR } from '../js/config.js';
import { mulberry32 } from '../js/rng.js';
import { restoredGame } from './map-audit-fixtures.mjs';

export function releaseGame(map, kind) {
  if (!BIOME_LIST.some(b => b.id === map)) throw new Error('Unknown map ' + map);
  Math.random = mulberry32(20261011);
  const game = restoredGame(map, 1987), w = game.world;
  game.day = 20; game.speed = 0; game.weather = 'clear'; game.snow = 0;
  game.wildlife.agents = []; game.wildlife.flyovers = []; game.wildlife.recount();
  game.visitors.agents = []; game.residents = [];
  const legend = [];
  if (kind === 'animals' || kind === 'herd') {
    // Flat study ground keeps silhouettes and common display scale easy to compare.
    w.vh.fill(biome.look.underwater ? -2 : 0);
    w.terrain.fill(biome.look.underwater ? T.CREEK : T.SOIL);
    w.tree.fill(0); w.shrub.fill(0); w.ground.fill(0); w.feature.fill(0); w.struct.fill(-1); w.structures = [];
    game.border.tree.fill(0); game.border.shrub.fill(0); game.border.ground.fill(0);
    const definitions = kind === 'herd' ? [ANIMAL.wildebeest, ANIMAL.zebra, ANIMAL.gazelle].filter(Boolean) : ANIMALS;
    const count = kind === 'herd' ? 96 : definitions.length * 3;
    for (let k = 0; k < count; k++) {
      const def = definitions[kind === 'herd' ? k % definitions.length : Math.floor(k / 3)];
      const stage = k % 3, juvenile = kind === 'animals' && stage === 2;
      if (kind === 'animals' && !juvenile && def.sprite.male) {
        while (isMaleVariant(def, { id: game.wildlife.nextId, age: def.mature * DAYS_PER_YEAR + 1 }) !== (stage === 1)) game.wildlife.nextId++;
      }
      const x = kind === 'herd' ? 42 + (k % 12) * 1.6 : 39 + (k % 12) * 3.8;
      const y = 31 + Math.floor(k / 12) * 3.3;
      const a = game.wildlife.spawn(def, x, y, { silent: true, juvenile, age: juvenile ? 10 : def.mature * DAYS_PER_YEAR + 1 });
      Object.assign(a, { x, y, tx: x, ty: y, wait: 1000, orientation: -.35, hunger: 0, phase: 0, thirst: 0 });
      legend.push({ species: def.key, stage: juvenile ? 'young' : stage === 1 && def.sprite.male ? 'male' : 'adult', x, y });
    }
    game.refreshEnvironment(); game.wildlife.recount();
  }
  const center = kind === 'animals' ? [60, 31 + (Math.ceil(legend.length / 12) - 1) * 1.65] : kind === 'herd' ? [51, 42] : map === 'reef' ? [60, 56] : [42, 32];
  return { game, legend, center };
}
