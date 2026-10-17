// Persistent edge traffic, resource-site fidelity and bounded route reuse.
// The same simulation field drives the ground shader and plant openings.
import { T, F, isWater, clamp } from '../config.js';
import { trailProfile, TRAIL_RESOLUTION } from '../data/animal-trails.js';
import { passable } from './animal-terrain.js';
import { foodAt } from './animal-foraging.js';
import { hash2, valueNoise } from '../rng.js';
export const TRAIL_THRESHOLD = 0.09;
export function trailSurface(w, j) {
  return j >= 0 && j < w.n && !w.catalog.definition.look.underwater && !isWater(w.terrain[j]) && !w.flood[j] &&
    w.struct[j] < 0 && ![T.ROAD,T.GRAVEL,T.TRAIL].includes(w.terrain[j]) && w.feature[j] !== F.FENCE;
}
const strength = v => Math.sqrt(clamp(((v || 0) - TRAIL_THRESHOLD) / (0.55 - TRAIL_THRESHOLD), 0, 1));
// E, S, W, N, shared across boundaries. Roads/water/edits never retain a visual connection.
export function trailPorts(w, j, out = [0,0,0,0]) {
  out.fill(0);
  if (!trailSurface(w,j)) return out;
  const x=j%w.w, y=j/w.w|0;
  if(x+1<w.w && trailSurface(w,j+1)) out[0]=strength(w.trailE?.[j]);
  if(y+1<w.h && trailSurface(w,j+w.w)) out[1]=strength(w.trailS?.[j]);
  if(x>0 && trailSurface(w,j-1)) out[2]=strength(w.trailE?.[j-1]);
  if(y>0 && trailSurface(w,j-w.w)) out[3]=strength(w.trailS?.[j-w.w]);
  return out;
}
// Stable sub-tile centers give learned routes and their worn tracks the same
// gentle lateral variation. Shared edge crossings remain continuous at tile seams.
export function trailNode(w,j) {
  const x=j%w.w,y=j/w.w|0;
  return [.5+(valueNoise(x,y,2.8,731)-.5)*.48,.5+(valueNoise(x,y,2.8,947)-.5)*.48];
}
export function trailShape(w,j,out=[0,0,0,0]) {
  const c=trailNode(w,j),east=trailNode(w,j%w.w+1<w.w?j+1:j),south=trailNode(w,j+w.w<w.n?j+w.w:j);
  out[0]=c[0];out[1]=c[1];out[2]=(c[1]+east[1])*.5;out[3]=(c[0]+south[0])*.5;return out;
}
export function trailSample(w,x,y) {
  const a=w.trailDensity;if(!a)return 0;
  const R=TRAIL_RESOLUTION,W=w.w*R,H=w.h*R,fx=x*R-.5,fy=y*R-.5;
  const x0=Math.floor(fx),y0=Math.floor(fy),tx=fx-x0,ty=fy-y0;
  const at=(xx,yy)=>xx>=0&&yy>=0&&xx<W&&yy<H?a[yy*W+xx]||0:0;
  return (at(x0,y0)*(1-tx)+at(x0+1,y0)*tx)*(1-ty)+(at(x0,y0+1)*(1-tx)+at(x0+1,y0+1)*tx)*ty;
}
export function trailMask(w,j,u,v,margin=0) {
  if(!trailSurface(w,j))return 0;
  const x=j%w.w+u,y=(j/w.w|0)+v;
  let raw=trailSample(w,x,y);
  if(margin)for(const [dx,dy] of [[margin,0],[-margin,0],[0,margin],[0,-margin]])raw=Math.max(raw,trailSample(w,x+dx,y+dy));
  return strength(raw);
}
const densityStates=new WeakMap();
function densityState(w,create=false) {
  const R=TRAIL_RESOLUTION,n=w.n*R*R;
  if(!w.trailDensity&&!create)return null;
  if(w.trailDensity?.length!==n){const next=new Float32Array(n);if(w.trailDensity)next.set(w.trailDensity.subarray(0,n));w.trailDensity=next;}
  let s=densityStates.get(w);
  if(!s||s.array!==w.trailDensity){const active=new Set();for(let k=0;k<n;k++)if(w.trailDensity[k]>0)active.add(k);s={array:w.trailDensity,active};densityStates.set(w,s);}
  return s;
}
function traceTraffic(w,a,profile,x0,y0) {
  const s=densityState(w,true),R=TRAIL_RESOLUTION,W=w.w*R,H=w.h*R;
  const d=Math.hypot(a.x-x0,a.y-y0),samples=Math.max(1,Math.ceil(d*R*2)),radius=.28;
  const amount=profile.wear*(a.juvenile?.5:1)*d/samples*5;
  for(let k=0;k<samples;k++){
    const t=(k+.5)/samples,x=x0+(a.x-x0)*t,y=y0+(a.y-y0)*t;
    const minX=Math.max(0,Math.floor((x-radius)*R)),maxX=Math.min(W-1,Math.floor((x+radius)*R));
    const minY=Math.max(0,Math.floor((y-radius)*R)),maxY=Math.min(H-1,Math.floor((y+radius)*R));
    for(let py=minY;py<=maxY;py++)for(let px=minX;px<=maxX;px++){
      const distance=Math.hypot((px+.5)/R-x,(py+.5)/R-y);if(distance>=radius)continue;
      const j=(py/R|0)*w.w+(px/R|0);if(!trailSurface(w,j))continue;
      const i=py*W+px;s.array[i]=Math.min(1,s.array[i]+amount*(1-distance/radius));s.active.add(i);
      w.trod[j]=Math.max(w.trod[j],s.array[i]);
    }
  }
}

