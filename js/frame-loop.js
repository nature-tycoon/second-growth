// Keep drawing and controls alive even if one part of a frame fails. Reporting
// is supplied by the game so this loop also works in deterministic checks.
//
// Pacing (performance-review-2026-11-26.md): the browser calls once per screen refresh. The loop
// learns the refresh from those calls (a low percentile of the gaps, so long frames and skipped
// ticks don't count) and draws on every `every`th one: the fewest refreshes a frame that keep the
// rate within 1.3x the cap. 60 Hz draws every 2nd for 30; 75 Hz every one for 60 (75) and every 2nd
// for 30 (37.5); 90 and 100 Hz every 2nd for 60 (45, 50: as before; 90-100 would be up to 1.67x
// the work the player capped); 144 Hz every 2nd for 60 (72) and every 4th for 30 (36). Before, a
// frame was skipped whenever less than the cap's interval minus 3 ms had passed, which on a 75 Hz
// screen gave 37.5 for a cap of 60 and 25 for a cap of 30. A floor of 0.7 of the cap's interval
// keeps a wrong estimate from drawing faster than 1.43x the cap. Until about 10 refreshes are seen,
// the old rule.
// When every frame overruns a refresh, every gap is a drawn frame's and the estimate is the drawn
// interval, not the screen's: so the refresh is reported only when it is at least as fast as the cap,
// and the slow-frame line (slowFrameMs) never goes past the cap's own interval.
const GAPS = 60, MIN_GAPS = 10;
export function framesPerDraw(periodMs, targetFps) {
  return Math.max(1, Math.ceil(1000 / periodMs / (1.3 * targetFps) - 1e-9));
}
export function createFrameLoop({ steps, targetFps, onError, onFrameStart, onFrame, clock = () => performance.now(), requestFrame = requestAnimationFrame, now = performance.now() }) {
  let last = now, tick = null, period = null, seen = 0;
  const gaps = [];
  const pace = { refreshHz: null, every: 1, intervalMs: null, capMs: null };
  function learn(time) {
    if (tick != null) {
      const g = time - tick;
      // (a hidden tab, a stall or a long frame isn't a refresh; under 2 ms is a duplicate call)
      if (g > 2 && g < 60) { gaps.push(g); if (gaps.length > GAPS) gaps.shift(); seen++; }
      // re-judged every 30 gaps rather than every frame: the screen's refresh rarely changes
      if (gaps.length >= MIN_GAPS && (period == null || seen % 30 === 0)) {
        const s = [...gaps].sort((a, b) => a - b);
        period = s[Math.floor(s.length * 0.2)];
      }
    }
    tick = time;
  }
  function frame(time) {
    try {
      learn(time);
      const goal = 1000 / targetFps();
      pace.capMs = goal;
      pace.refreshHz = period != null && period <= goal * 1.05 ? Math.round(1000 / period) : null;
      if (period != null) {
        pace.every = framesPerDraw(period, targetFps());
        pace.intervalMs = pace.every * period;
      } else { pace.every = 1; pace.intervalMs = goal; }
      const need = period != null ? Math.max(pace.intervalMs - period / 2, 0.7 * goal) : goal - 3;
      if (time - last < need) return;
      const interval = time - last;
      const dt = Math.max(0, Math.min(0.1, interval / 1000));
      last = time;
      if (onFrameStart) onFrameStart();
      const started = onFrame ? clock() : 0, timings = onFrame ? {} : null;
      for (const [stage, step] of steps) {
        const at = onFrame ? clock() : 0;
        try { step(dt); }
        catch (error) { onError(error, stage); }
        finally { if (timings) timings[stage] = clock() - at; }
      }
      if (onFrame) onFrame({ interval, work: clock() - started, timings });
    } finally {
      // Scheduling last without a finally used to leave the entire game frozen
      // after an exception, including errors in the reporting code itself.
      requestFrame(frame);
    }
  }
  // the screen's refresh as measured (null until known, or while frames overrun it), how many
  // refreshes a frame takes, the frame's interval and the cap's own interval
  // (one object, updated in place: read it, don't keep it)
  frame.pace = () => pace;
  return frame;
}
