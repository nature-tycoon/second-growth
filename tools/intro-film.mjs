// Intro film studio (tools/film-intro.mjs drives it; the script is intro-film-shots.mjs, derived from
// the approved shot list, intro-film-plan.mjs).
//
//   intro-film.html?layer=<name>   films one layer: the production renderer and models, a frame at a
//                                  time on a fixed 30 fps clock, each frame handed back as a JPEG
//   intro-film.html?assemble=1     lays the layers' frames over each other, mixes the sound from the
//                                  game's recordings and encodes MP4 (H.264 + AAC) and WebM (VP9 + Opus)
//
// Staging (allowed in a film, never in play: decision 0001): the plan's animals are posed and moved
// along its paths (animalAt: smooth curves through its marks, eased starts and stops, real speeds),
// and drawn by the game's own walker drawing (stride, gallop, head, crouch, and the pounce arc for the
// doe's fence jump and the cougar's leap). The cameras are the plan's (cameraAt: eased moves, smoothed
// looks). In the slow motion the whole world's clock runs at the plan's rate. On the restored farm the
// rest of the wildlife lives by the simulation; the plan's elk are staged.
import { Renderer } from '../js/render3d/scene.js';
import { Game } from '../js/game.js';
import { SPEEDS, ANIMAL_SPEEDS } from '../js/config.js';
import { mulberry32 } from '../js/rng.js';
import { isMaleVariant } from '../js/data/animals.js';
import { PLANT } from '../js/data/plants.js';
import { isWater } from '../js/config.js';
import { travelSpeed } from '../js/sim/climb-pace.js';
import { releaseGame } from './release-fixtures.mjs';
import { muxMp4, muxWebm } from './video-mux.mjs';
import { FPS, SECONDS, LAYERS, TIME_OF_DAY, BEATS, SOUND, SLOWMO } from './intro-film-shots.mjs';
import { SHOTS, ANIMALS, animalAt, cameraAt, mapAt as planMap, realAt } from './intro-film-plan.mjs';
import { makeProbe, meshGround } from './intro-film-probe.mjs';

const DAY_CYCLE = 360; // scene.js: seconds in the renderer's day (todClock)
const RUN_SEED = 20261121; // the start game's run seed (weather, starting animals); the land is seed 1987
const WARM = 45; // frames staged and posed (not drawn) before a layer's first, so a cut never shows a pose still settling
const params = new URLSearchParams(location.search);
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;
const rateAt = t => SLOWMO.find(([a, b]) => t >= a && t < b)?.[2] ?? 1; // the world's clock in the slow motion
window.introFilm = { ready: false };

// ------------------------------------------------------------------ the two farms
function startGame() {
  Math.random = mulberry32(RUN_SEED);
  const g = new Game();
  g.newGame(1987, 'free', 'standard', 'pnw', RUN_SEED); // (a first visit's farm: main.js generates seed 1987)
  g.weather = 'clear'; g.snow = 0;
  return g;
}
function restoredFarm() {
  const { game: g } = releaseGame('pnw', 'forest'); // (restoredGame: native forest, fence and culvert gone, creek free)
  while (g.month !== 3) g.day++; // June: the meadow green, the maples and alders in full leaf
  g.weather = 'clear'; g.snow = 0;
  // Clear the crowns round the rise's camera, as staging (the eye would stand inside a tree): the rise
  // is filmed on both farms from the foot of the falls
  const w = g.world;
  for (let y = 5; y <= 11; y++) for (let x = 66; x <= 73; x++) { const i = w.idx(x, y); if (!isWater(w.terrain[i])) { w.tree[i] = 0; w.treeG[i] = 0; w.shrub[i] = 0; } }
  // Thirty years on, the woods north and east have closed in (the fixture's restored farm plants them
  // thinly, as a map-audit reference): conifers on about half the open tiles there, staging only
  const rnd = mulberry32(1987), conifers = ['fir', 'fir', 'cedar', 'hemlock'].map(k => PLANT[k]);
  for (let i = 0; i < w.n; i++) {
    const x = i % w.w, y = (i / w.w) | 0;
    if (!(y < 28 || x > 72) || w.tree[i] || isWater(w.terrain[i]) || w.struct[i] >= 0 || w.feature[i] || (x >= 66 && x <= 73 && y >= 5 && y <= 11)) continue;
    if (rnd() < .5) { const p = conifers[Math.floor(rnd() * conifers.length)]; w.setPlant(i, p, .75 + rnd() * .25); w.treeAge[i] = (p.matureAge ?? 20) * 120; }
  }
  return g;
}

