import * as THREE from 'three';
import { SPEEDS } from '../config.js';
import { climbPace } from '../sim/climb-pace.js';
import { bodyFitsWood } from './wood-clearance.js';
import { interpolateCanopyPose } from './canopy-pose.js';
import { orangutanSwing, orangutanSwingPose } from './orangutan-swing.js';

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

function crownRoute(from, to, point) {
  if (from.site === to.site) { const points = from.site.route(from, to, point); return { points, sites: points.map(() => from.site), gap: -1 }; }
  const a = from.site, b = to.site; a.prepare(); b.prepare();
  // Transfer where the two crowns actually approach one another.
  let best = Infinity, exit = from, entry = to;
  // (each limb's end hold once, rather than again for every pairing: finding a hold is dear)
  const ends = (site, anchor) => site.branches.map((br, i) => br.length < Math.max(.1, (anchor.reach || 0) * 2) ? null : site.endpoint(i, 1, anchor));
  const exits = ends(a, from), entries = ends(b, to);
  const fromDistances = a.distances(from, point), toDistances = b.distances(to);
  const clearanceBody = (from.body?.motion.canopyHanging || from.body?.motion.primate === 2) && from.body;
  const wood = clearanceBody ? [...a.wood, ...b.wood] : null, sample = new THREE.Vector3(), pose = new THREE.Quaternion();
  for (let i = 0; i < a.branches.length; i++) for (let j = 0; j < b.branches.length; j++) {
    const aa = exits[i], bb = entries[j];
    if (!aa || !bb) continue;
    if (aa.point.y < a.transform[1] + a.geo.boundingBox.max.y * a.transform[4] * .45 ||
      bb.point.y < b.transform[1] + b.geo.boundingBox.max.y * b.transform[4] * .45) continue;
    // Nearby tips can be on the far side of two trunks. Include the distance
    // along the connected wood, so a short crown transfer does not first send
    // the monkey down and back up several unrelated limbs.
    const score = aa.point.distanceTo(bb.point) * 2 + a.routeCost(from, aa, fromDistances, point) + b.routeCost(to, bb, toDistances);
    if (score < best && clearanceBody) {
      const qa = aa.point.canopyPose, qb = bb.point.canopyPose;
      if (!qa || !qb) continue;
      const steps = Math.max(2, Math.ceil(aa.point.distanceTo(bb.point) / .025));
      const crossing = { points: [aa.point, bb.point], gap: 1, cursor: 1 };
      const clearCrossing = () => {
        for (let k = 0; k <= steps; k++) {
          sample.copy(aa.point).lerp(bb.point, k / steps);
          if (clearanceBody.motion.primate === 2) orangutanSwingPose(crossing, sample, pose);
          else pose.copy(qa).slerp(qb, k / steps);
          let profile = clearanceBody;
          if (clearanceBody.motion.primate === 2) {
            const swing = orangutanSwing(crossing, sample);
            if (swing) {
              const mo = clearanceBody.motion;
              profile = { ...clearanceBody, motion: { ...mo, gripX: swing.grip[0] * mo.len, supportY: swing.grip[1] * mo.len, gripZ: swing.grip[2] * mo.len } };
            }
          }
          if (!bodyFitsWood(profile, sample, pose, wood)) return false;
        }
        return true;
      };
      if (!clearCrossing()) continue;
    }
    if (score < best) { best = score; exit = aa; entry = bb; }
  }
  const out = a.route(from, exit, point), into = b.route(entry, to);
  if (!out.length) out.push(copyHold(exit.point));
  return { points: [...out, copyHold(entry.point), ...into], sites: [...out.map(() => a), b, ...into.map(() => b)], gap: out.length,
    swingable: Number.isFinite(best) };
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
  if (upright && route.cursor === route.gap && route.swingable !== false) return orangutanSwingPose(route, point);
  const from = route.cursor ? route.points[route.cursor - 1] : route.startPoint;
  const to = route.points[route.cursor];
  const a = from?.canopyPose || route.startPose, b = to?.canopyPose;
  if (!a || !b) return b || a;
  const distance = from.distanceTo(to), t = distance ? Math.min(1, from.distanceTo(point) / distance) : 1;
  return upright ? interpolateCanopyPose(a, b, t, new THREE.Quaternion()) : a.clone().slerp(b, t);
}

