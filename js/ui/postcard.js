// Postcards from photo mode: the view (or a then-and-now pair) mounted on a cream card with the
// farm's name, where it is, how far along it is, and a small stamp. Drawn onto a canvas and
// saved as a PNG, so it's ready to share.

import { tr } from '../i18n.js';

const W = 1800, H = 1240, M = 56;                  // card size and margin
const PHOTO = { x: M, y: M, w: W - M * 2, h: 900 }; // the picture area (about 3:2)

let logo = null;
const logoReady = new Promise(res => {
  const img = new Image();
  img.onload = () => { logo = img; res(); };
  img.onerror = () => res();
  img.src = 'assets/logo.svg';
});

// Crop a capture to fill a box, keeping its centre.
function cover(ctx, src, x, y, w, h) {
  const r = Math.max(w / src.width, h / src.height), sw = w / r, sh = h / r;
  ctx.drawImage(src, (src.width - sw) / 2, (src.height - sh) / 2, sw, sh, x, y, w, h);
}

function label(ctx, text, x, y) {
  ctx.font = '700 30px Nunito, sans-serif';
  const tw = ctx.measureText(text).width + 36;
  ctx.fillStyle = 'rgba(28,38,26,0.72)';
  ctx.beginPath(); ctx.roundRect(x, y, tw, 52, 26); ctx.fill();
  ctx.fillStyle = '#f7f0dc'; ctx.textBaseline = 'middle'; ctx.fillText(tr(text), x + 18, y + 27);
}

// images: [{ canvas, label? }] (one, or two for then-and-now); title, subtitle, stats: strings
export async function makePostcard({ images, title, subtitle, stats, stamp }) {
  await Promise.all([logoReady, document.fonts?.ready]);
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const ctx = c.getContext('2d');
  // card: warm paper with a faint grain
  ctx.fillStyle = '#f4ecd6'; ctx.fillRect(0, 0, W, H);
  for (let k = 0; k < 2600; k++) { ctx.fillStyle = `rgba(120,96,56,${Math.random() * 0.05})`; ctx.fillRect(Math.random() * W, Math.random() * H, 2, 2); }
  // the photo(s), with a thin dark keyline and a soft shadow
  ctx.save();
  ctx.shadowColor = 'rgba(40,30,15,0.28)'; ctx.shadowBlur = 24; ctx.shadowOffsetY = 6;
  ctx.fillStyle = '#2a2a22'; ctx.fillRect(PHOTO.x - 3, PHOTO.y - 3, PHOTO.w + 6, PHOTO.h + 6);
  ctx.restore();
  const gap = 10, n = images.length, each = (PHOTO.w - gap * (n - 1)) / n;
  images.forEach((im, k) => {
    const x = PHOTO.x + k * (each + gap);
    cover(ctx, im.canvas, x, PHOTO.y, each, PHOTO.h);
    // gentle vignette on each photo
    const g = ctx.createRadialGradient(x + each / 2, PHOTO.y + PHOTO.h / 2, Math.min(each, PHOTO.h) * 0.4, x + each / 2, PHOTO.y + PHOTO.h / 2, Math.hypot(each, PHOTO.h) * 0.6);
    g.addColorStop(0, 'rgba(20,24,16,0)'); g.addColorStop(1, 'rgba(20,24,16,0.35)');
    ctx.fillStyle = g; ctx.fillRect(x, PHOTO.y, each, PHOTO.h);
    if (im.label) label(ctx, im.label, x + 24, PHOTO.y + 24);
  });
  // caption
  const ty = PHOTO.y + PHOTO.h + 92;
  ctx.fillStyle = '#3b6230'; ctx.textBaseline = 'alphabetic';
  ctx.font = '700 64px Fraunces, Georgia, serif';
  ctx.fillText(tr(title), M + 4, ty);
  ctx.fillStyle = '#4a5646'; ctx.font = '600 30px Nunito, sans-serif';
  ctx.fillText(tr(subtitle), M + 6, ty + 50);
  ctx.fillStyle = '#6a6a52'; ctx.font = '700 26px Nunito, sans-serif';
  ctx.fillText(tr(stats), M + 6, ty + 94);
  // stamp: a scalloped square with the logo and the year
  const sx = W - M - 190, sy = PHOTO.y + PHOTO.h + 40, S = 190;
  ctx.save();
  ctx.fillStyle = '#fbf6e6'; ctx.strokeStyle = '#b5602f'; ctx.lineWidth = 3;
  ctx.beginPath();
  const bump = 9, step = S / 10;
  for (let k = 0; k <= 40; k++) {
    const side = Math.floor(k / 10), t = (k % 10) * step;
    const [px, py] = side === 0 ? [sx + t, sy] : side === 1 ? [sx + S, sy + t] : side === 2 ? [sx + S - t, sy + S] : [sx, sy + S - t];
    k ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
  }
  ctx.closePath(); ctx.fill();
  ctx.setLineDash([bump, bump * 0.6]); ctx.stroke(); ctx.setLineDash([]);
  if (logo) ctx.drawImage(logo, sx + S / 2 - 52, sy + 22, 104, 104);
  ctx.fillStyle = '#b5602f'; ctx.font = '800 22px Nunito, sans-serif'; ctx.textAlign = 'center';
  ctx.fillText(tr(stamp), sx + S / 2, sy + S - 30);
  ctx.restore();
  // where to play it
  ctx.fillStyle = '#8a8a6a'; ctx.font = '700 22px Nunito, sans-serif'; ctx.textAlign = 'right';
  ctx.fillText('Second Growth · nature-tycoon.github.io/second-growth', W - M, H - 30);
  return c;
}

export function download(canvas, name) {
  canvas.toBlob(blob => {
    if (!blob) return;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }, 'image/png');
}
