// Animals, visitors and flames drawn as camera-facing sprites in the 3D scene.

import * as THREE from 'three';
import { LEVEL, isWater, T, clamp } from '../config.js';
import { ANIMALS } from '../data/animals.js';
import * as S from '../render/sprites.js';
import { TREE_SHAPES } from './geometry.js';
import { PLANTS } from '../data/plants.js';

const PX = 1 / 50; // sprite pixels to scene units

export class Actors {
  constructor(scene) {
    this.scene = scene;
    this.textures = new Map();
    this.sprites = new Map();   // agent id -> sprite
    this.people = new Map();
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

  makeSprite(canvas) {
    const mat = new THREE.SpriteMaterial({ map: this.tex(canvas), alphaTest: 0.35, depthWrite: true });
    const s = new THREE.Sprite(mat);
    s.center.set(S.ANIM_AX / S.ANIM_W, 1 - S.ANIM_AY / S.ANIM_H);
    this.scene.add(s);
    return s;
  }

  // Screen-facing direction from movement, relative to the camera.
  facing(obj, x, z, right) {
    const px = obj.userData.px ?? x, pz = obj.userData.pz ?? z;
    const d = (x - px) * right.x + (z - pz) * right.z;
    if (Math.abs(d) > 0.002) obj.userData.face = d > 0 ? 1 : -1;
    obj.userData.px = x; obj.userData.pz = z;
    return obj.userData.face || 1;
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
    for (const a of game.wildlife.agents) {
      const def = ANIMALS[a.sp];
      let s = this.sprites.get(a.id);
      if (!s) { s = this.makeSprite(S.animalSprite(def, 0, 1, 'stand')); this.sprites.set(a.id, s); }
      seen.add(a.id);
      const xi = Math.floor(a.x), yi = Math.floor(a.y);
      const inside = w.inb(xi, yi);
      const i = inside ? w.idx(xi, yi) : -1;
      const t = inside ? w.terrain[i] : T.RIVER;
      const onWater = isWater(t) && t !== T.MARSH;
      const kind = def.sprite.kind;
      let pose = 'stand';
      const flying = (def.move === 'fly' && (a.flying || a.alt > 0.05) && kind !== 'duck') || (kind === 'duck' && a.alt > 0.3) || kind === 'bat';
      if (flying) pose = 'fly';
      else if (def.move === 'swim' || (onWater && (a.key === 'beaver' || a.key === 'otter'))) pose = 'swim';
      const moving = a.state !== 'idle';
      const frame = pose === 'fly' ? Math.floor(a.phase * 1.5) % 2 : moving ? Math.floor(a.phase) % 2 : 0;
      const ground = w.heightAt(clamp(a.x, -9, w.w + 9), clamp(a.y, -9, w.h + 9)) * LEVEL;
      let y = ground;
      if (pose === 'fly') y += 0.7 + a.alt * 1.2;
      else if (def.move === 'fly' && inside && w.tree[i] && w.treeG[i] > 0.5 && kind !== 'duck' && kind !== 'heron') {
        y += (TREE_SHAPES[PLANTS[w.tree[i]].look.type]?.height || 2) * w.treeG[i] * 0.55;
      }
      if (onWater) y += pose === 'swim' && def.move === 'swim' ? 0.0 : 0.02;
      const face = this.facing(s, a.x, a.y, camRight);
      const img = S.animalSprite(def, frame, face, pose);
      const tex = this.tex(img);
      if (s.material.map !== tex) { s.material.map = tex; s.material.needsUpdate = true; }
      const ageF = def.mature > 0 ? clamp(0.55 + 0.45 * a.age / (def.mature * 120), 0.55, 1) : 1;
      const sc = (a.juvenile ? 0.5 : 1) * ageF * (pose === 'swim' && def.move === 'swim' ? 0.9 : 1.25);
      s.scale.set(S.ANIM_W * PX * sc, S.ANIM_H * PX * sc, 1);
      s.position.set(a.x, y, a.y);
      s.material.opacity = def.move === 'swim' ? 0.8 : 1;
      s.material.transparent = def.move === 'swim';
      s.renderOrder = def.move === 'swim' ? 1 : 0;
      if (pose !== 'swim') shadow(a.x, ground, a.y, (def.sprite.len || def.sprite.size || 10) * PX * 0.9 * ageF);
    }
    for (const [id, s] of this.sprites) if (!seen.has(id)) { this.scene.remove(s); s.material.dispose(); this.sprites.delete(id); }

    // ---- visitors
    const pseen = new Set();
    for (const v of game.visitors.agents) {
      let s = this.people.get(v.id);
      if (!s) { s = this.makeSprite(S.personSprite(v.look, 0, 1)); this.people.set(v.id, s); }
      pseen.add(v.id);
      const face = this.facing(s, v.x, v.y, camRight);
      const frame = v.pause > 0 ? 0 : Math.floor(v.phase) % 2;
      const tex = this.tex(S.personSprite(v.look, frame, face));
      if (s.material.map !== tex) { s.material.map = tex; s.material.needsUpdate = true; }
      const gy = w.heightAt(v.x, v.y) * LEVEL + (w.inb(Math.floor(v.x), Math.floor(v.y)) && isWater(w.terrain[w.idx(Math.floor(v.x), Math.floor(v.y))]) ? 0.08 : 0);
      s.scale.set(S.ANIM_W * PX * 1.05, S.ANIM_H * PX * 1.05, 1);
      s.position.set(v.x, gy, v.y);
      shadow(v.x, gy, v.y, 0.14);
    }
    for (const [id, s] of this.people) if (!pseen.has(id)) { this.scene.remove(s); s.material.dispose(); this.people.delete(id); }

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
    for (const s of this.sprites.values()) { this.scene.remove(s); s.material.dispose(); }
    for (const s of this.people.values()) { this.scene.remove(s); s.material.dispose(); }
    this.sprites.clear(); this.people.clear();
  }
}
