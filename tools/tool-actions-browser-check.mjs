// Real mouse and touch gestures must use the shared paid action and Undo path.
import assert from 'node:assert/strict';
import { openBrowser } from './browser-session.mjs';

const browser = await openBrowser({ label: 'tool-actions' });
try {
  await browser.send('Page.addScriptToEvaluateOnNewDocument', { source: `
    localStorage.setItem('second-growth-settings', JSON.stringify({analytics:false,autosave:false,music:false,nature:false,quality:'fast',shadows:false,fps:'30',v:2}));
    sessionStorage.setItem('second-growth-pending', JSON.stringify({map:'pnw',mode:'free',difficulty:'standard'}));
  ` });
  await browser.navigate('/');
  await browser.waitFor('!!window.secondGrowth && (!document.getElementById("loading-screen") || document.getElementById("loading-screen").classList.contains("done"))', 'Game boot');
  const helpers = `window.prepareToolGesture = async () => {
    const {game:g,ui,renderer:r}=window.secondGrowth;
    const {toolCost,TOOLS}=await import('/js/tools.js');
    if(ui.modalOpen) ui.closeModal();
    g.newGame(1987,'free','standard','pnw');g.speed=0;g.autosave=false;ui.afterNewGame();
    ui.openCategory('land');ui.selectTool('raise');ui.setBrush(0);ui.tuckToolPanel();
    const w=g.world,x=40,y=40;
    r.setWorld(g);r.fly=null;r.zoomGoal=null;r.zoom=1.2;r.centerOn(x+.5,y+.5);r.updateCamera();
    const p=r.project(x+.5,r.heightAtScene(x+.5,y+.5),y+.5);
    if(document.elementFromPoint(p.x,p.y)!==r.canvas) throw new Error('Tool target is covered by the interface');
    const tile=r.screenToTile(p.x,p.y);
    if(tile.x!==x || tile.y!==y) throw new Error('Tool target projection missed the tile');
    window.gestureBefore={money:g.money,price:toolCost(g,TOOLS.raise,w.idx(x,y)),height:[...w.vh]};
    return p;
  };
  window.checkToolGesture = () => {
    const {game:g,ui}=window.secondGrowth,before=window.gestureBefore;
    const changed=g.world.vh.some((height,i)=>height!==before.height[i]);
    const result={changed,spent:before.money-g.money,price:before.price,used:g.stats.used.raise,undo:ui.undo.last?.count};
    ui.undoLast();
    result.refunded=g.money===before.money;
    result.restored=g.world.vh.every((height,i)=>height===before.height[i]);
    return result;
  };`;
  await browser.evaluate(helpers);

  const mouse = await browser.evaluate('window.prepareToolGesture()');
  await browser.send('Input.dispatchMouseEvent', { type: 'mousePressed', button: 'left', buttons: 1, clickCount: 1, ...mouse });
  await browser.send('Input.dispatchMouseEvent', { type: 'mouseMoved', buttons: 1, ...mouse });
  await browser.send('Input.dispatchMouseEvent', { type: 'mouseReleased', button: 'left', buttons: 0, clickCount: 1, ...mouse });
  const mouseResult = await browser.evaluate('window.checkToolGesture()');
  assert.ok(mouseResult.changed && mouseResult.refunded && mouseResult.restored);
  assert.equal(mouseResult.spent, mouseResult.price);
  assert.equal(mouseResult.used, 1); assert.equal(mouseResult.undo, 1);
  console.log('PASS Real mouse stroke charges one tile, records Undo and restores the landscape');

  await browser.send('Emulation.setDeviceMetricsOverride', { width: 844, height: 390, deviceScaleFactor: 1, mobile: true });
  await browser.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  await browser.send('Emulation.setEmulatedMedia', { features: [{ name: 'pointer', value: 'coarse' }, { name: 'hover', value: 'none' }] });
  await browser.navigate('/');
  await browser.waitFor('!!window.secondGrowth && (!document.getElementById("loading-screen") || document.getElementById("loading-screen").classList.contains("done"))', 'Phone game boot');
  await browser.evaluate(helpers);
  const touch = await browser.evaluate('window.prepareToolGesture()');
  await browser.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [touch] });
  await browser.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  const touchResult = await browser.evaluate('window.checkToolGesture()');
  assert.ok(touchResult.changed && touchResult.refunded && touchResult.restored);
  assert.equal(touchResult.spent, touchResult.price);
  assert.equal(touchResult.used, 1); assert.equal(touchResult.undo, 1);
  console.log('PASS Real phone tap uses the same payment, statistics and Undo path');

  const benchmark = await browser.evaluate(`(async () => {
    const {measureGameplay}=await import('/tools/gameplay-benchmark.mjs');
    const result=await measureGameplay({map:'pnw',scene:'planting',quality:'fast',samples:2,warmup:1});
    return {samples:result.samples,revision:result.benchmark_revision};
  })()`);
  assert.equal(benchmark.samples, 2);
  assert.equal(benchmark.revision, 'ecosystem-profile-2');
  console.log('PASS Live planting benchmark exercises the production action controller');
  browser.assertHealthy();
} finally { await browser.close(); }
