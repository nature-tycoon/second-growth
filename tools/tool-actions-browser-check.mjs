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
  };
  window.prepareBrushStroke = async quality => {
    const {game:g,ui,renderer:r}=window.secondGrowth;
    const {T,BORDER}=await import('/js/config.js'),{settings}=await import('/js/settings.js');
    if(ui.modalOpen)ui.closeModal();
    g.newGame(1987,'free','standard','pnw');g.speed=0;g.autosave=false;ui.afterNewGame();
    ui.openCategory('visitors');ui.selectTool('boardwalk');ui.setBrush(0);ui.tuckToolPanel();
    const w=g.world,tiles=Array.from({length:8},(_,n)=>({x:77+n,y:55}));
    for(const {x,y} of tiles){const i=w.idx(x,y);w.clearPlants(i);w.terrain[i]=T.MUD;w.feature[i]=0;w.struct[i]=-1;}
    r.applySettings({...settings,quality,qualityChosen:true,shadows:false});r.autoRes=false;
    r.setWorld(g);r.fly=null;r.zoomGoal=null;r.zoom=.7;r.centerOn(80.5,55.5);r.updateCamera();
    r.draw(g,ui.state,0);r.flora.rebuild(g,true);
    r.lastFlora=performance.now();r.lastDay=g.day;r.dayDirty=0;r.editDirty=false;r.editArea=null;r.floraPending=false;r.floraEditPending=false;
    window.brushState={tiles,BORDER,paints:0,edits:[]};
    const update=r.terrain.updateSurface,mark=r.markTileDirty,draw=r.draw;
    r.terrain.updateSurface=function(...args){window.brushState.paints++;return update.apply(this,args);};
    r.markTileDirty=function(x,y){if(x!=null)window.brushState.edits.push({x,y,frame:this.frameN});return mark.call(this,x,y);};
    r.draw=function(...args){
      const result=draw.apply(this,args);
      for(const edit of window.brushState.edits){
        if(edit.visibleFrame!=null)continue;
        const cache=this.flora.tileCache[(edit.y+BORDER)*(w.w+BORDER*2)+edit.x+BORDER];
        if(cache.pools.slice(0,cache.n).includes(this.flora.pools.get('boardwalk')))edit.visibleFrame=this.frameN;
      }
      return result;
    };
    window.restoreBrushProbe=()=>{r.terrain.updateSurface=update;r.markTileDirty=mark;r.draw=draw;};
    return tiles.map(({x,y})=>{
      const p=r.project(x+.5,r.heightAtScene(x+.5,y+.5),y+.5);
      if(document.elementFromPoint(p.x,p.y)!==r.canvas)throw new Error('Brush path is covered by the interface');
      const hit=r.screenToTile(p.x,p.y);if(hit.x!==x||hit.y!==y)throw new Error('Brush path projection missed');
      return p;
    });
  };
  window.brushVisible = n => {
    const {game:g,renderer:r}=window.secondGrowth,{tiles,BORDER,paints}=window.brushState,{x,y}=tiles[n];
    const cache=r.flora.tileCache[(y+BORDER)*(g.world.w+BORDER*2)+x+BORDER];
    const pool=r.flora.pools.get('boardwalk'),mesh=r.flora.plantView.batches.get(pool)?.mesh;
    let drawn=false;
    if(mesh)for(let k=0;k<mesh.count;k++)if(Math.abs(mesh.instanceMatrix.array[k*16+12]-(x+.5))<.01&&Math.abs(mesh.instanceMatrix.array[k*16+14]-(y+.5))<.01)drawn=true;
    return drawn&&g.world.feature[g.world.idx(x,y)]!==0&&cache.pools.slice(0,cache.n).includes(pool)&&paints>0&&document.body.classList.contains('painting');
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

  const mousePath = await browser.evaluate("window.prepareBrushStroke('high')");
  await browser.send('Input.dispatchMouseEvent', { type: 'mousePressed', button: 'left', buttons: 1, clickCount: 1, ...mousePath[0] });
  for (let n = 0; n < mousePath.length; n++) {
    if (n) await browser.send('Input.dispatchMouseEvent', { type: 'mouseMoved', buttons: 1, ...mousePath[n] });
    await browser.waitFor(`window.brushVisible(${n})`, 'Mouse brush appears while held', 5000);
  }
  await browser.send('Input.dispatchMouseEvent', { type: 'mouseReleased', button: 'left', buttons: 0, clickCount: 1, ...mousePath.at(-1) });
  const mouseEdits = await browser.evaluate('window.brushState.edits');
  assert.equal(mouseEdits.length, 8);
  assert.ok(mouseEdits.every(e => e.visibleFrame - e.frame === 1), 'mouse edits appear on their first rendered frame');
  await browser.evaluate('window.restoreBrushProbe()');
  assert.equal(await browser.evaluate('window.secondGrowth.ui.undo.last.count'), 8);
  console.log('PASS Real held mouse brush becomes visible throughout a drag across plant regions');

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

  const touchPath = await browser.evaluate("window.prepareBrushStroke('fast')");
  await browser.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [touchPath[0]] });
  for (let n = 0; n < touchPath.length; n++) {
    if (n) await browser.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [touchPath[n]] });
    await browser.waitFor(`window.brushVisible(${n})`, 'Phone brush appears while held', 5000);
  }
  await browser.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  const touchEdits = await browser.evaluate('window.brushState.edits');
  assert.equal(touchEdits.length, 8);
  assert.ok(touchEdits.every(e => e.visibleFrame - e.frame === 1), 'phone edits appear on their first rendered frame');
  await browser.evaluate('window.restoreBrushProbe()');
  assert.equal(await browser.evaluate('window.secondGrowth.ui.undo.last.count'), 8);
  console.log('PASS Real held phone brush becomes visible throughout a drag across plant regions');

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
