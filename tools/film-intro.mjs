// Film the first-visit intro (docs/ideas/2026-11-21-first-minutes/s8.md has the how-to):
// each layer of tools/intro-film-shots.mjs is filmed through the production renderer a frame at a
// time (30 fps, fixed clock, seeded) into dist/intro-film/frames/, then the layers are laid over
// each other, the sound is mixed from the game's own recordings, and both are encoded in headless
// Chrome with WebCodecs (no ffmpeg needed): H.264 + AAC in MP4, VP9 + Opus in WebM.
//
//   nice -n 15 node tools/film-intro.mjs                   film every layer, then assemble
//   nice -n 15 node tools/film-intro.mjs --layers=chase    film only these layers again, then assemble
//   nice -n 15 node tools/film-intro.mjs --assemble        assemble from the frames already filmed
//   nice -n 15 node tools/film-intro.mjs --layers=falls --no-assemble   look at frames before encoding
//
// Writes (assets/intro/ is the game's, the 1080p is the website's and itch.io's):
//   assets/intro/intro-film.mp4 (.webm when it fits)  1280×720, for the game (target 3–5 MB)
//   assets/intro/intro-film-last.jpg          the exact last frame (1920×1080), what the game's first view must match
//   assets/intro/intro-film.json              the last frame's camera, the beats, sizes, credits, how it was made
//   website/review-media/video/intro-film-1080.mp4 (.webm when it is small enough)   1920×1080
//   dist/intro-film/samples/                  a frame each second of each output, to look at
import { mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { openBrowser, projectRoot } from './browser-session.mjs';
import { LAYERS, FPS, SECONDS, SOUND, BEATS } from './intro-film-shots.mjs';

const path = rel => fileURLToPath(new URL('../' + rel, import.meta.url));
const arg = name => process.argv.find(a => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const flag = name => process.argv.includes('--' + name);
const layers = flag('assemble') ? [] : arg('layers')?.split(',') || LAYERS.map(l => l.name);
for (const l of layers) if (!LAYERS.some(x => x.name === l)) throw Error(`Unknown layer ${l}. Layers: ${LAYERS.map(x => x.name).join(', ')}`);
const framesDir = path('dist/intro-film/frames/'), samplesDir = path('dist/intro-film/samples/');
const gameOut = path('assets/intro/'), siteOut = path('website/review-media/video/');
const hash = b => createHash('sha256').update(b).digest('hex');
const git = (...a) => execFileSync('git', a, { cwd: projectRoot, encoding: 'utf8' }).trim();
// The outputs: the game's 720p must stay small (it downloads while the game loads); the 1080p is
// for the website and itch.io. The encoders overshoot on busy footage, so a file over its budget is
// encoded again at a lower rate (the frames are already filmed).
const OUTPUTS = [
  { id: 'game', width: 1280, height: 720, bitrate: { mp4: 850e3, webm: 760e3 }, audio: 96e3, budget: 4.9e6, webmOptional: 4.9e6, files: { mp4: gameOut + 'intro-film.mp4', webm: gameOut + 'intro-film.webm' } },
  { id: 'site', width: 1920, height: 1080, bitrate: { mp4: 1.75e6, webm: 1.7e6 }, audio: 128e3, budget: 9.4e6, webmOptional: 9.4e6, files: { mp4: siteOut + 'intro-film-1080.mp4', webm: siteOut + 'intro-film-1080.webm' } },
];

const browser = await openBrowser({ label: 'intro-film', software: false, width: 1920, height: 1080 });
const report = { layers: {} };
try {
  const { gpu } = await browser.evaluate('(()=>{const c=new OffscreenCanvas(1,1).getContext("webgl2"),d=c.getExtension("WEBGL_debug_renderer_info");return {gpu:d?c.getParameter(d.UNMASKED_RENDERER_WEBGL):"unknown"};})()');
  console.log('Rendering on', gpu);
  await browser.send('Emulation.setDeviceMetricsOverride', { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false });
  for (const name of layers) {
    const started = Date.now();
    await browser.navigate('/tools/intro-film.html?layer=' + name);
    await browser.waitFor('window.introFilm?.ready', 'Intro film layer ' + name, 600000);
    const error = await browser.evaluate('window.introFilm.error'); if (error) throw Error(error);
    const { first, last, paths, beats } = await browser.evaluate('(({first,last,paths,beats})=>({first,last,paths,beats}))(window.introFilm)');
    await rm(framesDir + name, { recursive: true, force: true }); await mkdir(framesDir + name, { recursive: true });
    console.log(`Filming ${name}: frames ${first}–${last}${paths ? ` (deer line ${paths.deer.toFixed(1)} tiles, fence at ${paths.fence?.toFixed(2)} s, cougar stops at ${paths.catStop?.toFixed(2)} s, forest camera ${JSON.stringify(paths.forestCamera)}, ${paths.trunks} trunks, path ${paths.hash})` : ''}`);
    for (let f = first; f <= last; f++) {
      const b64 = await browser.evaluate(`introFilm.frame(${f})`, 120000);
      await writeFile(`${framesDir}${name}/${String(f).padStart(4, '0')}.jpg`, Buffer.from(b64, 'base64'));
    }
    browser.assertHealthy();
    const info = await browser.evaluate('introFilm.info()');
    report.layers[name] = { first, last, paths, beats, lastCamera: info, seconds: Math.round((Date.now() - started) / 1000) };
    await writeFile(`${framesDir}${name}.json`, JSON.stringify(report.layers[name], null, 2) + '\n'); // (for an --assemble run later)
    console.log(`  ${last - first + 1} frames in ${report.layers[name].seconds} s`);
    if (name === 'start') {
      // the exact last frame, and the camera that made it: the live first view must match this
      await mkdir(gameOut, { recursive: true });
      await writeFile(gameOut + 'intro-film-last.jpg', await readFile(`${framesDir}start/${String(last).padStart(4, '0')}.jpg`));
      await writeFile(framesDir + 'start-camera.json', JSON.stringify(info, null, 2) + '\n');
    }
  }
  if (!flag('no-assemble')) {
    await browser.send('Emulation.setDeviceMetricsOverride', { width: 960, height: 540, deviceScaleFactor: 1, mobile: false });
    const outputs = [];
    for (const out of OUTPUTS) {
      await mkdir(out.id === 'game' ? gameOut : siteOut, { recursive: true });
      const samples = Array.from({ length: SECONDS }, (_, s) => s * FPS).concat(SECONDS * FPS - 1);
      let bitrate = { ...out.bitrate }, result;
      for (let attempt = 0; ; attempt++) {
        await browser.navigate('/tools/intro-film.html?assemble=1');
        await browser.waitFor('window.introFilm?.ready', 'Intro film assembly', 60000);
        const error = await browser.evaluate('window.introFilm.error'); if (error) throw Error(error);
        const started = Date.now();
        result = await browser.evaluate(`introFilm.assemble(${JSON.stringify({ width: out.width, height: out.height, mp4Bitrate: bitrate.mp4, webmBitrate: bitrate.webm, audioBitrate: out.audio, samples })})`, 1800000);
        console.log(`Assembled ${out.id} ${out.width}×${out.height} in ${Math.round((Date.now() - started) / 1000)} s: mp4 ${(result.sizes.mp4 / 1e6).toFixed(2)} MB, webm ${(result.sizes.webm / 1e6).toFixed(2)} MB, sound peak ${result.audio.peak}`);
        const over = ['mp4', 'webm'].filter(k => result.sizes[k] > (k === 'webm' && out.webmOptional ? Infinity : out.budget));
        if (!over.length) break;
        if (attempt === 2) throw Error(`${out.id}: ${over.join(' and ')} still over ${out.budget / 1e6} MB`);
        for (const k of over) bitrate[k] = Math.round(bitrate[k] * out.budget * .9 / result.sizes[k]);
        console.log(`  over budget; again at ${over.map(k => `${k} ${(bitrate[k] / 1e6).toFixed(2)} Mbit/s`).join(', ')}`);
      }
      const files = [];
      for (const kind of ['mp4', 'webm']) {
        if (kind === 'webm' && out.webmOptional && result.sizes.webm > out.webmOptional) { console.log(`  (no ${out.id} WebM: ${(result.sizes.webm / 1e6).toFixed(2)} MB is over ${out.webmOptional / 1e6} MB)`); await rm(out.files.webm, { force: true }); continue; }
        const parts = [];
        for (let at = 0; at < result.sizes[kind]; at += 1.5e6) parts.push(Buffer.from(await browser.evaluate(`introFilm.slice(${JSON.stringify(kind)},${at},1500000)`), 'base64'));
        const bytes = Buffer.concat(parts);
        if (bytes.length !== result.sizes[kind]) throw Error(`${kind}: read back ${bytes.length} of ${result.sizes[kind]} bytes`);
        await writeFile(out.files[kind], bytes);
        files.push({ file: out.files[kind].slice(projectRoot.length), kind, bytes: bytes.length, sha256: hash(bytes) });
      }
      await rm(samplesDir + out.id, { recursive: true, force: true }); await mkdir(samplesDir + out.id, { recursive: true });
      for (const [f, data] of Object.entries(result.samples)) await writeFile(`${samplesDir}${out.id}/frame-${String(f).padStart(4, '0')}.jpg`, Buffer.from(data, 'base64'));
      // Chrome must play each back: its length, size, sound and a decoded frame from the middle
      await browser.navigate('/assets/logo.svg');
      for (const f of files) {
        const played = await browser.evaluate(`(async()=>{
          // (from a blob: the check's server answers no byte ranges, and without them nothing seeks)
          const v=document.createElementNS('http://www.w3.org/1999/xhtml','video');v.muted=true;v.src=URL.createObjectURL(await (await fetch(${JSON.stringify('/' + f.file)})).blob());
          await new Promise((ok,fail)=>{v.onloadeddata=ok;v.onerror=()=>fail(Error('cannot play '+v.src+': '+v.error?.message));});
          v.currentTime=20;await new Promise(ok=>v.onseeked=ok);
          const c=new OffscreenCanvas(64,36),x=c.getContext('2d');x.drawImage(v,0,0,64,36);
          const d=x.getImageData(0,0,64,36).data;let sum=0;for(let i=0;i<d.length;i+=4)sum+=d[i]+d[i+1]+d[i+2];
          const tracks=v.audioTracks?v.audioTracks.length:null;
          return {duration:v.duration,width:v.videoWidth,height:v.videoHeight,brightness:sum/(d.length/4*3),audio:v.mozHasAudio??v.webkitAudioDecodedByteCount??tracks};
        })()`);
        if (Math.abs(played.duration - SECONDS) > .15 || played.width !== out.width || played.height !== out.height || played.brightness < 15) throw Error(`${f.file} does not play back as made: ${JSON.stringify(played)}`);
        // (the sound: decode the file's audio track on its own and measure it)
        const heard = await browser.evaluate(`(async()=>{const b=await (await fetch(${JSON.stringify('/' + f.file)})).arrayBuffer();
          const a=await new OfflineAudioContext(2,48000,48000).decodeAudioData(b);let s=0;const d=a.getChannelData(0);for(let i=0;i<d.length;i+=97)s+=d[i]*d[i];
          return {seconds:a.duration,rms:Math.sqrt(s/(d.length/97))};})()`);
        if (Math.abs(heard.seconds - SECONDS) > .3 || heard.rms < .005) throw Error(`${f.file}: the sound does not decode as made: ${JSON.stringify(heard)}`);
        f.checked = { duration: +played.duration.toFixed(3), width: played.width, height: played.height, soundSeconds: +heard.seconds.toFixed(2), soundRms: +heard.rms.toFixed(4) };
        console.log(`  ${f.file} ${(f.bytes / 1e6).toFixed(2)} MB plays: ${JSON.stringify(f.checked)}`);
      }
      outputs.push({ id: out.id, width: out.width, height: out.height, bitrate, audioBitrate: out.audio, codecs: result.codecs, files });
    }
    // The hand-over for the game: the last frame's camera (session 9 starts the live view from it)
    const camera = JSON.parse(await readFile(framesDir + 'start-camera.json', 'utf8'));
    const sources = JSON.parse(await readFile(path('assets/sounds/field-sources.json'), 'utf8'));
    const credit = file => { const key = file.replace(/^field-/, '').replace(/-\d+$/, ''); const s = sources[key] || sources[file.replace(/-\d+$/, '')]; return s ? { file, by: s.by, license: s.license, source: s.source } : { file, note: 'see assets/sounds/LICENSES.md' }; };
    const revision = git('rev-parse', 'HEAD');
    await writeFile(gameOut + 'intro-film.json', JSON.stringify({
      title: 'Second Growth: first-visit intro', map: 'pnw', seed: 1987, seconds: SECONDS, fps: FPS,
      sourceRevision: revision, sourceDate: git('show', '-s', '--format=%cs', revision), uncommittedGameChanges: git('status', '--porcelain', '--', 'js', 'vendor', 'index.html', 'styles.css').length > 0,
      madeAt: new Date().toISOString(), madeWith: 'node tools/film-intro.mjs (tools/intro-film.mjs, tools/intro-film-shots.mjs)',
      lastFrame: {
        image: 'assets/intro/intro-film-last.jpg',
        // Renderer.resetView() on PNW: the map's start view. x/y are tiles (the camera's target on
        // the ground), zoom and az (radians) as the renderer has them, timeOfDay is todClock / 360
        // (0.45: the game starts in the afternoon). Filmed 1920×1080 at a pixel ratio of 1, so the
        // live view shows more or less ground at other window shapes, the same middle and scale.
        camera: { x: +camera.target.x.toFixed(4), y: +camera.target.z.toFixed(4), groundHeight: +camera.target.y.toFixed(4), zoom: camera.zoom, az: camera.az, timeOfDay: +camera.timeOfDay.toFixed(4), pixelsPerTile: camera.ppu, width: camera.width, height: camera.height, resetView: true },
      },
      beats: { ...BEATS, fence: +JSON.parse(await readFile(framesDir + 'falls.json', 'utf8')).beats.fence.toFixed(2) },
      layers: LAYERS,
      look: 'Balanced detail, shadows on, no weather, 1920×1080 at a pixel ratio of 1',
      staging: 'Start game: the farm as a first visit opens it (seed 1987, run seed 20261121). The deer and cougar are posed and moved along planned lines that thread the old forest\'s trunks, drawn by the game\'s own walker drawing (stride, gallop, head, crouch; the deer\'s leap over the fence is the pounce arc). Restored game: release-fixtures\' restored PNW (the fence and culvert gone), September, elk and a deer posed in the meadow and then living by the simulation. Nothing is painted or generated.',
      sound: SOUND.map(s => ({ ...credit(s.file), at: s.at })),
      outputs,
    }, null, 2) + '\n');
    console.log('Wrote assets/intro/intro-film.json');
  }
} finally {
  await browser.close();
}
