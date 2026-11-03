// node tools/moment-camera-browser-check.mjs
// A keystone moment takes the camera from wherever the player is: the usual view at the fastest
// speed (with a click on the map during the glide, which used to stop it), and watch mode at eye
// level (it leaves the eye for the moment and goes back to eye level after). Also the two Gameplay
// settings: Keystone moments off plays none, Invasive species off stops invasive seedlings taking.
import assert from 'node:assert/strict';
import { openBrowser, pause } from './browser-session.mjs';

const b = await openBrowser({ label: 'moment-camera', width: 844, height: 390 });
const S = 'window.secondGrowth';
const fire = `(async () => {
  const {game:g,ui}=${S}; if(ui.modalOpen) ui.closeModal();
  const {moment}=await import('/js/sim/moments.js');
  ui.momentEnded=-1e9; g.flags.lastMomentDay=-1e9; g.flags.momentQueue=[]; (g.flags.moments ||= {}); delete g.flags.moments.elkRut;
  return moment(g,'elkRut',{x:20,y:20});
})()`;
const end = async () => {
  await b.evaluate(`document.querySelector('#moment [data-a=go]')?.click()`);
  await b.waitFor(`!${S}.ui.moment && !document.getElementById('moment')`, 'Continue cleans up', 10000);
};
try {
  await b.evaluate(`localStorage.setItem('second-growth-settings', JSON.stringify({analytics:false,autosave:false,music:false,nature:false,quality:'fast',qualityChosen:true,v:2})); sessionStorage.setItem('second-growth-pending', JSON.stringify({map:'pnw',mode:'free',difficulty:'standard'}));`);
  await b.navigate('/');
  await b.waitFor(`${S}?.game.map === 'pnw' && (!document.getElementById("loading-screen") || document.getElementById("loading-screen").classList.contains("done"))`, 'boot');

  // 1. the usual view, fastest speed, zoomed out away from the spot, a click on the map mid-glide
  await b.evaluate(`(() => { const {game:g,ui,renderer:r}=${S}; if(ui.modalOpen) ui.closeModal(); ui.setSpeed(3); r.target.x=60; r.target.z=50; r.zoom=0.5; })()`);
  assert.ok(await b.evaluate(fire), 'moment fired');
  await b.waitFor(`${S}.ui.moment?.key === 'elkRut'`, 'cinematic starts', 20000);
  await pause(700);
  // click an animal on screen, as a player might (that used to start following it and stop the glide)
  let clicked = null;
  for (let k = 0; k < 30 && clicked == null; k++, await pause(250)) clicked = await b.evaluate(`(() => { const {game:g,renderer:r}=${S}, c=r.canvas, rc=c.getBoundingClientRect();
    for (const a of g.wildlife.viewAgents) { const s=r.actors.pose.get(a.id); if(!s?.visible) continue;
      const p=r.project(s.center.x,s.center.y,s.center.z); if(p.x<40||p.y<40||p.x>r.vw-40||p.y>r.vh-40) continue;
      if (r.pickAgent(g,p.x,p.y)!==a) continue;
      c.dispatchEvent(new MouseEvent('mousedown',{bubbles:true,clientX:rc.left+p.x,clientY:rc.top+p.y,button:0}));
      window.dispatchEvent(new MouseEvent('mouseup',{bubbles:true,clientX:rc.left+p.x,clientY:rc.top+p.y,button:0}));
      return a.id; }
    return null; })()`);
  console.log('clicked animal', clicked);
  assert.ok(clicked != null, 'found an animal to click during the glide');
  const t0 = Date.now();
  await b.waitFor(`${S}.renderer.zoom > 2 && Math.hypot(${S}.renderer.target.x - 20, ${S}.renderer.target.z - 20) < 3`, 'zoomed in on the moment despite the click', 30000);
  console.log(`glide took ${Date.now() - t0} ms (dt is capped at 0.1 s a frame, so slow software frames stretch it)`);
  let v = await b.evaluate(`(() => { const {game:g,renderer:r}=${S}; return {zoom:r.zoom, x:r.target.x, z:r.target.z, speed:g.speed}; })()`);
  console.log('overhead at speed 3:', v);
  assert.ok(v.zoom > 2 && Math.hypot(v.x - 20, v.z - 20) < 3, 'zoomed in on the moment despite the click');
  assert.equal(v.speed, 1, 'slowed to normal speed');
  await end();
  await b.waitFor(`${S}.renderer.zoom < 0.55 && ${S}.game.speed === 3`, 'back to the player view and speed', 30000);
  console.log('PASS overhead, fastest speed, click during glide');

  // 2. watch mode at eye level
  await b.evaluate(`(() => { const {ui}=${S}; ui.setSpeed(1); ui.watch.toggle(); })()`);
  await pause(1500);
  await b.evaluate(`${S}.ui.watch.setEyeLevel(true)`);
  await b.waitFor(`${S}.renderer.eyeOn`, 'eye level on', 15000);
  assert.ok(await b.evaluate(fire), 'moment fired at eye level');
  await b.waitFor(`${S}.ui.moment?.key === 'elkRut'`, 'cinematic starts at eye level', 20000);
  await b.waitFor(`${S}.renderer.zoom > 2 && Math.hypot(${S}.renderer.target.x - 20, ${S}.renderer.target.z - 20) < 3`, 'zoomed in from eye level', 30000);
  v = await b.evaluate(`(() => { const {renderer:r}=${S}; return {eye:r.eyeOn, zoom:r.zoom, x:r.target.x, z:r.target.z}; })()`);
  console.log('eye level:', v);
  assert.ok(!v.eye && v.zoom > 2 && Math.hypot(v.x - 20, v.z - 20) < 3, 'left eye level and zoomed in');
  await end();
  await b.waitFor(`${S}.renderer.eyeOn && ${S}.ui.watch.on && ${S}.ui.watch.eyeLevel`, 'back to eye level after', 15000);
  await b.evaluate(`${S}.ui.watch.stop()`);
  console.log('PASS eye level');

  // 3. keystone moments off: a notification, no cinematic
  await b.evaluate(`(() => { const s=JSON.parse(localStorage.getItem('second-growth-settings')); })()`);
  await b.evaluate(`(async () => { const {settings,saveSettings}=await import('/js/settings.js'); settings.moments=false; saveSettings(); })()`);
  assert.ok(await b.evaluate(fire), 'moment fired with moments off');
  await pause(1500);
  assert.ok(await b.evaluate(`!${S}.ui.moment && !document.getElementById('moment') && ${S}.ui.journal[0]?.text.startsWith('The autumn rut')`), 'no cinematic, a journal note');
  assert.equal(await b.evaluate(`JSON.parse(localStorage.getItem('second-growth-settings')).moments`), false, 'saved');
  console.log('PASS moments off');

  // 4. invasive species off: no invasive seedling takes
  const inv = await b.evaluate(`(async () => { const {settings}=await import('/js/settings.js'); const {game:g,ui}=${S};
    settings.invasives=false; ui.applySettings();
    const {updatePlants,trySeed}=await import('/js/sim/plants.js'); updatePlants(g);
    const w=g.world, p=g.catalog.plants.find(p=>p&&p.invasive); if(!p) return {none:true};
    let took=0; for(let i=0;i<w.n;i+=7){ if(trySeed(w,p,i,Math.random) && true) took++; }
    return {odds:w.invasiveOdds, took, plant:p.key}; })()`);
  console.log('invasives off:', inv);
  assert.ok(inv.none || inv.odds === 0 && inv.took === 0, 'no invasive took');
  b.assertHealthy();
  console.log('PASS invasives off');
} finally { await b.close(); }
