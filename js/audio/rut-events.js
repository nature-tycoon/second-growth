// Hears the rut: bull elk bugling (from the simulation) and antlers clashing in a bout (timed
// to the drawn fight, so the crack lands as the racks meet). Called every frame by the UI.
import { ANIMALS, isMaleVariant } from '../data/animals.js';
import { bugles } from '../sim/animal-life.js';
import { boutCycle, CRASH } from '../render3d/bout-clock.js';

const BUGLE_RANGE = 70, CLASH_RANGE = 26; // tiles: a bugle carries a long way, antlers don't
const bouts = new Map(); // lower id of a fighting pair -> { c: last cycle, next: next light rattle }
let lastWarm = 0;

export function rutSounds(game, renderer, music, time) {
  if (!music.ctx) { bugles.length = 0; return; }
  const wl = game.wildlife, cx = renderer.target.x, cy = renderer.target.z;
  const right = renderer.right(), half = Math.max(8, renderer.vw / 2 / renderer.ppu);
  const place = (x, y, range) => {
    const d = Math.hypot(x - cx, y - cy);
    return d > range ? null : { far: d / range, pan: Math.max(-0.85, Math.min(0.85, ((x - cx) * right.x + (y - cy) * right.z) / half)) };
  };
  const byId = id => wl.ids?.get(id) ?? wl.agents.find(b => b.id === id);
  while (bugles.length) {
    const { id, answer } = bugles.shift(), a = byId(id), at = a && place(a.x, a.y, BUGLE_RANGE);
    if (at) music.rut(answer ? 'answer' : 'bugle', { ...at, id });
  }
  // build the clips for the antlered animals here, a little at a time, before anyone fights
  if (time - lastWarm > 5) {
    lastWarm = time;
    const racks = new Set();
    for (const a of wl.agents) { const r = ANIMALS[a.sp].sprite.male?.antlers; if (r && isMaleVariant(ANIMALS[a.sp], a)) racks.add(r); }
    if (racks.size) music.warmRut([...racks]);
  }
  const live = new Set();
  for (const a of wl.agents) {
    if (a.state !== 'spar' || a.sparWith == null || a.sparWith < a.id) continue; // (each pair once)
    const rack = ANIMALS[a.sp].sprite.male?.antlers, o = byId(a.sparWith);
    if (!rack || !isMaleVariant(ANIMALS[a.sp], a) || !o || o.state !== 'spar') continue;
    // only once both stand head to head, as the drawing does
    const settled = [a, o].every(b => b.sparAt && !b.sparPath?.length && Math.hypot(b.x - b.sparAt[0], b.y - b.sparAt[1]) < 0.02);
    const at = settled && place((a.x + o.x) / 2, (a.y + o.y) / 2, CLASH_RANGE);
    if (!at) continue;
    live.add(a.id);
    const c = boutCycle(a.id, time), was = bouts.get(a.id) ?? { c, next: time + 0.4 };
    const hit = CRASH[0] + 0.015; // (the impact peaks a moment into the drawn jolt)
    if (!a.sparLight && was.c < hit && c >= hit && c - was.c < 0.5) music.rut('clash', { rack, ...at });
    // between crashes, or all through a gentle sparring match: tines catching and grinding
    if (time >= was.next && (a.sparLight || c > 0.45 && c < 0.9)) {
      music.rut('rattle', { rack, ...at });
      was.next = time + (a.sparLight ? 0.9 + Math.random() * 1.1 : 1.4 + Math.random() * 1.2);
    }
    was.c = c; bouts.set(a.id, was);
  }
  for (const id of bouts.keys()) if (!live.has(id)) bouts.delete(id);
}
