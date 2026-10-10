import * as THREE from 'three';
import { SPEEDS } from '../config.js';

function crownRoute(from, to, point) {
  if (from.site === to.site) { const points = from.site.route(from, to, point); return { points, sites: points.map(() => from.site), gap: -1 }; }
  const a = from.site, b = to.site; a.prepare(); b.prepare();
  // Transfer where the two crowns actually approach one another.
  let best = Infinity, exit = from, entry = to;
  for (let i = 0; i < a.branches.length; i++) for (let j = 0; j < b.branches.length; j++) {
    if (a.branches[i].length < Math.max(.1, (from.reach || 0) * 2) || b.branches[j].length < Math.max(.1, (to.reach || 0) * 2)) continue;
    const aa = a.endpoint(i, 1, from), bb = b.endpoint(j, 1, to);
    if (aa.point.y < a.transform[1] + a.geo.boundingBox.max.y * a.transform[4] * .45 ||
      bb.point.y < b.transform[1] + b.geo.boundingBox.max.y * b.transform[4] * .45) continue;
    const score = aa.point.distanceToSquared(bb.point) + .08 * (point.distanceToSquared(aa.point) + to.point.distanceToSquared(bb.point));
    if (score < best) { best = score; exit = aa; entry = bb; }
  }
  const out = a.route(from, exit, point), into = b.route(entry, to);
  return { points: [...out, entry.point.clone(), ...into], sites: [...out.map(() => a), b, ...into.map(() => b)], gap: out.length };
}

// Daily growth and neighbouring tile edits can rebuild a tree instance. Carry
// the current hold and route into its new transform, without restarting the climb.
export function rebaseCanopy(st, flora) {
  const route = st.branchRoute, sites = new Set([st.branchAt?.site, ...(route?.sites || [])].filter(Boolean)), changes = new Map();
  for (const old of sites) {
    const live = flora.treeSites.get(old.tile);
    if (live === old) continue;
    if (!live || live.plant !== old.plant) return false;
    live.prepare(); old.prepare();
    if (live.branches.length !== old.branches.length) return false;
    changes.set(old, live);
  }
  if (!changes.size) return true;
  const remap = (point, old) => { const live = changes.get(old); if (live) point.applyMatrix4(old.inverse).applyMatrix4(live.matrix); };
  const current = route ? route.sites[Math.min(route.cursor, route.sites.length - 1)] : st.branchAt?.site;
  if (st.branchPoint) remap(st.branchPoint, current);
  const anchor = a => {
    const live = changes.get(a?.site); if (!live) return a;
    const point = a.point.clone(); remap(point, a.site);
    return { ...a, site: live, point, direction: live.branches[a.index]?.dir || a.direction };
  };
  st.branchAt = anchor(st.branchAt); st.branch = anchor(st.branch);
  if (route) {
    route.points.forEach((p, i) => remap(p, route.sites[i]));
    route.sites = route.sites.map(s => changes.get(s) || s);
    route.target = anchor(route.target); route.fromSite = changes.get(route.fromSite) || route.fromSite;
  }
  return true;
}

// Rendering follows the branch network; simulation positions and tile paths stay authoritative.
export function canopyStep(st, anchor, def, game, time, reset = false) {
  const dt = Math.max(0, Math.min(.1, time - (st.branchTime ?? time)));
  st.branchTime = time;
  if (reset || !st.branchPoint || !st.branchAt || Math.hypot(st.branchPoint.x - anchor.point.x, st.branchPoint.z - anchor.point.z) > 3) {
    st.branchPoint = anchor.point.clone(); st.branchAt = anchor; st.branchRoute = null; st.branchPhase ??= 0;
  }
  const before = st.branchPoint.clone();
  const cursor = st.branchRoute?.cursor || 0;
  if (game.speed > 0 && dt > 0) {
    if (!st.branchRoute && (st.branchAt.site !== anchor.site || st.branchAt.index !== anchor.index)) {
      st.branchRoute = { ...crownRoute(st.branchAt, anchor, st.branchPoint), target: anchor, fromSite: st.branchAt.site, cursor: 0 };
    }
    const route = st.branchRoute;
    if (route && route.target.site === anchor.site && route.target.index === anchor.index) route.points[route.points.length - 1].copy(anchor.point);
    // Heavy apes place each hold deliberately. Gibbons travel faster under the branch.
    // The simulation walks straight between tiles, with pace, dashes and departures
    // on top; the wood route is longer and slower. Speed up smoothly as the body
    // falls behind, so it never reaches the reset distance and jumps there.
    const lag = st.canopyLag = Math.hypot(st.branchPoint.x - anchor.point.x, st.branchPoint.z - anchor.point.z);
    const catchUp = 1 + THREE.MathUtils.clamp((lag - .5) * 3, 0, 15);
    const speed = Math.max(.3, def.speed) * (def.sprite.ape ? .55 : 1) * (def.sprite.kind === 'orangutan' ? .8 : 1) * catchUp * (SPEEDS[game.speed] || 0);
    let budget = speed * dt;
    if (route) {
      while (budget > 0 && route.cursor < route.points.length) {
        const target = route.points[route.cursor], distance = st.branchPoint.distanceTo(target);
        if (distance <= budget) { st.branchPoint.copy(target); budget -= distance; route.cursor++; }
        else { st.branchPoint.lerp(target, budget / distance); budget = 0; }
      }
      if (route.cursor >= route.points.length) { st.branchAt = route.target; st.branchRoute = null; }
    } else {
      const distance = st.branchPoint.distanceTo(anchor.point);
      if (distance > 0) st.branchPoint.lerp(anchor.point, Math.min(1, budget / distance));
      st.branchAt = anchor;
    }
  }
  const delta = st.branchPoint.clone().sub(before), distance = delta.length();
  const route = st.branchRoute, transfer = !!route && route.cursor === route.gap;
  let lift = 0;
  if (transfer && def.sprite.kind === 'monkey' && !def.sprite.ape) {
    const start = route.points[route.gap - 1], end = route.points[route.gap], gap = start.distanceTo(end);
    const t = gap > 0 ? THREE.MathUtils.clamp(1 - st.branchPoint.distanceTo(end) / gap, 0, 1) : 1;
    lift = Math.sin(t * Math.PI) * Math.min(.15, gap * .2);
  }
  // Gait is driven by distance along the wood, so a clamped hold doesn't walk in place.
  const stride = Math.max(.06, (def.sprite.len || 14) * st.sc * (def.sprite.ape ? 1.6 : .65));
  const phaseStep = distance / stride * Math.PI * 2;
  st.branchPhase += def.sprite.ape ? Math.min(phaseStep, dt * 2.8) : phaseStep;
  return { delta, before, cursor, dt, gait: dt > 0 && game.speed > 0 ? Math.min(1, distance / dt / Math.max(.25, def.speed * (SPEEDS[game.speed] || 1))) : 0,
    transfer, lift };
}
