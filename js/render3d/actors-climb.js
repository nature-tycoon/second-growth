// Drawing climbers (part of Actors.update, actors.js): up in the crowns, eased between trees of
// different heights (perched birds too), on a real branch of the tree as built (canopy-motion.js,
// canopy-pose.js, howler-motion.js, sloth-bridge.js), the trunk it climbs, climbing down and back
// up, a monkey's meal, an orangutan on the ground, and hands and feet on the bark (canopy-grips.js).
import * as THREE from 'three';
import { F as FEAT, clamp } from '../config.js';
import { trait } from '../data/animal-kinds.js';
import { treeHeight } from './tree-stature.js';
import { treeTrunk } from '../sim/ground-obstacles.js';
import { canopyStep, settleCanopyStep, rebaseCanopy, recoverCanopyRoute } from './canopy-motion.js';
import { canopyLean, canopyRotation } from './canopy-pose.js';
import { canopyTile } from './canopy-support.js';
import { ORANGUTAN_CADENCE } from './orangutan-motion.js';
import { canopyGrips } from './canopy-grips.js';
import { slothBridge } from './sloth-bridge.js';
import { howlerWeight, limitHowlerWeight } from './howler-motion.js';
import { crownTile, turnToward, TURN } from './actors-common.js';

// monkeys and sloths live up in the crowns (or on a snag's bare top)
export function crownHeight(A, rec) {
  const { game, w, def } = rec;
  let { y } = rec;
  // (monkeys up in the sunlit top of the canopy, sloths hanging lower down)
  const c = crownTile(A, rec);
  if (w.tree[c]) y += treeHeight(game.catalog.plants[w.tree[c]]) * w.treeG[c] * (trait(def, 'crownHeight') ?? 0.62);
  else if (w.feature[c] === FEAT.SNAG) y += 0.9;
  rec.y = y;
}

// up in a crown, eased between trees of different heights: climbers, and perched birds
export function canopyHeight(rec) {
  const { w, a, def, st, k, flying, inside, i, returning } = rec;
  let { y } = rec;
  const perched = def.move === 'tree' || (def.move === 'fly' && !a.birdGround && !flying && inside && !!w.tree[i]);
  if (perched && st.canopyY != null && !returning) {
    const gap = y - st.canopyY;
    st.canopyY += gap * Math.min(1, k * 0.9);
    if (a.state !== 'idle') y = st.canopyY + Math.min(0.12, Math.abs(y - st.canopyY) * 0.3); // (a hop only when it's actually moving)
    else y = st.canopyY;
  } else st.canopyY = perched ? y : null;
  rec.y = y;
}

