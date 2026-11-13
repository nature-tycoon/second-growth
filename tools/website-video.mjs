// Video studio for the website (tools/capture-site-video.mjs drives it): one clip from
// website-video-clips.mjs, filmed through the production renderer and simulation a frame at a time
// (fixed timestep, so motion is smooth however slow the machine), encoded in this page with
// WebCodecs (H.264 for MP4, VP9 for WebM) and wrapped by video-mux.mjs.
import {Renderer} from '../js/render3d/scene.js';
import {SPEEDS,ANIMAL_SPEEDS} from '../js/config.js';
import {momentsUpdate} from '../js/sim/moments.js';
import {releaseGame} from './release-fixtures.mjs';
import {posing} from './website-moment-fixtures.mjs';
import {CLIPS} from './website-video-clips.mjs';
import {muxMp4,muxWebm} from './video-mux.mjs';

const DAY_CYCLE=360; // scene.js: seconds in the renderer's day (todClock)
const params=new URLSearchParams(location.search);
const clip=CLIPS.find(c=>c.id===params.get('clip'));
window.websiteVideo={ready:false};
try{
  if(!clip)throw Error('Unknown clip '+params.get('clip'));
  const fps=30,dt=1/fps,{game:g}=releaseGame(clip.map,'forest'),placed=[];
  const shot=clip.setup(g,posing(g,placed),g.wildlife);
  g.wildlife.recount();
  const r=new Renderer(document.getElementById('view'),{preserveDrawingBuffer:true});
  r.applySettings({quality:'high',qualityChosen:true,shadows:true,wind:true,dayCycle:true,weather:false});
  r.autoRes=false;r.todClock=clip.time*DAY_CYCLE;
  r.drawFX=()=>r.ux.clearRect(0,0,r.ui.width,r.ui.height);
  const ui={clean:true,overlay:'none'};
  // (a tall 9:16 frame keeps the zoom, so the animals stay as big on a phone: it shows less ground either side)
  const W=r.gl.domElement.width,H=r.gl.domElement.height,vertical=H>W;
  const fade=clip.loop==='crossfade'?fps:0,frames=Math.round(clip.seconds*fps),rendered=frames+fade;

  // ---- the camera: map shots glide through their keys, eye shots ride behind the focus animal
  const ease={linear:u=>u,inout:u=>u*u*u*(u*(u*6-15)+10)};
  const cr=(p0,p1,p2,p3,t)=>.5*(2*p1+(p2-p0)*t+(2*p0-5*p1+4*p2-p3)*t*t+(3*p1-p0-3*p2+p3)*t*t*t);
  const shots=shot.shots.map((s,n)=>({...s,from:n?shot.shots[n-1].until:0}));
  // (heights along the path come from the keys, not the ground under each frame, so hills don't jog the view)
  const where=k=>k.focus?{...k,x:shot.focus.x,y:shot.focus.y}:k;
  for(const s of shots)if(s.camera==='map')s.keys=s.keys.map(k=>{if(k.focus)return k;r.centerOn(k.x,k.y);return {...k,h:r.target.y};});
  function mapCamera(s,t){
    const end=Math.min(s.until,rendered/fps);
    // (a closed path repeats every clip.seconds, so rendered frame L+j matches frame j under the crossfade)
    const u=s.closed?((t-s.from)/clip.seconds)%1:ease[s.ease||'linear'](Math.min(1,Math.max(0,(t-s.from)/(end-s.from))));
    // (a closed path comes back to its first key, so a crossfade loop only blends the animals)
    const K=s.keys,n=s.closed?K.length:K.length-1,f=u*n,i=Math.min(n-1,Math.floor(f)),v=f-i;
    const at=j=>{const k=where(s.closed?K[(j+K.length)%K.length]:K[j]);if(k.focus){r.centerOn(k.x,k.y);k.h=r.target.y;}return k;};
    // (an open path's ends are carried straight on past its first and last keys, so a two-key path
    // moves at one steady speed rather than easing in and out by itself: the clip's ease decides that)
    const past=(p,q)=>({x:2*p.x-q.x,y:2*p.y-q.y,h:2*p.h-q.h,az:2*p.az-q.az,zoom:p.zoom*p.zoom/q.zoom});
    const b=at(i),c=at(i+1),a=s.closed||i>0?at(i-1):past(b,c),d=s.closed||i+2<=n?at(i+2):past(c,b);
    const p=key=>cr(a[key],b[key],c[key],d[key],v);
    r.setEyeLevel(null);r.followAgent=null;
    r.zoom=Math.exp(cr(...[a,b,c,d].map(k=>Math.log(k.zoom)),v));
    r.az=r.azTarget=p('az');
    r.centerOn(p('x'),p('y'),p('h'));
  }
  // A follow shot is the game's own follow camera (Renderer.updateAnimalCamera: centred on the animal's
  // drawn body, its height eased), so a bird above the crowns or a gibbon up in them stays in frame;
  // the clip only sets the zoom and a slow turn, from zoom[0]/az[0] to zoom[1]/az[1].
  function followCamera(s,t){
    const end=Math.min(s.until,rendered/fps),u=Math.min(1,Math.max(0,(t-s.from)/(end-s.from)));
    if(r.followAgent!==shot.focus){r.setEyeLevel(null);r.centerOn(shot.focus.x,shot.focus.y);r.followAgent=shot.focus;}
    r.zoom=Math.exp(Math.log(s.zoom[0])+(Math.log(s.zoom[1])-Math.log(s.zoom[0]))*u);
    r.az=r.azTarget=s.az[0]+(s.az[1]-s.az[0])*u;
  }
  const shotAt=t=>shots.find(s=>t<s.until)||shots[shots.length-1];
  function camera(t){const s=shotAt(t);if(s.camera==='map')mapCamera(s,t);else if(s.camera==='follow')followCamera(s,t);else if(r.eyeAgent!==shot.focus)r.setEyeLevel(shot.focus);return s;}

  // ---- the animals: the game's own per-step updates (Game.update), the calendar held
  const pace=clip.pace;g.speed=pace;g.wildlife.lifePace=SPEEDS[pace]/ANIMAL_SPEEDS[pace];
  function simulate(seconds){
    let days=seconds*ANIMAL_SPEEDS[pace];
    while(days>0){const d=Math.min(days,.05);g.wildlife.update(d);g.visitors.update(d);g.mapDefinition.update?.(g,d);days-=d;}
    momentsUpdate(g);
  }
  // A clip can start some way into its scene (preroll seconds, stepped a frame at a time as filming
  // does, so a staged hunt reaches the same moment it did when it was planned): the slow part of a
  // stalk happens before the camera rolls.
  for(let i=0;i<Math.round((clip.preroll||0)*fps);i++)simulate(dt);
  // Settle: plants built and models compiled for both cameras, so nothing pops in on the first frames.
  let clock=0;
  const settle=()=>{for(let n=0;n<240&&(n<6||r.floraPending||r.flora.waitingRegions?.size);n++){clock+=500;r.diagnosticTime=clock;r.draw(g,ui,0);}};
  camera(0);settle();
  if(shots.some(s=>s.camera==='eye')){r.setEyeLevel(shot.focus);settle();camera(0);settle();}

  const out=new OffscreenCanvas(W,H),ctx=out.getContext('2d');
  function compose(){
    // the page backdrop past the horizon, as photo mode paints it (Renderer.capture)
    const bg=ctx.createRadialGradient(W/2,H*.35,0,W/2,H*.35,Math.hypot(W,H)*.6);
    bg.addColorStop(0,'#56715a');bg.addColorStop(.55,'#34493a');bg.addColorStop(1,'#1f2c24');
    ctx.globalAlpha=1;ctx.fillStyle=bg;ctx.fillRect(0,0,W,H);ctx.drawImage(r.gl.domElement,0,0);
  }
  async function record({mp4Bitrate,webmBitrate,samples=[],posterWidth=W}){
    const keyEvery=Math.round((clip.keyEvery??2)*fps),chunks={mp4:[],webm:[]};let description=null,failed=null;
    const encoder=(key,config)=>{
      const e=new VideoEncoder({output:(chunk,meta)=>{
        const data=new Uint8Array(chunk.byteLength);chunk.copyTo(data);
        chunks[key].push({data,timestamp:chunk.timestamp,key:chunk.type==='key'});
        if(meta?.decoderConfig?.description)description=new Uint8Array(ArrayBuffer.isView(meta.decoderConfig.description)?meta.decoderConfig.description.buffer:meta.decoderConfig.description);
      },error:e=>{failed=e;}});
      e.configure({width:W,height:H,framerate:fps,bitrateMode:'variable',latencyMode:'quality',...config});return e;
    };
    // (H.264 High and VP9 profile 0: level 4 up to 1920×1080, level 5 for 2560×1440)
    const big=W*H>2097152,codecs={mp4:big?'avc1.640032':'avc1.640028',webm:big?'vp09.00.50.08':'vp09.00.40.08'};
    const mp4=encoder('mp4',{codec:codecs.mp4,bitrate:mp4Bitrate,avc:{format:'avc'}});
    const webm=encoder('webm',{codec:codecs.webm,bitrate:webmBitrate});
    const head=[],sampled={},path=[],change=[],small=new OffscreenCanvas(320,Math.round(320*H/W));let previous=null;let poster=null,dissolveFrom=null,lastShot=null;
    for(let i=0;i<rendered;i++){
      if(failed)throw failed;
      const t=i/fps;
      if(i)simulate(dt);
      const s=camera(t);
      if(s!==lastShot&&s.dissolve&&lastShot)dissolveFrom={image:await createImageBitmap(out),at:t};
      lastShot=s;clock+=1000/fps;r.diagnosticTime=clock;
      r.draw(g,ui,i?dt:0);r.gl.getContext().finish();
      compose();
      if(dissolveFrom){
        const k=(t-dissolveFrom.at)/s.dissolve;
        if(k>=1){dissolveFrom.image.close();dissolveFrom=null;}
        else{ctx.globalAlpha=1-k*k*(3-2*k);ctx.drawImage(dissolveFrom.image,0,0);ctx.globalAlpha=1;}
      }
      path.push(r.eyeOn?{t:+t.toFixed(3),eye:[r.eye.pos.x,r.eye.pos.y,r.eye.pos.z].map(v=>+v.toFixed(3))}:{t:+t.toFixed(3),x:+r.target.x.toFixed(3),y:+r.target.z.toFixed(3),zoom:+r.zoom.toFixed(4),az:+r.az.toFixed(4)});
      // the crossfade: the first second is kept and dissolved in under the last one
      if(i<fade){head.push(await createImageBitmap(out));continue;}
      const k=i-fade;
      if(k>=frames-fade){const j=k-(frames-fade);ctx.globalAlpha=(j+1)/fade;ctx.drawImage(head[j],0,0);ctx.globalAlpha=1;head[j].close();}
      // how much each frame differs from the one before (a pop or a jump shows as a spike)
      {const x=small.getContext('2d',{willReadFrequently:true});x.drawImage(out,0,0,small.width,small.height);
        const d=x.getImageData(0,0,small.width,small.height).data;
        if(previous){let sum=0;for(let p=0;p<d.length;p+=4)sum+=Math.abs(d[p]-previous[p])+Math.abs(d[p+1]-previous[p+1])+Math.abs(d[p+2]-previous[p+2]);change.push(sum/(d.length/4*3));}
        previous=d;}
      const frame=new VideoFrame(out,{timestamp:Math.round(k*1e6/fps),duration:Math.round(1e6/fps)});
      for(const e of [mp4,webm])e.encode(frame,{keyFrame:k%keyEvery===0});
      frame.close();
      // (the poster stays at the page's size, 1920 wide, even when the clip is filmed bigger (and as filmed when
    // smaller: the reel's 1600): it is the
      // still the page loads first. The sample frames are full size, to judge sharpness by)
      if(k===0)poster=await jpeg(out,.88,posterWidth);
      if(samples.includes(k))sampled[k]=base64(await jpeg(out,.9));
      while(mp4.encodeQueueSize>3||webm.encodeQueueSize>3)await new Promise(done=>setTimeout(done,5));
    }
    await mp4.flush();await webm.flush();mp4.close();webm.close();
    if(failed)throw failed;
    if(!description)throw Error('The H.264 encoder gave no avcC description');
    const files={
      mp4:muxMp4({width:W,height:H,fps,description,chunks:chunks.mp4}),
      webm:muxWebm({width:W,height:H,fps,chunks:chunks.webm}),
    };
    window.websiteVideo.files={...files,poster};
    // (the median change, and the biggest jumps: frame k is the change from frame k-1 to k)
    const sorted=[...change].sort((a,b)=>a-b),median=sorted[sorted.length>>1];
    const jumps=change.map((v,k)=>({frame:k+1,change:+v.toFixed(2),times:+(v/Math.max(median,.05)).toFixed(1)})).sort((a,b)=>b.change-a.change).slice(0,3);
    return {width:W,height:H,fps,frames,rendered,keyEvery,codecs,path,motion:{median:+median.toFixed(2),jumps},
      sizes:{mp4:files.mp4.length,webm:files.webm.length,poster:poster.length},samples:sampled};
  }
  async function jpeg(canvas,quality,width=canvas.width){
    let source=canvas;
    if(width!==canvas.width){source=new OffscreenCanvas(width,Math.round(canvas.height*width/canvas.width));source.getContext('2d').drawImage(canvas,0,0,source.width,source.height);}
    return new Uint8Array(await (await source.convertToBlob({type:'image/jpeg',quality})).arrayBuffer());
  }
  // a slice of an encoded file as base64, for the capture script to read back in pieces
  function base64(b){let s='';for(let i=0;i<b.length;i+=32768)s+=String.fromCharCode(...b.subarray(i,i+32768));return btoa(s);}
  const slice=(name,start,length)=>base64(window.websiteVideo.files[name].subarray(start,start+length));
  window.websiteVideo={ready:true,clip:{id:clip.id,title:clip.title,map:clip.map,kind:clip.kind,seconds:clip.seconds,preroll:clip.preroll||0,loop:clip.loop,time:clip.time,pace:clip.pace},
    description:shot.description,moment:shot.moment?{key:shot.moment.key,title:shot.moment.title,stage:shot.moment.stage,day:shot.moment.day,date:shot.moment.date}:null,
    focus:shot.focus?{key:shot.focus.key,id:shot.focus.id}:null,
    posed:placed.map(({key,x,y})=>({key,x,y})),
    shots:shot.shots.map(({until,camera,keys,ease,closed,dissolve,zoom,az})=>({until:until===Infinity?null:until,camera,keys,ease,closed,dissolve,zoom,az})),
    vertical,game:g,renderer:r,record,slice};
}catch(error){window.websiteVideo={ready:true,error:error.stack||String(error)};throw error;}
