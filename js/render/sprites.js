// Procedurally drawn sprites, cached as offscreen canvases.
// Everything is drawn at SPR (64) pixels per tile and scaled down by the renderer.

import { T, F, SPR } from '../config.js';
import { PLANTS, plantPhase } from '../data/plants.js';
import { mulberry32, hashStr } from '../rng.js';

const cache = new Map();
function cached(key, build) {
  let c = cache.get(key);
  if (!c) { c = build(); cache.set(key, c); }
  return c;
}
function mk(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  return [c, ctx];
}

// ---------------------------------------------------------------- colour helpers
function hexToRgb(h) {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function rgbToHex(r, g, b) {
  const c = v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
  return '#' + c(r) + c(g) + c(b);
}
export function shade(h, amt) {
  const [r, g, b] = hexToRgb(h);
  if (amt >= 0) return rgbToHex(r + (255 - r) * amt, g + (255 - g) * amt, b + (255 - b) * amt);
  return rgbToHex(r * (1 + amt), g * (1 + amt), b * (1 + amt));
}
export function mix(a, b, t) {
  const A = hexToRgb(a), B = hexToRgb(b);
  return rgbToHex(A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t);
}
const rgba = (h, a) => { const [r, g, b] = hexToRgb(h); return `rgba(${r},${g},${b},${a})`; };

function blob(ctx, x, y, r, color, light = 0.18) {
  const g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.1, x, y, r);
  g.addColorStop(0, shade(color, light));
  g.addColorStop(0.65, color);
  g.addColorStop(1, shade(color, -0.25));
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
}
function ellipse(ctx, x, y, rx, ry, color, rot = 0) {
  ctx.fillStyle = color;
  ctx.beginPath(); ctx.ellipse(x, y, Math.max(0.1, rx), Math.max(0.1, ry), rot, 0, Math.PI * 2); ctx.fill();
}
function line(ctx, x1, y1, x2, y2, color, w = 1) {
  ctx.strokeStyle = color; ctx.lineWidth = w; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
}

// ---------------------------------------------------------------- terrain
const PASTURE = ['#a4b36b', '#b6b172', '#a9a46c', '#8c976a'];
export const TURF = 20, BED = 21;
const FIELD = ['#8a6848', '#93704c', '#85634a', '#6e553e'];

export function terrainSprite(t, season, v) {
  return cached(`t${t}|${season}|${v}`, () => {
    const [c, ctx] = mk(SPR, SPR);
    const r = mulberry32(hashStr(`terrain${t}${season}${v}`));
    const S = SPR;
    const specks = (n, cols, size = [0.8, 2]) => {
      for (let k = 0; k < n; k++) {
        ctx.fillStyle = cols[Math.floor(r() * cols.length)];
        const s = size[0] + r() * (size[1] - size[0]);
        ctx.fillRect(r() * S, r() * S, s, s);
      }
    };
    switch (t) {
      case T.PASTURE: {
        const base = PASTURE[season];
        ctx.fillStyle = base; ctx.fillRect(0, 0, S, S);
        for (let k = 0; k < 6; k++) ellipse(ctx, r() * S, r() * S, 8 + r() * 10, 5 + r() * 6, rgba(shade(base, r() < 0.5 ? -0.08 : 0.07), 0.6));
        for (let k = 0; k < 110; k++) {
          const x = r() * S, y = r() * S, l = 2 + r() * 4;
          line(ctx, x, y, x + (r() - 0.5) * 2, y - l, shade(base, (r() - 0.5) * 0.3), 1);
        }
        if (season === 0) specks(5, ['#f2d33a', '#f6f1e1'], [1.5, 2.5]);
        break;
      }
      case T.FIELD: {
        const base = FIELD[season];
        ctx.fillStyle = base; ctx.fillRect(0, 0, S, S);
        for (let y = 2; y < S; y += 8) {
          ctx.fillStyle = shade(base, -0.16);
          ctx.beginPath(); ctx.moveTo(0, y);
          for (let x = 0; x <= S; x += 8) ctx.lineTo(x, y + Math.sin(x * 0.3 + v) * 0.8);
          ctx.lineTo(S, y + 3); ctx.lineTo(0, y + 3); ctx.fill();
          ctx.fillStyle = shade(base, 0.1); ctx.fillRect(0, y + 4, S, 1.2);
        }
        specks(40, [shade(base, -0.25), shade(base, 0.15)]);
        if (season === 0 || season === 1) for (let k = 0; k < 4; k++) {
          const x = r() * S, y = r() * S;
          for (let b = 0; b < 4; b++) line(ctx, x, y, x + (r() - 0.5) * 5, y - 2 - r() * 3, '#7d8f4c', 1);
        }
        break;
      }
      case T.SOIL: case T.DUFF: {
        const base = t === T.SOIL ? '#86684a' : '#5a4c36';
        ctx.fillStyle = base; ctx.fillRect(0, 0, S, S);
        for (let k = 0; k < 8; k++) ellipse(ctx, r() * S, r() * S, 6 + r() * 8, 4 + r() * 5, rgba(shade(base, (r() - 0.5) * 0.3), 0.6));
        specks(70, [shade(base, -0.3), shade(base, 0.18), shade(base, 0.3)]);
        if (t === T.DUFF) {
          for (let k = 0; k < 40; k++) {
            const x = r() * S, y = r() * S, a = r() * Math.PI;
            line(ctx, x, y, x + Math.cos(a) * 3, y + Math.sin(a) * 3, r() < 0.5 ? '#8a5a32' : '#6b4a2a', 1);
          }
          for (let k = 0; k < 3; k++) ellipse(ctx, r() * S, r() * S, 4 + r() * 5, 3 + r() * 3, rgba('#5f7a3a', 0.55));
        }
        break;
      }
      case T.GRAVEL: case T.ROAD: {
        const base = t === T.GRAVEL ? '#a39b8a' : '#b19a78';
        ctx.fillStyle = base; ctx.fillRect(0, 0, S, S);
        for (let k = 0; k < (t === T.GRAVEL ? 60 : 30); k++) {
          const g = shade(t === T.GRAVEL ? '#9a9486' : '#a38c6a', (r() - 0.5) * 0.5);
          ellipse(ctx, r() * S, r() * S, 1 + r() * 2.5, 1 + r() * 1.8, g);
        }
        if (t === T.ROAD) {
          ctx.fillStyle = rgba('#7d6a50', 0.25);
          ctx.fillRect(0, 14, S, 7); ctx.fillRect(0, 42, S, 7);
        }
        break;
      }
      case T.TRAIL: {
        const base = '#b89c74';
        ctx.fillStyle = base; ctx.fillRect(0, 0, S, S);
        for (let k = 0; k < 10; k++) ellipse(ctx, r() * S, r() * S, 6 + r() * 8, 3 + r() * 4, rgba(shade(base, (r() - 0.5) * 0.2), 0.7));
        for (let k = 0; k < 26; k++) ellipse(ctx, r() * S, r() * S, 1 + r() * 1.6, 0.8 + r() * 1.2, shade('#a08868', (r() - 0.5) * 0.5));
        for (let k = 0; k < 6; k++) { const x = r() * S, y = r() * S; line(ctx, x, y, x + 5, y + 1, rgba('#8a7050', 0.4), 1); }
        break;
      }
      case TURF: {
        // neutral grass texture, tinted by the plant growing on the tile
        const base = '#dfe4d2';
        ctx.fillStyle = base; ctx.fillRect(0, 0, S, S);
        for (let k = 0; k < 10; k++) ellipse(ctx, r() * S, r() * S, 6 + r() * 9, 4 + r() * 6, rgba(shade(base, (r() - 0.5) * 0.16), 0.7));
        for (let k = 0; k < 150; k++) {
          const x = r() * S, y = r() * S, l = 2 + r() * 4;
          line(ctx, x, y, x + (r() - 0.5) * 2, y - l, shade(base, (r() - 0.6) * 0.35), 1);
        }
        break;
      }
      case BED: {
        const base = '#7a6a50';
        ctx.fillStyle = base; ctx.fillRect(0, 0, S, S);
        for (let k = 0; k < 16; k++) ellipse(ctx, r() * S, r() * S, 2 + r() * 6, 2 + r() * 4, rgba(shade('#8a8070', (r() - 0.5) * 0.4), 0.7));
        break;
      }
      case T.MUD: {
        const base = '#6f5d44';
        ctx.fillStyle = base; ctx.fillRect(0, 0, S, S);
        for (let k = 0; k < 7; k++) ellipse(ctx, r() * S, r() * S, 5 + r() * 9, 3 + r() * 5, rgba('#4e412f', 0.6));
        for (let k = 0; k < 10; k++) { const x = r() * S, y = r() * S; line(ctx, x, y, x + 3 + r() * 4, y, rgba('#b8a888', 0.5), 1); }
        specks(30, ['#5a4a36', '#8a785c']);
        break;
      }
    }
    return c;
  });
}

// ---------------------------------------------------------------- water with banks
const WATER = {
  [T.POND]: { base: '#3c7a8e', edge: '#6aa6a8' },
  [T.CREEK]: { base: '#4a8c9c', edge: '#79b3b1' },
  [T.RIVER]: { base: '#386f86', edge: '#5f9aa6' },
  [T.MARSH]: { base: '#5d8b78', edge: '#86ad91' },
};
// mask bits: 1=N 2=E 4=S 8=W neighbour is water
export function waterSprite(t, mask, season) {
  return cached(`w${t}|${mask}|${season}`, () => {
    const [c, ctx] = mk(SPR, SPR);
    const S = SPR, inset = t === T.MARSH ? 5 : 8, rr = 16;
    const col = WATER[t];
    const r = mulberry32(hashStr(`water${t}${mask}`));
    ctx.fillStyle = '#6b5a40'; ctx.fillRect(0, 0, S, S);
    ctx.fillStyle = '#7e6c4e';
    for (let k = 0; k < 20; k++) ctx.fillRect(r() * S, r() * S, 2, 2);
    const n = mask & 1, e = mask & 2, s = mask & 4, w = mask & 8;
    const x0 = w ? 0 : inset, y0 = n ? 0 : inset, x1 = e ? S : S - inset, y1 = s ? S : S - inset;
    const rad = [(!n && !w) ? rr : 0, (!n && !e) ? rr : 0, (!s && !e) ? rr : 0, (!s && !w) ? rr : 0];
    // The rim path runs off-tile on water sides so only land-facing edges get a visible shoreline.
    const X = 24;
    const rx0 = w ? -X : inset, ry0 = n ? -X : inset, rx1 = e ? S + X : S - inset, ry1 = s ? S + X : S - inset;
    const rimPath = () => { ctx.beginPath(); ctx.roundRect(rx0, ry0, rx1 - rx0, ry1 - ry0, rad); };
    ctx.save();
    ctx.beginPath(); ctx.roundRect(x0, y0, x1 - x0, y1 - y0, rad); ctx.clip();
    const base = season === 1 ? shade(col.base, 0.04) : season === 3 ? shade(col.base, -0.08) : col.base;
    ctx.fillStyle = base; ctx.fillRect(0, 0, S, S);
    ctx.strokeStyle = rgba(col.edge, 0.75); ctx.lineWidth = 7; rimPath(); ctx.stroke();
    ctx.strokeStyle = rgba(col.edge, 0.35); ctx.lineWidth = 16; rimPath(); ctx.stroke();
    if (t === T.MARSH) for (let k = 0; k < 8; k++) ellipse(ctx, r() * S, r() * S, 4 + r() * 6, 2 + r() * 3, rgba('#4f7a55', 0.5));
    ctx.restore();
    ctx.save();
    ctx.beginPath(); ctx.rect(0, 0, S, S); ctx.clip();
    ctx.strokeStyle = rgba('#4a3c2a', 0.5); ctx.lineWidth = 1.5; rimPath(); ctx.stroke();
    ctx.restore();
    return c;
  });
}

