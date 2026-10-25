// Tree forms, detail levels and trunks, with regional shape definitions.
import * as THREE from 'three';
import { mulberry32 } from '../../rng.js';
import { CONIFER_HABITS, TREE_SHAPES } from './tree-shapes.js';
export { TREE_SHAPES };
import { bakeAO, frond, merge, ribbon, rod, shadeVerts, sheet, soft, strap, twoSided, volumeNormals } from './primitives.js';
import { boulderCoral, brainCoral, platingCoral, staghorn, tableCoral } from './corals.js';

// ---------------------------------------------------------------- trees (unit: tiles, mature size)
export const MID = 0.5; // the in-between level of detail (see treeParts)
function trunk(h, r0, r1, color = 0xffffff, sides = 7) {
  const g = soft(new THREE.CylinderGeometry(r1, r0, h, sides, 3), { color, transform: g => g.translate(0, h / 2, 0), lump: r0 * 0.25, seed: 5 });
  // Collision clearance also needs the trunk, which is not a traversable limb.
  g.userData.canopyTrunks = [{ from: [0, 0, 0], to: [0, h, 0], r0: r0 * 1.25, r1: r1 * 1.25 }];
  return g;
}

// Evergreen crowns: a stack of dense, lobed branch tiers. Each tier is a skirt whose lobes are
// branches of varied length (now and then a short one leaves a gap), sagging at their tips and,
// for some species, curling up again at the very end; underneath, a darker belly closes it.
// The habit sets the look: Douglas-fir narrow and spiky, redcedar broad with drooping, upturned
// sprays, hemlock fine and soft with a nodding leader. Loblolly is a tall bare pole with tufts.
// lod: 0 close, 1 distant, MID the in-between model for the normal play zoom (the close model's
// outline with fewer points; it draws the same random numbers so the two match exactly)
function skirt(y, r, drop, h, rng, lod) {
  const far = lod === 1, mid = lod === MID;
  const per = far || mid ? 2 : 4, M = h.lobes * per, phase = rng() * 6.28;
  const lens = Array.from({ length: h.lobes }, () => rng() < h.gap ? 0.5 + rng() * 0.15 : 0.84 + rng() * 0.3);
  const reach = [], ang = [];
  for (let i = 0; i < M; i++) {
    const j = Math.floor(i / per), u = (i % per) / per, next = lens[(j + 1) % h.lobes];
    // a lobe's tip, its shoulders and the notch before the next branch
    const prof = per === 4 ? [1, 0.84, 0.62, 0.84][i % per] : [1, 0.64][i % per];
    reach.push(prof * (u <= 0.25 ? lens[j] : u >= 0.75 ? next : (lens[j] + next) / 2));
    ang.push(phase + (i / M) * Math.PI * 2 + (far ? 0 : (rng() - 0.5) * 0.05 * (mid ? 2 : 1)));
    if (mid) rng(); // (as many draws as the close model, two points per lobe-quarter pair)
  }
  // (the distant model is one ring and a flat belly: a few dozen triangles per tier)
  const rings = far ? [1] : mid ? [0.55, 1] : [0.38, 0.72, 1], pos = [y], top = [], belly = [];
  const vert = (s, i) => {
    const f = reach[i], tip = Math.min(1, Math.max(0, (f - 0.6) / 0.4)), end = Math.min(1, Math.max(0, (s - 0.7) / 0.3));
    const yy = y - drop * (0.3 * s + 0.7 * s ** 1.6) - h.sag * drop * s * s * tip + h.curl * drop * end * end * tip;
    return [Math.cos(ang[i]) * r * s * f, yy, Math.sin(ang[i]) * r * s * f];
  };
  const P = [[0, y + drop * 0.12, 0]];
  for (const s of rings) for (let i = 0; i < M; i++) P.push(vert(s, i));
  const id = (ring, i) => 1 + ring * M + (i % M);
  for (let i = 0; i < M; i++) top.push(0, id(0, i + 1), id(0, i));
  for (let k = 0; k + 1 < rings.length; k++) for (let i = 0; i < M; i++) {
    const a = id(k, i), b = id(k, i + 1), c = id(k + 1, i + 1), d = id(k + 1, i);
    top.push(a, b, c, a, c, d);
  }
  // the belly: from the rim back in, a little above it, to the trunk
  const rim = rings.length - 1, B0 = P.length;
  for (let i = 0; i < M; i++) P.push([Math.cos(ang[i]) * r * 0.3 * reach[i], y - drop * 0.82, Math.sin(ang[i]) * r * 0.3 * reach[i]]);
  P.push([0, y - drop * 0.62, 0]);
  const C = P.length - 1;
  for (let i = 0; i < M; i++) {
    const a = id(rim, i), b = id(rim, i + 1), c = B0 + (i + 1) % M, d = B0 + i;
    if (far || mid) belly.push(a, b, C); else belly.push(a, b, c, a, c, d, d, c, C);
  }
  const build = (idx, shade) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(P.flat(), 3)); g.setIndex(idx);
    return shade(soft(g, { lump: r * 0.05, seed: Math.floor(rng() * 1e4) }));
  };
  return [
    build(top, g => shadeVerts(g, (x, yy, z) => 0.66 + 0.46 * Math.min(1, Math.hypot(x, z) / r) ** 1.5)),
    build(belly, g => shadeVerts(g, () => 0.52)),
  ];
}
function pineTree(opts, seed, lod) {
  // Mature loblolly keeps an open, high crown of needle clusters on a long bare bole.
  const { height: H, radius: R } = opts, base = H * (opts.base ?? 0.57);
  const pos = [], col = [], cores = [], limbs = [trunk(H * 0.96, 0.07, 0.012)];
  for (let k = 0, n = lod ? 5 : 7; k < n; k++) {
    const a = k * 2.4, t = k / (n - 1), d = R * (0.65 - t * 0.4);
    const x = Math.cos(a) * d, z = Math.sin(a) * d, y = H * (0.7 + t * 0.25);
    const cluster = soft(new THREE.IcosahedronGeometry(1, lod ? 0 : 1), {
      seed: seed + k, lump: 0.13, transform: g => g.scale(R * 0.6, H * 0.07, R * 0.53).translate(x, y, z) });
    shadeVerts(cluster, () => 0.8 + t * 0.2); cores.push(cluster);
    limbs.push(rod([0, base, 0], [x, y, z], 0.018, 0.005));
    if (!lod) for (let j = 0; j < 4; j++) frond({ base: [x, y, z], az: a + j * Math.PI / 2,
      elev: 0.16, droop: 0.15, L: R * 0.62, n: 5, w: R * 0.16, segs: 3,
      bare: 0.05, v: 0.1, rib: 0.003, fill: 0.95, sweep: 0.08, hang: 0.15, shade: 0.88 }, pos, col);
  }
  return { crown: lod ? merge(cores) : merge([...cores, twoSided(sheet(pos, col))]), trunk: merge(limbs) };
}
export function conifer(opts, seed, lod = 0) {
  if (opts.habit === 'pine') return pineTree(opts, seed, lod === MID ? 0 : lod);
  const rng = mulberry32(seed), { height: H, radius: R, tiers } = opts, h = CONIFER_HABITS[opts.habit] || CONIFER_HABITS.fir;
  const base = H * h.base, n = lod === 1 ? Math.ceil((tiers + 2) * 0.6) : tiers + 2, parts = [];
  const span = H * 0.88 - base, drop = span / n * h.drop;
  for (let k = 0; k < n; k++) {
    const t = k / (n - 1), y = base + drop + (span - drop) * t;
    const r = R * Math.pow(1 - t * 0.94, h.profile) * (0.92 + rng() * 0.16) + 0.03;
    const [top, belly] = skirt(y, r, drop * (1 - t * 0.35), h, rng, lod);
    parts.push(shadeVerts(top, () => 0.86 + t * 0.2), belly); // (the lower, shaded tiers a little darker)
  }
  // the leader: a slim spire of new growth
  parts.push(soft(new THREE.ConeGeometry(R * 0.1, H * 0.16, lod ? 4 : 6, 1), { transform: g => g.translate(0, H * 0.91, 0) }));
  const crown = merge(parts);
  volumeNormals(crown, 0, 0, 0, 0.4, true);
  if (h.nod) { // (a hemlock's leader droops over)
    const p = crown.attributes.position;
    for (let i = 0; i < p.count; i++) { const y = p.getY(i), u = (y - H * 0.72) / (H * 0.28); if (u > 0) { p.setX(i, p.getX(i) + u * u * R * h.nod); p.setY(i, y - u * u * H * 0.035); } }
  }
  return { crown, trunk: trunk(base + 0.35, h.trunkR, 0.035) };
}

