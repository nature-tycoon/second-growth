// Fresh review-only header captures from current production models, never old images.
// Run with nice -n 15. The scene is a restored habitat fixture with posed wildlife.
import {mkdir,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {openBrowser,projectRoot} from './browser-session.mjs';
const out=fileURLToPath(new URL('../website/review-media/',import.meta.url));
await mkdir(out,{recursive:true});
const browser=await openBrowser({label:'header-review',width:2400,height:1200});
const captures=[];
try {
  await browser.navigate('/tools/release-scenes.html?map=pnw&quality=high');
  await browser.waitFor('window.releaseScene?.ready','Current habitat renderer');
  await browser.evaluate(`(async()=>{
    const {game:g,error}=window.releaseScene;if(error)throw Error(error);
    const {ANIMAL}=await import('/js/data/animals.js');
    const {isWater}=await import('/js/config.js');
    const {passable,shallows}=await import('/js/sim/animal-terrain.js');
    // Thin only the staged fixture's foreground bank so small species are readable.
    // Production world generation and species scales are unchanged.
    const w=g.world;
    for(let y=54;y<=61;y++)for(let x=55;x<=57;x++){
      const i=w.idx(x,y);w.tree[i]=0;w.treeG[i]=0;
    }
    window.releaseScene.renderer.markTileDirty();
    const occupied=new Set();
    const subjects=[
      ['elk',59,55,'land',-.65],['elk',60,57,'land',-.2],
      ['deer',58,59,'land',.5],['beaver',55,59,'bank',.3],
      ['heron',54,57,'shallows',-.5],
      ['woodduck',54,55,'water',.4],['woodduck',54,60,'water',-.2]
    ];
    for(const [key,tx,ty,habitat,orientation] of subjects){
      const w=g.world,def=ANIMAL[key];let tile=-1,best=Infinity;
      for(let y=ty-2;y<=ty+2;y++)for(let x=tx-2;x<=tx+2;x++){
        if(!w.inb(x,y))continue;const i=w.idx(x,y),d=(x-tx)**2+(y-ty)**2;
        const water=isWater(w.terrain[i]);
        const suitable=habitat==='water'?water:habitat==='shallows'?shallows(w,i):!water;
        if(suitable&&passable(w,i,def)&&!w.tree[i]&&w.struct[i]<0&&!occupied.has(i)&&d<best){tile=i;best=d;}
      }
      if(tile<0)throw Error('No suitable capture position for '+key);
      occupied.add(tile);const x=tile%w.w+.5,y=Math.floor(tile/w.w)+.5;
      const a=g.wildlife.spawn(def,x,y,{silent:true,age:480});
      Object.assign(a,{x,y,tx:x,ty:y,wait:1000,orientation,hunger:0,thirst:0,flying:false});
    }
    g.wildlife.recount();
  })()`);
  for(const [file,width,height,zoom,cx,cy] of [['header-desktop.jpg',2400,1200,3.1,54,58.5],['header-mobile.jpg',1200,1600,2.1,54,52]]){
    await browser.send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});
    const data=await browser.evaluate(`(()=>{
      const {renderer:r,game:g}=window.releaseScene;
      r.resize();r.zoom=${zoom};r.centerOn(${cx},${cy});r.updateCamera();
      for(let n=0;n<3;n++)r.draw(g,{clean:true,overlay:'none'},0);
      return r.canvas.toDataURL('image/jpeg',.88);
    })()`);
    const bytes=Buffer.from(data.split(',')[1],'base64');await writeFile(out+file,bytes);
    captures.push({file,width,height,zoom,center:[cx,cy],sha256:createHash('sha256').update(bytes).digest('hex')});
  }
  browser.assertHealthy();
  const provenance={sourceRevision:execFileSync('git',['rev-parse','HEAD'],{cwd:projectRoot,encoding:'utf8'}).trim(),capturedAt:new Date().toISOString(),map:'pnw',scene:'Seeded restored Pacific Northwest creek habitat with a thinned foreground bank and posed Roosevelt elk, black-tailed deer, North American beaver, great blue heron and wood ducks; not a campaign playthrough.',camera:{az:Math.PI/4},captures};
  await writeFile(out+'header-provenance.json',JSON.stringify(provenance,null,2)+'\n');
  console.log('Fresh desktop and portrait header captures exported; provenance and hashes recorded.');
}finally{await browser.close();}