function renderer(g) {
  const r = new Renderer(document.getElementById('view'), { catalog: g.catalog, preserveDrawingBuffer: true });
  // The look most players get: Balanced (computers with a stronger chip run High, weak ones and phones
  // Fast), shadows on, no weather.
  r.applySettings({ quality: 'balanced', qualityChosen: true, shadows: true, wind: true, dayCycle: true, weather: false });
  r.autoRes = false;
  r.drawFX = () => r.ux.clearRect(0, 0, r.ui.width, r.ui.height);
  // The first visit's start view exactly as the game takes it: main.js calls resetView() on the new
  // renderer before its first draw, so before it has a world (on PNW, with no startView, that is the
  // fallback middle, not the map-size one: s8.md). The last frame must be this view.
  r.resetView();
  r.startView = { x: r.target.x, y: r.target.z, zoom: r.zoom, az: r.az };
  return r;
}
// The eye at a point, looking at another: watch mode's eye-level view (sky, haze, close-up models),
// placed by the film rather than riding behind an animal. The look-at keeps the horizon level.
// fov: the vertical field of view in degrees (the eye's own is 50; less is a longer lens).
function eyeAt(r, pos, look, fov = 50) {
  r.eyeAgent = null; r.followAgent = null; r.eyeWalk = true;
  r.eye.agentId = 'walk';
  r.eye.walk = function (move, L, aspect) {
    this.under = false;
    this.pos.set(pos.x, pos.y, pos.z); this.look.set(look.x, look.y, look.z);
    this.forward.set(look.x - pos.x, 0, look.z - pos.z).normalize();
    this.apply(aspect);
    if (Math.abs(this.camera.fov - fov) > 1e-4) { this.camera.fov = fov; this.camera.updateProjectionMatrix(); }
  };
}
function mapAt(r, x, y, zoom, az) {
  r.eyeWalk = false; r.setEyeLevel(null);
  r.zoom = zoom; r.az = r.azTarget = az; r.centerOn(x, y);
}

