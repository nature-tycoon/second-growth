// How many 3D frames the game lets the graphics chip queue (Interaction to Next Paint, decision 0059).
// A click's paint is composited with the 3D view, so it waits for every frame the chip has queued: on a
// slow chip Chrome queued 4-5, and clicks took 0.7-2 s to show. A fence after each draw says when the
// chip is done with it; a frame with `inFlight` still unfinished skips its draw (the simulation and the
// interface still run). Two normally (one cost a fast Mac a third of its frames: a fence is seldom done
// by the next frame), one right after a press, so the queue empties and the press paints next.
// A fence still not done after DEAD_MS means a browser whose fences never say done (or a chip too slow
// to pace), and pacing is off for the session. (First tried: a fence older than 250 ms stopped holding
// a draw, and three in a row turned pacing off. At 2-3 fps every frame is older than that, so the queue
// grew back and clicks took 1-2 s again.)
// No fences (WebGL1): never behind.
export const FRAMES_IN_FLIGHT = 2, DEAD_MS = 2000;
export class GpuPacing {
  constructor(gl, clock = () => performance.now()) {
    this.gl = gl; this.clock = clock; this.fences = [];
    this.off = !gl?.fenceSync;
  }
  behind(inFlight = FRAMES_IN_FLIGHT) {
    if (this.off) return false;
    const gl = this.gl, now = this.clock();
    let waiting = 0;
    for (const f of this.fences) {
      if (gl.getSyncParameter(f.sync, gl.SYNC_STATUS) === gl.SIGNALED) { gl.deleteSync(f.sync); f.sync = null; }
      else if (now - f.at > DEAD_MS) { this.stop(); return false; }
      else waiting++;
    }
    this.fences = this.fences.filter(f => f.sync);
    return waiting >= inFlight;
  }
  stop() { for (const f of this.fences) this.gl.deleteSync(f.sync); this.fences = []; this.off = true; }
  fence() {
    if (this.off) return;
    const sync = this.gl.fenceSync(this.gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
    if (sync) this.fences.push({ sync, at: this.clock() });
  }
}
