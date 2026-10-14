import * as THREE from 'three';
import { SPEEDS } from '../config.js';
import { climbPace } from '../sim/climb-pace.js';
import { bodyFitsWood, woodDistance } from './wood-clearance.js';
import { canopyRotation, interpolateCanopyPose } from './canopy-pose.js';
import { canopyContactCount } from './canopy-grips.js';
import { ORANGUTAN_CADENCE, orangutanReverse } from './orangutan-motion.js';

const leapers = new Set(['howler', 'congo', 'spider', 'langur']);
const leapSpeed = 2.6;

function canopyLeap(st, def) {
  const route = st.branchRoute;
  if (!leapers.has(def.key?.split(':')[0]) || !route || route.cursor !== route.gap) return null;
  const start = route.points[route.gap - 1], end = route.points[route.gap], gap = start.distanceTo(end);
  if (gap < .025) return null;
  const t = THREE.MathUtils.clamp(1 - st.branchPoint.distanceTo(end) / gap, 0, 1);
  const height = Math.min(.5, Math.max((def.sprite.len || 14) * st.sc * .65, gap * .35));
  return { t, lift: 4 * t * (1 - t) * height };
}

function copyHold(point) {
  const copy = point.clone();
  if (point.canopyPose) copy.canopyPose = point.canopyPose.clone();
  return copy;
}