// ------------------------------------------------------------------ the plan's animals
// How each of the plan's poses is staged for the game's drawing (the drawing reads a.state, a.hunt,
// a.forage, a.alertT and a.run): browsing and grazing heads down, alert heads up, the cougar's crouch
// and creep (hunt phase creep: low, head forward), its rush, and the jumps (hunt.leap: the pounce arc).
function poseState(pose, p, foodTile) {
  switch (pose) {
    case 'browse': return { state: 'forage', forage: { food: 'forb', i: foodTile }, hunt: null, alertT: 0, run: 1 };
    case 'graze': return { state: 'forage', forage: { food: 'grass', i: foodTile }, hunt: null, alertT: 0, run: 1 };
    case 'alert': case 'stand': return { state: 'idle', forage: null, hunt: null, alertT: 99, run: 1 };
    case 'walk': return { state: 'idle', forage: null, hunt: null, alertT: 0, run: 1 };
    case 'run': return { state: 'flee', forage: null, hunt: null, alertT: 99, run: 2.6 };
    case 'leap': return { state: 'hunt', forage: null, hunt: { leap: { u: p.leap, arc: p.arc } }, alertT: 99, run: 2.6 };
    case 'crouch': case 'creep': return { state: 'hunt', forage: null, hunt: { phase: 'creep' }, alertT: 0, run: .5 };
    case 'rush': return { state: 'hunt', forage: null, hunt: { phase: 'rush' }, alertT: 0, run: 2.4 };
    case 'pounce': return { state: 'hunt', forage: null, hunt: { phase: 'rush', leap: { u: p.leap, arc: p.arc } }, alertT: 0, run: 2.4 };
  }
  throw Error('No staging for pose ' + pose);
}
function castOf(g, farm) {
  const W = g.wildlife, cast = {}, defs = {};
  for (const [name, A] of Object.entries(ANIMALS)) {
    if (A.farm !== farm) continue;
    const def = g.catalog.animal[A.species], p = animalAt(name, -1);
    if (name === 'doe') while (isMaleVariant(def, { id: W.nextId, age: 600 })) W.nextId++; // (a doe: no antlers in March)
    const a = W.spawn(def, p.x, p.y, { silent: true, age: A.species === 'cougar' ? 700 : 600 });
    Object.assign(a, { wait: 1e9, hunger: 0, thirst: 0, path: null, heading: p.heading });
    cast[name] = a; defs[name] = def;
  }
  W.recount?.();
  const last = new Map(), w = g.world;
  const browseTile = (() => { for (let i = 0; i < w.n; i++) if (w.shrub[i] && w.shrubG[i] > .4) return i; return 0; })();
  // place them for film frame f: where the plan has them at that frame's real time
  const stage = f => {
    const real = realAt(f / FPS);
    for (const [name, a] of Object.entries(cast)) {
      const p = animalAt(name, real), def = defs[name], q = last.get(name), moved = q ? Math.hypot(p.x - q.x, p.y - q.y) : 0;
      // (the legs keep the game's own pace for the ground covered: stride.js groundPace = 1)
      a.phase += moved * 6 * (def.sprite.beat ?? 1) / Math.max(.05, travelSpeed(def));
      a.x = a.tx = p.x; a.y = a.ty = p.y; a.heading = p.heading;
      const tile = w.inb(Math.floor(p.x), Math.floor(p.y)) ? w.idx(Math.floor(p.x), Math.floor(p.y)) : browseTile;
      Object.assign(a, poseState(p.pose, p, p.pose === 'browse' ? browseTile : tile), { wait: 1e9, path: null, hunger: 0, thirst: 0 });
      last.set(name, { x: p.x, y: p.y });
    }
  };
  // Staging (film only): the game draws a walker level, so one facing up or down a slope has its
  // uphill hooves in the ground (f3.md). The film pitches its cast to the drawn ground along the way
  // each faces (st.pitch, which the drawing adds to the pose; ground walkers never set it), front and
  // back hooves a third of a body length either side, eased a little so tile edges don't flick it.
  const tilt = (r, ground) => {
    for (const a of Object.values(cast)) {
      const st = r.actors.pose.get(a.id); if (!st) continue;
      const L = (st.foot || .5) * .32, c = Math.cos(st.yaw), s = Math.sin(st.yaw);
      const want = Math.atan2(ground(a.x + c * L, a.y - s * L) - ground(a.x - c * L, a.y + s * L), 2 * L);
      st.pitch = st.pitch == null ? want : st.pitch + (want - st.pitch) * .5;
    }
  };
  return { cast, stage, tilt };
}

