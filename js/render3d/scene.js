// The isometric 3D view: an orthographic camera over a lit, shadowed heightmap diorama.
// A transparent 2D canvas on top carries weather, pollinators, sparkles and labels.

import * as THREE from 'three';
import { focus, withFocusFade } from './focus.js';
import { snow, withSnowTops } from './snow.js';
import { sky, withClouds } from './atmosphere.js';
import { Ambience } from './ambience.js';
import { biome } from '../biome.js';
import { BORDER, LEVEL, T, H, HABITAT_INFO, isWater, clamp } from '../config.js';
import { ANIMALS } from '../data/animals.js';
import { Terrain, buildAtlas } from './terrain.js';
import { Flora, windGust } from './flora.js';
import { Actors, salmonLeap } from './actors.js';
import { SeaSurface } from './sea.js';
import { building, diveBoat, JETTY_BOAT } from './geometry.js';
import { hash2 } from '../rng.js';
import { Border } from '../world.js';
import { updateHydrology, updateEnvironment } from '../sim/environment.js';

const EL = THREE.MathUtils.degToRad(34);

// Each map's colour grade, folded into the tone-mapping step every material already runs (so it
// costs no extra render pass): gain and lift per channel, saturation, and a gentle contrast curve.
function installGrade(grade = {}) {
  const v = a => `vec3(${a.map(x => x.toFixed(4)).join(', ')})`;
  const g = { gain: [1, 1, 1], lift: [0, 0, 0], sat: 1, contrast: 1, ...grade };
  const code = `vec3 CustomToneMapping( vec3 color ) {
    color = NeutralToneMapping( color );
    color = color * ${v(g.gain)} + ${v(g.lift)};
    float l = dot( color, vec3( 0.2126, 0.7152, 0.0722 ) );
    color = mix( vec3( l ), color, ${g.sat.toFixed(4)} );
    color = 0.2 * pow( max( color, vec3( 0.0 ) ) / 0.2, vec3( ${g.contrast.toFixed(4)} ) );
    return saturate( color );
  }`;
  THREE.ShaderChunk.tonemapping_pars_fragment = THREE.ShaderChunk.tonemapping_pars_fragment.replace(/vec3 CustomToneMapping\( vec3 color \) \{[\s\S]*$/, code);
}

// Time of day, on its own slow clock (real minutes, not game days): a long day, a warm golden
// hour with long shadows, a brief moonlit night (about 10 seconds at normal speed), and a rosy dawn back into day. It never gets
// properly dark, so the land stays readable. Each key: [position in the cycle, sun strength,
// sun colour, how much of it, sky colour, how much of it, sun elevation in degrees, sweep].
const DAY_CYCLE = 360;
const NIGHT_PACE = [1.5, 1.5, 2.6, 4]; // how much faster the dark hours pass, at each game speed (paused, normal, fast, fastest)
const TOD = [
  [0.0, 0.66, 0xffb89a, 0.5, 0xf0c8c0, 0.16, 12, -0.9],    // dawn
  [0.05, 0.9, 0xffe0b8, 0.25, 0xf4e4d4, 0.08, 30, -0.6],
  [0.12, 1, 0xffffff, 0, 0xffffff, 0, 52, -0.25],           // day
  [0.7, 1, 0xffffff, 0, 0xffffff, 0, 54, 0.3],
  [0.79, 0.95, 0xffb870, 0.45, 0xffdcb0, 0.14, 20, 0.75],  // golden hour
  [0.855, 0.74, 0xffa870, 0.4, 0xe8c4b8, 0.18, 9, 0.95],   // sunset (warm, not muddy)
  [0.895, 0.4, 0x7a8ae8, 0.7, 0x7a8ad8, 0.42, 6, 1.0],     // night (moonlit)
  [0.935, 0.42, 0x94a0f0, 0.55, 0xa0a0e0, 0.36, 7, -1.0],  // before dawn
  [1.0, 0.66, 0xffb89a, 0.5, 0xf0c8c0, 0.16, 12, -0.9],
];
const todCol = [new THREE.Color(), new THREE.Color(), new THREE.Color(), new THREE.Color()];
function timeOfDay(u) {
  let k = 0;
  while (k < TOD.length - 2 && TOD[k + 1][0] <= u) k++;
  const a = TOD[k], b = TOD[k + 1], t = (u - a[0]) / (b[0] - a[0]), s = t * t * (3 - 2 * t);
  const L = (i) => a[i] + (b[i] - a[i]) * s;
  todCol[0].setHex(a[2]).lerp(todCol[1].setHex(b[2]), s);
  todCol[2].setHex(a[4]).lerp(todCol[3].setHex(b[4]), s);
  return { sun: L(1), sunCol: todCol[0], sunAmt: L(3), skyCol: todCol[2], skyAmt: L(5), el: L(6), sweep: L(7) };
}
const BASE_PPU = 46; // screen pixels per scene unit at zoom 1
// a phone or tablet (no mouse)
const TOUCH = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches && !matchMedia('(pointer: fine)').matches;


export class Renderer {
  constructor(canvas, { preserveDrawingBuffer = false } = {}) {
    this.canvas = canvas;
    this.dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
    this.gl = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance', preserveDrawingBuffer });
    this.gl.setPixelRatio(this.dpr);
    this.gl.shadowMap.enabled = true;
    this.gl.shadowMap.type = THREE.PCFSoftShadowMap;
    this.gl.outputColorSpace = THREE.SRGBColorSpace;
    installGrade(biome.look.grade);
    this.gl.toneMapping = THREE.CustomToneMapping;
    this.gl.toneMappingExposure = 1.0;
    this.scene = new THREE.Scene();
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, -300, 300);
    this.target = new THREE.Vector3(40, 1, 32);
    this.az = Math.PI / 4; this.azTarget = this.az;
    this.zoom = 1;
    this.hemi = new THREE.HemisphereLight(0xe4eeff, 0x5f6e3c, 1.25);
    this.sun = new THREE.DirectionalLight(0xfff3dc, 2.5);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.bias = -0.0006;
    this.sun.shadow.normalBias = 0.03;
    this.scene.add(this.hemi, this.sun, this.sun.target);
    this.atlas = buildAtlas();
    this.terrain = new Terrain(this.scene, this.atlas);
    this.flora = new Flora(this.scene);
    this.actors = new Actors(this.scene);
    this.seaSurface = new SeaSurface(this.scene);
    this.structMat = withClouds(withSnowTops(withFocusFade(new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true })), 1.1));
    this.structs = new Map();
    this.time = 0;
    this.lastDay = -1; this.lastFlora = 0; this.editDirty = false;
    this._fade = false;
    // 2D overlay
    this.ui = document.createElement('canvas');
    this.ui.id = 'fx';
    this.ui.className = 'ph-no-capture'; // never filmed by session replays (it redraws every frame)
    document.body.insertBefore(this.ui, canvas.nextSibling);
    this.ux = this.ui.getContext('2d');
    this.particles = []; this.weatherParticles = [];
    this.ambience = new Ambience();
    this.lightTarget = { sun: new THREE.Color(), sky: new THREE.Color(), ground: new THREE.Color() };
    this.todClock = DAY_CYCLE * 0.45; // start in the afternoon, so the first evening comes after a couple of minutes
    this.v3 = new THREE.Vector3();
    this.resize();
  }

  // Graphics preferences from the settings menu.
  applySettings(s) {
    const fast = s.quality === 'fast';
    // (every setting comes through here, the volume sliders included: only a change to the
    // detail or shadows starts the automatic resolution over)
    const gfx = `${s.quality}|${s.shadows}`, fresh = gfx !== this.gfx;
    this.gfx = gfx;
    if (fresh) { this.sun.castShadow = !!s.shadows; this.shadowsDropped = false; }
    // Fast: a smaller shadow map (it's redrawn every frame)
    const shadowRes = fast ? 1024 : 2048;
    if (this.sun.shadow.mapSize.x !== shadowRes) {
      this.sun.shadow.mapSize.set(shadowRes, shadowRes);
      if (this.sun.shadow.map) { this.sun.shadow.map.dispose(); this.sun.shadow.map = null; }
    }
    const cap = { high: 2, balanced: 1.5, fast: 1 }[s.quality] ?? 2;
    this.baseDpr = Math.max(1, Math.min(cap, window.devicePixelRatio || 1));
    // phones and tablets adjust the resolution to keep up (see autoResolution); it starts afresh
    // whenever the settings change
    this.autoRes = TOUCH;
    if (fresh) { this.resScale = 1; this.resWin = null; this.roomFor = 0; }
    this.dpr = this.baseDpr * this.resScale;
    this.gl.setPixelRatio(this.dpr);
    this.windOn = !!s.wind;
    this.dayCycleOn = s.dayCycle !== false;
    this.weatherOn = !!s.weather;
    this.cloudsOn = !!s.weather && !fast; // cloud shadows cost a little on every pixel
    this.light = fast;
    this.terrain.setFast(fast);
    if (this.flora.setLight(fast)) this.floraPending = true;
    this.resize();
  }

  // Phones vary enormously, so on touch screens the view sets its own resolution: it steps down
  // while the frame rate is low and creeps back up once there's room again, never above the
  // setting. As a last resort it turns shadows off for the rest of the session. Frames are
  // counted against the clock (a struggling phone often delivers them in bursts, so the gaps
  // between single frames don't tell you much).
  autoResolution() {
    if (!this.autoRes) return;
    const now = performance.now(), A = this.resWin;
    // a long gap means the game was in the background: start counting afresh
    if (!A || now - A.last > 3000) { this.resWin = { t0: now, last: now, n: 0 }; return; }
    A.n++; A.last = now;
    const span = (now - A.t0) / 1000;
    if (span < 2) return;
    const fps = A.n / span;
    this.resWin = { t0: now, last: now, n: 0 };
    const min = Math.min(1, 0.55 / this.baseDpr);
    let sc = this.resScale;
    if (fps < 26) { sc = Math.max(min, sc * 0.82); this.roomFor = 0; }
    else if (fps > 50) { this.roomFor += span; if (this.roomFor >= 6) { sc = Math.min(1, sc * 1.12); this.roomFor = 0; } }
    else this.roomFor = 0;
    if (Math.abs(sc - this.resScale) > 0.005) {
      this.resScale = sc; this.dpr = this.baseDpr * sc;
      this.gl.setPixelRatio(this.dpr); this.resize();
    } else if (fps < 20 && sc <= min + 0.005 && this.sun.castShadow) {
      this.sun.castShadow = false; this.shadowsDropped = true;
    }
  }

  // Dissolve cover between the camera and the selected animal, easing in and out.
  updateFocus(game, dt) {
    const sel = game.selectedAgent, pose = sel && this.actors.pose.get(sel.id), ft = !pose && this.focusTile;
    const amt = focus.uFocusAmt;
    amt.value += ((pose || ft ? 1 : 0) - amt.value) * Math.min(1, dt * 7);
    if (pose) {
      focus.uFocus.value.set(pose.x, pose.y + pose.h * 0.5, pose.z);
      focus.uFocusR.value = clamp(0.55 + pose.h * 1.6, 0.6, 1.2);
    } else if (ft) { // (a spot on the ground, not an animal: a moment about a plant)
      focus.uFocus.value.set(ft.x, this.world.heightAt(ft.x, ft.y) * LEVEL + 0.35, ft.y);
      focus.uFocusR.value = 1.3;
    }
    this.camera.getWorldDirection(focus.uViewDir.value).negate();
  }

  get fadeTrees() { return this._fade; }
  set fadeTrees(v) { this._fade = v; this.flora.setFade(v); }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.vw = w; this.vh = h;
    this.gl.setSize(w, h, false);
    this.canvas.style.width = w + 'px'; this.canvas.style.height = h + 'px';
    this.ui.width = Math.floor(w * this.dpr); this.ui.height = Math.floor(h * this.dpr);
    this.ui.style.width = w + 'px'; this.ui.style.height = h + 'px';
    this.ambience?.resize(w, h);
    this.updateCamera();
  }

  // ------------------------------------------------------------------ camera
  get ppu() { return BASE_PPU * this.zoom; }
  viewDir() { return new THREE.Vector3(Math.sin(this.az) * Math.cos(EL), Math.sin(EL), Math.cos(this.az) * Math.cos(EL)); }
  right() { return new THREE.Vector3(Math.cos(this.az), 0, -Math.sin(this.az)); }
  forward() { return new THREE.Vector3(-Math.sin(this.az), 0, -Math.cos(this.az)); }

  updateCamera() {
    const c = this.camera, hw = this.vw / 2 / this.ppu, hh = this.vh / 2 / this.ppu;
    c.left = -hw; c.right = hw; c.top = hh; c.bottom = -hh;
    c.position.copy(this.target).addScaledVector(this.viewDir(), 120);
    c.up.set(0, 1, 0);
    c.lookAt(this.target);
    c.updateProjectionMatrix();
    c.updateMatrixWorld();
    // keep the shadow map fitted to what's on screen
    const s = Math.max(hw, hh) * 1.35 + 3;
    const sc = this.sun.shadow.camera;
    sc.left = -s; sc.right = s; sc.top = s; sc.bottom = -s; sc.near = 1; sc.far = 160;
    sc.updateProjectionMatrix();
    this.sun.position.copy(this.target).add(this.sunOffset || new THREE.Vector3(-30, 55, 20));
    this.sun.target.position.copy(this.target);
    this.sun.target.updateMatrixWorld();
  }

  clampCam() {
    if (!this.world) return;
    const w = this.world;
    this.target.x = clamp(this.target.x, -BORDER + 4, w.w + BORDER - 4);
    this.target.z = clamp(this.target.z, -BORDER + 4, w.h + BORDER - 4);
    this.target.y = w.heightAt(clamp(this.target.x, 0, w.w), clamp(this.target.z, 0, w.h)) * LEVEL;
  }
  centerOn(tx, ty) { this.target.x = tx; this.target.z = ty; this.clampCam(); this.updateCamera(); }
  resetView() {
    const v = biome.startView;
    this.zoom = v?.zoom ?? 0.62; this.az = this.azTarget = v?.az ?? Math.PI / 4;
    this.centerOn(v ? v.x : this.world ? this.world.w * 0.36 : 44, v ? v.y : this.world ? this.world.h * 0.42 : 38);
  }
  panBy(dx, dy) {
    const u = 1 / this.ppu;
    this.target.addScaledVector(this.right(), -dx * u);
    this.target.addScaledVector(this.forward(), dy * u / Math.sin(EL));
    this.clampCam(); this.updateCamera();
  }
  groundPoint(sx, sy) {
    const r = this.ray(sx, sy);
    const t = (this.target.y - r.o.y) / r.d.y;
    return r.o.clone().addScaledVector(r.d, t);
  }
  // smooth: glide there over a few frames (mouse wheel); otherwise jump (pinch, keys)
  zoomAt(sx, sy, f, smooth = false) {
    if (smooth) {
      const from = this.zoomGoal != null && this.zoomSet === this.zoom ? this.zoomGoal : this.zoom;
      this.zoomGoal = clamp(from * f, 0.16, 4.5); this.zoomAnchor = [sx, sy]; this.zoomSet = this.zoom;
      return;
    }
    this.zoomGoal = null;
    const before = this.groundPoint(sx, sy);
    this.zoom = clamp(this.zoom * f, 0.16, 4.5);
    this.updateCamera();
    const after = this.groundPoint(sx, sy);
    this.target.x += before.x - after.x; this.target.z += before.z - after.z;
    this.clampCam(); this.updateCamera();
  }
  rotate(dir) { this.azTarget += dir * Math.PI / 2; }
  // Glide the camera to a spot and zoom (for keystone moments), easing in and out.
  flyTo(x, y, zoom, dur = 2.2) {
    this.zoomGoal = null;
    this.fly = { x0: this.target.x, z0: this.target.z, x1: x, z1: y, zoom0: this.zoom, zoom1: clamp(zoom, 0.16, 4.5), t: 0, dur };
  }

  // Ray from a screen point into the scene.
  ray(sx, sy) {
    const nx = (sx / this.vw) * 2 - 1, ny = -(sy / this.vh) * 2 + 1;
    const c = this.camera;
    const camUp = new THREE.Vector3(0, 1, 0).applyQuaternion(c.quaternion);
    const camRight = new THREE.Vector3(1, 0, 0).applyQuaternion(c.quaternion);
    const d = this.viewDir();
    const o = this.target.clone().addScaledVector(camRight, nx * c.right).addScaledVector(camUp, ny * c.top).addScaledVector(d, 40);
    return { o, d: d.clone().negate() };
  }
  heightAtScene(x, z) {
    const w = this.world;
    return w.heightAt(clamp(x, -BORDER, w.w + BORDER - 0.001), clamp(z, -BORDER, w.h + BORDER - 0.001)) * LEVEL;
  }
  // the sea surface's height on an underwater map (null elsewhere)
  get seaY() { return biome.look.underwater ? biome.look.underwater.level * LEVEL : null; }
  // Where a screen point lands on the terrain, in tile coordinates. floor: a level the ray stops
  // at even over lower ground (the sea surface, for buoys that float on it).
  screenToTile(sx, sy, floor = null) {
    const { o, d } = this.ray(sx, sy);
    const hit = (x, z) => (floor == null ? this.heightAtScene(x, z) : Math.max(floor, this.heightAtScene(x, z)));
    let t = 0, prev = 0;
    for (; t < 90; t += 0.12) {
      const x = o.x + d.x * t, y = o.y + d.y * t, z = o.z + d.z * t;
      if (y <= hit(x, z)) break;
      prev = t;
    }
    let a = prev, b = t;
    for (let k = 0; k < 10; k++) {
      const m = (a + b) / 2, x = o.x + d.x * m, y = o.y + d.y * m, z = o.z + d.z * m;
      if (y <= hit(x, z)) b = m; else a = m;
    }
    const fx = o.x + d.x * b, fy = o.z + d.z * b;
    return { x: Math.floor(fx), y: Math.floor(fy), fx, fy };
  }
  project(x, y, z) {
    this.v3.set(x, y, z).project(this.camera);
    return { x: (this.v3.x + 1) / 2 * this.vw, y: (1 - this.v3.y) / 2 * this.vh };
  }
  pickAgent(game, sx, sy, radius = 26) {
    let best = null, bd = radius * radius;
    const all = [...game.wildlife.agents];
    for (const a of all) {
      const s = this.actors.pose.get(a.id);
      if (!s) continue;
      const p = this.project(s.x, s.y + s.h * 0.5, s.z);
      const d = (p.x - sx) ** 2 + (p.y - sy) ** 2;
      if (d < bd) { bd = d; best = a; }
    }
    return best;
  }
  // The four corners of the view on the ground, for the minimap.
  viewportPolygon() {
    return [[0, 0], [this.vw, 0], [this.vw, this.vh], [0, this.vh]].map(([x, y]) => { const p = this.groundPoint(x, y); return [p.x, p.z]; });
  }
  markTileDirty() { this.editDirty = true; }

  // ------------------------------------------------------------------ world sync
  setWorld(game) {
    this.world = game.world;
    this.terrain.setWorld(game.world, game.border);
    this.seaSurface.setWorld(game.world);
    for (const m of this.structs.values()) this.scene.remove(m);
    this.structs.clear();
    this.actors.clear();
    this.lastDay = -1;
    this.overlayMode = null;
    this.clampCam(); this.updateCamera();
  }

  syncStructures() {
    const w = this.world;
    const live = new Set();
    w.structures.forEach((s, k) => {
      if (!s) return;
      const key = `${k}:${s.type}`;
      live.add(key);
      if (this.structs.has(key)) {
        const m = this.structs.get(key);
        m.position.y = w.tileH(s.x, s.y) * LEVEL;
        if (m.userData.boat) m.userData.boat.userData.y0 = this.seaY - m.position.y;
        return;
      }
      const look = biome.look.structures?.[s.type] || s.type;
      const m = new THREE.Mesh(building(look, s.w, s.h), this.structMat); // (a map can draw a building its own way: the reef's boat landing is a jetty)
      m.position.set(s.x + s.w / 2, w.tileH(s.x, s.y) * LEVEL, s.y + s.h / 2);
      if (s.turn) m.rotation.y = Math.PI; // (a building that faces north, onto the street behind it)
      m.castShadow = true; m.receiveShadow = true;
      if (look === 'jetty' && this.seaY != null) {
        // the dive boat tied up alongside, floating on the sea (it rides the swell: see rockBoats)
        const rise = m.position.y - this.seaY;
        this.boatMat ||= withClouds(withFocusFade(new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide })));
        const boat = new THREE.Mesh(diveBoat(rise + 0.24), this.boatMat);
        boat.position.set(JETTY_BOAT.x, -rise, JETTY_BOAT.z);
        boat.castShadow = true; boat.receiveShadow = true;
        m.add(boat); m.userData.boat = boat;
      }
      this.scene.add(m);
      this.structs.set(key, m);
    });
    for (const [key, m] of this.structs) if (!live.has(key)) { this.scene.remove(m); m.geometry.dispose(); m.userData.boat?.geometry.dispose(); this.structs.delete(key); }
  }
  // The dive boat rides the swell at its mooring: a slow bob, a little roll and pitch.
  rockBoats() {
    const t = this.time;
    for (const m of this.structs.values()) {
      const b = m.userData.boat;
      if (!b) continue;
      b.userData.y0 ??= b.position.y;
      b.position.y = b.userData.y0 + Math.sin(t * 0.9) * 0.012 + Math.sin(t * 1.7 + 1) * 0.005;
      b.rotation.z = Math.sin(t * 0.75 + 0.5) * 0.028;
      b.rotation.x = Math.sin(t * 0.55) * 0.012;
    }
  }

  // jump the clock to a point in the day (0 = dawn, 0.9 = night)
  setTimeOfDay(u) { this.todClock = u * DAY_CYCLE; }

  // ------------------------------------------------------------------ frame
  draw(game, ui, dt) {
    this.time += dt;
    if (dt > 0) this.autoResolution();
    const swapped = game.world !== this.world; // (a new world, or then-and-now's day-one farm: paint it all this frame)
    if (swapped) this.setWorld(game);
    const w = this.world;
    const now = performance.now();

    if (Math.abs(this.azTarget - this.az) > 0.001) {
      this.az += (this.azTarget - this.az) * Math.min(1, dt * 8);
      if (Math.abs(this.azTarget - this.az) < 0.002) this.az = this.azTarget;
      this.updateCamera();
    }
    if (this.fly) {
      const f = this.fly; f.t += dt;
      const u = Math.min(1, f.t / f.dur), e = u * u * (3 - 2 * u);
      this.target.x = f.x0 + (f.x1 - f.x0) * e; this.target.z = f.z0 + (f.z1 - f.z0) * e;
      this.zoom = Math.exp(Math.log(f.zoom0) + (Math.log(f.zoom1) - Math.log(f.zoom0)) * e);
      this.clampCam(); this.updateCamera();
      if (u >= 1) this.fly = null;
    }
    // an eased wheel zoom glides toward its goal, holding the point under the cursor still
    if (this.zoomGoal != null) {
      if (this.zoomSet !== this.zoom) this.zoomGoal = null; // something else set the zoom directly
      else {
        const nz = Math.abs(this.zoomGoal - this.zoom) < 0.002 ? this.zoomGoal : this.zoom + (this.zoomGoal - this.zoom) * Math.min(1, dt * 12);
        const [sx, sy] = this.zoomAnchor, goal = this.zoomGoal;
        this.zoomAt(sx, sy, nz / this.zoom);
        this.zoomGoal = nz === goal ? null : goal; this.zoomSet = this.zoom;
      }
    }
    let surface = false, flora = false;
    if (w.hv !== this.terrain.hv) { this.terrain.updateHeights(); surface = flora = true; }
    this.frameN = (this.frameN || 0) + 1;
    if (game.day !== this.lastDay) { this.lastDay = game.day; this.dayDirty = this.frameN; flora = true; this.terrain.refreshWater(); this.terrain.refreshFlood(); }
    // A new day repaints the ground and rebuilds the plants. They wait a frame or two so they don't
    // land in the same frame as the day's simulation and each other (a visible hitch), and at fast
    // speeds the ground repaints at most four times a second.
    // (on the Fast setting the ground and plants catch up at a gentler pace, since each rebuild
    // is a noticeable pause on a phone)
    const light = this.light;
    if (this.dayDirty && (swapped || (this.frameN > this.dayDirty && now - (this.lastSurface || 0) > (light ? (game.speed >= 2 ? 1200 : 600) : game.speed >= 2 ? 250 : 0)))) { surface = true; this.dayDirty = 0; }
    if (this.editDirty && now - this.lastFlora > (light ? 260 : 120)) { surface = flora = true; this.editDirty = false; this.terrain.refreshWater(); }
    if (surface) { this.terrain.updateSurface(game); this.syncStructures(); this.lastSurface = now; }
    if (flora) this.floraPending = true;
    if (this.floraPending && (swapped || (!surface && this.frameN > (this.dayDirty || 0))) && now - this.lastFlora > (light ? (game.speed >= 2 ? 1200 : 400) : game.speed >= 3 ? 400 : 150)) { this.flora.rebuild(game); this.lastFlora = now; this.floraPending = false; }

    this.updateOverlay(game, ui, now);
    this.updatePreview(ui);

    // light follows the seasons and weather, easing between them instead of snapping; on cloudy
    // days drifting cloud shadows (atmosphere.js) do much of the dimming, patch by patch
    const L = biome.look.light[game.season], wx = game.weather;
    // overcast, not murky: rain dims the sun but the soft sky light fills in the shadows
    const gloom = wx === 'rain' ? 0.86 : wx === 'snow' ? 0.8 : wx === 'cloud' ? 0.95 : 1;
    // clear weather is mostly truly cloudless; now and then (a few days at a time) a scatter of
    // fair-weather clouds drifts over instead
    const fair = wx === 'clear' && hash2(Math.floor(game.day / 5), 101, 17) < 0.3;
    const cover = wx === 'rain' || wx === 'snow' ? 0.68 : wx === 'cloud' ? 0.55 : fair ? 0.16 : 0;
    const T = this.lightTarget, first = !this.lightReady, k = first ? 1 : Math.min(1, dt * 0.7);
    T.sun.setHex(L.sun); T.sky.setHex(L.sky); T.ground.setHex(L.ground);
    // time of day warms and dims the light and swings the sun round (shadows lengthen at dusk)
    // The clock runs faster through the dark hours, and faster still at the faster game speeds:
    // at normal speed the full night is about 10 seconds, long enough for the fireflies and eye-shine;
    // at the top speed a season goes by in a few minutes, so the night is over in a few seconds
    // rather than hiding the land while it changes. (It eases in at dusk and out at dawn.)
    {
      const u = (this.todClock / DAY_CYCLE) % 1, sm = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
      const dark = u > 0.5 ? sm(0.8, 0.87, u) : 1 - sm(0, 0.05, u);
      const fast = NIGHT_PACE[game.speed] ?? NIGHT_PACE[1];
      this.todClock = (this.todClock + dt * (1 + (fast - 1) * dark)) % DAY_CYCLE;
    }
    const todU = this.dayCycleOn === false ? 0.35 : this.todClock / DAY_CYCLE;
    const tod = timeOfDay(todU);
    this.tod = tod; this.todU = todU;
    // how "night" it is: the blue dusk through to just before dawn (for fireflies, eye-shine, owls)
    const ss = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
    this.night = ss(0.872, 0.893, todU) * (1 - ss(0.93, 0.95, todU)); // full night (see NIGHT_PACE for how long it lasts)
    this.dawn = todU > 0.97 || todU < 0.1 ? 1 - Math.min(1, Math.abs(((todU + 0.03) % 1) - 0.03) / 0.07) : 0;
    T.sun.lerp(tod.sunCol, tod.sunAmt); T.sky.lerp(tod.skyCol, tod.skyAmt);
    this.sun.color.lerp(T.sun, k); this.hemi.color.lerp(T.sky, k); this.hemi.groundColor.lerp(T.ground, k);
    this.sun.intensity += (L.sunI * gloom * tod.sun - this.sun.intensity) * k;
    this.hemi.intensity += (L.hemiI * (gloom < 1 ? 1.22 : 1) * (0.72 + 0.28 * tod.sun) - this.hemi.intensity) * k;
    {
      const el = THREE.MathUtils.degToRad(tod.el), az = Math.atan2(20, -30) + tod.sweep * 1.1;
      const d = 62, off = this.sunOffset || (this.sunOffset = new THREE.Vector3());
      off.set(Math.cos(el) * Math.cos(az) * d, Math.sin(el) * d, Math.cos(el) * Math.sin(az) * d);
      this.sun.position.copy(this.target).add(off);
    }
    this.lightReady = true;
    sky.uCloudT.value = this.time;
    sky.uCloudCover.value += (cover - sky.uCloudCover.value) * (first ? 1 : Math.min(1, dt * 0.25));
    // no shadows on a cloudless day, and they melt away as you zoom in close
    const closeUp = clamp((2.1 - this.zoom) / 0.8, 0, 1);
    const amt = this.cloudsOn === false || (cover === 0 && sky.uCloudCover.value < 0.08) ? 0 : 0.44 * closeUp;
    sky.uCloudAmt.value += (amt - sky.uCloudAmt.value) * Math.min(1, dt * 1.5);

    if (this.windOn !== false) this.flora.wind.value = this.time; // otherwise plants hold still
    const gustTo = wx === 'rain' ? 1.5 : wx === 'snow' ? 1.2 : wx === 'cloud' ? 1.0 : 0.65;
    windGust.value += (gustTo - windGust.value) * Math.min(1, dt * 0.4);
    this.flora.setZoom(this.zoom);
    this.terrain.time.value = this.time;
    // rain rings on the water, and the ground darkening while it's wet and drying after
    const raining = game.weather === 'rain' && this.weatherOn !== false;
    this.terrain.rain.value += ((raining ? 1 : 0) - this.terrain.rain.value) * Math.min(1, dt * 1.5);
    this.terrain.tiles.wet.value += ((raining ? 1 : 0) - this.terrain.tiles.wet.value) * Math.min(1, dt * (raining ? 0.4 : 0.3)); // dries within a few seconds
    this.terrain.sky.value.copy(this.hemi.color);
    const r = this.right();
    this.actors.update(game, r, this.time);
    this.rockBoats();
    this.updateFocus(game, dt);
    // snow settles and melts gradually on screen rather than popping in with the daily tick
    const su = snow.uSnow;
    su.value += ((game.snow || 0) - su.value) * Math.min(1, dt * 1.5);
    this.actors.updateFire(game, this.time, dt);
    this.seaSurface.update(this.time, this.sun, this.hemi, this.viewDir(), game);
    this.gl.render(this.scene, this.camera);
    this.drawFX(game, ui, dt);
  }

  // A picture of the view for photo mode: the 3D scene and the effects layer, with a soft vignette.
  capture(game, ui, vignette = true) {
    this.draw(game, ui, 0); // render now, so the drawing buffer is still full when we copy it
    const W = this.gl.domElement.width, H = this.gl.domElement.height;
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const ctx = c.getContext('2d');
    ctx.drawImage(this.gl.domElement, 0, 0); ctx.drawImage(this.ui, 0, 0, W, H);
    if (!vignette) return c;
    const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.hypot(W, H) * 0.56);
    g.addColorStop(0, 'rgba(20,24,16,0)'); g.addColorStop(1, 'rgba(20,24,16,0.42)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    return c;
  }

  // Then and now: the same view of the farm as it is, and as it was on day one. The starting farm
  // isn't stored anywhere: it's regenerated from the game's seed (the map generator is
  // deterministic), drawn for one frame in the same season and light, and then the present is put
  // back. Animals and visitors are left out of the "then" picture.
  thenAndNow(game, ui) {
    const now = this.capture(game, ui, false);
    const keep = { world: game.world, border: game.border, agents: game.wildlife.agents, people: game.visitors.agents, sel: game.selectedAgent, fx: this.trailFx, pose: new Map(this.actors.pose) };
    const w0 = biome.generate(game.seed);
    game.world = w0; game.border = new Border(w0, biome.borderCell);
    game.wildlife.agents = []; game.visitors.agents = []; game.selectedAgent = null; this.trailFx = [];
    try {
      w0.hydroDirty = true; updateHydrology(w0); updateEnvironment(w0, game.month, 0);
      this.lastFlora = 0; this.floraPending = true;
      return { then: this.capture(game, ui, false), now };
    } finally {
      game.world = keep.world; game.border = keep.border; game.wildlife.agents = keep.agents; game.visitors.agents = keep.people; game.selectedAgent = keep.sel; this.trailFx = keep.fx;
      this.lastFlora = 0; this.floraPending = true;
      this.draw(game, ui, 0);
      for (const [k, v] of keep.pose) this.actors.pose.set(k, v); // animals keep facing the way they were
    }
  }

  // ------------------------------------------------------------------ tile overlays
  updateOverlay(game, ui, now) {
    const mode = ui.overlay || 'none';
    if (mode === 'none') { if (this.overlayMode !== 'none') this.terrain.setOverlay(null); this.overlayMode = 'none'; return; }
    if (mode === this.overlayMode && ui.overlaySpecies === this.overlaySpecies && now - this.overlayAt < 800) return;
    this.overlayMode = mode; this.overlaySpecies = ui.overlaySpecies; this.overlayAt = now;
    const w = game.world, out = new Float32Array(w.n * 4);
    const suit = mode === 'species' && ui.overlaySpecies != null ? game.wildlife.suit[ui.overlaySpecies] : null;
    let hmin = Infinity, hmax = -Infinity;
    if (mode === 'elevation') for (let i = 0; i < w.n; i++) { const h = w.tileH(i % w.w, (i / w.w) | 0); hmin = Math.min(hmin, h); hmax = Math.max(hmax, h); }
    const risk = mode === 'flood' ? game.events.floodRisk() : null;
    for (let i = 0; i < w.n; i++) {
      let c = null;
      if (mode === 'habitat') c = [...hexRgb(HABITAT_INFO[w.habitat[i]].color), 0.72];
      else if (mode === 'moisture') c = ramp(w.moist[i], [[0, '#d9b36a'], [0.5, '#8fc07a'], [1, '#2f6fa8']], 0.66);
      else if (mode === 'soil') c = ramp(w.soil[i], [[0, '#c8b89a'], [0.4, '#8a6a3a'], [0.8, '#3a2614']], 0.7);
      else if (mode === 'light') c = ramp(1 - w.canopy[i], [[0, '#1c2a3a'], [0.5, '#6a8a6a'], [1, '#f2e08a']], 0.62);
      else if (mode === 'elevation') c = ramp((w.tileH(i % w.w, (i / w.w) | 0) - hmin) / Math.max(0.01, hmax - hmin), [[0, '#2f6a5a'], [0.5, '#c8c07a'], [1, '#f4f0e8']], 0.62);
      else if (risk) c = w.flood[i] ? [0.12, 0.42, 0.95, 0.85] : risk[i] === 2 ? [0.2, 0.5, 0.85, 0.62] : risk[i] === 1 ? [0.55, 0.78, 0.95, 0.5] : [0, 0, 0, 0];
      else if (mode === 'disturb') c = w.disturb[i] < 0.02 ? [0, 0, 0, 0] : ramp(w.disturb[i], [[0, '#f2e08a'], [0.5, '#e0843a'], [1, '#b8302a']], 0.7);
      else if (mode === 'fish') c = isWater(w.terrain[i]) ? (w.connected[i] ? ramp(w.waterQ[i], [[0, '#d88a4a'], [0.5, '#e8d86a'], [1, '#5ad0a0']], 0.85) : [0.78, 0.24, 0.2, 0.8]) : [0, 0, 0, 0];
      else if (suit) c = suit[i] < 0.02 ? [0.16, 0.12, 0.12, 0.4] : ramp(suit[i], [[0, '#c8584a'], [0.4, '#e8c85a'], [1, '#4ac86a']], 0.65);
      if (c) out.set(c, i * 4);
    }
    this.terrain.setOverlay(out);
  }

  updatePreview(ui) {
    const list = ui.hover && ui.previewTiles ? ui.previewTiles : null;
    const key = list ? list.map(p => p.i + p.color).join() : '';
    if (key === this.previewKey) return;
    this.previewKey = key;
    this.terrain.setPreview(list ? list.map(p => ({ i: p.i, rgba: parseRgba(p.color) })) : null);
  }

  // ------------------------------------------------------------------ 2D effects layer
  drawFX(game, ui, dt) {
    const ctx = this.ux, w = this.world;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.vw, this.vh);
    const vp = this.viewportPolygon();
    const xs = vp.map(p => p[0]), zs = vp.map(p => p[1]);
    const bx0 = Math.max(-BORDER, Math.floor(Math.min(...xs)) - 2), bx1 = Math.min(w.w + BORDER - 1, Math.ceil(Math.max(...xs)) + 2);
    const bz0 = Math.max(-BORDER, Math.floor(Math.min(...zs)) - 2), bz1 = Math.min(w.h + BORDER - 1, Math.ceil(Math.max(...zs)) + 2);

    // sparkles on open water
    if (this.zoom > 0.55) {
      ctx.lineCap = 'round'; ctx.lineWidth = 1.2;
      for (let z = bz0; z <= bz1; z++) for (let x = bx0; x <= bx1; x++) {
        const t = this.terrain.terrainAt(x, z);
        if (t !== T.POND && t !== T.CREEK && t !== T.RIVER) continue;
        const h = hash2(x, z, 99);
        const a = 0.5 + 0.5 * Math.sin(this.time * (1.2 + h) + h * 20);
        if (a < 0.55) continue;
        const px = x + 0.2 + h * 0.6, pz = z + 0.2 + hash2(x, z, 98) * 0.6;
        const p = this.project(px, w.heightAt(clamp(px, -BORDER, w.w + BORDER - 0.01), clamp(pz, -BORDER, w.h + BORDER - 0.01)) * LEVEL + 0.04, pz);
        ctx.strokeStyle = `rgba(235,248,248,${(a - 0.55) * 1.2})`;
        ctx.beginPath(); ctx.moveTo(p.x - 3 * this.zoom, p.y); ctx.lineTo(p.x + 3 * this.zoom, p.y); ctx.stroke();
      }
    }

    this.ambience.drawWorld(ctx, this, game, dt, bx0, bx1, bz0, bz1);
    this.drawTrails(ctx, game, dt);
    this.drawNight(ctx, game, dt, bx0, bx1, bz0, bz1);

    // bees and butterflies over flowers
    const ps = this.particles;
    if (this.zoom > 0.5 && ps.length < 60) {
      for (let k = 0; k < 4; k++) {
        const x = bx0 + Math.floor(Math.random() * (bx1 - bx0 + 1)), z = bz0 + Math.floor(Math.random() * (bz1 - bz0 + 1));
        if (!w.inb(x, z)) continue;
        const n = w.nectar[w.idx(x, z)];
        if (n > 0.25 && Math.random() < n * 0.5) {
          const kind = Math.random() < 0.35 ? 'butterfly' : 'bee';
          ps.push({ kind, x: x + Math.random(), z: z + Math.random(), hx: x + 0.5, hz: z + 0.5, vx: 0, vz: 0, life: 6 + Math.random() * 8, t: Math.random() * 10,
            col: kind === 'butterfly' ? ['#f2c230', '#f4f0e0', '#e8883a', '#8ab0e8'][Math.floor(Math.random() * 4)] : '#e0b02a' });
        }
      }
    }
    for (let k = ps.length - 1; k >= 0; k--) {
      const p = ps[k];
      p.life -= dt; p.t += dt;
      if (p.life <= 0 || this.zoom <= 0.5) { ps.splice(k, 1); continue; }
      const sp = p.kind === 'bee' ? 1.2 : 0.55;
      p.vx += ((p.hx - p.x) * 0.6 + (Math.random() - 0.5) * 7) * dt;
      p.vz += ((p.hz - p.z) * 0.6 + (Math.random() - 0.5) * 7) * dt;
      const v = Math.hypot(p.vx, p.vz); if (v > sp) { p.vx *= sp / v; p.vz *= sp / v; }
      p.x += p.vx * dt; p.z += p.vz * dt;
      const s = this.project(p.x, w.heightAt(clamp(p.x, 0, w.w - 0.01), clamp(p.z, 0, w.h - 0.01)) * LEVEL + 0.3, p.z);
      const z = this.zoom;
      ctx.globalAlpha = Math.min(1, p.life);
      if (p.kind === 'bee') {
        ctx.fillStyle = '#2a2014'; ctx.beginPath(); ctx.ellipse(s.x, s.y, 1.8 * z, 1.2 * z, 0, 0, 7); ctx.fill();
        ctx.fillStyle = p.col; ctx.beginPath(); ctx.ellipse(s.x + 0.4, s.y, 1 * z, 1.1 * z, 0, 0, 7); ctx.fill();
      } else {
        const f = Math.abs(Math.sin(p.t * 14));
        ctx.fillStyle = p.col;
        ctx.beginPath(); ctx.ellipse(s.x - 1.6 * f * z, s.y, (1.9 * f + 0.3) * z, 1.6 * z, 0, 0, 7); ctx.fill();
        ctx.beginPath(); ctx.ellipse(s.x + 1.6 * f * z, s.y, (1.9 * f + 0.3) * z, 1.6 * z, 0, 0, 7); ctx.fill();
      }
    }
    ctx.globalAlpha = 1;

    // brush ring
    if (ui.hover && ui.previewTiles) {
      const cx = ui.hover.x + 0.5, cz = ui.hover.y + 0.5, R = ui.brushR + 0.5;
      const floor = biome.buoyTrails && ui.tool === 'trail' ? this.seaY : null; // (buoys: the ring floats on the surface where they'll go)
      ctx.strokeStyle = 'rgba(255,248,220,0.9)'; ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (let k = 0; k <= 36; k++) {
        const a = k / 36 * Math.PI * 2, x = cx + Math.cos(a) * R, z = cz + Math.sin(a) * R;
        const p = this.project(x, Math.max(floor ?? -1e9, this.heightAtScene(x, z)) + 0.06, z);
        k ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y);
      }
      ctx.stroke();
    }

    // label for the selected animal
    const sel = game.selectedAgent;
    if (sel) {
      const s = this.actors.pose.get(sel.id);
      if (s) {
        const p = this.project(s.x, s.y + s.h + 0.08, s.z);
        const label = ANIMALS[sel.sp].name;
        ctx.font = '700 12px Nunito, sans-serif';
        const tw = ctx.measureText(label).width + 12;
        ctx.fillStyle = 'rgba(30,40,28,0.85)'; ctx.beginPath(); ctx.roundRect(p.x - tw / 2, p.y - 24, tw, 18, 6); ctx.fill();
        ctx.fillStyle = '#fff6dc'; ctx.textAlign = 'center'; ctx.fillText(label, p.x, p.y - 11); ctx.textAlign = 'left';
      }
    }

    // season tint and weather
    const tint = biome.look.tint[game.season];
    ctx.fillStyle = tint; ctx.fillRect(0, 0, this.vw, this.vh);
    if (biome.savanna && game.month >= 3 && game.month <= 7) {
      const gr = ctx.createLinearGradient(0, 0, 0, this.vh * 0.4);
      gr.addColorStop(0, 'rgba(236,216,180,0.05)'); gr.addColorStop(1, 'rgba(236,216,180,0)');
      ctx.fillStyle = gr; ctx.fillRect(0, 0, this.vw, this.vh);
    }
    // golden hour and dusk wash the whole view in their light, strongest toward the sky
    const tod = this.tod;
    if (tod && tod.sunAmt > 0.04) {
      const c = tod.sunCol, rgb = `${Math.round(c.r * 255)},${Math.round(c.g * 255)},${Math.round(c.b * 255)}`;
      const gr = ctx.createLinearGradient(0, 0, 0, this.vh);
      gr.addColorStop(0, `rgba(${rgb},${(tod.sunAmt * 0.08).toFixed(3)})`); gr.addColorStop(1, `rgba(${rgb},${(tod.sunAmt * 0.015).toFixed(3)})`);
      ctx.fillStyle = gr; ctx.fillRect(0, 0, this.vw, this.vh);
    }
    const wp = this.weatherParticles, kind = game.weather;
    const want = this.weatherOn === false ? 0 : (kind === 'rain' ? 240 : kind === 'snow' ? 150 : 0) * (this.light ? 0.5 : 1);
    while (wp.length < want) wp.push({ x: Math.random() * this.vw, y: Math.random() * this.vh, s: 0.6 + Math.random() * 0.8 });
    if (wp.length > want) wp.length = want;
    const run = game.speed > 0 ? 1 : 0.15;
    if (kind === 'rain') {
      ctx.fillStyle = 'rgba(50,60,75,0.045)'; ctx.fillRect(0, 0, this.vw, this.vh);
      ctx.strokeStyle = 'rgba(210,225,240,0.45)'; ctx.lineWidth = 1; ctx.beginPath();
      for (const p of wp) {
        p.x += -120 * dt * p.s * run; p.y += 700 * dt * p.s * run;
        if (p.y > this.vh) { p.y -= this.vh + 20; p.x = Math.random() * (this.vw + 100); }
        if (p.x < -10) p.x += this.vw + 20;
        ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - 3 * p.s, p.y + 14 * p.s);
      }
      ctx.stroke();
    } else if (kind === 'snow') {
      ctx.fillStyle = 'rgba(250,252,255,0.85)';
      for (const p of wp) {
        p.x += Math.sin(this.time + p.s * 10) * 20 * dt; p.y += 50 * dt * p.s * run;
        if (p.y > this.vh) { p.y -= this.vh + 10; p.x = Math.random() * this.vw; }
        ctx.beginPath(); ctx.arc(p.x, p.y, 1.4 * p.s, 0, Math.PI * 2); ctx.fill();
      }
    } else if (kind === 'cloud') { ctx.fillStyle = 'rgba(60,70,80,0.04)'; ctx.fillRect(0, 0, this.vw, this.vh); }
    this.ambience.drawSky(ctx, this, game, dt);
  }
}

