// node tools/tracker-lens-browser-check.mjs [outDir] [--shots]
// The tracking lens (focus.js) on small and large animals in thick cover: a vole, a frog, a wren
// and an elk in PNW forest (fir, salal, sword fern), a weaver, a dung beetle and an elephant in
// Serengeti grassland (red oat grass, croton, acacia), from above (the play camera) and at eye
// level. For each it measures how much of the animal shows with the lens on against the same view
// with no plants at all, and how much of the cover drawn round the animal on screen the lens
// opens: the window should reveal the animal and leave the cover beside it, not cut out a box.
// --gpu draws on this machine's graphics card instead of software (closer to the game's look).
// --shots saves every view (lens off, lens on) to outDir (default tools/release-output/tracker-lens).
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { openBrowser, projectRoot } from './browser-session.mjs';

const args = process.argv.slice(2), shots = args.includes('--shots');
const out = args.find(a => !a.startsWith('--')) || join(projectRoot, 'tools/release-output/tracker-lens');
await mkdir(out, { recursive: true });
const W = 640, H = 480;
const b = await openBrowser({ label: 'tracker-lens', width: W, height: H, software: !args.includes('--gpu') });
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
    const { EyeCamera } = await import('/js/render3d/eye-camera.js');
    const { PLANT } = await import('/js/data/plants.js');
    const { ANIMAL } = await import('/js/data/animals.js');
    const W = ${W}, H = ${H}, gl = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true }); // (antialiased, as in the game)
    gl.setSize(W, H); gl.outputColorSpace = THREE.SRGBColorSpace; gl.toneMapping = THREE.NeutralToneMapping;
    const ctx = gl.getContext();
    // a 9 x 9 tile patch of cover round tile (40, 32), the animal in the middle
    const cover = {
      pnw: { ground: ['swordfern', 'wildrye'], shrub: ['salal', 'huckleberry'], tree: 'fir' },
      serengeti: { ground: ['redoat', 'redoat', 'sporobolus'], shrub: ['croton'], tree: 'umbrella' },
    };
    function scene(map, key) {
      const game = new Game(); game.newGame(1987, 'free', 'standard', map); game.speed = 0;
      const w = game.world;
      for (const prop of ['ground', 'shrub', 'tree', 'feature']) w[prop].fill(0);
      for (const prop of ['ground', 'shrub', 'tree']) game.border[prop].fill(0);
      w.vh.fill(0); w.struct.fill(-1); w.terrain.fill(T.SOIL);
      game.wildlife.agents = []; game.wildlife.flyovers = []; game.visitors.agents = []; game.residents = [];
      const c = cover[map];
      for (let dz = -4; dz <= 4; dz++) for (let dx = -4; dx <= 4; dx++) {
        const i = w.idx(40 + dx, 32 + dz), h = ((dx * 7 + dz * 13) % 5 + 5) % 5;
        w.setPlant(i, PLANT[c.ground[h % c.ground.length]], 1);
        if (h < 2) w.setPlant(i, PLANT[c.shrub[h % c.shrub.length]], 1);
        if ((dx === 1 && dz === 1) || (dx === -2 && dz === 2) || (dx === 2 && dz === -1)) w.setPlant(i, PLANT[c.tree], .9);
      }
      const a = game.wildlife.spawn(ANIMAL[key], 40, 32, { silent: true, age: 1200 });
      Object.assign(a, { x: 40.5, y: 32.5, state: 'idle', wait: 99, heading: .5, flying: false, alt: 0 });
      game.selectedAgent = a;
      return { game, a };
    }
    window.lensViews = (map, key) => {
      const { game, a } = scene(map, key), s = new THREE.Scene();
      s.background = new THREE.Color('#dce4d1'); s.add(new THREE.HemisphereLight(0xe9f2ff, 0x697149, 1.45));
      const sun = new THREE.DirectionalLight(0xffedcf, 2.3); sun.position.set(30, 50, 35); s.add(sun);
      const flora = new Flora(s); flora.rebuild(game, true);
      const actors = new Actors(s, flora), right = new THREE.Vector3(1, 0, 0);
      for (let f = 0; f < 30; f++) actors.update(game, right, f / 30);
      const ground = new THREE.Mesh(new THREE.PlaneGeometry(40, 40).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ color: '#7a6a4c' }));
      const st = actors.pose.get(a.id), size = Math.max(st.h || 0, st.foot || 0, .12);
      const animals = v => { for (const pool of actors.fauna.species.values()) { pool.mesh.visible = v; if (pool.far) pool.far.visible = v; if (pool.close) pool.close.visible = v; } actors.ring.visible = false; };
      const pixels = cam => { gl.render(s, cam); const p = new Uint8Array(W * H * 4); ctx.readPixels(0, 0, W, H, ctx.RGBA, ctx.UNSIGNED_BYTE, p); return p; };
      const diff = (p, q, i) => Math.max(Math.abs(p[i] - q[i]), Math.abs(p[i + 1] - q[i + 1]), Math.abs(p[i + 2] - q[i + 2]));
      ground.position.set(st.x, game.world.heightAt(st.x, st.z) * LEVEL - .005, st.z); s.add(ground);
      const views = [];
      const half = Math.max(2.4, size * 4); // (about the game's usual zoom, closer for a big animal)
      const orthoAt = half => {
        const cam = new THREE.OrthographicCamera(-half, half, half * H / W, -half * H / W, .01, 200);
        cam.position.copy(st.center).add(new THREE.Vector3(.5, .7, .5).normalize().multiplyScalar(40)); cam.lookAt(st.center); cam.updateMatrixWorld();
        return cam;
      };
      const eye = new EyeCamera(); eye.update(st, a.id, W / H, 1, (x, z) => game.world.heightAt(x, z) * LEVEL);
      eye.camera.updateMatrixWorld();
      for (const [view, cam, eyeOn] of [['above', orthoAt(half), false], ['close', orthoAt(half * .4), false], ['eye', eye.camera, true]]) {
        const r = { actors, camera: cam, world: game.world, eyeOn, eyeAgent: null, eye };
        game.selectedAgent = r.eyeAgent = null; Renderer.prototype.updateFocus.call(r, game, 1);
        animals(true); const closed = pixels(cam); const offShot = gl.domElement.toDataURL('image/png');
        game.selectedAgent = a; r.eyeAgent = eyeOn ? a : null; Renderer.prototype.updateFocus.call(r, game, 1); animals(true);
        const open = pixels(cam); const onShot = gl.domElement.toDataURL('image/png');
        animals(false); const openBare = pixels(cam);
        game.selectedAgent = r.eyeAgent = null; Renderer.prototype.updateFocus.call(r, game, 1); const closedBare = pixels(cam);
        let shown = 0, body = 0, cover = 0, opened = 0;
        for (let i = 0; i < open.length; i += 4) {
          const isAnimalOpen = diff(open, openBare, i) > 4; // the animal draws here with the lens on
          if (isAnimalOpen) shown++;
          if (diff(closed, closedBare, i) > 4) body++; // (lens off: what of it shows through cover)
          if (diff(closedBare, openBare, i) > 12) opened++; // plants the lens opened, without the animal
        }
        views.push({ view, shown, hiddenOff: body, opened, off: offShot, on: onShot });
      }
      for (const pool of flora.pools.values()) for (const sub of pool.subs.values()) sub.dispose();
      return views;
    };
  })()`);
  const rows = [];
  for (const [map, key] of [['pnw', 'vole'], ['pnw', 'treefrog'], ['pnw', 'wren'], ['pnw', 'elk'], ['serengeti', 'weaver'], ['serengeti', 'dungbeetle'], ['serengeti', 'elephant']]) {
    const views = await b.evaluate(`window.lensViews(${JSON.stringify(map)}, ${JSON.stringify(key)})`);
    for (const v of views) {
      if (shots) for (const k of ['off', 'on']) await writeFile(join(out, `${map}-${key}-${v.view}-${k}.png`), Buffer.from(v[k].split(',')[1], 'base64'));
      const row = { map, key, view: v.view, shownOn: v.shown, shownOff: v.hiddenOff, opened: v.opened };
      rows.push(row);
      console.log(`${map} ${key} ${v.view}: animal ${v.hiddenOff} px through cover, ${v.shown} px with the lens; lens opened ${v.opened} px of plants`);
    }
    b.assertHealthy();
  }
  for (const r of rows) assert.ok(r.shownOn >= r.shownOff, `${r.map} ${r.key} ${r.view}: the lens shows less of the animal than no lens`);
  console.log('PASS tracker lens');
} finally { await b.close(); }