// Broadleaf crowns grow on a branching scaffold: main limbs fork into smaller branches, and
// each branch tip carries a leafy clump on the crown's outer shell. That gives a lobed outline
// with gaps at its edges where limbs show through, a shaded interior and a sunlit top. The habit
// sets the envelope and how the limbs rise: 'round' (alder, ash, maple), 'spread' (oaks: wide,
// low, near-level limbs), 'spire' (cottonwood, tulip poplar: tall and upright), 'layered'
// (dogwood: flat tiers) and 'vase' (redbud: a V that opens into a broad top).
export function broadleaf(opts, seed, lod = 0) {
  // (the in-between model is the close one with plainer leaf clumps: same branches, same outline)
  if (lod === MID) return broadleaf(opts, seed, -1);
  const rng = mulberry32(seed), { height: H, rx, ry, trunkH, trunkR = 0.06 } = opts;
  const habit = opts.habit || 'round', cy = H - ry;
  const crownParts = [], limbs = [];
  const forkY = habit === 'spread' ? trunkH * 0.75 : habit === 'vase' ? Math.min(trunkH, H * 0.22) : habit === 'spire' ? Math.min(trunkH, cy - ry * 0.6) : trunkH * 0.9;
  limbs.push(trunk(forkY + 0.06, trunkR, trunkR * 0.62));
  // the crown's centre leans a little off the trunk, as real crowns grow toward the light
  const lx = (rng() - 0.5) * rx * 0.16, lz = (rng() - 0.5) * rx * 0.16;
  const shell = (a, e, f = 1) => [lx + Math.cos(e) * Math.cos(a) * rx * f, cy + Math.sin(e) * ry * f, lz + Math.cos(e) * Math.sin(a) * rx * f];
  const clump = (c, s, sy, shade, salt) => {
    const g = soft(new THREE.IcosahedronGeometry(1, lod ? 0 : 1), { seed: seed + salt, lump: lod === -1 ? 0.14 : 0.09,
      transform: g => g.scale(s, s * sy, s).translate(...c) });
    // dark underneath, bright where it faces the sky
    shadeVerts(g, (x, y) => shade * (0.62 + 0.48 * Math.min(1, Math.max(0, (y - c[1]) / (s * sy) * 0.5 + 0.5))));
    crownParts.push(g);
  };
  // elevation of the limbs' targets on the crown shell, by habit
  const elev = t => habit === 'spread' ? -0.15 + t * 0.75 : habit === 'spire' ? -0.35 + t * 1.25
    : habit === 'vase' ? 0.15 + t * 0.7 : -0.3 + t * 1.05;
  const primaries = habit === 'layered' ? 0 : lod === 1 ? 4 : habit === 'spire' ? 6 : 5, seconds = lod === 1 ? 2 : 3;
  for (let k = 0; k < primaries; k++) {
    const t = (k + 0.5) / primaries, a = k * 2.4 + rng() * 0.5, e = elev(t);
    const end = shell(a, e, 0.55), r0 = trunkR * 0.62, r1 = trunkR * 0.32;
    const from = [0, forkY, 0], kink = [end[0] * 0.5, forkY + (end[1] - forkY) * (habit === 'spread' ? 0.35 : 0.55), end[2] * 0.5];
    limbs.push(rod(from, kink, r0, (r0 + r1) / 2, lod ? 4 : 5), rod(kink, end, (r0 + r1) / 2, r1, lod ? 4 : 5));
    for (let j = 0; j < seconds; j++) {
      const aa = a + (j - (seconds - 1) / 2) * 0.62 + (rng() - 0.5) * 0.2, ee = e + (rng() - 0.4) * 0.5 + (habit === 'spire' ? 0.15 : 0);
      const tip = shell(aa, ee, 0.68 + rng() * 0.3); // (some branches reach further than others: a lobed outline)
      if (lod !== 1) limbs.push(rod(end, tip, r1, r1 * 0.3, 3));
      const s = rx * (0.24 + rng() * 0.16) * (habit === 'spire' ? 0.85 : 1);
      clump(tip, s, habit === 'spread' ? 0.62 : 0.78, 0.9 + Math.sin(ee) * 0.12 + rng() * 0.06, k * 10 + j);
    }
  }
  if (habit === 'layered') {
    // flat tiers of foliage held out on level branches
    for (let tier = 0; tier < 3; tier++) {
      const y = cy - ry * 0.55 + tier * ry * 0.62, f = 1 - tier * 0.28, n = lod === 1 ? 4 - Math.floor(tier / 2) : 6 - tier;
      for (let k = 0; k < n; k++) {
        const a = k / n * 6.28 + tier * 0.9 + rng() * 0.4, d = rx * f * (0.62 + rng() * 0.18);
        const tip = [lx * f + Math.cos(a) * d, y, lz * f + Math.sin(a) * d];
        limbs.push(rod([0, Math.min(y, forkY + tier * 0.12), 0], tip, trunkR * 0.4, trunkR * 0.12, lod ? 3 : 4));
        clump(tip, rx * 0.3 * (0.85 + rng() * 0.3), 0.42, 0.88 + tier * 0.08, 300 + tier * 10 + k);
      }
    }
  }
  // a leafy core, set back inside the shell, so the crown is full in the middle and open at its edges
  const core = habit === 'layered' ? 0 : lod === 1 ? 1 : 2;
  for (let k = 0; k < core; k++) {
    const a = k * 2.1 + rng(), c = shell(a, habit === 'spread' ? 0.2 : 0.15 + k * 0.2, 0.32);
    clump(c, rx * (habit === 'spire' ? 0.38 : 0.44), habit === 'spread' ? 0.6 : 0.85, 0.66, 200 + k);
  }
  // the crown's top: a sunlit clump or two
  if (habit !== 'layered') clump(shell(rng() * 6.28, 1.25, 0.82), rx * 0.34, habit === 'spread' ? 0.55 : 0.75, 1.06, 250);
  const crown = merge(crownParts); volumeNormals(crown, lx, cy, lz, 0.35);
  return { crown, trunk: merge(limbs) };
}

