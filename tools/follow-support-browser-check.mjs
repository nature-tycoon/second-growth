// node tools/follow-support-browser-check.mjs
// The tracking lens (focus.js) opens only what lies between the camera and the selected animal,
// never what it stands, perches, climbs or swims on: a woodpecker's trunk, the palm crown under a
// langur, the coral under a reef fish. For each, from four sides, this compares the support drawn
// with the lens open against the same view with it closed (shading the gap's walls still counts as drawn), around the animal on screen, and saves
// the views to tools/release-output/follow-support-*.png. (That covering leaves still open is
// canopy-reveal-browser-check.)
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { openBrowser, projectRoot } from './browser-session.mjs';

const out = join(projectRoot, 'tools/release-output');
await mkdir(out, { recursive: true });
const b = await openBrowser({ label: 'follow-support', width: 640, height: 480 });
try {
  await b.navigate('/tools/canopy-support-review.html');
  await b.waitFor('document.getElementById("status").textContent.includes("Animal attached")');
  await b.evaluate(`(async () => {
    const THREE = await import('three');
    const { canopyFixture } = await import('/tools/canopy-support-fixture.mjs');
    const { Game } = await import('/js/game.js');
    const { T } = await import('/js/config.js');
    const { Flora } = await import('/js/render3d/flora.js');
    const { Actors } = await import('/js/render3d/actors.js');
    const { Renderer } = await import('/js/render3d/scene.js');
    const { PLANT } = await import('/js/data/plants.js');
    const { focus } = await import('/js/render3d/focus.js');
    const { drawLookThrough } = await import('/js/render3d/look-through.js');
    const W = 640, H = 480, gl = new THREE.WebGLRenderer({ antialias: false, preserveDrawingBuffer: true });
    gl.setSize(W, H); gl.outputColorSpace = THREE.SRGBColorSpace; gl.toneMapping = THREE.NeutralToneMapping;
    const ctx = gl.getContext();
    function bare(map) {
      const game = new Game(); game.newGame(1987, 'free', 'standard', map); game.speed = 0;
      const w = game.world;
      for (const prop of ['ground', 'shrub', 'tree', 'feature']) w[prop].fill(0);
      for (const prop of ['ground', 'shrub', 'tree']) game.border[prop].fill(0);
      game.wildlife.agents = []; game.wildlife.flyovers = []; game.visitors.agents = []; game.residents = [];
      return game;
    }
    const cases = {
      woodpecker() {
        const game = bare('pnw'), w = game.world; w.vh.fill(0); w.terrain.fill(T.SOIL);
        w.setPlant(w.idx(40, 30), game.catalog.plants.find(p => p?.key === 'fir'), 1);
        const a = game.wildlife.spawn(game.catalog.animal.woodpecker, 40, 30, { silent: true });
        Object.assign(a, { x: 40.5, y: 30.5, state: 'bird', flying: false, alt: 0, wait: 99, bird: { kind: 'trunk', t: 99, h: .2, side: 0 }, heading: Math.atan2(-Math.sin(0), -Math.cos(0)) });
        game.selectedAgent = a; return { game, a, half: .5 };
      },
      palm() {
        const { game, a } = canopyFixture('sumatra', 'langur');
        for (const x of [40, 41]) game.world.setPlant(game.world.idx(x, 32), PLANT.oilpalm, 1);
        return { game, a, half: .8 };
      },
      reef() {
        const game = bare('reef'), w = game.world, n = w.n ?? w.W;
        // a reef tile under water near the middle, ringed by coral
        let at = null;
        for (let r = 0; r < 40 && !at; r++) for (let dz = -r; dz <= r && !at; dz++) for (let dx = -r; dx <= r && !at; dx++) {
          const x = 48 + dx, z = 48 + dz, i = w.idx(x, z);
          if (w.terrain[i] === T.REEF || (T.REEF === undefined && w.heightAt(x + .5, z + .5) < 0)) at = [x, z];
        }
        if (!at) at = [48, 48];
        for (const [dx, dz, k] of [[0, 0, 'tablecoral'], [1, 0, 'staghorn'], [0, 1, 'brain'], [-1, 0, 'montipora'], [0, -1, 'boulder']]) {
          const p = game.catalog.plants.find(p => p?.key === k); if (p) w.setPlant(w.idx(at[0] + dx, at[1] + dz), p, 1);
        }
        const a = game.wildlife.spawn(game.catalog.animal.tang, at[0], at[1], { silent: true, age: 400 });
        Object.assign(a, { x: at[0] + .5, y: at[1] + .5, state: 'idle', wait: 99 });
        game.selectedAgent = a; return { game, a, half: .6 };
      },
    };
    window.measureSupport = (name) => {
      const { game, a, half } = cases[name](), scene = new THREE.Scene();
      scene.background = new THREE.Color('#dce4d1'); scene.add(new THREE.HemisphereLight(0xe9f2ff, 0x697149, 1.45));
      const sun = new THREE.DirectionalLight(0xffedcf, 2.3); sun.position.set(30, 50, 35); scene.add(sun);
      const flora = new Flora(scene); flora.rebuild(game, true);
      const actors = new Actors(scene, flora), right = new THREE.Vector3(1, 0, 0);
      for (let f = 0; f < 60; f++) actors.update(game, right, f / 30);
      const st = actors.pose.get(a.id);
      const camera = new THREE.OrthographicCamera(-half, half, half * .75, -half * .75, .01, 100);
      const r = { actors, camera, world: game.world };
      const animals = v => { for (const pool of actors.fauna.species.values()) { pool.mesh.visible = v; if (pool.far) pool.far.visible = v; if (pool.close) pool.close.visible = v; } actors.ring.visible = false; };
      const pixels = () => { gl.render(scene, camera); drawLookThrough(gl, scene, camera, actors.fauna, focus.uFocusAmt.value, flora.lookNear()); const p = new Uint8Array(W * H * 4); ctx.readPixels(0, 0, W, H, ctx.RGBA, ctx.UNSIGNED_BYTE, p); return p; };
      const rows = [], shots = [];
      for (const az of [.785, 2.356, 3.927, 5.498]) {
        const dir = new THREE.Vector3(Math.sin(az) * .83, .56, Math.cos(az) * .83);
        camera.position.copy(st.center).addScaledVector(dir, 20); camera.lookAt(st.center); camera.updateMatrixWorld();
        // the animal's side of its support, for the woodpecker: the trunk lies behind it from here
        const front = name !== 'woodpecker' || (st.x - 40.5) * dir.x + (st.z - 30.5) * dir.z > 0;
        game.selectedAgent = null; Renderer.prototype.updateFocus.call(r, game, 1); animals(false);
        const closed = pixels();
        game.selectedAgent = a; Renderer.prototype.updateFocus.call(r, game, 1);
        const open = pixels();
        // support pixels: what the closed view draws (not the sky) in a box around the animal
        const sky = [0xdc, 0xe4, 0xd1]; let support = 0, kept = 0; // (scene.background)
        for (let y = H * .2; y < H * .8; y++) for (let x = W * .25; x < W * .75; x++) {
          const i = (Math.floor(y) * W + Math.floor(x)) * 4;
          if (Math.abs(closed[i] - sky[0]) + Math.abs(closed[i + 1] - sky[1]) + Math.abs(closed[i + 2] - sky[2]) < 6) continue;
          support++;
          if (Math.abs(open[i] - closed[i]) + Math.abs(open[i + 1] - closed[i + 1]) + Math.abs(open[i + 2] - closed[i + 2]) < 12) { kept++; continue; }
          // (still drawn, only shaded as a wall of the gap: every channel darker by about one factor)
          const k = [0, 1, 2].map(c => (open[i + c] + 1) / (closed[i + c] + 1));
          if (Math.max(...k) < 1.03 && Math.max(...k) - Math.min(...k) < .25) kept++;
        }
        animals(true); gl.render(scene, camera); drawLookThrough(gl, scene, camera, actors.fauna, focus.uFocusAmt.value, flora.lookNear()); shots.push(gl.domElement.toDataURL('image/png'));
        rows.push({ name, az, front, support, kept: support ? kept / support : 1 });
      }
      for (const pool of flora.pools.values()) for (const sub of pool.subs.values()) sub.dispose();
      return { rows, shots };
    };
  })()`);
  for (const name of ['woodpecker', 'palm', 'reef']) {
    const { rows, shots } = await b.evaluate(`window.measureSupport(${JSON.stringify(name)})`);
    for (let k = 0; k < shots.length; k++) await writeFile(join(out, `follow-support-${name}-${k}.png`), Buffer.from(shots[k].split(',')[1], 'base64'));
    for (const row of rows) console.log(`${name} view ${row.az}: ${row.support} support px, ${(row.kept * 100).toFixed(1)}% kept${row.front ? '' : ' (animal behind its support)'}`);
    const need = name === 'palm' ? .8 : .85; // (fronds in front of a langur up in the crown do cover it)
    for (const row of rows.filter(r => r.front)) {
      assert.ok(row.support > 200, `${name}: the view shows its support`);
      assert.ok(row.kept >= need, `${name} view ${row.az}: the lens hid ${((1 - row.kept) * 100).toFixed(1)}% of its support`);
    }
    console.log(`PASS ${name}: its support stays in the tracking lens`);
    b.assertHealthy();
  }
} finally { await b.close(); }