function crownRoute(from, to, point, def, scale) {
  if (from.site === to.site) { const points = from.site.route(from, to, point); return { points, sites: points.map(() => from.site), gap: -1 }; }
  const a = from.site, b = to.site; a.prepare(); b.prepare();
  // Transfer where the two crowns actually approach one another.
  let best = Infinity, exit = from, entry = to, bridgePose = null;
  // (each limb's end hold once, rather than again for every pairing: finding a hold is dear)
  const ends = (site, anchor) => site.branches.map((br, i) => br.length < Math.max(.1, (anchor.reach || 0) * 2) ? null : site.endpoint(i, 1, anchor));
  const exits = ends(a, from), entries = ends(b, to);
  const fromDistances = a.distances(from, point), toDistances = b.distances(to);
  const monkey = def.sprite.kind === 'monkey' && !def.sprite.ape, orangutan = def.sprite.kind === 'orangutan';
  const size = (def.sprite.len || 14) * scale;
  // These are conservative display-scale limits, not measured species maxima.
  // A few body lengths sideways are fine; gaining a whole crown in flight is not.
  const maxHorizontal = THREE.MathUtils.clamp(size * 5, .65, 1.4), maxRise = Math.max(.08, size * 1.2), maxDrop = Math.max(.3, size * 4);
  const reachable = (aa, bb) => orangutan ? aa.point.distanceTo(bb.point) <= size * .85 : !monkey || (Math.hypot(bb.point.x - aa.point.x, bb.point.z - aa.point.z) <= maxHorizontal &&
    bb.point.y - aa.point.y <= maxRise && aa.point.y - bb.point.y <= maxDrop);
  const cost = (aa, bb) => aa.point.distanceTo(bb.point) * 2 + a.routeCost(from, aa, fromDistances, point) + b.routeCost(to, bb, toDistances);
  if (monkey && (from.surface || to.surface) && reachable(from, to)) best = from.point.distanceTo(to.point) * 2;
  const clearanceBody = (from.body?.motion.canopyHanging || from.body?.motion.primate === 2) && from.body;
  const wood = clearanceBody ? [...a.wood, ...b.wood] : null, sample = new THREE.Vector3(), pose = new THREE.Quaternion();
  for (let i = 0; i < a.branches.length; i++) for (let j = 0; j < b.branches.length; j++) {
    const aa = exits[i], bb = entries[j];
    if (!aa || !bb || !reachable(aa, bb)) continue;
    if (aa.point.y < a.transform[1] + a.geo.boundingBox.max.y * a.transform[4] * .45 ||
      bb.point.y < b.transform[1] + b.geo.boundingBox.max.y * b.transform[4] * .45) continue;
    // Nearby tips can be on the far side of two trunks. Include the distance
    // along the connected wood, so a short crown transfer does not first send
    // the monkey down and back up several unrelated limbs.
    const score = cost(aa, bb);
    let crossingPose = null;
    if (score < best && clearanceBody) {
      let qa = aa.point.canopyPose, qb = bb.point.canopyPose;
      if (!qa || !qb) continue;
      const steps = Math.max(2, Math.ceil(aa.point.distanceTo(bb.point) / .025));
      const clearCrossing = () => {
        for (let k = 0; k <= steps; k++) {
          sample.copy(aa.point).lerp(bb.point, k / steps);
          if (clearanceBody.motion.primate === 2) interpolateCanopyPose(qa, qb, k / steps, pose);
          else pose.copy(qa).slerp(qb, k / steps);
          if (!bodyFitsWood(clearanceBody, sample, pose, wood) ||
              orangutan && clearanceBody.motion.canopyFeet && canopyContactCount(clearanceBody, sample, pose, wood) < 1) return false;
        }
        return true;
      };
      if (orangutan) {
        // Both endpoint bark frames point out of their own tree. Blending
        // those frames can turn the torso halfway through a straight bridge.
        // Keep a forward-facing, supported pose through the handover instead.
        const direction = bb.point.clone().sub(aa.point), yaw = Math.atan2(-direction.z, direction.x);
        const limit = clearanceBody.motion.canopyPitchLimit || .55;
        const slope = THREE.MathUtils.clamp(Math.atan2(direction.y, Math.hypot(direction.x, direction.z)), -limit, limit);
        for (const turn of [0, .25, -.25, .5, -.5, .7, -.7]) {
          for (const pitch of [slope, 0, .3, -.3, .6, -.6, limit, -limit]) {
            qa = canopyRotation(yaw + turn, pitch, 0, new THREE.Quaternion()); qb = qa;
            if (clearCrossing()) { crossingPose = qa.clone(); break; }
          }
          if (crossingPose) break;
        }
        if (!crossingPose) continue;
      } else if (!clearCrossing()) continue;
    }
    if (score < best) { best = score; exit = aa; entry = bb; bridgePose = crossingPose; }
  }
  if (monkey && !Number.isFinite(best)) {
    // The receiving trunk offers bark at the takeoff height even when its
    // crown is much higher. Tall-to-small travel can first descend the old trunk.
    const takeoffs = [...(from.surface ? [from] : []), ...exits.filter(Boolean), ...a.trunkAnchors(to.point, from)];
    const flightWood = [...a.wood, ...b.wood];
    const clearFlight = (aa, bb) => {
      if (bb.trunk == null || !from.body) return true;
      const crossing = { points: [aa.point, bb.point], gap: 1, cursor: 1, landingTrunk: bb.trunk, trunkTransfer: true };
      const gap = aa.point.distanceTo(bb.point), steps = Math.max(2, Math.ceil(gap / .025));
      const height = Math.min(.5, Math.max(size * .65, gap * .35));
      for (let k = 0; k <= steps; k++) {
        sample.copy(aa.point).lerp(bb.point, k / steps);
        const q = monkeyTrunkPose(crossing, sample, bb.point.clone().sub(aa.point));
        sample.y += leapers.has(def.key?.split(':')[0]) ? 4 * (k / steps) * (1 - k / steps) * height : Math.sin(k / steps * Math.PI) * Math.min(.15, gap * .2);
        if (!q || !bodyFitsWood(from.body, sample, q, flightWood)) return false;
      }
      return true;
    };
    for (const aa of takeoffs) {
      const landings = b.trunkAnchors(aa.point, to);
      if (aa.trunk != null) landings.push(...entries.filter(Boolean));
      for (const bb of landings) {
        if (!reachable(aa, bb)) continue;
        const score = cost(aa, bb);
        if (score < best && clearFlight(aa, bb)) { best = score; exit = aa; entry = bb; }
      }
    }
    // An unreachable gap is not a leap or a walk across empty air. Reconsider
    // it when the destination changes or growth supplies a closer hold.
    if (!Number.isFinite(best)) return { points: [copyHold(point)], sites: [a], gap: -1, blocked: true, swingable: false };
  }
  // This renderer has rigid branches. Only bridge a gap the limbs can span;
  // tree-sway crossings would require animated, load-bearing tree geometry.
  if (orangutan && !Number.isFinite(best)) return { points: [copyHold(point)], sites: [a], gap: -1, blocked: true };
  const out = a.route(from, exit, point), into = b.route(entry, to);
  if (!out.length) out.push(copyHold(exit.point));
  return { points: [...out, copyHold(entry.point), ...into], sites: [...out.map(() => a), b, ...into.map(() => b)], gap: out.length,
    bridgePose, swingable: Number.isFinite(best), landingTrunk: entry.trunk ?? null, trunkTransfer: exit.trunk != null || entry.trunk != null };
}