// ---------------------------------------------------------------- groundcover
const GPAD = 10; // ground plant sprites overhang the tile
function seasonalLeaf(p, phase) {
  const lk = p.look;
  if (phase === 'spring') return shade(lk.leaf, 0.18);
  if (phase === 'late') return lk.dry ? mix(lk.leaf, lk.dry, 0.35) : lk.leaf;
  if (phase === 'fall') return lk.fall || (lk.dry ? mix(lk.leaf, lk.dry, 0.7) : mix(lk.leaf, '#9a8a4a', 0.4));
  if (phase === 'winter') return lk.dry ? mix(lk.dry, '#8a7a5a', 0.3) : mix(lk.leaf, '#6a6a4a', p.look.type === 'fern' || p.look.type === 'sedge' ? 0.15 : 0.5);
  return lk.leaf;
}

export function groundSprite(id, bucket, month, v) {
  const p = PLANTS[id];
  const phase = plantPhase(p, month);
  return cached(`g${id}|${bucket}|${phase}|${v}`, () => {
    const S = SPR + GPAD * 2;
    const [c, ctx] = mk(S, S);
    const r = mulberry32(hashStr(`ground${id}${v}${bucket}`));
    const lk = p.look;
    const leaf = seasonalLeaf(p, phase);
    const scale = [0.5, 0.78, 1][bucket];
    const O = GPAD;
    const px = () => O - 4 + r() * (SPR + 8), py = () => O + 2 + r() * (SPR - 2);
    // soft wash of green so dense stands read as solid cover
    // Feathered turf under established plants hides the old farm ground and blends with neighbours.
    if (bucket > 0 && lk.type !== 'cattail' && lk.type !== 'tule') {
      const season = { spring: 0, green: 0, bloom: 0, late: 1, fruit: 1, fall: 2, winter: 3 }[phase] ?? 0;
      const turf = lk.type === 'fern' || lk.type === 'skunk' ? '#54482f' : mix(PASTURE[season], leaf, 0.2);
      ctx.save();
      ctx.globalAlpha = bucket === 1 ? 0.6 : 0.95;
      ctx.shadowColor = turf; ctx.shadowBlur = 6;
      ctx.fillStyle = turf;
      // wobbly outline so patch edges look organic rather than tiled
      ctx.beginPath();
      const cx = S / 2, cy = S / 2;
      for (let a = 0; a <= 24; a++) {
        const t = a / 24 * Math.PI * 2;
        const sq = 1 / Math.max(Math.abs(Math.cos(t)), Math.abs(Math.sin(t)));
        const rad = Math.min(sq, 1.25) * (SPR / 2 + 4) * (0.92 + r() * 0.12);
        const px = cx + Math.cos(t) * rad, py = cy + Math.sin(t) * rad;
        a ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
      }
      ctx.closePath(); ctx.fill();
      ctx.restore();
      for (let k = 0; k < 40; k++) {
        const x = O + r() * SPR, y = O + r() * SPR;
        line(ctx, x, y, x + (r() - 0.5) * 2, y - 2 - r() * 3, shade(turf, (r() - 0.5) * 0.3), 1);
      }
    }
    const washA = [0.05, 0.1, 0.16][bucket];
    const washC = mix(lk.leaf, '#7d8a52', 0.5);
    const wg = ctx.createRadialGradient(S / 2, S / 2, 4, S / 2, S / 2, S * 0.62);
    wg.addColorStop(0, rgba(washC, washA)); wg.addColorStop(0.55, rgba(washC, washA)); wg.addColorStop(1, rgba(washC, 0));
    if (lk.type !== 'cattail' && lk.type !== 'tule') { ctx.fillStyle = wg; ctx.fillRect(0, 0, S, S); }
    const blooming = phase === 'bloom';
    switch (lk.type) {
      case 'grass': case 'tallgrass': case 'sedge': {
        const n = [5, 9, 14][bucket] + (lk.type === 'sedge' ? 3 : 0);
        const tall = lk.type === 'tallgrass' ? 1.5 : lk.type === 'sedge' ? 1.1 : 1;
        for (let k = 0; k < n; k++) {
          const x = px(), y = py();
          ellipse(ctx, x, y, 5 * scale, 2 * scale, rgba('#2a3a1a', 0.2));
          const blades = 7 + Math.floor(r() * 5);
          for (let b = 0; b < blades; b++) {
            const a = -Math.PI / 2 + (r() - 0.5) * 1.6;
            const l = (7 + r() * 8) * scale * tall;
            const col = shade(leaf, (r() - 0.5) * 0.3);
            ctx.strokeStyle = col; ctx.lineWidth = lk.type === 'sedge' ? 1.6 : 1.2; ctx.lineCap = 'round';
            ctx.beginPath(); ctx.moveTo(x, y);
            ctx.quadraticCurveTo(x + Math.cos(a) * l * 0.5, y + Math.sin(a) * l * 0.6, x + Math.cos(a) * l + (lk.type === 'sedge' ? Math.cos(a) * 3 : 0), y + Math.sin(a) * l * (lk.type === 'sedge' ? 0.7 : 1));
            ctx.stroke();
          }
          if ((phase === 'late' || phase === 'green') && bucket === 2 && lk.type !== 'sedge' && r() < 0.5) {
            line(ctx, x, y, x + 1, y - 16 * scale * tall, shade(lk.dry || leaf, 0.1), 1);
            ellipse(ctx, x + 1, y - 17 * scale * tall, 1.5, 3, shade(lk.dry || '#c9b77e', 0));
          }
        }
        break;
      }
      case 'forb': case 'tallforb': {
        const n = [3, 6, 9][bucket];
        const tall = lk.type === 'tallforb';
        for (let k = 0; k < n; k++) {
          const x = px(), y = py();
          ellipse(ctx, x, y + 1, 5 * scale, 2 * scale, rgba('#2a3a1a', 0.2));
          if (tall) {
            const h = (14 + r() * 8) * scale;
            line(ctx, x, y, x, y - h, shade(leaf, -0.2), 1.4);
            for (let l = 0; l < 4; l++) {
              const ly = y - h * (0.2 + l * 0.18);
              ellipse(ctx, x - 3, ly, 3.5 * scale, 1.3, leaf, -0.5);
              ellipse(ctx, x + 3, ly - 1, 3.5 * scale, 1.3, leaf, 0.5);
            }
            if (blooming) for (let f = 0; f < 5; f++) blob(ctx, x + (r() - 0.5) * 2, y - h - f * 2.2, 1.8, lk.flower, 0.3);
          } else {
            for (let l = 0; l < 5; l++) {
              const a = r() * Math.PI * 2;
              ellipse(ctx, x + Math.cos(a) * 3 * scale, y - 2 + Math.sin(a) * 2 * scale, 3.2 * scale, 1.6 * scale, shade(leaf, (r() - 0.5) * 0.25), a);
            }
            if (blooming) {
              const h = (6 + r() * 5) * scale;
              line(ctx, x, y - 2, x + 1, y - h, shade(leaf, -0.15), 1);
              if (p.key === 'yarrow') { for (let f = 0; f < 6; f++) blob(ctx, x + 1 + (r() - 0.5) * 5, y - h + (r() - 0.5) * 2, 1.4, lk.flower, 0.2); }
              else if (p.key === 'camas' || p.key === 'lupine') { for (let f = 0; f < 5; f++) blob(ctx, x + 1 + (r() - 0.5) * 2.5, y - h - f * 2, 1.7, shade(lk.flower, f * 0.05), 0.3); }
              else for (let f = 0; f < 3; f++) blob(ctx, x + (r() - 0.5) * 6, y - h + (r() - 0.5) * 3, 2, lk.flower, 0.3);
            }
          }
        }
        break;
      }
      case 'fern': {
        const n = [1, 2, 3][bucket];
        for (let k = 0; k < n; k++) {
          const x = O + 12 + r() * (SPR - 24), y = O + 20 + r() * (SPR - 28);
          ellipse(ctx, x, y + 2, 12 * scale, 4 * scale, rgba('#1a2a14', 0.3));
          const fronds = 8 + Math.floor(r() * 3);
          for (let f = 0; f < fronds; f++) {
            const a = -Math.PI / 2 + (f / (fronds - 1) - 0.5) * 2.8 + (r() - 0.5) * 0.2;
            const l = (14 + r() * 6) * scale;
            const ex = x + Math.cos(a) * l, ey = y + Math.sin(a) * l * 0.75;
            const col = shade(leaf, (r() - 0.4) * 0.3);
            ctx.strokeStyle = col; ctx.lineWidth = 1.2;
            ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo((x + ex) / 2, (y + ey) / 2 - 4 * scale, ex, ey + 3 * scale); ctx.stroke();
            for (let t2 = 0.2; t2 < 1; t2 += 0.14) {
              const lx = x + (ex - x) * t2, ly = y + (ey - y) * t2 - 3 * scale * Math.sin(t2 * Math.PI);
              const pa = a + Math.PI / 2;
              const ll = 3.2 * scale * (1 - t2 * 0.6);
              line(ctx, lx - Math.cos(pa) * ll, ly - Math.sin(pa) * ll, lx + Math.cos(pa) * ll, ly + Math.sin(pa) * ll, col, 1.4);
            }
          }
        }
        break;
      }
      case 'cattail': case 'tule': {
        const n = [4, 8, 13][bucket];
        for (let k = 0; k < n; k++) {
          const x = px(), y = py();
          const h = (16 + r() * 10) * scale;
          const col = shade(leaf, (r() - 0.5) * 0.25);
          if (lk.type === 'cattail') {
            for (let b = 0; b < 3; b++) {
              const lean = (r() - 0.5) * 6;
              ctx.strokeStyle = col; ctx.lineWidth = 2;
              ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(x + lean * 0.3, y - h * 0.6, x + lean, y - h * (0.8 + r() * 0.3)); ctx.stroke();
            }
            if (phase !== 'spring' && bucket > 0 && r() < 0.6) {
              line(ctx, x, y, x + 0.5, y - h * 1.15, shade(col, -0.2), 1);
              ctx.fillStyle = lk.head; ctx.beginPath(); ctx.roundRect(x - 1.8, y - h * 1.1, 3.6, 7 * scale, 2); ctx.fill();
            }
          } else {
            for (let b = 0; b < 4; b++) {
              const lean = (r() - 0.5) * 3;
              line(ctx, x + b - 1.5, y, x + b - 1.5 + lean, y - h * (0.85 + r() * 0.3), col, 1.3);
            }
            if (phase !== 'spring' && r() < 0.5) ellipse(ctx, x, y - h, 1.5, 2.5, '#7a5a3a');
          }
        }
        break;
      }
      case 'skunk': {
        const n = [1, 2, 3][bucket];
        for (let k = 0; k < n; k++) {
          const x = O + 14 + r() * (SPR - 28), y = O + 24 + r() * (SPR - 32);
          ellipse(ctx, x, y + 2, 12 * scale, 4 * scale, rgba('#1a2a14', 0.3));
          if (blooming) {
            ctx.fillStyle = lk.flower; ctx.beginPath();
            ctx.ellipse(x, y - 8 * scale, 3.5 * scale, 8 * scale, 0, 0, Math.PI * 2); ctx.fill();
            ellipse(ctx, x + 1, y - 7 * scale, 1.2, 4 * scale, '#b89a2a');
          }
          if (phase !== 'winter' || !blooming) for (let l = 0; l < 5; l++) {
            const a = -Math.PI / 2 + (l - 2) * 0.55;
            ellipse(ctx, x + Math.cos(a) * 8 * scale, y + Math.sin(a) * 7 * scale, 4.5 * scale, 9 * scale, shade(leaf, (l % 2) * 0.1), a + Math.PI / 2);
          }
        }
        break;
      }
    }
    return c;
  });
}
export const GROUND_PAD = GPAD;

