// A walker's legs keep pace with the ground it actually covers, one rule for every ground animal.
// The simulation's step clock (a.phase) ticks at the walking rate whether or not the animal gets
// anywhere, so an elk edging round a trunk or held up by its herd would otherwise stride on the
// spot. Plain arithmetic with no three.js, so tools/gait-pace-probe.mjs can run it headless.
import { travelSpeed } from '../sim/climb-pace.js';

// How far it moved (tiles) for the step clock's advance (dPhase), as a fraction of its
// unhindered walking pace: about 1 walking freely, near 0 stalled. The clock runs at
// 6 * run * beat a day and the walk at travelSpeed * run tiles a day, so a.run cancels out.
// null when the clock didn't move (paused) or jumped (a returning animal).
export function groundPace(def, moved, dPhase) {
  if (!(dPhase > 1e-6) || dPhase > 3) return null;
  return moved * 6 * (def.sprite.beat ?? 1) / (dPhase * Math.max(0.05, travelSpeed(def)));
}

// Eases st.pace toward the measured pace and returns how fast the legs cycle (0.15..1.2 of the
// clock) and how wide they stride (0..1). Below about a third of its pace the animal is drawn
// standing, with a slow shuffle of the feet, rather than walking in place.
const STRIDE = { rate: 1, width: 1 }; // (reused: called for every walker each frame)
export function strideFollowsGround(st, def, moved, dPhase, k) {
  const r = groundPace(def, moved, dPhase);
  if (r != null) st.pace = (st.pace ?? 1) + (Math.min(1.2, r) - (st.pace ?? 1)) * Math.min(1, k * 1.5);
  const p = st.pace ?? 1;
  STRIDE.rate = Math.max(0.15, Math.min(1.2, p)); STRIDE.width = Math.min(1, Math.max(0, (p - 0.1) / 0.5));
  return STRIDE;
}
