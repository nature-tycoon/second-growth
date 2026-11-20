// node tools/watch-lock-browser-check.mjs
// Watch mode (ui/watch.js): the date shows small in the top letterbox bar; a click on an animal locks
// the camera onto it, past the shot's usual length, in the usual view and at eye level, and a click
// on empty ground, Esc or the chip's ✕ lets go (Esc first lets go, then leaves). And on a touch
// screen, two fingers twisted turn the map round the ground between them (Input.touchMove,
// Renderer.twistAt), while a plain pinch (a few degrees of wobble) doesn't turn it.
import assert from 'node:assert/strict';
import { openBrowser, pause } from './browser-session.mjs';

const b = await openBrowser({ label: 'watch-lock', width: 844, height: 390 });
const S = 'window.secondGrowth';
// a click (pointerdown, pointerup) on the watch layer at a screen point
const click = (x, y) => `(() => { const o=document.getElementById('watch'), ev=t => o.dispatchEvent(new PointerEvent(t,{bubbles:true,pointerId:1,clientX:${x},clientY:${y},button:0}));
  ev('pointerdown'); ev('pointerup'); })()`;
// an animal on screen that a click there picks, and its point
const onScreen = `(() => { const {game:g,renderer:r}=${S}, eye=r.eyeOn&&r.eye.camera, v=r.v3;
  for (const a of g.wildlife.viewAgents) { const s=r.actors.pose.get(a.id); if(!s?.visible) continue;
    let p; if (eye) { v.set(s.center.x,s.center.y,s.center.z).project(eye); if (v.z>1) continue; p={x:(v.x+1)/2*r.vw,y:(1-v.y)/2*r.vh}; } else p=r.project(s.center.x,s.center.y,s.center.z);
    if(p.x<60||p.y<60||p.x>r.vw-60||p.y>r.vh-90) continue;
    if (r.pickAgent(g,p.x,p.y,48)===a) return {id:a.id,x:p.x,y:p.y}; }
  return null; })()`;
