// The sky behind the diorama in the usual view (docs/aesthetics-plan-2026-11-26.md, item 1). The 3D
// canvas is transparent, so past the land the page shows through. That used to be one fixed dark
// green whatever the map, hour or weather; now it's the haze the far edge of the land melts into
// (atmosphere.js, uMelt), so the land fades into air at the back instead of stopping at a cut.
// It is a plain CSS gradient on its own layer, set a few times a second: no GPU work in the frame.

// The colour a linear scene colour ends up on screen: the same steps the shaders run after a
// material's light (three's NeutralToneMapping, then the map's grade from scene.js installGrade,
// then sRGB). The far edge is mixed to exactly the haze colour before those steps, so it lands on
// exactly this colour and the seam disappears.
export function screenColor(c, grade, exposure = 1, out = [0, 0, 0]) {
  let r = c.r * exposure, g = c.g * exposure, b = c.b * exposure;
  // NeutralToneMapping (three r186, tonemapping_pars_fragment)
  const x = Math.min(r, g, b), offset = x < 0.08 ? x - 6.25 * x * x : 0.04;
  r -= offset; g -= offset; b -= offset;
  const peak = Math.max(r, g, b), start = 0.8 - 0.04;
  if (peak >= start) {
    const d = 1 - start, newPeak = 1 - d * d / (peak + d - start), s = newPeak / peak;
    r *= s; g *= s; b *= s;
    const t = 1 - 1 / (0.15 * (peak - newPeak) + 1);
    r += (newPeak - r) * t; g += (newPeak - g) * t; b += (newPeak - b) * t;
  }
  // the map's grade (gain and lift, saturation, contrast round 0.2)
  r = r * grade.gain[0] + grade.lift[0]; g = g * grade.gain[1] + grade.lift[1]; b = b * grade.gain[2] + grade.lift[2];
  const l = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  r = l + (r - l) * grade.sat; g = l + (g - l) * grade.sat; b = l + (b - l) * grade.sat;
  const curve = v => Math.min(1, Math.max(0, 0.2 * Math.pow(Math.max(v, 0) / 0.2, grade.contrast)));
  const srgb = v => v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055;
  out[0] = Math.round(srgb(curve(r)) * 255); out[1] = Math.round(srgb(curve(g)) * 255); out[2] = Math.round(srgb(curve(b)) * 255);
  return out;
}

const css = c => `rgb(${c[0]},${c[1]},${c[2]})`;
const UPDATE_MS = 120; // (the light eases over seconds, so a few updates a second look continuous)

export class Backdrop {
  constructor() {
    this.el = document.createElement('div');
    this.el.id = 'backdrop';
    this.el.className = 'ph-no-capture';
    // (fixed behind the 3D view, on a layer of its own so a new colour repaints only itself)
    Object.assign(this.el.style, { position: 'fixed', inset: '0', pointerEvents: 'none', willChange: 'transform', display: 'none' });
    const view = document.getElementById('view');
    if (view?.parentNode) view.parentNode.insertBefore(this.el, view); else document.body.prepend(this.el);
    this.stops = null; this.at = -Infinity; this.key = '';
  }

  // stops: [haze, bottom], each [r, g, b] 0..255 on screen
  set(stops, now) {
    this.stops = stops;
    if (now - this.at < UPDATE_MS) return;
    const key = stops.map(css).join();
    if (key === this.key) return;
    this.at = now; this.key = key;
    const [mid, bottom] = stops.map(css);
    // the haze itself down to below where the far edge can land on screen (a tint anywhere it might
    // would outline the land), then darkening under the near walls, the diorama's shadow
    this.el.style.background = `linear-gradient(${mid} 0%, ${mid} 62%, ${bottom} 100%)`;
    this.el.style.display = '';
  }

  // (for a saved picture: the same gradient painted onto its canvas)
  paint(ctx, W, H) {
    if (!this.stops) return false;
    const [mid, bottom] = this.stops.map(css), g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, mid); g.addColorStop(0.62, mid); g.addColorStop(1, bottom);
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    return true;
  }
}
