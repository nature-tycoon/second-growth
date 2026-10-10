// Keep drawing and controls alive even if one part of a frame fails. Reporting
// is supplied by the game so this loop also works in deterministic checks.
export function createFrameLoop({ steps, targetFps, onError, requestFrame = requestAnimationFrame, now = performance.now() }) {
  let last = now;
  function frame(time) {
    try {
      if (time - last < 1000 / targetFps() - 3) return;
      const dt = Math.max(0, Math.min(0.1, (time - last) / 1000));
      last = time;
      for (const [stage, step] of steps) {
        try { step(dt); }
        catch (error) { onError(error, stage); }
      }
    } finally {
      // Scheduling last without a finally used to leave the entire game frozen
      // after an exception, including errors in the reporting code itself.
      requestFrame(frame);
    }
  }
  return frame;
}
