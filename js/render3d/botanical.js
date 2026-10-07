// Small botanical forms: thin petals, distinct centres and flower heads attached to stems.
// Each part is one reusable geometry, instanced over whole beds, with a lighter distant form.
import * as THREE from 'three';
import { mulberry32 } from '../rng.js';
import { prep, merge } from './geometry.js';

function stem(a, b, radius, color = 0xffffff, lo = false) {
  const start = new THREE.Vector3(...a), end = new THREE.Vector3(...b), delta = end.clone().sub(start);
  const g = prep(new THREE.CylinderGeometry(radius * 0.65, radius, delta.length(), lo ? 3 : 5), color);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), delta.normalize()));
  const mid = start.add(end).multiplyScalar(0.5);
  return g.translate(mid.x, mid.y, mid.z);
}

// A curved pointed petal/leaf, folded along its centre rather than a round blob.
function petal(x, y, z, angle, length, width, lift, color, lo = false) {
  const n = lo ? 2 : 3, pos = [];
  const at = (t, side) => {
    const w = width * Math.sin(Math.PI * t) * side, reach = t * length;
    return [x + Math.cos(angle) * reach - Math.sin(angle) * w,
      y + lift * t * t + width * 0.14 * Math.abs(side) * Math.sin(Math.PI * t),
      z + Math.sin(angle) * reach + Math.cos(angle) * w];
  };
  // Join the curved edges continuously; the centre line forms a shallow fold.
  // Two segments retain a full-width midpoint in the distant model.
  for (let k = 0; k < n; k++) {
    const a = k / n, b = (k + 1) / n;
    if (k > 0) pos.push(...at(a,0),...at(a,-1),...at(b,-1),...at(a,0),...at(b,1),...at(a,1));
    if (k < n - 1) pos.push(...at(a,0),...at(b,-1),...at(b,0),...at(a,0),...at(b,0),...at(b,1));
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  prep(g, color);
  // Thin botanical surfaces catch skylight on both faces, like the game's grass ribbons.
  // Their folded edges must not shade the entire flower as though its petals faced down.
  const normals = g.attributes.normal;
  for (let k = 0; k < normals.count; k++) {
    const n = new THREE.Vector3(normals.getX(k) * 0.4, 0.65 + Math.abs(normals.getY(k)) * 0.35, normals.getZ(k) * 0.4).normalize();
    normals.setXYZ(k, n.x, n.y, n.z);
  }
  return g;
}
function centre(x, y, z, radius, height, color, lo) {
  const g = prep(lo ? new THREE.OctahedronGeometry(1) : new THREE.SphereGeometry(1,8,5), color);
  return g.scale(radius, height, radius).translate(x, y, z);
}
function radial(parts, x, y, z, radius, petals, color, lo, drop = 0, centreColor = '#d6a641', cone = false) {
  const n = lo ? Math.max(5, Math.ceil(petals * 0.65)) : petals;
  for (let j = 0; j < n; j++) parts.push(petal(x, y, z, j / n * Math.PI * 2, radius, radius * (petals > 10 ? 0.13 : 0.28), drop, color, lo));
  parts.push(centre(x, y + (cone ? radius * 0.14 : 0), z, radius * 0.26, radius * (cone ? 0.48 : 0.13), centreColor, lo));
}

function heads(form, points, color, lo) {
  const parts = [];
  for (const [x, y, z] of points) {
    if (['spike', 'spire', 'camas'].includes(form)) {
      const levels = lo ? 4 : 6;
      for (let j = 0; j < levels; j++) {
        const a = j * 2.4, t = j / levels, reach = 0.028 * (1 - t * 0.7), yy = y - 0.12 + j * 0.027;
        const xx = x + Math.cos(a) * reach, zz = z + Math.sin(a) * reach;
        radial(parts, xx, yy, zz, (form === 'camas' ? 0.032 : 0.023) * (1 - t * 0.4), form === 'camas' ? 6 : 4, color, true, form === 'spire' ? -0.009 : 0.007, '#e8d9a6');
      }
    } else if (form === 'umbel' || form === 'plume') {
      const n = lo ? 4 : form === 'plume' ? 10 : 8;
      for (let j = 0; j < n; j++) {
        const a = j * 2.4, t = Math.sqrt((j + 0.3) / n), rr = (form === 'plume' ? 0.055 : 0.064) * t;
        const xx = x + Math.cos(a) * rr, zz = z + Math.sin(a) * rr, yy = y + (form === 'plume' ? 0.075 * (1 - t) : 0.015 * (1 - t));
        parts.push(stem([x, y - 0.06, z], [xx, yy, zz], 0.0015, '#8e9856', true));
        radial(parts, xx, yy, zz, 0.017, 5, color, true, 0, '#d4ba69');
      }
    } else if (['puff', 'globe', 'crown'].includes(form)) {
      const n = lo ? 9 : 18;
      for (let j = 0; j < n; j++) {
        const a = j * 2.4, t = (j + 0.5) / n, rr = Math.sqrt(1 - (t * 2 - 1) ** 2) * 0.055;
        const tip = [x + Math.cos(a) * rr, y + (t - 0.5) * 0.095, z + Math.sin(a) * rr];
        parts.push(stem([x, y - 0.02, z], tip, form === 'crown' ? 0.004 : 0.0018, color, true));
        if (!lo) parts.push(centre(...tip, 0.004, 0.003, '#f7d3a4', true));
      }
    } else if (form === 'bells') {
      // an arching spray of small urn-shaped flowers hanging on short stalks (salal, heaths)
      const n = lo ? 3 : 4, a = 0.6, L = 0.09, fx = Math.cos(a), fz = Math.sin(a);
      const along = t => [x + fx * L * t, y + 0.02 * Math.sin(t * 2.4) - 0.03 * t * t, z + fz * L * t];
      parts.push(stem([x, y, z], along(0.5), 0.0028, '#b2525a', lo), stem(along(0.5), along(1), 0.0022, '#b2525a', lo));
      for (let j = 0; j < n; j++) {
        const p = along((j + 0.7) / (n + 0.4)), b = [p[0], p[1] - 0.016, p[2]];
        parts.push(stem(p, b, 0.0014, '#b2525a', true), centre(b[0], b[1] - 0.008, b[2], 0.0085, 0.012, color, lo));
      }
    } else if (form === 'catkin') {
      // spiked pepper's fruit: a slim, pale spike that rises from the leaves, then curves over
      const pts = [];
      for (let j = 0; j <= 6; j++) { const t = j / 6, b = t * 1.9; pts.push(new THREE.Vector3(x + Math.sin(b) * 0.075, y + Math.sin(b) * 0.06 + t * 0.015 - t * t * 0.05, z)); }
      const tube = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), lo ? 4 : 10, 0.009, lo ? 4 : 6, false);
      tube.deleteAttribute('uv'); parts.push(prep(tube, color), centre(pts[6].x, pts[6].y, pts[6].z, 0.009, 0.009, color, lo));
    } else if (form === 'spathe' || form === 'trumpet') {
      const n = form === 'spathe' ? 7 : 5;
      for (let j = 0; j < n; j++) parts.push(petal(x, y - 0.035, z, j / n * Math.PI * 2, 0.052, 0.024, 0.075, color, lo));
      parts.push(centre(x, y + 0.025, z, 0.009, 0.045, '#e5c252', lo));
    } else {
      const cone = form === 'cone' || form === 'darkdaisy';
      const radius = form === 'waterlily' ? 0.085 : form === 'cone' ? 0.08 : form === 'aster' ? 0.06 : 0.065;
      radial(parts, x, y, z, radius, form === 'aster' ? 16 : form === 'star' ? 5 : 11, color, lo,
        cone ? -0.025 : form === 'waterlily' ? 0.025 : 0.005, cone ? '#70421f' : '#deb64c', cone);
      if (form === 'waterlily' && !lo) radial(parts, x, y + 0.012, z, radius * 0.65, 9, color, true, 0.035);
    }
  }
  return merge(parts);
}