// Winter silhouette for deciduous trees: trunk and bare branches.
// lod: 0 every twig, 1 distant (no finest twigs, four-sided limbs), 3 far (the main limbs only,
// three-sided). The same limbs in the same places at every level.
export function bareTree(opts, seed, lod = 0) {
  const r = mulberry32(seed + 7);
  const { height: H, trunkR = 0.06 } = opts, trunkH = opts.trunkH ?? H * (opts.fork ?? 0.62); // (emergent crowns like ceiba and guanacaste give no trunk height)
  const sides = lod === 3 ? 3 : lod === 1 ? 4 : 5, finest = lod === 3 ? 2 : lod === 1 ? 1 : 0;
  const parts = [trunk(trunkH, trunkR, trunkR * 0.7, 0xffffff, lod ? 5 : 7)];
  const branch = (x, y, z, len, rad, ax, az, depth) => {
    // Every limb still draws its random numbers, so the retained limbs do not move.
    const shown = lod === 3 ? len * 1.9 : len;
    const ex = x - Math.sin(az) * len * Math.cos(ax), ey = y + Math.cos(az) * Math.cos(ax) * len, ez = z + Math.sin(ax) * len;
    if (depth >= finest) {
      const c = soft(new THREE.CylinderGeometry(rad * .6, rad, shown, sides), { transform: g => { g.translate(0, shown / 2, 0); g.rotateX(ax); g.rotateZ(az); g.translate(x, y, z); } });
      c.userData.canopyBranches = [{ from: [x, y, z], to: [x - Math.sin(az) * shown * Math.cos(ax), y + Math.cos(az) * Math.cos(ax) * shown, z + Math.sin(ax) * shown], r0: rad, r1: rad * .6 }];
      parts.push(c);
    }
    if (depth <= 0) return;
    for (let k = 0; k < 2; k++) branch(ex, ey, ez, len * 0.66, rad * 0.62, ax + (r() - 0.5) * 0.9, az + (k ? 0.5 : -0.5) + (r() - 0.5) * 0.4, depth - 1);
  };
  for (let k = 0; k < 6; k++) {
    const a = k / 6 * Math.PI * 2 + r();
    branch(0, trunkH * 0.9, 0, (H - trunkH) * 0.45, trunkR * 0.55, Math.sin(a) * 0.6, Math.cos(a) * 0.6, 2);
  }
  return merge(parts);
}

// Sizes in tiles. Kept a little under one tile across so forests have depth, not a solid carpet.

// Crown and trunk for any tree shape.
export function treeParts(shape, seed, lod = 0) {
  const t = treePartsRaw(shape, seed, lod);
  bakeAO(t.crown, 'crown'); bakeAO(t.trunk, 'base');
  return t;
}
function treePartsRaw(shape, seed, lod) {
  // (only the conifers and broadleaf crowns have an in-between model; the rest use their close one)
  if (lod === MID && shape.kind !== 'conifer' && shape.kind !== 'broad' && shape.kind) lod = 0;
  switch (shape.kind) {
    case 'conifer': return conifer(shape, seed, lod);
    case 'palm': return palm(shape, seed, lod);
    case 'oilpalm': return oilPalm(shape, seed, lod);
    case 'banana': return banana(shape, seed, lod);
    case 'fanpalm': return fanPalm(shape, seed, lod);
    case 'cecropia': return cecropia(shape, seed, lod);
    case 'emergent': return emergent(shape, seed, lod);
    case 'baobab': return baobab(shape, seed, lod);
    case 'euphorbia': return euphorbia(shape, seed, lod);
    case 'mangrove': return mangrove(shape, seed, lod);
    case 'staghorn': return staghorn(shape, seed, lod);
    case 'tablecoral': return tableCoral(shape, seed, lod);
    case 'boulder': return boulderCoral(shape, seed, lod);
    case 'brain': return brainCoral(shape, seed, lod);
    case 'plating': return platingCoral(shape, seed, lod);
    default: return broadleaf(shape, seed, lod);
  }
}

