// Where a fighting pair is in its back-off-and-crash cycle (0-1). The drawing (actors.js) and
// the antler sounds (audio/rut-events.js) share it, so the clash lands as the racks meet.
export const boutCycle = (lo, time) => ((time / 2.6 + (lo % 97) * 0.731) % 1 + 1) % 1;
export const CRASH = [0.24, 0.3]; // the impact jolt, as a share of the cycle
