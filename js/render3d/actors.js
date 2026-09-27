// Animals (instanced 3D models, see fauna.js), plus visitors and flames drawn as camera-facing sprites.

import * as THREE from 'three';
import { LEVEL, isWater, T, clamp } from '../config.js';
import { ANIMALS } from '../data/animals.js';
import * as S from '../render/sprites.js';
import { TREE_SHAPES } from './geometry.js';
import { PLANTS } from '../data/plants.js';
import { Fauna, PERSON_LOOKS } from './fauna.js';
import { waterSurfaceY } from './terrain.js';

const PX = 1 / 50; // sprite pixels to scene units
// Animals that float or paddle when they're on open water.
const FLOATERS = new Set(['duck', 'beaver', 'otter', 'frog', 'newt', 'turtle', 'snake']);
const GRAZERS = new Set(['deer', 'rabbit', 'rodent']);
const lerpAngle = (a, b, t) => { let d = (b - a) % (Math.PI * 2); if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2; return a + d * t; };

export class Actors {
  constructor(scene) {
    this.scene = scene;
    this.textures = new Map();
    this.fauna = new Fauna(scene);
    this.pose = new Map();      // agent id -> smoothed heading, gait, wings, and where it was drawn
    this.people = new Map();    // visitor id -> smoothed heading and gait
    this.flames = [];
    this.smoke = [];
    this.shadowGeo = new THREE.CircleGeometry(0.5, 14).rotateX(-Math.PI / 2);
    this.shadowMat = new THREE.MeshBasicMaterial({ color: 0x0a1206, transparent: true, opacity: 0.22, depthWrite: false });
    this.shadows = new THREE.InstancedMesh(this.shadowGeo, this.shadowMat, 600);
    this.shadows.frustumCulled = false;
    this.shadows.renderOrder = 1;
    scene.add(this.shadows);
    this.ring = new THREE.Mesh(new THREE.RingGeometry(0.28, 0.36, 24).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffe68a, transparent: true, opacity: 0.9, depthWrite: false }));
    this.ring.visible = false; this.ring.renderOrder = 6;
    scene.add(this.ring);
    this.m = new THREE.Matrix4();
  }

  tex(canvas) {
    let t = this.textures.get(canvas);
    if (!t) { t = new THREE.CanvasTexture(canvas); t.colorSpace = THREE.SRGBColorSpace; this.textures.set(canvas, t); }
    return t;
  }

  update(game, camRight, time) {
    const w = game.world;
    const seen = new Set();
    let sh = 0;
    const shadow = (x, y, z, r) => {
      if (sh >= 600) return;
      this.m.makeScale(r, 1, r); this.m.setPosition(x, y + 0.012, z);
      this.shadows.setMatrixAt(sh++, this.m);
    };

    // ---- wildlife
    const F = this.fauna, k = Math.min(1, (this.lastT != null ? time - this.lastT : 0.016) * 6);
    this.lastT = time;
    F.begin();
    for (const a of game.wildlife.agents) {
      const def = ANIMALS[a.sp];
      seen.add(a.id);
      let st = this.pose.get(a.id);
      if (!st) { st = { yaw: Math.random() * Math.PI * 2, gait: 0, fly: 0, graze: 0, px: a.x, py: a.y, x: a.x, y: 0, z: a.y, h: 0.2 }; this.pose.set(a.id, st); }
      const xi = Math.floor(a.x), yi = Math.floor(a.y);
      const inside = w.inb(xi, yi);
      const i = inside ? w.idx(xi, yi) : -1;
      const t = inside ? w.terrain[i] : T.RIVER;
      const onWater = isWater(t) && t !== T.MARSH;
      const kind = def.sprite.kind;
      const flying = (def.move === 'fly' && (a.flying || a.alt > 0.05) && kind !== 'duck') || (kind === 'duck' && a.alt > 0.3) || kind === 'bat';
      const ground = w.heightAt(clamp(a.x, -9, w.w + 9), clamp(a.y, -9, w.h + 9)) * LEVEL;
      const ageF = def.mature > 0 ? clamp(0.55 + 0.45 * a.age / (def.mature * 120), 0.55, 1) : 1;
      const sc = PX * 0.62 * (a.juvenile ? 0.5 : 1) * ageF;
      const mo = F.motion(def);
      let y = ground;
      const surf = onWater || def.move === 'swim' ? waterSurfaceY(w, a.x, a.y) : null;
      if (flying) y += 0.7 + a.alt * 1.2;
      else if (def.move === 'swim') y = (surf ?? ground) - 0.05 - mo.sink * sc;
      else if (surf != null && FLOATERS.has(kind)) y = surf - mo.sink * sc;
      else if (def.move === 'fly' && inside && w.tree[i] && w.treeG[i] > 0.5 && kind !== 'duck' && kind !== 'heron') {
        y += (TREE_SHAPES[PLANTS[w.tree[i]].look.type]?.height || 2) * w.treeG[i] * 0.55;
      }
      // face the way it's moving, and blend between standing, walking and flying
      const dx = a.x - st.px, dz = a.y - st.py;
      const moving = a.state !== 'idle' && (dx * dx + dz * dz > 1e-7 || flying);
      if (dx * dx + dz * dz > 1e-6) st.yaw = lerpAngle(st.yaw, Math.atan2(-dz, dx), Math.min(1, k * 1.6));
      st.px = a.x; st.py = a.y;
      st.gait += ((moving ? 1 : 0) - st.gait) * k;
      st.fly += ((flying ? 1 : 0) - st.fly) * k * 1.5;
      const grazing = !moving && GRAZERS.has(kind) && Math.sin(time * 0.35 + a.id * 1.7) > 0.1;
      st.graze += ((grazing ? 1 : 0) - st.graze) * k * 0.5;
      F.add(def, a.x, y, a.y, st.yaw, sc, a.phase * Math.PI, st.gait, st.fly, st.graze);
      st.x = a.x; st.y = y; st.z = a.y; st.h = (def.sprite.h ? def.sprite.h + (def.sprite.leg || 0) : (def.sprite.size || def.sprite.len || 10) * 0.6) * sc;
      if (def.move !== 'swim' && !(surf != null && FLOATERS.has(kind))) shadow(a.x, ground, a.y, (def.sprite.len || def.sprite.size || 10) * PX * 0.4 * ageF * (flying ? 0.7 : 1));
    }
    for (const id of this.pose.keys()) if (!seen.has(id)) this.pose.delete(id);

    // ---- visitors: same instanced 3D style as the wildlife
    const pseen = new Set();
    for (const v of game.visitors.agents) {
      pseen.add(v.id);
      let st = this.people.get(v.id);
      if (!st) { st = { yaw: 0, gait: 0, px: v.x, py: v.y }; this.people.set(v.id, st); }
      const dx = v.x - st.px, dz = v.y - st.py;
      if (dx * dx + dz * dz > 1e-7) st.yaw = lerpAngle(st.yaw, Math.atan2(-dz, dx), Math.min(1, k * 1.6));
      st.px = v.x; st.py = v.y;
      st.gait += ((v.pause > 0 ? 0 : 1) - st.gait) * k;
      const onWet = w.inb(Math.floor(v.x), Math.floor(v.y)) && isWater(w.terrain[w.idx(Math.floor(v.x), Math.floor(v.y))]);
      const gy = w.heightAt(v.x, v.y) * LEVEL + (onWet ? 0.08 : 0); // boardwalks sit above the water
      F.add(PERSON_LOOKS[v.look % PERSON_LOOKS.length], v.x, gy, v.y, st.yaw, PX * 0.6, v.phase * Math.PI, st.gait, 0, 0);
      shadow(v.x, gy, v.y, 0.1);
    }
    F.end();
    for (const id of this.people.keys()) if (!pseen.has(id)) this.people.delete(id);

    this.shadows.count = sh;
    this.shadows.instanceMatrix.needsUpdate = true;

    // ---- selection ring
    const sel = game.selectedAgent;
    if (sel) {
      this.ring.visible = true;
      this.ring.position.set(sel.x, w.heightAt(clamp(sel.x, -9, w.w + 9), clamp(sel.y, -9, w.h + 9)) * LEVEL + 0.03, sel.y);
      const s = 1 + Math.sin(time * 4) * 0.08;
      this.ring.scale.set(s, 1, s);
    } else this.ring.visible = false;
  }

  // Flames on burning tiles, smoke drifting off them.
  updateFire(game, time, dt) {
    const w = game.world;
    const burning = [];
    for (let i = 0; i < w.n; i++) if (w.fire[i]) burning.push(i);
    while (this.flames.length < Math.min(burning.length * 2, 240)) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.tex(S.flameSprite(0)), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
      s.center.set(0.5, 0.05); s.renderOrder = 7;
      this.scene.add(s); this.flames.push(s);
    }
    this.flames.forEach((s, k) => {
      const i = burning[k >> 1];
      if (i == null) { s.visible = false; return; }
      s.visible = true;
      const x = (i % w.w) + 0.3 + (k & 1) * 0.4, z = ((i / w.w) | 0) + 0.35 + (k & 1) * 0.3;
      const f = Math.floor(time * 8 + k) % 3;
      const tex = this.tex(S.flameSprite(f));
      if (s.material.map !== tex) { s.material.map = tex; s.material.needsUpdate = true; }
      const fl = 0.5 + 0.15 * Math.sin(time * 11 + k);
      s.scale.set(0.55, 0.8 * fl + 0.3, 1);
      s.position.set(x, w.heightAt(x, z) * LEVEL, z);
    });
    // smoke puffs
    if (burning.length && this.smoke.length < 120 && Math.random() < 0.7) {
      const i = burning[Math.floor(Math.random() * burning.length)];
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.tex(S.smokeSprite()), transparent: true, depthWrite: false, opacity: 0.8 }));
      const x = (i % w.w) + Math.random(), z = ((i / w.w) | 0) + Math.random();
      s.position.set(x, w.heightAt(x, z) * LEVEL + 0.5, z);
      s.userData.life = 1;
      s.renderOrder = 8;
      this.scene.add(s); this.smoke.push(s);
    }
    for (let k = this.smoke.length - 1; k >= 0; k--) {
      const s = this.smoke[k];
      s.userData.life -= dt * 0.25;
      if (s.userData.life <= 0) { this.scene.remove(s); s.material.dispose(); this.smoke.splice(k, 1); continue; }
      s.position.y += dt * 0.6; s.position.x += dt * 0.25;
      const g = 1.6 - s.userData.life;
      s.scale.set(g, g, 1);
      s.material.opacity = s.userData.life * 0.7;
    }
  }

  clear() {
    this.pose.clear(); this.people.clear(); this.fauna.clear();
  }
}