const findAnimal = async what => {
  for (let k = 0; k < 60; k++) { const p = await b.evaluate(onScreen); if (p) return p; await pause(250); }
  assert.fail(`an animal on screen to click (${what})`);
};
const state = `(() => { const w=${S}.ui.watch; return { on:w.on, locked:w.locked?.id ?? null, shot:w.shot?.agent?.id ?? null, held:w.shot?.len === Infinity, chip:document.querySelector('#watch .w-lock').classList.contains('on') }; })()`;
try {
  await b.evaluate(`localStorage.setItem('second-growth-settings', JSON.stringify({analytics:false,autosave:false,music:false,nature:false,quality:'fast',qualityChosen:true,v:2})); sessionStorage.setItem('second-growth-pending', JSON.stringify({map:'pnw',mode:'free',difficulty:'standard'}));`);
  await b.navigate('/');
  await b.waitFor(`${S}?.game.map === 'pnw' && (!document.getElementById("loading-screen") || document.getElementById("loading-screen").classList.contains("done"))`, 'boot');
  // a few elk standing still in the middle of the view, so there is always an animal to click
  await b.evaluate(`(async () => { const {game:g,ui,renderer:r}=${S}, {ANIMAL}=await import('/js/data/animals.js'); if(ui.modalOpen) ui.closeModal(); ui.setSpeed(1);
    for (let k=0;k<3;k++) { const a=g.wildlife.spawn(ANIMAL.elk,30+k*2,30,{silent:true,age:600}); a.x=30.5+k*2; a.y=30.5; a.wait=999; }
    r.target.x=32; r.target.z=30; r.zoom=1.6; ui.watch.toggle(); ui.watch.shuffle.follow=false; ui.watch.setSpecies('elk'); })()`);
  await pause(800);

  // the date, small in the top bar
  const date = await b.evaluate(`(() => { const el=document.querySelector('#watch .w-date'), r=el.getBoundingClientRect(), {game:g}=${S}; return { text:el.textContent, top:r.top, h:r.height, right:innerWidth-r.right, op:getComputedStyle(el).opacity, season:g.seasonName() }; })()`);
  console.log('date:', date);
  assert.match(date.text, /^.+ · [A-Z][a-z]{2} \d+ · Y\d+$/, 'season and short date at phone width');
  assert.ok(date.text.startsWith(date.season), 'the map\'s own season name, as the top bar has it');
  assert.ok(date.top < 2 && date.h <= 390 * 0.06 + 1, 'inside the top letterbox bar');
  assert.equal(date.op, '1');
  console.log('PASS date in the top bar');

  // click an elk: locked, and it stays past the shot's length
  let p = await findAnimal('usual view');
  await b.evaluate(click(p.x, p.y));
  let s = await b.evaluate(state);
  console.log('after click:', s);
  assert.equal(s.locked, p.id, 'locked onto the clicked animal'); assert.equal(s.shot, p.id); assert.ok(s.held, "held past the shot"); assert.ok(s.chip, 'the Locked chip shows');
  await b.evaluate(`(() => { const w=${S}.ui.watch; w.shuffle.follow=true; w.shot.t=100; })()`);
  await pause(600);
  s = await b.evaluate(state);
  assert.equal(s.shot, p.id, 'still on it long past the usual shot, with shuffle on');
  // a click on empty ground lets go (the chip goes; the director carries on from this shot)
  const empty = await b.evaluate(`(() => { const {game:g,renderer:r}=${S}; for (let y=70;y<r.vh-90;y+=20) for (let x=60;x<r.vw-60;x+=20) if(!r.pickAgent(g,x,y,48)) return {x,y}; return null; })()`);
  assert.ok(empty, 'an empty spot to click');
  await b.evaluate(click(empty.x, empty.y));
  s = await b.evaluate(state);
  assert.equal(s.locked, null, 'empty ground lets go'); assert.ok(!s.chip); assert.ok(!s.held);
  // lock again, then Esc: lets go but keeps watching; a second Esc leaves
  p = await findAnimal('again');
  await b.evaluate(click(p.x, p.y));
  assert.equal((await b.evaluate(state)).locked, p.id);
  await b.evaluate(`window.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))`);
  s = await b.evaluate(state);
  assert.ok(s.on && s.locked === null, 'Esc lets go and stays in watch mode');
  console.log('PASS click to lock, release by empty ground and Esc');

  // at eye level: a click (through the eye's camera) locks, Next lets go
  await b.evaluate(`${S}.ui.watch.setEyeLevel(true)`);
  await b.waitFor(`${S}.renderer.eyeOn`, 'eye level on', 15000);
  await pause(800);
  p = await findAnimal('eye level');
  await b.evaluate(click(p.x, p.y));
  s = await b.evaluate(state);
  assert.equal(s.locked, p.id, 'locked at eye level'); assert.ok(s.held, "held past the shot");
  assert.equal(await b.evaluate(`${S}.renderer.eyeAgent?.id`), p.id, 'the eye rides with it');
  await b.evaluate(`document.querySelector('#watch .w-lock').click()`);
  assert.equal((await b.evaluate(state)).locked, null, 'the chip\'s ✕ lets go');
  await b.evaluate(`${S}.ui.watch.stop()`);
  await pause(1600);
  console.log('PASS eye level');

  // two fingers on the map: a twist turns it round the ground between them, a pinch's wobble doesn't
  const twist = (deg, steps = 12) => `(() => { const {renderer:r}=${S}, cv=r.canvas, rc=cv.getBoundingClientRect(), cx=rc.left+420, cy=rc.top+200, R=90;
    r.fly=null; r.zoomGoal=null;
    const at = (a) => [0,1].map(i => new Touch({identifier:i,target:cv,clientX:cx+Math.cos(a+i*Math.PI)*R,clientY:cy+Math.sin(a+i*Math.PI)*R}));
    const send = (type, ts) => cv.dispatchEvent(new TouchEvent(type,{bubbles:true,cancelable:true,touches:ts,targetTouches:ts,changedTouches:ts}));
    const g0 = r.groundPoint(420, 200), az0 = r.az; send('touchstart', at(0));
    for (let k=1;k<=${steps};k++) send('touchmove', at(${deg}*Math.PI/180*k/${steps}));
    send('touchend', []);
    const g1 = r.groundPoint(420, 200);
    return { turned: (r.az-az0)*180/Math.PI, slid: Math.hypot(g1.x-g0.x, g1.z-g0.z) }; })()`;
  const wob = await b.evaluate(twist(6));
  console.log('6° wobble:', wob);
  assert.ok(Math.abs(wob.turned) < 0.01, 'a pinch\'s few degrees of wobble don\'t turn the map');
  const tw = await b.evaluate(twist(60));
  console.log('60° twist:', tw);
  assert.ok(Math.abs(Math.abs(tw.turned) - (60 - 0.2 * 180 / Math.PI)) < 1, 'turns by the twist past the first few degrees');
  assert.ok(tw.slid < 0.05, 'the ground between the fingers stays put');
  // the map turns the way the fingers do: twisted clockwise, the ground under the right-hand finger
  // moves down with it (the tilted view foreshortens it, so not all the way)
  const follow = await b.evaluate(`(() => { const {renderer:r}=${S}, cv=r.canvas, rc=cv.getBoundingClientRect(); r.fly=null;
    const before=r.groundPoint(510,200), ts=a => [0,1].map(i => new Touch({identifier:i,target:cv,clientX:rc.left+420+Math.cos(a+i*Math.PI)*90,clientY:rc.top+200+Math.sin(a+i*Math.PI)*90}));
    const send=(type,t) => cv.dispatchEvent(new TouchEvent(type,{bubbles:true,cancelable:true,touches:t,targetTouches:t,changedTouches:t}));
    send('touchstart',ts(0)); for (let k=1;k<=12;k++) send('touchmove',ts(0.8*k/12)); send('touchend',[]);
    const p=r.project(before.x,before.y,before.z); return { dx:p.x-510, dy:p.y-200 }; })()`);
  console.log('ground under the right finger moved (px):', follow);
  assert.ok(follow.dy > 20 && follow.dx < 0, 'a clockwise twist turns the map clockwise under the fingers');
  console.log('PASS two-finger twist');
  assert.deepEqual(b.errors, [], 'no page errors');
} finally {
  await b.close();
}
