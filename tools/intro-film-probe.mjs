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
import { focus } from '../js/render3d/focus.js';

// The drawn terrain mesh's height at (x, z): the two triangles of its tile (terrain.js lays out each
// tile of the land and its border as 6 vertices), not the simulation's smooth heightAt.
export function meshGround(r) {
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
export function obstacles(r, g, box) {
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
export function blocker(o, p, ob, ground) {
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
// The share of the frame covered by plants within `near` scene units of the camera (an eye-level
// frame only): the scene drawn again with only the plants' own materials (so the tracking lens's
// openings and the film's thinning count) and the camera's far plane pulled in to `near`, into a
// small target, and its covered pixels counted. render: the renderer's real draw (the probe stubs it).
export const NEAR_COVER = .6; // tiles: about 5 m
export function nearCover(r, render, near = NEAR_COVER) {
  const F = r.flora, mats = new Set([F.foliage, F.shrubs, F.grass, F.tallGrass, F.small, F.canopyCrown].filter(Boolean));
  return coverage(r, render, o => mats.has(o.material), near);
}
// The share of an eye-level frame covered by the objects `keep` picks, drawn alone (their own
// materials) out to `far`, into a small target.
function coverage(r, render, keep, far) {
  const W = 160, H = 90, rt = coverage.rt ||= new THREE.WebGLRenderTarget(W, H), px = coverage.px ||= new Uint8Array(W * H * 4);
  const cam = r.eye.camera.clone(); cam.near = Math.min(cam.near, .01); cam.far = far; cam.aspect = r.eye.camera.aspect; cam.updateProjectionMatrix();
  const hidden = [], bg = r.scene.background, fog = r.scene.fog, gl = r.gl;
  r.scene.traverse(o => { if ((o.isMesh || o.isPoints || o.isLine || o.isSprite) && o.visible && !keep(o)) { o.visible = false; hidden.push(o); } });
  r.scene.background = null; r.scene.fog = null;
  const target = gl.getRenderTarget(), clear = gl.getClearAlpha(), auto = gl.shadowMap.autoUpdate, need = gl.shadowMap.needsUpdate;
  gl.shadowMap.autoUpdate = false; gl.shadowMap.needsUpdate = false;
  gl.setRenderTarget(rt); gl.setClearAlpha(0); gl.clear(); render(r.scene, cam);
  gl.readRenderTargetPixels(rt, 0, 0, W, H, px);
  gl.setRenderTarget(target); gl.setClearAlpha(clear); gl.shadowMap.autoUpdate = auto; gl.shadowMap.needsUpdate = need;
  for (const o of hidden) o.visible = true;
  r.scene.background = bg; r.scene.fog = fog;
  let n = 0; for (let i = 3; i < px.length; i += 4) if (px[i] > 0) n++;
  return +(n / (W * H)).toFixed(4);
}
// The share of an eye-level frame where the eye's sky dome (eye-sky.js, drawn last round the eye)
// paints over land: the land drawn alone to the camera's far plane, less the land within the dome.
// (Cole, rough cut: a white background engulfed the sweep: the land beyond the dome was hazed over.)
export function skyOverLand(r, render) {
  const dome = r.eyeSky?.dome; if (!dome?.visible) return 0;
  const land = o => o === r.terrain.mesh, R = dome.geometry.parameters.radius * dome.scale.x;
  return +Math.max(0, coverage(r, render, land, r.eye.camera.far) - coverage(r, render, land, R)).toFixed(4);
}

// The tracked animal's whole head on screen (s8, Cole: "the deer's head must be in frame"): the
// bounds, in the frame's -1..1, of the head as drawn: its model's head vertices (aPart HEAD: skull,
// ears, antlers), dipped about their neck pivot by the instance's graze as the shader does it
// (animal-material.js: rotZ by -graze * uHead), then placed by the instance's own matrix. Only the
// tracked animal (the shot's key animal, which the tracking lens follows) is known by instance
// (Fauna.tracked). null if it isn't drawn this frame.
const HEAD_PART = 8, headVerts = new WeakMap();
function headOf(geo) {
  let h = headVerts.get(geo); if (h) return h;
  const P = geo.attributes.position, part = geo.attributes.aPart, piv = geo.attributes.aPivot, out = [];
  if (part && piv) for (let i = 0; i < P.count; i++) if (Math.abs(part.getX(i) - HEAD_PART) < .5) out.push(P.getX(i), P.getY(i), P.getZ(i), piv.getX(i), piv.getY(i), piv.getZ(i));
  headVerts.set(geo, h = new Float32Array(out));
  return h;
}
export function headBox(r, cam) {
  const tr = r.actors?.fauna?.tracked?.[0]; if (!tr) return null;
  const { pool, k } = tr, verts = headOf(pool.geo); if (!verts.length) return null;
  const m = new THREE.Matrix4().fromArray(pool.mesh.instanceMatrix.array, k * 16);
  const dip = -pool.anim.array[k * 4 + 3] * (pool.motion.head ?? .9), c = Math.cos(dip), s = Math.sin(dip);
  const v = new THREE.Vector3(); let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (let i = 0; i < verts.length; i += 6) {
    const dx = verts[i] - verts[i + 3], dy = verts[i + 1] - verts[i + 4];
    v.set(verts[i + 3] + dx * c - dy * s, verts[i + 4] + dx * s + dy * c, verts[i + 2]).applyMatrix4(m).project(cam);
    x0 = Math.min(x0, v.x); x1 = Math.max(x1, v.x); y0 = Math.min(y0, v.y); y1 = Math.max(y1, v.y);
  }
  return { x0: +x0.toFixed(4), x1: +x1.toFixed(4), y0: +y0.toFixed(4), y1: +y1.toFixed(4) };
}

export function makeProbe(r, g, cast, box, render = null, { key = null, keep = 1.5 } = {}) {
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
      const c = Math.cos(yaw), s = Math.sin(yaw), pitch = drawn ? (st.pitch || 0) + (st.slope || 0) : 0; // (st.slope: the game's pitch to the ground's slope, slopePose)
      // the hooves: front and back pairs, a third of the body length either side of the middle (with
      // the body's pitch, nose up positive: the drawing pitches walkers to the slope)
      const feet = [[.32, .08], [.32, -.08], [-.32, .08], [-.32, -.08]].map(([f, sd]) => {
        const fl = f * len * Math.cos(pitch), fx = x + c * fl + s * sd * len, fz = z - s * fl + c * sd * len;
        return +(ground(fx, fz) - y - Math.sin(pitch) * f * len).toFixed(4);
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
        id: a.id, sp: a.sp, kind: def?.key ?? null, drawn, x, y, z, yaw, pitch, len, tall, feet,
        // (the stalking crouch: the drawing lowers the whole body by this, actors-ground.js headPose, a
        // declared pose like a leap: the motion check measures the hooves without it)
        crouch: drawn && st.crouch > .01 ? +(st.crouch * (def.sprite.leg || def.sprite.h || 8) * (st.sc || 1) * .3).toFixed(4) : 0,
        groundSim: r.heightAtScene(x, z), state: a.state, hunt: a.hunt?.phase || null, leap: !!a.hunt?.leap, legs: a.phase, legPhase: drawn ? st.legPhase ?? null : null,
        head: [head.x, head.y, head.z], body: [body.x, body.y, body.z],
        headScreen: screen(head), bodyScreen: screen(body),
        headBlock: r.eyeOn ? blocker(o, head, ob, ground) : null, bodyBlock: r.eyeOn ? blocker(o, body, ob, ground) : null,
      };
    }
    if (key && rec.animals[key] && r.eyeAgent?.id === rec.animals[key].id) rec.animals[key].headBox = headBox(r, cam);
    // plants covering the frame: within NEAR_COVER of the lens, and in front of the key animal (nearer
    // than `keep` short of it: the foreground, which hid the buck in the first shot)
    if (r.eyeOn && render) {
      rec.nearCover = nearCover(r, render);
      rec.skyOverLand = skyOverLand(r, render);
      rec.lens = { on: +focus.uFocusAmt.value.toFixed(3), id: r.eyeAgent?.id ?? null }; // (the game's tracking lens, decision 0040)
      const a = key && rec.animals[key], o = rec.cam.pos;
      if (a) { const d = Math.hypot(a.x - o[0], a.z - o[2]) - keep; rec.foreCover = d > NEAR_COVER ? nearCover(r, render, d) : rec.nearCover; }
    }
    return rec;
  };
}
