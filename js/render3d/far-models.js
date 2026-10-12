// The farthest level of detail for trees and shrubs, drawn when the whole valley is in view and a
// crown is a dozen pixels across. Each is made from the plant's own distant model, so it keeps
// that model's outline, colours and snow line at a fraction of the triangles:
// - a crown or shrub of leafy clumps (most broadleaves and bushes) keeps its biggest clumps, each
//   as an eight-sided diamond in the clump's place, size and colours, so it stays clumpy with
//   gaps between;
// - a conifer becomes a stack of four six-sided rings between a top and a bottom point, each as
//   wide as the model typically is at that height and in that direction (a spire stays a spire),
//   coloured like that slice of the model, its shaded inside included;
// - a trunk becomes a tapered five-sided post as tall and thick as the model's stem;
// - anything else (palm fronds, bamboo canes, corals) keeps its distant model: no far model.
import * as THREE from 'three';

const SIDES = 6, RINGS = [0.12, 0.38, 0.64, 0.86]; // (ring heights, as a share of the model's)
const CLUMPS = 6, CLUMP_TRIS = 14; // (at most this many clumps kept; smaller pieces aren't clumps, nor are long thin ones)

// Every attribute but position and normal, averaged over the given vertices of `geo`.
function average(geo, verts) {
  const out = {};
  for (const [name, a] of Object.entries(geo.attributes)) {
    if (name === 'position' || name === 'normal') continue;
    const v = new Array(a.itemSize).fill(0);
    for (const i of verts) for (let q = 0; q < a.itemSize; q++) v[q] += a.array[i * a.itemSize + q];
    out[name] = v.map(x => x / Math.max(1, verts.length));
  }
  return out;
}

// faces: [a, b, c, ref], each turned to face away from its reference point
function assemble(geo, points, faces, attrs) {
  const g = new THREE.BufferGeometry(), pos = new Float32Array(points.length * 3);
  points.forEach((p, k) => pos.set(p, k * 3));
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  for (const [name, a] of Object.entries(geo.attributes)) {
    if (name === 'position' || name === 'normal') continue;
    const arr = new Float32Array(points.length * a.itemSize);
    attrs.forEach((v, k) => arr.set(v[name], k * a.itemSize));
    g.setAttribute(name, new THREE.BufferAttribute(arr, a.itemSize));
  }
  const out = faces.map(([a, b, c, ref]) => {
    const A = points[a], B = points[b], C = points[c];
    const u = [B[0] - A[0], B[1] - A[1], B[2] - A[2]], v = [C[0] - A[0], C[1] - A[1], C[2] - A[2]];
    const nx = u[1] * v[2] - u[2] * v[1], ny = u[2] * v[0] - u[0] * v[2], nz = u[0] * v[1] - u[1] * v[0];
    const ox = (A[0] + B[0] + C[0]) / 3 - ref[0], oy = (A[1] + B[1] + C[1]) / 3 - ref[1], oz = (A[2] + B[2] + C[2]) / 3 - ref[2];
    return nx * ox + ny * oy + nz * oz >= 0 ? [a, b, c] : [a, c, b];
  });
  g.setIndex(out.flat());
  g.computeVertexNormals();
  g.computeBoundingBox(); g.computeBoundingSphere();
  return g;
}

// The separate pieces of a model (triangles joined where they share a corner), each a list of
// vertex numbers.
function pieces(geo) {
  const p = geo.attributes.position, tris = p.count / 3, parent = Int32Array.from({ length: tris }, (_, i) => i), seen = new Map();
  const root = x => { while (parent[x] !== x) x = parent[x] = parent[parent[x]]; return x; };
  for (let i = 0; i < p.count; i++) {
    const key = `${p.getX(i).toFixed(4)},${p.getY(i).toFixed(4)},${p.getZ(i).toFixed(4)}`, t = Math.floor(i / 3);
    if (seen.has(key)) { const a = root(seen.get(key)), b = root(t); if (a !== b) parent[a] = b; } else seen.set(key, t);
  }
  const by = new Map();
  for (let t = 0; t < tris; t++) { const r = root(t); if (!by.has(r)) by.set(r, []); by.get(r).push(t * 3, t * 3 + 1, t * 3 + 2); }
  return [...by.values()];
}

