// Where the bird being tracked sits when it's perched in a tree: on one of the tree's real limbs,
// so the branch under it shows instead of the bird sitting inside the leaves at a set height (the
// focus window, see focus.js, opens the leaves in front of it, and Flora.showCanopySites keeps the
// tree's wood solid, as for a climber):
//  - a broadleaf tree's limbs all run inside its leaf clumps, so the bird takes one of the
//    shallowest-buried limb points, out toward the edge of the crown;
//  - a conifer has no separate limbs (its boughs are the foliage tiers), so the bird stands on
//    top of a bough, out toward its tip;
//  - a bare winter tree is all limbs, so any of them will do.
// Spots are worked out once per tree shape, shared by every tree drawn with it.
import * as THREE from 'three';

const spotsByShape = new WeakMap();
const leafMat = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
const caster = new THREE.Raycaster();
const from = new THREE.Vector3(), seg = new THREE.Vector3(), down = new THREE.Vector3(0, -1, 0);
// straight up and eight tilted lines of sight: the camera looks down from any side
const LOOKS = [[0, 1, 0], ...[0, 1, 2, 3, 4, 5, 6, 7].map(k => [Math.cos(k * Math.PI / 4) * .8, 1, Math.sin(k * Math.PI / 4) * .8])]
  .map(v => new THREE.Vector3(...v).normalize());
const ALONG = [.3, .5, .7, .9];
const KEEP = 8; // (spots kept per shape: the most open ones)

function openness(leaves, p) {
  let open = 0;
  for (const look of LOOKS) {
    caster.set(from.copy(p).addScaledVector(look, .005), look); caster.far = 3;
    if (!caster.intersectObject(leaves, false).length) open++;
  }
  return open;
}

// Spots in the shape's own space. Empty when there is nowhere to sit (the bird keeps its old
// place in the crown).
export function perchSpots(site) {
  const key = site.geo;
  if (spotsByShape.has(key)) return spotsByShape.get(key);
  const leaves = site.crown?.geo ? new THREE.Mesh(site.crown.geo, leafMat) : null;
  leaves?.updateMatrixWorld();
  site.geo.computeBoundingBox();
  const box = site.geo.boundingBox, low = box.min.y + (box.max.y - box.min.y) * .3;
  let spots = [];
  for (const b of site.geo.userData.canopyBranches || []) {
    seg.set(b.to[0] - b.from[0], b.to[1] - b.from[1], b.to[2] - b.from[2]);
    const len = seg.length();
    if (len < .02 || Math.abs(seg.y) / len > .85) continue; // (too short to stand on, or near vertical)
    for (const t of ALONG) {
      const p = new THREE.Vector3(...b.from).addScaledVector(seg, t);
      if (p.y < low) continue;
      p.y += b.r0 + (b.r1 - b.r0) * t; // (on top of the limb)
      // the most open first; among equals, the furthest out from the trunk
      spots.push({ x: p.x, y: p.y, z: p.z, score: (leaves ? openness(leaves, p) : LOOKS.length) + Math.hypot(p.x, p.z) });
    }
  }
  if (!spots.length && leaves) {
    // no limbs: stand on top of the foliage, partway out along a bough
    leaves.geometry.computeBoundingBox();
    const lb = leaves.geometry.boundingBox, rx = (lb.max.x - lb.min.x) / 2, rz = (lb.max.z - lb.min.z) / 2;
    const cx = (lb.max.x + lb.min.x) / 2, cz = (lb.max.z + lb.min.z) / 2;
    for (const f of [.45, .7]) for (let k = 0; k < 8; k++) {
      const a = (k + f) * Math.PI / 4;
      caster.set(from.set(cx + Math.cos(a) * rx * f, lb.max.y + .1, cz + Math.sin(a) * rz * f), down); caster.far = lb.max.y - lb.min.y + .2;
      const hit = caster.intersectObject(leaves, false)[0];
      if (hit && hit.point.y > lb.min.y + (lb.max.y - lb.min.y) * .3) spots.push({ x: hit.point.x, y: hit.point.y, z: hit.point.z, score: f });
    }
  }
  spots = spots.sort((p, q) => q.score - p.score).slice(0, KEEP);
  spotsByShape.set(key, spots);
  return spots;
}

// The perch for a bird at (x, z) in this tree, in world space: the spot nearest to it, written
// into out. False when the tree has nowhere to sit.
export function perchPoint(site, x, z, out) {
  const spots = perchSpots(site);
  if (!spots.length) return false;
  site.prepare();
  let best = null, bd = Infinity;
  for (const s of spots) {
    out.set(s.x, s.y, s.z).applyMatrix4(site.matrix);
    const d = (out.x - x) ** 2 + (out.z - z) ** 2;
    if (d < bd) { bd = d; best = s; }
  }
  out.set(best.x, best.y, best.z).applyMatrix4(site.matrix);
  return true;
}