function ensure(w) {
  for(const key of ['trailE','trailS','trod']) if(w[key]?.length!==w.n) {
    const next=new Float32Array(w.n); if(w[key])next.set(w[key].subarray(0,w.n)); w[key]=next;
  }
}
export function decayTrails(w) {
  // Legacy stationary wear keeps its ecological decay, but draws no invented route.
  if(!w.trod && !w.trailE && !w.trailS && !w.trailDensity)return;
  ensure(w);
  const density=densityState(w);
  if(density){const W=w.w*TRAIL_RESOLUTION;for(const i of density.active){
    const j=((i/W|0)/TRAIL_RESOLUTION|0)*w.w+((i%W)/TRAIL_RESOLUTION|0);
    if(!trailSurface(w,j)||density.array[i]<.005){density.array[i]=0;density.active.delete(i);}else density.array[i]*=.985;
  }}
  w.trailMax=0;
  for(let j=0;j<w.n;j++) {
    w.trod[j]=w.trod[j]<.01?0:w.trod[j]*.985;
    if(w.trailE[j])w.trailE[j]=j%w.w+1<w.w && trailSurface(w,j) && trailSurface(w,j+1) && w.trailE[j]>.005?w.trailE[j]*.985:0;
    if(w.trailS[j])w.trailS[j]=j+w.w<w.n && trailSurface(w,j) && trailSurface(w,j+w.w) && w.trailS[j]>.005?w.trailS[j]*.985:0;
    w.trailMax=Math.max(w.trailMax,w.trailE[j],w.trailS[j]);
  }
}
function markEdge(w,a,from,to,amount) {
  if(!trailSurface(w,from)||!trailSurface(w,to))return;
  const key=Math.min(from,to), vertical=Math.abs(to-from)===w.w;
  if(a.trailEdge===key*2+(vertical?1:0) && a.age-(a.trailEdgeAge||0)<1)return;
  a.trailEdge=key*2+(vertical?1:0); a.trailEdgeAge=a.age;
  const field=vertical?w.trailS:w.trailE;
  field[key]=Math.min(1,field[key]+amount);
  w.trailMax=Math.max(w.trailMax||0,field[key]);
  w.trod[from]=Math.max(w.trod[from],field[key]);w.trod[to]=Math.max(w.trod[to],field[key]);
}
export function recordTrailStep(wl,a,def,x0,y0) {
  const profile=trailProfile(def),w=wl.game.world;
  if(!profile||a.state==='dormant'||a.flying||a.alt>.1)return;
  const d=Math.hypot(a.x-x0,a.y-y0);
  if(d<1e-5||d>2)return; // terrain recovery/teleports are not traffic
  ensure(w);traceTraffic(w,a,profile,x0,y0);
  let x=Math.floor(x0),y=Math.floor(y0);const ex=Math.floor(a.x),ey=Math.floor(a.y);
  if(!w.inb(x,y)||!w.inb(ex,ey)||x===ex&&y===ey)return;
  ensure(w);
  const dx=a.x-x0,dy=a.y-y0,sx=Math.sign(dx),sy=Math.sign(dy);
  let tx=dx?((sx>0?x+1:x)-x0)/dx:Infinity,ty=dy?((sy>0?y+1:y)-y0)/dy:Infinity;
  // Grid traversal records every crossed edge, independently of frame size.
  for(let k=0;k<6 && (x!==ex||y!==ey);k++) {
    const from=w.idx(x,y);
    if(tx<ty) {x+=sx;tx+=1/Math.abs(dx);} else {y+=sy;ty+=1/Math.abs(dy);}
    if(!w.inb(x,y))break;
    markEdge(w,a,from,w.idx(x,y),profile.wear*(a.juvenile?.5:1));
  }
}