// A transfer can have a reachable gap but an unusable final bark hold. Keep
// the accepted body position and take another adjacent route instead of
// repeatedly steering into that same obstruction for months of game time.
export function recoverCanopyRoute(st, anchorsForSite, def, time, sim) {
  const old = st.branchRoute;
  if (!old) return false;
  let site = null, index = -1, distance = Infinity;
  for (const support of new Set(old.sites)) {
    support.prepare();
    for (let i = 0; i < support.wood.length; i++) {
      const d = Math.abs(woodDistance(st.branchPoint, support.wood[i]));
      if (d < distance) { distance = d; index = i; site = support; }
    }
  }
  if (index < 0 || distance > Math.max(.015, (st.branchAt.reach || 0) * .5)) return false;
  const body = st.branchAt.body;
  if (distance > .015 && body && canopyContactCount(body, st.branchPoint, st.canopyQuaternion, [...new Set(old.sites)].flatMap(s => s.wood)) < 1) return false;
  const point = st.branchPoint.clone(); point.canopyPose = st.canopyQuaternion?.clone();
  const from = { ...st.branchAt, site, index: index < site.branches.length ? index : -1,
    trunk: index < site.branches.length ? undefined : index - site.branches.length,
    point, direction: site.wood[index].dir };
  st.canopyAvoid ||= new Map();
  for (const [tile, until] of st.canopyAvoid) if (until <= time) st.canopyAvoid.delete(tile);
  st.canopyAvoid.set(old.target.site.tile, time + 8);
  let best = Infinity, route = null;
  const local = index < site.branches.length ? [site.endpoint(index, 0, from), site.endpoint(index, 1, from)] : [];
  for (const target of [...anchorsForSite(site), ...local]) {
    if (!target || target.point.distanceTo(point) < .08 || target.site !== site && (st.canopyAvoid.get(target.site.tile) || 0) > time) continue;
    const planned = crownRoute(from, target, point, def, st.sc);
    if (planned.blocked) continue;
    // Prefer a route that can actually leave this hold in the current safe
    // pose. Merely choosing another crown can repeat the same blocked turn.
    const wood = [...new Set(planned.sites)].flatMap(s => s.wood);
    let clearDistance = 0, sample = point.clone();
    for (const next of planned.points) {
      const span = sample.distanceTo(next), steps = Math.max(1, Math.ceil(span / .005));
      let clear = true;
      for (let k = 1; k <= steps && clearDistance < .08; k++) {
        const at = sample.clone().lerp(next, k / steps);
        if (!bodyFitsWood(body, at, st.canopyQuaternion, wood)) { clear = false; break; }
        clearDistance += span / steps;
      }
      if (!clear || clearDistance >= .08) break;
      sample.copy(next);
    }
    if (target.site === site && clearDistance < .04) continue;
    let length = 0, previous = point;
    for (const next of planned.points) { length += previous.distanceTo(next); previous = next; }
    const score = Math.hypot(target.point.x - sim.x, target.point.z - sim.z) + length * .15 - Math.min(.08, clearDistance) * 30;
    if (score < best) {
      best = score;
      route = { ...planned, target, fromSite: site, cursor: 0, plannedAt: time, recovery: true, startPoint: point.clone(), startPose: st.canopyQuaternion?.clone() };
    }
  }
  if (!route) return false;
  st.branchAt = from; st.branchRoute = route; st.canopyGoal = null;
  return true;
}

