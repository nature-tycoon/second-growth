// Ground route following is continuous; grid routes supply a safe corridor and destination.
import { T, clamp } from '../config.js';
import { passable } from './animal-terrain.js';
import { trailNode } from './animal-trails.js';
const angleDelta=(a,b)=>{let d=a-b;return d-Math.round(d/(Math.PI*2))*Math.PI*2;};
export const smoothWalker=def=>!def.reef&&(def.move==='ground'||def.move==='semi'&&!def.patrol);
// Check the swept segment and both sides of each diagonal boundary. Short look-ahead
// may round an open corner, but cannot cut through a fence, building, fire or pond.
export function walkSegmentSafe(w,a,x,y) {
  const count=Math.max(1,Math.ceil(Math.hypot(x-a.x,y-a.y)/.1));
  const startX=Math.floor(a.x),startY=Math.floor(a.y),crossing=w.catalog.animal[a.key]?.crossing;
  let px=startX,py=startY;
  // (the migration walks in from the far bank beyond the map's edge, as in stepToward)
  const outside=crossing&&!w.inb(startX,startY);
  const clear=(xx,yy)=>!w.inb(xx,yy)?outside:!w.fire[w.idx(xx,yy)]&&(passable(w,w.idx(xx,yy),a)||crossing&&w.terrain[w.idx(xx,yy)]===T.RIVER||xx===startX&&yy===startY);
  for(let k=1;k<=count;k++){
    const xx=Math.floor(a.x+(x-a.x)*k/count),yy=Math.floor(a.y+(y-a.y)*k/count);
    if(!clear(xx,yy)||xx!==px&&yy!==py&&(!clear(xx,py)||!clear(px,yy)))return false;
    px=xx;py=yy;
  }
  return true;
}
function node(w,a,j) {
  const p=a.range?.goal!=null?trailNode(w,j):[.5,.5];
  return [j%w.w+p[0],(j/w.w|0)+p[1]];
}
// Returns true only at the current waypoint, or after crossing its outgoing plane.
// Position and orientation change together; sharp turns slow or pivot when space is tight.
export function smoothWalk(wl,a,def,tx,ty,pace,dt,avoid=null) {
  const w=wl.game.world,path=a.path,last=path.length===1;
  const size=def.sprite.len||def.sprite.size||20;
  const look=clamp(.55+size*.014,.65,1.35);
  let gx=tx,gy=ty;
  if(!last) {
    let previous=[tx,ty],left=Math.max(0,look-Math.hypot(tx-a.x,ty-a.y));
    for(let k=path.length-2;k>=0&&k>=path.length-5&&left>0;k--){
      const next=node(w,a,path[k]),d=Math.hypot(next[0]-previous[0],next[1]-previous[1]);
      const f=Math.min(1,left/(d||1)),x=previous[0]+(next[0]-previous[0])*f,y=previous[1]+(next[1]-previous[1])*f;
      if(!walkSegmentSafe(w,a,x,y))break;
      gx=x;gy=y;left-=d;previous=next;
    }
  }
  const distance=Math.hypot(gx-a.x,gy-a.y);
  if(distance<.025)return last||Math.hypot(tx-a.x,ty-a.y)<.15;
  let desired=Math.atan2(gy-a.y,gx-a.x);
  if(avoid){const bearing=Math.atan2(avoid[1]-a.y,avoid[0]-a.x);desired+=clamp(angleDelta(bearing,desired),-.75,.75);pace*=Math.max(.65,avoid[2]);}
  const heading=a.walkHeading??desired;
  const turn=angleDelta(desired,heading),rate=clamp(5-size*.045,2.4,4.5);
  let next=heading+clamp(turn,-rate*dt,rate*dt);
  // A tight turn trades speed for rotation, instead of skating sideways or orbiting a point.
  const alignment=Math.max(0,Math.cos(angleDelta(desired,next)));
  let step=Math.min(pace*(.15+.85*alignment)*alignment,distance);
  const near=Math.hypot(tx-a.x,ty-a.y);
  if(last)step=Math.min(step,near);
  let nx=a.x+Math.cos(next)*step,ny=a.y+Math.sin(next)*step;
  if(!walkSegmentSafe(w,a,nx,ny)) {
    // The open corridor is too narrow for this arc. Pivot toward the safe waypoint.
    const bearing=Math.atan2(ty-a.y,tx-a.x);
    next=heading+clamp(angleDelta(bearing,heading),-rate*dt,rate*dt);
    step=0;nx=a.x;ny=a.y;
  }
  a.walkHeading=next;a.orientation=next;
  if(Math.abs(Math.cos(next))>.05)a.facing=Math.cos(next)>0?1:-1;
  if(step>1e-7){a.x=nx;a.y=ny;}
  if(last)return Math.hypot(a.x-tx,a.y-ty)<Math.max(.045,pace*.6);
  const following=node(w,a,path[path.length-2]),dx=following[0]-tx,dy=following[1]-ty;
  return near<.12 || (a.x-tx)*dx+(a.y-ty)*dy>=0 && near<look*1.8 && walkSegmentSafe(w,a,...following);
}
