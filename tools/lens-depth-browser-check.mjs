// node tools/lens-depth-browser-check.mjs
// The tracking lens (focus.js) is depth-based: foliage level with the animal opens only where it
// covers the animal's body, foliage well nearer the camera opens wider with a soft rim. Two scenes:
//  - from above: a black-tailed deer under big-leaf maples with salal round it, four sides;
//  - eye level: a brush rabbit just behind a huckleberry bush, the eye on the far side of the bush.
// For each view it measures how much of the animal shows (against the same view with no plants)
// and how much of the screen the lens opened (pixels that change, less the animal's own), and
// saves the open view to tools/release-output/lens-depth-*.png.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { openBrowser, projectRoot } from './browser-session.mjs';

const out = join(projectRoot, 'tools/release-output');
await mkdir(out, { recursive: true });
const W = 640, H = 480;
const b = await openBrowser({ label: 'lens-depth', width: W, height: H });
try {
  await b.navigate('/tools/canopy-support-review.html');
  await b.waitFor('document.getElementById("status").textContent.includes("Animal attached")');
  await b.evaluate(`(async () => {
    const THREE = await import('three');
    const { Game } = await import('/js/game.js');
    const { T, LEVEL } = await import('/js/config.js');
    const { Flora } = await import('/js/render3d/flora.js');
    const { Actors } = await import('/js/render3d/actors.js');
    const { Renderer } = await import('/js/render3d/scene.js');
    const { shrubSpot } = await import('/js/sim/ground-obstacles.js');
    const W = ${W}, H = ${H}, gl = new THREE.WebGLRenderer({ antialias: false, preserveDrawingBuffer: true });
    gl.setSize(W, H); gl.outputColorSpace = THREE.SRGBColorSpace; gl.toneMapping = THREE.NeutralToneMapping;
    const ctx = gl.getContext();
    function bare() {
      const game = new Game(); game.newGame(1987, 'free', 'standard', 'pnw'); game.speed = 0;
      const w = game.world;
      for (const prop of ['ground', 'shrub', 'tree', 'feature']) w[prop].fill(0);
      for (const prop of ['ground', 'shrub', 'tree']) game.border[prop].fill(0);
      game.wildlife.agents = []; game.wildlife.flyovers = []; game.visitors.agents = []; game.residents = [];
      w.vh.fill(0); w.terrain.fill(T.SOIL);
      return game;
    }
    const plant = (game, k) => game.catalog.plants.find(p => p?.key === k);
    function stage(game) {
      const scene = new THREE.Scene();
      scene.background = new THREE.Color('#dce4d1'); scene.add(new THREE.HemisphereLight(0xe9f2ff, 0x697149, 1.45));
      const sun = new THREE.DirectionalLight(0xffedcf, 2.3); sun.position.set(30, 50, 35); scene.add(sun);
      const flora = new Flora(scene); flora.rebuild(game, true);
      const actors = new Actors(scene, flora);
      return { scene, flora, actors };
    }
    function measure({ scene, flora, actors }, camera, r, game, a) {
      const animals = v => { for (const pool of actors.fauna.species.values()) { pool.mesh.visible = v; if (pool.far) pool.far.visible = v; if (pool.close) pool.close.visible = v; } actors.ring.visible = false; };
      const plants = v => { for (const m of [flora.foliage, flora.shrubs, flora.bark, flora.grass, flora.tallGrass, flora.small]) m.visible = v; };
      const pixels = () => { gl.render(scene, camera); const p = new Uint8Array(W * H * 4); ctx.readPixels(0, 0, W, H, ctx.RGBA, ctx.UNSIGNED_BYTE, p); return p; };
      const diff = (p, q, i) => Math.max(Math.abs(p[i] - q[i]), Math.abs(p[i + 1] - q[i + 1]), Math.abs(p[i + 2] - q[i + 2]));
      const count = (p, q, mask) => { let n = 0; for (let i = 0; i < p.length; i += 4) if ((!mask || mask[i]) && diff(p, q, i) > 4) n++; return n; };
      // the animal alone, no plants: its silhouette
      plants(false); animals(true); const withA = pixels(); animals(false); const noA = pixels(); plants(true);
      const sil = new Uint8Array(withA.length); for (let i = 0; i < withA.length; i += 4) sil[i] = diff(withA, noA, i) > 4 ? 1 : 0;
      const bareN = count(withA, noA);
      // the lens closed and open, no animal: what it opened, beside the animal's own outline
      game.selectedAgent = null; const was = r.eyeAgent; r.eyeAgent = null; Renderer.prototype.updateFocus.call(r, game, 1);
      const closed = pixels();
      game.selectedAgent = a; r.eyeAgent = was; Renderer.prototype.updateFocus.call(r, game, 1);
      const open = pixels();
      let hole = 0; for (let i = 0; i < open.length; i += 4) if (!sil[i] && diff(open, closed, i) > 12) hole++;
      animals(true); const shown = pixels(); animals(false);
      const revealed = count(shown, open);
      animals(true); gl.render(scene, camera);
      return { bare: bareN, ratio: bareN ? revealed / bareN : 0, hole: hole / (W * H), shot: gl.domElement.toDataURL('image/png') };
    }
    const cases = {
      canopy() {
        const game = bare(), w = game.world;
        for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) {
          if ((dx + dz) % 2 === 0) w.setPlant(w.idx(40 + dx, 30 + dz), plant(game, 'maple'), 1);
          w.setPlant(w.idx(40 + dx, 30 + dz), plant(game, 'salal'), .8);
        }
        const a = game.wildlife.spawn(game.catalog.animal.deer, 40, 30, { silent: true, age: 900 });
        Object.assign(a, { x: 40.2, y: 30.5, state: 'idle', wait: 99 });
        game.selectedAgent = a;
        const st = stage(game); for (let f = 0; f < 60; f++) st.actors.update(game, new THREE.Vector3(1, 0, 0), f / 30);
        const pose = st.actors.pose.get(a.id), half = 1.6, rows = [];
        const camera = new THREE.OrthographicCamera(-half, half, half * .75, -half * .75, .01, 200);
        const r = { actors: st.actors, camera, world: w };
        for (const az of [.785, 2.356, 3.927, 5.498]) {
          camera.position.copy(pose.center).addScaledVector(new THREE.Vector3(Math.sin(az) * .83, .56, Math.cos(az) * .83), 40);
          camera.lookAt(pose.center); camera.updateMatrixWorld();
          rows.push({ view: 'above ' + az, ...measure(st, camera, r, game, a) });
        }
        return rows;
      },
      bush() {
        const game = bare(), w = game.world, salal = plant(game, 'huckleberry');
        w.setPlant(w.idx(40, 30), salal, 1);
        const [sx, sz] = shrubSpot(40, 30, salal, false), rows = [];
        const a = game.wildlife.spawn(game.catalog.animal.rabbit, 40, 30, { silent: true, age: 400 });
        const st = stage(game), eye = new THREE.PerspectiveCamera(50, W / H, 0.03, 34);
        const ground = new THREE.Mesh(new THREE.PlaneGeometry(20, 20).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ color: 0x8a7a55 }));
        ground.position.set(sx, w.heightAt(sx, sz) * LEVEL - .005, sz); st.scene.add(ground);
        const r = { actors: st.actors, camera: eye, world: w, eyeOn: true, eyeAgent: a, eye: { pos: new THREE.Vector3(), size: .12, camera: eye } };
        for (const az of [0, 1.571, 3.142, 4.712]) {
          // the rabbit 0.42 tiles past the bush's middle, the eye where EyeCamera would ride behind it
          const fx = Math.cos(az), fz = Math.sin(az);
          Object.assign(a, { x: sx + fx * .42, y: sz + fz * .42, state: 'idle', wait: 99 });
          st.actors.pose.clear(); for (let f = 0; f < 30; f++) st.actors.update(game, new THREE.Vector3(1, 0, 0), f / 30);
          const pose = st.actors.pose.get(a.id), size = Math.max(pose.h || 0, pose.foot || 0, .12), reach = .55 + size * 2.4;
          r.eye.size = size;
          r.eye.pos.set(pose.center.x - fx * reach, pose.center.y + size * .9 + .06, pose.center.z - fz * reach);
          eye.position.copy(r.eye.pos); eye.lookAt(pose.center.x + fx * size * 4, pose.center.y + size * .25, pose.center.z + fz * size * 4); eye.updateMatrixWorld();
          rows.push({ view: 'eye ' + az, ...measure(st, eye, r, game, a) });
        }
        return rows;
      },
    };
    window.measureLens = name => cases[name]();
  })()`);
  for (const name of ['canopy', 'bush']) {
    const rows = await b.evaluate(`window.measureLens(${JSON.stringify(name)})`);
    rows.forEach((row, k) => writeFile(join(out, `lens-depth-${name}-${k}.png`), Buffer.from(row.shot.split(',')[1], 'base64')));
    for (const row of rows) console.log(`${row.view}: animal ${row.bare} px, ${(row.ratio * 100).toFixed(1)}% shows; lens opened ${(row.hole * 100).toFixed(1)}% of the view`);
    for (const row of rows) {
      assert.ok(row.bare > 300, `${row.view}: the view shows the animal`);
      assert.ok(row.ratio >= .95, `${row.view}: plants hid ${((1 - row.ratio) * 100).toFixed(1)}% of the selected animal`);
    }
    console.log(`PASS ${name}: the selected animal shows through the lens`);
    b.assertHealthy();
  }
} finally { await b.close(); }
