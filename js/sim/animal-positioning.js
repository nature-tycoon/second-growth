// Local spacing in tile units, using the same display scale as the models. No geometry or
// physics engine is needed: only animals in neighbouring spatial buckets are compared.
import { ANIMALS, drawDef } from '../data/animals.js';
import { T, F, isWater, clamp, DAYS_PER_YEAR } from '../config.js';
import { adultAnimalScale } from '../render3d/animal-scale.js';
import { lastDry } from './waterline.js';

export function animalRadius(a) {
  const def = drawDef(ANIMALS[a.sp], a), s = def.sprite;
  const age = def.mature > 0 ? clamp(0.55 + 0.45 * a.age / (def.mature * DAYS_PER_YEAR), 0.55, 1) : 1;
  return Math.max(0.06, (s.len || s.size || 10) * adultAnimalScale(s) *
    (a.juvenile ? s.juv ?? 0.5 : 1) * age * 0.65);
}

export function facePoint(a, x, y) {
  if (Math.hypot(x - a.x, y - a.y) < 1e-6) return;
  a.orientation = Math.atan2(y - a.y, x - a.x);
  if (Math.abs(x - a.x) > 0.02) a.facing = x > a.x ? 1 : -1;
}

function layer(w, a) {
  if (a.flying || a.alt > 0.05 || a.leaving) return null;
  const x = Math.floor(a.x), y = Math.floor(a.y);
  if (!w.inb(x, y)) return null;
  const i = w.idx(x, y), def = ANIMALS[a.sp];
  if (def.reef) return 'reef';
  if (a.move === 'tree' || a.move === 'fly' && w.tree[i] && w.treeG[i] > 0.5 &&
    !['duck', 'heron', 'crane'].includes(def.sprite.kind)) return 'canopy';
  return isWater(w.terrain[i]) && w.terrain[i] !== T.MARSH ? 'water' : 'ground';
}

export class AnimalSpacing {
  constructor() { this.buckets = new Map(); this.entries = []; }
  rebuild(w, agents) {
    this.w = w; this.buckets.clear(); this.entries.length = 0;
    // Three-tile buckets also accommodate the largest boosted reef models.
    for (const a of agents) {
      const band = layer(w, a);
      if (band == null) continue;
      const e = { a, band, r: animalRadius(a), moved: 0 };
      this.entries.push(e);
      const key = `${Math.floor(a.x / 3)},${Math.floor(a.y / 3)}`;
      let bucket = this.buckets.get(key);
      if (!bucket) this.buckets.set(key, bucket = []);
      bucket.push(e);
    }
  }
  *near(x, y) {
    const bx = Math.floor(x / 3), by = Math.floor(y / 3);
    for (let yy = by - 1; yy <= by + 1; yy++) for (let xx = bx - 1; xx <= bx + 1; xx++) {
      const bucket = this.buckets.get(`${xx},${yy}`);
      if (bucket) yield* bucket;
    }
  }
  compatible(a, e, band = layer(this.w, a)) {
    return e.a !== a && band === e.band && (band !== 'reef' ||
      Math.abs((ANIMALS[a.sp].sprite.swim ?? 0.3) - (ANIMALS[e.a.sp].sprite.swim ?? 0.3)) < 0.18);
  }
  crowd(a, x, y) {
    let cost = 0;
    const r = animalRadius(a);
    const band = layer(this.w, { ...a, x, y, flying: false, alt: 0 });
    for (const e of this.near(x, y)) if (this.compatible(a, e, band)) {
      cost += Math.max(0, r + e.r + 0.04 - Math.hypot(x - e.a.x, y - e.a.y));
    }
    return cost;
  }
  restSpot(a, j, ox, oy) {
    const x = j % this.w.w, y = (j / this.w.w) | 0;
    let best = [x + 0.5 + ox, y + 0.5 + oy], score = this.crowd(a, ...best);
    for (let k = 0; k < 8; k++) {
      const angle = (a.id * 2.39996) + k * Math.PI / 4;
      const p = [x + 0.5 + Math.cos(angle) * 0.34, y + 0.5 + Math.sin(angle) * 0.34];
      const s = this.crowd(a, ...p) + 0.015;
      if (s < score) { best = p; score = s; }
    }
    return best;
  }
  separate(dt, canStand) {
    const w = this.w, budget = Math.min(0.12, dt * 1.8);
    this.comparisons = 0;
    const shift = (e, dx, dy, amount) => {
      const d = Math.min(amount, budget - e.moved);
      if (d <= 0) return false;
      const a = e.a;
      // Drinking animals yield along the bank, not backwards away from the water.
      if (a.drinkT > 0 && a.drinkAt) {
        const hx = Math.cos(a.orientation), hy = Math.sin(a.orientation), dot = dx * hx + dy * hy;
        dx -= dot * hx; dy -= dot * hy;
      }
      const nx = a.x + dx * d, ny = a.y + dy * d;
      const x = Math.floor(nx), y = Math.floor(ny);
      if (!w.inb(x, y)) return false;
      const j = w.idx(x, y), old = w.idx(Math.floor(a.x), Math.floor(a.y));
      if (!canStand(w, j, a) || w.struct[j] >= 0 ||
        (w.feature[j] === F.FENCE && ANIMALS[a.sp].fenced) ||
        isWater(w.terrain[j]) !== isWater(w.terrain[old])) return false;
      // Never slip diagonally through a blocked corner.
      if (x !== Math.floor(a.x) && y !== Math.floor(a.y) &&
        (!canStand(w, w.idx(x, Math.floor(a.y)), a) || !canStand(w, w.idx(Math.floor(a.x), y), a))) return false;
      a.x = nx; a.y = ny; e.moved += d;
      return true;
    };
    for (const e of this.entries) for (const f of this.near(e.a.x, e.a.y)) {
      if (e.a.id >= f.a.id || !this.compatible(e.a, f, e.band)) continue;
      const a = e.a, b = f.a;
      if (a.state === 'hunt' && a.target === b.id || b.state === 'hunt' && b.target === a.id) continue;
      this.comparisons++;
      let dx = a.x - b.x, dy = a.y - b.y, d = Math.hypot(dx, dy);
      const overlap = e.r + f.r + 0.025 - d;
      if (overlap <= 0.005) continue;
      if (d < 1e-6) { const angle = (a.id + b.id * 7) * 2.39996; dx = Math.cos(angle); dy = Math.sin(angle); d = 1; }
      dx /= d; dy /= d;
      const ea = shift(e, dx, dy, overlap * 0.5), fb = shift(f, -dx, -dy, overlap * 0.5);
      if (!ea && fb) shift(f, -dx, -dy, overlap * 0.5);
      if (!fb && ea) shift(e, dx, dy, overlap * 0.5);
    }
    for (const { a } of this.entries) if (a.drinkT > 0 && a.drinkAt) facePoint(a, ...a.drinkAt);
  }
}

