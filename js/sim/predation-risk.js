// Landscape of fear: each prey species remembers where its kind was attacked or killed, and the
// memory fades over a few weeks. Prey read it only when choosing places (a home, a feeding or
// resting site, a drinking spot, where to wander), never as a wall. Decision 0015.
// Kept per prey species, so a hawk taking voles does not frighten deer. Sparse, and not saved:
// it is a few weeks of memory, and a loaded game simply starts it afresh.
const RADIUS = 3, FADE = 0.95; // (a day: about half gone in two weeks)

function field(wl, sp) {
  const all = wl.risk || (wl.risk = new Map());
  let f = all.get(sp);
  if (!f) all.set(sp, f = new Map());
  return f;
}
// A kill marks 1 at the spot, a flight from a hunter less; nearby tiles get a share.
export function markRisk(wl, sp, x, y, amount) {
  const w = wl.game.world, f = field(wl, sp), cx = Math.floor(x), cy = Math.floor(y);
  for (let dy = -RADIUS; dy <= RADIUS; dy++) for (let dx = -RADIUS; dx <= RADIUS; dx++) {
    const k = 1 - Math.hypot(dx, dy) / (RADIUS + 0.5);
    if (k <= 0 || !w.inb(cx + dx, cy + dy)) continue;
    const j = w.idx(cx + dx, cy + dy);
    f.set(j, Math.min(3, (f.get(j) || 0) + amount * k));
  }
}
export const riskAt = (wl, sp, j) => wl.risk?.get(sp)?.get(j) || 0;
// How much less a place appeals for the risk remembered there (1 = no risk).
export const safety = (wl, sp, j) => 1 / (1 + 1.5 * riskAt(wl, sp, j));
export function decayRisk(wl) {
  if (!wl.risk) return;
  for (const f of wl.risk.values()) for (const [j, v] of f) { if (v < 0.03) f.delete(j); else f.set(j, v * FADE); }
}