// ---------------------------------------------------------------- shrubs
function crown(ctx, cx, cy, rx, ry, n, color, r, opts = {}) {
  ellipse(ctx, cx, cy + ry * 0.1, rx * 0.95, ry * 0.9, shade(color, -0.35));
  for (let k = 0; k < n; k++) {
    const a = r() * Math.PI * 2, d = Math.sqrt(r());
    const x = cx + Math.cos(a) * rx * d * 0.8, y = cy + Math.sin(a) * ry * d * 0.8;
    const br = (opts.blobR || Math.min(rx, ry) * 0.45) * (0.7 + r() * 0.5);
    const nx = (x - cx) / rx, ny = (y - cy) / ry;
    const col = shade(opts.vary ? mix(color, opts.vary, r() * 0.35) : color, -0.2 * (nx + ny) + (r() - 0.5) * 0.08);
    blob(ctx, x, y, br, col);
  }
}
function dots(ctx, cx, cy, rx, ry, n, color, r, size = 2) {
  for (let k = 0; k < n; k++) {
    const a = r() * Math.PI * 2, d = Math.sqrt(r());
    blob(ctx, cx + Math.cos(a) * rx * d, cy + Math.sin(a) * ry * d, size * (0.8 + r() * 0.4), color, 0.35);
  }
}
function twigs(ctx, x, y, len, ang, depth, color, r, w = 1.5) {
  if (depth <= 0 || len < 2) return;
  const ex = x + Math.cos(ang) * len, ey = y + Math.sin(ang) * len;
  line(ctx, x, y, ex, ey, color, w);
  const n = 2;
  for (let k = 0; k < n; k++) twigs(ctx, ex, ey, len * (0.62 + r() * 0.15), ang + (k ? 1 : -1) * (0.35 + r() * 0.35), depth - 1, color, r, Math.max(0.7, w * 0.7));
}

export const SHRUB_W = 112, SHRUB_H = 104, SHRUB_AX = 56, SHRUB_AY = 92;
export function shrubSprite(id, bucket, month, v) {
  const p = PLANTS[id];
  const phase = plantPhase(p, month);
  return cached(`s${id}|${bucket}|${phase}|${v}`, () => {
    const [c, ctx] = mk(SHRUB_W, SHRUB_H);
    const r = mulberry32(hashStr(`shrub${id}${v}${bucket}`));
    const lk = p.look;
    const s = [0.45, 0.72, 1][bucket] * (lk.small ? 0.8 : 1);
    const cx = SHRUB_AX, by = SHRUB_AY;
    const bare = lk.deciduous && phase === 'winter';
    let leaf = lk.leaf;
    if (phase === 'spring') leaf = shade(leaf, 0.15);
    if (phase === 'fall' && lk.fall) leaf = lk.fall;
    ellipse(ctx, cx, by, 26 * s, 8 * s, 'rgba(20,30,10,0.28)');
    const W = (lk.type === 'bramble' ? 36 : lk.type === 'salal' ? 30 : 26) * s;
    const Hh = (lk.type === 'bramble' ? 26 : lk.type === 'salal' ? 16 : lk.type === 'willow' ? 38 : 28) * s;
    const cy = by - Hh * 0.75;
    switch (lk.type) {
      case 'bramble': {
        crown(ctx, cx, cy + 4 * s, W, Hh * 0.7, 30, leaf, r, { blobR: 9 * s, vary: '#6f8f3a' });
        for (let k = 0; k < 7; k++) {
          const x0 = cx + (r() - 0.5) * W * 1.6, y0 = by - 2;
          const h = (18 + r() * 14) * s, dir = r() < 0.5 ? -1 : 1;
          ctx.strokeStyle = '#8a4a4a'; ctx.lineWidth = 1.3 * s + 0.4;
          ctx.beginPath(); ctx.moveTo(x0, y0); ctx.quadraticCurveTo(x0 + dir * 8 * s, y0 - h * 1.3, x0 + dir * 22 * s, y0 - h * 0.2); ctx.stroke();
        }
        if (phase === 'bloom') dots(ctx, cx, cy, W * 0.9, Hh * 0.55, 18, lk.flower, r, 2.2);
        if (phase === 'fruit') { dots(ctx, cx, cy, W * 0.9, Hh * 0.55, 18, lk.berry, r, 2.2); dots(ctx, cx, cy, W * 0.9, Hh * 0.55, 6, '#b8302a', r, 1.8); }
        break;
      }
      case 'broom': {
        for (let k = 0; k < 26; k++) {
          const x0 = cx + (r() - 0.5) * 10 * s, a = -Math.PI / 2 + (r() - 0.5) * 1.2, l = (20 + r() * 16) * s;
          line(ctx, x0, by - 2, x0 + Math.cos(a) * l, by - 2 + Math.sin(a) * l, shade(leaf, (r() - 0.5) * 0.3), 1.6);
        }
        if (phase === 'bloom') dots(ctx, cx, by - 22 * s, 16 * s, 14 * s, 40, lk.flower, r, 1.9);
        break;
      }
      case 'willow': {
        if (bare) {
          for (let k = 0; k < 14; k++) {
            const x0 = cx + (r() - 0.5) * 10 * s, a = -Math.PI / 2 + (r() - 0.5) * 0.9, l = (26 + r() * 16) * s;
            line(ctx, x0, by - 2, x0 + Math.cos(a) * l, by - 2 + Math.sin(a) * l, '#b8883a', 1.5);
          }
          break;
        }
        for (let k = 0; k < 10; k++) {
          const x0 = cx + (r() - 0.5) * 8 * s, a = -Math.PI / 2 + (r() - 0.5) * 0.8, l = (30 + r() * 12) * s;
          line(ctx, x0, by - 2, x0 + Math.cos(a) * l, by - 2 + Math.sin(a) * l, '#7a6a4a', 1.3);
        }
        crown(ctx, cx, cy, W * 0.8, Hh * 0.6, 16, leaf, r, { blobR: 7 * s, vary: '#b8c8a8' });
        for (let k = 0; k < 40; k++) {
          const a = r() * Math.PI * 2, d = Math.sqrt(r());
          const x = cx + Math.cos(a) * W * 0.8 * d, y = cy + Math.sin(a) * Hh * 0.6 * d;
          ellipse(ctx, x, y, 3.5 * s + 0.5, 1 * s + 0.4, shade(leaf, 0.25 - r() * 0.3), -1.2 + r() * 0.4);
        }
        break;
      }
      case 'holly': case 'salal': {
        crown(ctx, cx, cy, W, Hh * 0.75, lk.type === 'salal' ? 22 : 16, leaf, r, { blobR: (lk.type === 'salal' ? 7 : 8) * s });
        for (let k = 0; k < 22; k++) {
          const a = r() * Math.PI * 2, d = Math.sqrt(r());
          ellipse(ctx, cx + Math.cos(a) * W * d * 0.85, cy + Math.sin(a) * Hh * 0.6 * d, 1.8 * s + 0.4, 1 * s + 0.3, 'rgba(255,255,255,0.28)', a);
        }
        if (phase === 'bloom') dots(ctx, cx, cy - 2 * s, W * 0.8, Hh * 0.5, 12, lk.flower, r, 2.4);
        if (phase === 'fruit') dots(ctx, cx, cy, W * 0.8, Hh * 0.5, 14, lk.berry, r, 2);
        break;
      }
      case 'vinemaple': {
        if (bare) { for (let k = 0; k < 5; k++) twigs(ctx, cx + (r() - 0.5) * 8, by - 2, 16 * s, -Math.PI / 2 + (r() - 0.5) * 1.6, 4, '#6a5a3a', r, 2); break; }
        for (let k = 0; k < 5; k++) line(ctx, cx + (r() - 0.5) * 8, by - 2, cx + (r() - 0.5) * W * 1.4, cy + (r() - 0.5) * 6, '#6a5a3a', 1.6);
        for (let tier = 0; tier < 3; tier++) {
          const ty = cy + (1 - tier) * 9 * s;
          crown(ctx, cx + (r() - 0.5) * 10 * s, ty, W * (1 - tier * 0.15), 7 * s, 10, shade(leaf, tier * 0.06), r, { blobR: 6 * s, vary: phase === 'fall' ? '#e8a030' : null });
        }
        break;
      }
      default: {
        // generic deciduous or evergreen shrub
        if (bare) {
          const col = lk.type === 'dogwood' ? lk.stem : '#7a6a52';
          for (let k = 0; k < 6; k++) twigs(ctx, cx + (r() - 0.5) * 10 * s, by - 1, 12 * s, -Math.PI / 2 + (r() - 0.5) * 1.5, 4, col, r, 1.8);
          if (lk.fruit && lk.fruit.some(m => m >= 8)) dots(ctx, cx, cy, W * 0.8, Hh * 0.5, 10, lk.berry, r, 2);
          break;
        }
        for (let k = 0; k < 5; k++) line(ctx, cx + (r() - 0.5) * 8, by - 1, cx + (r() - 0.5) * W, cy, lk.type === 'dogwood' ? lk.stem : '#6a5a42', 1.4);
        const n = lk.airy ? 12 : 18;
        crown(ctx, cx, cy, W, Hh * 0.7, n, leaf, r, { blobR: (lk.airy ? 6 : 9) * s, vary: phase === 'fall' ? '#d8a040' : null });
        if (lk.plume && phase === 'bloom') {
          for (let k = 0; k < 9; k++) {
            const x = cx + (r() - 0.5) * W * 1.5, y = cy + (r() - 0.6) * Hh * 0.8;
            ctx.fillStyle = lk.flower; ctx.beginPath(); ctx.ellipse(x, y + 4 * s, 3 * s, 7 * s, (r() - 0.5) * 0.6, 0, Math.PI * 2); ctx.fill();
          }
        } else if (phase === 'bloom' && lk.flower) dots(ctx, cx, cy - 2, W * 0.85, Hh * 0.55, 14, lk.flower, r, 2.4);
        if (phase === 'fruit' && lk.berry) dots(ctx, cx, cy, W * 0.85, Hh * 0.55, 16, lk.berry, r, 2.1);
      }
    }
    return c;
  });
}

