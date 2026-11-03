// Home cores and brief boundary encounters, using ordinary movement intents.
// No damage, population cap, new movement state, or renderer position writes.
import { huntHunger } from '../data/animal-activity.js';
import { clamp } from '../config.js';
import { isMale, preyFor } from '../data/animals.js';
import { activeTerritory, territorialRivals } from '../data/animal-territories.js';
import { passable, canLand } from './animal-terrain.js';
import { facePoint } from './animal-positioning.js';
import { shrubSpot } from './ground-obstacles.js';
import { reefMoveSafe } from './animal-terrain.js';

const at = (w, j) => [j % w.w + 0.5, (j / w.w | 0) + 0.5];
const tileDistance = (w, j, x, y) => Math.hypot(j % w.w + 0.5 - x, (j / w.w | 0) + 0.5 - y);
const distance = (a, x, y) => Math.hypot(a.x - x, a.y - y);
export function territoryRadius(def, a) {
  return def.behavior.territory.radius ?? clamp(Math.sqrt(def.hr) * 0.65 * (isMale(def, a) ? 1.15 : 1), 5, 12);
}
function suitable(wl, a, def, j) {
  const w = wl.game.world;
  return Number.isInteger(j) && j >= 0 && j < w.n && !w.fire[j] && w.struct[j] < 0 &&
    passable(w, j, a) && canLand(w, j, def) && wl.suit[a.sp][j] > 0.15 &&
    (def.behavior.territory.kind !== 'host' ||
      w.shrub[j] === w.catalog.plant.anemone?.id && w.shrubG[j] > 0.35);
}
// The host plant on a home tile, where it's drawn.
export function hostSpot(w, j) {
  const x = j % w.w, y = j / w.w | 0;
  return shrubSpot(x, y, w.catalog.plants[w.shrub[j]], w.tree[j] > 0);
}
export function hasTerritory(wl, a, def) {
  return !!(activeTerritory(def, a, wl.game.month) && suitable(wl, a, def, a.territory?.home));
}
function flight(a, w, j) {
  [a.tx, a.ty] = at(w, j); a.state = 'fly'; a.flying = true; a.path = null;
}
function walkHome(wl, a, def, home) {
  const w = wl.game.world;
  if (!suitable(wl, a, def, home)) return false;
  if (a.move === 'fly') { flight(a, w, home); return true; }
  return wl.pathTo(a, j => j === home, 900, null, j => !w.fire[j]);
}
function establish(wl, a, def, profile) {
  const w = wl.game.world, r = territoryRadius(def, a);
  const neighbors = wl.agents.filter(b => territorialRivals(def, a, b, wl.game.month) && hasTerritory(wl, b, def));
  const free = j => suitable(wl, a, def, j) && neighbors.every(b => {
    const [x, y] = at(w, b.territory.home), [xx, yy] = at(w, j);
    return Math.hypot(x - xx, y - yy) >= (r + territoryRadius(def, b)) * 0.55;
  });
  const current = w.inb(Math.floor(a.x), Math.floor(a.y)) ? w.idx(Math.floor(a.x), Math.floor(a.y)) : -1;
  let home = -1;
  if (profile.kind === 'host' || a.move === 'fly') {
    // Host groups share one anemone. New fish favor less occupied hosts, but
    // existing group members are not treated as rivals or repeatedly expelled.
    const uses = new Map();
    if (profile.kind === 'host') for (const b of wl.agents) if (b !== a && b.sp === a.sp && !b.leaving && hasTerritory(wl, b, def)) {
      const h = b.territory.home; uses.set(h, (uses.get(h) || 0) + 1);
    }
    const x0 = Math.floor(a.x), y0 = Math.floor(a.y); let best = -Infinity;
    for (let dy = -12; dy <= 12; dy++) for (let dx = -12; dx <= 12; dx++) {
      if (!w.inb(x0 + dx, y0 + dy)) continue;
      const j = w.idx(x0 + dx, y0 + dy);
      if (!free(j)) continue;
      const score = wl.suit[a.sp][j] / (1 + 0.08 * Math.hypot(dx, dy) + (uses.get(j) || 0));
      if (score > best) { best = score; home = j; }
    }
    // Reef hosts must be reached through real water; do not claim one across a cay.
    if (home >= 0 && home !== current && !walkHome(wl, a, def, home)) home = -1;
  } else if (free(current)) home = current;
  else if (wl.pathTo(a, free, 900, null, j => !w.fire[j])) home = a.path[0];
  if (home < 0) { a.territoryAfter = a.age + 5; return false; }
  a.territory = { home, since: wl.game.day, next: a.age + 2, encounter: 0, mode: 'settle', goal: null };
  a.trip = null; a.restSpot = null;
  return a.state === 'walk' || a.state === 'fly';
}
const available = b => !b.leaving && !b.fromFire && !b.drinkT && b.socialWith == null &&
  (b.state === 'idle' || b.state === 'walk') && !b.run && !b.follow;