// ---------------------------------------------------------------- tropical trees
// Palms: slender, slightly curving trunks (one or a clump) topped with arching pinnate fronds.
export function palm(opts, seed, lod = 0) {
  const r = mulberry32(seed);
  const trunks = [], shafts = [], pos = [], col = [];
  const stems = opts.stems || 1;
  for (let s = 0; s < stems; s++) {
    const a = r() * 6.28, lean = stems > 1 ? 0.12 + r() * 0.18 : r() * 0.08;
    const H = opts.height * (stems > 1 ? 0.7 + r() * 0.35 : 1);
    const bx = Math.cos(a) * (stems > 1 ? 0.07 : 0), bz = Math.sin(a) * (stems > 1 ? 0.07 : 0);
    const tx = bx + Math.cos(a) * lean * H * 0.35, tz = bz + Math.sin(a) * lean * H * 0.35;
    // trunk in two segments so it can curve
    for (let k = 0; k < 2; k++) {
      const y0 = H * k / 2, y1 = H * (k + 1) / 2, f0 = (k / 2) ** 1.6, f1 = ((k + 1) / 2) ** 1.6;
      const x0 = bx + (tx - bx) * f0, z0 = bz + (tz - bz) * f0, x1 = bx + (tx - bx) * f1, z1 = bz + (tz - bz) * f1;
      const len = Math.hypot(x1 - x0, y1 - y0, z1 - z0);
      const c = soft(new THREE.CylinderGeometry(0.022, 0.028, len, lod ? 5 : 6), { transform: g => {
        g.translate(0, len / 2, 0);
        const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(x1 - x0, y1 - y0, z1 - z0).normalize());
        g.applyQuaternion(q); g.translate(x0, y0, z0);
      } });
      c.userData.canopyTrunks = [{ from: [x0, y0, z0], to: [x1, y1, z1], r0: .028, r1: .022 }];
      trunks.push(c);
    }
    const n = lod ? 6 : 9;
    for (let k = 0; k < n; k++) {
      const d = k / n * 6.28 + r() * 0.4;
      // Preserve the trunk's seeded variation; replace each solid strap with a feathered frond.
      const len = 0.5 + r() * 0.15, bend = 1.3 + r() * 0.4, tilt = 0.35 + r() * 0.3, u = k / (n - 1);
      frond({ base: [tx, H, tz], az: d, elev: 1.05 - u * 0.98 + (tilt - 0.5) * 0.2,
        droop: bend + u * 0.35, L: len * (0.85 + u * 0.42), n: lod ? 5 : 10,
        w: 0.09 + u * 0.035, segs: lod ? 3 : 5, bare: 0.12, rib: 0.006,
        v: 0.2, sweep: 0.28, hang: 0.25, fill: lod ? 1.1 : 0.9, shade: 1 - u * 0.12 }, pos, col);
    }
    shafts.push(rod([tx, H - 0.07, tz], [tx, H + 0.035, tz], 0.021, 0.012, 5));
  }
  const crown = merge([twoSided(sheet(pos, col)), ...shafts]);
  return { crown, trunk: merge(trunks) };
}

