import assert from 'node:assert/strict';
import { register } from 'node:module';
register('./three-loader.mjs', import.meta.url);
const THREE=await import('three');
const { canopyFixture }=await import('./canopy-support-fixture.mjs');
const { buildSpecies, faunaMaterial }=await import('../js/render3d/fauna.js');
const { ANIMAL }=await import('../js/data/animals.js');
const { howlerJoint }=await import('../js/render3d/howler-motion.js');

// Check the real built mesh, not just the shared profile's formulas.
for(const [map,animal] of [['amazon','howler'],['amazon','spider'],['sumatra','langur'],['chinandega','congo'],['chinandega','capuchin']]) {
  canopyFixture(map,animal);
  const def=ANIMAL[animal],{geo,motion:mo}=buildSpecies(def);
  assert.equal(mo.canopyWalkerMotion,true,'applicable game models use the shared movement by default');
  const parts=geo.attributes.aPart,pivots=geo.attributes.aPivot;
  for(let i=0;i<4;i++) {
    let upper=0,lower=0;
    const root=mo.howlerRoots[i],bend=mo.howlerBends[i],tip=mo.howlerTips[i];
    assert.ok(howlerJoint(root,bend,tip,tip).joint.distanceTo(bend)<1e-6,'neutral solving reproduces the built elbow/knee');
    for(let v=0;v<parts.count;v++)if(parts.getX(v)===i+1) {
      const pivot=new THREE.Vector3().fromBufferAttribute(pivots,v);
      if(pivot.distanceTo(bend)<1e-5)lower++;
      else {assert.ok(pivot.distanceTo(root)<1e-5,'each segment uses its actual anatomical pivot');upper++;}
    }
    assert.ok(upper&&lower,'all four limbs have distinct rigid upper and lower segments');
  }
  assert.ok(Math.abs(mo.canopyJoints[2].y/mo.len-(def.sprite.long?.62:.45))<1e-7,'long-limbed species retain their leg height');
  const material=faunaMaterial(mo);
  assert.match(material.customProgramCacheKey(),/canopy-walker-joints/);
  material.dispose();geo.dispose();
  const legacy=buildSpecies({...def,sprite:{...def.sprite,canopyWalkerMotion:false}});
  assert.equal(legacy.motion.canopyWalkerMotion,false,'the comparison can still render the previous movement');legacy.geo.dispose();
  console.log(`PASS ${animal}: default shared movement, matching joints, species proportions and legacy comparison`);
}
for(const [map,animal] of [['sumatra','orangutan'],['sumatra','siamang'],['sumatra','macaque'],['amazon','sloth']]) {
  canopyFixture(map,animal);
  const model=buildSpecies(ANIMAL[animal]);
  assert.ok(!model.motion.canopyWalkerMotion,'other climbing and ground movement profiles stay separate');model.geo.dispose();
}
console.log('PASS orangutan, siamang, macaque and sloth retain their own movement profiles');
