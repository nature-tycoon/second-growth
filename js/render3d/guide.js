// The opening's planting guide (ui/opening.js, `ui.state.guide`), drawn on the 2D effects layer over
// the land: the ground to plant glows softly, and when the player has been stuck a while a finger
// slides along it to show the drag. Drawing only; works the same for mouse and touch.
//   guide = { list: tile indices, path: [{ x, y }] tile centres in order, hint: bool }

const DRAG_S = 2.2, REST_S = 0.7;   // the finger's slide along the path, and the pause before it goes again

export function drawGuide(ctx, r, game, guide, view) {
  const w = game.world, [x0, x1, z0, z1] = view;
  const now = performance.now() / 1000; // (real time: it shows on a paused farm too)
  const at = (x, z) => r.project(x, r.heightAtScene(Math.min(Math.max(x, 0), w.w - 0.01), Math.min(Math.max(z, 0), w.h - 0.01)) + 0.04, z);
  // the glowing ground: one path of tile quads, filled once (so neighbours don't double up)
  ctx.save();
  ctx.fillStyle = `rgba(255,228,120,${0.17 + 0.09 * Math.sin(now * 2.4)})`;
  ctx.beginPath();
  for (const i of guide.list) {
    const x = i % w.w, z = Math.floor(i / w.w);
    if (x < x0 || x > x1 || z < z0 || z > z1) continue;
    const a = at(x, z), b = at(x + 1, z), c = at(x + 1, z + 1), d = at(x, z + 1);
    ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.lineTo(c.x, c.y); ctx.lineTo(d.x, d.y); ctx.closePath();
  }
  ctx.fill();
  // the finger, after a while without a stroke: down at one end, along the path, up at the other
  const P = guide.path;
  if (guide.hint && P?.length > 1) {
    const t = now % (DRAG_S + REST_S), u = Math.min(1, t / DRAG_S);
    const fade = t > DRAG_S ? Math.max(0, 1 - (t - DRAG_S) / REST_S) : Math.min(1, t / 0.25);
    const ease = u * u * (3 - 2 * u), pts = P.map(p => at(p.x, p.y));
    const len = [0];
    for (let k = 1; k < pts.length; k++) len.push(len[k - 1] + Math.hypot(pts[k].x - pts[k - 1].x, pts[k].y - pts[k - 1].y));
    const along = s => { const L = s * len.at(-1); let k = 1; while (k < pts.length - 1 && len[k] < L) k++; const f = (L - len[k - 1]) / Math.max(1e-6, len[k] - len[k - 1]); return { x: pts[k - 1].x + (pts[k].x - pts[k - 1].x) * f, y: pts[k - 1].y + (pts[k].y - pts[k - 1].y) * f }; };
    // its trail, the stroke it has drawn so far
    ctx.globalAlpha = fade * 0.75; ctx.strokeStyle = 'rgba(255,250,230,1)'; ctx.lineWidth = 4; ctx.lineCap = 'round';
    ctx.beginPath();
    for (let k = 0; k <= 24; k++) { const p = along(ease * k / 24); k ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y); }
    ctx.stroke();
    // the fingertip: a soft disc with a ring, pressed down
    const f = along(ease);
    ctx.globalAlpha = fade;
    ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.strokeStyle = 'rgba(60,50,30,0.55)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(f.x, f.y, 11, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(f.x, f.y, 17 + 3 * Math.sin(now * 8), 0, Math.PI * 2); ctx.stroke();
  }
  ctx.restore();
}
