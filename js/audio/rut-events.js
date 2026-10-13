// Hears the rut: bull elk bugling across the landscape and antlers clashing in a bout (timed
// to the drawn fight, so the crack lands as the racks meet). Called every frame by the UI.
import { isMaleVariant } from '../data/animals.js';
import { bugles, RUT } from '../sim/animal-life.js';
import { DAYS_PER_YEAR } from '../config.js';
import { boutCycle, CRASH } from '../render3d/bout-clock.js';

const BUGLE_RANGE = 160, CLASH_RANGE = 26; // bugles carry across the landscape; antlers stay local
const bouts = new Map(); // lower id of a fighting pair -> { c: last cycle, next: next light rattle }
const soundscapes = new WeakMap(); // wildlife instance -> real-time call schedule

export function rutSounds(game, renderer, music, time) {
  if (!music.ctx) { bugles.length = 0; return; }
  const wl = game.wildlife, cx = renderer.target.x, cy = renderer.target.z;
  const right = renderer.right(), half = Math.max(8, renderer.vw / 2 / renderer.ppu);
  const place = (x, y, range, carries = false) => {
    const d = Math.hypot(x - cx, y - cy);
    return d > range && !carries ? null : { far: carries ? Math.min(0.65, d / range) : d / range, pan: Math.max(-0.85, Math.min(0.85, ((x - cx) * right.x + (y - cy) * right.z) / half)) };
  };
  const byId = id => wl.ids?.get(id) ?? wl.agents.find(b => b.id === id);
  const now = music.ctx.currentTime ?? time;
  let landscape = soundscapes.get(wl);
  if (!landscape) { landscape = { next: now + 2, lastId: null, warmAt: -Infinity }; soundscapes.set(wl, landscape); }
  const heard = id => { landscape.next = now + 8 + Math.random() * 6; landscape.lastId = id; };
  while (bugles.length) {
    const { id, answer } = bugles.shift(), a = byId(id), at = a && !a.leaving && place(a.x, a.y, BUGLE_RANGE, true);
    if (at && music.rut(answer ? 'answer' : 'bugle', { ...at, id })) heard(id);
  }
  // The landscape keeps calling even when a bull is off screen or its next
  // simulation action is grazing. Use audio time so game speed cannot cram calls together.
  if (!RUT.includes(game.month)) landscape.next = now + 2;
  else if (now >= landscape.next && music.natureOn !== false && !music.muted && (!music.ctx.state || music.ctx.state === 'running')) {
    const bulls = wl.agents.filter(a => {
      const def = game.catalog.animals[a.sp];
      return def.key === 'elk' && isMaleVariant(def, a) && a.age >= def.mature * DAYS_PER_YEAR && !a.leaving && a.state !== 'spar';
    });
    const rivals = bulls.filter(a => a.id !== landscape.lastId), pool = rivals.length ? rivals : bulls;
    landscape.next = now + 1; // retry clips still loading or a bull still on its playback cooldown
    if (pool.length) {
      const a = pool[Math.floor(Math.random() * pool.length)];
      if (music.rut(landscape.lastId != null && a.id !== landscape.lastId ? 'answer' : 'bugle', { ...place(a.x, a.y, BUGLE_RANGE, true), id: a.id })) heard(a.id);
    }
  }
  // build the clips for the antlered animals here, a little at a time, before anyone fights
  if (now - landscape.warmAt > 5) {
    landscape.warmAt = now;
    const racks = new Set();
    for (const a of wl.agents) { const r = game.catalog.animals[a.sp].sprite.male?.antlers; if (r && isMaleVariant(game.catalog.animals[a.sp], a)) racks.add(r); }
    if (racks.size) music.warmRut([...racks]);
  }
  const live = new Set();
  for (const a of wl.agents) {
    if (a.state !== 'spar' || a.sparWith == null || a.sparWith < a.id) continue; // (each pair once)
    const rack = game.catalog.animals[a.sp].sprite.male?.antlers, o = byId(a.sparWith);
    if (!rack || !isMaleVariant(game.catalog.animals[a.sp], a) || !o || o.state !== 'spar') continue;
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