// ------------------------------------------------------------------ one layer
async function filmLayer(name) {
  const L = LAYERS.find(l => l.name === name);
  if (!L) throw Error('Unknown layer ' + name);
  const shot = SHOTS.find(s => s.n === L.shot), camShot = L.cameraOf != null ? SHOTS.find(s => s.n === L.cameraOf) : shot;
  let g, r, stage = () => {}, tilt = () => {}, camera, simulate = null, cast = {}, box;
  if (L.game === 'start') {
    g = startGame();
    r = renderer(g);
    mapAt(r, 60, -4, 1.2, Math.PI / 4);
    box = { x0: 38, x1: 90, z0: -16, z1: 30 };
  } else {
    g = restoredFarm();
    r = renderer(g); r.setWorld(g);
    box = { x0: 36, x1: 80, z0: -4, z1: 40 };
  }
  settle(r, g);
  const ground = meshGround(r);
  if (name === 'start') {
    // The first visit's start view, exactly (Renderer.resetView), with the farm's own animals living
    simulate = film => { let days = film * ANIMAL_SPEEDS[1]; while (days > 0) { const d = Math.min(days, .05); g.wildlife.update(d); g.visitors.update(d); days -= d; } };
    g.wildlife.lifePace = SPEEDS[1] / ANIMAL_SPEEDS[1];
  } else {
    ({ cast, stage, tilt } = castOf(g, L.game));
    if (L.game === 'restored') {
      // the rest of the restored farm's wildlife lives (the staged elk are placed again after each step)
      g.wildlife.lifePace = SPEEDS[1] / ANIMAL_SPEEDS[1];
      simulate = film => { let days = film * ANIMAL_SPEEDS[1]; while (days > 0) { const d = Math.min(days, .05); g.wildlife.update(d); g.visitors.update(d); days -= d; } };
    }
  }
  g.speed = 1; // (the walker drawing strides only while the game runs)
  if (camShot.camera.map) {
    const end = r.startView;
    camera = f => { const v = name === 'start' ? end : planMap(camShot, f / FPS, end); mapAt(r, v.x, v.y, v.zoom, v.az); };
  } else {
    camera = f => {
      // (the renderer's smooth ground for the camera's heights: the drawn mesh's triangles give a
      // smoothed look tiny kinks, and a point on a triangle's edge can fall back to another ground)
      const c = cameraAt(camShot, f / FPS, (x, y) => r.heightAtScene(x, y));
      eyeAt(r, { x: c.pos[0], y: c.pos[2], z: c.pos[1] }, { x: c.look[0], y: c.look[2], z: c.look[1] }, c.fov);
    };
  }
  const tod = TIME_OF_DAY[name];
  const first = Math.round(L.from * FPS), lastFrame = Math.min(SECONDS * FPS - 1, Math.round(L.to * FPS) - 1);
  const begin = Math.max(0, first - WARM);
  // the restored farm's wildlife lives from its first layer's start, so each finds it where the last left it
  if (simulate) {
    const from = L.game === 'restored' ? Math.max(0, Math.round(LAYERS.find(l => l.game === 'restored').from * FPS) - WARM) : begin;
    for (let f = from; f < begin; f++) simulate(rateAt(f / FPS) / FPS);
  }
  stage(begin); camera(begin);
  settle(r, g);
  let clock = 1e6;
  // One frame staged and drawn. Frames must come in order. Frames before `first` (the warm-up) and
  // those skipped by a rough cut (every third) are staged and posed, not drawn.
  let at = begin;
  function advance(f) {
    for (; at <= f; at++) {
      const t = at / FPS, rate = rateAt(t);
      if (at > begin && simulate) simulate(rate / FPS);
      stage(at); tilt(r, ground); camera(at);
      r.todClock = lerp(tod[0], tod[1], Math.max(0, (t - L.from) / (L.to - L.from))) * DAY_CYCLE;
      clock += 1000 / FPS * rate; r.diagnosticTime = clock;
      const dt = at > begin ? rate / FPS : 0;
      if (at < f) { const draw = r.gl.render; r.gl.render = () => {}; r.draw(g, ui, dt); r.gl.render = draw; continue; } // (posed, not drawn)
      r.draw(g, ui, dt);
    }
  }
  async function frame(f) {
    advance(f); r.gl.getContext().finish();
    return jpeg(compose(r), .93);
  }
  // The probe (intro-film-probe.mjs): the frame staged and posed by the game's drawing, nothing drawn
  // on the GPU, and the camera, animals and sight lines read back
  let reader = null;
  function probe(f) {
    if (!reader) { r.gl.render = () => {}; reader = makeProbe(r, g, cast, box); }
    advance(f);
    return reader(f / FPS);
  }
  const info = () => ({
    target: { x: r.target.x, y: r.target.y, z: r.target.z }, zoom: r.zoom, az: r.az, eye: r.eyeOn ? { pos: r.eye.pos.toArray(), look: r.eye.look.toArray() } : null,
    timeOfDay: r.todClock / DAY_CYCLE, width: r.gl.domElement.width, height: r.gl.domElement.height, ppu: r.ppu,
  });
  return { first, last: lastFrame, frame, probe, info, game: g, renderer: r };
}

