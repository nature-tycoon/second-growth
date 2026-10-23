// Birds heard on the wing: a passing goose flock honks as it crosses, and mallards quack and
// wood ducks squeal when they fly near the camera. Called every frame by the UI, beside the rut.
// Each flock (or lone duck) calls on its own schedule, in real audio time so game speed can't
// cram calls together, and one flight call plays at a time so they don't pile up.
export const FLIGHT_CALLS = {
  // (geese honk almost constantly in flight: short excerpts of a flock's calls, back to back)
  canada_goose: { ids: ['canada-goose', 'canada-goose-yellowstone'], range: 60, gap: [0.6, 2.2], excerpt: [3, 6] },
  mallard: { ids: ['mallard'], range: 32, gap: [3, 7] },
  woodduck: { ids: ['wood-duck'], range: 32, gap: [4, 9] },
};
const rand = ([lo, hi]) => lo + Math.random() * (hi - lo);
const schedules = new WeakMap(); // wildlife instance -> { due: caller -> audio time, busy }

export function flightCalls(game, renderer, music) {
  const ctx = music.ctx;
  if (!ctx || ctx.state !== 'running' || music.natureOn === false || music.muted) return;
  const wl = game.wildlife, now = ctx.currentTime;
  let s = schedules.get(wl);
  if (!s) schedules.set(wl, s = { due: new Map(), busy: 0 });
  const cx = renderer.target.x, cy = renderer.target.z, right = renderer.right();
  const half = Math.max(8, renderer.vw / 2 / renderer.ppu);
  // the nearest bird of each flock in the air, or each duck on its own
  const near = new Map();
  const hear = (a, key, caller) => {
    const call = FLIGHT_CALLS[key], d = Math.hypot(a.x - cx, a.y - cy);
    if (!call || d > call.range || (near.get(caller)?.d ?? Infinity) <= d) return;
    near.set(caller, { call, d, far: Math.min(0.65, d / call.range),
      pan: Math.max(-0.85, Math.min(0.85, ((a.x - cx) * right.x + (a.y - cy) * right.z) / half)) });
  };
  for (const a of wl.flyovers) hear(a, a.key, 'flock' + a.flock);
  for (const a of wl.agents) if (a.flying && a.alt >= 0.5) hear(a, game.catalog.animals[a.sp].key, a.id);
  for (const caller of s.due.keys()) if (!near.has(caller)) s.due.delete(caller);
  // (the first call comes soon after a flock is in earshot)
  for (const caller of near.keys()) if (!s.due.has(caller)) s.due.set(caller, now + 0.3 + Math.random() * 1.2);
  if (now < s.busy || now < (music.foregroundUntil ?? 0)) return;
  let next = null;
  for (const [caller, at] of near) if (now >= s.due.get(caller) && (!next || at.d < next.at.d)) next = { caller, at };
  if (!next) return;
  const { call, far, pan } = next.at, id = call.ids[Math.floor(Math.random() * call.ids.length)];
  const played = music.playField(id, { far, pan, ...call.excerpt && { length: rand(call.excerpt), anywhere: true } });
  if (!played) return; // (still loading: stays due)
  s.busy = now + played;
  s.due.set(next.caller, now + played + rand(call.gap));
}
