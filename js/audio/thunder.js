// Hears the lightning (render3d/lightning.js): each strike's thunder, later, softer and more muffled
// the farther the bolt landed from the listener (the middle of the view, or the eye at eye level).
// A flash inside the clouds, with no bolt, rumbles in from far off. Called every frame by the UI.
const SPEED = 16;       // tiles the sound covers a second (slowed down, like the game's time: a bolt across the view rolls in a second or two later)
const FAR = 80;         // tiles at which a bolt sounds as far off as it gets
let warmAt = -Infinity; // audio time the clips were last asked for

export function thunderSounds(renderer, music) {
  const L = renderer.lightning;
  if (!L) return;
  const strikes = L.strikes.splice(0);
  if (!music.ctx || !L.storm) return;
  const now = music.ctx.currentTime;
  if (now - warmAt > 5) { warmAt = now; music.warmThunder(); }
  const eye = renderer.eyeOn, at = eye ? renderer.eye.pos : renderer.target;
  // the listener's right, and how far across counts as all the way to one side
  const right = eye ? { x: -renderer.eye.forward.z, z: renderer.eye.forward.x } : renderer.right();
  const rl = Math.hypot(right.x, right.z) || 1, half = eye ? 20 : Math.max(8, renderer.vw / 2 / renderer.ppu);
  for (const s of strikes) {
    if (s.x == null) { music.thunder({ far: 0.75 + Math.random() * 0.15, pan: Math.random() * 1.2 - 0.6, delay: 2.5 + Math.random() * 4 }); continue; }
    const dx = s.x - at.x, dz = s.z - at.z, d = Math.hypot(dx, dz);
    const pan = Math.max(-0.85, Math.min(0.85, (dx * right.x + dz * right.z) / rl / half));
    music.thunder({ far: Math.min(0.7, d / FAR), pan, delay: 0.25 + d / SPEED });
  }
}
