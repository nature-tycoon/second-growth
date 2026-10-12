// Keep drawing and controls alive even if one part of a frame fails. Reporting
// is supplied by the game so this loop also works in deterministic checks.
export function createFrameLoop({ steps, targetFps, onError, onFrameStart, onFrame, clock = () => performance.now(), requestFrame = requestAnimationFrame, now = performance.now() }) {
  let last = now;
  function frame(time) {
    try {
      if (time - last < 1000 / targetFps() - 3) return;
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
  return frame;
}
