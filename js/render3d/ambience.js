// Atmosphere on the 2D effects layer: the little things that make the valley feel alive.
//   - leaves tumbling out of broadleaf trees in autumn (and in the Amazon's dry season)
//   - seed fluff and pollen drifting on the breeze in the growing season
//   - mist wisps hanging over ponds, marshes and the river in cool, damp seasons
//   - passing birds are simulated wildlife, rendered by actors.js
//   - a soft vignette, and a wash of warm light from the sun's side on clear days
// What appears when comes from each map (biome.look.ambience), per season.

import { biome } from '../biome.js';
import { PLANTS } from '../data/plants.js';
import { BORDER, LEVEL, T, isWater, clamp } from '../config.js';
import { TREE_SHAPES } from './geometry.js';

const rand = (a, b) => a + Math.random() * (b - a);
const pick = arr => arr[Math.floor(Math.random() * arr.length)];

export class Ambience {
  constructor() {
    this.leaves = []; this.fluff = []; this.mist = [];
    this.mistSprite = makeMist();
  }

  resize(w, h) {
    // the vignette is drawn once per size: clear in the middle, gently darker toward the corners
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(w / 2)); c.height = Math.max(1, Math.round(h / 2));
    const g = c.getContext('2d'), r = Math.hypot(c.width, c.height) / 2;
    const grad = g.createRadialGradient(c.width / 2, c.height / 2, r * 0.45, c.width / 2, c.height / 2, r);
    grad.addColorStop(0, 'rgba(14,22,16,0)');
    grad.addColorStop(1, 'rgba(14,22,16,0.34)');
    g.fillStyle = grad; g.fillRect(0, 0, c.width, c.height);
    this.vignette = c;
  }

  // world-anchored effects, drawn under the animals' labels and the weather
  drawWorld(ctx, R, game, dt, bx0, bx1, bz0, bz1) {
    const A = biome.look.ambience;
    if (!A || R.weatherOn === false) { this.leaves.length = this.fluff.length = this.mist.length = 0; return; }
    const w = R.world, B = game.border, season = game.season, zoom = R.zoom;
    const wet = game.weather === 'rain' || game.weather === 'snow';
    const ground = (x, z) => w.heightAt(clamp(x, -BORDER, w.w + BORDER - 0.01), clamp(z, -BORDER, w.h + BORDER - 0.01)) * LEVEL;
    const tile = () => [Math.floor(rand(bx0, bx1 + 1)), Math.floor(rand(bz0, bz1 + 1))];
    const treeAt = (x, z) => {
      if (w.inb(x, z)) { const i = w.idx(x, z); return w.tree[i] ? [PLANTS[w.tree[i]], w.treeG[i]] : null; }
      const bi = B.bi(x, z);
      return bi >= 0 && B.tree[bi] ? [PLANTS[B.tree[bi]], B.treeG[bi] || 0.9] : null;
    };
    const close = zoom > 0.6;

    // ---- spring petals: blossom drifting down from the flowering trees (redbud, dogwood, cherry)
    const petalRate = (A.petals?.[season] || 0) * (wet ? 0.3 : 1);
    if (close && petalRate > 0 && this.leaves.length < 70 * petalRate) {
      const m = game.month;
      for (let k = 0; k < 16; k++) { // (flowering trees are few and far between, so look harder)
        const [x, z] = tile(), t = treeAt(x, z);
        if (!t || t[1] < 0.5 || !t[0].look.flower || !t[0].look.bloom?.includes(m) || Math.random() > petalRate) continue;
        const p = t[0], h = (TREE_SHAPES[p.look.type]?.height || 1.6) * t[1] * rand(0.5, 0.8);
        const px = x + rand(0.2, 0.8), pz = z + rand(0.2, 0.8);
        this.leaves.push({ x: px, z: pz, y: ground(px, pz) + h, ph: rand(0, 6.3), spin: rand(5, 9), life: 1.2, col: p.look.flower, petal: true });
      }
    }
    // ---- falling leaves
    const leafRate = A.leaves[season] * (wet ? 0.5 : 1);
    if (close && leafRate > 0 && this.leaves.length < 55 * leafRate) {
      for (let k = 0; k < 3; k++) {
        const [x, z] = tile(), t = treeAt(x, z);
        if (!t || t[0].conifer || t[1] < 0.5 || Math.random() > leafRate) continue;
        const p = t[0], h = (TREE_SHAPES[p.look.type]?.height || 1.6) * t[1] * rand(0.45, 0.75);
        const px = x + rand(0.2, 0.8), pz = z + rand(0.2, 0.8);
        this.leaves.push({ x: px, z: pz, y: ground(px, pz) + h, ph: rand(0, 6.3), spin: rand(4, 8), life: 1.6,
          col: p.look.fall && season === 2 && Math.random() < 0.6 ? p.look.fall : pick(A.leafColors) });
      }
    }
    for (let k = this.leaves.length - 1; k >= 0; k--) {
      const L = this.leaves[k];
      const g0 = ground(L.x, L.z);
      if (L.y > g0 + 0.01) {
        L.y -= dt * 0.32; L.ph += dt * 2.2;
        L.x += (Math.sin(L.ph) * 0.35 + 0.12) * dt; L.z += (Math.cos(L.ph * 0.7) * 0.2 + 0.05) * dt;
      } else { L.y = g0 + 0.01; L.life -= dt; }
      if (L.life <= 0 || zoom <= 0.6) { this.leaves.splice(k, 1); continue; }
      const s = R.project(L.x, L.y, L.z), flip = Math.cos(L.ph * L.spin * 0.5);
      ctx.globalAlpha = Math.min(1, L.life) * 0.95;
      const ps = L.petal ? 0.55 : 1; // (petals are smaller, and soft-edged)
      ctx.fillStyle = L.col; ctx.strokeStyle = L.petal ? 'rgba(255,255,255,0.35)' : 'rgba(70,40,14,0.55)'; ctx.lineWidth = 0.8;
      ctx.beginPath(); ctx.ellipse(s.x, s.y, (0.8 + 2.4 * Math.abs(flip)) * zoom * 1.25 * ps, 1.9 * zoom * 1.25 * ps, L.ph, 0, 7); ctx.fill(); ctx.stroke();
    }

    // ---- seed fluff and pollen motes, catching the light
    const fluffRate = A.fluff[season] * (wet ? 0 : game.weather === 'cloud' ? 0.6 : 1);
    if (close && fluffRate > 0 && this.fluff.length < 45 * fluffRate) {
      const [x, z] = tile();
      if (!isWater(R.terrain.terrainAt(x, z)) && Math.random() < fluffRate) {
        const px = x + Math.random(), pz = z + Math.random();
        this.fluff.push({ x: px, z: pz, y: ground(px, pz) + rand(0.25, 1.3), t: 0, life: rand(6, 11), ph: rand(0, 6.3), r: rand(0.7, 1.3) });
      }
    }
    for (let k = this.fluff.length - 1; k >= 0; k--) {
      const f = this.fluff[k];
      f.t += dt; f.ph += dt;
      if (f.t > f.life || zoom <= 0.6) { this.fluff.splice(k, 1); continue; }
      f.x += (0.42 + Math.sin(f.ph * 0.8) * 0.15) * dt; f.z += (0.16 + Math.cos(f.ph * 0.6) * 0.12) * dt; f.y += Math.sin(f.ph * 1.3) * 0.05 * dt;
      const s = R.project(f.x, f.y, f.z);
      const fade = Math.min(1, f.t / 1.5, (f.life - f.t) / 1.5), glint = 0.55 + 0.45 * Math.sin(f.ph * 3 + f.r * 9);
      ctx.globalAlpha = fade * glint;
      ctx.fillStyle = '#fffdf0';
      ctx.beginPath(); ctx.arc(s.x, s.y, f.r * Math.max(1.5, zoom * 1.4), 0, 7); ctx.fill();
    }

    // ---- mist over the water
    const mistRate = A.mist[season] * (game.weather === 'clear' ? 0.7 : 1);
    if (zoom > 0.45 && mistRate > 0 && this.mist.length < 34 * mistRate) {
      for (let k = 0; k < 4; k++) {
        const [x, z] = tile(), t = R.terrain.terrainAt(x, z);
        if (!isWater(t) || Math.random() > mistRate) continue;
        const px = x + Math.random(), pz = z + Math.random();
        this.mist.push({ x: px, z: pz, y: ground(px, pz) + 0.12, t: 0, life: rand(9, 16), size: rand(1.6, 3.2) * (t === T.RIVER ? 1.4 : 1) });
        break;
      }
    }
    // ---- a volcano on the horizon (San Cristóbal): a slow plume of gas drifting off the summit
    const V = biome.look.volcano;
    if (V) {
      this.plume = this.plume || []; this.plumeT = (this.plumeT || 0) - dt;
      if (this.plumeT <= 0 && this.plume.length < 30) { this.plumeT = rand(0.5, 1.1); this.plume.push({ x: V.x + rand(-0.6, 0.6), z: V.z + rand(-0.4, 0.4), y: ground(V.x, V.z) + 0.4, t: 0, life: rand(16, 24), size: rand(2.2, 3.4) }); }
      for (let k = this.plume.length - 1; k >= 0; k--) {
        const p = this.plume[k];
        p.t += dt; if (p.t > p.life) { this.plume.splice(k, 1); continue; }
        p.y += 0.22 * dt; p.x += 0.2 * dt; p.z += 0.03 * dt; p.size += 0.12 * dt;
        const s = R.project(p.x, p.y, p.z), u = p.t / p.life, Wp = p.size * R.ppu * 1.4;
        ctx.globalAlpha = Math.sin(u * Math.PI) * 0.34;
        ctx.drawImage(this.mistSprite, s.x - Wp / 2, s.y - Wp * 0.35, Wp, Wp * 0.7);
      }
    }
    const ppu = R.ppu;
    for (let k = this.mist.length - 1; k >= 0; k--) {
      const m = this.mist[k];
      m.t += dt;
      if (m.t > m.life || zoom <= 0.45) { this.mist.splice(k, 1); continue; }
      m.x += 0.12 * dt; m.z += 0.05 * dt; m.y += 0.015 * dt;
      const s = R.project(m.x, m.y, m.z), u = m.t / m.life;
      const W = m.size * ppu * 1.5, H = W * 0.42;
      ctx.globalAlpha = Math.sin(u * Math.PI) * 0.26;
      ctx.drawImage(this.mistSprite, s.x - W / 2, s.y - H / 2, W, H);
    }
    ctx.globalAlpha = 1;
  }

  // sky-level effects and the light over everything, drawn last
  drawSky(ctx, R, game, dt) {
    const vw = R.vw, vh = R.vh;
    // warm light from the sun's side of the sky on clear days (strongest late in the season's light)
    const clear = game.weather === 'clear' ? 1 : game.weather === 'cloud' ? 0.4 : 0;
    this.sunWash = (this.sunWash ?? clear) + (clear - (this.sunWash ?? clear)) * Math.min(1, dt * 0.6);
    if (this.sunWash > 0.02) {
      const sun = biome.look.light[game.season].sun, r = (sun >> 16) & 255, g = (sun >> 8) & 255, b = sun & 255;
      const grad = ctx.createLinearGradient(0, 0, vw * 0.7, vh * 0.9);
      grad.addColorStop(0, `rgba(${r},${g},${b},${0.13 * this.sunWash})`);
      grad.addColorStop(1, `rgba(${r},${g},${b},0)`);
      ctx.fillStyle = grad; ctx.fillRect(0, 0, vw, vh);
    }

    // vignette
    if (this.vignette) {
      ctx.globalAlpha = game.weather === 'rain' || game.weather === 'snow' ? 1 : 0.8;
      ctx.drawImage(this.vignette, 0, 0, vw, vh);
      ctx.globalAlpha = 1;
    }
  }

}

function makeMist() {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 64;
  const g = c.getContext('2d');
  for (let k = 0; k < 5; k++) {
    const cx = 64 + (k - 2) * 14, cy = 32 + ((k * 37) % 9) - 4, r = 30 - Math.abs(k - 2) * 5;
    const grad = g.createRadialGradient(cx, cy, 0, cx, cy, r);
    grad.addColorStop(0, 'rgba(240,244,244,0.55)');
    grad.addColorStop(1, 'rgba(240,244,244,0)');
    g.fillStyle = grad; g.fillRect(0, 0, 128, 64);
  }
  return c;
}