// African oil palm, 20-odd years after planting: one stout, straight trunk armoured with the cut
// stubs of old frond bases spiralling up it (a few ferns rooted among them), under a big, dense,
// even crown of long pinnate fronds: the young ones near upright round a furled spear, the old
// ones arching out and drooping, yellowing a little. The fruit bunches wedged in among the frond
// bases are a part of their own (`fruit`), drawn in the berry colour while the palm is fruiting.
// About 2 tiles across. Triangles (lod 0 / 1): crown ~2000 / ~480, trunk ~600 / 120, fruit 240 / 40.
export function oilPalm(opts, seed, lod = 0) {
  const r = mulberry32(seed), H = opts.height, top = H * 0.7;
  const pos = [], col = [], n = lod ? 13 : 22;
  for (let k = 0; k < n; k++) {
    const u = k / (n - 1), az = k * 2.39996 + (r() - 0.5) * 0.3, old = Math.max(0, u - 0.62) / 0.38;
    frond({ base: [Math.cos(az) * 0.05, top + 0.06 - u * 0.13, Math.sin(az) * 0.05], az,
      elev: 1.2 - 1.0 * u + (r() - 0.5) * 0.12, droop: 0.5 + 1.3 * u + r() * 0.15, L: (0.76 + 0.46 * u) * (0.94 + r() * 0.12),
      n: lod ? 6 : 12, w: (lod ? 0.22 : 0.23) + 0.04 * u, segs: lod ? 3 : 4, bare: 0.14, v: lod ? 0.35 : 0.5, sweep: lod ? 0.55 : 0.6, rib: 0.016, fill: lod ? 1.1 : 0.75, hang: 0.4,
      shade: 0.94 + r() * 0.12 - old * 0.06, tint: [1 + old * 0.16, 1, 1 - old * 0.32] }, pos, col);
  }
  // the spear: the next frond, still furled, standing straight up out of the middle
  strap({ base: [0, top + 0.03, 0], az: r() * 6.28, elev: 1.5, droop: 0.12, L: 0.34, w: 0.022, segs: 2, shade: 1.08, tint: [1.1, 1.08, 0.8] }, pos, col);
  const leaves = [sheet(pos, col)];
  // ferns rooted in the old frond bases, hanging out from the trunk
  if (!lod) for (let k = 0; k < 3; k++) {
    const a = r() * 6.28, y = 0.45 + k * 0.2 + r() * 0.1;
    for (let j = 0; j < 4; j++) {
      const f = ribbon(0.11 + r() * 0.04, 0.022, 0.9, 3, Math.PI / 2 - a + (j - 1.5) * 0.45, 0.9 + r() * 0.4, Math.cos(a) * 0.08, Math.sin(a) * 0.08, 0xffffff, 0.02);
      leaves.push(shadeVerts(f.translate(0, y, 0), () => [1.25, 1.22, 0.85]));
    }
  }
  const crown = twoSided(merge(leaves));
  // trunk: a little swollen at the foot, its stubs cut flat, older and fewer toward the ground
  const tr = [soft(new THREE.CylinderGeometry(0.075, 0.09, top + 0.05, lod ? 6 : 9, lod ? 1 : 4), { lump: 0.014, seed, transform: g => g.translate(0, (top + 0.05) / 2, 0) })];
  tr[0].userData.canopyTrunks = [{ from: [0, 0, 0], to: [0, top + .05, 0], r0: .09, r1: .075 }];
  const ns = lod ? 12 : 32;
  for (let j = 0; j < ns; j++) {
    const y = 0.3 + (top - 0.3) * j / (ns - 1), a = j * 2.39996 + r() * 0.3, len = 0.05 + r() * 0.025, wd = 0.034 + r() * 0.01;
    const stub = soft(new THREE.CylinderGeometry(wd, wd * 0.75, len, 4, 1, !!lod), { transform: g => {
      g.rotateY(Math.PI / 4); g.scale(1, 1, 0.45); g.translate(0, len / 2, 0); g.rotateZ(-0.75 - r() * 0.3); g.translate(0.062, y, 0); g.rotateY(-a);
    } });
    tr.push(shadeVerts(stub, (x, yy) => (yy > y + 0.025 ? 1.18 : 0.82) * (0.85 + (j % 3) * 0.08)));
  }
  // fruit bunches: knobbly ovals of tightly packed fruit, black-red on top, fiery orange below
  const fr = [];
  for (let b = 0, nb = lod ? 2 : 3; b < nb; b++) {
    const a = b / nb * 6.28 + r() * 0.8, y = top - 0.06 + r() * 0.05, d = 0.1;
    const bunch = soft(new THREE.IcosahedronGeometry(0.045, lod ? 0 : 1), { seed: seed + b, lump: 0.024, transform: g => { g.scale(1, 1.15, 1); g.rotateZ(-0.4); g.rotateY(-a); g.translate(Math.cos(a) * d, y, Math.sin(a) * d); } });
    fr.push(shadeVerts(bunch, (x, yy, z) => (Math.hypot(x, z) > d + 0.012 && yy > y - 0.01 ? 0.32 : yy > y + 0.015 ? 0.5 : 1.0)));
  }
  return { crown, trunk: merge(tr), fruit: merge(fr) };
}

// Banana: not a tree but a giant herb. A smooth green "trunk" (the pseudostem, rolled leaf
// sheaths) under a crown of huge, blunt paddle leaves: the newest standing up round a furled
// one, the older arching out, the oldest hanging down dry and brown against the stem. A young
// sucker comes up at its foot. Its bunch (`fruit`) hangs from the top on a curving stalk: tiers
// of green hands, with the maroon flower bud (the heart) dangling at the end in the bark colour.
export function banana(opts, seed, lod = 0) {
  const r = mulberry32(seed), H = opts.height, top = H * 0.56;
  const pos = [], col = [], n = lod ? 6 : 9;
  for (let k = 0; k < n; k++) {
    const u = k / (n - 1), az = k * 2.39996 + (r() - 0.5) * 0.4;
    strap({ base: [Math.cos(az) * 0.025, top - u * 0.05, Math.sin(az) * 0.025], az, elev: 1.3 - 0.95 * u + (r() - 0.5) * 0.15, droop: 0.7 + 1.3 * u,
      L: 0.5 + 0.16 * u + r() * 0.08, w: 0.075 + r() * 0.012, segs: lod ? 3 : 7, blunt: true, fold: 0.1, twist: (r() - 0.5) * 0.4,
      shade: 0.95 + r() * 0.1, tint: u > 0.85 ? [1.05, 0.98, 0.8] : [1, 1, 1] }, pos, col);
  }
  // the newest leaf, still rolled into a spike
  strap({ base: [0, top, 0], az: r() * 6.28, elev: 1.52, droop: 0.05, L: 0.2, w: 0.016, segs: 2, shade: 1.1, tint: [1.08, 1.06, 0.88] }, pos, col);
  // old leaves hanging dead against the stem
  for (let k = 0, m = lod ? 1 : 2; k < m; k++) {
    const az = r() * 6.28;
    strap({ base: [Math.cos(az) * 0.035, top - 0.06, Math.sin(az) * 0.035], az, elev: -1.25, droop: 0.15, L: 0.22, w: 0.045, segs: 2, fold: 0.3, shade: 0.8, tint: [1.75, 1.15, 0.5] }, pos, col);
  }
  // a sucker at the foot: a short stem and a few small upright leaves
  const sa = r() * 6.28, sx = Math.cos(sa) * 0.09, sz = Math.sin(sa) * 0.09, sh = H * 0.16;
  for (let k = 0; k < (lod ? 2 : 4); k++) {
    const az = k * 2.39996 + r();
    strap({ base: [sx, sh, sz], az, elev: 1.1 - k * 0.15, droop: 0.3, L: 0.16 + r() * 0.04, w: 0.04, segs: 3, blunt: true, shade: 1.02, tint: [1.02, 1.04, 0.92] }, pos, col);
  }
  const crown = twoSided(sheet(pos, col));
  const stem = soft(new THREE.CylinderGeometry(0.036, 0.05, top, lod ? 6 : 9, 2), { lump: 0.006, seed, transform: g => g.translate(0, top / 2, 0) });
  shadeVerts(stem, (x, y) => [0.95 + 0.25 * (y / top), 1.1 + 0.15 * (y / top), 0.85]); // greener and paler toward the top
  const sucker = soft(new THREE.CylinderGeometry(0.018, 0.026, sh, 6, 1), { transform: g => g.translate(sx, sh / 2, sz) });
  shadeVerts(sucker, () => [1, 1.2, 0.9]);
  const heartAt = [0.14, top - 0.33, 0.03];
  const heart = soft(new THREE.IcosahedronGeometry(0.036, lod ? 0 : 1), { transform: g => { g.scale(0.8, 1.6, 0.8); g.rotateZ(0.2); g.translate(...heartAt); } });
  shadeVerts(heart, () => [1.15, 0.45, 0.75]); // (maroon, from the stem's bark colour)
  // the bunch: a stalk arching out from the crown and hanging down, ringed with tiers of hands
  const fr = [], stalk = [[0.02, top - 0.02, 0], [0.1, top - 0.05, 0.01], [0.135, top - 0.13, 0.02], [0.14, top - 0.3, 0.03]];
  for (let k = 1; k < stalk.length; k++) fr.push(rod(stalk[k - 1], stalk[k], 0.014, 0.011, 4));
  for (let t = 0, tiers = lod ? 4 : 6; t < tiers; t++) {
    const y = top - 0.1 - t * 0.03, rad = 0.05 - t * 0.003, cx = 0.135 + t * 0.001, cz = 0.022 + t * 0.001;
    for (let f = 0, nf = lod ? 6 : 10; f < nf; f++) {
      const a = f / nf * 6.28 + t * 0.4, ox = Math.cos(a) * rad, oz = Math.sin(a) * rad;
      fr.push(rod([cx + ox * 0.45, y, cz + oz * 0.45], [cx + ox * 1.2, y + 0.055, cz + oz * 1.2], 0.011, 0.008, lod ? 3 : 4)); // (bananas point up, curving away from the stalk)
    }
  }
  return { crown, trunk: merge([stem, sucker, heart]), fruit: merge(fr) };
}

