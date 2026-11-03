// The moon's face for the eye-level sky (eye-sky.js): the real near side, worked out once at
// start-up from where its seas and bright craters really are, so nothing is downloaded. The dark
// maria (the "seas" of old lava) against the pale highlands, the bright young craters Tycho,
// Copernicus, Kepler and Aristarchus, and Tycho's rays. It turns the right way for the map's
// latitude: north up seen from the northern hemisphere, upside down from the southern, and tipped
// on its side near the equator (moonAxes).

import * as THREE from 'three';

export const MOON_SIZE = 128;
const RAD = Math.PI / 180;

// [latitude, longitude (east is +, toward Mare Crisium), radius, in degrees, how dark (0..1)]
const MARIA = [
  [33, -16, 18, 1],        // Imbrium
  [38, -30, 12, 0.95],
  [28, 18, 11, 1],         // Serenitatis
  [8, 30, 13, 0.95],       // Tranquillitatis
  [16, 22, 7, 0.9],
  [-2, 37, 6, 0.85],
  [17, 59, 8.5, 1],        // Crisium
  [-4, 51, 9, 0.85],       // Fecunditatis
  [-14, 53, 7, 0.8],
  [-15, 34, 5.5, 0.9],     // Nectaris
  [-20, -15, 11, 0.8],     // Nubium
  [-10, -23, 6, 0.75],     // Cognitum
  [-24, -39, 6.5, 0.9],    // Humorum
  [8, -30, 8.5, 0.8],      // Insularum
  [13, 4, 4.5, 0.85],      // Vaporum
  [2, 1, 3, 0.6],          // Sinus Medii
  [25, -55, 15, 0.9],      // Oceanus Procellarum, a ragged sweep down the western side
  [8, -55, 13, 0.85],
  [-6, -45, 10, 0.85],
  [42, -50, 11, 0.85],
  [45, -32, 5, 0.8],       // Sinus Iridum and Imbrium's north shore
  [55, -38, 5.5, 0.7],     // Frigoris, a thin band across the north
  [56, -26, 5.5, 0.75],
  [57, -14, 5.5, 0.75],
  [57, -2, 5.5, 0.75],
  [57, 10, 5.5, 0.75],
  [56, 22, 5, 0.7],
  [51.6, -9.3, 2, 0.9],    // Plato's dark floor
  [-5, -68, 3, 0.9],       // Grimaldi
  [1, 86, 5, 0.7],         // Smythii, on the eastern limb
];
// bright young craters: [latitude, longitude, radius, brightness, rays (how far, in degrees)]
const CRATERS = [
  [-43.3, -11.2, 2.2, 0.35, 60], // Tycho
  [9.6, -20.1, 2, 0.25, 25],     // Copernicus
  [8.1, -38, 1.2, 0.2, 14],      // Kepler
  [23.7, -47.5, 1, 0.35, 0],     // Aristarchus, the brightest spot
  [-8.9, 61.1, 0.9, 0.2, 8],     // Langrenus
  [-29.4, 60.9, 0.9, 0.12, 0],   // Petavius
];

function hash(x, y, z) {
  const h = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453;
  return h - Math.floor(h);
}
// smooth value noise in 3D, so the pattern wraps round the globe without a seam
function noise(x, y, z) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const s = (t) => t * t * (3 - 2 * t), fx = s(x - xi), fy = s(y - yi), fz = s(z - zi);
  const L = (a, b, t) => a + (b - a) * t;
  const c = (dx, dy, dz) => hash(xi + dx, yi + dy, zi + dz);
  return L(L(L(c(0, 0, 0), c(1, 0, 0), fx), L(c(0, 1, 0), c(1, 1, 0), fx), fy),
           L(L(c(0, 0, 1), c(1, 0, 1), fx), L(c(0, 1, 1), c(1, 1, 1), fx), fy), fz);
}
const fbm = (x, y, z) => noise(x, y, z) * 0.55 + noise(x * 2.1, y * 2.1, z * 2.1) * 0.3 + noise(x * 4.3, y * 4.3, z * 4.3) * 0.15;
const unit = (lat, lon) => [Math.cos(lat * RAD) * Math.sin(lon * RAD), Math.sin(lat * RAD), Math.cos(lat * RAD) * Math.cos(lon * RAD)];