function routeHeading(route, point, span, fallback) {
  const heading = fallback.clone();
  if (!route) return heading;
  let last = point;
  for (let i = route.cursor; i < route.points.length; i++) {
    const next = route.points[i], step = last.distanceTo(next);
    if (step >= span) return heading.copy(last).lerp(next, span / step).sub(point);
    span -= step; heading.copy(next).sub(point); last = next;
  }
  return heading.lengthSq() > 1e-8 ? heading : fallback.clone();
}

function routePose(route, point, upright = false) {
  if (!route) return null;
  const from = route.cursor ? route.points[route.cursor - 1] : route.startPoint;
  const to = route.points[route.cursor];
  const a = from?.canopyPose || route.startPose, b = to?.canopyPose;
  if (!a || !b) return b || a;
  const distance = from.distanceTo(to), t = distance ? Math.min(1, from.distanceTo(point) / distance) : 1;
  return upright ? interpolateCanopyPose(a, b, t, new THREE.Quaternion()) : a.clone().slerp(b, t);
}

function slothRoutePose(st, route, point) {
  const pose = routePose(route, point);
  const bridge = st.slothBridge;
  if (!pose || !route || bridge?.route !== route || route.cursor !== route.gap) return pose;
  const length = bridge.start.distanceTo(bridge.end);
  const t = THREE.MathUtils.clamp(bridge.start.distanceTo(point) / length, 0, 1);
  // Keep the real limb's safe catch pose at either end, then hang along the
  // connecting stick through the middle of the gap.
  const amount = THREE.MathUtils.smoothstep(t, 0, .25) * (1 - THREE.MathUtils.smoothstep(t, .75, 1));
  return pose.clone().slerp(bridge.pose, amount);
}

function monkeyTrunkPose(route, point, heading) {
  if (!route?.trunkTransfer) return null;
  if (route.cursor === route.gap && route.landingTrunk == null) return null;
  if (route.cursor === route.gap && route.landingTrunk != null) {
    const from = route.points[route.gap - 1], to = route.points[route.gap], direction = to.clone().sub(from);
    if (!to.canopyPose) return null;
    const gap = from.distanceTo(to), t = gap ? THREE.MathUtils.clamp(1 - point.distanceTo(to) / gap, 0, 1) : 1;
    const yaw = Math.atan2(-direction.z, direction.x);
    const launch = from.canopyPose && new THREE.Euler().setFromQuaternion(from.canopyPose, 'YZX');
    const pitch = launch ? launch.z * Math.cos(launch.y - yaw) : 0;
    const flight = canopyRotation(yaw, pitch, 0, new THREE.Quaternion());
    return interpolateCanopyPose(flight, to.canopyPose, THREE.MathUtils.smoothstep(t, 0, .85), new THREE.Quaternion());
  }
  const pose = routePose(route, point, true);
  if (!pose) return null;
  const angles = new THREE.Euler().setFromQuaternion(pose, 'YZX');
  if (heading.y < 0 && angles.z > 1.1) return canopyRotation(angles.y + Math.PI, -angles.z, 0, new THREE.Quaternion());
  return pose;
}