// Buriti: one straight trunk and a round head of stiff fan leaves.
export function fanPalm(opts, seed, lod = 0) {
  const r = mulberry32(seed);
  const H = opts.height, parts = [], pos = [], col = [];
  const n = lod ? 7 : 12;
  for (let k = 0; k < n; k++) {
    const u = k / (n - 1), a = k * 2.39996 + r() * 0.3, up = 1.05 - u * 1.35 + (r() - 0.5) * 0.24;
    const joint = [Math.cos(a) * 0.2 * Math.cos(up), H + Math.sin(up) * 0.2 - u * 0.07, Math.sin(a) * 0.2 * Math.cos(up)];
    parts.push(rod([0, H - 0.025, 0], joint, 0.009, 0.004, 4));
    const at = (phi, t, fold = 0) => {
      const reach = Math.cos(phi) * 0.4 * t, side = Math.sin(phi) * 0.4 * t;
      return [joint[0] + Math.cos(a) * reach * Math.cos(up) - Math.sin(a) * side,
        joint[1] + reach * Math.sin(up) + fold * t - 0.035 * t * t,
        joint[2] + Math.sin(a) * reach * Math.cos(up) + Math.cos(a) * side];
    };
    const tri = (p, q, s, shade) => { pos.push(...p, ...q, ...s); for (let j = 0; j < 3; j++) col.push(shade, shade, shade); };
    // A joined inner web opens into pleated fingers, each narrowing to its own point.
    for (let j = 0, m = lod ? 7 : 11; j < m; j++) {
      const left = -1 + j / m * 2, right = -1 + (j + 1) / m * 2, mid = (left + right) / 2;
      const wl = at(left, 0.46), wr = at(right, 0.46), wm = at(mid, 0.46, 0.02);
      const tip = at(mid, 1, 0.012), ol = at(left + (right - left) * 0.16, 0.87), orr = at(right - (right - left) * 0.16, 0.87);
      tri(joint, wl, wm, 0.83); tri(joint, wm, wr, 0.95);
      tri(wl, ol, tip, 0.94); tri(wl, tip, wm, 1.04); tri(wm, tip, wr, 1.08); tri(wr, tip, orr, 0.98);
    }
  }
  strap({ base: [0, H + 0.025, 0], az: 0, elev: 1.48, droop: 0.08, L: 0.3, w: 0.022, segs: 2, shade: 1.08 }, pos, col);
  // a skirt of dead brown fronds hanging below the crown
  for (let k = 0; k < (lod ? 3 : 6); k++) {
    const a = r() * 6.28;
    const dead = ribbon(0.3, 0.05, 0.3, 2, a, 2.6, 0, 0, 0x8a6a40);
    dead.translate(0, H - 0.02, 0);
    parts.push(dead);
  }
  const crown = merge([twoSided(sheet(pos, col)), twoSided(merge(parts))]);
  return { crown, trunk: trunk(H, 0.06, 0.05) };
}

// Cecropia: a pale, bare trunk forking into a few upturned branches, each ending in a flat
// umbrella of huge hand-shaped leaves.
export function cecropia(opts, seed, lod = 0) {
  const r = mulberry32(seed);
  const H = opts.height, fork = H * 0.62;
  const limbs = [trunk(fork + 0.05, 0.045, 0.035)], leaves = [];
  const n = 3 + Math.floor(r() * 2);
  for (let k = 0; k < n; k++) {
    const a = k / n * 6.28 + r() * 0.5, len = H - fork + (r() - 0.5) * 0.2, out = 0.22 + r() * 0.15;
    const ex = Math.cos(a) * out, ez = Math.sin(a) * out, ey = fork + len;
    const b = rod([0, fork, 0], [ex, ey, ez], .026, .018);
    limbs.push(b);
    // umbrella: a few overlapping flattened lobes, pale underneath
    for (let l = 0; l < (lod ? 3 : 6); l++) {
      const la = l / 6 * 6.28 + r() * 0.4, lr = 0.1 + r() * 0.04;
      const lobe = soft(new THREE.IcosahedronGeometry(lr, lod ? 0 : 1), { transform: g => {
        g.scale(1.5, 0.22, 0.8); g.rotateY(-la); g.translate(ex + Math.cos(la) * lr * 0.9, ey + 0.02 - l * 0.004, ez + Math.sin(la) * lr * 0.9);
      } });
      shadeVerts(lobe, (x, y) => (y > ey ? 1 : 0.72));
      leaves.push(lobe);
    }
  }
  const crown = merge(leaves);
  volumeNormals(crown, 0, H, 0, 0.35);
  return { crown, trunk: merge(limbs) };
}

