// Record the website's video loops from the real game: each clip in website-video-clips.mjs is
// filmed through the production renderer a frame at a time and encoded in headless Chrome
// (WebCodecs: H.264 MP4 and VP9 WebM, no ffmpeg needed), with a JPEG poster of its first frame.
// Files and provenance go to website/review-media/video/; sample frames for checking each clip
// by eye go to dist/website-video-frames/.
//
//   nice -n 15 node tools/capture-site-video.mjs                       every clip, 1920×1080
//   nice -n 15 node tools/capture-site-video.mjs --clips=moment-elk-rut  only these (the rest of the provenance is kept)
//   nice -n 15 node tools/capture-site-video.mjs --clips=... --vertical  also a 1080×1920 (9:16) version, for Shorts
//     (a clip with vertical: true in website-video-clips.mjs always gets one)
//
// Review them at http://localhost:8347/tools/website-video-review.html (python3 tools/serve.py).
import {mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {openBrowser,projectRoot} from './browser-session.mjs';
import {CLIPS} from './website-video-clips.mjs';

const out=fileURLToPath(new URL('../website/review-media/video/',import.meta.url));
const framesOut=fileURLToPath(new URL('../dist/website-video-frames/',import.meta.url));
const arg=name=>process.argv.find(a=>a.startsWith(`--${name}=`))?.slice(name.length+3);
const ids=arg('clips')?.split(',')||CLIPS.map(c=>c.id);
for(const id of ids)if(!CLIPS.some(c=>c.id===id))throw Error(`Unknown clip ${id}. Clips: ${CLIPS.map(c=>c.id).join(', ')}`);
const vertical=process.argv.includes('--vertical');
// About 2.5–4 MB for ten seconds at 1920×1080: sharp enough for a full-width hero, light enough for a phone.
const BITRATE={mp4:2.9e6,webm:2.3e6};
const BUDGET=4.6e6; // bytes per video file (website-check allows 5 MB)
await mkdir(out,{recursive:true});
const provenanceFile=out+'video-provenance.json';
const previous=await readFile(provenanceFile,'utf8').then(JSON.parse).catch(()=>null);
const hash=b=>createHash('sha256').update(b).digest('hex');
const git=(...a)=>execFileSync('git',a,{cwd:projectRoot,encoding:'utf8'}).trim();
const revision=git('rev-parse','HEAD'),dirty=git('status','--porcelain','--','js','vendor','index.html','styles.css').length>0;
if(dirty)console.warn('Warning: the game has uncommitted changes; the provenance records HEAD plus local edits.');
const clips=[];
const browser=await openBrowser({label:'site-video',software:false,width:1920,height:1080});
try{
  const {gpu}=await browser.evaluate('(()=>{const c=new OffscreenCanvas(1,1).getContext("webgl2"),d=c.getExtension("WEBGL_debug_renderer_info");return {gpu:d?c.getParameter(d.UNMASKED_RENDERER_WEBGL):"unknown"};})()');
  console.log('Rendering on',gpu);
  for(const id of ids)for(const tall of vertical||CLIPS.find(c=>c.id===id).vertical?[false,true]:[false]){
    const [width,height]=tall?[1080,1920]:[1920,1080],name=id+(tall?'-vertical':'');
    await browser.send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});
    await browser.navigate('/tools/website-video.html?clip='+id);
    await browser.waitFor('window.websiteVideo?.ready','Video studio for '+id,300000);
    const error=await browser.evaluate('window.websiteVideo.error');if(error)throw Error(error);
    const meta=await browser.evaluate('(({clip,description,moment,focus,posed,shots,vertical})=>({clip,description,moment,focus,posed,shots,vertical}))(window.websiteVideo)');
    const clip=CLIPS.find(c=>c.id===id),frames=Math.round(clip.seconds*30);
    // a frame each second and the last, to look at before keeping the clip
    const samples=[...Array.from({length:Math.ceil(frames/30)},(_,n)=>n*30),frames-1];
    const started=Date.now();
    console.log(`Recording ${name} (${clip.seconds} s, ${width}×${height})…`);
    // The encoders overshoot their bitrate on busy footage (VP9 by up to half again), so a file over
    // budget is filmed again at a lower rate: the same frames, since the scene is seeded.
    let bitrate={...BITRATE},result;
    for(let attempt=0;;attempt++){
      if(attempt)await browser.navigate('/tools/website-video.html?clip='+id),await browser.waitFor('window.websiteVideo?.ready','Video studio for '+id,300000);
      result=await browser.evaluate(`websiteVideo.record(${JSON.stringify({mp4Bitrate:bitrate.mp4,webmBitrate:bitrate.webm,samples})})`,1800000);
      browser.assertHealthy();
      const over=['mp4','webm'].filter(k=>result.sizes[k]>BUDGET);
      if(!over.length)break;
      if(attempt===2)throw Error(`${name}: ${over.join(' and ')} still over ${BUDGET/1e6} MB`);
      for(const k of over)bitrate[k]=Math.round(bitrate[k]*BUDGET*.92/result.sizes[k]);
      console.log(`  ${over.map(k=>`${k} ${(result.sizes[k]/1e6).toFixed(2)} MB`).join(', ')} over budget; again at ${over.map(k=>`${k} ${(bitrate[k]/1e6).toFixed(2)} Mbit/s`).join(', ')}`);
    }
    const files=[];
    for(const [kind,ext,type] of [['mp4','mp4','video/mp4; codecs="avc1.640028"'],['webm','webm','video/webm; codecs="vp9"'],['poster','jpg','image/jpeg']]){
      const parts=[];
      for(let at=0;at<result.sizes[kind];at+=1.5e6)parts.push(Buffer.from(await browser.evaluate(`websiteVideo.slice(${JSON.stringify(kind)},${at},1500000)`),'base64'));
      const bytes=Buffer.concat(parts),file=`${name}.${ext}`;
      if(bytes.length!==result.sizes[kind])throw Error(`${file}: read back ${bytes.length} of ${result.sizes[kind]} bytes`);
      await writeFile(out+file,bytes);
      files.push({file,role:kind==='poster'?'poster':'video',type,bytes:bytes.length,sha256:hash(bytes)});
    }
    // Chrome must play both back: the length, the size and a decoded frame from the middle
    await browser.navigate('/assets/logo.svg');
    for(const f of files.filter(f=>f.role==='video')){
      const played=await browser.evaluate(`(async()=>{
        const v=document.createElementNS('http://www.w3.org/1999/xhtml','video');v.muted=true;v.src=${JSON.stringify('/website/review-media/video/'+f.file)};
        await new Promise((ok,fail)=>{v.onloadeddata=ok;v.onerror=()=>fail(Error('cannot play '+v.src+': '+v.error?.message));});
        v.currentTime=v.duration/2;await new Promise(ok=>v.onseeked=ok);
        const c=new OffscreenCanvas(64,36),x=c.getContext('2d');x.drawImage(v,0,0,64,36);
        const d=x.getImageData(0,0,64,36).data;let sum=0;for(let i=0;i<d.length;i+=4)sum+=d[i]+d[i+1]+d[i+2];
        return {duration:v.duration,width:v.videoWidth,height:v.videoHeight,brightness:sum/(d.length/4*3)};
      })()`);
      if(Math.abs(played.duration-clip.seconds)>.1||played.width!==width||played.height!==height||played.brightness<20)throw Error(`${f.file} does not play back as recorded: ${JSON.stringify(played)}`);
      f.checked={duration:+played.duration.toFixed(3),width:played.width,height:played.height};
    }
    await rm(framesOut+name,{recursive:true,force:true});await mkdir(framesOut+name,{recursive:true});
    for(const [frame,data] of Object.entries(result.samples))await writeFile(`${framesOut}${name}/frame-${String(frame).padStart(4,'0')}.jpg`,Buffer.from(data,'base64'));
    clips.push({id:name,clip:id,sourceRevision:revision,title:meta.clip.title,map:meta.clip.map,kind:meta.clip.kind,width,height,fps:result.fps,frames:result.frames,
      renderedFrames:result.rendered,seconds:meta.clip.seconds,loop:meta.clip.loop,keyframeEvery:result.keyEvery,timeOfDay:meta.clip.time,
      animalPace:meta.clip.pace,bitrate,description:meta.description,moment:meta.moment,focus:meta.focus,posedSpecies:meta.posed,
      camera:{shots:meta.shots,everyHalfSecond:result.path.filter((_,i)=>i%15===0)},motion:result.motion,files});
    console.log(`  ${files.map(f=>`${f.file} ${(f.bytes/1e6).toFixed(2)} MB`).join(', ')} in ${Math.round((Date.now()-started)/1000)} s\n  frame-to-frame change: median ${result.motion.median}, biggest ${result.motion.jumps.map(j=>`frame ${j.frame} ×${j.times}`).join(', ')}; sample frames in dist/website-video-frames/${name}/`);
  }
}finally{
  await browser.close();
  if(clips.length)await writeFile(provenanceFile,JSON.stringify({
    sourceRevision:revision,sourceDate:git('show','-s','--format=%cs',revision),uncommittedGameChanges:dirty,capturedAt:new Date().toISOString(),
    method:'Production renderer, models and per-step simulation (Game.update\'s wildlife steps, the calendar held so no day redraw lands mid-shot) in headless Chrome on the GPU, at a fixed 30 fps timestep. Scenes are seeded restored maps (release-fixtures, Math.random seeded) with posed animals that then behave on their own; keystone clips start from production moment triggers (website-moment-fixtures). Encoded in the page with WebCodecs (H.264 High, VP9), muxed by tools/video-mux.mjs. Crossfade loops dissolve the last second into the first; a dissolve joins the overhead view to eye level. Nothing is generated or painted.',
    seed:{map:1987,random:20261011},
    // (in website-video-clips.mjs's order, each 9:16 version after its wide one)
    clips:[...(previous?.clips||[]).filter(old=>!clips.some(fresh=>fresh.id===old.id)),...clips]
      .sort((a,b)=>CLIPS.findIndex(c=>c.id===a.clip)-CLIPS.findIndex(c=>c.id===b.clip)||a.id.length-b.id.length),
  },null,2)+'\n');
}
console.log(`Recorded ${clips.length} clip${clips.length===1?'':'s'} with provenance.`);
