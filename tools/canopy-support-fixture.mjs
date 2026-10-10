import { Game } from '../js/game.js';
import { ANIMAL } from '../js/data/animals.js';
import { PLANT } from '../js/data/plants.js';
import { T } from '../js/config.js';

export function canopyFixture(map = 'amazon', key = 'howler', growth = 1) {
  const game = new Game(); game.newGame(1987, 'free', 'standard', map); game.speed = 0;
  const w = game.world;
  for (const prop of ['ground', 'shrub', 'tree', 'feature']) w[prop].fill(0);
  for (const prop of ['ground', 'shrub', 'tree']) game.border[prop].fill(0);
  w.vh.fill(0); w.struct.fill(-1); w.terrain.fill(T.SOIL);
  game.wildlife.agents = []; game.visitors.agents = []; game.residents = [];
  const tree = PLANT[map === 'amazon' ? 'fig' : map === 'sumatra' ? 'meranti' : map === 'atlanta' ? 'whiteoak' : 'guanacaste'];
  if (!tree) throw new Error(`Missing canopy fixture tree for ${map}`);
  for (const [x, z] of [[40, 32], [41, 32]]) w.setPlant(w.idx(x, z), tree, growth);
  const a = game.wildlife.spawn(ANIMAL[key], 40, 32, { silent: true, age: 1200 });
  a.x = 40.68; a.y = 32.44; a.state = 'idle'; a.hd = .3; a.phase = .4; a.wait = 100;
  game.selectedAgent = a;
  return { game, a };
}
