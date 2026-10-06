import { T, H, clamp } from '../config.js';
import { CALL_RANGE } from './nature.js';

// Sample around the camera instead of making a restored corner sound like the whole property.
export function sampleSoundLand(game, renderer, biome, animals) {
  const w = game.world, x0 = clamp(Math.floor(renderer.target.x), 0, w.w - 1), y0 = clamp(Math.floor(renderer.target.z), 0, w.h - 1);
  let wet = 0, wetNear = 0, bare = 0, canopy = 0, n = 0, creek = 0, river = 0, shore = 0;
  // Visit every tile: a sparse grid can skip an entire one-tile-wide stream or small pond.
  for (let dy = -12; dy <= 12; dy++) for (let dx = -12; dx <= 12; dx++) {
    const x = x0 + dx, y = y0 + dy; if (!w.inb(x, y)) continue;
    const i = w.idx(x, y), h = w.habitat[i], near = Math.max(0, 1 - Math.hypot(dx, dy) / 15); n++;
    if (h === H.MARSH || h === H.POND) { wet++; wetNear = Math.max(wetNear, near); }
    if (h === H.BARE || h === H.FARM) bare++;
    canopy += w.canopy[i];
    if (w.terrain[i] === T.CREEK) creek = Math.max(creek, near);
    if (w.terrain[i] === T.RIVER) river = Math.max(river, near);
    if (game.map === 'reef' && biome.dryLand(w, i)) shore = Math.max(shore, near);
  }
  const local = new Set(), audible = new Set();
  for (const a of game.wildlife.agents) {
    if (a.leaving) continue;
    const key = animals[a.sp].key, distance = Math.hypot(a.x - x0, a.y - y0);
    if (distance <= 28) local.add(key);
    if (distance <= (CALL_RANGE[key] ?? 28)) audible.add(key);
  }
  const present = [...local], callPresent = [...audible];
  const u = renderer.todU ?? 0.35;
  return { map: game.map, month: game.month, tod: u, present, callPresent, species: present.length,
    bare: n ? bare / n : 0, canopy: n ? clamp(canopy / n, 0, 1) : 0, health: clamp((game.cache.score?.total ?? 0) / 100, 0, 1),
    creek, river, shore, water: clamp(1 - w.distWater[w.idx(x0, y0)] / 10, 0, 1), wet: n ? Math.max(wet / n, wetNear * 0.65) : 0,
    night: renderer.night || 0, dawn: renderer.dawn || 0, dusk: u > 0.8 && u < 0.89 ? 1 - Math.abs(u - 0.845) / 0.045 : 0,
    dry: (game.map === 'serengeti' && game.month >= 3 && game.month <= 7) || (game.map === 'chinandega' && (game.month >= 9 || game.month <= 1)),
  };
}
