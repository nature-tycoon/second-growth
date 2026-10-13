// Footing on the actual, static woody scaffold, in the same transform as its crown.
// Geometry is shared by many trees; prepare its upper surfaces only once.
import * as THREE from 'three';
import { woodDistance, woodFrame, bodyFitsWood } from './wood-clearance.js';
import { canopyRotation, readableCanopyPose } from './canopy-pose.js';
import { canopyContactCount } from './canopy-grips.js';

const surfaces = new WeakMap();
const contactAngles = [0];
const localUp = new THREE.Vector3(0, 1, 0), aroundHold = new THREE.Quaternion(), surfacePose = new THREE.Quaternion();
for (let k = 1; k < 8; k++) contactAngles.push(k * Math.PI / 8, -k * Math.PI / 8);
contactAngles.push(Math.PI);
function upperSurfaces(geo) {
  if (surfaces.has(geo)) return surfaces.get(geo);
  geo.computeBoundingBox();
  const p = geo.attributes.position, idx = geo.index, triangles = [], normal = new THREE.Vector3();
  const low = geo.boundingBox.min.y + (geo.boundingBox.max.y - geo.boundingBox.min.y) * .45;
  for (let k = 0; k < (idx?.count ?? p.count); k += 3) {
    const triangle = new THREE.Triangle(...[0, 1, 2].map(j => new THREE.Vector3().fromBufferAttribute(p, idx ? idx.getX(k + j) : k + j)));
    triangle.getNormal(normal);
    if (normal.y > .15 && Math.max(triangle.a.y, triangle.b.y, triangle.c.y) > low) triangles.push(triangle);
  }
  surfaces.set(geo, triangles);
  return triangles;
}

// Farm tiles use their simulation index; surrounding trees use a disjoint
// negative key so departures can keep their real branches beyond the fence.
export function canopyTile(world, border, x, z) {
  if (world.inb(x, z)) return world.idx(x, z);
  const i = border?.bi(x, z) ?? -1;
  return i < 0 ? null : -i - 1;
}

export class CanopySite {
  constructor(geo, transform, color, tile = -1, plant = null, cell = null, crown = null) {
    this.geo = geo; this.transform = transform; this.color = color; this.tile = tile; this.plant = plant;
    this.cell = cell;
    this.crown = crown;
  }

