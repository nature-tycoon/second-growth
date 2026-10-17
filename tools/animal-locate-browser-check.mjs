// Actual phone UI checks in an isolated Chrome profile: node tools/animal-locate-browser-check.mjs
import { writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openBrowser } from './browser-session.mjs';

const browser = await openBrowser({ label: 'locate' });
const { send, evaluate, origin, sessionId } = browser;
try {
  await browser.navigate('/');
  await send('Emulation.setDeviceMetricsOverride', { width: 667, height: 375, deviceScaleFactor: 1, mobile: true }, sessionId);
  await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 }, sessionId);
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'pointer', value: 'coarse' }, { name: 'hover', value: 'none' }] }, sessionId);
  // Configure graphics before boot so a slow software renderer can test the real UI.
  await evaluate(`localStorage.setItem('second-growth-settings', JSON.stringify({ analytics: false, music: false, nature: false, quality: 'fast', shadows: false, v: 2 }))`);
  await send('Page.reload', {}, sessionId);
  const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
  async function waitFor(expression, message) {
    for (let k = 0; k < 150; k++) { if (await evaluate(expression)) return; await pause(100); }
    throw new Error(message);
  }
  await waitFor('!!window.secondGrowth && (!document.getElementById("loading-screen") || document.getElementById("loading-screen").classList.contains("done"))', 'Game did not boot');
  await evaluate(`window.checkLocate = async (map, key, flight = false) => {
    const { game, renderer: r, ui } = window.secondGrowth;
    const { ANIMAL } = await import('/js/data/animals.js');
    const { PLANTS } = await import('/js/data/plants.js');
    const { T } = await import('/js/config.js');
    ui.closeModal(true); ui.closeInfo(); game.newGame(1987, 'free', 'standard', map); game.speed = 0;
    game.wildlife.agents = []; game.visitors.agents = []; game.residents = [];
    const a = game.wildlife.spawn(ANIMAL[key], 30, 30, { silent: true, age: 1000 });
    const i = game.world.idx(Math.floor(a.x), Math.floor(a.y));
    if (ANIMAL[key].move === 'tree') { const p = PLANTS.find(p => p?.layer === 2); game.world.tree[i] = p.id; game.world.treeG[i] = 1; }
    if (map === 'reef' || ANIMAL[key].move === 'swim') game.world.terrain[i] = T.CREEK;
    a.flying = flight; a.alt = flight ? 1 : 0; a.wait = 100;
    r.setWorld(game); r.centerOn(100, 80); ui.infoMin = false;
    ui.openGuide('animals', key);
    const button = document.querySelector('#g-find'); if (!button) throw new Error('Guide Locate missing');
    button.click(); window.located = a;
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    return true;
  };
  window.locateResult = () => {
    const { game, renderer: r, ui } = window.secondGrowth, a = window.located;
    const st = r.actors.pose.get(a.id), p = st?.center && r.project(st.center.x, st.center.y, st.center.z);
    const panel = document.getElementById('infopanel'), b = panel.getBoundingClientRect();
    return { name: (game.map + '/' + a.key), pose: !!st?.visible,
      centered: !!p && Math.abs(p.x - r.vw * r.frame.x) < 1 && Math.abs(p.y - r.vh * r.frame.y) < 1,
      offsetPixels: p ? Math.hypot(p.x - r.vw * r.frame.x, p.y - r.vh * r.frame.y) : null,
      clear: !!p && !(p.x >= b.left && p.x <= b.right && p.y >= b.top && p.y <= b.bottom),
      ring: !!st?.center && Math.hypot(r.actors.ring.position.x - st.center.x, r.actors.ring.position.z - st.center.z) < 0.001,
      follow: ui.follow === a && r.followAgent === a, collapsed: panel.classList.contains('min'),
      touch: matchMedia('(pointer: coarse)').matches, width: r.vw, height: r.vh };
  }`);
  for (const [width, height] of [[667, 375], [844, 390]]) {
    await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: true }, sessionId);
    for (const [map, key, flight] of [['sumatra', 'orangutan', false], ['sumatra', 'hornbill', true], ['amazon', 'sloth', false], ['serengeti', 'giraffe', false], ['reef', 'shark', false]]) {
      await evaluate(`window.checkLocate(${JSON.stringify(map)}, ${JSON.stringify(key)}, ${flight})`);
      // Climbing Follow deliberately eases into a pose. Two RAF callbacks may only
      // include one 30-FPS game frame, especially on software graphics.
      // Keep the snapshot that satisfied the wait. A later CDP call can land in a
      // different frame while the deliberately eased canopy camera is moving.
      await waitFor('(window.settledLocateResult = window.locateResult()).centered', `Locate camera did not settle: ${map}/${key}`);
      const result = await evaluate('window.settledLocateResult');
      if (!result.pose || !result.centered || !result.clear || !result.ring || !result.follow || !result.touch) throw new Error('Locate failed: ' + JSON.stringify(result));
      console.log(`PASS Guide Locate: ${map}/${key} at ${width}×${height}, body centred and unobscured`);
      if (key === 'orangutan') {
        const shot = await send('Page.captureScreenshot', { format: 'png' }, sessionId);
        const screenshotPath = join(tmpdir(), `second-growth-locate-${width}.png`);
        await writeFile(screenshotPath, Buffer.from(shot.data, 'base64')); console.log('Screenshot: ' + screenshotPath);
        if (width === 667) {
          await evaluate(`window.secondGrowth.ui.infoMin = true; window.secondGrowth.ui.renderInfo()`);
          await evaluate(`document.querySelector('#infopanel .minimize').click()`);
          if (await evaluate('document.getElementById("infopanel").classList.contains("min")')) throw new Error('Inspector cannot expand');
          await evaluate(`document.querySelector('#infopanel .minimize').click()`);
          if (!await evaluate('document.getElementById("infopanel").classList.contains("min")')) throw new Error('Inspector cannot collapse');
          console.log('PASS Compact inspector can be expanded and collapsed immediately');
        }
      }
      await evaluate(`window.located.x += 0.1; window.located.y += 0.1`);
      await waitFor('window.locateResult().centered', 'Follow lost moving animal');
      const afterMove = await evaluate('window.locateResult()'); if (!afterMove.ring) throw new Error('Ring lost moving animal');
    }
  }
  // A real touch drag must release Follow so the player's camera input wins.
  await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 250, y: 220 }] }, sessionId);
  await send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 280, y: 245 }] }, sessionId);
  await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }, sessionId);
  await waitFor('!window.secondGrowth.ui.follow && !window.secondGrowth.renderer.followAgent', 'Touch drag failed to release Follow');
  console.log('PASS Touch camera movement releases Follow');
} finally {
  await browser.close();
}