// on a real branch of the tree as built: where it holds on, its route between supports, its
// lean and turn (the one turn, re-taken with the branch's way and pace: 0025)
export function branchPose(A, rec) {
  const { game, w, a, def, st, mo, sc, k, time, returning, canopySites, yaw0, gait0 } = rec;
  let { ax, az, y, branchPitch, branchRoll, branchYaw } = rec;
  if (def.move === 'tree') {
    let site = A.flora?.treeSites.get(crownTile(A, rec));
    const requestedSite = site;
    const supportsValid = !A.flora || rebaseCanopy(st, A.flora);
    const deliberateTransfer = mo.primate === 1 || mo.primate === 2 || mo.primate === 3;
    if (game.speed > 0 && supportsValid && !returning && mo.primate === 2 && st.canopyWait > 1 && st.branchRoute &&
        Math.hypot(st.branchPoint.x - a.x, st.branchPoint.z - a.y) > 1.8 &&
        (st.branchRoute.recovery || st.branchRoute.fromSite !== st.branchRoute.target.site)) {
      recoverCanopyRoute(st, source => {
        const [cx, cz] = source.cell, alternatives = [];
        for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
          if (!dx && !dz) continue;
          const neighbor = A.flora.treeSites.get(canopyTile(w, game.border, cx + dx, cz + dz));
          if (!neighbor) continue;
          const next = neighbor.anchor(clamp(a.x, cx + dx + .1, cx + dx + .9), clamp(a.y, cz + dz + .1, cz + dz + .9),
            null, mo.len * sc * .34, false, { motion: mo, scale: sc });
          if (next) alternatives.push(next);
        }
        return alternatives;
      }, def, time, { x: a.x, z: a.y });
      st.canopyWait = 0;
    }
    const planned = deliberateTransfer && supportsValid && !returning && st.branchRoute && !st.branchRoute.blocked ? st.branchRoute.target : null;
    if (site && planned) site = planned.site;
    else if (site && deliberateTransfer && supportsValid && !returning && st.branchAt?.site.cell && site.cell) {
      const [x, z] = st.branchAt.site.cell;
      if (Math.max(Math.abs(site.cell[0] - x), Math.abs(site.cell[1] - z)) > 1) {
        // At fast game speeds the simulation can pass several trees while
        // a drawn catch finishes. Follow adjacent real supports in turn,
        // instead of requesting a distant jump and resetting onto it.
        let next = null, best = Infinity;
        for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
          if (!dx && !dz) continue;
          const neighbor = A.flora.treeSites.get(canopyTile(w, game.border, x + dx, z + dz));
          if (!neighbor) continue;
          const distance = (x + dx + .5 - a.x) ** 2 + (z + dz + .5 - a.y) ** 2;
          if (distance < best) { best = distance; next = neighbor; }
        }
        if (next) site = next;
      }
    }
    const intermediate = site !== requestedSite && site?.cell;
    const x = intermediate ? clamp(a.x, site.cell[0] + .1, site.cell[0] + .9) : a.x;
    const z = intermediate ? clamp(a.y, site.cell[1] + .1, site.cell[1] + .9) : a.y;
    const anchor = site && planned ? planned : site?.anchor(x, z, returning ? null : st.branch, mo.len * sc * (mo.canopyHanging ? .48 : .34), mo.primate === 3 || mo.canopyHanging, mo.primate || mo.canopyFeet ? { motion: mo, scale: sc } : null);
    st.branch = anchor ?? null;
    if (anchor) {
      canopySites.add(site);
      st.sc = sc;
      const invalidRoute = !supportsValid;
      const firstHold = !st.branchPoint;
      if (firstHold || returning || invalidRoute) {
        st.canopyQuaternion = null; st.canopyGoal = null; st.gripFeet = null; st.canopyReverse = false; st.slothBridge = null;
        st.canopyProgress = null; st.canopyProgressPose = null; st.canopyWait = 0; st.canopyAvoid = null; st.canopyTrail = null; st.canopyBack = 0;
      }
      const previousWeight = mo.canopyWalkerMotion ? st.howlerBody?.clone() : null;
      const motion = canopyStep(st, anchor, def, game, time, returning || invalidRoute, { x: a.x, z: a.y });
      // (only while crossing a gap the leap can't clear: see canopyStep)
      st.walkerClassicTransfer=!!motion.journey&&motion.journey.gap>=1&&!motion.journey.walkerJumpClear&&motion.journey.cursor===motion.journey.gap;
      const walkerMotion=mo.canopyWalkerMotion&&!st.walkerClassicTransfer;
      if(mo.canopyWalkerMotion && st.walkerClassicTransfer) {
        st.howlerBody?.set(0,0,0);st.howlerFinalPose=null;st.howlerForkTurn=false;
      }
      if (walkerMotion) {
        howlerWeight(st, mo, motion.dt, game.speed, firstHold || returning || invalidRoute);
        // Walking on after a jump is straight branch travel, not a fork turn:
        // keep the alternating hand/foot sequence instead of paired swings.
        const afterJump=motion.journey?.gap>=1 && motion.journey.cursor>motion.journey.gap;
        // Approaching a crossing keeps the paired fork handling its timing is tuned for. Just
        // landed with a pair unsupported, it re-plants that pair, once and for at most 0.6 s
        // (paired steps themselves leave a pair lifted, so waiting for both to be planted kept
        // whole trunk climbs in paired steps). After that, limbs pair only where the walker
        // turns: a bend just ahead, or a body facing well away from its way on (backwards counts
        // as aligned, for backing down a trunk; a climbing body sits about .4 off its line).
        const facing=st.canopyQuaternion&&new THREE.Vector3(1,0,0).applyQuaternion(st.canopyQuaternion);
        const away=facing&&motion.heading.lengthSq()>1e-10 ? Math.acos(Math.min(1,Math.abs(facing.dot(motion.heading.clone().normalize())))) : 0;
        const turning=motion.bend>(st.howlerForkTurn?.35:.5)||away>(st.howlerForkTurn?.7:.9);
        const journey=motion.journey,pairsHeld=st.gripFeet&&st.gripFeet.slice(0,2).some(f=>!f.free&&!f.from)&&st.gripFeet.slice(2).some(f=>!f.free&&!f.from);
        if(journey&&!afterJump)st.howlerForkTurn=true;
        else if(afterJump && !journey.regrouped && !pairsHeld && (journey.regroupTime=(journey.regroupTime||0)+motion.dt)<.6) {
          st.howlerForkTurn=true;st.howlerRegrouping=true;
        } else if(afterJump&&st.howlerRegrouping) {st.howlerForkTurn=false;st.howlerRegrouping=false;journey.regrouped=true;}
        else if(afterJump) {journey.regrouped=true;st.howlerForkTurn=turning;}
        if (game.speed>0)limitHowlerWeight(st, mo, motion.before, st.canopyLeap?.lift || 0, previousWeight,
          new Set([site, st.branchAt?.site, st.branchRoute?.fromSite, st.branchRoute?.target.site]));
      }
      if (mo.canopyHanging) slothBridge(st, A.flora, mo.len * sc);
      const route = st.branchRoute;
      if (route && A.flora.treeSites.get(route.fromSite.tile) === route.fromSite) canopySites.add(route.fromSite);
      const steering = game.speed > 0 && motion.heading.lengthSq() > 1e-8;
      const settlePose = (mo.primate !== 2 && mo.primate !== 3) || steering || st.canopyBack > 0 || (mo.primate === 3 && gait0 > .01) || firstHold || returning || invalidRoute;
      const dir = steering ? motion.heading : (st.branchAt || anchor).direction;
      let yaw = Math.atan2(-dir.z, dir.x), sign = 1;
      // Orangutans back down a steep main limb with the head uphill.
      // Turning headfirst swings their long torso into neighbouring forks.
      // Walker monkeys back down a steep trunk the same way (see canopyStep).
      if (mo.primate === 2 || mo.canopyWalkerMotion && !st.walkerClassicTransfer) {
        if (st.canopyReverse) { yaw += Math.PI; sign = -1; }
      }
      if (!steering && Math.cos(yaw - yaw0) < 0) { yaw += Math.PI; sign = -1; }
      // (on a branch it turns to the branch's way instead of the body's heading: from where it was)
      st.yaw = yaw0;
      if (returning || firstHold) turnToward(st, yaw, TURN.snap, 1);
      else if (steering) turnToward(st, yaw, mo.primate === 2 ? TURN.ape : TURN.canopy, k);
      // Follow a steep main limb with the whole body rather than holding a
      // nearly level torso through it. Rotate around the actual hold.
      const pitchLimit = mo.primate === 1 || mo.primate === 2 || mo.canopyHanging ? 1.2 : .35;
      const pitch = mo.primate === 3 ? 0 : clamp(Math.atan2(dir.y * sign, Math.hypot(dir.x, dir.z)), -pitchLimit, pitchLimit);
      if (settlePose && (game.speed > 0 || firstHold || returning)) st.branchSlope = firstHold || returning ? pitch
        : (st.branchSlope || 0) + (pitch - (st.branchSlope || 0)) * Math.min(1, k * 2.4);
      branchPitch = st.branchPitch || 0;
      if (settlePose && (game.speed > 0 || firstHold || returning)) {
        const supportSites = new Set([site, st.branchAt?.site, route?.fromSite, route?.target.site]);
        for (const supportSite of supportSites) if (supportSite) canopySites.add(supportSite);
        const profile=st.walkerClassicTransfer&&mo.canopyWalkerMotion ? (mo.trunkClamber ||= {...mo,canopyWalkerMotion:false}) : mo;
        const lean = canopyLean(st, profile, supportSites, st.branchSlope || 0, mo.primate === 3 ? gait0 : st.gait,
          a.fruitMeal ? Math.min(1, a.fruitMeal.elapsed / .6) * (.8 + .2 * Math.sin(a.fruitMeal.elapsed * 5)) : 0, motion.dt, motion.before, motion);
        settleCanopyStep(st, motion);
        // A blocked step can be rolled back onto the gap (or off it): the grips and pose
        // must follow where the body actually is.
        const settled = st.branchRoute;
        st.walkerClassicTransfer = !!settled && settled.gap >= 1 && !settled.walkerJumpClear && settled.cursor === settled.gap;
        st.branchRoll = lean.roll; st.branchPitch = lean.pitch; st.branchYaw = lean.yaw; branchPitch = lean.pitch;
      }
      if (walkerMotion && steering) st.howlerBacking = motion.heading.dot(new THREE.Vector3(1,0,0).applyQuaternion(st.canopyQuaternion)) < 0;
      if (walkerMotion && game.speed > 0) limitHowlerWeight(st, mo, st.branchPoint, st.canopyLeap?.lift || 0, previousWeight,
        new Set([site, st.branchAt?.site, st.branchRoute?.fromSite, st.branchRoute?.target.site]));
      if (mo.canopyWalkerMotion) {
        const final=st.howlerFinalPose,matching=final&&final.site===anchor.site&&final.index===anchor.index&&final.point.distanceTo(anchor.point)<.004;
        st.howlerResting = !st.branchRoute && st.branchPoint.distanceTo(anchor.point)<.004 &&
          (!st.canopyGoal || st.canopyQuaternion.angleTo(st.canopyGoal)<.015) && (!matching || st.canopyQuaternion.angleTo(final.pose)<.015);
      }
      if (mo.canopyWalkerMotion && st.howlerResting && st.gripFeet?.slice(0,2).some(f=>!f.free&&!f.from) && st.gripFeet.slice(2).some(f=>!f.free&&!f.from)) st.howlerForkTurn=false;
      if (game.speed > 0 && mo.primate === 2) {
        // A deliberate turn is progress too. Watch the accepted body,
        // rather than the simulation agent or a repeatedly replanned route.
        // The turn into a crossing pose eases off as it closes in, so its last
        // tenth of a radian turns too slowly to count by angle: count it while
        // the remaining turn keeps halving, or the climb is abandoned just short of it.
        const remaining = st.canopyGoal ? st.canopyQuaternion.angleTo(st.canopyGoal) : 0;
        if (!st.branchRoute || !st.canopyProgress || st.branchPoint.distanceTo(st.canopyProgress) > .02 || st.canopyQuaternion.angleTo(st.canopyProgressPose) > .15 ||
            remaining > .004 && remaining < st.canopyProgressTurn * .5) {
          st.canopyProgress = st.branchPoint.clone(); st.canopyProgressPose = st.canopyQuaternion.clone(); st.canopyProgressTurn = remaining; st.canopyWait = 0;
        } else st.canopyWait = (st.canopyWait || 0) + motion.dt;
      }
      st.gait = game.speed > 0 ? gait0 + (motion.gait - gait0) * Math.min(1, k * (mo.primate === 3 ? .35 : 2)) : gait0;
      branchRoll = st.branchRoll || 0;
      branchYaw = st.branchYaw || 0;
      // Hanging apes attach by the supporting hand; branch walkers use feet.
      A.holdOffset.set(mo.gripX || 0, mo.supportY || 0, mo.gripZ || 0).multiplyScalar(sc)
        .applyQuaternion(canopyRotation(st.yaw + branchYaw, branchPitch, branchRoll, A.holdRotation));
      ax = st.branchPoint.x - A.holdOffset.x; az = st.branchPoint.z - A.holdOffset.z;
      y = st.branchPoint.y + motion.lift - A.holdOffset.y; st.canopyY = y;
    } else { st.branchRoute = null; st.branchAt = null; st.branchPoint = null; st.slothBridge = null; }
  } else st.branch = null;
  rec.ax = ax; rec.az = az; rec.y = y; rec.branchPitch = branchPitch; rec.branchRoll = branchRoll; rec.branchYaw = branchYaw;
}