// rings: a conifer's crown. Null when there's no far model for it.
export function farHull(geo, { rings = false } = {}) {
  geo.computeBoundingBox();
  if (rings) return farRings(geo);
  if (geo.index) return null;
  const p = geo.attributes.position;
  const round = verts => {
    const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
    for (const i of verts) for (const [q, v] of [p.getX(i), p.getY(i), p.getZ(i)].entries()) { lo[q] = Math.min(lo[q], v); hi[q] = Math.max(hi[q], v); }
    const e = lo.map((v, q) => hi[q] - v);
    return Math.min(...e) > Math.max(...e) * 0.35; // (a ball of leaves, not a cane, a blade or a frond)
  };
  const clumps = pieces(geo).filter(v => v.length / 3 >= CLUMP_TRIS && round(v));
  return clumps.length >= 4 ? farClumps(geo, clumps) : null;
}

function farClumps(geo, clumps) {
  const p = geo.attributes.position;
  const boxes = clumps.map(verts => {
    const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
    for (const i of verts) for (const [q, v] of [p.getX(i), p.getY(i), p.getZ(i)].entries()) { lo[q] = Math.min(lo[q], v); hi[q] = Math.max(hi[q], v); }
    const c = lo.map((v, q) => (v + hi[q]) / 2), e = lo.map((v, q) => (hi[q] - v) / 2);
    return { verts, c, e, vol: e[0] * e[1] * e[2] };
  }).sort((a, b) => b.vol - a.vol);
  const kept = boxes.slice(0, CLUMPS);
  // grown a little to cover the clumps left out (a diamond is also smaller than the ball it replaces)
  const total = boxes.reduce((s, b) => s + b.vol, 0), have = kept.reduce((s, b) => s + b.vol, 0);
  const grow = Math.min(1.35, Math.cbrt(total / Math.max(1e-9, have))) * 1.18;
  const points = [], attrs = [], faces = [];
  const AXES = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
  const OCTA = [[0, 2, 4], [4, 2, 1], [1, 2, 5], [5, 2, 0], [0, 4, 3], [4, 1, 3], [1, 5, 3], [5, 0, 3]];
  for (const { verts, c, e } of kept) {
    const base = points.length, whole = average(geo, verts);
    for (const d of AXES) {
      points.push(c.map((v, q) => v + d[q] * e[q] * grow));
      // coloured like the side of the clump it stands for
      const side = verts.filter(i => [p.getX(i), p.getY(i), p.getZ(i)].reduce((s, v, q) => s + (v - c[q]) * d[q], 0) > 0.3 * (Math.abs(d[0]) * e[0] + Math.abs(d[1]) * e[1] + Math.abs(d[2]) * e[2]));
      attrs.push(side.length ? average(geo, side) : whole);
    }
    for (const [a, b, f] of OCTA) faces.push([base + a, base + b, base + f, c]);
  }
  return assemble(geo, points, faces, attrs);
}

