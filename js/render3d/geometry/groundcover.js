// Groundcover foliage, botanical accents and seed heads.
import * as THREE from 'three';
import { mulberry32 } from '../../rng.js';
import { blotch, frond, merge, prep, ribbon, rod, shadeVerts, sheet, soft, speck, strap, twoSided } from './primitives.js';
import { gingerStalks, pandanBranches } from './shrubs.js';

// ---------------------------------------------------------------- groundcover tufts
const TITAN_BLOOM = 1.3; // a corpse flower in bloom: about 0.4 tall at the spathe's rim, 0.86 to the spadix tip
// lo: a light version for anything but close-ups (fewer, straighter blades, simpler flowers).
export function tuft(type, seed, lo = false) {
  const r = mulberry32(seed);
  const parts = [];
  const few = n => lo ? Math.max(2, Math.round(n * 0.45)) : n;
  const blades = (n, len, width, bendMax, spread = 0.05) => {
    for (let k = 0, m = few(n); k < m; k++) {
      const dir = r() * 6.28;
      parts.push(ribbon(len * (0.65 + r() * 0.5), width * (lo ? 1.35 : 1), 0.25 + r() * bendMax, lo ? 1 : 2, dir, 0.1 + r() * 0.35, (r() - 0.5) * spread, (r() - 0.5) * spread));
    }
  };
  switch (type) {
    // thick, full clumps: many blades, wider at the base, splayed a little further out
    case 'grass': blades(13, 0.18, 0.019, 0.75, 0.09); break;
    case 'tallgrass': blades(14, 0.3, 0.018, 0.85, 0.1); break;
    case 'savannagrass': blades(16, 0.82, 0.016, 0.65, 0.075); break;
    case 'dropseed': blades(13, 0.32, 0.009, 0.6, 0.065); break;
    case 'papyrus': blades(8, 0.57, 0.007, 0.15, 0.06); break;
    case 'sedge': blades(12, 0.19, 0.018, 1.1, 0.07); break;
    case 'forb': {
      for (let k = 0, m = lo ? 4 : 6; k < m; k++) {
        const a = k / m * 6.28 + r() * 0.4;
        parts.push(soft(new THREE.IcosahedronGeometry(0.035, lo ? 0 : 1), { transform: g => { g.scale(1.6, 0.3, 0.8); g.rotateY(-a); g.translate(Math.cos(a) * 0.045, 0.02, Math.sin(a) * 0.045); } }));
      }
      blades(3, 0.14, 0.006, 0.2, 0.02);
      break;
    }
    case 'tallforb': {
      for (let k = 0; k < 3; k++) {
        const x = (r() - 0.5) * 0.08, z = (r() - 0.5) * 0.08, h = 0.24 + r() * 0.08;
        parts.push(soft(new THREE.CylinderGeometry(0.004, 0.007, h, 4), { transform: g => g.translate(x, h / 2, z) }));
        for (let l = 0, m = lo ? 2 : 4; l < m; l++) parts.push(ribbon(0.07, 0.01, 0.6, lo ? 1 : 2, r() * 6.28, 1.0, x, z).translate(0, h * (0.25 + l * (lo ? 0.34 : 0.17)), 0));
      }
      break;
    }
    case 'fern': {
      const pos = [], col = [];
      for (let k = 0, m = lo ? 5 : 8; k < m; k++) frond({ base: [0, 0.01, 0], az: k / m * 6.28 + r() * 0.2,
        elev: 0.9, droop: 1.2, L: 0.32 + r() * 0.06, n: lo ? 4 : 8, w: 0.045,
        segs: lo ? 2 : 4, bare: 0.1, rib: 0.0025, v: 0.08, fill: 0.7, sweep: 0.35, hang: 0.15 }, pos, col);
      parts.push(sheet(pos, col));
      break;
    }
    case 'cattail': blades(6, 0.44, 0.013, 0.35, 0.08); break;
    case 'lily': {
      // floating round pads with a notch, raised rims on the giant water lily
      for (let k = 0, m = lo ? 2 : 4; k < m; k++) {
        const a = r() * 6.28, d = 0.03 + r() * 0.1, rad = 0.07 + r() * 0.06;
        parts.push(prep(new THREE.CircleGeometry(rad, lo ? 8 : 14, 0.3, 5.9).rotateX(-Math.PI / 2).rotateY(r() * 6.28).translate(Math.cos(a) * d, 0.004 + k * 0.001, Math.sin(a) * d)));
      }
      break;
    }
    case 'tule': {
      for (let k = 0, m = lo ? 4 : 8; k < m; k++) {
        const x = (r() - 0.5) * 0.1, z = (r() - 0.5) * 0.1, h = 0.45 + r() * 0.2;
        parts.push(soft(new THREE.CylinderGeometry(0.003, 0.006, h, 4), { transform: g => { g.translate(0, h / 2, 0); g.rotateZ((r() - 0.5) * 0.25); g.translate(x, 0, z); } }));
      }
      break;
    }
    case 'skunk': {
      for (let k = 0; k < 5; k++) parts.push(ribbon(0.22, 0.05, 0.5, lo ? 2 : 4, k / 5 * 6.28, 0.35, 0, 0, 0xffffff, 0.04));
      break;
    }
    // ---- the reef's groundcover
    case 'seagrass': blades(10, 0.26, 0.014, 0.5, 0.08); break; // long ribbons streaming in the current
    case 'spoongrass': {
      // spoon seagrass: little paired oval leaves on short stalks
      for (let k = 0, m = lo ? 4 : 8; k < m; k++) {
        const a = r() * 6.28, d = r() * 0.07, x = Math.cos(a) * d, z = Math.sin(a) * d, h = 0.035 + r() * 0.03;
        parts.push(soft(new THREE.IcosahedronGeometry(0.022, lo ? 0 : 1), { transform: g => { g.scale(0.6, 0.18, 1.3); g.rotateY(r() * 6.28); g.rotateX(0.5); g.translate(x, h, z); } }));
        if (!lo) parts.push(soft(new THREE.CylinderGeometry(0.002, 0.003, h, 3), { transform: g => g.translate(x, h / 2, z) }));
      }
      break;
    }
    case 'crust': {
      // coralline algae: thin, knobbly pink crusts spreading over the rubble
      for (let k = 0, m = lo ? 2 : 3; k < m; k++) {
        const a = r() * 6.28, d = r() * 0.14, s0 = 0.04 + r() * 0.035;
        parts.push(soft(new THREE.IcosahedronGeometry(s0, lo ? 0 : 1), { seed: seed + k, lump: s0 * 0.5, transform: g => { g.scale(1.3, 0.12, 1.1); g.translate(Math.cos(a) * d, 0.002, Math.sin(a) * d); } }));
      }
      break;
    }
    case 'turf': blades(16, 0.06, 0.013, 0.9, 0.16); break; // a low, shaggy fuzz of algae
    case 'halimeda': {
      // Halimeda: little upright chains of flat green discs, which crumble into white sand when they die
      for (let k = 0, m = lo ? 2 : 4; k < m; k++) {
        const x0 = (r() - 0.5) * 0.12, z0 = (r() - 0.5) * 0.12, lean = (r() - 0.5) * 0.5, rot = r() * 6.28;
        for (let j = 0, n = lo ? 3 : 5; j < n; j++) {
          const s0 = 0.022 - j * 0.002, y = 0.015 + j * 0.03;
          parts.push(soft(new THREE.IcosahedronGeometry(s0, 0), { transform: g => { g.scale(1, 0.4, 0.25); g.rotateY(rot); g.rotateZ(1.2 + lean); g.translate(x0 + lean * y, y, z0); } }));
        }
      }
      break;
    }
    case 'pitcher': {
      // Nepenthes on wet peat: a low rosette of strap leaves, with tendrils running out to the
      // pitchers (accent('pitcher') draws those, in a colour of their own)
      const pos = [], col = [];
      for (let k = 0, m = lo ? 4 : 7; k < m; k++) strap({ base: [0, 0.008, 0], az: k / m * 6.28 + r() * 0.4, elev: 0.5, droop: 0.75, L: 0.1 + r() * 0.04, w: 0.015 * (lo ? 1.3 : 1), segs: lo ? 2 : 3, lance: true }, pos, col);
      parts.push(sheet(pos, col));
      if (!lo) for (const s of pitcherSpots(seed, 4)) parts.push(rod([s.x * 0.4, 0.035, s.z * 0.4], [s.x, 0.012, s.z], 0.0025, 0.002, 3));
      break;
    }
    case 'titan': {
      // Amorphophallus titanum in leaf: one tall, mottled stalk carrying a single huge leaf, split
      // in three and forked again and again into an umbrella of leaflets, like a small tree
      const Hs = 0.5, pos = [], col = [];
      const mottle = g => blotch(g, 0.4, [2.0, 1.8, 2.7], [0.78, 0.86, 0.7], seed); // pale blotches on dark olive
      parts.push(mottle(soft(new THREE.CylinderGeometry(0.014, 0.022, Hs, lo ? 5 : 7, lo ? 5 : 12), { transform: g => g.translate(0, Hs / 2, 0) })));
      const branch = (p0, az, len, depth) => {
        const rise = [-0.4, 0.0, 0.5][depth], p1 = [p0[0] + Math.cos(az) * len, p0[1] + rise * len, p0[2] + Math.sin(az) * len];
        parts.push(mottle(rod(p0, p1, 0.004 + depth * 0.003, 0.003 + depth * 0.003, 3)));
        if (depth === 0 || (lo && depth === 1)) {
          // the leaflets: pinnate along the last fork, one at the tip
          const big = lo ? 1.35 : 1, at = lo ? [0.4, 0.8] : [0.2, 0.5, 0.8];
          for (const t of at) for (const s of [-1, 1]) strap({ base: [p0[0] + (p1[0] - p0[0]) * t, p0[1] + (p1[1] - p0[1]) * t, p0[2] + (p1[2] - p0[2]) * t], az: az + s * (1.1 - t * 0.4), elev: 0.1, droop: 0.6, L: 0.1 * big, w: 0.028 * big, segs: lo ? 2 : 3, lance: true }, pos, col);
          strap({ base: p1, az, elev: 0.0, droop: 0.6, L: 0.11 * big, w: 0.03 * big, segs: lo ? 2 : 3, lance: true }, pos, col);
          return;
        }
        for (const s of [-1, 1]) branch(p1, az + s * (0.45 + r() * 0.2), len * 0.8, depth - 1);
      };
      for (let k = 0; k < 3; k++) branch([0, Hs, 0], k * 2.094 + r() * 0.3, 0.13, 2);
      parts.push(twoSided(sheet(pos, col)));
      break;
    }
    case 'titanbloom': {
      // ...and once in a long while in flower instead: a huge vase of a spathe, ribbed outside, its
      // rim flared and ruffled, deep maroon within (accent('titanbloom') draws the spadix rising out of it)
      const prof = [[0.035, 0], [0.08, 0.035], [0.1, 0.1], [0.106, 0.17], [0.12, 0.23], [0.155, 0.28], [0.2, 0.305]];
      const seg = lo ? 12 : 22;
      const ruffle = g => {
        const p = g.attributes.position;
        for (let i = 0; i < p.count; i++) {
          const x = p.getX(i), y = p.getY(i), z = p.getZ(i), a = Math.atan2(z, x), t = y / 0.305;
          const f = 1 + 0.12 * Math.sin(a * 9 + 0.5) * t ** 3;
          p.setXYZ(i, x * f, y + 0.025 * Math.sin(a * 7) * t ** 3 - 0.045 * (1 + Math.cos(a)) * t * t, z * f);
        }
      };
      const lathe = (k, dy) => new THREE.LatheGeometry(prof.map(([x, y]) => new THREE.Vector2(x * k, y + dy)), seg);
      parts.push(shadeVerts(soft(lathe(1, 0), { transform: ruffle }), (x, y, z) => (0.55 + 0.25 * y / 0.3) * (0.82 + 0.18 * Math.abs(Math.sin(Math.atan2(z, x) * 11)))));
      parts.push(shadeVerts(soft(lathe(0.93, 0.008), { transform: g => { g.scale(-1, 1, 1); ruffle(g); } }), (x, y) => 0.75 + 0.5 * y / 0.3));
      for (const g of parts) g.scale(TITAN_BLOOM, TITAN_BLOOM, TITAN_BLOOM); // (drawn a bit bigger than life beside its leaf, so it reads as the event it is)
      break;
    }
    default: blades(8, 0.15, 0.012, 0.6);
  }
  return merge(parts);
}

