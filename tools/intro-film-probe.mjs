// The intro film's measuring probe (runs in the studio page, intro-film.html?layer=<name>&probe=1;
// tools/intro-film-motion.mjs reads it). Each frame is staged exactly as it is filmed, the
// renderer's draw runs (so the animals are posed by the game's own drawing) but nothing is drawn on
// the GPU, and this reads what the frame would show:
//   - the camera: where it is, where it looks, its field of view and roll
//   - each cast animal as drawn: its feet's level and the drawn ground under its hooves, its head
//     and body, its body length, its gait and leg cycle, where it is in the frame
//   - whether the camera's sight lines to its head and body are blocked, and by what: trunks and
//     snags (as flora draws them), logs, the drawn terrain, or bushes (approximate: a bush's
//     drawn shape isn't known here, so a ball the size of a grown shrub)
import * as THREE from 'three';
import { BORDER } from '../js/config.js';
import { trunkRadius, logSpot, LOG_R, LOG_HALF, shrubSpot } from '../js/sim/ground-obstacles.js';
import { F as FEAT } from '../js/config.js';

// The drawn terrain mesh's height at (x, z): the two triangles of its tile (terrain.js lays out each
// tile of the land and its border as 6 vertices), not the simulation's smooth heightAt.
function meshGround(r) {
  const T = r.terrain, pos = T.mesh.geometry.attributes.position.array;
  return (x, z) => {
    const tx = Math.floor(x), tz = Math.floor(z);
    if (tx < -BORDER || tz < -BORDER || tx >= T.TW - BORDER || tz >= T.TH - BORDER) return r.heightAtScene(x, z);
    const base = ((tz + BORDER) * T.TW + (tx + BORDER)) * 18;
    for (let k = 0; k < 2; k++) {
      const o = base + k * 9;
      const ax = pos[o], ay = pos[o + 1], az = pos[o + 2], bx = pos[o + 3], by = pos[o + 4], bz = pos[o + 5], cx = pos[o + 6], cy = pos[o + 7], cz = pos[o + 8];
      const d = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz);
      if (Math.abs(d) < 1e-9) continue;
      const u = ((bz - cz) * (x - cx) + (cx - bx) * (z - cz)) / d, v = ((cz - az) * (x - cx) + (ax - cx) * (z - cz)) / d, w = 1 - u - v;
      if (u >= -1e-4 && v >= -1e-4 && w >= -1e-4) return u * ay + v * by + w * cy;
    }
    return r.heightAtScene(x, z);
  };
}

// Wood and bushes near the action, gathered once per layer (the trees don't change during a shot;
// the border forest has no world tiles, so its trunks come from what flora drew: treeSites).
function obstacles(r, g, box) {
  const inBox = (x, z) => x > box.x0 && x < box.x1 && z > box.z0 && z < box.z1;
  const trunks = [];
  for (const s of r.flora.treeSites.values()) {
    const [x, y, z, sx, sy] = s.transform;
    if (!inBox(x, z)) continue;
    if (!s.geo.boundingBox) s.geo.computeBoundingBox();
    const top = s.geo.boundingBox.max.y * (sy || sx || 1);
    const pl = s.plant == null ? null : typeof s.plant === 'object' ? s.plant : g.catalog.plants[s.plant];
    const base = pl?.look ? trunkRadius(pl) : 0;
    trunks.push({ x, z, y, r: base > 0 ? base * (sx || 1) : .1 + .12 * Math.min(1.5, sx || 1), top });
  }
  const w = g.world, logs = [], bushes = [];
  for (let y = Math.max(0, Math.floor(box.z0)); y < Math.min(w.h, Math.ceil(box.z1)); y++) for (let x = Math.max(0, Math.floor(box.x0)); x < Math.min(w.w, Math.ceil(box.x1)); x++) {
    const i = w.idx(x, y);
    if (w.feature[i] === FEAT.LOG) { const [cx, cz, yaw] = logSpot(w, x, y, false); logs.push({ cx, cz, dx: Math.cos(yaw), dz: -Math.sin(yaw) }); }
    if (w.shrub[i] && w.shrubG[i] > .2) {
      const p = w.catalog.plants[w.shrub[i]], [sx, sz] = shrubSpot(x, y, p, !!w.tree[i]);
      bushes.push({ x: sx, z: sz, r: .22 + .18 * w.shrubG[i] });
    }
  }
  return { trunks, logs, bushes };
}