// ---------------------------------------------------------------- trees
export const TREE_W = 176, TREE_H = 272, TREE_AX = 88, TREE_AY = 260;
const TREE_SCALE = [0.32, 0.55, 0.78, 1];

function trunk(ctx, cx, by, w, h, color, flare = 0) {
  const g = ctx.createLinearGradient(cx - w, 0, cx + w, 0);
  g.addColorStop(0, shade(color, 0.15)); g.addColorStop(0.5, color); g.addColorStop(1, shade(color, -0.35));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(cx - w * 0.5 - flare, by);
  ctx.quadraticCurveTo(cx - w * 0.45, by - h * 0.3, cx - w * 0.35, by - h);
  ctx.lineTo(cx + w * 0.35, by - h);
  ctx.quadraticCurveTo(cx + w * 0.45, by - h * 0.3, cx + w * 0.5 + flare, by);
  ctx.closePath(); ctx.fill();
}

function coniferTiers(ctx, cx, by, s, r, o) {
  const H = o.height * s, W = o.width * s, n = o.tiers;
  const trunkH = H * 0.12;
  trunk(ctx, cx, by, 9 * s + 2, trunkH + 20 * s, o.bark, o.flare ? 4 * s : 0);
  const top = by - H;
  for (let k = 0; k < n; k++) {
    const t = k / n;
    const ty = by - trunkH - (H - trunkH) * t * 0.92;
    const hw = W * Math.pow(1 - t, 0.95) + 3 * s;
    const th = (H - trunkH) / n * 1.9;
    const col = shade(o.leaf, t * 0.12 + (r() - 0.5) * 0.06);
    const g = ctx.createLinearGradient(cx - hw, 0, cx + hw, 0);
    g.addColorStop(0, shade(col, 0.16)); g.addColorStop(0.45, col); g.addColorStop(1, shade(col, -0.32));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(cx, ty - th);
    const droop = o.droop * s;
    ctx.quadraticCurveTo(cx - hw * 0.4, ty - th * 0.45, cx - hw, ty + droop);
    const teeth = 5;
    for (let q = 1; q <= teeth; q++) {
      const x = cx - hw + (2 * hw) * q / teeth;
      const up = (q % 2 ? 3.5 : 0) * s + r() * 2 * s;
      ctx.lineTo(x - hw / teeth, ty + droop * (1 - Math.abs(q / teeth - 0.5)) + 2 * s - up);
      ctx.lineTo(x, ty + droop * (q === teeth ? 1 : 0.6));
    }
    ctx.quadraticCurveTo(cx + hw * 0.4, ty - th * 0.45, cx, ty - th);
    ctx.fill();
    // bough texture
    for (let q = 0; q < 5; q++) {
      const x = cx - hw * 0.8 + r() * hw * 1.6, y = ty - r() * th * 0.5;
      line(ctx, x, y, x + (x < cx ? -4 : 4) * s, y + 3 * s, rgba(shade(col, -0.35), 0.5), 1);
    }
  }
  if (o.leader) {
    ctx.strokeStyle = shade(o.leaf, 0.1); ctx.lineWidth = 2.5 * s + 0.5; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(cx, top + 14 * s); ctx.quadraticCurveTo(cx + 2 * s, top - 2 * s, cx + 8 * s, top + 2 * s); ctx.stroke();
  }
}

function broadleaf(ctx, cx, by, s, r, o, phase, p) {
  const lk = p.look;
  const H = o.height * s, rx = o.rx * s, ry = o.ry * s;
  const cy = by - H + ry;
  const bark = lk.bark;
  const trunkTop = cy + ry * 0.35;
  trunk(ctx, cx, by, o.trunkW * s + 2, by - trunkTop, bark, 3 * s);
  if (o.whiteBark) for (let k = 0; k < 6; k++) ellipse(ctx, cx + (r() - 0.5) * o.trunkW * s * 0.6, by - r() * (by - trunkTop), 2 * s + 0.5, 1 * s + 0.3, '#4a4a42');
  if (phase === 'winter') {
    for (let k = 0; k < 6; k++) {
      const a = -Math.PI / 2 + (k - 2.5) * 0.32 + (r() - 0.5) * 0.2;
      twigs(ctx, cx, trunkTop + 4 * s, ry * 0.55, a, 5, shade(bark, -0.1), r, 3.5 * s + 0.5);
    }
    return;
  }
  // main limbs
  for (let k = 0; k < 4; k++) line(ctx, cx, trunkTop + 6 * s, cx + (r() - 0.5) * rx * 1.2, cy + (r() - 0.3) * ry * 0.6, shade(bark, -0.1), 3 * s + 0.5);
  let leaf = lk.leaf, vary = null;
  if (phase === 'spring') leaf = mix(lk.leaf, '#b6d77a', 0.45);
  else if (phase === 'late') leaf = mix(lk.leaf, '#6d7d3a', 0.15);
  else if (phase === 'fall') { leaf = lk.fall; vary = lk.leaf; }
  const lobes = o.lobes || 1;
  for (let l = 0; l < lobes; l++) {
    const lx = cx + (lobes > 1 ? (l / (lobes - 1) - 0.5) * rx * 0.9 : 0);
    const ly = cy + (lobes > 1 ? (r() - 0.3) * ry * 0.4 : 0);
    crown(ctx, lx, ly, rx / (lobes > 1 ? 1.6 : 1), ry / (lobes > 1 ? 1.25 : 1), Math.round(o.blobs / lobes), leaf, r, { blobR: o.blobR * s, vary });
  }
  if (phase === 'fall') for (let k = 0; k < 8; k++) ellipse(ctx, cx + (r() - 0.5) * rx * 2.4, by - r() * 4, 2 * s + 0.5, 1 * s + 0.4, rgba(lk.fall, 0.8));
}

const BROAD = {
  alder: { height: 160, rx: 34, ry: 52, trunkW: 9, blobs: 26, blobR: 14, whiteBark: true },
  cottonwood: { height: 220, rx: 36, ry: 82, trunkW: 12, blobs: 36, blobR: 15 },
  maple: { height: 170, rx: 60, ry: 52, trunkW: 13, blobs: 34, blobR: 17, lobes: 3 },
  ash: { height: 150, rx: 42, ry: 46, trunkW: 10, blobs: 26, blobR: 14 },
  oak: { height: 140, rx: 62, ry: 42, trunkW: 14, blobs: 32, blobR: 13, lobes: 4 },
};

export function treeSprite(id, bucket, month, v) {
  const p = PLANTS[id];
  const phase = p.conifer ? (month >= 9 || month === 11 ? 'winter' : 'green') : plantPhase(p, month);
  return cached(`tr${id}|${bucket}|${phase}|${v}`, () => {
    const [c, ctx] = mk(TREE_W, TREE_H);
    const r = mulberry32(hashStr(`tree${id}${v}${bucket}`));
    const s = TREE_SCALE[bucket] * (0.9 + r() * 0.2);
    const cx = TREE_AX, by = TREE_AY;
    const lk = p.look;
    const leaf = phase === 'winter' && p.conifer ? shade(lk.leaf, -0.08) : lk.leaf;
    switch (lk.type) {
      case 'fir': coniferTiers(ctx, cx, by, s, r, { height: 230, width: 44, tiers: 8, leaf, bark: lk.bark, droop: 3, leader: false }); break;
      case 'cedar': coniferTiers(ctx, cx, by, s, r, { height: 200, width: 52, tiers: 7, leaf, bark: lk.bark, droop: 9, flare: true }); break;
      case 'hemlock': coniferTiers(ctx, cx, by, s, r, { height: 215, width: 40, tiers: 9, leaf, bark: lk.bark, droop: 6, leader: true }); break;
      default: broadleaf(ctx, cx, by, s, r, BROAD[lk.type], phase, p);
    }
    return c;
  });
}