function farRings(geo) {
  const p = geo.attributes.position, n = p.count, { min, max } = geo.boundingBox, H = Math.max(1e-4, max.y - min.y);
  const cx = (min.x + max.x) / 2, cz = (min.z + max.z) / 2;
  // which ring and side each vertex belongs to, and how far out it sits
  const band = new Int8Array(n), side = new Int8Array(n), dist = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const u = (p.getY(i) - min.y) / H;
    let b = 0; for (let k = 1; k < RINGS.length; k++) if (Math.abs(u - RINGS[k]) < Math.abs(u - RINGS[b])) b = k;
    band[i] = b;
    const dx = p.getX(i) - cx, dz = p.getZ(i) - cz;
    side[i] = Math.floor(((Math.atan2(dz, dx) / (Math.PI * 2) + 1) % 1) * SIDES) % SIDES;
    dist[i] = Math.hypot(dx, dz);
  }
  // a ring's width: near the outside of what's there (the 85th percentile), not the farthest leaf
  const reach = list => { if (!list.length) return null; const d = list.map(i => dist[i]).sort((a, b) => a - b); return d[Math.min(d.length - 1, Math.floor(d.length * 0.85))]; };
  const points = [], attrs = [], faces = [];
  const all = Array.from({ length: n }, (_, i) => i);
  for (let b = 0; b < RINGS.length; b++) {
    const inBand = all.filter(i => band[i] === b), bandReach = reach(inBand) ?? 0;
    for (let k = 0; k < SIDES; k++) {
      const here = inBand.filter(i => side[i] === k), r = reach(here) ?? bandReach * 0.8;
      const a = (k + 0.5) / SIDES * Math.PI * 2;
      points.push([cx + Math.cos(a) * r, min.y + RINGS[b] * H, cz + Math.sin(a) * r]);
      attrs.push(average(geo, here.length ? here : inBand.length ? inBand : all));
    }
  }
  const tip = points.length, foot = tip + 1;
  const top = all.filter(i => (p.getY(i) - min.y) / H > 0.9), bottom = all.filter(i => (p.getY(i) - min.y) / H < 0.08);
  points.push([cx, max.y, cz], [cx, min.y + H * 0.02, cz]);
  attrs.push(average(geo, top.length ? top : all), average(geo, bottom.length ? bottom : all));
  // (sides face away from the upright axis at their own height, the top and bottom up and down)
  const at = (b, k) => b * SIDES + (k % SIDES), y = b => min.y + RINGS[b] * H;
  for (let b = 0; b < RINGS.length - 1; b++) for (let k = 0; k < SIDES; k++) {
    const ref = [cx, (y(b) + y(b + 1)) / 2, cz];
    faces.push([at(b, k), at(b + 1, k), at(b, k + 1), ref], [at(b, k + 1), at(b + 1, k), at(b + 1, k + 1), ref]);
  }
  for (let k = 0; k < SIDES; k++) faces.push([at(RINGS.length - 1, k), tip, at(RINGS.length - 1, k + 1), [cx, y(RINGS.length - 1), cz]], [at(0, k), at(0, k + 1), foot, [cx, y(0), cz]]);
  return assemble(geo, points, faces, attrs);
}

export function farTrunk(geo) {
  geo.computeBoundingBox();
  const p = geo.attributes.position, n = p.count, { min, max } = geo.boundingBox, H = max.y - min.y;
  // the stem a little above the ground: clear of buttress roots, below where the limbs spread
  const base = [];
  for (let i = 0; i < n; i++) { const u = (p.getY(i) - min.y) / H; if (u > 0.1 && u < 0.3) base.push(i); }
  if (!base.length) for (let i = 0; i < n; i++) base.push(i);
  let cx = 0, cz = 0;
  for (const i of base) { cx += p.getX(i); cz += p.getZ(i); }
  cx /= base.length; cz /= base.length;
  const d = base.map(i => Math.hypot(p.getX(i) - cx, p.getZ(i) - cz)).sort((a, b) => a - b);
  const r = Math.max(0.01, d[d.length >> 1]); // (its typical thickness, not a flaring root or limb)
  const top = min.y + H * 0.85, look = average(geo, Array.from({ length: n }, (_, i) => i));
  const points = [], attrs = [], faces = [], mid = [cx, (min.y + top) / 2, cz];
  for (let k = 0; k < 5; k++) {
    const a = k * 1.2566;
    points.push([cx + Math.cos(a) * r, min.y, cz + Math.sin(a) * r], [cx + Math.cos(a) * r * 0.45, top, cz + Math.sin(a) * r * 0.45]);
    attrs.push(look, look);
    const b0 = k * 2, t0 = b0 + 1, b1 = (k + 1) % 5 * 2, t1 = b1 + 1;
    faces.push([b0, t0, b1, mid], [b1, t0, t1, mid]);
  }
  return assemble(geo, points, faces, attrs);
}
