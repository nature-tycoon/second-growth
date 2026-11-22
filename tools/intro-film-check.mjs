// The intro film (tools/film-intro.mjs) ends on the first visit's own start view, so the game can
// hand over from the film's last frame to the live farm without a jump. This check (headless, CI)
// fails when they drift apart: the PNW start view (Renderer.resetView, the map's startView), the
// time of day the renderer starts at, the farm the film was made on, and the files themselves
// (present, the hashes recorded, under their size caps: 5 MB for the 720p the game always may load,
// 10 MB for the 1080p it plays on big screens and the website's copy of it). Re-film when it fails (s8.md).
//
//   node tools/intro-film-check.mjs           headless
//   node tools/intro-film-check.mjs --live    also boots the real game as a first visit in Chrome and
//                                             compares its opening view with the film's last frame
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { Game } from '../js/game.js';
import { SECONDS } from './intro-film-shots.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const film = JSON.parse(await readFile(root + 'assets/intro/intro-film.json', 'utf8'));
const cam = film.lastFrame.camera;

// the start view as the game takes it: main.js calls Renderer.resetView (render3d/scene.js) before
// the renderer's first draw, when it has no world yet, so a map without a startView gets the
// fallback middle (44, 38), not the map-size one
const g = new Game(); g.newGame(1987, 'free', 'standard', 'pnw');
const v = g.catalog.definition.startView;
const main = await readFile(root + 'js/main.js', 'utf8');
assert.ok(/new Renderer\([\s\S]{0,600}renderer\.resetView\(\);/.test(main), 'main.js still sets the start view right after making the renderer (before any draw): if this moved, check the film\'s last frame against the live first view (--live)');
const want = { x: v ? v.x : 44, y: v ? v.y : 38, zoom: v?.zoom ?? 0.62, az: v?.az ?? Math.PI / 4 };
const scene = await readFile(root + 'js/render3d/scene.js', 'utf8');
assert.ok(/resetView\(\) \{\s*const v = this\.catalog\.definition\.startView;\s*this\.zoom = v\?\.zoom \?\? 0\.62; this\.az = this\.azTarget = v\?\.az \?\? Math\.PI \/ 4;\s*this\.centerOn\(v \? v\.x : this\.world \? this\.world\.w \* 0\.36 : 44, v \? v\.y : this\.world \? this\.world\.h \* 0\.42 : 38\);/.test(scene),
  'Renderer.resetView changed: check the intro film still ends on the start view, then update this check');
const start = scene.match(/this\.todClock = DAY_CYCLE \* ([\d.]+);/);
assert.ok(start, 'the renderer\'s starting time of day (todClock) is where this check expects it');
for (const k of ['x', 'y', 'zoom', 'az']) assert.ok(Math.abs(cam[k] - want[k]) < 1e-3, `the film's last frame is at the start view: ${k} ${cam[k]} vs ${want[k]} (re-film: node tools/film-intro.mjs)`);
assert.ok(Math.abs(cam.timeOfDay - Number(start[1])) < 1e-3, `the film ends at the game's starting time of day (${cam.timeOfDay} vs ${start[1]})`);
assert.equal(film.map, 'pnw'); assert.equal(film.seed, 1987);
assert.equal(film.seconds, SECONDS, `the film's length is the script's (${film.seconds} s filmed, ${SECONDS} s in tools/intro-film-shots.mjs): re-film`);

// the files: present, as recorded, and small enough (the game's film downloads while the game loads)
const caps = { game: 5e6, site: 10e6 };
for (const out of film.outputs) for (const f of out.files) {
  const bytes = await readFile(root + f.file);
  assert.equal(bytes.length, f.bytes, `${f.file} is the file filmed`);
  assert.equal(createHash('sha256').update(bytes).digest('hex'), f.sha256, `${f.file} matches its recorded hash`);
  assert.ok(bytes.length <= caps[out.id], `${f.file} is under ${caps[out.id] / 1e6} MB`);
}
assert.ok(film.outputs.some(o => o.id === 'game' && o.files.some(f => f.kind === 'mp4') && o.files.some(f => f.kind === 'webm')), 'the game has the film as MP4 and WebM');
// the 1080p the game plays on big screens (js/ui/intro.js filmSize): assets/intro/intro-film-1080.*, the
// site's bytes; the MP4 at least (Safari), and every copy the game names is one the film recorded
const game1080 = film.outputs.find(o => o.id === 'site')?.files.filter(f => f.file.startsWith('assets/intro/intro-film-1080.')) || [];
assert.ok(game1080.some(f => f.kind === 'mp4'), 'the game has the 1080p film as MP4 (assets/intro/intro-film-1080.mp4)');
for (const f of game1080) assert.ok(film.outputs.find(o => o.id === 'site').files.some(s => s !== f && s.kind === f.kind && s.sha256 === f.sha256), `${f.file} is the same encode as the website's 1080p`);
const introJs = await readFile(root + 'js/ui/intro.js', 'utf8');
assert.ok(introJs.includes(`'assets/intro/intro-film-1080'`) && introJs.includes(`'assets/intro/intro-film'`), 'js/ui/intro.js plays the files this check holds');
await readFile(root + film.lastFrame.image);
console.log(`intro film: ends on the PNW start view (${cam.x.toFixed(2)}, ${cam.y.toFixed(2)}, zoom ${cam.zoom}, time ${cam.timeOfDay}); ${film.outputs.flatMap(o => o.files).map(f => `${f.game ? 'game ' : ''}${f.file.split('/').pop()} ${(f.bytes / 1e6).toFixed(2)} MB`).join(', ')}`);

if (process.argv.includes('--live')) {
  // The real game, as a first visit (no save), Balanced, at the film's size: its camera before the
  // opening's glide to the fence, then its picture there (the panels hidden) against the last frame.
  const { openBrowser } = await import('./browser-session.mjs');
  const b = await openBrowser({ label: 'intro-film-live', software: false, width: cam.width, height: cam.height });
  try {
    await b.send('Page.enable');
    await b.send('Page.addScriptToEvaluateOnNewDocument', { source: `localStorage.setItem('second-growth-settings',JSON.stringify({analytics:false,autosave:false,music:false,nature:false,quality:'balanced',qualityChosen:true,shadows:true,dayCycle:true,weather:false,v:2}));` });
    await b.navigate('/');
    await b.waitFor('!!window.secondGrowth && (!document.getElementById("loading-screen") || document.getElementById("loading-screen").classList.contains("done"))', 'Game boot', 120000);
    const live = await b.evaluate(`(()=>{const r=window.secondGrowth.renderer,f=r.fly;return {x:f?f.x0:r.target.x,y:f?f.z0:r.target.z,zoom:f?f.zoom0:r.zoom,az:r.az,stage:window.secondGrowth.game.flags.opening?.stage};})()`);
    for (const k of ['x', 'y', 'zoom', 'az']) assert.ok(Math.abs(live[k] - cam[k]) < 1e-3, `live first view ${k} ${live[k]} vs the film's ${cam[k]}`);
    // (the same view, the same time of day, clear weather, panels and toasts hidden, then one frame)
    await b.evaluate(`(async()=>{
      const {renderer:r,game:g}=window.secondGrowth;g.speed=0;r.fly=null;r.resetView();r.todClock=${cam.timeOfDay}*360;g.weather='clear';
      document.body.classList.add('panels-hidden');for(const el of document.querySelectorAll('body > *:not(canvas)'))el.style.visibility='hidden';
      await new Promise(ok=>setTimeout(ok,2000));
    })()`, 60000);
    // (a screenshot of the page, since the game's canvas keeps no drawing to read back)
    const shot = (await b.send('Page.captureScreenshot', { format: 'jpeg', quality: 90 })).data;
    const { writeFile, mkdir } = await import('node:fs/promises');
    await mkdir(root + 'dist/intro-film', { recursive: true });
    await writeFile(root + 'dist/intro-film/live-start.jpg', Buffer.from(shot, 'base64'));
    await b.navigate('/assets/logo.svg'); // (away from the game's content policy, which blocks reading it back)
    const diff = await b.evaluate(`(async()=>{
      const load=async src=>createImageBitmap(await (await fetch(src)).blob());
      const a=await load('/dist/intro-film/live-start.jpg'),bimg=await load('/${film.lastFrame.image}');
      const W=192,H=108,ca=new OffscreenCanvas(W,H),cb=new OffscreenCanvas(W,H);
      const xa=ca.getContext('2d'),xb=cb.getContext('2d');xa.drawImage(a,0,0,W,H);xb.drawImage(bimg,0,0,W,H);
      const da=xa.getImageData(0,0,W,H).data,db=xb.getImageData(0,0,W,H).data;let s=0;for(let i=0;i<da.length;i+=4)s+=Math.abs(da[i]-db[i])+Math.abs(da[i+1]-db[i+1])+Math.abs(da[i+2]-db[i+2]);
      return s/(W*H*3);
    })()`, 60000);
    console.log(`live first view: camera matches; mean pixel difference from the film's last frame ${diff.toFixed(1)} of 255 (dist/intro-film/live-start.jpg beside assets/intro/intro-film-last.jpg)`);
    assert.ok(diff < 20, `the live first view looks like the film's last frame (mean difference ${diff.toFixed(1)})`);
  } finally { await b.close(); }
}