// Little signs of life on the ground and water, drawn in 2D over the scene: dust kicked up
// behind hoofed animals on dry ground, a wake behind anything swimming, and rings spreading
// where an animal drinks or a heron strikes.
const DRY = new Set([T.PASTURE, T.FIELD, T.SOIL, T.GRAVEL, T.ROAD, T.TRAIL]);
Renderer.prototype.drawTrails = function (ctx, game, dt) {
  const w = this.world, fx = this.trailFx || (this.trailFx = []);
  if (this.zoom > 0.45 && game.speed > 0) for (const a of game.wildlife.agents) {
    const st = this.actors.pose.get(a.id);
    if (!st || a.flying) continue;
    const xi = Math.floor(a.x), yi = Math.floor(a.y);
    if (!w.inb(xi, yi)) continue;
    const i = w.idx(xi, yi), t = w.terrain[i], def = ANIMALS[a.sp];
    const wet = isWater(t);
    if (wet && st.gait > 0.3 && Math.random() < dt * 1.8 * st.gait) fx.push({ k: 'wake', x: a.x, z: a.y, y: st.y, yaw: st.yaw, life: 1.3, max: 1.3, s: Math.max(0.5, (def.sprite.len || def.sprite.size || 10) / 38) });
    else if (!wet && def.move === 'ground' && (def.sprite.len || 0) >= 20 && st.gait > 0.5 && (DRY.has(t) || biome.savanna && game.season > 0) && !(w.ground[i] && w.groundG[i] > 0.7 && !biome.savanna)
      && Math.random() < dt * 1.4 * st.gait) fx.push({ k: 'dust', x: a.x - Math.cos(st.yaw) * 0.25, z: a.y + Math.sin(st.yaw) * 0.25, y: st.y, life: 1.6, max: 1.6, s: (def.sprite.len || 20) / 36 });
    // a leaping salmon throws up a splash where it leaves the water and where it lands
    if (def.special === 'salmon' && wet) {
      const jp = salmonLeap(a, this.time);
      if ((jp >= 0) !== !!a.leaping) {
        a.leaping = jp >= 0;
        const ahead = a.leaping ? 0 : 0.45, sx = a.x + Math.cos(st.yaw) * ahead, sz = a.y - Math.sin(st.yaw) * ahead;
        fx.push({ k: 'ring', x: sx, z: sz, y: st.y, life: 1.2, max: 1.2, s: 0.8 });
        for (let d = 0; d < 6; d++) fx.push({ k: 'drop', x: sx, z: sz, y: st.y, vx: (Math.random() - 0.5) * 1.2, vz: (Math.random() - 0.5) * 1.2, vy: 1.2 + Math.random() * 1.2, life: 0.6, max: 0.6 });
      }
    }
    if (a.drinkT > 0 && !a.rippled && (wet || w.distWater[i] <= 1)) { a.rippled = true; fx.push({ k: 'ring', x: a.x + Math.cos(st.yaw) * 0.3, z: a.y - Math.sin(st.yaw) * 0.3, y: st.y, life: 1.8, max: 1.8, s: 1 }); }
    if (!(a.drinkT > 0)) a.rippled = false;
  }
  if (fx.length > 400) fx.splice(0, fx.length - 400);
  const z = this.zoom;
  for (let k = fx.length - 1; k >= 0; k--) {
    const p = fx[k];
    p.life -= dt;
    if (p.life <= 0) { fx.splice(k, 1); continue; }
    if (p.k === 'drop') {
      p.x += p.vx * dt; p.z += p.vz * dt; p.vy -= 6 * dt; p.y += p.vy * dt * 0.35;
      const d = this.project(p.x, p.y, p.z);
      ctx.fillStyle = `rgba(240,248,248,${(0.85 * p.life / p.max).toFixed(3)})`;
      ctx.beginPath(); ctx.arc(d.x, d.y, 1.3 * Math.max(1, z), 0, 7); ctx.fill();
      continue;
    }
    const f = 1 - p.life / p.max, sp = this.project(p.x, p.y + (p.k === 'dust' ? 0.05 + f * 0.25 : 0.02), p.z);
    if (p.k === 'dust') {
      ctx.fillStyle = `rgba(206,184,146,${(0.18 * (1 - f)).toFixed(3)})`;
      ctx.beginPath(); ctx.ellipse(sp.x, sp.y, (5 + f * 16) * z * p.s, (3 + f * 9) * z * p.s, 0, 0, 7); ctx.fill();
    } else {
      ctx.strokeStyle = `rgba(236,246,244,${((p.k === 'ring' ? 0.28 : 0.24) * (1 - f)).toFixed(3)})`; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.ellipse(sp.x, sp.y, (3 + f * (p.k === 'ring' ? 16 : 11)) * z * p.s, (1.6 + f * (p.k === 'ring' ? 8 : 5.5)) * z * p.s, 0, 0, 7); ctx.stroke();
    }
  }
};