// The face as seen from Earth, lunar north at the top (v = 1) and east to the right (u = 1):
// red is the brightness, alpha the disc.
export function moonTexture() {
  const N = MOON_SIZE, data = new Uint8Array(N * N * 4);
  const maria = MARIA.map(([la, lo, r, k]) => [unit(la, lo), Math.cos(r * RAD), r * RAD, k]);
  const craters = CRATERS.map(([la, lo, r, b, ray]) => [unit(la, lo), r * RAD, b, ray * RAD, la * 7 + lo]);
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const x = (i + 0.5) / N * 2 - 1, y = (j + 0.5) / N * 2 - 1, rr = x * x + y * y, o = (j * N + i) * 4;
    if (rr > 1) { data[o] = 200; data[o + 3] = 0; continue; }
    const z = Math.sqrt(1 - rr);
    // the seas: each one's edge broken up by noise, so they run into each other like the real ones
    const wob = (fbm(x * 5 + 5, y * 5, z * 5) - 0.5) * 0.85 + (noise(x * 16, y * 16 + 3, z * 16) - 0.5) * 0.25;
    let mare = 0;
    for (const [c, , r, k] of maria) {
      const ang = Math.acos(Math.min(1, x * c[0] + y * c[1] + z * c[2]));
      const t = ang / r + wob;
      mare = Math.max(mare, k * (1 - Math.min(1, Math.max(0, (t - 0.8) / 0.3))));
    }
    // highlands pale and pocked with old craters (mottling); seas smoother, a little patchy
    const mottle = fbm(x * 9, y * 9, z * 9), fine = noise(x * 26, y * 26, z * 26);
    let v = (0.92 + (mottle - 0.5) * 0.12 + (fine - 0.5) * 0.08) * (1 - mare) + (0.46 + (mottle - 0.5) * 0.14) * mare;
    v += Math.max(0, -y) * 0.04 * (1 - mare); // (the southern highlands, the brightest ground)
    for (const [c, r, b, ray, seed] of craters) {
      const ang = Math.acos(Math.min(1, x * c[0] + y * c[1] + z * c[2]));
      v += b * Math.exp(-(ang * ang) / (r * r));
      if (ray > 0 && ang > r && ang < ray) {
        // rays: thin bright streaks thrown straight out
        const bear = Math.atan2(x - c[0], y - c[1]);
        const streak = Math.pow(Math.max(0, Math.sin(bear * 7 + seed) * Math.sin(bear * 11 + seed * 1.7)), 3);
        v += streak * 0.1 * (1 - ang / ray);
      }
    }
    data[o] = data[o + 1] = data[o + 2] = Math.round(Math.min(1, v) * 255);
    data[o + 3] = 255;
  }
  const t = new THREE.DataTexture(data, N, N, THREE.RGBAFormat);
  t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true;
  t.needsUpdate = true;
  return t;
}

const pole = new THREE.Vector3();
// Which way the moon's north and east lie across the sky, seen from latitude lat (degrees), for a
// moon in direction dir. The scene's north is -z. The moon's north points toward the sky's
// north pole, which stands lat degrees above the north horizon (below it in the south), so from
// the southern hemisphere the face is upside down. up and right are set (both unit, across the disc).
export function moonAxes(dir, lat, up, right) {
  const l = lat * RAD;
  pole.set(0, Math.sin(l), -Math.cos(l));
  up.copy(pole).addScaledVector(dir, -pole.dot(dir));
  if (up.lengthSq() < 1e-6) up.set(0, 1, 0).addScaledVector(dir, -dir.y); // (the moon right at the pole)
  up.normalize();
  right.crossVectors(dir, up).normalize(); // (looking along dir with up overhead, right is dir × up)
}