// What first blocks the straight line from the camera at `o` to the point `p` (both scene units),
// or null. ground(x, z): the drawn terrain.
function blocker(o, p, ob, ground) {
  const dx = p.x - o.x, dy = p.y - o.y, dz = p.z - o.z, L = Math.hypot(dx, dz);
  const end = 1 - .12 / Math.max(.12, Math.hypot(dx, dy, dz)); // (stop just short of the point itself)
  // terrain: a few samples a tile along the line
  const n = Math.max(4, Math.ceil(L * 6));
  for (let k = 1; k < n; k++) { const u = k / n * end; if (ground(o.x + dx * u, o.z + dz * u) > o.y + dy * u + .01) return 'terrain'; }
  if (L < 1e-6) return null;
  for (const t of ob.trunks) {
    const u = ((t.x - o.x) * dx + (t.z - o.z) * dz) / (L * L);
    if (u <= 0 || u >= end) continue;
    const y = o.y + dy * u, top = t.y + t.top, h = (y - t.y) / Math.max(.01, t.top);
    if (y < t.y - .05 || y > top) continue;
    const rr = t.r * Math.max(.25, 1 - h * .75); // (a trunk tapers toward its top)
    if (Math.hypot(o.x + dx * u - t.x, o.z + dz * u - t.z) < rr) return 'trunk';
  }
  for (const lg of ob.logs) {
    // the line's nearest approach to the log's axis, in plan, low to the ground
    for (let k = 1; k < n; k++) {
      const u = k / n * end, x = o.x + dx * u, z = o.z + dz * u, y = o.y + dy * u;
      const s = Math.max(-LOG_HALF, Math.min(LOG_HALF, (x - lg.cx) * lg.dx + (z - lg.cz) * lg.dz));
      if (Math.hypot(x - lg.cx - lg.dx * s, z - lg.cz - lg.dz * s) < LOG_R * 1.4 && y - ground(x, z) < LOG_R * 2.2) return 'log';
    }
  }
  for (const b of ob.bushes) {
    const u = ((b.x - o.x) * dx + (b.z - o.z) * dz) / (L * L);
    if (u <= 0 || u >= end) continue;
    const x = o.x + dx * u, z = o.z + dz * u, y = o.y + dy * u, gy = ground(b.x, b.z) + b.r;
    if (Math.hypot(x - b.x, y - gy, z - b.z) < b.r) return 'bush';
  }
  return null;
}

// cast: { name: agent } of the animals to follow. Returns measure(frame) -> a plain record.
export function makeProbe(r, g, cast, box) {
  const ground = meshGround(r);
  let ob = null;
  const v = new THREE.Vector3();
  return function measure(t) {
    ob ||= obstacles(r, g, box);
    const cam = r.eyeOn ? r.eye.camera : r.camera;
    cam.updateMatrixWorld();
    const right = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 0);
    const fwd = new THREE.Vector3(); cam.getWorldDirection(fwd);
    const rec = {
      t, eye: !!r.eyeOn,
      cam: { pos: cam.position.toArray(), dir: fwd.toArray(), look: r.eyeOn ? r.eye.look.toArray() : [r.target.x, r.target.y, r.target.z],
        fov: cam.isPerspectiveCamera ? cam.fov : null, aspect: cam.aspect ?? (r.vw / r.vh), roll: Math.asin(Math.max(-1, Math.min(1, right.y))) },
      view: { vw: r.vw, vh: r.vh, ppu: r.ppu, zoom: r.zoom },
      animals: {},
    };
    const screen = p => { v.set(p.x, p.y, p.z).project(cam); return { x: v.x, y: v.y, front: v.z < 1 && v.z > -1 }; };
    for (const [name, a] of Object.entries(cast)) {
      if (!a || !g.wildlife.agents.includes(a)) continue;
      const st = r.actors.pose.get(a.id), drawn = !!st?.visible;
      const def = g.catalog.animals[a.sp] || a.def;
      const x = drawn ? st.x : a.x, z = drawn ? st.z : a.y, y = drawn ? st.y : r.heightAtScene(a.x, a.y);
      const yaw = drawn ? st.yaw : -(a.heading || 0), len = drawn ? st.foot : .5, tall = drawn ? st.tall : .5;
      const c = Math.cos(yaw), s = Math.sin(yaw);
      // the hooves: front and back pairs, a third of the body length either side of the middle
      const feet = [[.32, .08], [.32, -.08], [-.32, .08], [-.32, -.08]].map(([f, sd]) => {
        const fx = x + c * f * len + s * sd * len, fz = z - s * f * len + c * sd * len; return +(ground(fx, fz) - y).toFixed(4);
      });
      // the head where the model has its eyes (dipped while grazing), else forward and high
      let head;
      if (drawn && st.eye) {
        const [ex0, ey0] = st.eye, [px, py] = st.eyePivot, dip = -(st.graze || 0) * .9, ca = Math.cos(dip), sa = Math.sin(dip);
        const ex = px + (ex0 - px) * ca - (ey0 - py) * sa, ey = py + (ex0 - px) * sa + (ey0 - py) * ca + (st.bob || 0);
        head = { x: x + c * ex * st.sc, y: y + ey * st.sc, z: z - s * ex * st.sc };
      } else head = { x: x + c * len * .45, y: y + tall * .85, z: z - s * len * .45 };
      const body = drawn ? { x: st.center.x, y: st.center.y, z: st.center.z } : { x, y: y + tall * .5, z };
      const o = { x: cam.position.x, y: cam.position.y, z: cam.position.z };
      rec.animals[name] = {
        sp: a.sp, drawn, x, y, z, yaw, len, tall, feet,
        groundSim: r.heightAtScene(x, z), state: a.state, hunt: a.hunt?.phase || null, leap: !!a.hunt?.leap, legs: a.phase, legPhase: drawn ? st.legPhase ?? null : null,
        head: [head.x, head.y, head.z], body: [body.x, body.y, body.z],
        headScreen: screen(head), bodyScreen: screen(body),
        headBlock: r.eyeOn ? blocker(o, head, ob, ground) : null, bodyBlock: r.eyeOn ? blocker(o, body, ob, ground) : null,
      };
    }
    return rec;
  };
}