// A* workspace belongs to a world and is reused. No graph rebuild or per-frame search.
const spaces=new WeakMap();
function workspace(w) {
  let s=spaces.get(w);if(!s){s={g:new Float64Array(w.n),parent:new Int32Array(w.n),steps:new Int32Array(w.n),seen:new Int32Array(w.n),stamp:0};spaces.set(w,s);}return s;
}
function edgeWear(w,i,j) {return Math.abs(i-j)===1?w.trailE?.[Math.min(i,j)]||0:w.trailS?.[Math.min(i,j)]||0;}
export function preferTrailPath(wl,a,def,original,canVisit=null,canPass=passable,learn=false) {
  const w=wl.game.world, p=trailProfile(def);
  if(!p||a.leaving||a.fromFire||!original||original.length<4||original.length>100)return original;
  if(w.trailMax==null)w.trailMax=Math.max(0,...[w.trailE,w.trailS].map(f=>f?f.reduce((n,v)=>Math.max(n,v),0):0));
  if(!learn&&w.trailMax<=TRAIL_THRESHOLD)return original;
  const start=w.idx(Math.floor(a.x),Math.floor(a.y)),dest=original[0], maxSteps=Math.floor(original.length*1.25)+2;
  if(start<0||start>=w.n)return original;
  const s=workspace(w),stamp=++s.stamp,heap=[];
  const distance=j=>Math.abs(j%w.w-dest%w.w)+Math.abs((j/w.w|0)-(dest/w.w|0));
  const push=(i,g)=>{const item=[i,g+distance(i)*.65,g];heap.push(item);let k=heap.length-1;while(k){const up=(k-1)>>1;if(heap[up][1]<=item[1])break;heap[k]=heap[up];k=up;}heap[k]=item;};
  const pop=()=>{const out=heap[0],last=heap.pop();if(heap.length){let k=0;while(k*2+1<heap.length){let n=k*2+1;if(n+1<heap.length&&heap[n+1][1]<heap[n][1])n++;if(last[1]<=heap[n][1])break;heap[k]=heap[n];k=n;}heap[k]=last;}return out;};
  s.seen[start]=stamp;s.g[start]=0;s.steps[start]=0;s.parent[start]=-1;push(start,0);
  for(let searched=0;heap.length&&searched<1800;searched++) {
    const [i,,cost]=pop();if(cost!==s.g[i])continue;
    if(i===dest){const path=[];for(let j=dest;j!==start;j=s.parent[j])path.push(j);return path;}
    const x=i%w.w,y=i/w.w|0;
    for(const [dx,dy] of [[1,0],[0,1],[-1,0],[0,-1]]) {
      const xx=x+dx,yy=y+dy;if(!w.inb(xx,yy))continue;const j=w.idx(xx,yy),steps=s.steps[i]+1;
      if(steps+distance(j)>maxSteps||!canPass(w,j,a)||w.fire[j]||canVisit&&!canVisit(j))continue;
      // Prefer established lanes mildly; dense brush and steep climbs cost more.
      const rise=Math.abs(w.tileH(xx,yy)-w.tileH(x,y));
      const next=cost+1-.35*strength(edgeWear(w,i,j))+.18*(w.shrub[j]?w.shrubG[j]:0)+Math.min(.6,rise*.3)+(learn?.8*valueNoise(xx,yy,3.5,450):0);
      if(s.seen[j]===stamp&&next>=s.g[j])continue;
      s.seen[j]=stamp;s.g[j]=next;s.steps[j]=steps;s.parent[j]=i;push(j,next);
    }
  }
  return original;
}
function resourceBend(wl,a,def,original,target,budget=original.length) {
  const w=wl.game.world,sx=Math.floor(a.x),sy=Math.floor(a.y),tx=target%w.w,ty=target/w.w|0;
  const dx=tx-sx,dy=ty-sy,length=Math.hypot(dx,dy);
  if(length<7)return original;
  const side=hash2(a.id,target,601)<.5?-1:1,bow=Math.min(3.4,Math.max(1.6,length*.18));
  const visit=j=>!w.fire[j];
  // A modest, stable sweep through the range, reusing this same course on return.
  // Try either side when terrain blocks the first; retain the safe original if
  // the detour would be excessive. Every waypoint is still reached by walking.
  for(const sign of [side,-side]) {
    const x=Math.round(sx+dx*.5-dy/length*bow*sign),y=Math.round(sy+dy*.5+dx/length*bow*sign);
    if(!w.inb(x,y))continue;const via=w.idx(x,y);
    if(!passable(w,via,a)||w.fire[via]||isWater(w.terrain[via]))continue;
    const probe={...a,path:null};
    if(!wl.pathTo(probe,j=>j===via,1800,null,visit))continue;
    const first=probe.path.slice();probe.x=x+.5;probe.y=y+.5;
    if(!wl.pathTo(probe,j=>j===target,1800,null,visit))continue;
    const joined=[...probe.path,...first];
    if(joined.length<=budget*1.35+2)return joined;
  }
  return original;
}