const ui = { clean: true, overlay: 'none' };
function settle(r, g) {
  let clock = 0;
  for (let n = 0; n < 240 && (n < 8 || r.floraPending || r.flora.waitingRegions?.size); n++) { clock += 500; r.diagnosticTime = clock; r.draw(g, ui, 0); }
}
// The page backdrop past the map's edge, as photo mode paints it (Renderer.capture)
function compose(r) {
  const c = r.gl.domElement, W = c.width, H = c.height;
  const out = compose.canvas ||= new OffscreenCanvas(W, H), ctx = out.getContext('2d');
  const bg = ctx.createRadialGradient(W / 2, H * .35, 0, W / 2, H * .35, Math.hypot(W, H) * .6);
  bg.addColorStop(0, '#56715a'); bg.addColorStop(.55, '#34493a'); bg.addColorStop(1, '#1f2c24');
  ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H); ctx.drawImage(c, 0, 0);
  return out;
}
async function jpeg(canvas, quality, width = canvas.width) {
  let source = canvas;
  if (width !== canvas.width) { source = new OffscreenCanvas(width, Math.round(canvas.height * width / canvas.width)); source.getContext('2d').drawImage(canvas, 0, 0, source.width, source.height); }
  return new Uint8Array(await (await source.convertToBlob({ type: 'image/jpeg', quality })).arrayBuffer());
}
function base64(b) { let s = ''; for (let i = 0; i < b.length; i += 32768) s += String.fromCharCode(...b.subarray(i, i + 32768)); return btoa(s); }

