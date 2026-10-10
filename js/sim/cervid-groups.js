// Small, stable deer families and elk cow/calf herds; adult males form bachelor
// groups outside the rut. Group membership never changes population or RNG state.
import { DAYS_PER_YEAR } from '../config.js';
import { ANIMALS, isMaleVariant } from '../data/animals.js';
import { passable } from './animals.js';
export const inRut = game => [6, 7, 8].includes(game.month);
const adult = (a, d) => !a.juvenile && a.age >= d.mature * DAYS_PER_YEAR;
const male = (a, d) => adult(a, d) && isMaleVariant(d, a);
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
export function cervidLeader(wl, a) {
  const d = ANIMALS[a.sp];
  if (male(a, d) && inRut(wl.game)) { a.herdOf = null; return a; }
  const mother = a.mom != null && wl.agents.find(b => b.id === a.mom && b.sp === a.sp && !b.leaving && adult(b, d) && !male(b, d));
  if (!adult(a, d) && mother) return cervidLeader(wl, mother);
  const eligible = b => b.sp === a.sp && !b.leaving && adult(b, d) && male(b, d) === male(a, d) &&
    distance(a, b) < 28 && !(a.familyBlockedBy === b.id && a.familyBlockedUntil > a.age);
  const held = wl.agents.find(b => b.id === a.herdOf && eligible(b));
  if (held && held !== a) return held;
  // Keep existing families stable, but let a solitary animal join a family
  // it encounters later instead of holding itself as leader forever.
  if (held === a && wl.agents.some(b => b !== a && b.herdOf === a.id && !b.leaving)) return a;
  let lead = a;
  for (const b of wl.agents) if (eligible(b) && b.id < lead.id &&
    (!b.herdOf || b.herdOf === b.id) && wl.agents.filter(c => c !== b && c.herdOf === b.id && !c.leaving).length < (d.familySize || 6) - 1) lead = b;
  a.herdOf = lead.id;
  return lead;
}

// Separate rejoin and settle distances absorb tile offsets and spacing pushes.
// A member already grazing near its slot must not keep stepping to the tile
// on its opposite side just because the exact sub-tile point is unreachable.
export function followCervid(wl, a, home, field = 'slot', radius = 1.5) {
  if (!a[field]) {
    const angle = Math.random() * Math.PI * 2, r = radius * (0.6 + Math.random());
    a[field] = [Math.cos(angle) * r, Math.sin(angle) * r];
  }
  const tx = home[0] + a[field][0], ty = home[1] + a[field][1], d = Math.hypot(a.x - tx, a.y - ty);
  const settled = a.familySettled === field;
  a.trip = null;
  if (d < radius || settled && d < radius + 1) {
    a.familySettled = field; a.follow = false; a.wait = 2 + Math.random() * 3;
    return true;
  }
  a.familySettled = null;
  const w = wl.game.world, dist = (x, y) => Math.hypot(x + 0.5 - tx, y + 0.5 - ty);
  if (wl.pathTo(a, (j, x, y) => dist(x, y) < radius && dist(x, y) < d - 0.6, 900, dist)) {
    const end = a.path[0], gain = d - dist(end % w.w, end / w.w | 0);
    if (gain > 0.6 && passable(w, end, a)) { a.follow = true; a.familyFailures = 0; return true; }
    a.state = 'idle'; a.path = null;
  }
  // If the tile grid cannot improve a near-enough position, graze here. A
  // genuinely blocked route eventually releases the group, rather than pacing.
  a.follow = false; a.wait = 2 + Math.random() * 2;
  if (d < radius + 1.5) { a.familySettled = field; return true; }
  a.familyFailures = (a.familyFailures || 0) + 1;
  return a.familyFailures < 3;
}
export function keepCervidGroup(wl, a, def) {
  const lead = cervidLeader(wl, a);
  if (lead === a) return false;
  if (lead.drinkT > 0 && a.thirst > 1 && wl.waterhole(a, def)) return true;
  if (followCervid(wl, a, [lead.x, lead.y], 'slot', def.herdR || 1.6)) return true;
  a.familyBlockedBy = lead.id; a.familyBlockedUntil = a.age + 20; a.herdOf = null;
  a.familyFailures = 0; a.slot = null;
  return false;
}

// A resting follower wakes when its family moves away. Long grazing rests are
// fine while everyone is stationary, but must not leave a calf several tiles behind.
export function cervidNeedsRejoin(wl, a, def) {
  const maternal = a.mom != null, harem = !maternal && a.haremOf != null;
  const id = maternal ? a.mom : harem ? a.haremOf : a.herdOf;
  if (id == null || id === a.id) return false;
  const lead = wl.ids?.get(id) || wl.agents.find(b => b.id === id);
  if (!lead || lead.leaving) return false;
  const field = maternal ? 'momSlot' : harem ? 'haremSlot' : 'slot';
  if (!a[field]) return false;
  const home = harem && !lead.waterTrip && lead.haremCenter ? lead.haremCenter : [lead.x, lead.y];
  const radius = maternal ? 0.9 : harem ? 1.5 : def.herdR || 1.6;
  return Math.hypot(a.x - home[0] - a[field][0], a.y - home[1] - a[field][1]) > radius + 1.2;
}
