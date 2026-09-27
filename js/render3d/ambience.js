// Atmosphere on the 2D effects layer: the little things that make the valley feel alive.
//   - leaves tumbling out of broadleaf trees in autumn (and in the Amazon's dry season)
//   - seed fluff and pollen drifting on the breeze in the growing season
//   - mist wisps hanging over ponds, marshes and the river in cool, damp seasons
//   - flocks crossing the sky now and then: geese in V formation, swallows, parrots, macaws
//   - a soft vignette, and a wash of warm light from the sun's side on clear days
// What appears when comes from each map (biome.look.ambience), per season.

import { biome } from '../biome.js';
import { PLANTS } from '../data/plants.js';
import { BORDER, LEVEL, T, isWater, clamp } from '../config.js';
import { TREE_SHAPES } from './geometry.js';

const FLOCKS = {
  geese: { n: [7, 11], vee: true, size: 8, speed: 70, flap: 3.2, color: 'rgba(38,36,32,0.72)' },
  songbirds: { n: [10, 18], size: 3.6, speed: 95, flap: 9, color: 'rgba(42,38,32,0.7)', loose: 1 },
  swallows: { n: [5, 8], size: 4.4, speed: 140, flap: 7, color: 'rgba(30,36,48,0.75)', loose: 1.6, swoop: true },
  parrots: { n: [5, 9], size: 5, speed: 105, flap: 8, color: 'rgba(58,160,70,0.85)', loose: 1.2 },
  macaws: { n: [2, 4], size: 8, speed: 80, flap: 4, color: 'rgba(214,40,30,0.9)', tail: 'rgba(40,90,200,0.9)', loose: 0.7 },
  egrets: { n: [4, 7], size: 7.5, speed: 60, flap: 2.6, color: 'rgba(246,246,240,0.92)', loose: 1 },
};
const rand = (a, b) => a + Math.random() * (b - a);
const PPU = 46; // screen pixels per tile at zoom 1: flock sizes and speeds above are given at that zoom
const pick = arr => arr[Math.floor(Math.random() * arr.length)];

export class Ambience {
  constructor() {
    this.leaves = []; this.fluff = []; this.mist = []; this.flocks = [];
    this.nextFlock = 10 + Math.random() * 15;
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
      ctx.fillStyle = L.col; ctx.strokeStyle = 'rgba(70,40,14,0.55)'; ctx.lineWidth = 0.8;
      ctx.beginPath(); ctx.ellipse(s.x, s.y, (0.8 + 2.4 * Math.abs(flip)) * zoom * 1.25, 1.9 * zoom * 1.25, L.ph, 0, 7); ctx.fill(); ctx.stroke();
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
    const A = biome.look.ambience, vw = R.vw, vh = R.vh;
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

    // flocks passing over
    if (A && R.weatherOn !== false) {
      this.nextFlock -= dt;
      if (this.nextFlock <= 0 && game.weather !== 'snow') {
        this.nextFlock = rand(30, 75) * (game.weather === 'rain' ? 2 : 1);
        this.spawnFlock(pick(A.flocks[game.season]), R);
      }
    }
    // Flocks live in the world, high over the land: they grow as you zoom in and move with the
    // map when you pan or rotate, instead of hanging on the screen while the valley slides past.
    const zs = R.zoom;
    for (let k = this.flocks.length - 1; k >= 0; k--) {
      const F = this.flocks[k], S = FLOCKS[F.kind];
      F.t += dt;
      F.x += F.dir[0] * F.speed * dt; F.z += F.dir[1] * F.speed * dt;
      if (F.t > F.life) { this.flocks.splice(k, 1); continue; }
      const [ca, sa] = F.dir;
      // which way the flock is heading on screen, so every bird faces along its flight
      const p0 = R.project(F.x, F.y, F.z), p1 = R.project(F.x + ca, F.y, F.z + sa);
      const heading = Math.atan2(p1.y - p0.y, p1.x - p0.x);
      for (const b of F.birds) {
        const wob = (S.swoop ? Math.sin(F.t * 2.2 + b.ph) * 14 : Math.sin(F.t * 0.9 + b.ph) * 2.5 * (S.loose || 0)) / PPU;
        const bx = F.x + b.dx * ca - (b.dy + wob) * sa, bz = F.z + b.dx * sa + (b.dy + wob) * ca;
        const p = R.project(bx, F.y + b.dy * 0.08, bz);
        if (p.x < -60 || p.y < -60 || p.x > vw + 60 || p.y > vh + 60) continue;
        drawBird(ctx, p.x, p.y, S, Math.sin(F.t * S.flap + b.ph), b.s * zs, heading);
      }
    }

    // vignette
    if (this.vignette) {
      ctx.globalAlpha = game.weather === 'rain' || game.weather === 'snow' ? 1 : 0.8;
      ctx.drawImage(this.vignette, 0, 0, vw, vh);
      ctx.globalAlpha = 1;
    }
  }