export function wildflowerParts(form, seed, color, lo = false) {
  const rng = mulberry32(seed), foliage = [], points = [];
  const low = form === 'waterlily', spike = ['spike', 'spire', 'camas', 'plume'].includes(form);
  const n = low || form === 'globe' || form === 'spathe' ? 1 : 2;
  for (let k = 0; k < n; k++) {
    const a = k * 2.4 + rng(), x = Math.cos(a) * 0.035, z = Math.sin(a) * 0.035;
    const h = low ? 0.065 : (spike ? 0.37 : form === 'umbel' ? 0.31 : 0.27) * (0.85 + rng() * 0.25);
    const tip = [x + 0.018, h, z + 0.009]; points.push(tip);
    if (low) foliage.push(stem([tip[0],0.006,tip[2]],tip,0.0025,0xffffff,lo));
    else {
      foliage.push(stem([x, 0, z], tip, 0.004, 0xffffff, lo));
      for (let j = 0; j < (lo ? 3 : 5); j++) foliage.push(petal(x, 0.025, z, a + j * 2.4, 0.13, 0.045, 0.055, 0xffffff, lo));
      for (let j = 0; j < (lo ? 2 : 4); j++) {
        const angle = a + j * 2.4, yy = h * (0.17 + j * 0.13);
        foliage.push(petal(x, yy, z, angle, form === 'camas' ? 0.15 : 0.11, form === 'camas' ? 0.012 : 0.035, 0.035, 0xffffff, lo));
      }
      if (form === 'spike') for (let j = 0; j < (lo ? 5 : 7); j++) foliage.push(petal(x, 0.08, z, j / 7 * 6.28, 0.095, 0.015, 0.012, 0xffffff, lo));
    }
  }
  if (low) foliage.push(prep(new THREE.CylinderGeometry(0.075, 0.075, 0.003, lo ? 8 : 14)).translate(0, 0.005, 0));
  const seedHeads = points.map(([x, y, z]) => centre(x, y, z, 0.02, spike ? 0.045 : 0.022, '#73604a', lo));
  return { foliage: merge(foliage), blossom: heads(form, points, color, lo), seed: merge(seedHeads) };
}

export function blossomHead(form, color, lo = false) { return heads(form, [[0, 0, 0]], color, lo); }

export function grassHeads(form, seed, lo = false) {
  const rng = mulberry32(seed), parts = [], n = lo ? 2 : 3;
  for (let k = 0; k < n; k++) {
    const x = (rng() - 0.5) * 0.06, z = (rng() - 0.5) * 0.06, h = (form === 'savannagrass' ? 0.9 : form === 'papyrus' ? 0.62 : 0.35) * (0.85 + rng() * 0.2);
    parts.push(stem([x, 0.03, z], [x + 0.025, h, z], 0.002, '#c5b780', lo));
    for (let j = 0; j < (lo ? 3 : 6); j++) {
      const a = j * 2.4, reach = form === 'papyrus' ? 0.12 : 0.048, yy = h - (form === 'papyrus' ? 0 : j * 0.012);
      parts.push(petal(x + 0.025, yy, z, a, reach, form === 'papyrus' ? 0.003 : 0.009, -reach * 0.55,
        form === 'savannagrass' ? '#b68b57' : form === 'papyrus' ? '#7b9851' : '#c5b780', lo));
    }
  }
  return merge(parts);
}
