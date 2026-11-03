// node tools/follow-height-probe.mjs [map] [species,...]
// How smoothly a followed animal's drawn height changes: a few of each species fly, forage and
// perch about a restored map, drawn by the real Actors at 20 frames a second, and for each the
// height change per frame (tiles) is summed up: the median, the 99th percentile and the worst,
// plus what the animal was doing at the five worst frames. A smooth flier changes height by
// hundredths of a tile a frame; a pop is a tenth or more. `jolt` is the change in that climb rate
// from one frame to the next (the 99th percentile): what the eye reads as jerky.
import { register } from 'node:module';
register('./three-loader.mjs', import.meta.url);
import { restoredGame } from './map-audit-fixtures.mjs';
import { mulberry32 } from '../js/rng.js';
import { passable, canLand } from '../js/sim/animal-terrain.js';
const THREE = await import('three');
const { Actors } = await import('../js/render3d/actors.js');
globalThis.localStorage ||= { getItem() { return null; }, setItem() {}, removeItem() {} };
const [map = 'pnw', list = 'robin,woodpecker,coho'] = process.argv.slice(2);
Math.random = mulberry32(5);
const g = restoredGame(map, 5), wl = g.wildlife, w = g.world;
wl.agents = []; wl.flyovers = []; wl.recount(); wl.passageWait = 1e6; wl.computeSuitability();
const keys = list.split(',');
for (const d of g.catalog.animals) {
  if (!keys.includes(d.key)) continue;
  const suit = wl.suit[d.index], good = [];
  for (let j = 0; j < w.n; j++) if (suit[j] > 0.3 && passable(w, j, d) && (d.move !== 'fly' || canLand(w, j, d))) good.push(j);
  for (let k = 0; k < 6 && good.length; k++) { const j = good[Math.floor(Math.random() * good.length)]; wl.spawn(d, j % w.w, j / w.w | 0, { silent: true }); }
}
const actors = new Actors(new THREE.Scene()), right = new THREE.Vector3(1, 0, 0);
g.speed = 1;
const by = {}, prev = new Map(), vs = new Map(), hz = new Map();
let t = 0;
for (let k = 0; k < 2400; k++) {
  if (k % 28 === 0) { g.day++; wl.daily(); }
  wl.update(0.036); // (game speed 1: 0.72 days a second, ANIMAL_SPEEDS)
  actors.update(g, right, (t += 0.05));
  if (k < 40) continue;
  for (const a of wl.agents) {
    const st = actors.pose.get(a.id); if (!st || st.visible === false) { prev.delete(a.id); vs.delete(a.id); continue; }
    const p = prev.get(a.id); prev.set(a.id, st.y); const ph = hz.get(a.id); hz.set(a.id, [st.x, st.z]);
    if (p == null) continue;
    const e = by[a.key] ||= { d: [], worst: [], j: [] }, d = Math.abs(st.y - p), v = st.y - p, pv = vs.get(a.id); vs.set(a.id, v);
    if (pv != null) e.j.push(Math.abs(v - pv));
    if (ph) (e.h ||= []).push(Math.hypot(st.x - ph[0], st.z - ph[1]));
    // (a salmon in the air: st.pitch is its leap's nose up or down; in place if it hasn't moved)
    if (a.key === 'coho' && st.pitch) { e.leap = (e.leap || 0) + 1; if (ph && Math.hypot(a.x - (e.sx?.get(a.id)?.[0] ?? a.x), a.y - (e.sx?.get(a.id)?.[1] ?? a.y)) < 0.01) e.still = (e.still || 0) + 1; }
    (e.sx ||= new Map()).set(a.id, [a.x, a.y]);
    e.d.push(d);
    e.worst.push([d, `${a.state}${a.flying ? ' fly' : ''}${a.birdGround ? ' ground' : ''}${a.bird?.kind ? ' ' + a.bird.kind : ''}${st.trunk ? ' trunk' : ''}`]);
    if (e.worst.length > 50) { e.worst.sort((x, y) => y[0] - x[0]); e.worst.length = 5; }
  }
}
for (const [key, e] of Object.entries(by)) {
  e.d.sort((x, y) => x - y); e.worst.sort((x, y) => y[0] - x[0]); e.j.sort((x, y) => x - y);
  const q = f => e.d[Math.floor(e.d.length * f)].toFixed(3);
  console.log(`${key}: ${e.d.length} frames, height change a frame median ${q(0.5)}, 95% ${q(0.95)}, 99% ${q(0.99)}, worst ${e.d.at(-1).toFixed(3)}; over 0.05: ${(100 * e.d.filter(d => d > 0.05).length / e.d.length).toFixed(1)}%; jolt 99% ${e.j[Math.floor(e.j.length * 0.99)].toFixed(3)}, over 0.1: ${(100 * e.j.filter(d => d > 0.1).length / e.j.length).toFixed(1)}%; sideways jumps over 0.25 a frame: ${e.h.filter(d => d > 0.25).length}${e.leap ? `; leaping frames ${e.leap}, of them in place ${e.still}` : ''}`);
  console.log('   worst at: ' + e.worst.slice(0, 5).map(([d, s]) => `${d.toFixed(2)} ${s}`).join(' | '));
}