// the trunk it climbs, easing down out of the trees and back up, a walker monkey's weight on
// its holds, a monkey's meal, and an orangutan on the ground
export function climbSupport(A, rec) {
  const { game, w, def, a, st, mo, sc, k, time, returning, cling, body, yaw0 } = rec;
  let { ax, az, y } = rec;
  // a monkey in a crown keeps the trunk it climbs as its support, like a woodpecker (focus.js)
  if (mo.primate && st.branch && !cling) { const c = crownTile(A, rec); if (c >= 0 && w.tree[c]) st.trunk = treeTrunk(w, c % w.w, c / w.w | 0); }
  // Climbing down off the last tree (often to leave the map) or back up into
  // one, ease from the drawn body to the new position rather than jumping.
  if (def.move === 'tree') {
    if (st.onBranch !== undefined && !!st.branch !== st.onBranch && !returning) st.shiftOffset = { x: st.x - ax, y: st.y - y, z: st.z - az, time };
    st.onBranch = !!st.branch;
    if (returning) st.shiftOffset = null;
    else if (st.shiftOffset) {
      const o = st.shiftOffset, step = Math.max(0, Math.min(.1, time - o.time));
      let fade = game.speed > 0 ? Math.exp(-6 * step) : 1;
      if (mo.primate === 2) {
        // A delayed climb must not become a dash when leaving the wood.
        const distance = Math.hypot(o.x, o.y, o.z);
        fade = Math.max(fade, 1 - step * mo.len * sc * 3 / Math.max(distance, 1e-9));
      }
      o.time = time; o.x *= fade; o.y *= fade; o.z *= fade;
      ax += o.x; y += o.y; az += o.z;
      if (Math.hypot(o.x, o.y, o.z) < .002) st.shiftOffset = null;
    }
  }
  if (st.branch && mo.canopyWalkerMotion && !st.walkerClassicTransfer) {
    A.holdOffset.copy(st.howlerBody).multiplyScalar(sc).applyQuaternion(st.canopyQuaternion);
    ax += A.holdOffset.x; y += A.holdOffset.y; az += A.holdOffset.z;
  }
  // (and a leaf-eating monkey at a forage meal: the meal's left counts down from about 1.5 to 3.5 s)
  const leafMeal = mo.primate && a.state === 'forage' && a.forage?.food === 'leaves' ? a.forage : null;
  const eating = mo.primate && (a.state === 'primate' && a.fruitMeal || leafMeal);
  const eatTime = leafMeal ? time - (st.leafAt ??= time) : (st.leafAt = null, a.fruitMeal?.elapsed);
  const eatPose = eating ? Math.min(1, eatTime / .6) * (.8 + .2 * Math.sin(eatTime * 5)) : 0;
  if (mo.primate === 2 && !st.branch) {
    const step = Math.max(0, Math.min(.1, time - (st.groundTime ?? time)));
    // (on the ground an orangutan turns its body no faster than a radian a second)
    if (game.speed === 0) st.yaw = yaw0;
    else if (!returning) {
      st.yaw = yaw0; if (body) turnToward(st, body.target, body.ease, k, step);
      const travelled = Math.hypot(ax - st.x, az - st.z);
      st.branchPhase = (st.branchPhase || 0) + Math.min(travelled / Math.max(.06, mo.len * sc * .65) * Math.PI * 2, step * ORANGUTAN_CADENCE);
    }
  }
  st.groundTime = time;
  rec.ax = ax; rec.az = az; rec.y = y; rec.eating = eating; rec.eatPose = eatPose;
}