// Emergents (Brazil nut, kapok): a tall, straight, clean trunk rising above the canopy to a
// broad, flat-topped crown. Kapoks stand on great buttress roots.
export function emergent(opts, seed, lod = 0) {
  if (opts.fork) return thornTree(opts, seed, lod);
  const r = mulberry32(seed);
  const { height: H, rx, ry, trunkR } = opts;
  const cy = H - ry * 0.9, parts = [];
  // Great limbs fan out from the top of the trunk, and every leaf clump grows on one of them:
  // one over each limb's end (hiding it) and the rest along it, so no clump hangs in the air.
  // (the clumps' random numbers are drawn first, as they always were, so the limbs that monkeys
  // climb keep their places)
  const nB = lod ? 9 : 16, rolls = Array.from({ length: nB }, () => [r(), r(), r(), r()]);
  const limbs = [trunk(cy, trunkR, trunkR * 0.72)], base = [0, cy - ry * .4, 0], tips = [];
  for (let k = 0; k < 5; k++) {
    const a = k / 5 * 6.28 + r() * 0.5, len = rx * 0.75;
    const tip = [Math.cos(a) * Math.sin(1.05) * len, base[1] + Math.cos(1.05) * len, Math.sin(a) * Math.sin(1.05) * len];
    tips.push(tip);
    limbs.push(rod(base, tip, trunkR * .5, trunkR * .28));
  }
  for (let b = 0; b < nB; b++) {
    const [r0, r1, r2, r3] = rolls[b], tip = tips[b % tips.length], d = Math.hypot(tip[0], tip[2]);
    const t = b < tips.length ? 1 : 0.45 + r0 * 0.5, side = (r1 - 0.5) * rx * 0.3;
    const x = tip[0] * t - tip[2] / d * side, z = tip[2] * t + tip[0] / d * side, y = base[1] + (tip[1] - base[1]) * t + (r2 - 0.5) * ry * 0.3;
    const s = rx * (lod ? 0.36 : 0.3) * (0.7 + r3 * 0.5);
    const blob = soft(new THREE.IcosahedronGeometry(s, lod ? 0 : 1), { seed: seed + b * 5, lump: s * 0.25, transform: g => { g.scale(1, 0.62, 1); g.translate(x, y, z); } });
    shadeVerts(blob, (xx, yy) => 0.82 + Math.min(0.24, Math.max(0, (yy - y) / s * 0.5 + 0.5) * 0.24));
    parts.push(blob);
  }
  const crown = merge(parts);
  volumeNormals(crown, 0, cy, 0, 0.5);
  if (opts.buttress) for (let k = 0; k < 5; k++) {
    const a = k / 5 * 6.28 + r() * 0.4;
    const fin = soft(new THREE.BoxGeometry(0.34, 0.5, 0.025), { transform: g => {
      // taper the fin into a triangle: narrow at the top, spreading along the ground
      const p = g.attributes.position;
      for (let i = 0; i < p.count; i++) { const y = p.getY(i); if (y > 0) p.setX(i, p.getX(i) * 0.12 - 0.12); }
      g.translate(0.17, 0.25, 0); g.rotateY(-a);
    } });
    limbs.push(fin);
  }
  return { crown, trunk: merge(limbs) };
}

// Thorn-tree foliage follows spreading, repeatedly forked branches in a shallow crown.
// Tall rainforest emergents retain their existing geometry above.
function thornTree(opts, seed, lod) {
  const r = mulberry32(seed), { height: H, rx, ry, trunkR } = opts, cy = H - ry * 0.9, fh = cy * opts.fork;
  const limbs = [trunk(fh + 0.04, trunkR, trunkR * 0.85)], leaves = [], n = lod ? 4 : 6;
  const cloud = (p, sx, sy, sz, salt) => {
    const g = soft(new THREE.IcosahedronGeometry(1, lod ? 0 : 1), { seed: seed + salt, lump: 0.1,
      transform: g => g.scale(sx, sy, sz).translate(...p) });
    shadeVerts(g, (x, y) => 0.8 + Math.min(0.24, Math.max(0, (y - cy + ry) / (ry * 2)) * 0.24)); leaves.push(g);
  };
  for (let k = 0; k < n; k++) {
    const a = k / n * 6.28 + r() * 0.35, d = rx * (0.56 + r() * 0.1), y = cy + (r() - 0.5) * ry * 0.25;
    const elbow = [Math.cos(a) * d * 0.38, fh + (y - fh) * 0.6, Math.sin(a) * d * 0.38];
    const tip = [Math.cos(a) * d, y, Math.sin(a) * d * 0.9];
    limbs.push(rod([0, fh, 0], elbow, trunkR * 0.7, trunkR * 0.37));
    limbs.push(rod(elbow, tip, trunkR * 0.37, trunkR * 0.1));
    cloud(tip, rx * 0.39, ry * 0.88, rx * 0.35, k * 7);
    for (let j = 0, m = lod ? 1 : 2; j < m; j++) {
      const aa = a + (j ? -0.35 : 0.35), out = [Math.cos(aa) * rx * 0.82, y - ry * 0.12, Math.sin(aa) * rx * 0.74];
      limbs.push(rod(elbow, out, trunkR * 0.26, trunkR * 0.07, 4));
      cloud(out, rx * 0.24, ry * 0.64, rx * 0.22, 100 + k * 2 + j);
    }
  }
  cloud([0, cy + ry * 0.06, 0], rx * 0.42, ry * 0.94, rx * 0.38, 201);
  const crown = merge(leaves); volumeNormals(crown, 0, cy, 0, 0.5);
  return { crown, trunk: merge(limbs) };
}