// Daily growth and neighbouring tile edits can rebuild a tree instance. Carry
// the current hold and route into its new transform, without restarting the climb.
export function rebaseCanopy(st, flora) {
  const route = st.branchRoute, sites = new Set([st.branchAt?.site, st.slothBridge, ...(route?.sites || []), ...(st.gripFeet || []).flatMap(foot => [foot.site, foot.to?.canopySite])].filter(Boolean)), changes = new Map();
  for (const old of sites) {
    if (old.transient) {
      const live = old.rebase(flora);
      if (!live) return false;
      if (live !== old) changes.set(old, live);
      continue;
    }
    const live = flora.treeSites.get(old.tile);
    if (live === old) continue;
    if (!live || live.plant !== old.plant) return false;
    live.prepare(); old.prepare();
    if (live.branches.length !== old.branches.length) return false;
    changes.set(old, live);
  }
  if (!changes.size) return true;
  const remap = (point, old) => {
    const live = changes.get(old);
    if (live) {
      point.applyMatrix4(old.inverse).applyMatrix4(live.matrix);
      if (point.canopyPose) point.canopyPose = point.canopyPose.clone().premultiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), live.transform[6] - old.transform[6]));
    }
  };
  const current = route ? route.sites[Math.min(route.cursor, route.sites.length - 1)] : st.branchAt?.site;
  if (st.branchPoint) remap(st.branchPoint, current);
  const anchor = a => {
    const live = changes.get(a?.site); if (!live) return a;
    const point = copyHold(a.point); remap(point, a.site);
    return { ...a, site: live, point, direction: live.branches[a.index]?.dir || a.direction };
  };
  st.branchAt = anchor(st.branchAt); st.branch = anchor(st.branch);
  st.slothBridge = changes.get(st.slothBridge) || st.slothBridge;
  if (route) {
    if (route.startPoint) {
      if (route.startPose) route.startPoint.canopyPose = route.startPose;
      remap(route.startPoint, route.fromSite); route.startPose = route.startPoint.canopyPose;
    }
    route.points.forEach((p, i) => remap(p, route.sites[i]));
    route.sites = route.sites.map(s => changes.get(s) || s);
    route.target = anchor(route.target); route.fromSite = changes.get(route.fromSite) || route.fromSite;
  }
  for (const foot of st.gripFeet || []) {
    remap(foot.point, foot.site);
    if (foot.from) remap(foot.from, foot.site);
    if (foot.to) { remap(foot.to, foot.to.canopySite); foot.to.canopySite = changes.get(foot.to.canopySite) || foot.to.canopySite; }
    foot.site = changes.get(foot.site) || foot.site;
  }
  return true;
}