// ------------------------------------------------------------------ assembly
// Every frame of the film from the layers' JPEGs (/dist/intro-film/frames/<layer>/<frame>.jpg),
// scaled to width × height; the sound mixed from the recordings; both encoded and muxed.
// A rough cut (film-intro.mjs --rough): every `step`th frame from its own folder, MP4 only, no sound.
// Either way a contact sheet: a frame each whole second in one row, thumbWidth wide each (the
// review page, tools/film-review.html, shows it under the player).
async function assemble({ width, height, mp4Bitrate, webmBitrate, audioBitrate = 96000, frames = SECONDS * FPS, samples = [], step = 1, dir = '/dist/intro-film/frames/', sound = true, webm: withWebm = true, thumbWidth = 160 }) {
  const fps = FPS / step;
  const sheet = new OffscreenCanvas(thumbWidth * SECONDS, Math.round(thumbWidth * height / width)), sheetCtx = sheet.getContext('2d');
  const canvas = new OffscreenCanvas(width, height), ctx = canvas.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  const load = async (layer, f) => {
    const res = await fetch(`${dir}${layer}/${String(f).padStart(4, '0')}.jpg`);
    if (!res.ok) throw Error(`Missing frame ${layer} ${f}: film that layer first`);
    return createImageBitmap(await res.blob());
  };
  const chunks = { mp4: [], webm: [] }; let description = null, failed = null;
  const encoder = (key, config) => {
    const e = new VideoEncoder({ output: (chunk, meta) => {
      const data = new Uint8Array(chunk.byteLength); chunk.copyTo(data);
      chunks[key].push({ data, timestamp: chunk.timestamp, key: chunk.type === 'key' });
      if (key === 'mp4' && meta?.decoderConfig?.description) description = new Uint8Array(ArrayBuffer.isView(meta.decoderConfig.description) ? meta.decoderConfig.description.buffer : meta.decoderConfig.description);
    }, error: e => { failed = e; } });
    e.configure({ width, height, framerate: fps, bitrateMode: 'variable', latencyMode: 'quality', ...config }); return e;
  };
  const big = width * height > 921600;
  const codecs = { mp4: big ? 'avc1.640028' : 'avc1.64001f', webm: big ? 'vp09.00.40.08' : 'vp09.00.31.08' };
  const mp4 = encoder('mp4', { codec: codecs.mp4, bitrate: mp4Bitrate, avc: { format: 'avc' } });
  // (VP9 in variable mode overshot a low target by half again and more: constant holds it)
  const webm = withWebm ? encoder('webm', { codec: codecs.webm, bitrate: webmBitrate, bitrateMode: 'constant' }) : null;
  const encoders = [mp4, webm].filter(Boolean);
  const sampled = {};
  for (let f = 0; f < frames; f += step) {
    if (failed) throw failed;
    const t = f / FPS;
    ctx.globalAlpha = 1; ctx.fillStyle = '#000'; ctx.fillRect(0, 0, width, height);
    for (const L of LAYERS) {
      if (t < L.from || t >= L.to) continue;
      const a = L.fade ? smooth(L.from, L.from + L.fade, t + .5 / FPS) : 1;
      if (a <= 0) continue;
      const img = await load(L.name, f);
      ctx.globalAlpha = a; ctx.drawImage(img, 0, 0, width, height); img.close();
    }
    ctx.globalAlpha = 1;
    const frame = new VideoFrame(canvas, { timestamp: Math.round(f / step * 1e6 / fps), duration: Math.round(1e6 / fps) });
    for (const e of encoders) e.encode(frame, { keyFrame: f % (2 * FPS) === 0 });
    frame.close();
    if (samples.includes(f)) sampled[f] = base64(await jpeg(canvas, .9));
    if (f % FPS === 0) sheetCtx.drawImage(canvas, f / FPS * thumbWidth, 0, thumbWidth, sheet.height);
    while (encoders.some(e => e.encodeQueueSize > 3)) await new Promise(done => setTimeout(done, 5));
  }
  for (const e of encoders) { await e.flush(); e.close(); }
  if (failed) throw failed;
  const files = { contact: await jpeg(sheet, .8) };
  let audio = null;
  if (sound) {
    const mix = await mixSound();
    const aac = await encodeAudio(mix, 'mp4a.40.2', audioBitrate), opus = await encodeAudio(mix, 'opus', audioBitrate);
    files.mp4 = muxMp4({ width, height, fps, description, chunks: chunks.mp4, audio: { ...aac, frame: 1024, bitrate: audioBitrate } });
    if (webm) files.webm = muxWebm({ width, height, fps, chunks: chunks.webm, audio: { ...opus, frame: 960 } });
    audio = { aacPackets: aac.chunks.length, opusPackets: opus.chunks.length, peak: mix.peak };
  } else {
    files.mp4 = muxMp4({ width, height, fps, description, chunks: chunks.mp4 });
    if (webm) files.webm = muxWebm({ width, height, fps, chunks: chunks.webm });
  }
  window.introFilm.files = files;
  return { width, height, fps, codecs, sizes: Object.fromEntries(Object.entries(files).map(([k, v]) => [k, v.length])), audio, samples: sampled };
}

