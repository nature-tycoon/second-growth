// Bees and butterflies visiting the flowers in view: not simulated wildlife, only scenery, but drawn
// in 3D with the wildlife's own models and scale (Fauna, animals/winged-animals.js), so they sit in
// the scene like everything else: hidden behind trees, lit by the sun, and shown at eye level too.
// (They were flat dots painted over the picture, the same four colours on every map, beside the
// map's real 3D butterflies.)
//
// Which ones each map has comes from its look.ambience.pollinators: [{ animal: 'monarch', w }] to
// borrow one of the map's own species, or [{ sprite: {...}, w }] for an insect the map doesn't
// simulate (w: how common). They hover over flowering tiles (World.nectar) at the height of the
// flowers there: a blooming shrub's crown, or low over flowering ground.
import { LEVEL, clamp } from '../config.js';
import { adultAnimalScale } from './animal-scale.js';

const MAX = 40;          // at once, in view
const SPAWN_TRIES = 4;   // tiles looked at each frame for a new one
const rand = (a, b) => a + Math.random() * (b - a);

export class Pollinators {
  constructor() { this.list = []; this.kinds = null; this.forMap = null; }

  // The map's pollinators as drawable definitions, each with how common it is.
  species(game) {
    const def = game.catalog.definition;
    if (this.forMap === def) return this.kinds;
    this.forMap = def;
    const entries = def.look.ambience?.pollinators || [];
    this.kinds = entries.map((e, i) => {
      const animal = e.animal ? game.catalog.animal[e.animal] : null;
      const d = animal || { key: `pollinator${i}`, mapId: def.id, sprite: e.sprite };
      return { def: d, w: e.w ?? 1, bee: d.sprite.kind === 'bee', sc: adultAnimalScale(d.sprite) };
    }).filter(k => k.def?.sprite);
    this.list.length = 0;
    return this.kinds;
  }

  // view: [x0, x1, z0, z1], the tiles in view; on: false clears them (zoomed out, weather off)
  update(game, dt, view, on) {
    const kinds = this.species(game), list = this.list, w = game.world;
    if (!on || !kinds.length) { list.length = 0; return; }
    const total = kinds.reduce((s, k) => s + k.w, 0);
    if (list.length < MAX) for (let k = 0; k < SPAWN_TRIES; k++) {
      const x = Math.floor(rand(view[0], view[1] + 1)), z = Math.floor(rand(view[2], view[3] + 1));
      if (!w.inb(x, z)) continue;
      const n = w.nectar[w.idx(x, z)];
      if (!(n > 0.25) || Math.random() > n * 0.5) continue;
      let r = Math.random() * total, kind = kinds[0];
      for (const c of kinds) if ((r -= c.w) <= 0) { kind = c; break; }
      const px = x + rand(0.15, 0.85), pz = z + rand(0.15, 0.85), fh = flowerHeight(game, x, z);
      list.push({ kind, x: px, z: pz, hx: x + 0.5, hz: z + 0.5, fh, y: ground(w, px, pz) + fh + 0.3, vx: 0, vz: 0,
        life: rand(6, 14), ph: Math.random() * 10, rest: 0, yaw: Math.random() * 6.28 });
    }
    for (let k = list.length - 1; k >= 0; k--) {
      const p = list[k], bee = p.kind.bee;
      p.life -= dt; p.ph += dt * 6;
      if (p.life <= 0) { list.splice(k, 1); continue; }
      const g = ground(w, p.x, p.z);
      if (p.rest > 0) { // on a flower: a butterfly sits with its wings up, a bee works it
        p.rest -= dt; p.y += (g + p.fh - p.y) * Math.min(1, dt * 8);
        continue;
      }
      const leaving = p.life < 1.2, sp = bee ? 1.2 : 0.55;
      p.vx += ((p.hx - p.x) * (leaving ? -0.4 : 0.6) + (Math.random() - 0.5) * 7) * dt;
      p.vz += ((p.hz - p.z) * (leaving ? -0.4 : 0.6) + (Math.random() - 0.5) * 7) * dt;
      const v = Math.hypot(p.vx, p.vz); if (v > sp) { p.vx *= sp / v; p.vz *= sp / v; }
      p.x += p.vx * dt; p.z += p.vz * dt;
      if (v > 0.02) p.yaw = -Math.atan2(p.vz, p.vx);
      // a butterfly bobs along above the flowers, a bee keeps lower and steadier; leaving, they climb away
      const over = leaving ? 0.25 + (1.2 - p.life) * 0.6 : bee ? 0.06 + Math.sin(p.ph * 0.9) * 0.02 : 0.12 + Math.sin(p.ph * 0.5) * 0.06;
      p.y += (g + p.fh + over - p.y) * Math.min(1, dt * 4);
      // now and then, near the middle of its patch, it settles on a flower
      if (!leaving && Math.hypot(p.x - p.hx, p.z - p.hz) < 0.3 && Math.random() < dt * (bee ? 1.2 : 0.4)) {
        p.rest = bee ? rand(0.3, 0.9) : rand(1.2, 3); p.vx = p.vz = 0;
      }
    }
  }

  // Into the wildlife's instanced pools this frame (between Fauna.begin and Fauna.end).
  draw(F) {
    for (const p of this.list) {
      const resting = p.rest > 0 && !p.kind.bee;
      // (a resting butterfly opens its wings now and then: fly 0 holds them folded up)
      const fly = resting ? (Math.sin(p.ph * 0.7) > 0.85 ? 0.35 : 0) : 1;
      F.add(p.kind.def, p.x, p.y, p.z, p.yaw, p.kind.sc, p.ph, 0, fly, 0);
    }
  }
}

function ground(w, x, z) { return w.heightAt(clamp(x, 0, w.w - 0.01), clamp(z, 0, w.h - 0.01)) * LEVEL; }

// How high the flowers on a tile are: a flowering shrub's crown (drawn about 0.4 of its scale tall:
// flora.js), or the flowers in the grass.
function flowerHeight(game, x, z) {
  const w = game.world, i = w.idx(x, z), p = w.shrub[i] ? game.catalog.plants[w.shrub[i]] : null;
  if (p?.look.flower && p.look.bloom?.includes(game.month) && w.shrubG[i] > 0.3) return (0.32 + 0.6 * w.shrubG[i]) * 0.36;
  return 0.06;
}
