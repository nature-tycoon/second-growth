// Offline artwork studio: current production scenes, no player saves or animation loop.
import * as THREE from 'three';
import {Renderer} from '../js/render3d/scene.js';
import {websiteMoment} from './website-moment-fixtures.mjs';
import {Game} from '../js/game.js';
import {releaseGame} from './release-fixtures.mjs';
import {T,isWater} from '../js/config.js';
import {passable,shallows} from '../js/sim/animal-terrain.js';
const params=new URLSearchParams(location.search),map=params.get('map')||'pnw';
window.websiteScene={ready:false};
try {
  let g;
  const stage=params.get('stage');
  if(stage){
    g=new Game();
    const response=await fetch('/dist/website-capture-source/creek-'+stage+'.json');
    if(!response.ok||!g.restoreSave(await response.json()))throw Error('Cannot restore creek capture '+stage);
  }else g=releaseGame(map,'forest').game;
  const w=g.world;
  const placed=[];
  function pose(key,tx,ty,habitat='land',orientation=-.5){
    const def=g.catalog.animal[key];if(!def)throw Error('Unknown capture species '+map+':'+key);
    let best=Infinity,tile=-1;
    for(let y=ty-4;y<=ty+4;y++)for(let x=tx-4;x<=tx+4;x++){
      if(!w.inb(x,y))continue;const i=w.idx(x,y),d=(x-tx)**2+(y-ty)**2;
      const water=isWater(w.terrain[i]);
      const suitable=habitat==='tree'?w.tree[i]&&w.treeG[i]>.6:habitat==='reef'?w.tileH(x,y)<5&&!w.tree[i]&&!w.shrub[i]:habitat==='water'?water:habitat==='shallows'?shallows(w,i):!water&&!w.tree[i];
      if(suitable&&passable(w,i,def)&&w.struct[i]<0&&!placed.some(a=>a.tile===i)&&d<best){tile=i;best=d;}
    }
    if(tile<0)throw Error('No capture habitat for '+key);
    const x=tile%w.w+.5,y=Math.floor(tile/w.w)+.5;
    const a=g.wildlife.spawn(def,x,y,{silent:true,age:Math.max(480,def.mature*120+1)});
    Object.assign(a,{x,y,tx:x,ty:y,wait:1000,orientation,hunger:0,thirst:0,phase:0});
    placed.push({key,tile,x,y});return a;
  }
  let keystone=null;
  if(params.has('moments')){
    keystone=websiteMoment(g,pose);
    placed.splice(0,placed.length,...g.wildlife.agents.map(a=>({key:a.key,tile:w.idx(Math.floor(a.x),Math.floor(a.y)),x:a.x,y:a.y,state:a.state,juvenile:!!a.juvenile})));
  }
  if(!stage&&!keystone){
    if(map==='pnw'){
      for(let y=54;y<=61;y++)for(let x=55;x<=57;x++){const i=w.idx(x,y);w.tree[i]=0;w.treeG[i]=0;}
      pose('elk',59,55);pose('elk',60,57);pose('deer',58,59);pose('beaver',55,59);pose('heron',54,57,'shallows');pose('woodduck',54,55,'water');
    }
    if(map==='amazon'){
      pose('capybara',51,48);pose('capybara',51,50);pose('macaw',54,46,'tree');pose('howler',56,48,'tree');
    }
    if(map==='serengeti')for(let k=0;k<15;k++)pose(k%3===0?'zebra':'wildebeest',Math.round(44+(k%5)*1.9+Math.sin(k*2)*1.3),Math.round(40+Math.floor(k/5)*2.3+Math.cos(k*2.1)*1.1),'land',-.8+Math.sin(k*1.6)*1.3);
    if(map==='chinandega')for(let k=0;k<4;k++)pose('cattle',42+k*2,43+k%2,'land',-.7);
    if(map==='reef'){
      for(const [key,x,y] of [['greenturtle',57,60],['parrotfish',53,61],['tang',55,62],['butterfly',54,59],['chromis',56,59],['chromis',57,59],['chromis',56,60]])pose(key,x,y,'reef');
    }
    if(map==='sumatra'){pose('orangutan',61,39,'tree');pose('siamang',64,37,'tree');}
    g.wildlife.recount();
  }
  g.speed=0;
  const r=new Renderer(document.getElementById('view'),{preserveDrawingBuffer:true});
  r.applySettings({quality:'high',qualityChosen:true,shadows:true,wind:false,dayCycle:false,weather:false});r.autoRes=false;r.time=17;r.az=r.azTarget=Math.PI/4;
  r.drawFX=()=>r.ux.clearRect(0,0,r.ui.width,r.ui.height);
  const frames={pnw:[57,58,1.75],amazon:[53,48,2.1],serengeti:[48,43,2],atlanta:[31,25,1.35],chinandega:[45,44,1.25],reef:[55,61,2.7],sumatra:[61,39,2.65,2]};
  // A supported, level branch and a front-facing camera make the ape's face
  // readable. This only chooses a study pose; production models are unchanged.
  let portraitReady=false;
  function prepareOrangutanPortrait(){
    if(portraitReady||keystone?.key!=='orangutans')return;
    const a=keystone.focus;
    r.zoom=keystone.frame[2];r.centerOn(a.x,a.y);
    for(let n=0;n<3;n++)r.draw(g,{clean:true,overlay:'none'},.1);
    let st=r.actors.pose.get(a.id);const original=st?.branch,site=original?.site;
    if(!site||!st.revealMatrix)throw Error('Portrait needs a supported canopy pose');
    site.prepare();
    const candidates=site.branches.map((branch,index)=>({branch,index}))
      .filter(({branch})=>branch.length>=original.reach*2)
      .sort((a,b)=>Math.abs(a.branch.dir.y)-Math.abs(b.branch.dir.y)).slice(0,8);
    const settle=index=>{
      const anchor=site.anchor(a.x,a.y,{...original,index},original.reach,false,original.body);
      if(!anchor||anchor.index!==index)return null;
      let yaw=Math.atan2(-anchor.direction.z,anchor.direction.x);
      if(anchor.direction.y<0)yaw+=Math.PI;
      a.orientation=-yaw;
      Object.assign(st,{branch:anchor,branchAt:anchor,branchPoint:null,branchRoute:null,branchPitch:0,branchRoll:0,branchYaw:0,yaw,gripFeet:null,canopyQuaternion:null});
      for(let n=0;n<3;n++)r.draw(g,{clean:true,overlay:'none'},.1);
      st=r.actors.pose.get(a.id);
      return new THREE.Vector3(1,0,0).transformDirection(st.revealMatrix);
    };
    let best=null;
    for(const {index} of candidates){
      const forward=settle(index);if(!forward)continue;
      const score=Math.abs(forward.y-.25);
      if(!best||score<best.score)best={index,score};
      if(score<.15)break;
    }
    if(!best)throw Error('No supported portrait branch found');
    const forward=settle(best.index);
    r.az=r.azTarget=Math.atan2(forward.x,forward.z);
    r.frame={x:.61,y:.47};r.frameGoal={...r.frame};
    keystone.camera={az:r.az,placement:{...r.frame},branch:best.index,faceDirection:forward.toArray()};
    keystone.description+=' The review portrait uses a level supporting branch and a camera aligned with the animal’s face.';
    portraitReady=true;
  }
  function capture(center=keystone?.frame||(stage?[54,73,2.4]:frames[map])){
    r.resize();prepareOrangutanPortrait();r.zoom=center[2];r.centerOn(center[0],center[1],center[3]??null);r.updateCamera();
    for(let n=0;n<(keystone?12:4);n++){
      r.draw(g,{clean:true,overlay:'none'},keystone ? .1 : 0);
      if(keystone?.focus&&n===1){r.centerOnAnimal(keystone.focus);r.updateCamera();}
    }
    r.gl.getContext().finish();
    return r.canvas.toDataURL('image/jpeg',.9);
  }
  capture();window.websiteScene={ready:true,game:g,renderer:r,placed,capture,frame:keystone?.frame||(stage?[54,73,2.4]:frames[map]),moment:keystone?{key:keystone.key,title:keystone.title,stage:keystone.stage,description:keystone.description,day:keystone.day,date:keystone.date,camera:keystone.camera}:null};
}catch(error){window.websiteScene={ready:true,error:error.stack||String(error)};throw error;}