// A real shoreline edge and several places along it. Distance-to-water fields alone can
// describe a dry diagonal corner; the animal needs an actual water tile to face.
export function shoreSpot(w, a, j, spacing, canStand) {
  if (!canStand(w, j, a) || w.struct[j] >= 0) return null;
  if (a.move === 'fly' && w.tree[j] && w.treeG[j] > 0.5 &&
    !['duck', 'heron', 'crane'].includes(ANIMALS[a.sp].sprite.kind)) return null;
  const x = j % w.w, y = (j / w.w) | 0;
  let best = null, score = Infinity;
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    if (!w.inb(x + dx, y + dy)) continue;
    const water = w.idx(x + dx, y + dy);
    if (!isWater(w.terrain[water]) || w.feature[water] === F.CULVERT || w.struct[water] >= 0) continue;
    for (let k = 0; k < 5; k++) {
      const t = 0.18 + k * 0.16;
      // Stand at the drawn waterline, not the tile edge: a carved creek's water reaches part-way
      // up the bank tile, so walk from the landward side toward the water and stop where it's
      // still dry (up to most of a tile further back, where the bank is low).
      // (where the water covers the near approach, start further back: up to two tiles from the water)
      let sx = dx ? x + 0.5 - dx * 0.9 : x + t, sy = dy ? y + 0.5 - dy * 0.9 : y + t;
      const ex = dx ? x + 0.5 + dx * 0.55 : sx, ey = dy ? y + 0.5 + dy * 0.55 : sy;
      let dry = lastDry(w, sx, sy, ex, ey, 18);
      if (!dry) { sx -= dx * 0.9; sy -= dy * 0.9; dry = lastDry(w, sx, sy, ex, ey, 30); }
      if (!dry) continue;
      const back = Math.min(0.12, Math.hypot(dry[0] - sx, dry[1] - sy)); // (the body stands a little up the bank; its head reaches the water)
      const px = dry[0] - dx * back, py = dry[1] - dy * back;
      if (!w.inb(Math.floor(px), Math.floor(py))) continue;
      const pj = w.idx(Math.floor(px), Math.floor(py));
      if (pj !== j && (!canStand(w, pj, a) || w.struct[pj] >= 0)) continue;
      const wx = ex, wy = ey; // (faces the water tile itself, straight ahead)
      const crowd = spacing.crowd(a, px, py);
      const s = crowd * 8 + Math.hypot(a.x - px, a.y - py);
      if (s < score) { score = s; best = { x: px, y: py, water: [wx, wy], crowd }; }
    }
  }
  return best;
}