// The mix: each recording decoded, placed and faded on the film's clock (SOUND), summed, and held
// under full scale by a gentle compressor.
async function mixSound() {
  const rate = 48000, ctx = new OfflineAudioContext(2, rate * SECONDS, rate);
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -14; comp.ratio.value = 3; comp.attack.value = .01; comp.release.value = .3;
  const master = ctx.createGain(); master.gain.value = .9;
  comp.connect(master); master.connect(ctx.destination);
  for (const s of SOUND) {
    const res = await fetch(`/assets/sounds/${s.file}.m4a`);
    if (!res.ok) { if (s.optional) continue; throw Error('Missing recording ' + s.file); }
    const buffer = await ctx.decodeAudioData(await res.arrayBuffer());
    const src = ctx.createBufferSource(); src.buffer = buffer; src.loop = !!s.loop;
    const gain = ctx.createGain();
    if (s.ramp) { gain.gain.setValueAtTime(s.ramp[0][1], s.ramp[0][0]); for (const [t, v] of s.ramp.slice(1)) gain.gain.linearRampToValueAtTime(v, t); }
    else gain.gain.value = s.gain;
    src.connect(gain); gain.connect(comp); src.start(s.at);
  }
  const out = await ctx.startRendering();
  let peak = 0; for (let c = 0; c < 2; c++) for (const v of out.getChannelData(c)) peak = Math.max(peak, Math.abs(v));
  out.peak = +peak.toFixed(3);
  return out;
}
async function encodeAudio(buffer, codec, bitrate) {
  const chunks = []; let description = null, failed = null;
  const enc = new AudioEncoder({ output: (chunk, meta) => {
    const data = new Uint8Array(chunk.byteLength); chunk.copyTo(data); chunks.push({ data, timestamp: chunk.timestamp });
    if (meta?.decoderConfig?.description) description = new Uint8Array(ArrayBuffer.isView(meta.decoderConfig.description) ? meta.decoderConfig.description.buffer.slice(0) : meta.decoderConfig.description);
  }, error: e => { failed = e; } });
  const sampleRate = buffer.sampleRate, channels = buffer.numberOfChannels;
  enc.configure({ codec, sampleRate, numberOfChannels: channels, bitrate });
  const step = 4800;
  for (let at = 0; at < buffer.length; at += step) {
    const n = Math.min(step, buffer.length - at), planar = new Float32Array(n * channels);
    for (let c = 0; c < channels; c++) planar.set(buffer.getChannelData(c).subarray(at, at + n), c * n);
    enc.encode(new AudioData({ format: 'f32-planar', sampleRate, numberOfFrames: n, numberOfChannels: channels, timestamp: Math.round(at * 1e6 / sampleRate), data: planar }));
  }
  await enc.flush(); enc.close();
  if (failed) throw failed;
  // (Opus in WebM needs an OpusHead; Chrome's encoder may not hand one over: the standard 19 bytes)
  if (codec === 'opus' && !description) {
    description = new Uint8Array(19); const v = new DataView(description.buffer);
    description.set([79, 112, 117, 115, 72, 101, 97, 100]); v.setUint8(8, 1); v.setUint8(9, channels); v.setUint16(10, 312, true); v.setUint32(12, sampleRate, true);
  }
  if (!description) throw Error('The ' + codec + ' encoder gave no description');
  return { sampleRate, channels, description, chunks };
}

try {
  if (params.get('assemble')) {
    window.introFilm = { ready: true, assemble, slice: (name, start, length) => base64(window.introFilm.files[name].subarray(start, start + length)) };
  } else {
    const layer = await filmLayer(params.get('layer'));
    window.introFilm = { ready: true, layer: params.get('layer'), first: layer.first, last: layer.last, paths: window.introFilm.paths || null, beats: BEATS,
      frame: async f => base64(await layer.frame(f)), info: layer.info, game: layer.game, renderer: layer.renderer,
      probe: (from, to) => { const out = []; for (let f = from; f <= to; f++) out.push(layer.probe(f)); return out; } };
  }
} catch (error) { window.introFilm = { ready: true, error: error.stack || String(error) }; throw error; }
