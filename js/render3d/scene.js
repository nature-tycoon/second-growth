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
import { Flora } from './flora.js';
import { Actors } from './actors.js';
import { building } from './geometry.js';
import { hash2 } from '../rng.js';

const EL = THREE.MathUtils.degToRad(34);
const BASE_PPU = 46; // screen pixels per scene unit at zoom 1


export class Renderer {
  constructor(canvas, { preserveDrawingBuffer = false } = {}) {
    this.canvas = canvas;
    this.dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
    this.gl = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance', preserveDrawingBuffer });
    this.gl.setPixelRatio(this.dpr);
    this.gl.shadowMap.enabled = true;
    this.gl.shadowMap.type = THREE.PCFSoftShadowMap;
    this.gl.outputColorSpace = THREE.SRGBColorSpace;
    this.gl.toneMapping = THREE.NeutralToneMapping;
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
    this.structMat = withClouds(withSnowTops(withFocusFade(new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true })), 1.1));
    this.structs = new Map();
    this.time = 0;
    this.lastDay = -1; this.lastFlora = 0; this.editDirty = false;
    this._fade = false;
    // 2D overlay
    this.ui = document.createElement('canvas');
    this.ui.id = 'fx';
    document.body.insertBefore(this.ui, canvas.nextSibling);
    this.ux = this.ui.getContext('2d');
    this.particles = []; this.weatherParticles = [];
    this.ambience = new Ambience();
    this.lightTarget = { sun: new THREE.Color(), sky: new THREE.Color(), ground: new THREE.Color() };
    this.v3 = new THREE.Vector3();
    this.resize();
  }

  // Graphics preferences from the settings menu.
  applySettings(s) {
    this.sun.castShadow = !!s.shadows;
    const cap = { high: 2, balanced: 1.5, fast: 1 }[s.quality] ?? 2;
    this.dpr = Math.max(1, Math.min(cap, window.devicePixelRatio || 1));
    this.gl.setPixelRatio(this.dpr);
    this.windOn = !!s.wind;
    this.weatherOn = !!s.weather;
    this.cloudsOn = !!s.weather && s.quality !== 'fast'; // cloud shadows cost a little on every pixel
    this.resize();
  }

  // Dissolve cover between the camera and the selected animal, easing in and out.
  updateFocus(game, dt) {
    const sel = game.selectedAgent, pose = sel && this.actors.pose.get(sel.id);
    const amt = focus.uFocusAmt;
    amt.value += ((pose ? 1 : 0) - amt.value) * Math.min(1, dt * 7);
    if (pose) {
      focus.uFocus.value.set(pose.x, pose.y + pose.h * 0.5, pose.z);
      focus.uFocusR.value = clamp(0.55 + pose.h * 1.6, 0.6, 1.2);
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
    this.sun.position.copy(this.target).add(new THREE.Vector3(-30, 55, 20));
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
  resetView() { this.zoom = 0.62; this.az = this.azTarget = Math.PI / 4; this.centerOn(this.world ? this.world.w * 0.36 : 44, this.world ? this.world.h * 0.42 : 38); }
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
  zoomAt(sx, sy, f) {
    const before = this.groundPoint(sx, sy);
    this.zoom = clamp(this.zoom * f, 0.16, 4.5);
    this.updateCamera();
    const after = this.groundPoint(sx, sy);
    this.target.x += before.x - after.x; this.target.z += before.z - after.z;
    this.clampCam(); this.updateCamera();
  }
  rotate(dir) { this.azTarget += dir * Math.PI / 2; }

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
  // Where a screen point lands on the terrain, in tile coordinates.
  screenToTile(sx, sy) {
    const { o, d } = this.ray(sx, sy);
    let t = 0, prev = 0;
    for (; t < 90; t += 0.12) {
      const x = o.x + d.x * t, y = o.y + d.y * t, z = o.z + d.z * t;
      if (y <= this.heightAtScene(x, z)) break;
      prev = t;
    }
    let a = prev, b = t;
    for (let k = 0; k < 10; k++) {
      const m = (a + b) / 2, x = o.x + d.x * m, y = o.y + d.y * m, z = o.z + d.z * m;
      if (y <= this.heightAtScene(x, z)) b = m; else a = m;
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
        return;
      }
      const m = new THREE.Mesh(building(s.type, s.w, s.h), this.structMat);
      m.position.set(s.x + s.w / 2, w.tileH(s.x, s.y) * LEVEL, s.y + s.h / 2);
      m.castShadow = true; m.receiveShadow = true;
      this.scene.add(m);
      this.structs.set(key, m);
    });
    for (const [key, m] of this.structs) if (!live.has(key)) { this.scene.remove(m); m.geometry.dispose(); this.structs.delete(key); }
  }

  // ------------------------------------------------------------------ frame
  draw(game, ui, dt) {
    this.time += dt;
    if (game.world !== this.world) this.setWorld(game);
    const w = this.world;
    const now = performance.now();

    if (Math.abs(this.azTarget - this.az) > 0.001) {
      this.az += (this.azTarget - this.az) * Math.min(1, dt * 8);
      if (Math.abs(this.azTarget - this.az) < 0.002) this.az = this.azTarget;
      this.updateCamera();
    }
    let surface = false, flora = false;
    if (w.hv !== this.terrain.hv) { this.terrain.updateHeights(); surface = flora = true; }
    if (game.day !== this.lastDay) { this.lastDay = game.day; surface = true; flora = true; this.terrain.buildWater(); this.terrain.buildFlood(); }
    if (this.editDirty && now - this.lastFlora > 120) { surface = flora = true; this.editDirty = false; this.terrain.buildWater(); }
    if (surface) { this.terrain.updateSurface(game); this.syncStructures(); }
    if (flora) this.floraPending = true;
    if (this.floraPending && now - this.lastFlora > (game.speed >= 3 ? 400 : 150)) { this.flora.rebuild(game); this.lastFlora = now; this.floraPending = false; }

    this.updateOverlay(game, ui, now);
    this.updatePreview(ui);

    // light follows the seasons and weather, easing between them instead of snapping; on cloudy
    // days drifting cloud shadows (atmosphere.js) do much of the dimming, patch by patch
    const L = biome.look.light[game.season], wx = game.weather;
    const gloom = wx === 'rain' || wx === 'snow' ? 0.55 : wx === 'cloud' ? 0.88 : 1;
    const cover = wx === 'rain' || wx === 'snow' ? 0.85 : wx === 'cloud' ? 0.62 : 0.2;
    const T = this.lightTarget, first = !this.lightReady, k = first ? 1 : Math.min(1, dt * 0.7);
    T.sun.setHex(L.sun); T.sky.setHex(L.sky); T.ground.setHex(L.ground);
    this.sun.color.lerp(T.sun, k); this.hemi.color.lerp(T.sky, k); this.hemi.groundColor.lerp(T.ground, k);
    this.sun.intensity += (L.sunI * gloom - this.sun.intensity) * k;
    this.hemi.intensity += (L.hemiI * (gloom < 1 ? 1.1 : 1) - this.hemi.intensity) * k;
    this.lightReady = true;
    sky.uCloudT.value = this.time;
    sky.uCloudCover.value += (cover - sky.uCloudCover.value) * (first ? 1 : Math.min(1, dt * 0.25));
    sky.uCloudAmt.value += ((this.cloudsOn === false ? 0 : 0.56) - sky.uCloudAmt.value) * Math.min(1, dt * 2);

    if (this.windOn !== false) this.flora.wind.value = this.time; // otherwise plants hold still
    this.flora.setZoom(this.zoom);
    this.terrain.time.value = this.time;
    const r = this.right();
    this.actors.update(game, r, this.time);
    this.updateFocus(game, dt);
    // snow settles and melts gradually on screen rather than popping in with the daily tick
    const su = snow.uSnow;
    su.value += ((game.snow || 0) - su.value) * Math.min(1, dt * 1.5);
    this.actors.updateFire(game, this.time, dt);
    this.gl.render(this.scene, this.camera);
    this.drawFX(game, ui, dt);
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
      ctx.strokeStyle = 'rgba(255,248,220,0.9)'; ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (let k = 0; k <= 36; k++) {
        const a = k / 36 * Math.PI * 2, x = cx + Math.cos(a) * R, z = cz + Math.sin(a) * R;
        const p = this.project(x, this.heightAtScene(x, z) + 0.06, z);
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
    const wp = this.weatherParticles, kind = game.weather;
    const want = this.weatherOn === false ? 0 : kind === 'rain' ? 240 : kind === 'snow' ? 150 : 0;
    while (wp.length < want) wp.push({ x: Math.random() * this.vw, y: Math.random() * this.vh, s: 0.6 + Math.random() * 0.8 });
    if (wp.length > want) wp.length = want;
    const run = game.speed > 0 ? 1 : 0.15;
    if (kind === 'rain') {
      ctx.fillStyle = 'rgba(50,60,75,0.1)'; ctx.fillRect(0, 0, this.vw, this.vh);
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