// Shadow blob drawn under tall things.
export function shadowSprite() {
  return cached('shadow', () => {
    const [c, ctx] = mk(128, 64);
    const g = ctx.createRadialGradient(64, 32, 4, 64, 32, 62);
    g.addColorStop(0, 'rgba(15,25,10,0.42)'); g.addColorStop(1, 'rgba(15,25,10,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(64, 32, 62, 30, 0, 0, Math.PI * 2); ctx.fill();
    return c;
  });
}

// ---------------------------------------------------------------- features
export const FEAT_W = 96, FEAT_H = 160, FEAT_AX = 48, FEAT_AY = 148;
export function featureSprite(f, v) {
  return cached(`f${f}|${v}`, () => {
    const [c, ctx] = mk(FEAT_W, FEAT_H);
    const r = mulberry32(hashStr(`feat${f}${v}`));
    const cx = FEAT_AX, by = FEAT_AY;
    switch (f) {
      case F.SNAG: {
        ellipse(ctx, cx, by, 16, 5, 'rgba(20,20,10,0.3)');
        const h = 105 + r() * 25;
        const g = ctx.createLinearGradient(cx - 8, 0, cx + 8, 0);
        g.addColorStop(0, '#b8b0a2'); g.addColorStop(0.5, '#948a7c'); g.addColorStop(1, '#5e564c');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.moveTo(cx - 10, by); ctx.lineTo(cx - 6, by - h + 12); ctx.lineTo(cx - 3, by - h); ctx.lineTo(cx, by - h + 8);
        ctx.lineTo(cx + 3, by - h + 3); ctx.lineTo(cx + 6, by - h + 14); ctx.lineTo(cx + 10, by); ctx.closePath(); ctx.fill();
        line(ctx, cx - 5, by - h * 0.55, cx - 20, by - h * 0.62, '#857b6d', 3);
        line(ctx, cx + 5, by - h * 0.72, cx + 16, by - h * 0.8, '#857b6d', 2.5);
        ellipse(ctx, cx, by - h * 0.45, 2.5, 4, '#2a241e');
        ellipse(ctx, cx + 1, by - h * 0.3, 2.2, 3.5, '#2a241e');
        for (let k = 0; k < 8; k++) line(ctx, cx - 5 + r() * 10, by - r() * h, cx - 5 + r() * 10, by - r() * h, 'rgba(60,50,40,0.4)', 1);
        break;
      }
      case F.LOG: {
        ctx.save(); ctx.translate(cx, by - 8); ctx.rotate((r() - 0.5) * 0.4);
        ellipse(ctx, 0, 8, 38, 7, 'rgba(20,20,10,0.3)');
        const g = ctx.createLinearGradient(0, -8, 0, 8);
        g.addColorStop(0, '#8a6a4a'); g.addColorStop(0.5, '#6a4e36'); g.addColorStop(1, '#3e2e20');
        ctx.fillStyle = g; ctx.beginPath(); ctx.roundRect(-36, -8, 72, 16, 7); ctx.fill();
        ctx.fillStyle = '#6f8f3a'; ctx.beginPath(); ctx.ellipse(-6, -6, 26, 4, 0, Math.PI, 0); ctx.fill();
        ellipse(ctx, 36, 0, 5, 8, '#b8986a'); ellipse(ctx, 36, 0, 3, 5, '#9a7a52');
        for (let k = 0; k < 5; k++) line(ctx, -30 + k * 14, -3, -22 + k * 14, 2, 'rgba(40,30,20,0.4)', 1);
        ctx.restore();
        break;
      }
      case F.ROCKS: {
        ellipse(ctx, cx, by - 2, 28, 7, 'rgba(20,20,10,0.3)');
        for (let k = 0; k < 6; k++) {
          const x = cx + (r() - 0.5) * 36, y = by - 6 - r() * 10, rr = 7 + r() * 7;
          blob(ctx, x, y, rr, shade('#8d8a84', (r() - 0.5) * 0.3), 0.3);
        }
        break;
      }
      case F.BRUSH: {
        ellipse(ctx, cx, by - 2, 28, 7, 'rgba(20,20,10,0.3)');
        ellipse(ctx, cx, by - 10, 24, 12, '#5a4632');
        for (let k = 0; k < 34; k++) {
          const a = r() * Math.PI, l = 10 + r() * 18;
          const x = cx + (r() - 0.5) * 36, y = by - 4 - r() * 18;
          line(ctx, x - Math.cos(a) * l / 2, y - Math.sin(a) * l / 4, x + Math.cos(a) * l / 2, y + Math.sin(a) * l / 4, shade('#7a5e40', (r() - 0.5) * 0.5), 2);
        }
        break;
      }
      case F.BOARDWALK: {
        for (let k = 0; k < 7; k++) { ctx.fillStyle = k % 2 ? '#b08a5e' : '#9a7a52'; ctx.fillRect(cx - 34, by - 40 + k * 7, 68, 6); }
        ctx.fillStyle = '#6a5238'; ctx.fillRect(cx - 34, by - 42, 4, 50); ctx.fillRect(cx + 30, by - 42, 4, 50);
        break;
      }
      case F.BLIND: {
        ellipse(ctx, cx, by, 30, 7, 'rgba(20,20,10,0.3)');
        ctx.fillStyle = '#7d6448'; ctx.fillRect(cx - 26, by - 44, 52, 44);
        ctx.fillStyle = '#4f6a3a'; ctx.beginPath(); ctx.moveTo(cx - 32, by - 42); ctx.lineTo(cx + 32, by - 50); ctx.lineTo(cx + 32, by - 56); ctx.lineTo(cx - 32, by - 48); ctx.fill();
        ctx.fillStyle = '#181410'; ctx.fillRect(cx - 18, by - 32, 36, 6);
        break;
      }
      case F.NESTBOX: {
        ellipse(ctx, cx, by, 8, 3, 'rgba(20,20,10,0.3)');
        ctx.fillStyle = '#7a5e42'; ctx.fillRect(cx - 2.5, by - 70, 5, 70);
        ctx.fillStyle = '#b08a5e'; ctx.fillRect(cx - 9, by - 92, 18, 24);
        ctx.fillStyle = '#6a4a30'; ctx.beginPath(); ctx.moveTo(cx - 12, by - 91); ctx.lineTo(cx, by - 99); ctx.lineTo(cx + 12, by - 91); ctx.fill();
        ellipse(ctx, cx, by - 84, 3.5, 3.5, '#241a12');
        break;
      }
    }
    return c;
  });
}

// ---------------------------------------------------------------- structures
export function structureSprite(type, w, h) {
  return cached(`st${type}`, () => {
    const W = w * SPR + 24, Hh = (h + 2) * SPR;
    const [c, ctx] = mk(W, Hh);
    const r = mulberry32(hashStr(type));
    const x0 = 12, by = Hh - 4, fw = w * SPR;
    ellipse(ctx, x0 + fw / 2, by - 8, fw * 0.55, 18, 'rgba(20,20,10,0.25)');
    const boards = (x, y, ww, hh, col, vertical = true, gap = 8) => {
      ctx.fillStyle = col; ctx.fillRect(x, y, ww, hh);
      ctx.strokeStyle = rgba(shade(col, -0.35), 0.6); ctx.lineWidth = 1;
      if (vertical) for (let k = x + gap; k < x + ww; k += gap) { ctx.beginPath(); ctx.moveTo(k, y); ctx.lineTo(k, y + hh); ctx.stroke(); }
      else for (let k = y + gap; k < y + hh; k += gap) { ctx.beginPath(); ctx.moveTo(x, k); ctx.lineTo(x + ww, k); ctx.stroke(); }
      for (let k = 0; k < ww * hh / 400; k++) { ctx.fillStyle = rgba(r() < 0.5 ? '#000000' : '#ffffff', 0.06); ctx.fillRect(x + r() * ww, y + r() * hh, 3 + r() * 8, 2 + r() * 4); }
    };
    switch (type) {
      case 'barn': {
        const wallH = 120, wallY = by - wallH;
        boards(x0, wallY, fw, wallH, '#94392d');
        // gambrel roof
        const roofTop = 22;
        ctx.fillStyle = '#4b4a4c';
        ctx.beginPath();
        ctx.moveTo(x0 - 8, wallY + 4); ctx.lineTo(x0 + 18, wallY - 60); ctx.lineTo(x0 + fw / 2, roofTop);
        ctx.lineTo(x0 + fw - 18, wallY - 60); ctx.lineTo(x0 + fw + 8, wallY + 4); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#5c5a5c';
        ctx.beginPath(); ctx.moveTo(x0 + 18, wallY - 60); ctx.lineTo(x0 + fw / 2, roofTop); ctx.lineTo(x0 + fw / 2, wallY - 20); ctx.closePath(); ctx.fill();
        for (let k = 0; k < 7; k++) ellipse(ctx, x0 + 20 + r() * (fw - 40), wallY - 50 + r() * 50, 6 + r() * 10, 3 + r() * 4, rgba('#8a5a3a', 0.6));
        ctx.fillStyle = '#2a2624'; ctx.fillRect(x0 + fw * 0.6, wallY - 44, 26, 12); // hole in roof
        // gable face
        boards(x0 + 24, wallY - 50, fw - 48, 50, '#8a352a');
        ctx.fillStyle = '#f0ebe0'; ctx.fillRect(x0 + fw / 2 - 16, wallY - 42, 32, 30);
        ctx.fillStyle = '#3a2a22'; ctx.fillRect(x0 + fw / 2 - 12, wallY - 38, 24, 22);
        // big doors
        const dw = 70, dx = x0 + fw / 2 - dw / 2, dy = by - 84;
        ctx.fillStyle = '#6e2a22'; ctx.fillRect(dx, dy, dw, 80);
        ctx.strokeStyle = '#efe8da'; ctx.lineWidth = 4;
        ctx.strokeRect(dx, dy, dw, 80);
        ctx.beginPath(); ctx.moveTo(dx, dy); ctx.lineTo(dx + dw / 2, dy + 80); ctx.moveTo(dx + dw / 2, dy); ctx.lineTo(dx, dy + 80);
        ctx.moveTo(dx + dw / 2, dy); ctx.lineTo(dx + dw, dy + 80); ctx.moveTo(dx + dw, dy); ctx.lineTo(dx + dw / 2, dy + 80);
        ctx.moveTo(dx + dw / 2, dy); ctx.lineTo(dx + dw / 2, dy + 80); ctx.stroke();
        ctx.fillStyle = '#1e1a18'; ctx.fillRect(x0 + 30, wallY + 30, 10, 26); ctx.fillRect(x0 + fw - 60, wallY + 50, 8, 30);
        break;
      }
      case 'house': {
        const wallH = 84, wallY = by - wallH;
        boards(x0, wallY, fw, wallH, '#d4cebd', false, 7);
        ctx.fillStyle = '#56463f';
        ctx.beginPath(); ctx.moveTo(x0 - 10, wallY + 6); ctx.lineTo(x0 + fw / 2, wallY - 74); ctx.lineTo(x0 + fw + 10, wallY + 6); ctx.closePath(); ctx.fill();
        for (let k = 0; k < 40; k++) { ctx.fillStyle = rgba(r() < 0.6 ? '#3a2e2a' : '#7a8a4a', 0.5); ctx.fillRect(x0 + r() * fw, wallY - 60 + r() * 60, 8, 3); }
        ctx.fillStyle = '#8a4a3a'; ctx.fillRect(x0 + fw * 0.7, wallY - 70, 14, 34);
        const win = (x, y, broken) => {
          ctx.fillStyle = '#efe8da'; ctx.fillRect(x - 2, y - 2, 24, 30);
          ctx.fillStyle = broken ? '#1c1a1a' : '#3a4a58'; ctx.fillRect(x, y, 20, 26);
          if (broken) { ctx.fillStyle = '#8a6a4a'; ctx.save(); ctx.translate(x + 10, y + 13); ctx.rotate(0.4); ctx.fillRect(-14, -3, 28, 6); ctx.restore(); }
          else { line(ctx, x + 10, y, x + 10, y + 26, '#efe8da', 2); line(ctx, x, y + 13, x + 20, y + 13, '#efe8da', 2); }
        };
        win(x0 + 18, wallY + 20, false); win(x0 + fw - 40, wallY + 20, true);
        ctx.fillStyle = '#5a4030'; ctx.fillRect(x0 + fw / 2 - 12, by - 52, 24, 50);
        // sagging porch
        ctx.fillStyle = '#7a6a58';
        ctx.beginPath(); ctx.moveTo(x0 + 40, by - 58); ctx.lineTo(x0 + fw - 40, by - 54); ctx.lineTo(x0 + fw - 36, by - 48); ctx.lineTo(x0 + 36, by - 52); ctx.fill();
        line(ctx, x0 + 44, by - 52, x0 + 44, by, '#6a5a48', 3); line(ctx, x0 + fw - 44, by - 50, x0 + fw - 42, by, '#6a5a48', 3);
        break;
      }
      case 'silo': {
        const cx = x0 + fw / 2, rw = fw * 0.42, top = 30;
        const g = ctx.createLinearGradient(cx - rw, 0, cx + rw, 0);
        g.addColorStop(0, '#d4cfc2'); g.addColorStop(0.4, '#b6b1a4'); g.addColorStop(1, '#6e6a60');
        ctx.fillStyle = g; ctx.fillRect(cx - rw, top + 20, rw * 2, by - top - 26);
        ellipse(ctx, cx, by - 6, rw, 8, '#6e6a60');
        for (let y = top + 34; y < by - 10; y += 16) line(ctx, cx - rw, y, cx + rw, y, 'rgba(60,55,50,0.5)', 2);
        for (let k = 0; k < 6; k++) ellipse(ctx, cx - rw + r() * rw * 2, top + 30 + r() * (by - top - 40), 3, 8 + r() * 10, rgba('#8a5a3a', 0.5));
        const dg = ctx.createRadialGradient(cx - rw * 0.3, top + 10, 2, cx, top + 20, rw);
        dg.addColorStop(0, '#b0784a'); dg.addColorStop(1, '#6a4028');
        ctx.fillStyle = dg; ctx.beginPath(); ctx.ellipse(cx, top + 22, rw, rw * 0.7, 0, Math.PI, 0); ctx.fill();
        break;
      }
      case 'shed': {
        const wallH = 64, wallY = by - wallH;
        boards(x0, wallY, fw, wallH, '#7d7466');
        ctx.fillStyle = '#9aa0a2';
        ctx.beginPath(); ctx.moveTo(x0 - 8, wallY + 4); ctx.lineTo(x0 + 4, wallY - 34); ctx.lineTo(x0 + fw + 4, wallY - 24); ctx.lineTo(x0 + fw + 8, wallY + 4); ctx.closePath(); ctx.fill();
        for (let k = x0; k < x0 + fw; k += 9) line(ctx, k, wallY - 30 + (k - x0) * 0.08, k + 2, wallY + 2, 'rgba(90,70,60,0.45)', 2);
        ctx.fillStyle = '#2a2622'; ctx.fillRect(x0 + 20, by - 50, 50, 48);
        break;
      }
      case 'tractor': {
        const cx = x0 + fw / 2 + 4;
        const wheel = (x, y, rr) => {
          ellipse(ctx, x, y, rr, rr, '#1e1c1a');
          ctx.strokeStyle = '#3a3632'; ctx.lineWidth = 2;
          for (let k = 0; k < 10; k++) { const a = k / 10 * Math.PI * 2; line(ctx, x + Math.cos(a) * rr * 0.75, y + Math.sin(a) * rr * 0.75, x + Math.cos(a) * rr, y + Math.sin(a) * rr, '#3a3632', 2); }
          ellipse(ctx, x, y, rr * 0.45, rr * 0.45, '#9a8a2a');
        };
        ellipse(ctx, cx, by - 4, 34, 7, 'rgba(20,20,10,0.3)');
        ctx.fillStyle = '#a8382a'; ctx.fillRect(cx - 18, by - 40, 42, 20);
        ctx.fillStyle = '#8a2e22'; ctx.fillRect(cx - 22, by - 54, 16, 22);
        line(ctx, cx + 14, by - 40, cx + 14, by - 62, '#2a2622', 3);
        for (let k = 0; k < 6; k++) ellipse(ctx, cx - 18 + r() * 42, by - 40 + r() * 20, 3 + r() * 3, 2, rgba('#6a3a1a', 0.7));
        wheel(cx - 14, by - 20, 18); wheel(cx + 22, by - 12, 10);
        for (let k = 0; k < 8; k++) line(ctx, cx - 30 + r() * 60, by, cx - 30 + r() * 60 + (r() - 0.5) * 4, by - 8 - r() * 10, '#7a8a4a', 1.5);
        break;
      }
    }
    return c;
  });
}

// ---------------------------------------------------------------- animals
export const ANIM_W = 128, ANIM_H = 112, ANIM_AX = 64, ANIM_AY = 96;

export function animalSprite(def, frame, dir, pose) {
  return cached(`a${def.key}|${frame}|${dir}|${pose}`, () => {
    const [c, ctx] = mk(ANIM_W, ANIM_H);
    ctx.translate(ANIM_AX, ANIM_AY);
    if (dir < 0) ctx.scale(-1, 1);
    drawAnimal(ctx, def.sprite, frame, pose);
    return c;
  });
}

// Large, crisp version for the field guide and inspector.
export function animalPortrait(def, scale = 4) {
  return cached(`ap${def.key}|${scale}`, () => {
    const [c, ctx] = mk(ANIM_W * scale, ANIM_H * scale);
    ctx.scale(scale, scale);
    ctx.translate(ANIM_AX, ANIM_AY);
    drawAnimal(ctx, def.sprite, 0, 'stand');
    return c;
  });
}

function legs(ctx, xs, top, len, color, frame, w = 2.5) {
  xs.forEach((x, k) => {
    const sw = (frame ? 1 : -1) * (k % 2 ? 1 : -1) * len * 0.22;
    ctx.strokeStyle = color; ctx.lineWidth = w; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(x, top); ctx.lineTo(x + sw * 0.5, top + len * 0.55); ctx.lineTo(x + sw, top + len); ctx.stroke();
  });
}

function drawAnimal(ctx, s, frame, pose) {
  const k = s.kind;
  const shadow = (rx) => ellipse(ctx, 0, 0, rx, rx * 0.25, 'rgba(10,15,5,0.3)');
  switch (k) {
    case 'deer': case 'canine': case 'feline': {
      const L = s.len, Hh = s.h, leg = s.leg;
      shadow(L * 0.55);
      const by = -leg - Hh / 2;
      legs(ctx, [L * 0.28, -L * 0.3], -leg - 2, leg + 2, shade(s.color, -0.3), frame, k === 'deer' ? 2.5 : 3);
      // tail
      if (k === 'canine') { ctx.fillStyle = shade(s.color, -0.1); ctx.beginPath(); ctx.ellipse(-L * 0.55, by + 3, 9, 4, 0.7, 0, Math.PI * 2); ctx.fill(); ellipse(ctx, -L * 0.62, by + 8, 3, 2.5, s.dark); }
      if (k === 'feline') {
        if (s.longtail) { ctx.strokeStyle = s.color; ctx.lineWidth = 3.5; ctx.beginPath(); ctx.moveTo(-L * 0.45, by - 2); ctx.quadraticCurveTo(-L * 0.8, by + 10, -L * 0.7, by + 16); ctx.stroke(); ellipse(ctx, -L * 0.7, by + 16, 2.5, 2.5, s.dark); }
        else ellipse(ctx, -L * 0.5, by - 3, 4, 3, s.color);
      }
      if (s.rump) ellipse(ctx, -L * 0.4, by, 7, Hh * 0.4, s.rump);
      ellipse(ctx, 0, by, L / 2, Hh / 2, s.color);
      ellipse(ctx, 0, by + Hh * 0.22, L * 0.4, Hh * 0.22, s.belly);
      if (k === 'feline' && !s.longtail) for (let q = 0; q < 6; q++) ellipse(ctx, -L * 0.3 + q * 4, by - 2 + (q % 2) * 4, 1.2, 1.2, s.dark);
      legs(ctx, [L * 0.36, -L * 0.22], -leg - 2, leg + 2, s.color, 1 - frame, k === 'deer' ? 2.5 : 3);
      if (k === 'deer') {
        ellipse(ctx, -L * 0.5, by - 2, 3, 4, s.dark);
        const nk = s.neck || s.color;
        ctx.fillStyle = nk;
        ctx.beginPath(); ctx.moveTo(L * 0.22, by - Hh * 0.3); ctx.lineTo(L * 0.42, by - Hh * 0.5 - 14); ctx.lineTo(L * 0.55, by - Hh * 0.45 - 12); ctx.lineTo(L * 0.45, by + 2); ctx.closePath(); ctx.fill();
        const hx = L * 0.55, hy = by - Hh * 0.5 - 14;
        ellipse(ctx, hx, hy, 6.5, 4.5, s.color, 0.35);
        ellipse(ctx, hx + 5, hy + 2.5, 3, 2.5, shade(s.color, -0.2), 0.3);
        ellipse(ctx, hx + 7, hy + 3, 1.2, 1.2, '#1a1410');
        ellipse(ctx, hx - 3, hy - 5, 2, 4.5, shade(s.color, -0.1), -0.5);
        ellipse(ctx, hx + 1.5, hy - 1.5, 1, 1, '#1a1410');
        if (s.antlers === 'elk') {
          ctx.strokeStyle = '#d8c8a8'; ctx.lineWidth = 2; ctx.lineCap = 'round';
          ctx.beginPath(); ctx.moveTo(hx - 1, hy - 4); ctx.quadraticCurveTo(hx - 10, hy - 18, hx - 18, hy - 22);
          for (const [tx, ty] of [[-6, -10], [-10, -15], [-14, -19]]) { ctx.moveTo(hx + tx, hy + ty); ctx.lineTo(hx + tx + 5, hy + ty - 7); }
          ctx.stroke();
        }
      } else {
        const hx = L * 0.52, hy = by - Hh * 0.35;
        ellipse(ctx, hx, hy, k === 'feline' ? 6.5 : 6, k === 'feline' ? 5.5 : 4.5, s.color);
        if (k === 'canine') { ellipse(ctx, hx + 6, hy + 1.5, 5, 2.5, s.color); ellipse(ctx, hx + 10, hy + 1, 1.3, 1.3, '#1a1410');
          ctx.fillStyle = s.color; ctx.beginPath(); ctx.moveTo(hx - 4, hy - 3); ctx.lineTo(hx - 2, hy - 10); ctx.lineTo(hx + 1, hy - 3); ctx.fill(); }
        else { ellipse(ctx, hx + 5, hy + 1.5, 2.5, 2, s.belly);
          ctx.fillStyle = s.color; ctx.beginPath(); ctx.moveTo(hx - 4, hy - 3); ctx.lineTo(hx - 3, hy - 9); ctx.lineTo(hx, hy - 4); ctx.fill();
          if (s.bobtail) { line(ctx, hx - 3, hy - 9, hx - 3, hy - 12, s.dark, 1); } }
        ellipse(ctx, hx + 2, hy - 1.5, 1.1, 1.1, '#1a1410');
      }
      break;
    }
    case 'bear': {
      const L = s.len, Hh = s.h, leg = s.leg;
      shadow(L * 0.55);
      const by = -leg - Hh / 2 + 2;
      legs(ctx, [L * 0.3, -L * 0.3], -leg - 2, leg + 2, shade(s.color, 0.1), frame, 6);
      ellipse(ctx, 0, by, L / 2, Hh / 2, s.color);
      ellipse(ctx, -L * 0.1, by - Hh * 0.35, L * 0.3, Hh * 0.2, shade(s.color, 0.08));
      legs(ctx, [L * 0.36, -L * 0.24], -leg - 2, leg + 2, s.color, 1 - frame, 6.5);
      const hx = L * 0.5, hy = by - 2;
      ellipse(ctx, hx, hy, 8, 7, s.color);
      ellipse(ctx, hx + 7, hy + 2, 4.5, 3.5, s.muzzle);
      ellipse(ctx, hx + 10, hy + 1, 1.5, 1.5, '#0a0806');
      ellipse(ctx, hx - 3, hy - 7, 3, 3, s.color);
      ellipse(ctx, hx + 2, hy - 2, 1.2, 1.2, '#d8c8a0');
      break;
    }
    case 'raccoon': case 'otter': case 'beaver': {
      const L = s.len;
      const swim = pose === 'swim';
      if (!swim) shadow(L * 0.5);
      const by = -7;
      if (k === 'raccoon') {
        for (let q = 0; q < 4; q++) { ctx.fillStyle = q % 2 ? s.dark : s.belly; ctx.beginPath(); ctx.ellipse(-L * 0.52 - q * 3, by - 2 + q * 1.5, 3.5, 4.5, 0.6, 0, Math.PI * 2); ctx.fill(); }
        legs(ctx, [L * 0.25, -L * 0.25], by + 2, 6, s.dark, frame, 3);
        ellipse(ctx, 0, by - 2, L * 0.45, 8, s.color);
        const hx = L * 0.45, hy = by - 3;
        ellipse(ctx, hx, hy, 6, 5, s.belly); ellipse(ctx, hx + 1, hy, 5, 2, s.dark);
        ellipse(ctx, hx + 6, hy + 1.5, 2.5, 1.8, s.belly); ellipse(ctx, hx + 8, hy + 1.5, 1, 1, '#0a0806');
        ellipse(ctx, hx - 3, hy - 5, 2, 2.5, s.color);
      } else if (k === 'otter') {
        ctx.fillStyle = s.color; ctx.beginPath(); ctx.moveTo(-L * 0.35, by - 3); ctx.quadraticCurveTo(-L * 0.7, by, -L * 0.8, by + 4); ctx.lineTo(-L * 0.35, by + 4); ctx.fill();
        if (!swim) legs(ctx, [L * 0.25, -L * 0.2], by + 2, 5, shade(s.color, -0.2), frame, 3);
        ellipse(ctx, 0, by, L * 0.42, 5.5, s.color);
        ellipse(ctx, L * 0.05, by + 2.5, L * 0.3, 2.5, s.belly);
        ellipse(ctx, L * 0.45, by - 2, 5, 4, s.color); ellipse(ctx, L * 0.5, by, 3, 2.2, s.belly);
        ellipse(ctx, L * 0.52, by - 3, 1, 1, '#0a0806');
      } else {
        ctx.fillStyle = '#2e2a26'; ctx.beginPath(); ctx.ellipse(-L * 0.5, by + 4, 8, 3.5, -0.2, 0, Math.PI * 2); ctx.fill();
        if (!swim) legs(ctx, [L * 0.25, -L * 0.2], by + 2, 5, shade(s.color, -0.2), frame, 3.5);
        ellipse(ctx, 0, by - 3, L * 0.42, 9, s.color);
        ellipse(ctx, -L * 0.05, by - 7, L * 0.3, 4, shade(s.color, 0.1));
        ellipse(ctx, L * 0.4, by - 2, 6, 5, s.color);
        ellipse(ctx, L * 0.48, by + 2, 2.5, 2, '#e8a030');
        ellipse(ctx, L * 0.44, by - 4, 1.1, 1.1, '#0a0806');
        ellipse(ctx, L * 0.35, by - 7, 1.8, 1.8, shade(s.color, -0.2));
      }
      break;
    }
    case 'rodent': case 'rabbit': case 'squirrel': {
      const L = s.len;
      shadow(L * 0.5);
      if (k === 'squirrel') {
        ctx.fillStyle = s.color; ctx.beginPath(); ctx.moveTo(-L * 0.3, -4); ctx.quadraticCurveTo(-L * 1.0, -8, -L * 0.55, -L * 1.1); ctx.quadraticCurveTo(-L * 0.2, -L * 0.8, -L * 0.3, -6); ctx.fill();
      }
      if (k === 'rabbit') ellipse(ctx, -L * 0.45, -6, 3, 3, '#f0ece4');
      ellipse(ctx, 0, -L * 0.3, L * 0.45, L * 0.3, s.color);
      ellipse(ctx, 0, -L * 0.18, L * 0.3, L * 0.15, s.belly);
      const hx = L * 0.4, hy = -L * 0.4;
      ellipse(ctx, hx, hy, L * 0.22, L * 0.2, s.color);
      if (k === 'rabbit') { ellipse(ctx, hx - 2, hy - L * 0.35, 2, L * 0.25, s.color, -0.2); ellipse(ctx, hx + 1, hy - L * 0.33, 1.6, L * 0.23, shade(s.color, -0.1), 0.1); }
      if (k === 'squirrel') { ctx.fillStyle = s.color; ctx.beginPath(); ctx.moveTo(hx - 2, hy - 2); ctx.lineTo(hx - 1, hy - 7); ctx.lineTo(hx + 1, hy - 2); ctx.fill(); }
      ellipse(ctx, hx + L * 0.08, hy - 1, 1, 1, '#0a0806');
      legs(ctx, [L * 0.2, -L * 0.15], -L * 0.12, L * 0.12, shade(s.color, -0.2), frame, 2);
      break;
    }
    case 'songbird': case 'hummer': case 'woodpecker': {
      const S = s.size;
      if (pose === 'fly') { flyingBird(ctx, s, frame); break; }
      shadow(S * 0.5);
      const by = -S * 0.35 - 3;
      line(ctx, 0, -3, -1, 0, '#3a2a1a', 1); line(ctx, 2, -3, 3, 0, '#3a2a1a', 1);
      ctx.fillStyle = shade(s.color, -0.1);
      ctx.beginPath(); ctx.moveTo(-S * 0.3, by); ctx.lineTo(-S * (s.cocked ? 0.55 : 0.85), by + (s.cocked ? -S * 0.5 : S * 0.15)); ctx.lineTo(-S * 0.3, by + S * 0.2); ctx.fill();
      ellipse(ctx, 0, by, S * 0.45, S * 0.3, s.color, -0.15);
      ellipse(ctx, S * 0.1, by + S * 0.08, S * 0.3, S * 0.2, s.breast, -0.1);
      if (s.vee) { ctx.strokeStyle = '#1a1612'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(S * 0.05, by - 1); ctx.lineTo(S * 0.2, by + 3); ctx.lineTo(S * 0.35, by - 1); ctx.stroke(); }
      if (s.spots) for (let q = 0; q < 5; q++) ellipse(ctx, S * 0.05 + (q % 3) * 2.5, by + 1 + (q > 2 ? 3 : 0), 0.8, 0.8, '#6a5a3a');
      if (s.band) ctx.fillStyle = s.band, ctx.fillRect(S * 0.0, by + 1, S * 0.3, 1.5);
      const hx = S * 0.38, hy = by - S * 0.28;
      ellipse(ctx, hx, hy, S * 0.22, S * 0.2, s.head);
      if (s.crest) { ctx.fillStyle = s.head; ctx.beginPath(); ctx.moveTo(hx - S * 0.15, hy - S * 0.1); ctx.lineTo(hx - S * 0.1, hy - S * 0.45); ctx.lineTo(hx + S * 0.08, hy - S * 0.12); ctx.fill(); }
      if (k === 'woodpecker') { ctx.fillStyle = '#d8322a'; ctx.beginPath(); ctx.moveTo(hx - S * 0.2, hy - S * 0.05); ctx.lineTo(hx - S * 0.1, hy - S * 0.45); ctx.lineTo(hx + S * 0.12, hy - S * 0.1); ctx.fill(); line(ctx, hx - S * 0.1, hy + 1, hx + S * 0.1, hy + 3, '#f0ece4', 1.3); }
      const bl = k === 'hummer' ? S * 0.6 : S * 0.2;
      ctx.fillStyle = '#2a2420'; ctx.beginPath(); ctx.moveTo(hx + S * 0.15, hy - 1); ctx.lineTo(hx + S * 0.15 + bl, hy + 0.5); ctx.lineTo(hx + S * 0.15, hy + 1.5); ctx.fill();
      ellipse(ctx, hx + S * 0.05, hy - 1, 0.9, 0.9, '#0a0806');
      break;
    }
    case 'heron': {
      const S = s.size;
      if (pose === 'fly') { flyingBird(ctx, s, frame, true); break; }
      shadow(S * 0.4);
      line(ctx, -2, -S * 0.9, -3, 0, '#8a7a5a', 1.5); line(ctx, 2, -S * 0.9, 3, 0, '#8a7a5a', 1.5);
      ellipse(ctx, 0, -S * 1.05, S * 0.45, S * 0.22, s.color, -0.3);
      ctx.fillStyle = shade(s.color, -0.2); ctx.beginPath(); ctx.moveTo(-S * 0.3, -S * 1.0); ctx.lineTo(-S * 0.6, -S * 0.85); ctx.lineTo(-S * 0.2, -S * 0.95); ctx.fill();
      ctx.strokeStyle = s.breast; ctx.lineWidth = 3; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(S * 0.3, -S * 1.15); ctx.quadraticCurveTo(S * 0.5, -S * 1.35, S * 0.25, -S * 1.5); ctx.quadraticCurveTo(S * 0.1, -S * 1.65, S * 0.35, -S * 1.8); ctx.stroke();
      ellipse(ctx, S * 0.38, -S * 1.82, 3.5, 2.8, s.head);
      line(ctx, S * 0.3, -S * 1.88, S * 0.1, -S * 1.85, '#1a1a1a', 1.2);
      ctx.fillStyle = '#e0b02a'; ctx.beginPath(); ctx.moveTo(S * 0.45, -S * 1.84); ctx.lineTo(S * 0.75, -S * 1.8); ctx.lineTo(S * 0.45, -S * 1.78); ctx.fill();
      break;
    }
    case 'duck': {
      const S = s.size;
      if (pose === 'fly') { flyingBird(ctx, s, frame); break; }
      const by = -S * 0.25;
      ellipse(ctx, 0, 0, S * 0.6, S * 0.15, 'rgba(255,255,255,0.25)');
      ellipse(ctx, 0, by, S * 0.55, S * 0.28, s.color);
      ellipse(ctx, S * 0.2, by, S * 0.25, S * 0.22, s.breast);
      ctx.fillStyle = shade(s.color, -0.2); ctx.beginPath(); ctx.moveTo(-S * 0.45, by - 2); ctx.lineTo(-S * 0.75, by - S * 0.25); ctx.lineTo(-S * 0.4, by + 2); ctx.fill();
      const hx = S * 0.42, hy = by - S * 0.4;
      ellipse(ctx, hx, hy, S * 0.2, S * 0.19, s.head);
      if (s.fancy) { ctx.fillStyle = s.head; ctx.beginPath(); ctx.moveTo(hx - 1, hy - 2); ctx.lineTo(hx - S * 0.35, hy + 1); ctx.lineTo(hx - 1, hy + 2); ctx.fill(); line(ctx, hx - 2, hy - 2, hx + 3, hy - 2.5, '#f0ece4', 0.9); ellipse(ctx, hx + 1, hy + 2, 1.5, 1, '#f0ece4'); }
      else line(ctx, hx - 3, hy + S * 0.2, hx + 2, hy + S * 0.2, '#f0ece4', 1.2);
      ctx.fillStyle = s.fancy ? '#d84a2a' : '#e0b02a'; ctx.beginPath(); ctx.moveTo(hx + S * 0.15, hy - 1); ctx.lineTo(hx + S * 0.38, hy + 1); ctx.lineTo(hx + S * 0.15, hy + 2); ctx.fill();
      ellipse(ctx, hx + 2, hy - 1, 0.9, 0.9, s.fancy ? '#d8322a' : '#0a0806');
      break;
    }
    case 'raptor': case 'owl': {
      const S = s.size;
      if (pose === 'fly') { flyingBird(ctx, s, frame); break; }
      shadow(S * 0.35);
      const by = -S * 0.55;
      ctx.fillStyle = s.tail || s.color; ctx.beginPath(); ctx.moveTo(-S * 0.1, by + S * 0.3); ctx.lineTo(-S * 0.25, by + S * 0.6); ctx.lineTo(S * 0.05, by + S * 0.6); ctx.fill();
      ellipse(ctx, 0, by, S * 0.28, S * 0.42, s.color);
      ellipse(ctx, S * 0.06, by + S * 0.08, S * 0.18, S * 0.3, s.breast);
      if (k === 'owl') for (let q = 0; q < 6; q++) line(ctx, S * 0.0 + (q % 3) * 3 - 2, by + (q > 2 ? 4 : -1), S * 0.0 + (q % 3) * 3, by + (q > 2 ? 4 : -1), '#5a4028', 1);
      const hx = S * 0.05, hy = by - S * 0.45;
      ellipse(ctx, hx, hy, S * 0.22, S * 0.2, s.head);
      if (k === 'owl') {
        ctx.fillStyle = s.head; ctx.beginPath(); ctx.moveTo(hx - S * 0.18, hy - 2); ctx.lineTo(hx - S * 0.14, hy - S * 0.38); ctx.lineTo(hx - S * 0.04, hy - 3); ctx.moveTo(hx + S * 0.18, hy - 2); ctx.lineTo(hx + S * 0.14, hy - S * 0.38); ctx.lineTo(hx + S * 0.04, hy - 3); ctx.fill();
        ellipse(ctx, hx - 3, hy, 2.4, 2.4, '#e8b02a'); ellipse(ctx, hx + 3, hy, 2.4, 2.4, '#e8b02a');
        ellipse(ctx, hx - 3, hy, 1, 1, '#0a0806'); ellipse(ctx, hx + 3, hy, 1, 1, '#0a0806');
      } else {
        ctx.fillStyle = '#e0b02a'; ctx.beginPath(); ctx.moveTo(hx + S * 0.15, hy - 1); ctx.quadraticCurveTo(hx + S * 0.35, hy, hx + S * 0.2, hy + S * 0.12); ctx.fill();
        ellipse(ctx, hx + S * 0.08, hy - 1.5, 1.2, 1.2, '#0a0806');
      }
      break;
    }
    case 'bat': flyingBird(ctx, { ...s, bat: true }, frame); break;
    case 'frog': {
      const S = s.size;
      shadow(S * 0.5);
      ellipse(ctx, -S * 0.25, -S * 0.2, S * 0.3, S * 0.18, shade(s.color, -0.15));
      ellipse(ctx, 0, -S * 0.3, S * 0.45, S * 0.3, s.color);
      ellipse(ctx, S * 0.3, -S * 0.45, S * 0.2, S * 0.18, s.color);
      ellipse(ctx, S * 0.32, -S * 0.58, S * 0.1, S * 0.1, '#e8d05a'); ellipse(ctx, S * 0.34, -S * 0.58, S * 0.05, S * 0.05, '#0a0806');
      line(ctx, S * 0.1, -S * 0.45, S * 0.4, -S * 0.42, s.dark, 1.2);
      ellipse(ctx, S * 0.2, -S * 0.05, S * 0.12, S * 0.07, s.dark);
      break;
    }
    case 'newt': {
      const S = s.size;
      ctx.strokeStyle = s.color; ctx.lineWidth = S * 0.2; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(-S * 0.8, -1 + frame); ctx.quadraticCurveTo(-S * 0.3, -3, 0, -2); ctx.stroke();
      ellipse(ctx, 0, -2, S * 0.4, S * 0.13, s.color);
      ellipse(ctx, 0, -1, S * 0.35, S * 0.06, s.belly);
      ellipse(ctx, S * 0.42, -2, S * 0.14, S * 0.12, s.color);
      for (const [x, y] of [[S * 0.2, 0], [-S * 0.2, 0]]) line(ctx, x, -2, x + (frame ? 2 : -2), y + 1, s.color, 1.5);
      break;
    }
    case 'turtle': {
      const S = s.size;
      shadow(S * 0.55);
      ellipse(ctx, S * 0.55, -S * 0.2, S * 0.14, S * 0.11, s.dark);
      for (const x of [S * 0.3, -S * 0.3]) ellipse(ctx, x, -2, S * 0.1, S * 0.08, s.dark);
      const g = ctx.createRadialGradient(-S * 0.1, -S * 0.45, 1, 0, -S * 0.25, S * 0.5);
      g.addColorStop(0, shade(s.color, 0.3)); g.addColorStop(1, s.color);
      ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(0, -S * 0.25, S * 0.48, S * 0.3, 0, Math.PI, 0); ctx.lineTo(S * 0.48, -S * 0.15); ctx.lineTo(-S * 0.48, -S * 0.15); ctx.fill();
      for (let q = 0; q < 3; q++) ellipse(ctx, -S * 0.25 + q * S * 0.25, -S * 0.35, 1.5, 1.2, rgba('#c8c070', 0.5));
      break;
    }
    case 'snake': {
      const S = s.size;
      ctx.lineCap = 'round';
      const path = () => { ctx.beginPath(); ctx.moveTo(-S * 0.6, -2); ctx.bezierCurveTo(-S * 0.3, -8 + frame * 3, -S * 0.1, 4 - frame * 3, S * 0.2, -3); ctx.quadraticCurveTo(S * 0.35, -6, S * 0.45, -4); };
      ctx.strokeStyle = 'rgba(10,15,5,0.25)'; ctx.lineWidth = 4; ctx.save(); ctx.translate(1, 2); path(); ctx.stroke(); ctx.restore();
      ctx.strokeStyle = s.color; ctx.lineWidth = 3.5; path(); ctx.stroke();
      ctx.strokeStyle = s.stripe; ctx.lineWidth = 1; path(); ctx.stroke();
      ellipse(ctx, S * 0.47, -4, 2.2, 1.6, s.color);
      break;
    }
    case 'fish': {
      const S = s.size;
      const wig = frame ? 0.15 : -0.15;
      ctx.save(); ctx.rotate(wig * 0.3);
      ctx.fillStyle = shade(s.color, -0.2);
      ctx.beginPath(); ctx.moveTo(-S * 0.4, 0); ctx.lineTo(-S * 0.65, -S * 0.15 + wig * 6); ctx.lineTo(-S * 0.65, S * 0.15 + wig * 6); ctx.fill();
      ellipse(ctx, 0, 0, S * 0.45, S * 0.14, s.color);
      if (s.head) ellipse(ctx, S * 0.28, 0, S * 0.18, S * 0.12, s.head);
      if (s.throat) line(ctx, S * 0.25, S * 0.08, S * 0.35, S * 0.05, s.throat, 1.2);
      for (let q = 0; q < 4; q++) ellipse(ctx, -S * 0.2 + q * S * 0.12, -S * 0.04, 0.7, 0.7, s.spots);
      ctx.restore();
      break;
    }
  }
}

function flyingBird(ctx, s, frame, heron = false) {
  const S = s.size * (s.bat ? 1.2 : 1);
  const up = frame === 0;
  const span = S * (up ? 0.55 : 0.95);
  const wc = s.bat ? s.color : shade(s.color, -0.05);
  ctx.fillStyle = wc;
  // wings (seen from above, bird heading right)
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(S * 0.1, 0);
    if (s.bat) {
      ctx.lineTo(0, side * span); ctx.lineTo(-S * 0.1, side * span * 0.7); ctx.lineTo(-S * 0.2, side * span * 0.8); ctx.lineTo(-S * 0.25, side * span * 0.4);
    } else {
      ctx.quadraticCurveTo(S * 0.05, side * span * 0.7, -S * 0.15, side * span);
      ctx.quadraticCurveTo(-S * 0.2, side * span * 0.5, -S * 0.2, 0);
    }
    ctx.closePath(); ctx.fill();
  }
  ellipse(ctx, 0, 0, S * 0.35, S * 0.12, s.color);
  if (!s.bat) {
    ctx.fillStyle = s.tail || shade(s.color, -0.1);
    ctx.beginPath(); ctx.moveTo(-S * 0.3, 0); ctx.lineTo(-S * 0.55, -S * 0.12); ctx.lineTo(-S * 0.55, S * 0.12); ctx.fill();
    ellipse(ctx, S * (heron ? 0.3 : 0.32), 0, S * 0.12, S * 0.1, s.head || s.color);
    if (heron) line(ctx, -S * 0.3, 0, -S * 0.8, 0, '#8a7a5a', 1.5);
  }
}