function siteValid(wl,a,def,j,feeding) {
  const w=wl.game.world;
  return Number.isInteger(j)&&trailSurface(w,j)&&!w.fire[j]&&passable(w,j,a)&&wl.suit[a.sp][j]>.15&&(!feeding||foodAt(wl,def,j));
}
export function rangeChoose(wl,a,def) {
  const p=trailProfile(def),w=wl.game.world;
  if(!p?.range||a.leaving||a.juvenile||a.mom!=null||a.fromFire||a.dormancy||a.drinkT||a.socialWith!=null||a.follow)return false;
  if(def.herd && a.herdOf != null && a.herdOf !== a.id)return false;
  const m=a.range;
  if(m&&(!siteValid(wl,a,def,m.feed,true)||!siteValid(wl,a,def,m.rest,false)))a.range=null;
  if(!a.range) {
    if(a.age<(a.rangeAfter||0))return false;
    a.rangeAfter=a.age+12;
    const x=Math.floor(a.x),y=Math.floor(a.y);if(!w.inb(x,y))return false;
    const start=w.idx(x,y),s=workspace(w),stamp=++s.stamp,queue=[start],use=wl.destinationUse(a.sp,a);
    s.seen[start]=stamp;let feed=-1,rest=-1,fs=0,rs=0;
    // A local home range, with real food and usable resting habitat. Different
    // individuals score sites differently and account for neighbours' destinations.
    for(let n=0;n<queue.length&&n<1600;n++) {
      const j=queue[n],xx=j%w.w,yy=j/w.w|0,d=Math.hypot(xx-x,yy-y);
      if(siteValid(wl,a,def,j,false)) {
        const room=1/(1+(use.get(j)||0)*1.5),hab=wl.suit[a.sp][j];
        const tie=.8+.2*hash2(j,a.id,909);
        if(d>=7&&d<=20&&foodAt(wl,def,j)) {
          const sc=hab*room*tie/(1+Math.abs(d-12)*.08);if(sc>fs){fs=sc;feed=j;}
        }
        if(d<=6) {
          const covered=w.tree[j]&&w.treeG[j]>.5||w.shrub[j]&&w.shrubG[j]>.4;
          const sc=hab*room*tie*(p.cover?(covered?1.4:.65):1)/(1+d*.12);
          if(sc>rs){rs=sc;rest=j;}
        }
      }
      for(const [dx,dy] of [[1,0],[0,1],[-1,0],[0,-1]]) {
        const nx=xx+dx,ny=yy+dy;if(!w.inb(nx,ny)||Math.abs(nx-x)>22||Math.abs(ny-y)>22)continue;
        const k=w.idx(nx,ny);if(s.seen[k]===stamp||w.fire[k]||!passable(w,k,a))continue;
        s.seen[k]=stamp;queue.push(k);
      }
    }
    if(feed<0||rest<0||Math.hypot(feed%w.w-rest%w.w,(feed/w.w|0)-(rest/w.w|0))<6)return false;
    a.range={feed,rest,next:'feed',after:a.age+1+(a.id%4),goal:null};
  }
  const r=a.range;
  if(a.age<r.after) {
    const near=Math.min(...[r.feed,r.rest].map(j=>Math.hypot(a.x-j%w.w-.5,a.y-(j/w.w|0)-.5)));
    if(near<3) {a.wait=Math.min(2,r.after-a.age);return true;}
    return false;
  }
  const target=r[r.next],distance=Math.hypot(a.x-(target%w.w+.5),a.y-((target/w.w|0)+.5));
  if(distance<2) {r.next=r.next==='feed'?'rest':'feed';r.goal=null;r.after=a.age+5+(a.id%5);return false;}
  // Families retain their own following decisions. A resource trip is still
  // interrupted by danger, thirst, feeding or a changed landscape.
  const visit=j=>!w.fire[j];
  // Reuse this individual's learned corridor in either direction, including a
  // short connector after local feeding. Revalidate every tile after terrain edits.
  let reused=false;
  if(Array.isArray(r.route) && r.route.length && r.route.every(j=>Number.isInteger(j)&&j>=0&&j<w.n&&passable(w,j,a)&&!w.fire[j])) {
    let at=0,nearest=Infinity;
    for(let k=0;k<r.route.length;k++){const j=r.route[k],d=Math.hypot(a.x-j%w.w-.5,a.y-(j/w.w|0)-.5);if(d<nearest){nearest=d;at=k;}}
    const via=r.route[at],here=w.idx(Math.floor(a.x),Math.floor(a.y));
    if(nearest<6 && (here===via||wl.pathTo(a,j=>j===via,700,null,visit))) {
      const connector=here===via?[]:a.path;
      const onward=r.next==='feed'?r.route.slice(at+1):r.route.slice(0,at).reverse();
      a.path=[...onward.reverse(),...connector];a.state='walk';reused=!!a.path.length;
    }
  }
  if(!reused) {
    if(!wl.pathTo(a,j=>j===target,1800,null,visit)) {a.range=null;a.rangeAfter=a.age+8;return false;}
    const budget=a.path.length;
    a.path=preferTrailPath(wl,a,def,a.path,visit,passable,true);
    a.path=resourceBend(wl,a,def,a.path,target,budget);
    const start=w.idx(Math.floor(a.x),Math.floor(a.y));
    r.route=[start,...a.path.slice().reverse()];if(r.next==='rest')r.route.reverse();
  }
  r.goal=target;r.after=a.age+.5;a.trip=null;return true;
}

// A resource trip keeps a deer/elk family within following distance. This is
// one linear pass over members, rather than scanning the herd for every leader.
export function rangePaces(wl) {
  const paces=new Map();
  for(const b of wl.agents) {
    const id=b.mom ?? b.herdOf;if(id==null||id===b.id||b.leaving)continue;
    const lead=wl.ids.get(id);if(lead?.range?.goal==null||lead.state!=='walk'||lead.fromFire)continue;
    if(!wl.game.catalog.animals[lead.sp].familyHerd)continue;
    const d=Math.hypot(lead.x-b.x,lead.y-b.y);
    if(d>3.2)paces.set(id,Math.min(paces.get(id)||1,d>6?.5:.7));
  }
  return paces;
}