// hands and feet on the bark, and a sloth's bridge between trees
export function grips(A, rec) {
  const { game, st, mo, sc, time, returning, canopySites, bridges, ax, az, y, branchPitch, branchRoll, branchYaw } = rec;
  let grips = null;
  if (st.branch && mo.canopyFeet) {
    st.sc = sc;
    A.m.compose(A.holdOffset.set(ax, y, az), canopyRotation(st.yaw + branchYaw, branchPitch, branchRoll, A.holdRotation), A.swingBase.set(sc, sc, sc));
    const route = st.branchRoute, sites = new Set([st.branch.site, st.branchAt?.site, route?.fromSite, route?.target.site]);
    if (st.slothBridge) sites.add(st.slothBridge);
    for (const foot of st.gripFeet || []) for (const site of [foot.site, foot.to?.canopySite])
      if (site && (site.transient || A.flora.treeSites.get(site.tile) === site)) sites.add(site);
    grips = canopyGrips(st, mo, sites, A.m, time, game.speed, returning);
    for (const foot of st.gripFeet || []) for (const site of [foot.site, foot.to?.canopySite])
      if (site && A.flora.treeSites.get(site.tile) === site) canopySites.add(site);
  } else { st.gripFeet = null; st.gripTime = time; }
  if (st.slothBridge) {
    if (st.branchRoute === st.slothBridge.route || st.gripFeet?.some(foot => foot.site === st.slothBridge || foot.to?.canopySite === st.slothBridge)) bridges.add(st.slothBridge);
    else st.slothBridge = null;
  }
  for (const foot of st.gripFeet || []) for (const site of [foot.site, foot.to?.canopySite]) if (site?.transient) bridges.add(site);
  rec.grips = grips;
}