// ---------------------------------------------------------------- visitors
const SHIRTS = ['#c8583a', '#3a6a9a', '#e0b030', '#5a8a4a', '#8a4a8a', '#d88a6a', '#2a4a3a', '#b0302a'];
const PANTS = ['#3a3a4a', '#5a4a3a', '#2a3a5a', '#6a6a5a'];
const SKIN = ['#f0c8a0', '#d8a878', '#a87850', '#7a5030'];
export function personSprite(look, frame, dir) {
  return cached(`person${look}|${frame}|${dir}`, () => {
    const [c, ctx] = mk(ANIM_W, ANIM_H);
    ctx.translate(ANIM_AX, ANIM_AY);
    if (dir < 0) ctx.scale(-1, 1);
    const shirt = SHIRTS[look % SHIRTS.length], pants = PANTS[look % PANTS.length], skin = SKIN[(look >> 1) % SKIN.length];
    ellipse(ctx, 0, 0, 7, 2, 'rgba(10,15,5,0.3)');
    const sw = frame ? 3 : -3;
    line(ctx, -1.5, -16, -1.5 + sw, 0, pants, 3.2);
    line(ctx, 1.5, -16, 1.5 - sw, 0, shade(pants, -0.2), 3.2);
    ctx.fillStyle = shirt; ctx.beginPath(); ctx.roundRect(-5, -32, 10, 17, 3); ctx.fill();
    if (look % 3 === 0) { ctx.fillStyle = shade(shirt, -0.35); ctx.beginPath(); ctx.roundRect(-7.5, -30, 5, 11, 2); ctx.fill(); } // backpack
    line(ctx, 4, -29, 5 - sw * 0.5, -19, skin, 2.4);
    ellipse(ctx, 0, -37, 4.2, 4.6, skin);
    if (look % 2) { ctx.fillStyle = look % 4 === 1 ? '#6a5a3a' : '#3a5a3a'; ctx.beginPath(); ctx.ellipse(0, -40, 6, 1.8, 0, 0, Math.PI * 2); ctx.fill(); ctx.fillRect(-3.5, -44, 7, 4); }
    else { ctx.fillStyle = ['#3a2a1a', '#8a6a3a', '#1a1a1a', '#c8a060'][look % 4]; ctx.beginPath(); ctx.ellipse(-0.5, -39.5, 4.6, 3, 0, Math.PI, 0); ctx.fill(); }
    return c;
  });
}

