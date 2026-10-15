// A clear, repeatable jump between two disconnected woody tree scaffolds.
// The rendered cylinders and the bark-contact records share exact dimensions.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/BufferGeometryUtils.js';
import { canopyFixture } from './canopy-support-fixture.mjs';
import { CanopySite } from '../js/render3d/canopy-support.js';
import { Flora } from '../js/render3d/flora.js';
import { Actors } from '../js/render3d/actors.js';
import { PLANT } from '../js/data/plants.js';

export function howlerJumpFixture(scene, prototype=true, drop=0, map='amazon', animal='howler') {
  const {game,a}=canopyFixture(map,animal);game.selectedAgent=a;
  for(const x of [40,41])game.world.setPlant(game.world.idx(x,32),PLANT[map==='amazon'?'fig':map==='sumatra'?'meranti':'guanacaste'],1);
  a.x=40.5;a.y=32.5;a.state='walk';game.speed=0;
  const flora=new Flora(scene),sites=[];
  for(const i of [0,1]) {
    const reverse=i===1,root=reverse?.35:-.35;
    const branch=new THREE.CylinderGeometry(.025,.025,.9,12).rotateZ(Math.PI/2).translate(0,1,0);
    const trunk=new THREE.CylinderGeometry(.045,.06,1,12).translate(root,.5,0);
    const geo=mergeGeometries([branch,trunk]);branch.dispose();trunk.dispose();
    geo.setAttribute('color',new THREE.Float32BufferAttribute(Array(geo.attributes.position.count).fill([.7,.62,.48]).flat(),3));
    geo.userData.canopyBranches=[{from:[reverse?.45:-.45,1,0],to:[reverse?-.45:.45,1,0],r0:.025,r1:.025}];
    geo.userData.canopyTrunks=[{from:[root,0,0],to:[root,1,0],r0:.06,r1:.045}];
    const site=new CanopySite(geo,[i?41.35:40.25,i?-drop:0,32.5,1,1,1,0],[.75,.67,.54],game.world.idx(40+i,32),PLANT[map==='amazon'?'fig':map==='sumatra'?'meranti':'guanacaste'],[40+i,32]);
    sites.push(site);flora.treeSites.set(site.tile,site);flora.geos.set(`jump-${i}`,geo);
    site.anchor=(x,z,previous,reach,hanging,body)=>site.endpoint(0,i?0:1,{reach,hanging,body});
  }
  flora.showCanopySites=()=>Flora.prototype.showCanopySites.call(flora,new Set(sites));
  const actors=new Actors(scene,flora,{canopyWalkerMotion:prototype});actors.clean=true;
  actors.update(game,new THREE.Vector3(1,0,0),1);
  const st=actors.pose.get(a.id),mo=[...actors.fauna.species.values()][0].motion;
  const end=sites[1].anchor(a.x,a.y,null,mo.len*st.sc*.34,false,{motion:mo,scale:st.sc});
  return {game,a,scene,flora,actors,site:sites[0],sites,end,prototype};
}