// Baobab: a swollen bottle of a trunk, stubby branches like roots in the air, a thin crown.
export function baobab(opts, seed, lod = 0) {
  const r = mulberry32(seed), H = opts.height;
  const top = H * 0.62;
  const profile = [[0.001, 0], [0.3, 0.02], [0.33, top * 0.2], [0.31, top * 0.55], [0.24, top * 0.85], [0.17, top], [0.001, top + 0.02]]
    .map(([x, y]) => new THREE.Vector2(x, y));
  const limbs = [soft(new THREE.LatheGeometry(profile, lod ? 7 : 11), { lump: 0.02, seed })];
  const leaves = [];
  const n = lod ? 5 : 7;
  for (let k = 0; k < n; k++) {
    const a = k / n * 6.28 + r() * 0.5, out = 0.28 + r() * 0.18, up = 0.25 + r() * 0.2;
    const tip = [Math.cos(a) * out, top + up, Math.sin(a) * out];
    limbs.push(rod([Math.cos(a) * 0.08, top - 0.02, Math.sin(a) * 0.08], tip, 0.07, 0.035));
    // a stubby side branch
    const t2 = [tip[0] * 1.35 + (r() - 0.5) * 0.1, tip[1] + 0.08, tip[2] * 1.35 + (r() - 0.5) * 0.1];
    limbs.push(rod(tip, t2, 0.035, 0.018, 4));
    for (const p of [tip, t2]) {
      const s = 0.12 + r() * 0.05;
      const blob = soft(new THREE.IcosahedronGeometry(s, lod ? 0 : 1), { seed: seed + k * 7, lump: s * 0.3, transform: g => { g.scale(1, 0.55, 1); g.translate(p[0], p[1] + 0.03, p[2]); } });
      shadeVerts(blob, (xx, yy) => (yy > p[1] + 0.03 ? 1 : 0.78));
      leaves.push(blob);
    }
  }
  const crown = merge(leaves);
  volumeNormals(crown, 0, top + 0.3, 0, 0.5);
  return { crown, trunk: merge(limbs) };
}

// Red mangrove: a dense, dark, rounded crown held up on a tangle of arching stilt roots that
// spring out of the trunk and bow down into the mud and water.
export function mangrove(opts, seed, lod = 0) {
  const r = mulberry32(seed), H = opts.height, base = H * 0.36;
  const limbs = [rod([0, H * 0.14, 0], [0, H * 0.62, 0], 0.045, 0.035)];
  const nRoots = lod ? 6 : 10;
  for (let k = 0; k < nRoots; k++) {
    const a = k / nRoots * 6.28 + r() * 0.4, h0 = base * (0.55 + r() * 0.5), out = 0.3 + r() * 0.14;
    const controlY = h0 + 0.06 + r() * 0.05;
    const at = t => {
      const u = 1 - t, d = u * u * 0.03 + 2 * u * t * out * 0.45 + t * t * out;
      return [Math.cos(a) * d, u * u * h0 + 2 * u * t * controlY - t * t * 0.06, Math.sin(a) * d];
    };
    for (let j = 0, m = lod ? 2 : 4; j < m; j++) limbs.push(rod(at(j / m), at((j + 1) / m), 0.023 - j / m * 0.011, 0.023 - (j + 1) / m * 0.011, lod ? 4 : 5));
    if (!lod && k % 3 === 0) limbs.push(rod(at(0.58), [Math.cos(a + 0.18) * out, -0.06, Math.sin(a + 0.18) * out], 0.015, 0.009, 4));
  }
  const leaves = [], n = lod ? 5 : 9;
  for (let k = 0; k < n; k++) {
    const a = k / n * 6.28 + r(), d = k === 0 ? 0 : 0.18 + r() * 0.22, s = 0.2 + r() * 0.08;
    const p = [Math.cos(a) * d, H * 0.72 + r() * 0.14 - d * 0.25, Math.sin(a) * d];
    if (k > 0) limbs.push(rod([0, H * 0.58, 0], [p[0], p[1] - 0.025, p[2]], 0.024, 0.007, lod ? 4 : 5));
    const blob = soft(new THREE.IcosahedronGeometry(s, lod ? 0 : 1), { seed: seed + k * 5, lump: s * 0.25, transform: g => { g.scale(1, 0.7, 1); g.translate(p[0], p[1], p[2]); } });
    shadeVerts(blob, (xx, yy) => (yy > p[1] ? 1 : 0.75));
    leaves.push(blob);
  }
  const crown = merge(leaves);
  volumeNormals(crown, 0, H * 0.75, 0, 0.45);
  return { crown, trunk: merge(limbs) };
}

// Candelabra tree: a short trunk holding up a crown of thick green succulent arms that curve
// out and then straight up. The arms are the "leaves" (painted with the leaf colour).
export function euphorbia(opts, seed, lod = 0) {
  const r = mulberry32(seed), H = opts.height, base = H * 0.28;
  const arms = [];
  arms.push(rod([0, base, 0], [0, H, 0], 0.075, 0.06, 6));
  const n = lod ? 6 : 10;
  for (let k = 0; k < n; k++) {
    const a = k / n * 6.28 + r() * 0.4, tier = base + 0.08 + (k % 3) * 0.12, out = 0.22 + r() * 0.2, rise = H * (0.55 + r() * 0.35);
    const elbow = [Math.cos(a) * out, tier + 0.1, Math.sin(a) * out];
    arms.push(rod([0, tier, 0], elbow, 0.055, 0.05, 5));
    arms.push(rod(elbow, [elbow[0], Math.min(H, tier + rise * 0.6), elbow[2]], 0.05, 0.042, 5));
  }
  const crown = merge(arms);
  return { crown, trunk: trunk(base + 0.05, 0.085, 0.075) };
}