// ---------------------------------------------------------------- fire
export function flameSprite(frame) {
  return cached(`flame${frame}`, () => {
    const [c, ctx] = mk(64, 96);
    const r = mulberry32(frame * 97 + 3);
    for (let k = 0; k < 6; k++) {
      const x = 32 + (r() - 0.5) * 30, h = 40 + r() * 40, w = 8 + r() * 8;
      const g = ctx.createLinearGradient(0, 92, 0, 92 - h);
      g.addColorStop(0, 'rgba(255,230,120,0.95)'); g.addColorStop(0.4, 'rgba(255,140,40,0.9)'); g.addColorStop(1, 'rgba(200,40,20,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.moveTo(x - w, 92); ctx.quadraticCurveTo(x - w * 0.8, 92 - h * 0.5, x + (r() - 0.5) * 8, 92 - h); ctx.quadraticCurveTo(x + w * 0.8, 92 - h * 0.5, x + w, 92); ctx.fill();
    }
    return c;
  });
}
export function smokeSprite() {
  return cached('smoke', () => {
    const [c, ctx] = mk(64, 64);
    const g = ctx.createRadialGradient(32, 32, 2, 32, 32, 30);
    g.addColorStop(0, 'rgba(90,85,80,0.55)'); g.addColorStop(1, 'rgba(90,85,80,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, 64, 64);
    return c;
  });
}
