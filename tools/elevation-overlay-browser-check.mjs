// The Elevation overlay holds steady through a long Raise and Lower drag (ideas 2026-11-22 s3).
// Reshaping the ground used to throw the overlay's mesh away on every stroke and make it again only on
// the scene's next 800 ms overlay refresh, so the overlay blinked off and on while the player dragged.
// This drags real mouse strokes back and forth with the overlay on and counts, frame by frame, the
// frames where it wasn't drawn (must be 0), and checks its colours followed the new heights.
import assert from 'node:assert/strict';
import { openBrowser } from './browser-session.mjs';

const browser = await openBrowser({ label: 'elevation-overlay' });
try {
  await browser.send('Page.enable');
  await browser.send('Page.addScriptToEvaluateOnNewDocument', { source: `
    localStorage.setItem('second-growth-settings', JSON.stringify({analytics:false,autosave:false,music:false,nature:false,quality:'fast',shadows:false,fps:'30',v:2}));
    sessionStorage.setItem('second-growth-pending', JSON.stringify({map:'pnw',mode:'free',difficulty:'standard'}));
  ` });
  await browser.navigate('/');
  await browser.waitFor('!!window.secondGrowth && (!document.getElementById("loading-screen") || document.getElementById("loading-screen").classList.contains("done"))', 'Game boot');
  const path = await browser.evaluate(`(()=>{
    const {game:g,ui,renderer:r}=window.secondGrowth;
    if(ui.modalOpen) ui.closeModal();
    g.newGame(1987,'free','standard','pnw');g.speed=0;g.autosave=false;g.money=1e7;ui.afterNewGame();
    ui.openCategory('land');ui.selectTool('raise');ui.setBrush(1);ui.tuckToolPanel();
    const y=40;
    r.setWorld(g);r.fly=null;r.zoomGoal=null;r.zoom=.8;r.centerOn(39.5,y+.5);r.updateCamera();
    r.draw(g,ui.state,0);
    const pts=[];
    for(let x=40;x<=46;x++){
      const p=r.project(x+.5,r.heightAtScene(x+.5,y+.5),y+.5);
      if(document.elementFromPoint(p.x,p.y)!==r.canvas) {const e=document.elementFromPoint(p.x,p.y);throw new Error('Drag path is covered by the interface: '+(e?.id||e?.className)+' at '+Math.round(p.x)+','+Math.round(p.y)+' of '+innerWidth+'x'+innerHeight);}
      pts.push({x:p.x,y:p.y});
    }
    // every drawn frame: is the overlay there, and did the ground change since the last one?
    const probe=window.overlayProbe={};
    const draw=r.draw;
    r.draw=function(...a){const out=draw.apply(this,a);const o=this.terrain.overlay,on=!!(o&&o.visible);
      probe.frames++;const ed=g.world.hv!==probe.hv;probe.hv=g.world.hv;if(ed)probe.edited++;
      if(!on){probe.off++;if(ed)probe.offAfterEdit++;}return out;};
    const col=()=>{const o=r.terrain.overlay;if(!o)return null;const c=o.geometry.attributes.color.array,i=g.world.idx(42,y);return [c[i*24],c[i*24+1],c[i*24+2]].join();};
    window.overlayColour=col;
    return pts;
  })()`);
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const drag = async tool => {
    await browser.evaluate(`window.secondGrowth.ui.selectTool('${tool}');window.secondGrowth.ui.tuckToolPanel()`);
    await browser.send('Input.dispatchMouseEvent', { type: 'mousePressed', button: 'left', buttons: 1, clickCount: 1, ...path[0] });
    for (let pass = 0; pass < 3; pass++) {
      const run = pass % 2 ? [...path].reverse() : path;
      for (const p of run) { await browser.send('Input.dispatchMouseEvent', { type: 'mouseMoved', buttons: 1, ...p }); await wait(45); }
    }
    await browser.send('Input.dispatchMouseEvent', { type: 'mouseReleased', button: 'left', buttons: 0, clickCount: 1, ...path.at(-1) });
    await wait(300);
  };
  await browser.evaluate(`import('/js/config.js').then(m=>{window.sgConfig=m})`);
  // the overlay sits on the reshaped ground (not just shown): its corner at an edited tile is the ground's height + 0.03
  const lifted = `(()=>{const {game:g,renderer:r}=window.secondGrowth,{LEVEL}=window.sgConfig,o=r.terrain.overlay,i=g.world.idx(42,40);
    return !!o&&Math.abs(o.geometry.attributes.position.array[i*18+1]-(g.world.vert(42,40)*LEVEL+.03))<1e-4;})()`;
  // Elevation (recoloured as the ground moves), then Moisture (redone on the 800 ms refresh, so only
  // the kept mesh holds it steady between)
  for (const mode of ['elevation', 'moisture']) {
    await browser.evaluate(`(()=>{const {game:g,ui}=window.secondGrowth;ui.setOverlay('${mode}');
      Object.assign(window.overlayProbe,{frames:0,edited:0,off:0,offAfterEdit:0,hv:g.world.hv});window.colourBefore=window.overlayColour();})()`);
    await wait(300);
    await drag('raise');
    await drag('lower');
    await drag('raise');
    const r = await browser.evaluate(`({...window.overlayProbe,overlay:window.secondGrowth.ui.state.overlay,changed:window.overlayColour()!==window.colourBefore})`);
    console.log(`${mode}: frames ${r.frames}, frames with reshaped ground ${r.edited}, overlay missing ${r.off} (${r.offAfterEdit} right after an edit)`);
    assert.ok(r.edited >= 10, `the drags reshaped the ground on enough frames (${r.edited})`);
    assert.equal(r.overlay, mode, 'the overlay stays chosen');
    assert.equal(r.off, 0, `the ${mode} overlay is drawn on every frame of the drags`);
    assert.ok(await browser.evaluate(lifted), 'the overlay follows the reshaped ground');
    if (mode === 'elevation') assert.ok(r.changed, 'elevation colours follow the reshaped ground');
    // and Undo, another height change outside the brush
    await browser.evaluate(`window.secondGrowth.ui.undoLast()`); await wait(400);
    const u = await browser.evaluate(`({off:window.overlayProbe.off,edited:window.overlayProbe.edited})`);
    assert.ok(u.edited > r.edited, 'Undo reshaped the ground'); assert.equal(u.off, 0, 'the overlay stays on through Undo');
    assert.ok(await browser.evaluate(lifted), 'the overlay follows the ground after Undo');
  }
  browser.assertHealthy();
  console.log('PASS Elevation and Moisture overlays stay on, with no gaps, through Raise and Lower drags and Undo');
} finally { await browser.close(); }