  prepare() {
    if (this.matrix) return;
    // Most trees are unoccupied. Defer branch transforms and surface work until
    // a visible climber actually needs this tree, rather than on every daily rebuild.
    const [x, y, z, sx, sy, sz, turn] = this.transform;
    const geo = this.geo;
    this.matrix = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z),
      new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), turn), new THREE.Vector3(sx, sy, sz));
    this.inverse = this.matrix.clone().invert();
    this.triangles = upperSurfaces(geo);
    const transformWood = b => {
      const from = new THREE.Vector3(...b.from).applyMatrix4(this.matrix), to = new THREE.Vector3(...b.to).applyMatrix4(this.matrix);
      const dir = to.clone().sub(from), length = dir.length(); dir.normalize();
      const up = new THREE.Vector3(0, 1, 0).addScaledVector(dir, -dir.y).normalize();
      return { from, to, dir, up, length, r0: b.r0 * sx, r1: b.r1 * sx };
    };
    this.branches = (geo.userData.canopyBranches || []).map(transformWood);
    this.trunks = (geo.userData.canopyTrunks || []).map(transformWood);
    this.wood = [...this.branches, ...this.trunks];
    this.target = new THREE.Vector3(); this.point = new THREE.Vector3(); this.best = new THREE.Vector3();
  }

  // A limb's upper surface can be inside the trunk or another limb at a fork.
  // Standing animals step over the union of those surfaces. Hanging bodies
  // instead pass around its sides, leaving room below their supporting hand.
  clearPoint(point, reach = 0, hanging = false, body = null) {
    this.prepare();
    if (hanging) return this.woodSurface(point, reach, true, body);
    const p = point.clone(), nearest = new THREE.Vector3(), radial = new THREE.Vector3();
    for (let pass = 0; pass < 4; pass++) {
      let changed = false;
      for (const b of this.wood) {
        const t = THREE.MathUtils.clamp(radial.copy(p).sub(b.from).dot(b.dir) / b.length, 0, 1);
        nearest.copy(b.from).lerp(b.to, t);
        const radius = THREE.MathUtils.lerp(b.r0, b.r1, t) + .002;
        radial.copy(p).sub(nearest);
        if (radial.lengthSq() >= radius * radius - 1e-9) continue;
        // Raise the initial walking hold over overlapping limbs, then find a
        // real bark contact with room for the body below or above that hold.
        p.y = nearest.y + Math.sqrt(Math.max(0, radius * radius - radial.x ** 2 - radial.z ** 2));
        changed = true;
      }
      if (!changed) break;
    }
    return this.woodSurface(p, reach, false, body);
  }

  woodSurface(point, reach = 0, hanging = false, profile = null) {
    if (!this.wood.length) return point;
    let cache = null, key = null;
    if (profile) {
      this.surfaceCache ||= new WeakMap();
      cache = this.surfaceCache.get(profile.motion);
      if (!cache || cache.scale !== profile.scale) { cache = { scale: profile.scale, holds: new Map() }; this.surfaceCache.set(profile.motion, cache); }
      key = `${Math.round(point.x * 1000)}:${Math.round(point.y * 1000)}:${Math.round(point.z * 1000)}:${reach}:${hanging}:${!!profile.trunkClimbing}`;
      const saved = cache.holds.get(key);
      if (saved) { const copy = saved.clone(); copy.canopyPose = saved.canopyPose; return copy; }
    }
    const p = point.clone(), near = new THREE.Vector3(), radial = new THREE.Vector3();
    let hold = p.clone(), bestPose = null;
    const candidates = this.wood.map(b => {
      const along = near.copy(p).sub(b.from).dot(b.dir), t = THREE.MathUtils.clamp(along / b.length, 0, 1);
      near.copy(b.from).lerp(b.to, t); radial.copy(p).sub(near);
      radial.addScaledVector(b.dir, -radial.dot(b.dir));
      const radius = THREE.MathUtils.lerp(b.r0, b.r1, t) + .002;
      const distance = Math.hypot(Math.max(0, -along, along - b.length), radial.length() - radius);
      if (radial.lengthSq() < 1e-10) {
        radial.copy(b.up.lengthSq() ? b.up : new THREE.Vector3(1, 0, 0));
        radial.addScaledVector(b.dir, -radial.dot(b.dir));
        if (radial.lengthSq() < 1e-10) radial.set(0, 0, 1);
      }
      return { b, near: near.clone(), normal: radial.normalize().clone(), radius, distance };
    }).sort((a, b) => a.distance - b.distance).slice(0, profile ? 8 : 3);
    if (profile && reach) for (const c of [...candidates]) for (const shift of [-reach * .5, reach * .5]) {
      const along = THREE.MathUtils.clamp(c.near.clone().sub(c.b.from).dot(c.b.dir) + shift, 0, c.b.length);
      const centre = c.b.from.clone().addScaledVector(c.b.dir, along);
      candidates.push({ ...c, near: centre, radius: THREE.MathUtils.lerp(c.b.r0, c.b.r1, along / c.b.length) + .002 });
    }
    // A fork can lead onto a trunk's flat top. Side surfaces alone forced a
    // standing primate to hang sideways underneath the surrounding branches.
    for (const b of this.wood) for (const end of [0, 1]) {
      const centre = end ? b.to : b.from, radius = end ? b.r1 : b.r0;
      radial.copy(p).sub(centre); radial.addScaledVector(b.dir, -radial.dot(b.dir));
      radial.clampLength(0, Math.max(0, radius - .003));
      near.copy(centre).add(radial).addScaledVector(b.dir, end ? .002 : -.002);
      if (near.distanceTo(p) < reach * 2 + .05) candidates.push({ b, near: near.clone(), normal: b.dir.clone().multiplyScalar(end ? 1 : -1), radius: 0, distance: near.distanceTo(p) });
    }
    const body = new THREE.Vector3(), pose = new THREE.Quaternion(), options = [];
    for (const c of candidates) for (const angle of reach ? contactAngles : [0]) {
      if (!c.radius && angle) continue;
      const normal = c.normal.clone().applyAxisAngle(c.b.dir, angle), candidate = c.near.clone().addScaledVector(normal, c.radius);
      options.push({ c, normal, candidate, order: options.length, near: candidate.distanceToSquared(point) });
    }
    // The best-scoring contact the body fits wins. Scoring a contact and testing the body there are
    // the dear steps (a new branch route used to make tens of thousands of body tests in one frame,
    // a visible stall), so contacts are taken nearest first: a contact's score is never less than
    // its distance, so once the best scored one beats every remaining distance, the rest can't win.
    // Ties keep their original order, so the same contact wins as when every one was scored.
    options.sort((a, b) => a.near - b.near || a.order - b.order);
    const scored = [], before = (a, b) => a.score - b.score || a.order - b.order;
    let next = 0;
    for (;;) {
      while (next < options.length && (!scored.length || options[next].near <= scored[0].score)) {
        const o = options[next++], { normal, candidate } = o;
        body.copy(candidate).addScaledVector(normal, reach * (hanging ? 2 : 1.4));
        let blocked = 0, buried = false;
        for (const b of this.wood) {
          if (woodDistance(candidate, b) < -.0005) { buried = true; break; }
          blocked = Math.max(blocked, reach * .65 - woodDistance(body, b));
        }
        if (buried) continue;
        o.score = o.near + Math.max(0, blocked) ** 2 * 20 + (hanging ? Math.max(0, normal.y - .3) ** 2 * reach ** 2 * 5 : 0);
        let k = scored.length; while (k > 0 && before(o, scored[k - 1]) < 0) k--;
        scored.splice(k, 0, o);
      }
      if (!scored.length) break;
      const { c, normal, candidate } = scored.shift();
      if (profile && ![1, -1].some(sign => {
        woodFrame(c.b, normal, hanging, sign, surfacePose);
        if (localUp.clone().applyQuaternion(surfacePose).y < -.00001) return false;
        for (const turn of [0, Math.PI / 4, -Math.PI / 4, Math.PI / 2, -Math.PI / 2]) {
          pose.copy(surfacePose).multiply(aroundHold.setFromAxisAngle(localUp, turn));
          if (!readableCanopyPose(pose, hanging && !profile.motion.canopyHanging, profile.motion.canopyPitchLimit)) continue;
          if (this.bodyFit(profile, candidate, pose)) return true;
        }
        // On a near-vertical trunk, the exact bark frame pitches a walker
        // through 90 degrees. Keep its belly outside the bark and its limbs
        // underneath it with the same steep-climb limit used by Actors.
        if (profile.trunkClimbing && profile.motion.primate === 1 && Math.abs(c.b.dir.y) > .9 && Math.abs(normal.y) < .5) {
          canopyRotation(Math.atan2(normal.z, -normal.x), 1.2, 0, pose);
          if (this.bodyFit(profile, candidate, pose)) return true;
        }
        return false;
      })) continue;
      hold.copy(candidate); bestPose = profile ? pose.clone() : null;
      break;
    }
    // At overlapping forks, the contact belongs to the outside of the whole
    // scaffold, rather than the buried surface of one cylinder.
    for (let pass = 0; pass < 4; pass++) for (const b of this.wood) {
      const t = THREE.MathUtils.clamp(near.copy(hold).sub(b.from).dot(b.dir) / b.length, 0, 1);
      near.copy(b.from).lerp(b.to, t); radial.copy(hold).sub(near);
      const radius = THREE.MathUtils.lerp(b.r0, b.r1, t) + .002;
      if (woodDistance(hold, b) >= .002 - 1e-9) continue;
      radial.addScaledVector(b.dir, -radial.dot(b.dir));
      if (radial.lengthSq() < 1e-10) radial.set(0, 1, 0);
      hold.copy(near).addScaledVector(radial.normalize(), radius);
    }
    if (bestPose) hold.canopyPose = bestPose;
    if (cache) {
      if (cache.holds.size >= 512) cache.holds.clear();
      const saved = hold.clone(); saved.canopyPose = bestPose;
      cache.holds.set(key, saved);
    }
    return hold;
  }

  bodyFit(profile, point, pose) {
    this.bodyClearance ||= new WeakMap();
    let entry = this.bodyClearance.get(profile.motion);
    if (!entry || entry.scale !== profile.scale) { entry = { scale: profile.scale, holds: new Map() }; this.bodyClearance.set(profile.motion, entry); }
    const key = [...point.toArray(), ...pose.toArray()].map(n => Math.round(n * 1000)).join(':');
    if (entry.holds.has(key)) return entry.holds.get(key);
    let fits = bodyFitsWood(profile, point, pose, this.wood);
    if (fits && profile.motion.canopyHanging) {
      fits = canopyContactCount(profile, point, pose, this.wood) >= 2;
    }
    if (entry.holds.size >= 4096) entry.holds.clear();
    entry.holds.set(key, fits); return fits;
  }

  clearRoute(points, from, to) {
    const reach = from.reach || to.reach || 0, hanging = from.hanging || to.hanging || false, profile = to.body || from.body;
    const body = profile && (from.trunk != null || to.trunk != null) ? { ...profile, trunkClimbing: true } : profile;
    const first = points[0];
    const out = []; let previous = first;
    const append = (a, b, depth = 0) => {
      if (depth < 6 && a.distanceToSquared(b) > .025 ** 2) {
        const middle = this.woodSurface(a.clone().lerp(b, .5), reach, hanging, body);
        append(a, middle, depth + 1); append(middle, b, depth + 1);
      } else out.push(b);
    };
    for (const target of points.slice(1)) {
      const steps = Math.max(1, Math.ceil(previous.distanceTo(target) / .025));
      for (let k = 1; k <= steps; k++) {
        const hold = this.clearPoint(previous.clone().lerp(target, k / steps), reach, hanging, body);
        append(out[out.length - 1] || first, hold);
      }
      previous = target;
    }
    if (!body?.motion.canopyFeet && body?.motion.primate !== 2 && body?.motion.primate !== 3) return out;
    // Independently projected fork holds can alternate between overlapping
    // limbs. Remove those excursions only when the whole shortcut still hugs
    // exposed bark; keep the turns needed to go around the trunk.
    const smooth = [], sample = new THREE.Vector3(), pose = new THREE.Quaternion();
    const clear = (a, b) => {
      const length = a.distanceTo(b);
      if (length > Math.max(.025, reach * 2)) return false;
      const steps = Math.max(1, Math.ceil(length / .005));
      for (let k = 1; k < steps; k++) {
        sample.copy(a).lerp(b, k / steps);
        let nearest = Infinity;
        for (const wood of this.wood) {
          const distance = woodDistance(sample, wood);
          if (distance < -.002) return false;
          nearest = Math.min(nearest, distance);
        }
        if (nearest > .01) return false;
        if (body.motion.canopyHanging) {
          const aPose = a.canopyPose || from.point.canopyPose, bPose = b.canopyPose;
          if (!aPose || !bPose || !this.bodyFit(body, sample, pose.copy(aPose).slerp(bPose, k / steps))) return false;
        }
      }
      return true;
    };
    let at = first;
    for (let i = 0; i < out.length;) {
      let end = i;
      for (let j = out.length - 1; j > i; j--) if (clear(at, out[j])) { end = j; break; }
      if (at.distanceToSquared(out[end]) > 1e-10) smooth.push(out[end]);
      at = out[end]; i = end + 1;
    }
    return smooth;
  }

  forkRoute(points, nodes, reach, hanging = false) {
    const out = [points[0]];
    for (let k = 1; k < points.length - 1; k++) {
      const node = this.nodes[nodes[k - 1]], centre = node?.base, before = out[out.length - 1], after = points[k + 1];
      if (!centre || (this.edges[nodes[k - 1]].length < 3 && !node.trunk) || !reach) { out.push(points[k]); continue; }
      const radius = reach * 2 + node.radius;
      const gate = p => {
        const distance = Math.hypot(p.x - centre.x, p.z - centre.z);
        return points[k].clone().lerp(p, Math.min(.85, radius / Math.max(.001, distance)));
      };
      const a = gate(before), b = gate(after), r = Math.min(radius, Math.hypot(a.x - centre.x, a.z - centre.z), Math.hypot(b.x - centre.x, b.z - centre.z));
      if (r < .025) { out.push(points[k]); continue; }
      const start = Math.atan2(a.z - centre.z, a.x - centre.x), end = Math.atan2(b.z - centre.z, b.x - centre.x);
      let angle = end - start; angle -= Math.round(angle / (2 * Math.PI)) * 2 * Math.PI;
      out.push(a);
      const steps = Math.max(2, Math.ceil(Math.abs(angle) * r / .025));
      for (let j = 1; j < steps; j++) {
        const t = j / steps, turn = start + angle * t;
        const y = THREE.MathUtils.lerp(a.y, b.y, t);
        const lower = centre.y + node.radius * .2 - (node.trunk ? reach * 2.3 : 0);
        const around = hanging || node.trunk ? Math.sin(t * Math.PI) * Math.max(0, (a.y + b.y) / 2 - lower) : 0;
        out.push(new THREE.Vector3(centre.x + Math.cos(turn) * r, hanging ? y - around : y + Math.sin(t * Math.PI) * reach, centre.z + Math.sin(turn) * r));
      }
      out.push(b);
    }
    out.push(points[points.length - 1]); return out;
  }

  // Branch endpoints form a small, lazily built graph. Follow the woody forks
  // instead of cutting a straight line through the crown between nearby limbs.
  graph() {
    this.prepare();
    if (this.nodes) return;
    this.nodes = []; this.edges = [];
    const node = (p, up, radius) => {
      let i = this.nodes.findIndex(n => n.base.distanceToSquared(p) < .001);
      if (i < 0) { i = this.nodes.length; this.nodes.push({ base: p, point: p.clone().addScaledVector(up, radius), radius }); this.edges.push([]); }
      else this.nodes[i].radius = Math.max(this.nodes[i].radius, radius);
      return i;
    };
    for (const b of this.branches) {
      b.ends = [node(b.from, b.up, b.r0), node(b.to, b.up, b.r1)];
      const [a, c] = b.ends;
      this.edges[a].push([c, b.length]); this.edges[c].push([a, b.length]);
    }
    // Palms have a trunk cap instead of a woody crown graph. Connect their
    // recorded stem segments so a trunk catch can still climb to that cap.
    if (!this.branches.length) for (const b of this.trunks) {
      const a = node(b.from, localUp, 0), c = node(b.to, localUp, 0);
      this.edges[a].push([c, b.length]); this.edges[c].push([a, b.length]);
    }
    const near = new THREE.Vector3();
    for (const n of this.nodes) for (const b of this.wood.slice(this.branches.length)) {
      const t = THREE.MathUtils.clamp(near.copy(n.base).sub(b.from).dot(b.dir) / b.length, 0, 1), radius = THREE.MathUtils.lerp(b.r0, b.r1, t);
      near.copy(b.from).lerp(b.to, t);
      if (n.base.distanceToSquared(near) < radius * radius) { n.trunk = true; n.radius = Math.max(n.radius, radius); }
    }
  }
  distances(from, point = from.point) {
    this.graph();
    const a = this.branches[from.index];
    const dist = this.nodes.map(() => Infinity), prev = this.nodes.map(() => -1), seen = new Set();
    const starts = from.trunk != null ? this.trunkNodes(from.trunk) : a?.ends || (from.surface && this.nodes.length ?
      [this.nodes.reduce((best, n, i) => n.point.distanceToSquared(point) < this.nodes[best].point.distanceToSquared(point) ? i : best, 0)] : []);
    for (const i of starts) dist[i] = point.distanceTo(this.nodes[i].point);
    for (let k = 0; k < this.nodes.length; k++) {
      let n = -1;
      for (let i = 0; i < dist.length; i++) if (!seen.has(i) && (n < 0 || dist[i] < dist[n])) n = i;
      if (n < 0 || !Number.isFinite(dist[n])) break;
      seen.add(n);
      for (const [i, cost] of this.edges[n]) if (dist[n] + cost < dist[i]) { dist[i] = dist[n] + cost; prev[i] = n; }
    }
    return { dist, prev };
  }
  routeCost(from, to, distances, point = from.point) {
    if (from.trunk != null && from.trunk === to.trunk) return point.distanceTo(to.point);
    if (to.trunk != null) return Math.min(...this.trunkNodes(to.trunk).map(i => distances.dist[i] + this.nodes[i].point.distanceTo(to.point)));
    if (to.surface) return Math.min(...this.nodes.map((node, i) => distances.dist[i] + node.point.distanceTo(to.point)));
    if (from.index === to.index) return point.distanceTo(to.point);
    return Math.min(...this.branches[to.index].ends.map(i => distances.dist[i] + this.nodes[i].point.distanceTo(to.point)));
  }
  route(from, to, point = from.point) {
    this.graph();
    const a = this.branches[from.index], b = this.branches[to.index];
    if ((!a && from.trunk == null && !from.surface) || (!b && to.trunk == null && !to.surface) ||
        (from.trunk != null ? from.trunk === to.trunk : to.trunk == null && from.index === to.index)) return this.clearRoute([point, to.point], from, to);
    const { dist, prev } = this.distances(from, point);
    const ends = to.trunk != null ? this.trunkNodes(to.trunk) : b?.ends || this.nodes.map((_, i) => i);
    if (!ends.length) return [];
    const end = ends.reduce((best, i) => dist[i] + this.nodes[i].point.distanceTo(to.point) < dist[best] + this.nodes[best].point.distanceTo(to.point) ? i : best);
    if (!Number.isFinite(dist[end])) return this.clearRoute([point, to.point], from, to); // specialist scaffold without connected rods
    const route = [], nodes = [];
    for (let i = end; i >= 0; i = prev[i]) { route.unshift(this.nodes[i].point.clone()); nodes.unshift(i); }
    route.push(to.point.clone()); return this.clearRoute(this.forkRoute([point, ...route], nodes, from.reach || to.reach || 0, from.hanging || to.hanging), from, to);
  }
  endpoint(index, end, profile = {}) {
    this.prepare(); const b = this.branches[index];
    // Route holds need the same hand/foot span as ordinary anchors. Placing a
    // torso at a bare tip puts its forward limbs past the branch into a fork.
    const margin = Math.min(.45, (profile.reach || 0) / b.length), t = end ? 1 - margin : margin;
    const point = b.from.clone().lerp(b.to, t).addScaledVector(b.up, (profile.body?.motion.canopyHanging || profile.body?.motion.primate === 3 ? -1 : 1) * THREE.MathUtils.lerp(b.r0, b.r1, t));
    return { site: this, index, direction: b.dir, reach: profile.reach, hanging: profile.hanging, body: profile.body,
      point: this.clearPoint(point, profile.reach, profile.hanging, profile.body) };
  }

  trunkNodes(index) {
    this.graph();
    this.trunkConnections ||= [];
    if (this.trunkConnections[index]) return this.trunkConnections[index];
    const trunk = this.trunks[index], near = new THREE.Vector3();
    return this.trunkConnections[index] = this.nodes.flatMap((node, i) => {
      const t = THREE.MathUtils.clamp(near.copy(node.base).sub(trunk.from).dot(trunk.dir) / trunk.length, 0, 1);
      near.copy(trunk.from).lerp(trunk.to, t);
      return node.base.distanceTo(near) <= THREE.MathUtils.lerp(trunk.r0, trunk.r1, t) + .02 ? [i] : [];
    });
  }

  // Catch the facing side of a receiving trunk near the takeoff height, then
  // follow that real trunk into the connected branch graph.
  trunkAnchors(point, profile = {}) {
    this.prepare();
    return this.trunks.flatMap((trunk, index) => {
      if (!this.trunkNodes(index).length || trunk.length < (profile.reach || 0) * 2) return [];
      const margin = Math.min(.45, (profile.reach || 0) / trunk.length);
      const t = THREE.MathUtils.clamp(point.clone().sub(trunk.from).dot(trunk.dir) / trunk.length, margin, 1 - margin);
      const centre = trunk.from.clone().lerp(trunk.to, t), normal = point.clone().sub(centre);
      normal.addScaledVector(trunk.dir, -normal.dot(trunk.dir));
      if (normal.lengthSq() < 1e-8) normal.set(1, 0, 0);
      const hold = centre.addScaledVector(normal.normalize(), THREE.MathUtils.lerp(trunk.r0, trunk.r1, t) + .002);
      const body = profile.body && { ...profile.body, trunkClimbing: true };
      const cleared = this.woodSurface(hold, profile.reach, false, body);
      if ((body && !cleared.canopyPose) || Math.abs(woodDistance(cleared, trunk)) > .01) return [];
      return [{ site: this, index: -1, trunk: index, point: cleared, direction: trunk.dir, reach: profile.reach, hanging: false, body: profile.body }];
    });
  }

  anchor(x, z, previous = null, reach = .08, hanging = false, body = null) {
    this.prepare();
    if (this.branches.length) {
      let score = Infinity, index = -1, point = null, direction = null;
      const oldBranch = previous?.site === this && !previous.surface ? this.branches[previous.index] : null;
      const committed = oldBranch?.length >= reach * 2 && (body?.motion.canopyFeet || body?.motion.primate === 2 || body?.motion.primate === 3) ? previous.index : -1;
      const height = this.transform[1] + this.geo.boundingBox.max.y * this.transform[4] * .8;
      const order = [...this.branches.keys()];
      if (committed >= 0) { order.splice(order.indexOf(committed), 1); order.unshift(committed); }
      for (const k of order) {
        if (committed >= 0 && k !== committed && (!body?.motion.canopyHanging || index === committed)) continue;
        const b = this.branches[k];
        if (b.length < reach * 2 || Math.max(b.from.y, b.to.y) < this.transform[1] + this.geo.boundingBox.max.y * this.transform[4] * .45) continue;
        if (hanging && Math.abs(b.dir.y) > .7) continue;
        // Leave enough branch on either side for the animal's hands and feet.
        const t = THREE.MathUtils.clamp(((x - b.from.x) * b.dir.x + (height - b.from.y) * b.dir.y + (z - b.from.z) * b.dir.z) / b.length,
          reach / b.length, 1 - reach / b.length);
        // Start a siamang hold underneath the limb. Projecting from its top
        // alternates between equally good side surfaces and reverses travel.
        this.point.copy(b.from).lerp(b.to, t).addScaledVector(b.up, (body?.motion.canopyHanging || body?.motion.primate === 3 ? -1 : 1) * (b.r0 + (b.r1 - b.r0) * t));
        // Small spacing nudges must not send a resting animal down one fork
        // and up another. Switch only when a new limb is clearly nearer.
        const stable = previous?.site === this && previous.index === k ? (body ? .06 : .006) : 0;
        const clearance = hanging ? Math.max(0, reach * 2 - Math.hypot(this.point.x - this.transform[0], this.point.z - this.transform[2])) : 0;
        const slope = body?.motion.primate === 1 ? .16 * b.dir.y ** 2 : 0;
        const d = (this.point.x - x) ** 2 + (this.point.z - z) ** 2 + .18 * (this.point.y - height) ** 2 + slope + (hanging ? .2 * b.dir.y ** 2 + clearance * 2 : 0) - stable;
        if (d < score) {
          const hold = body?.motion.canopyHanging ? this.clearPoint(this.point, reach, hanging, body) : this.point.clone();
          if (body?.motion.canopyHanging && !hold.canopyPose) continue;
          score = d; index = k; point = hold; direction = b.dir;
        }
      }
      if (point) return { site: this, index, point: body?.motion.canopyHanging ? point : this.clearPoint(point, reach, hanging, body), direction, reach, hanging, body };
      if (hanging) return this.anchor(x, z, previous, reach, false, body);
    }
    if (!this.triangles.length) return null;
    // Search the upper scaffold near the animal's simulation position. Staying on
    // the previous limb when nearly tied avoids jumping between neighbouring forks.
    const top = this.geo.boundingBox.max.y;
    this.target.set(x, this.transform[1] + top * this.transform[4] * .83, z).applyMatrix4(this.inverse);
    let score = Infinity, index = -1;
    for (let k = 0; k < this.triangles.length; k++) {
      this.triangles[k].closestPointToPoint(this.target, this.point);
      const d = (this.point.x - this.target.x) ** 2 + (this.point.z - this.target.z) ** 2 + .18 * (this.point.y - this.target.y) ** 2;
      const stable = previous?.site === this && previous.index === k ? .006 : 0;
      if (d - stable < score) { score = d - stable; index = k; this.best.copy(this.point); }
    }
    const triangle = this.triangles[index], edges = [triangle.b.clone().sub(triangle.a), triangle.c.clone().sub(triangle.a), triangle.c.clone().sub(triangle.b)];
    const direction = edges.sort((a, b) => b.lengthSq() - a.lengthSq())[0].transformDirection(this.matrix);
    return { site: this, index, surface: true, point: this.clearPoint(this.best.clone().applyMatrix4(this.matrix), reach, hanging, body), direction, reach, hanging, body };
  }
}
