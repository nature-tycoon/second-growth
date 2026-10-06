// Anatomy regressions for species that used to inherit the wrong shared model.
import assert from 'node:assert/strict';
import { register } from 'node:module';
register('./three-loader.mjs', import.meta.url);
const {loadAnimals, ANIMALS} = await import('../js/data/animals.js');
const {buildSpecies, faunaMaterial} = await import('../js/render3d/fauna.js');
const {Box3, Vector3} = await import('three');
const models = new Map();
for (const map of ['pnw','atlanta','amazon','chinandega','sumatra','serengeti']) {
  loadAnimals((await import(`../js/data/animals-${map}.js`)).default);
  for (const def of ANIMALS) models.set(`${map}/${def.key}`, {...buildSpecies(def), sprite:def.sprite});
}
const get = (map,key) => {const m=models.get(`${map}/${key}`);assert(m,`${map}/${key} exists`);return m;};
function bounds(m, part, extended=false, filter=()=>true) {
  const box=new Box3(),p=m.geo.attributes[extended?'aExt':'position'],parts=m.geo.attributes.aPart;
  for(let i=0;i<p.count;i++)if(parts.getX(i)===part && filter(p.getX(i),p.getY(i),p.getZ(i)))box.expandByPoint(new Vector3().fromBufferAttribute(p,i));
  assert(!box.isEmpty(),`Part ${part} has vertices`);return box;
}
const size=b=>b.getSize(new Vector3());
const coati=get('chinandega','coati'), opossum=get('atlanta','opossum');
for (const [m,flag] of [[coati,'coati'],[opossum,'opossum']]) {
  const generic=buildSpecies({sprite:{...m.sprite,[flag]:false}});
  const tail=size(bounds(m,5)), oldTail=size(bounds(generic,5));
  if(flag==='coati')assert(bounds(m,5).max.y>bounds(m,0).max.y && bounds(generic,5).max.y<bounds(generic,0).max.y,'Coati carries its tail above its back');
  else assert(tail.z<oldTail.z*.45,'Opossum has a thin bare tail');
  generic.geo.dispose();
}
const owl=get('atlanta','owl');
const horned=buildSpecies({sprite:{...owl.sprite,barred:false}});
assert(bounds(owl,8).max.y<bounds(horned,8).max.y,'Barred owl has no horned-owl tufts');horned.geo.dispose();
const bill=get('chinandega','spoonbill');
const tip=size(bounds(bill,8,false,x=>x>bill.sprite.size*.83));
assert(tip.z>tip.y*2.3,'Spoonbill tip is a flat, broad spatula');
const ridley=get('chinandega','seaturtle');
assert(size(bounds(ridley,1)).z>ridley.sprite.size*.4,'Ridley has long front flippers');
for(const key of ['pnw/bat','atlanta/bat','chinandega/bat','sumatra/flyingfox']) {
  const m=models.get(key);assert(m,`${key} exists`);
  const rest=size(bounds(m,6)), flight=size(bounds(m,6,true));
  assert(flight.z>rest.z*2,`${key}: folded wings tuck in beside the body`);
  assert(rest.y>rest.z*.65,`${key}: folded membrane wraps vertically`);
}
const lion=get('serengeti','lion');
const lowerLeg=size(bounds(lion,1,false,(x,y)=>y<lion.sprite.leg*.3));
assert(lowerLeg.z<lion.sprite.leg*.32,'Lion has tapered lower legs and compact paws');
const dolphin=get('amazon','dolphin');
// Trace the lower jaw in narrow axial bins: it should rise smoothly into the beak,
// without the notch produced by tilted rings at the head/body transition.
const jaw=new Map(),positions=dolphin.geo.attributes.position,parts=dolphin.geo.attributes.aPart,L=dolphin.sprite.size;
for(let i=0;i<positions.count;i++)if(parts.getX(i)===0){
  const x=positions.getX(i)/L,y=positions.getY(i)/L;
  if(x>.25&&x<.6){const bin=Math.floor(x*100);jaw.set(bin,Math.min(jaw.get(bin)??Infinity,y));}
}
const outline=[...jaw].sort((a,b)=>a[0]-b[0]);assert(outline.length>20,'Jaw outline has enough samples');
for(let i=1;i<outline.length;i++)assert(outline[i][1]>=outline[i-1][1]-.001&&outline[i][1]-outline[i-1][1]<.015,'Dolphin throat blends smoothly into its lower jaw');
assert(dolphin.motion.verticalWave===1,'Dolphin swims vertically');
const flukes=size(bounds(dolphin,5));assert(flukes.z>flukes.y*5,'Dolphin has horizontal flukes');
const mat=faunaMaterial(dolphin.motion), shader={uniforms:{},vertexShader:''};
mat.onBeforeCompile(shader);assert(shader.uniforms.uVerticalWave.value===1,'Vertical motion reaches the shader');mat.dispose();
for(const m of models.values())m.geo.dispose();
console.log('Species anatomy and folded-wing/swimming regressions passed.');