// Rendering follows the branch network; simulation positions and tile paths stay authoritative.
export function canopyStep(st, anchor, def, game, time, reset = false, sim = null) {
  const dt = Math.max(0, Math.min(.1, time - (st.branchTime ?? time)));
  st.branchTime = time;
  if (reset || !st.branchPoint || !st.branchAt || Math.hypot(st.branchPoint.x - anchor.point.x, st.branchPoint.z - anchor.point.z) > 3) {
    st.branchPoint = anchor.point.clone(); st.branchAt = anchor; st.branchRoute = null; st.branchPhase ??= 0;
  }
  const before = st.branchPoint.clone();
  const phase = st.branchPhase, at = st.branchAt;
  const cursor = st.branchRoute?.cursor || 0;
  let travelled = 0, journey = null, intent = null;
  // One supporting-arm stride per swing cycle, even when the simulation runs fast.
  const swingPace = (def.sprite.len || 14) * st.sc * 1.6 * 2.8 / (Math.PI * 2);
  const trace = [{ point: before, cursor }];
  if (game.speed > 0 && dt > 0) {
    if (st.branchRoute?.blocked && (time - st.branchRoute.plannedAt > 1 || st.branchRoute.target.site !== anchor.site)) st.branchRoute = null;
    if (!st.branchRoute && (st.branchAt.site !== anchor.site || st.branchAt.index !== anchor.index)) {
      st.branchRoute = { ...crownRoute(st.branchAt, anchor, st.branchPoint, def, st.sc), target: anchor, fromSite: st.branchAt.site, cursor: 0, plannedAt: time,
        startPoint: st.branchPoint.clone(), startPose: st.canopyQuaternion?.clone() };
    }
    const route = st.branchRoute;
    journey = route;
    if (def.sprite.kind === 'orangutan' || def.sprite.ape) {
      // Keep intent even when a turn shortens the step, and look only a short
      // handover ahead so a fork cannot set the next climb backward.
      const resting = route?.blocked || !route && st.branchPoint.distanceTo(anchor.point) <= .003;
      intent = resting ? new THREE.Vector3() : routeHeading(route, st.branchPoint, Math.max(.08, (def.sprite.len || 14) * st.sc * .15), anchor.point.clone().sub(st.branchPoint));
      if (def.sprite.kind === 'orangutan' && intent.lengthSq() > 1e-8) st.canopyReverse = orangutanReverse(intent, st.canopyReverse,
        st.canopyQuaternion && new THREE.Vector3(1, 0, 0).applyQuaternion(st.canopyQuaternion));
    }
    // The simulation keeps to the climbing pace (see climbSpeed), but dashes from
    // danger and departures still run ahead. Only once the body is well behind the
    // simulation position (not merely far from its next hold, as at the start of
    // every crown crossing) ease into a faster pace, so it never reaches the reset
    // distance and jumps there.
    const lag = st.canopyLag = sim ? Math.hypot(st.branchPoint.x - sim.x, st.branchPoint.z - sim.z) : 0;
    const monkey = def.sprite.kind === 'monkey' && !def.sprite.ape;
    // A long trunk descent can build lag without any urgency in the animal's
    // movement. Recover gently instead of racing through the next holds.
    const maxCatchUp = monkey ? 1.5 : 13;
    const goal = 1 + THREE.MathUtils.clamp((lag - 1.2) * 2.5, 0, maxCatchUp - 1);
    // Ramp over game time, so a fast game speed doesn't leave the pace trailing behind.
    const catchUp = Math.min(maxCatchUp, st.catchUp || 1);
    st.catchUp = catchUp + (goal - catchUp) * (1 - Math.exp(-4 * dt * (SPEEDS[game.speed] || 0)));
    const speed = climbPace(def) * st.catchUp * (SPEEDS[game.speed] || 0);
    const animationSpeed = st.catchUp * (SPEEDS[game.speed] || SPEEDS[1]) / SPEEDS[1];
    let budget = route?.blocked ? 0 : speed * dt, facingPace = 1;
    const shufflePace = .05 * SPEEDS[1] / (st.catchUp * (SPEEDS[game.speed] || SPEEDS[1]));
    const orangutanFacing = def.sprite.kind === 'orangutan' && intent && st.canopyQuaternion && new THREE.Vector3(1, 0, 0).applyQuaternion(st.canopyQuaternion);
    // Being behind must not cancel a monkey's careful turn into the next hold.
    const catchUpTurn = monkey ? 0 : THREE.MathUtils.clamp((lag - 1.2) / .6, 0, 1);
    if (route && st.canopyQuaternion && def.sprite.kind === 'sloth') {
      const pose = slothRoutePose(st, route, st.branchPoint);
      if (pose) {
        const angle = st.canopyQuaternion.angleTo(pose);
        const turnPace = .2 + .8 * THREE.MathUtils.clamp((.5 - angle) / .35, 0, 1);
        budget *= THREE.MathUtils.lerp(turnPace, 1, catchUpTurn);
      }
    } else if (st.canopyQuaternion && (intent || (route && def.sprite.kind === 'monkey' && !def.sprite.ape))) {
      const heading = intent?.clone() || routeHeading(route, st.branchPoint, Math.max(.08, (def.sprite.len || 14) * st.sc * .6), anchor.direction);
      const facing = new THREE.Vector3(1, 0, 0).applyQuaternion(st.canopyQuaternion);
      if (intent && st.canopyReverse) heading.negate();
      heading.y = 0; facing.y = 0;
      const alignment = heading.normalize().dot(facing.normalize());
      // Slow down while turning toward the next limb at a fork.
      // Otherwise a short crossing finishes while the torso still faces the
      // old branch, and all four feet have to scramble sideways.
      const turnPace = .2 + .8 * THREE.MathUtils.clamp((alignment - .5) / .35, 0, 1);
      // Retain a tiny grip shuffle to get around crowded wood while turning.
      // Catch-up speed must not restore a full backward stride.
      facingPace = intent && alignment < 0 ? shufflePace : THREE.MathUtils.lerp(turnPace, 1, catchUpTurn);
      budget *= facingPace;
    }
    // Catch-up must not consume an entire crown gap in one rendered frame.
    if (leapers.has(def.key?.split(':')[0])) budget = Math.min(budget, .65 / leapSpeed);
    // Apes can lag while turning at a fork. Keep the body within its
    // real-time limb cadence instead of racing through holds to catch up.
    if (intent) {
      budget = Math.min(budget, dt * (def.sprite.ape ? swingPace : (def.sprite.len || 14) * st.sc * 1.5));

    }
    if (route) {
      while (budget > 0 && route.cursor < route.points.length) {
        const target = route.points[route.cursor], distance = st.branchPoint.distanceTo(target);
        // Turn into the validated crossing pose while still at the departure
        // hold. Entering first can strand the torso halfway between the trees,
        // where there is no room left to finish that turn.
        if (def.sprite.kind === 'orangutan' && route.cursor === route.gap && route.bridgePose &&
            st.branchPoint.distanceTo(route.points[route.gap - 1]) < .005 &&
            st.canopyQuaternion && st.canopyQuaternion.angleTo(route.bridgePose) > .005) break;
        // Monkeys leap quickly; other climbers keep their usual handover pace.
        // Charge the same time budget so a frame spanning takeoff or landing
        // still walks the remaining wood at its ordinary climbing pace.
        let boost = 1;
        if (route.cursor === route.gap) {
          if (leapers.has(def.key?.split(':')[0])) {
            boost = leapSpeed;
            // Give the body time to pitch into a trunk catch at normal speed.
            // Scale that time with game/catch-up speed so the body keeps up.
            if (route.landingTrunk != null) {
              const gap = route.points[route.gap - 1].distanceTo(target);
              if (gap >= .025) boost = Math.min(boost, gap * animationSpeed / (.9 * speed));
            }
          }
        }
        if (orangutanFacing) {
          const direction = target.clone().sub(st.branchPoint);
          const backDown = st.canopyReverse && direction.y < -.1 * distance;
          const alignment = orangutanFacing.x * direction.x + orangutanFacing.z * direction.z;
          // A lookahead can face the following bend before this short bark
          // segment is finished. Only creep until the body faces this step.
          if ((backDown ? -alignment : alignment) < 0) boost *= Math.min(1, shufflePace / facingPace);
        }
        const step = budget * boost;
        if (distance <= step) {
          st.branchPoint.copy(target); route.cursor++;
          budget -= distance / boost; travelled += distance;
        }
        else { st.branchPoint.lerp(target, step / distance); travelled += step; budget = 0; }
        trace.push({ point: st.branchPoint.clone(), cursor: route.cursor });
      }
      if (route.cursor >= route.points.length) { st.branchAt = route.target; st.branchRoute = null; }
    } else {
      const distance = st.branchPoint.distanceTo(anchor.point);
      if (distance > .003) { travelled = Math.min(budget, distance); st.branchPoint.lerp(anchor.point, travelled / distance); }
      st.branchAt = anchor;
    }
  }
  const delta = st.branchPoint.clone().sub(before), distance = delta.length();
  const route = st.branchRoute, transfer = !!route && route.cursor === route.gap;
  // Look along the next body-length of route, rather than steering toward
  // each centimetre-sized bark correction at a fork.
  const heading = intent || routeHeading(route, st.branchPoint, Math.max(.08, (def.sprite.len || 14) * st.sc * .6), delta);
  let lift = 0;
  st.canopyLeap = canopyLeap(st, def);
  if (st.canopyLeap) lift = st.canopyLeap.lift;
  else if (transfer && def.sprite.kind === 'monkey' && !def.sprite.ape) {
    const start = route.points[route.gap - 1], end = route.points[route.gap], gap = start.distanceTo(end);
    const t = gap > 0 ? THREE.MathUtils.clamp(1 - st.branchPoint.distanceTo(end) / gap, 0, 1) : 1;
    lift = Math.sin(t * Math.PI) * Math.min(.15, gap * .2);
  }
  // Gait is driven by distance along the wood, so a clamped hold doesn't walk in place.
  const stride = Math.max(.06, (def.sprite.len || 14) * st.sc * (def.sprite.ape ? 1.6 : .65));
  const phaseStep = travelled / stride * Math.PI * 2;
  const cadence = def.sprite.ape ? 2.8 : def.sprite.kind === 'orangutan' ? ORANGUTAN_CADENCE : 0;
  st.branchPhase += cadence ? Math.min(phaseStep, dt * cadence) : phaseStep;
  const pose = def.sprite.kind === 'orangutan' && transfer ? route.bridgePose
    : def.sprite.kind === 'monkey' && !def.sprite.ape ? monkeyTrunkPose(route, st.branchPoint, heading)
    : def.sprite.kind === 'sloth' ? slothRoutePose(st, route, st.branchPoint) || journey?.target.point.canopyPose || st.branchAt?.point.canopyPose : null;
  const pace = def.sprite.ape ? Math.min(Math.max(.25, def.speed * (SPEEDS[game.speed] || 1)), swingPace) : Math.max(.25, def.speed * (SPEEDS[game.speed] || 1));
  return { delta, heading, pose,
    before, requested: st.branchPoint.clone(), cursor, dt, phase, at, journey, trace, travelled, stride, ape: def.sprite.ape, cadence, animationSpeed: (st.catchUp || 1) * (SPEEDS[game.speed] || SPEEDS[1]) / SPEEDS[1],
    pace, gait: dt > 0 && game.speed > 0 ? Math.min(1, travelled / dt / pace) : 0,
    transfer, lift, def };
}

