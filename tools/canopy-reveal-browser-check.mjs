// Measure the selected animal's visible pixels against the same view without leaves.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { openBrowser, projectRoot } from './browser-session.mjs';

const out = join(projectRoot, 'tools/release-output');
await mkdir(out, { recursive: true });
const b = await openBrowser({ label: 'canopy-reveal', width: 640, height: 480 });
const results = [];
try {
  await b.navigate('/tools/canopy-support-review.html');
  await b.waitFor('document.getElementById("status").textContent.includes("Animal attached")');
  await b.evaluate(`(async () => {
    const THREE = await import('three');
    const { canopyFixture } = await import('/tools/canopy-support-fixture.mjs');
    const { Flora } = await import('/js/render3d/flora.js');
    const { Actors } = await import('/js/render3d/actors.js');
    const { Renderer } = await import('/js/render3d/scene.js');
    const { PLANT } = await import('/js/data/plants.js');
    const { focus } = await import('/js/render3d/focus.js');
    const gl = new THREE.WebGLRenderer({ antialias: false, preserveDrawingBuffer: true });
    gl.setSize(640, 480); gl.outputColorSpace = THREE.SRGBColorSpace; gl.toneMapping = THREE.NeutralToneMapping;
    const camera = new THREE.OrthographicCamera(-.8, .8, .6, -.6, .01, 100), ctx = gl.getContext();
    window.measureCanopyReveal = (plant, fast, fade) => {
      const { game, a } = canopyFixture('sumatra', 'langur'), scene = new THREE.Scene();
      for (const x of [40, 41]) game.world.setPlant(game.world.idx(x, 32), PLANT[plant], 1);
      scene.background = new THREE.Color('#dce4d1'); scene.add(new THREE.HemisphereLight(0xe9f2ff, 0x697149, 1.45));
      const sun = new THREE.DirectionalLight(0xffedcf, 2.3); sun.position.set(30, 50, 35); scene.add(sun);
      const flora = new Flora(scene); flora.setLight(fast); flora.rebuild(game, true); flora.setFade(fade);
      const actors = new Actors(scene, flora), right = new THREE.Vector3(1, 0, 0);
      actors.update(game, right, 1); const site = actors.pose.get(a.id).branch.site; site.prepare();
      const positions = plant === 'fig' ? [3, 17] : plant === 'meranti' ? [0, 2] : [null];
      const rows = [], r = { actors, camera, world: game.world };
      const pixels = () => { gl.render(scene, camera); const p = new Uint8Array(640 * 480 * 4); ctx.readPixels(0, 0, 640, 480, ctx.RGBA, ctx.UNSIGNED_BYTE, p); return p; };
      const visible = () => {
        const p = pixels(); for (const pool of actors.fauna.species.values()) pool.mesh.visible = false;
        const q = pixels(); for (const pool of actors.fauna.species.values()) pool.mesh.visible = true;
        let n = 0;
        for (let i = 0; i < p.length; i += 4) if (Math.max(Math.abs(p[i] - q[i]), Math.abs(p[i + 1] - q[i + 1]), Math.abs(p[i + 2] - q[i + 2])) > 4) n++;
        return n;
      };
      for (const position of positions) {
        actors.pose.clear();
        if (position !== null) site.anchor = (x, z, previous, reach, hanging, body) => site.endpoint(position, 1, { reach, hanging, body });
        actors.update(game, right, 2); const st = actors.pose.get(a.id);
        for (const az of [.785, 2.356, 3.927, 5.498]) {
          camera.position.copy(st.center).add(new THREE.Vector3(Math.sin(az) * .83, .56, Math.cos(az) * .83).multiplyScalar(20));
          camera.lookAt(st.center); camera.updateMatrixWorld(); Renderer.prototype.updateFocus.call(r, game, 1); actors.ring.visible = false;
          const revealed = visible();
          for (const mat of [flora.foliage, flora.canopyCrown]) mat.visible = false;
          const bare = visible();
          for (const mat of [flora.foliage, flora.canopyCrown]) mat.visible = true;
          rows.push({ plant, fast, fade, position, az, revealed, bare, ratio: bare ? revealed / bare : 0 });
          if (plant === 'fig' && position === 17 && az === 3.927 && !fade) {
            gl.render(scene, camera); window.canopyRevealImage = gl.domElement.toDataURL('image/png');
          }
          // Deselecting must restore ordinary cover, including lower leaves.
          game.selectedAgent = null; Renderer.prototype.updateFocus.call(r, game, 1);
          if (focus.uFocusAmt.value !== 0) throw new Error('Deselection left the reveal active');
          game.selectedAgent = a;
        }
      }
      for (const pool of flora.pools.values()) for (const sub of pool.subs.values()) sub.dispose();
      for (const pool of flora.canopyPools.values()) pool.dispose();
      for (const pool of actors.fauna.species.values()) { pool.mesh.dispose(); pool.geo.dispose(); pool.mat.dispose(); }
      actors.shadowGeo.dispose(); actors.shadowMat.dispose(); actors.shadows.dispose(); actors.ring.geometry.dispose(); actors.ring.material.dispose();
      for (const mat of [flora.foliage, flora.shrubs, flora.grass, flora.tallGrass, flora.bark, flora.small, flora.contact, flora.canopyBark, flora.canopyCrown]) mat.dispose();
      return rows;
    };
  })()`);
  for (const fast of [false, true]) for (const plant of ['fig', 'meranti', 'oilpalm']) for (const fade of [false, true]) {
    const rows = await b.evaluate(`window.measureCanopyReveal(${JSON.stringify(plant)}, ${fast}, ${fade})`);
    results.push(...rows);
    for (const row of rows) {
      assert.ok(row.bare > 100, 'the camera sees an actual langur silhouette');
      assert.ok(row.ratio >= .98, `${plant}, ${fast ? 'Fast' : 'Full'}, fade ${fade}, branch ${row.position}, view ${row.az}: leaves hid ${((1 - row.ratio) * 100).toFixed(1)}% of the selected langur`);
    }
    if (plant === 'fig' && !fade) {
      const png = await b.evaluate('window.canopyRevealImage');
      await writeFile(join(out, 'canopy-reveal-' + (fast ? 'fast' : 'full') + '.png'), Buffer.from(png.split(',')[1], 'base64'));
    }
    console.log(`PASS selected langur, ${plant}, ${fast ? 'Fast' : 'Full'}, ${fade ? 'see-through trees' : 'opaque trees'}: all four views keep its silhouette visible`);
    b.assertHealthy();
  }
  await writeFile(join(out, 'canopy-reveal.json'), JSON.stringify(results, null, 2));
  console.log(`${results.length} selected-langur canopy visibility comparisons passed.`);
} finally { await b.close(); }
