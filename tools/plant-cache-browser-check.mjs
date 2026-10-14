// Pixel-check cached pans against precise batching without resetting the retained cache.
import assert from 'node:assert/strict';
import { openBrowser } from './browser-session.mjs';
const results = [];
// Software rendering on CI needs a separate time budget and fresh GPU buffers per case.
for (const map of ['pnw', 'sumatra', 'serengeti', 'amazon', 'atlanta', 'chinandega', 'reef']) for (const quality of ['fast', 'high']) {
  console.log('Checking plant cache: ' + map + '/' + quality);
  const browser = await openBrowser({ label: 'plant-cache-' + map + '-' + quality, software: !!process.env.CI });
  try {
    await browser.navigate('/tools/plant-view-review.html?map=' + map);
    await browser.waitFor('!!window.plantReview', 'Plant review boot');
    const result = await browser.evaluate(`(async()=>{
    const review=window.plantReview,map=${JSON.stringify(map)},quality=${JSON.stringify(quality)};
    const {editPlants}=await import('/tools/plant-performance-fixtures.mjs');
    const fullReference=()=>{
      const {flora,gl,ctx,scene,camera}=review.get(),sources=[],batches=[];
      for(const pool of flora.pools.values())for(const p of pool.subs.values())if(p.mesh){sources.push([p.mesh,p.mesh.parent]);if(p.mesh.parent!==scene)scene.add(p.mesh);}
      for(const b of flora.plantView.batches.values())if(b.mesh){batches.push([b.mesh,b.mesh.visible]);b.mesh.visible=false;}
      try{
        gl.shadowMap.needsUpdate=false;gl.render(scene,camera);
        const pixels=new Uint8Array(gl.domElement.width*gl.domElement.height*4);
        ctx.readPixels(0,0,gl.domElement.width,gl.domElement.height,ctx.RGBA,ctx.UNSIGNED_BYTE,pixels);
        return pixels;
      }finally{
        for(const [mesh,parent] of sources){if(parent&&mesh.parent!==parent)parent.add(mesh);else if(!parent)scene.remove(mesh);}
        for(const [mesh,visible] of batches)mesh.visible=visible;
      }
    };
    const reference=()=>{
      const {flora,gl,ctx,scene,camera}=review.get(),view=flora.plantView;
      const state={previous:view.previous.slice(),matrix:view.matrix.clone(),frustum:view.frustum.clone(),
        version:view.version,enabled:view.enabled,cameraReady:view.cameraReady,orthographic:view.orthographic,
        panMargin:view.panMargin,incremental:view.incremental,selections:view.selections,stats:{...view.stats}};
      const batches=[...view.batches.values()].map(batch=>({batch,fields:{...batch,indices:batch.indices.slice()},
        matrices:batch.mesh?.instanceMatrix.array.slice(),colors:batch.mesh?.instanceColor.array.slice(),
        count:batch.mesh?.count,visible:batch.mesh?.visible,sphere:batch.mesh?.boundingSphere?.clone()}));
      try{
        view.configure({panMargin:0,incremental:false});view.selections=new WeakMap();
        flora.updateView(camera);gl.shadowMap.needsUpdate=false;gl.render(scene,camera);
        const pixels=new Uint8Array(gl.domElement.width*gl.domElement.height*4);
        ctx.readPixels(0,0,gl.domElement.width,gl.domElement.height,ctx.RGBA,ctx.UNSIGNED_BYTE,pixels);
        return pixels;
      }finally{
        for(const saved of batches){
          if(saved.batch.mesh!==saved.fields.mesh)throw new Error('Precise view exceeded padded capacity');
          Object.assign(saved.batch,saved.fields);const mesh=saved.batch.mesh;
          if(mesh){
            mesh.instanceMatrix.array.set(saved.matrices);mesh.instanceMatrix.clearUpdateRanges();mesh.instanceMatrix.needsUpdate=true;
            mesh.instanceColor.array.set(saved.colors);mesh.instanceColor.clearUpdateRanges();mesh.instanceColor.needsUpdate=true;
            mesh.count=saved.count;mesh.visible=saved.visible;mesh.boundingSphere=saved.sphere;
          }
        }
        Object.assign(view,state);
      }
    };
    {
      review.setup(map);review.detail(quality);
      review.view(.8,Math.PI/4,40,32);
      const sourceDiff=review.compare(review.draw(true).pixels,fullReference());
      if(sourceDiff.changed>8||sourceDiff.max>32)throw new Error('Complete source reference: '+JSON.stringify(sourceDiff));
      let reused=0,changed=0,max=0;
      for(let frame=0;frame<24;frame++){
        review.view(.8,Math.PI/4,40+frame*.12,32+frame*.06);
        const {flora}=review.get(),before=flora.plantView.stats.updates;
        const actual=review.draw(true).pixels,expected=reference();
        reused+=flora.plantView.stats.updates===before;
        const diff=review.compare(actual,expected);changed=Math.max(changed,diff.changed);max=Math.max(max,diff.max);
        if(diff.changed>8||diff.max>32)throw new Error(map+'/'+quality+'/pan '+frame+': '+JSON.stringify(diff));
      }
      if(reused<12)throw new Error('Panning cache did not reuse enough frames: '+reused);
      const result={map,quality,reused,changed,max};
      for(const [zoom,az] of [[1.5,Math.PI/4],[.8,Math.PI/2],[.2,Math.PI]]){
        review.view(zoom,az,43,34);const diff=review.compare(review.draw(true).pixels,reference());
        if(diff.changed>8||diff.max>32)throw new Error('Zoom/rotation clipping: '+JSON.stringify(diff));
      }
      const {flora,game}=review.get();
      review.view(.8,Math.PI/4,43,34);
      const checkEdit=label=>{const diff=review.compare(review.draw(true).pixels,reference());if(diff.changed>8||diff.max>32)throw new Error(label+': '+JSON.stringify(diff));};
      editPlants(game,43,34);
      while(flora.rebuild(game,false,1))checkEdit('Regional edit');
      checkEdit('Last regional edit');
      flora.setFade(true);checkEdit('Transparent sources');
      flora.setFade(false);checkEdit('Opaque sources restored');
      const site=[...flora.treeSites.values()][0];
      if(site){flora.showCanopySites(new Set([site]));checkEdit('Canopy scaffold');flora.showCanopySites(new Set());checkEdit('Canopy cleared');}
      await review.yieldPaint();
      return result;
    }
    })()`, 240000);
    browser.assertHealthy();
    results.push(result);
    console.log('PASS ' + JSON.stringify(result));
  } finally { await browser.close(); }
}
assert.equal(results.length, 14);