// A blocked step can span several tiny bark waypoints. Commit only the distance
// actually accepted, including its cursor and gait; rolling back the entire
// cursor sends the next frame back toward a hold the animal has already passed.
export function settleCanopyStep(st, motion) {
  const requested = motion.requested.distanceTo(motion.before);
  const fraction = motion.acceptedDistance !== undefined ? (motion.travelled > 1e-9 ? motion.acceptedDistance / motion.travelled : 1)
    : requested > 1e-9 ? Math.min(1, st.branchPoint.distanceTo(motion.before) / requested) : 1;
  const distance = motion.travelled * fraction;
  if (fraction < 1 - 1e-8 && motion.journey) {
    const route = motion.journey;
    st.branchRoute = route; st.branchAt = motion.at;
    let remaining = distance;
    st.branchPoint.copy(motion.before); route.cursor = motion.trace[0].cursor;
    for (let i = 1; i < motion.trace.length; i++) {
      const a = motion.trace[i - 1], b = motion.trace[i], span = a.point.distanceTo(b.point);
      if (remaining + 1e-10 >= span) { st.branchPoint.copy(b.point); route.cursor = b.cursor; remaining -= span; }
      else { st.branchPoint.copy(a.point).lerp(b.point, remaining / span); break; }
    }
  }
  const phaseStep = distance / motion.stride * Math.PI * 2;
  const cadence = motion.cadence || (motion.ape ? 2.8 : 0);
  st.branchPhase = motion.phase + (cadence ? Math.min(phaseStep, motion.dt * cadence) : phaseStep);
  motion.gait = motion.dt > 0 ? Math.min(1, distance / motion.dt / motion.pace) : 0;
  // Clearance can shorten a step. Draw the arc at the accepted position.
  st.canopyLeap = canopyLeap(st, motion.def);
  if (leapers.has(motion.def?.key?.split(':')[0])) motion.lift = st.canopyLeap?.lift || 0;
  return distance;
}
