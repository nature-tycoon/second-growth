// How faithful the encoded intro film is to the frames it was made from
// (docs/ideas/2026-11-21-first-minutes/film-playback.md): every frame of each file decoded in Chrome and
// compared on luma with the frame the encoder was given (tools/intro-film.mjs quality, drawFrame), so
// it needs the filmed frames in dist/intro-film/frames/. Reports PSNR and SSIM: the mean, the worst
// frames, each shot's minimum, and the keyframe pulse (the jump in PSNR at each keyframe against the
// frame before it, within one shot: the picture "breathing" sharp then soft).
//
//   nice -n 15 node tools/intro-film-quality.mjs [files] [--every=1] [--gop=60] [--json=out.json]
//   files default to the game's: assets/intro/intro-film.mp4, -1080.mp4
import { writeFile } from 'node:fs/promises';
import { openBrowser } from './browser-session.mjs';
import { LAYERS, FPS } from './intro-film-shots.mjs';

const args = process.argv.slice(2);
const opt = (n, d) => args.find(a => a.startsWith(`--${n}=`))?.split('=')[1] ?? d;
const every = Number(opt('every', 1)), gop = Number(opt('gop', 60)), jsonOut = opt('json', null);
const files = args.filter(a => !a.startsWith('--'));
if (!files.length) files.push('assets/intro/intro-film.mp4', 'assets/intro/intro-film-1080.mp4'); // (H.264 only: there's no WebM since film-playback.md)
const shotOf = f => { const t = f / FPS; let name = '-'; for (const L of LAYERS) if (t >= L.from && t < L.to) name = L.name; return name; };
const median = a => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : null; };

const b = await openBrowser({ label: 'intro-film-quality', software: false, width: 960, height: 540 });
const all = {};
try {
  await b.navigate('/tools/intro-film.html?assemble=1');
  await b.waitFor('window.introFilm?.ready', 'the film studio page', 60000);
  for (const file of files) {
    const big = /1080/.test(file), [width, height] = big ? [1920, 1080] : [1280, 720];
    const started = Date.now();
    const rows = await b.evaluate(`introFilm.quality(${JSON.stringify({ src: '/' + file, width, height, every })})`, 3600000);
    const byF = new Map(rows.map(r => [r[0], r]));
    const shots = {};
    for (const [f, p, s] of rows) { const k = shotOf(f); const x = shots[k] ||= { psnr: 99, ssim: 1 }; x.psnr = Math.min(x.psnr, p); x.ssim = Math.min(x.ssim, s); }
    const pulses = [];
    if (every === 1) for (let k = gop; k < rows.length; k += gop) {
      const now = byF.get(k), before = byF.get(k - 1);
      if (now && before && shotOf(k) === shotOf(k - 1)) pulses.push(+(now[1] - before[1]).toFixed(2));
    }
    const worst = [...rows].sort((x, y) => x[2] - y[2]).slice(0, 5).map(([f, p, s]) => `${f} (${(f / FPS).toFixed(1)} s, ${shotOf(f)}): ${p} dB, SSIM ${s}`);
    const mean = i => +(rows.reduce((t, r) => t + r[i], 0) / rows.length).toFixed(i === 1 ? 2 : 4);
    const summary = {
      file, frames: rows.length, seconds: Math.round((Date.now() - started) / 1000),
      psnrMean: mean(1), psnrMin: Math.min(...rows.map(r => r[1])), ssimMean: mean(2), ssimMin: Math.min(...rows.map(r => r[2])),
      pulseMedianDb: median(pulses.map(Math.abs)), pulseMaxDb: pulses.length ? Math.max(...pulses.map(Math.abs)) : null,
      worst, shots,
    };
    all[file] = { summary, rows };
    console.log(JSON.stringify({ ...summary, shots: Object.fromEntries(Object.entries(shots).map(([k, v]) => [k, `${v.psnr} dB / ${v.ssim}`])) }, null, 1));
  }
} finally { await b.close(); }
if (jsonOut) await writeFile(jsonOut, JSON.stringify(all));
