import { T, H, clamp } from '../config.js';
import { CALL_RANGE } from './nature.js';
import { trait } from '../data/animal-kinds.js';
import { isFall } from '../maps/landform.js';

// A waterfall is heard close by only: full within a tile or two of the camera's focus, gone FALL_EARSHOT
// tiles off, and only when zoomed in (FALL_ZOOM: from the default overhead view, none) or at eye level.
export const FALL_EARSHOT = 8, FALL_ZOOM = [0.75, 1.8];

// Sample around the camera instead of making a restored corner sound like the whole property.
export function sampleSoundLand(game, renderer, biome, animals) {
  const w = game.world, x0 = clamp(Math.floor(renderer.target.x), 0, w.w - 1), y0 = clamp(Math.floor(renderer.target.z), 0, w.h - 1);
  let wet = 0, wetNear = 0, bare = 0, canopy = 0, n = 0, creek = 0, river = 0, shore = 0, falls = 0;
  // Running water is heard from where the camera looks, on the farm or off it: the starting creek runs
  // on beyond the north fence (outsideCreek, 0054), where the intro film's first shot looks up it, so
  // it's heard from the drawn land there too (dry when the ditch it feeds is: terrain.js buildWater).
  const fx = Math.floor(renderer.target.x), fy = Math.floor(renderer.target.z), B = game.border, nc = game.catalog?.definition?.northCreek;
  const ni = nc && w.inb(nc(0), 0) ? w.idx(nc(0), 0) : -1, outsideDry = ni >= 0 && !!w.waterManaged?.[ni] && !Number.isFinite(w.waterLevel?.[ni]);
  if (B) for (let dy = -12; dy <= 12; dy++) for (let dx = -12; dx <= 12; dx++) {
    const x = fx + dx, y = fy + dy; if (w.inb(x, y)) continue;
    const bi = B.bi(x, y); if (bi < 0) continue;
    const near = Math.max(0, 1 - Math.hypot(dx, dy) / 15);
    if (B.terrain[bi] === T.CREEK && !(outsideDry && y < 0)) creek = Math.max(creek, near);
  }
  // Visit every tile: a sparse grid can skip an entire one-tile-wide stream or small pond.
  for (let dy = -12; dy <= 12; dy++) for (let dx = -12; dx <= 12; dx++) {
    const x = x0 + dx, y = y0 + dy; if (!w.inb(x, y)) continue;
    const i = w.idx(x, y), h = w.habitat[i], near = Math.max(0, 1 - Math.hypot(dx, dy) / 15); n++;
    if (h === H.MARSH || h === H.POND) { wet++; wetNear = Math.max(wetNear, near); }
    if (h === H.BARE || h === H.FARM) bare++;
    canopy += w.canopy[i];
    if (w.terrain[i] === T.CREEK) creek = Math.max(creek, near);
    if (w.terrain[i] === T.CREEK && isFall(w, i)) falls = Math.max(falls, clamp(1 - (Math.hypot(dx, dy) - 1) / (FALL_EARSHOT - 1), 0, 1) ** 1.5);
    if (w.terrain[i] === T.RIVER) river = Math.max(river, near);
    if (game.map === 'reef' && biome.dryLand(w, i)) shore = Math.max(shore, near);
  }
  const local = new Set(), audible = new Set(), callPositions = {};
  const right = renderer.right?.() ?? { x: 1, z: 0 };
  for (const a of game.wildlife.agents) {
    if (a.leaving) continue;
    const key = animals[a.sp].key, distance = Math.hypot(a.x - x0, a.y - y0);
    if (distance <= 28) local.add(key);
    const range = CALL_RANGE[key] ?? 28;
    // (a woodpecker's drum comes from one that is on a trunk, working it: decision 0030)
    if (trait(animals[a.sp], 'trunkFeed') && a.bird?.kind !== 'trunk') continue;
    if (distance <= range) {
      audible.add(key);
      if (!callPositions[key] || distance < callPositions[key].distance) callPositions[key] = {
        distance, far: Math.min(0.65, distance / range),
        pan: clamp(((a.x - x0) * right.x + (a.y - y0) * right.z) / 35, -0.85, 0.85),
      };
    }
  }
  const close = renderer.eyeOn ? 1 : clamp(((renderer.zoom ?? 1) - FALL_ZOOM[0]) / (FALL_ZOOM[1] - FALL_ZOOM[0]), 0, 1);
  const present = [...local], callPresent = [...audible];
  const u = renderer.todU ?? 0.35;
  return { map: game.map, month: game.month, tod: u, present, callPresent, callPositions, species: present.length,
    bare: n ? bare / n : 0, canopy: n ? clamp(canopy / n, 0, 1) : 0, health: clamp((game.cache.score?.total ?? 0) / 100, 0, 1),
    creek, river, shore, falls: falls * close, water: clamp(1 - w.distWater[w.idx(x0, y0)] / 10, 0, 1), wet: n ? Math.max(wet / n, wetNear * 0.65) : 0,
    night: renderer.night || 0, dawn: renderer.dawn || 0, dusk: u > 0.8 && u < 0.89 ? 1 - Math.abs(u - 0.845) / 0.045 : 0,
    dry: (game.map === 'serengeti' && game.month >= 3 && game.month <= 7) || (game.map === 'chinandega' && (game.month >= 9 || game.month <= 1)),
  };
}