// Daily growth and neighbouring tile edits can rebuild a tree instance. Carry
// the current hold and route into its new transform, without restarting the climb.
export function rebaseCanopy(st, flora) {
  const route = st.branchRoute, sites = new Set([st.branchAt?.site, ...(route?.sites || []), ...(st.gripFeet || []).flatMap(foot => [foot.site, foot.to?.canopySite])].filter(Boolean)), changes = new Map();
  for (const old of sites) {
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
  let travelled = 0, journey = null;
  const trace = [{ point: before, cursor }];
  if (game.speed > 0 && dt > 0) {
    if (!st.branchRoute && (st.branchAt.site !== anchor.site || st.branchAt.index !== anchor.index)) {
      st.branchRoute = { ...crownRoute(st.branchAt, anchor, st.branchPoint), target: anchor, fromSite: st.branchAt.site, cursor: 0,
        startPoint: st.branchPoint.clone(), startPose: st.canopyQuaternion?.clone() };
    }
    const route = st.branchRoute;
    journey = route;
    // The simulation keeps to the climbing pace (see climbSpeed), but dashes from
    // danger and departures still run ahead. Only once the body is well behind the
    // simulation position (not merely far from its next hold, as at the start of
    // every crown crossing) ease into a faster pace, so it never reaches the reset
    // distance and jumps there.
    const lag = st.canopyLag = sim ? Math.hypot(st.branchPoint.x - sim.x, st.branchPoint.z - sim.z) : 0;
    const goal = 1 + THREE.MathUtils.clamp((lag - 1.2) * 2.5, 0, 12);
    // Ramp over game time, so a fast game speed doesn't leave the pace trailing behind.
    st.catchUp = (st.catchUp || 1) + (goal - (st.catchUp || 1)) * (1 - Math.exp(-4 * dt * (SPEEDS[game.speed] || 0)));
    const speed = climbPace(def) * st.catchUp * (SPEEDS[game.speed] || 0);
    let budget = speed * dt;
    const catchUpTurn = THREE.MathUtils.clamp((lag - 1.2) / .6, 0, 1);
    if (route && st.canopyQuaternion && (def.sprite.kind === 'sloth' || def.sprite.kind === 'orangutan' && route.cursor === route.gap)) {
      const pose = routePose(route, st.branchPoint, def.sprite.kind === 'orangutan');
      if (pose) {
        const angle = st.canopyQuaternion.angleTo(pose);
        const swing = def.sprite.kind === 'orangutan' && orangutanSwing(route, st.branchPoint);
        // Finish facing the crossing before advancing the arm handover. A
        // minimum walking pace here let the body travel sideways while turning.
        if (swing && swing.t > .08 && angle > .12) budget = 0;
        else {
          const turnPace = .2 + .8 * THREE.MathUtils.clamp((.5 - angle) / .35, 0, 1);
          budget *= THREE.MathUtils.lerp(turnPace, 1, catchUpTurn);
        }
      }
    } else if (route && st.canopyQuaternion && def.sprite.kind === 'monkey' && !def.sprite.ape) {
      const heading = routeHeading(route, st.branchPoint, Math.max(.08, (def.sprite.len || 14) * st.sc * .6), anchor.direction);
      const facing = new THREE.Vector3(1, 0, 0).applyQuaternion(st.canopyQuaternion);
      heading.y = 0; facing.y = 0;
      const alignment = heading.normalize().dot(facing.normalize());
      // Slow down while turning toward the next limb at a fork.
      // Otherwise a short crossing finishes while the torso still faces the
      // old branch, and all four feet have to scramble sideways.
      const turnPace = .2 + .8 * THREE.MathUtils.clamp((alignment - .5) / .35, 0, 1);
      budget *= THREE.MathUtils.lerp(turnPace, 1, catchUpTurn);
    }
    if (route) {
      while (budget > 0 && route.cursor < route.points.length) {
        const target = route.points[route.cursor], distance = st.branchPoint.distanceTo(target);
        // Monkeys leap quickly; orangutans use a slower handover in the gap.
        // Charge the same time budget so a frame spanning takeoff or landing
        // still walks the remaining wood at its ordinary climbing pace.
        let boost = 1, span = distance, advance = true;
        if (route.cursor === route.gap) {
          if (leapers.has(def.key?.split(':')[0])) boost = leapSpeed;
          else if (def.sprite.kind === 'orangutan' && route.swingable) {
            const swing = orangutanSwing(route, st.branchPoint);
            boost = .55;
            if (swing && swing.t < .35 - 1e-8) {
              // Enter and leave the hanging stance promptly. Split frames at
              // both transitions to preserve the deliberate handover pace.
              boost = 1.1;
              const gap = route.points[route.gap - 1].distanceTo(target);
              span = gap * (.35 - swing.t); advance = false;
            } else if (swing && swing.t < .65 - 1e-8) {
              const gap = route.points[route.gap - 1].distanceTo(target);
              span = gap * (.65 - swing.t); advance = false;
            } else if (swing) {
              boost = 1.1;
            }
          }
        }
        const step = budget * boost;
        if (span <= step) {
          if (advance) { st.branchPoint.copy(target); route.cursor++; }
          else st.branchPoint.lerp(target, span / distance);
          budget -= span / boost; travelled += span;
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
  const heading = routeHeading(route, st.branchPoint, Math.max(.08, (def.sprite.len || 14) * st.sc * .6), delta);
  let lift = 0;
  st.canopyLeap = canopyLeap(st, def);
  st.orangutanSwing = def.sprite.kind === 'orangutan' ? orangutanSwing(route, st.branchPoint) : null;
  if (st.canopyLeap) lift = st.canopyLeap.lift;
  else if (transfer && def.sprite.kind === 'monkey' && !def.sprite.ape) {
    const start = route.points[route.gap - 1], end = route.points[route.gap], gap = start.distanceTo(end);
    const t = gap > 0 ? THREE.MathUtils.clamp(1 - st.branchPoint.distanceTo(end) / gap, 0, 1) : 1;
    lift = Math.sin(t * Math.PI) * Math.min(.15, gap * .2);
  }
  // Gait is driven by distance along the wood, so a clamped hold doesn't walk in place.
  const stride = Math.max(.06, (def.sprite.len || 14) * st.sc * (def.sprite.ape ? 1.6 : .65));
  const phaseStep = travelled / stride * Math.PI * 2;
  st.branchPhase += def.sprite.ape ? Math.min(phaseStep, dt * 2.8) : phaseStep;
  return { delta, heading, pose: def.sprite.kind === 'sloth' || st.orangutanSwing ? routePose(route, st.branchPoint, def.sprite.kind === 'orangutan') || journey?.target.point.canopyPose || st.branchAt?.point.canopyPose : null,
    before, requested: st.branchPoint.clone(), cursor, dt, phase, at, journey, trace, travelled, stride, ape: def.sprite.ape,
    pace: Math.max(.25, def.speed * (SPEEDS[game.speed] || 1)), gait: dt > 0 && game.speed > 0 ? Math.min(1, travelled / dt / Math.max(.25, def.speed * (SPEEDS[game.speed] || 1))) : 0,
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
  st.branchPhase = motion.phase + (motion.ape ? Math.min(phaseStep, motion.dt * 2.8) : phaseStep);
  motion.gait = motion.dt > 0 ? Math.min(1, distance / motion.dt / motion.pace) : 0;
  // Clearance can shorten a step. Draw the arc at the accepted position.
  st.canopyLeap = canopyLeap(st, motion.def);
  st.orangutanSwing = motion.def?.sprite.kind === 'orangutan' ? orangutanSwing(st.branchRoute, st.branchPoint) : null;
  if (leapers.has(motion.def?.key?.split(':')[0])) motion.lift = st.canopyLeap?.lift || 0;
  return distance;
}