// Night-time glimpses, in the blue dusk and before dawn: fireflies drifting and blinking over
// meadows and marshes (Hollis in summer, the Amazon all year), and eye-shine from the animals
// out on the Serengeti grass.
const FIREFLY_HAB = new Set([H.MEADOW, H.MARSH, H.SHRUB, H.RIPARIAN, H.YOUNG_FOREST]);
Renderer.prototype.drawNight = function (ctx, game, dt, bx0, bx1, bz0, bz1) {
  const n = this.night || 0, w = this.world, flies = this.flies || (this.flies = []);
  // deepen the dusk a little so the small lights read
  if (n > 0.02) {
    const g = ctx.createRadialGradient(this.vw / 2, this.vh / 2, Math.min(this.vw, this.vh) * 0.2, this.vw / 2, this.vh / 2, Math.hypot(this.vw, this.vh) * 0.6);
    g.addColorStop(0, `rgba(12,20,44,${(0.24 * n).toFixed(3)})`); g.addColorStop(1, `rgba(8,14,34,${(0.44 * n).toFixed(3)})`);
    ctx.fillStyle = g; ctx.fillRect(0, 0, this.vw, this.vh);
  }
  const flyOn = ((biome.id === 'pnw' || biome.id === 'atlanta') && (game.season === 1 || game.season === 2)) || biome.id === 'amazon' || (biome.id === 'chinandega' && (game.season === 1 || game.season === 2));
  const want = n > 0.05 && flyOn && this.zoom > 0.5 && game.weather !== 'rain' ? Math.round(90 * n * (this.fireflyBoost || 1) * (this.light ? 0.5 : 1)) : 0;
  for (let tries = 0; flies.length < want && tries < 12 * (this.fireflyBoost || 1); tries++) {
    const x = bx0 + Math.floor(Math.random() * (bx1 - bx0 + 1)), z = bz0 + Math.floor(Math.random() * (bz1 - bz0 + 1));
    if (!w.inb(x, z) || !FIREFLY_HAB.has(w.habitat[w.idx(x, z)])) continue;
    flies.push({ x: x + Math.random(), z: z + Math.random(), h: 0.25 + Math.random() * 0.8, ph: Math.random() * 20, vx: 0, vz: 0, life: 8 + Math.random() * 10 });
  }
  if (flies.length > want) flies.splice(0, flies.length - want);
  for (let k = flies.length - 1; k >= 0; k--) {
    const f = flies[k];
    f.life -= dt; if (f.life <= 0) { flies.splice(k, 1); continue; }
    f.vx += (Math.random() - 0.5) * dt * 0.8; f.vz += (Math.random() - 0.5) * dt * 0.8; f.vx *= 0.98; f.vz *= 0.98;
    f.x += f.vx * dt; f.z += f.vz * dt; f.ph += dt;
    const boost = this.fireflyBoost > 1, blink = Math.max(0, Math.sin(f.ph * 1.3)) ** (boost ? 2 : 3); // (a firefly night: more of them lit at once)
    if (blink < 0.03) continue;
    const p = this.project(f.x, this.heightAtScene(f.x, f.z) + f.h, f.z), r = (2.5 + 4.5 * blink) * Math.max(0.8, this.zoom * 0.75) * (boost ? 1.15 : 1);
    const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r * 2.2);
    g.addColorStop(0, `rgba(236,255,150,${(0.95 * blink * n).toFixed(3)})`); g.addColorStop(0.35, `rgba(200,240,90,${(0.4 * blink * n).toFixed(3)})`); g.addColorStop(1, 'rgba(200,240,90,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(p.x, p.y, r * 2.2, 0, 7); ctx.fill();
  }
  // Coral spawning night on the reef: pink and cream bundles of eggs drift up off the living coral
  // to the surface (the night of the spawning each year, and through its keystone moment).
  // (a night lasts many game days, so the spawning shows through the first whole night after it,
  // once a year, rather than only on the spawning day itself)
  const sd = game.flags.spawnDay;
  if (sd != null && sd !== this.spawnSeen && game.day - sd < 40) {
    if (n > 0.05) this.spawnOn = sd;
    else if (this.spawnOn === sd) this.spawnSeen = sd; // that night is over
  }
  const spawnNight = biome.look.underwater && (this.spawnBoost > 0 || (this.spawnOn === sd && sd !== this.spawnSeen));
  const eggs = this.eggs || (this.eggs = []), seaY = this.seaY;
  const wantEggs = spawnNight && n > 0.05 && this.zoom > 0.5 ? Math.round(420 * n * (this.spawnBoost > 0 ? 1.6 : 1) * (this.light ? 0.5 : 1)) : 0;
  for (let tries = 0; eggs.length < wantEggs && tries < 120; tries++) {
    const x = bx0 + Math.floor(Math.random() * (bx1 - bx0 + 1)), z = bz0 + Math.floor(Math.random() * (bz1 - bz0 + 1));
    if (!w.inb(x, z)) continue;
    const i = w.idx(x, z);
    if (!w.tree[i] || w.treeG[i] < 0.4) continue;
    const x0 = x + 0.2 + Math.random() * 0.6, z0 = z + 0.2 + Math.random() * 0.6, y0 = this.heightAtScene(x0, z0) + 0.12 + Math.random() * 0.1;
    eggs.push({ x: x0, z: z0, y: y0, vy: 0.05 + Math.random() * 0.06, ph: Math.random() * 6, life: 9 + Math.random() * 8, c: Math.random() < 0.7 ? [246, 160, 170] : [250, 226, 196] });
  }
  if (eggs.length > wantEggs) eggs.splice(0, eggs.length - wantEggs);
  for (let k = eggs.length - 1; k >= 0; k--) {
    const e = eggs[k];
    e.life -= dt; if (e.life <= 0) { eggs.splice(k, 1); continue; }
    e.ph += dt; e.y = Math.min(seaY - 0.02, e.y + e.vy * dt); e.x += Math.sin(e.ph * 0.7) * 0.02 * dt; e.z += 0.03 * dt;
    const p = this.project(e.x, e.y, e.z), r = Math.max(1.8, this.zoom * 2.2), a = Math.min(1, e.life / 2, (e.y >= seaY - 0.021 ? 0.75 : 1)) * Math.min(1, n * 1.5);
    const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r * 2.4);
    g.addColorStop(0, `rgba(${e.c[0]},${e.c[1]},${e.c[2]},${a.toFixed(3)})`); g.addColorStop(0.4, `rgba(${e.c[0]},${e.c[1]},${e.c[2]},${(a * 0.6).toFixed(3)})`); g.addColorStop(1, `rgba(${e.c[0]},${e.c[1]},${e.c[2]},0)`);
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(p.x, p.y, r * 2.4, 0, 7); ctx.fill();
  }
  // eye-shine: a pair of small lights on the heads of animals looking toward you out on the grass
  if (biome.savanna && n > 0.25 && this.zoom > 0.6) {
    const t = this.time;
    for (const a of game.wildlife.agents) {
      const def = ANIMALS[a.sp];
      if (def.move !== 'ground' || (def.sprite.len || 0) < 20 || hash2(a.id, 3, 9) > 0.55) continue;
      const st = this.actors.pose.get(a.id);
      if (!st || !st.eye || st.graze > 0.3 || st.x < bx0 || st.x > bx1 || st.z < bz0 || st.z > bz1) continue; // not while head-down grazing
      if (Math.sin(t * 0.7 + a.id * 2.3) < -0.2 || (t * 3 + a.id) % 7 < 0.15) continue; // looks away now and then, and blinks
      // each eye where the model has it, with the head dipped and bobbing as the shader moves it
      const [ex0, ey0, ez] = st.eye, [px, py] = st.eyePivot, dip = -st.graze * 0.9;
      const ca = Math.cos(dip), sa = Math.sin(dip), qx = ex0 - px, qy = ey0 - py;
      const ex = px + qx * ca - qy * sa, ey = py + qx * sa + qy * ca + st.bob;
      const c = Math.cos(st.yaw), sn = Math.sin(st.yaw), s = st.sc;
      // only animals facing the camera shine, and only from the eye on the near side of the head
      const cx = this.camera.position.x - st.x, cz = this.camera.position.z - st.z, cl = Math.hypot(cx, cz) || 1;
      const face = (c * cx - sn * cz) / cl, across = (sn * cx + c * cz) / cl;
      if (face < 0.1) continue;
      const col = def.prey ? `rgba(210,255,120,${(0.9 * n).toFixed(3)})` : `rgba(255,236,170,${(0.75 * n).toFixed(3)})`;
      ctx.fillStyle = col;
      for (const side of [-1, 1]) {
        if (side * across < -0.55) continue;
        const lx = ex * s, lz = side * ez * s;
        const p = this.project(st.x + c * lx + sn * lz, st.y + ey * s, st.z - sn * lx + c * lz);
        ctx.beginPath(); ctx.arc(p.x, p.y, Math.min(1.9, 0.7 + this.zoom * 0.3), 0, 7); ctx.fill();
      }
    }
  }
};

function hexRgb(h) { const n = parseInt(h.slice(1), 16); return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]; }
function ramp(v, stops, alpha) {
  v = clamp(v, 0, 1);
  let a = stops[0], b = stops[stops.length - 1];
  for (let k = 0; k < stops.length - 1; k++) if (v >= stops[k][0] && v <= stops[k + 1][0]) { a = stops[k]; b = stops[k + 1]; break; }
  const t = (v - a[0]) / Math.max(1e-6, b[0] - a[0]);
  const A = hexRgb(a[1]), B = hexRgb(b[1]);
  return [A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t, alpha];
}
function parseRgba(s) {
  const m = s.match(/rgba?\(([^)]+)\)/);
  if (!m) return [1, 1, 1, 0.3];
  const p = m[1].split(',').map(Number);
  return [p[0] / 255, p[1] / 255, p[2] / 255, p[3] ?? 1];
}
