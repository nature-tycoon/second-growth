// Drawing river fish (part of Actors.update, actors.js): their depth in the water, a running
// salmon's leaps, a shark's bend into its turns, a fish's snap at food (reef fish too), and the
// tail beat that keeps pace with the water it covers.
import { groundAt } from '../sim/waterline.js';
import { LEVEL, clamp } from '../config.js';
import { trait } from '../data/animal-kinds.js';
import { fishSnap } from './eating-pose.js';
import { salmonLeap } from './actors-common.js';

const SWIM_STRIDE = 0.7; // (body lengths a fish moves per beat of its tail at a cruise: about 0.6-0.8 in real fish)

// (in its tile's water, the same depth the simulation keeps it in (swimDepth): down to
// half way in the shallows, so it never sinks into the bank where the water thins out)
export function riverFishHeight(c) {
  const { w, a, def, st, mo, sc, k, frameDt, time, surf, ground } = c;
  let y;
  const room = surf != null ? surf - groundAt(w, a.x, a.y) * LEVEL : 0; // (the ground on the drawn triangles)
  y = surf != null ? surf - Math.max(0, Math.min(0.05 + mo.sink * sc, room * 0.5)) : ground;
  // and its back stays under the surface wherever the water is deep enough, its belly never in
  // the bed; a bottom-dweller (the catfish) lies on the bed, in water the simulation keeps
  // deep enough for its whole body (fishDepth)
  if (surf != null && mo.top != null) {
    const bed = surf - room - mo.bottom * sc;
    y = Math.max(bed, trait(def, 'bottomDweller') ? bed + 0.004 : Math.min(y, surf - 0.012 - mo.top * sc));
  }
  // running salmon leap: every few seconds one arcs clear of the water, nose up then down,
  // only while it's making its way along the river: one holding in a pool or in the current
  // stays under (it decides between leaps, so a leap under way always finishes)
  let jp = def.special === 'salmon' && surf != null ? salmonLeap(a, time) : -1;
  if (def.special === 'salmon') {
    st.swimPace = (st.swimPace || 0) + (Math.hypot(a.x - st.px, a.y - st.py) / Math.max(1 / 120, frameDt) - (st.swimPace || 0)) * Math.min(1, k);
    if (jp < 0) st.leapOk = a.state !== 'idle' && st.swimPace > 0.15;
    if (!st.leapOk) jp = -1;
  }
  st.jp = jp;
  if (jp >= 0) { y = surf + Math.sin(jp * Math.PI) * 0.3 - 0.05; st.pitch = Math.cos(jp * Math.PI) * 0.95; } else st.pitch = 0;
  c.y = y;
}

// a swimmer that bends (the shark) curves into its turns: the tail swings to the inside
export function tailBend(c) {
  const { st, mo, k, time, yaw0 } = c;
  if (mo.bend) {
    let dy = st.yaw - yaw0; dy -= Math.round(dy / (Math.PI * 2)) * Math.PI * 2;
    const rate = dy / Math.max(1e-3, time - (st.t ?? time - 0.016));
    st.bend = (st.bend || 0) + (clamp(-rate * 0.45, -1, 1) - (st.bend || 0)) * Math.min(1, k * 0.8);
  }
}

// a fish snapping at its food darts forward, nose-down at food on the bottom
export function snapPose(c) {
  const { a, def, st, mo, sc, k, time } = c;
  const snap = (mo.swims || def.reef) && !def.benthic ? fishSnap(a, def, time) : null;
  st.snap = (st.snap || 0) + ((snap?.nose || 0) - (st.snap || 0)) * Math.min(1, k * 2);
  if (snap) { const reach = snap.dart * mo.len * sc * 0.1; c.ax += Math.cos(st.yaw) * reach; c.az -= Math.sin(st.yaw) * reach; }
  c.posePitch -= st.snap;
}

// A swimmer's tail beats once for every SWIM_STRIDE body lengths it covers, as a real fish's
// does, so its body wave travels back a little faster than it swims, whatever its size or speed.
// Hovering, it sculls slowly on the simulation's clock (a.phase). (Its wave runs at 1.4 times
// the phase: uWave in animals/animal-material.js.)
export function tailBeat(c) {
  const { a, st, mo, sc, dx, dz } = c;
  if (mo.swims) {
    const beat = Math.min(0.5, Math.hypot(dx, dz)) / (SWIM_STRIDE * mo.len * sc) * Math.PI * 2 / 1.4;
    const scull = Math.max(0, a.phase - (st.simPhase ?? a.phase)) * Math.PI * 0.4;
    st.swimPhase = ((st.swimPhase ?? a.id * 2.3) + Math.max(beat, scull)) % (Math.PI * 200); st.simPhase = a.phase;
  }
}