  spawnFlock(kind, R) {
    const S = FLOCKS[kind];
    if (!S || !R.world) return;
    // cross the current view on a random heading, starting just beyond its edge, high above the ground
    const cx = R.target.x, cz = R.target.z;
    const radius = Math.max(8, ...R.viewportPolygon().map(([x, z]) => Math.hypot(x - cx, z - cz)));
    const ang = Math.random() * Math.PI * 2, dir = [Math.cos(ang), Math.sin(ang)], side = rand(-0.45, 0.45) * radius;
    const speed = S.speed / PPU * rand(0.85, 1.15);
    const n = Math.round(rand(S.n[0], S.n[1] + 0.99)), birds = [];
    for (let i = 0; i < n; i++) {
      if (S.vee) {
        // a V: the leader in front, the rest trailing back on alternate arms
        const arm = i === 0 ? 0 : (i % 2 ? 1 : -1), rank = Math.ceil(i / 2);
        birds.push({ dx: -rank * 18 / PPU, dy: arm * rank * 13 / PPU, ph: i * 0.7, s: 1 });
      } else birds.push({ dx: -rand(0, 70) / PPU, dy: rand(-22, 22) * (S.loose || 1) / PPU, ph: rand(0, 6.3), s: rand(0.85, 1.15) });
    }
    const w = R.world, gy = w.heightAt(clamp(cx, 0, w.w - 0.01), clamp(cz, 0, w.h - 0.01)) * LEVEL;
    this.flocks.push({ kind, x: cx - dir[0] * (radius + 4) - dir[1] * side, z: cz - dir[1] * (radius + 4) + dir[0] * side,
      y: gy + rand(2.8, 4.2), dir, speed, t: 0, life: (2 * radius + 10) / speed, birds });
  }
}

// A bird seen from above: body and head pointing along its heading, two crescent wings out to the
// sides. The wingbeat shows as the wings sweeping and foreshortening (seen from above they
// shorten at the top and bottom of each beat). Drawn in the bird's own frame, head toward -y.
function drawBird(ctx, x, y, S, beat, scale, heading = -Math.PI / 2) {
  const s = S.size * scale, span = s * (0.78 + 0.22 * beat), sweep = s * (0.12 - 0.16 * beat);
  ctx.save();
  ctx.translate(x, y); ctx.rotate(heading + Math.PI / 2);
  ctx.fillStyle = S.color;
  ctx.beginPath();
  for (const side of [-1, 1]) {
    // leading edge bows forward out to the tip, trailing edge curves back to the body
    ctx.moveTo(0, -s * 0.12);
    ctx.quadraticCurveTo(side * span * 0.5, -s * 0.34 + sweep * 0.3, side * span, sweep);
    ctx.quadraticCurveTo(side * span * 0.55, s * 0.02 + sweep * 0.5, 0, s * 0.16);
  }
  ctx.fill();
  ctx.beginPath(); ctx.ellipse(0, 0, s * 0.12, s * 0.3, 0, 0, 7); ctx.fill();          // body
  ctx.beginPath(); ctx.arc(0, -s * 0.34, s * 0.1, 0, 7); ctx.fill();                   // head
  if (S.tail) { ctx.fillStyle = S.tail; ctx.beginPath(); ctx.moveTo(-s * 0.07, s * 0.22); ctx.lineTo(s * 0.07, s * 0.22); ctx.lineTo(0, s * 0.95); ctx.fill(); }
  else { ctx.beginPath(); ctx.moveTo(-s * 0.1, s * 0.22); ctx.lineTo(s * 0.1, s * 0.22); ctx.lineTo(0, s * 0.46); ctx.fill(); } // a short tail
  ctx.restore();
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
