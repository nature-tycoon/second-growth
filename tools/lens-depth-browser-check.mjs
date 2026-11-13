// node tools/lens-depth-browser-check.mjs
// The tracking lens (focus.js, look-through.js): nothing is cut close round the animal, which shows
// faintly through what hides it; foliage well nearer the camera opens, wider the nearer, with a soft
// rim. Two scenes:
//  - from above: a black-tailed deer, and a brush rabbit, in blue wildrye under big-leaf maples
//    with salal round them, four sides;
//  - eye level: the rabbit, and the deer, just behind a huckleberry bush in wildrye, seen through the real EyeCamera: the
//    bush squarely in the way from four sides, swung half out of the way, and lifted to look down
//    over it (where the lens should open next to nothing).
// For each view it measures how much of the animal shows, plainly or through cover (against the
// same view with no plants)
// and how much of the screen the lens opened (pixels that change, less the animal's own), and
// saves the open view to tools/release-output/lens-depth-*.png, and beside it
// lens-depth-*-cut.png: what the lens took away, in red, to judge the shape of its outline, and in
// blue what of the animal didn't show (behind a trunk, say).
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
    const { EyeCamera } = await import('/js/render3d/eye-camera.js');
    const { drawLookThrough } = await import('/js/render3d/look-through.js');
    const { focus } = await import('/js/render3d/focus.js');
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
      const pixels = () => { gl.render(scene, camera); drawLookThrough(gl, scene, camera, actors.fauna, focus.uFocusAmt.value, flora.lookNear()); const p = new Uint8Array(W * H * 4); ctx.readPixels(0, 0, W, H, ctx.RGBA, ctx.UNSIGNED_BYTE, p); return p; };
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
      // and with each layer of cover taken away in turn: how much more of it that shows
      const diag = {};
      for (const [name, m] of [['foliage', flora.foliage], ['shrubs', flora.shrubs], ['grass', flora.grass], ['tall', flora.tallGrass], ['small', flora.small], ['bark', flora.bark]]) {
        m.visible = false; animals(true); const a1 = pixels(); animals(false); const a0 = pixels(); m.visible = true;
        diag[name] = +(count(a1, a0) / bareN).toFixed(3);
      }
      window.lensMiss = []; for (let i = 0; i < shown.length; i += 4) if (diff(withA, noA, i) > 4 && !(diff(shown, open, i) > 4)) window.lensMiss.push(i);
      animals(true); pixels(); const shot = gl.domElement.toDataURL('image/png');
      // and what the lens took from the floor plants (grass, bushes; trees hidden, which open wide by
      // design), in red over the closed view: the shape of the cut round the animal. Flipped upright
      // (readPixels starts at the bottom row)
      animals(false); flora.foliage.visible = flora.bark.visible = false;
      game.selectedAgent = null; r.eyeAgent = null; Renderer.prototype.updateFocus.call(r, game, 1);
      const floorClosed = pixels();
      game.selectedAgent = a; r.eyeAgent = was; Renderer.prototype.updateFocus.call(r, game, 1);
      const floorOpen = pixels(); flora.foliage.visible = flora.bark.visible = true; animals(true);
      window.lensMissSet = new Set(window.lensMiss); const mask = new ImageData(W, H);
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const i = ((H - 1 - y) * W + x) * 4, o = (y * W + x) * 4, miss = window.lensMissSet.has(i), cut = !miss && diff(floorOpen, floorClosed, i) > 12, c = cut || !sil[i] ? floorClosed : withA;
        mask.data[o] = miss ? 30 : cut ? 230 : c[i]; if (miss) { mask.data[o + 1] = 60; mask.data[o + 2] = 255; mask.data[o + 3] = 255; continue; } mask.data[o + 1] = cut ? 30 : c[i + 1]; mask.data[o + 2] = cut ? 40 : c[i + 2]; mask.data[o + 3] = 255;
      }
      const c2 = Object.assign(document.createElement('canvas'), { width: W, height: H }); c2.getContext('2d').putImageData(mask, 0, 0);
      return { diag, R: focus.uFocusR.value, bare: bareN, ratio: bareN ? revealed / bareN : 0, hole: hole / (W * H), shot, mask: c2.toDataURL('image/png') };
    }
    const cases = {
      canopy(kind) {
        const game = bare(), w = game.world;
        for (let dz = -3; dz <= 3; dz++) for (let dx = -3; dx <= 3; dx++) {
          if ((dx + dz) % 2 === 0 && Math.abs(dx) + Math.abs(dz) > 0) w.setPlant(w.idx(40 + dx, 30 + dz), plant(game, 'maple'), 1);
          if ((dx + dz) % 2 !== 0) w.setPlant(w.idx(40 + dx, 30 + dz), plant(game, 'salal'), .8);
          w.setPlant(w.idx(40 + dx, 30 + dz), plant(game, 'wildrye'), 1);
        }
        const a = game.wildlife.spawn(game.catalog.animal[kind], 40, 30, { silent: true, age: 900 });
        Object.assign(a, { x: 40.2, y: 30.5, state: 'idle', wait: 99 });
        game.selectedAgent = a;
        const st = stage(game); for (let f = 0; f < 60; f++) st.actors.update(game, new THREE.Vector3(1, 0, 0), f / 30);
        const pose = st.actors.pose.get(a.id), half = kind === 'deer' ? 1.6 : .8, rows = [];
        const camera = new THREE.OrthographicCamera(-half, half, half * .75, -half * .75, .01, 200);
        const r = { actors: st.actors, camera, world: w };
        for (const az of [.785, 2.356, 3.927, 5.498]) {
          camera.position.copy(pose.center).addScaledVector(new THREE.Vector3(Math.sin(az) * .83, .56, Math.cos(az) * .83), 40);
          camera.lookAt(pose.center); camera.updateMatrixWorld();
          rows.push({ view: kind + ' above ' + az, ...measure(st, camera, r, game, a) });
        }
        return rows;
      },
      bush(kind) {
        const game = bare(), w = game.world, salal = plant(game, 'huckleberry');
        for (let dz = -3; dz <= 3; dz++) for (let dx = -3; dx <= 3; dx++) w.setPlant(w.idx(40 + dx, 30 + dz), plant(game, 'wildrye'), 1);
        w.setPlant(w.idx(40, 30), salal, 1);
        const [sx, sz] = shrubSpot(40, 30, salal, false), rows = [];
        const a = game.wildlife.spawn(game.catalog.animal[kind], 40, 30, { silent: true, age: 900 }), past = kind === 'deer' ? .7 : .42;
        game.selectedAgent = a;
        const st = stage(game), eye = new EyeCamera(), groundAt = (x, z) => w.heightAt(x, z) * LEVEL;
        const ground = new THREE.Mesh(new THREE.PlaneGeometry(20, 20).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ color: 0x8a7a55 }));
        ground.position.set(sx, groundAt(sx, sz) - .005, sz); st.scene.add(ground);
        const r = { actors: st.actors, camera: eye.camera, world: w, eyeOn: true, eyeAgent: a, eye };
        // the bush squarely between the eye and the rabbit from four sides; then swung 0.5 rad off
        // that line (the bush half in the way), and lifted to look down (a drag, as Cole does)
        for (const [az, swing, lift] of [[0, 0, 0], [1.571, 0, 0], [3.142, 0, 0], [4.712, 0, 0], [0, .5, 0], [3.142, -.5, 0], [1.571, 0, .6], [4.712, 0, .6]]) {
          const fx = Math.cos(az), fz = Math.sin(az);
          Object.assign(a, { x: sx + fx * past, y: sz + fz * past, state: 'idle', wait: 99 });
          st.actors.pose.clear(); for (let f = 0; f < 30; f++) st.actors.update(game, new THREE.Vector3(1, 0, 0), f / 30);
          const pose = st.actors.pose.get(a.id);
          // the real eye camera, fresh on this animal: it rides behind along its heading (-yaw), so
          // swinging it round by az + yaw puts it on the bush's side (plus the swing), and a drag
          // down by the lift raises it
          eye.agentId = null;
          eye.update(pose, a.id, W / H, 1 / 30, groundAt, null, { yaw: az + pose.yaw + swing, pitch: -lift });
          rows.push({ view: kind + ' eye ' + az + (swing ? ' swung ' + swing : '') + (lift ? ' lifted ' + lift : ''), ...measure(st, eye.camera, r, game, a) });
        }
        return rows;
      },
    };
    window.measureLens = (name, kind) => cases[name](kind);
  })()`);
  for (const [name, kind] of [['canopy', 'deer'], ['canopy', 'rabbit'], ['bush', 'rabbit'], ['bush', 'deer']]) {
    const rows = await b.evaluate(`window.measureLens(${JSON.stringify(name)}, ${JSON.stringify(kind)})`);
    for (let k = 0; k < rows.length; k++) {
      await writeFile(join(out, `lens-depth-${name}-${kind}-${k}.png`), Buffer.from(rows[k].shot.split(',')[1], 'base64'));
      await writeFile(join(out, `lens-depth-${name}-${kind}-${k}-cut.png`), Buffer.from(rows[k].mask.split(',')[1], 'base64'));
    }
    for (const row of rows) console.log(`${row.view}: gap ${row.R.toFixed(2)}, animal ${row.bare} px, ${Math.min(100, row.ratio * 100).toFixed(1)}% shows; lens opened ${(row.hole * 100).toFixed(1)}% of the view`);
    for (const row of rows) {
      assert.ok(row.bare > 300, `${row.view}: the view shows the animal`);
      // no layer of cover (leaves, bushes, grass) hides more than 5% of it: taking that layer away
      // shows no more of it. Trunks may: Cole wants it to pass behind a trunk, not seem to walk in
      // front of one
      for (const layer of ['foliage', 'shrubs', 'grass', 'tall', 'small'])
        assert.ok(row.diag[layer] - row.ratio <= .05, `${row.view}: ${layer} hid ${((row.diag[layer] - row.ratio) * 100).toFixed(1)}% of the selected animal`);
      assert.ok(row.ratio >= .5, `${row.view}: only ${(row.ratio * 100).toFixed(1)}% of the selected animal shows`);
    }
    console.log(`PASS ${name} ${kind}: the selected animal shows through the lens`);
    b.assertHealthy();
  }
} finally { await b.close(); }