// Where a pitcher plant's pitchers sit (shared by its rosette and the pitchers, at either lod):
// mostly squat, round lower pitchers on the peat, and one taller, slender one.
function pitcherSpots(seed, n) {
  const r = mulberry32(seed * 5 + 3), out = [];
  for (let k = 0; k < 4; k++) {
    const a = k / 4 * 6.28 + r() * 0.9, d = 0.075 + r() * 0.06;
    out.push({ x: Math.cos(a) * d, z: Math.sin(a) * d, s: 0.8 + r() * 0.45, tall: k === 1, rot: r() * 6.28, lean: (r() - 0.5) * 0.4 });
  }
  return out.slice(0, n);
}

// Parts of a plant drawn in a colour of their own, over the plant itself (same position, scale and
// turn, and the same seed and lod):
//   'ginger'     torch ginger's waxy torches on their stalks: the flower colour, while in bloom
//   'pitcher'    the pitchers, mottled red and green: the flower colour, always
//   'pandan'     screw pine's fruit, hanging under the leaf tufts: the berry colour, while fruiting
//   'titanbloom' the corpse flower's tall spadix: look.head (pale yellow), while in bloom
export function accent(type, seed, lo = false) {
  const parts = [];
  switch (type) {
    case 'pandan':
      // big, round, knobbly heads like pineapples, each on a short stalk under a tuft
      for (const { tip, a } of pandanBranches(seed).slice(0, 2)) {
        const f = [tip[0] + Math.cos(a + 1) * 0.03, tip[1] - 0.08, tip[2] + Math.sin(a + 1) * 0.03];
        parts.push(shadeVerts(rod([tip[0], tip[1] - 0.01, tip[2]], f, 0.006, 0.005, 3), () => 0.5));
        parts.push(shadeVerts(soft(new THREE.IcosahedronGeometry(0.045, lo ? 0 : 1), { seed, lump: 0.012, transform: g => { g.scale(1, 1.2, 1); g.translate(f[0], f[1] - 0.04, f[2]); } }),
          (x, y, z) => (0.8 + 0.35 * Math.min(1, Math.max(0, (y - f[1] + 0.09) / 0.1))) * (0.85 + 0.3 * Math.abs(Math.sin(x * 240) * Math.sin(z * 240 + y * 200)))));
      }
      break;
    case 'ginger':
      for (const s of gingerStalks(seed)) {
        const pos = [], col = [];
        // a collar of flared, waxy outer bracts round a tight cone of inner ones
        for (let k = 0, m = lo ? 5 : 8; k < m; k++) strap({ base: [s.t[0], s.t[1] + 0.008, s.t[2]], az: k / m * 6.28, elev: 0.35, droop: 0.9, L: 0.07, w: 0.026, segs: lo ? 1 : 2, lance: true, shade: 1.25 }, pos, col);
        parts.push(twoSided(sheet(pos, col, 0.3)));
        const cone = [[0.001, -0.006], [0.026, 0.004], [0.03, 0.026], [0.024, 0.05], [0.012, 0.068], [0.001, 0.075]].map(([x, y]) => new THREE.Vector2(x, y));
        parts.push(shadeVerts(soft(new THREE.LatheGeometry(cone, lo ? 6 : 9), { transform: g => g.translate(s.t[0], s.t[1] + 0.012, s.t[2]) }), (x, y) => 0.85 + 0.3 * Math.abs(Math.sin((y - s.t[1]) * 160))));
      }
      break;
    case 'pitcher':
      for (const s of pitcherSpots(seed, lo ? 3 : 4)) {
        // a lathed cup: swollen belly, waist, a ridged rim (the peristome) curling into a dark throat
        const prof = s.tall ? [[0.001, 0], [0.016, 0.006], [0.022, 0.03], [0.02, 0.06], [0.016, 0.085], [0.019, 0.1], [0.015, 0.103], [0.011, 0.07]]
          : [[0.001, 0], [0.02, 0.004], [0.029, 0.02], [0.03, 0.036], [0.024, 0.05], [0.027, 0.057], [0.021, 0.061], [0.014, 0.035]];
        const pts = (lo ? prof.filter((p, k) => k !== 2 && k !== 5) : prof).map(([x, y]) => new THREE.Vector2(x * s.s, y * s.s));
        const rimY = (s.tall ? 0.1 : 0.057) * s.s;
        const cup = soft(new THREE.LatheGeometry(pts, lo ? 5 : 7), { transform: g => { g.rotateZ(s.lean); g.rotateY(s.rot); g.translate(s.x, -0.004, s.z); } });
        shadeVerts(cup, (x, y, z) => {
          const t = (y + 0.004) / rimY;
          if (Math.hypot(x - s.x, z - s.z) < 0.016 * s.s && t > 0.4 && t < 0.97) return 0.28; // the throat
          if (t > 0.9) return [1.2, 0.75, 0.8];                                               // the peristome
          return speck(x, y, z, 7) > 0.55 ? [0.5, 3.4, 1.4] : [1, 1, 1];                       // red, mottled green
        });
        parts.push(cup);
        // the lid, standing up over the mouth from the back of the rim
        const lid = soft(new THREE.CircleGeometry(0.017 * s.s, lo ? 4 : 6), { transform: g => {
          g.scale(1, 0.75, 1); g.translate(0, 0.012 * s.s, 0); g.rotateX(-0.35); g.translate(0, rimY, -0.02 * s.s);
          g.rotateZ(s.lean); g.rotateY(s.rot); g.translate(s.x, -0.004, s.z);
        } });
        parts.push(shadeVerts(lid, () => [0.6, 2.6, 1.2]));
      }
      break;
    case 'titanbloom': {
      // the spadix: a tall, hollow, ridged spike, pale yellow, standing twice the spathe's height
      const prof = [[0.001, 0.02], [0.04, 0.04], [0.048, 0.12], [0.046, 0.26], [0.037, 0.42], [0.024, 0.56], [0.01, 0.64], [0.001, 0.66]];
      parts.push(shadeVerts(soft(new THREE.LatheGeometry(prof.map(([x, y]) => new THREE.Vector2(x, y)), lo ? 7 : 12)),
        (x, y, z) => (0.78 + 0.3 * Math.min(1, y / 0.4)) * (0.88 + 0.12 * Math.abs(Math.sin(Math.atan2(z, x) * 6)))).scale(TITAN_BLOOM, TITAN_BLOOM, TITAN_BLOOM));
      break;
    }
    default: return null;
  }
  return merge(parts);
}