function withdraw(wl, b, def, owner, radius) {
  const w = wl.game.world, [x, y] = at(w, owner.territory.home);
  const home = b.territory?.home;
  if (hasTerritory(wl, b, def) && tileDistance(w, home, x, y) > radius &&
    distance(b, ...at(w, home)) > 1 && walkHome(wl, b, def, home)) return true;
  // Look for an actual exit; failed searches do not push or teleport a cornered rival.
  const clear = j => suitable(wl, b, def, j) && tileDistance(w, j, x, y) >= radius;
  if (b.move === 'fly') {
    let goal = -1, nearest = Infinity;
    const bx = Math.floor(b.x), by = Math.floor(b.y);
    for (let dy = -10; dy <= 10; dy++) for (let dx = -10; dx <= 10; dx++) {
      if (!w.inb(bx + dx, by + dy) || dx * dx + dy * dy >= nearest) continue;
      const j = w.idx(bx + dx, by + dy);
      if (clear(j)) { goal = j; nearest = dx * dx + dy * dy; }
    }
    if (goal < 0) return false;
    flight(b, w, goal); return true;
  }
  return wl.pathTo(b, clear, 600, null, j => !w.fire[j]);
}
function boundary(wl, a, def, radius) {
  const t = a.territory, w = wl.game.world, [x, y] = at(w, t.home);
  if (a.age < t.encounter || distance(a, x, y) > radius) return false;
  for (const b of wl.agents) {
    if (!territorialRivals(def, a, b, wl.game.month) || !available(b) ||
      b.age < (b.territory?.encounter || 0) || distance(b, x, y) > radius * 0.65 || distance(b, a.x, a.y) > 4) continue;
    // When cores overlap, favor the animal nearer its own center. Established
    // residence breaks ties, rather than making both sides chase every decision.
    if (hasTerritory(wl, b, def)) {
      const bd = distance(b, ...at(w, b.territory.home)), ad = distance(b, x, y);
      if (bd < ad || bd === ad && (b.territory.since < t.since || b.territory.since === t.since && b.id < a.id)) continue;
    }
    t.encounter = a.age + 5;
    if (!withdraw(wl, b, def, a, radius * 0.9)) return false;
    b.trip = null; b.restSpot = null; b.run = 1.25; b.follow = false;
    b.territory ||= { home: null, since: wl.game.day, next: 0 };
    b.territory.encounter = b.age + 6; b.territory.mode = 'withdraw';
    t.mode = 'display'; a.alertT = 1.2; a.wait = 1.2; facePoint(a, b.x, b.y);
    return true;
  }
  return false;
}
export function territorialChoose(wl, a, def) {
  const profile = activeTerritory(def, a, wl.game.month);
  if (!profile) { if (a.territory) a.territory = null; return false; }
  // Survival, feeding, dependent young and an ongoing social interaction win.
  if (a.fromFire || a.mom != null || a.drinkT || a.socialWith != null || a.run ||
    a.state !== 'idle' || preyFor(def, wl.game) && a.hunger >= huntHunger(def)) return false;
  if (!hasTerritory(wl, a, def)) {
    a.territory = null;
    if (a.age < (a.territoryAfter || 0)) return false;
    if (establish(wl, a, def, profile)) return true;
    if (!a.territory) return false;
  }
  const t = a.territory, w = wl.game.world, [x, y] = at(w, t.home), r = territoryRadius(def, a);
  if (boundary(wl, a, def, r)) return true;
  if (distance(a, x, y) > r * 1.15) {
    t.next = a.age + 3;
    if (!walkHome(wl, a, def, t.home)) { a.territory = null; a.territoryAfter = a.age + 5; return false; }
    a.trip = null; a.restSpot = null; t.mode = 'return'; t.goal = t.home; return true;
  }
  if (profile.tether) return hover(wl, a, def, t, profile.tether);
  if (a.age < t.next) return false;
  t.next = a.age + 4 + Math.random() * 4;
  // A small host group stays beside its anemone, not at an exclusive individual core.
  // Wider-ranging animals make occasional boundary circuits with a marking/display pause.
  const angle = (a.id * 2.39996 + (t.angle || 0)) % (Math.PI * 2); t.angle = (t.angle || 0) + 1.7;
  const px = x + Math.cos(angle) * r * 0.75, py = y + Math.sin(angle) * r * 0.75;
  const tx = Math.floor(px), ty = Math.floor(py);
  const patrol = j => suitable(wl, a, def, j) && tileDistance(w, j, px, py) < 1;
  let moved = false;
  if (a.move === 'fly') {
    if (w.inb(tx, ty) && patrol(w.idx(tx, ty))) { flight(a, w, w.idx(tx, ty)); moved = true; }
  } else moved = wl.pathTo(a, patrol, 500, null, j => !w.fire[j] && tileDistance(w, j, x, y) < r * 1.4);
  if (!moved) { t.mode = 'mark'; a.alertT = 0.8; a.wait = 0.8; return true; }
  a.trip = null; a.restSpot = null; t.mode = 'patrol';
  t.goal = a.state === 'fly' ? w.idx(Math.floor(a.tx), Math.floor(a.ty)) : a.path[0];
  return true;
}
// A tethered host fish (profile.tether) hangs about its plant: a fresh point within the tether
// every second or two, swum to by hoverStep while it's idle. Past the tile, it swims home first.
function hover(wl, a, def, t, tether) {
  const w = wl.game.world, [hx, hy] = hostSpot(w, t.home);
  if (distance(a, hx, hy) > 1.2) {
    if (!walkHome(wl, a, def, t.home)) { a.territory = null; a.territoryAfter = a.age + 5; return false; }
    a.trip = null; a.restSpot = null; a.hover = null; t.mode = 'return'; t.goal = t.home; return true;
  }
  const ang = Math.random() * Math.PI * 2, r = tether * Math.sqrt(Math.random());
  a.hover = { x: hx + Math.cos(ang) * r, y: hy + Math.sin(ang) * r, home: t.home };
  a.state = 'idle'; a.wait = 0.6 + Math.random() * 1.2; a.path = null; a.trip = null; a.restSpot = null;
  t.mode = 'hover';
  return true;
}
// Each frame an idle host fish has a hover point: turn on the spot toward it and finn over gently.
export function hoverStep(wl, a, def, dt) {
  const h = a.hover;
  if (!h || a.territory?.home !== h.home) { a.hover = null; return false; }
  const dx = h.x - a.x, dy = h.y - a.y, d = Math.hypot(dx, dy);
  if (d < 0.03) { a.hover = null; return false; }
  if (a.hd == null) a.hd = Math.atan2(dy, dx);
  let turn = Math.atan2(dy, dx) - a.hd;
  turn -= Math.round(turn / (Math.PI * 2)) * Math.PI * 2;
  a.hd += clamp(turn, -10 * dt, 10 * dt);
  a.spd = Math.min(def.speed * 0.6, d * 3) * Math.max(0.2, Math.cos(turn));
  const nx = a.x + Math.cos(a.hd) * a.spd * dt, ny = a.y + Math.sin(a.hd) * a.spd * dt;
  if (reefMoveSafe(wl.game.world, a, nx, ny)) { a.x = nx; a.y = ny; } else { a.hover = null; return false; }
  if (Math.abs(Math.cos(a.hd)) > 0.1) a.facing = Math.cos(a.hd) > 0 ? 1 : -1;
  return true;
}
export function territoryArrive(wl, a) {
  const t = a.territory, def = wl.game.catalog.animals[a.sp], w = wl.game.world;
  if (!t || t.goal == null || a.state !== 'idle' || a.fromFire || !hasTerritory(wl, a, def) ||
    !w.inb(Math.floor(a.x), Math.floor(a.y)) || w.idx(Math.floor(a.x), Math.floor(a.y)) !== t.goal) return;
  t.goal = null; t.mode = 'mark';
  const [x, y] = at(w, t.home); facePoint(a, a.x + (a.x - x), a.y + (a.y - y));
  a.alertT = Math.max(a.alertT || 0, 0.8); a.wait = Math.max(a.wait || 0, 1);
}
