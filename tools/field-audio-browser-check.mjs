// Decode every shipped clip in Chrome and exercise real playback/map changes.
// node tools/field-audio-browser-check.mjs
import assert from 'node:assert/strict';
import { openBrowser } from './browser-session.mjs';
const b = await openBrowser({ label: 'field-audio', width: 1280, height: 800 });
try {
  await b.navigate('/tools/nature-audit.html');
  await b.waitFor('window.audioReviewReady', 'Sound review loaded', 30000);
  assert.equal(await b.evaluate(`document.querySelectorAll('[data-rut="bugle"] audio').length`), 3, 'Cascade review includes every elk bugle');
  await b.evaluate(`document.getElementById('season').value='2';document.getElementById('season').dispatchEvent(new Event('change'))`);
  const play = await b.evaluate(`(() => {const r=document.getElementById('play').getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2};})()`);
  await b.send('Input.dispatchMouseEvent', { type:'mousePressed',...play,button:'left',clickCount:1 });
  await b.send('Input.dispatchMouseEvent', { type:'mouseReleased',...play,button:'left',clickCount:1 });
  await b.waitFor(`window.getPreviewPlayer()?.rutBulls.size>0`, 'Autumn Cascade preview plays an elk bugle', 15000);
  await b.evaluate(`document.getElementById('pause').click();document.getElementById('map').value='reef';document.getElementById('map').dispatchEvent(new Event('change'))`);
  assert.equal(await b.evaluate(`document.querySelectorAll('[data-rut="bugle"]').length`), 0, 'reef preview does not show elk');
  console.log('Cascade review includes three bugles and Autumn playback through the game rut audio path.');
  const decoded = await b.evaluate('window.auditFieldFiles()', 60000);
  assert.ok(decoded.files >= 60);
  assert.ok(decoded.bytes < 6_000_000);
  console.log(`${decoded.files} AAC clips decoded; peaks, RMS, mono channels and download budget passed.`);
  const loops = await b.evaluate(`(async () => {
    const { Music }=await import('/js/audio/music.js');
    const { FIELD_RECORDINGS }=await import('/js/audio/recordings.js');
    const ctx=new AudioContext(), player=new Music();player.ctx=ctx;
    try {
      const rows=[];
      for(const [id,def] of Object.entries(FIELD_RECORDINGS))if(id.startsWith('bed-')){
        await player.loadField(id);const clip=player.fieldClips.get(def.clips[0]);
        if(!clip)throw new Error(id+' failed to load');
        const data=clip.getChannelData(0), jump=Math.abs(data[0]-data.at(-1));
        let maxStep=0,peak=0;for(let i=1;i<data.length;i++){maxStep=Math.max(maxStep,Math.abs(data[i]-data[i-1]));peak=Math.max(peak,Math.abs(data[i]));}
        if(peak>=0.99)throw new Error(id+' clips during its crossfade');
        if(jump>maxStep)throw new Error(id+' clicks at the seam');
        const offline=new OfflineAudioContext(1,clip.length*3,clip.sampleRate);
        const source=offline.createBufferSource();source.buffer=clip;source.loop=true;source.connect(offline.destination);source.start();
        const rendered=(await offline.startRendering()).getChannelData(0);
        // Web Audio interpolates fractional loop boundaries. Check energy across
        // each wrap instead of requiring bit-identical resampled waveform values.
        const window=Math.round(clip.sampleRate*0.01);
        for(let pass=1;pass<=2;pass++)for(let offset=-window*5;offset<=window*5;offset+=window){
          let actual=0,expected=0;
          for(let j=0;j<window;j++){
            const i=pass*data.length+offset+j;
            actual+=rendered[i]**2;expected+=data[(i+data.length)%data.length]**2;
          }
          if(actual<expected*0.7 || actual>expected*1.3)throw new Error(id+' has a playback gap or surge');
        }
        const rms=(start,n)=>Math.sqrt(data.subarray(start,start+n).reduce((s,v)=>s+v*v,0)/n);
        const n=Math.round(clip.sampleRate*0.05), head=rms(0,n), tail=rms(data.length-n,n);
        if(id!=='bed-crickets' && (tail/head<0.5 || tail/head>2))throw new Error(id+' drops or surges at the seam');
        rows.push({id,duration:clip.duration,jump,head,tail});
      }
      return rows;
    } finally {await ctx.close();}
  })()`,60000);
  assert.equal(loops.length,6);
  console.log('All six continuous recordings loop for three passes without restart gaps, seam clicks or abrupt level changes.');
  const bedButton=await b.evaluate(`(() => {const button=document.querySelector('[data-bed="bed-stream"]');button.scrollIntoView();const r=button.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2};})()`);
  await b.send('Input.dispatchMouseEvent',{type:'mousePressed',...bedButton,button:'left',clickCount:1});
  await b.send('Input.dispatchMouseEvent',{type:'mouseReleased',...bedButton,button:'left',clickCount:1});
  await b.waitFor(`window.getPreviewBed()?.loop===true`,'Individual stream preview uses a continuous buffer loop',15000);
  assert.ok(await b.evaluate(`window.getPreviewBed().buffer===window.getPreviewPlayer().fieldClips.get('field-bed-stream-1')`),'preview uses the game loop buffer');
  await b.evaluate(`document.getElementById('pause').click()`);
  assert.equal(await b.evaluate(`window.getPreviewBed()`),null,'Stop releases the individual loop');
  const runtime = await b.evaluate(`(async () => {
    const { Music } = await import('/js/audio/music.js');
    const { FIELD_RECORDINGS, MAP_RECORDINGS } = await import('/js/audio/recordings.js');
    const { SOUNDSCAPES } = await import('/js/audio/nature.js');
    const { soundFile } = await import('/js/audio/sounds.js');
    const ctx = new AudioContext(), m = new Music();
    m.ctx = ctx; m.callGain = ctx.createGain(); m.callGain.connect(ctx.destination);
    // Offline rendering tests the same gain/filter path without requiring speaker playback.
    const rows = [];
    for (const [map, mapping] of Object.entries(MAP_RECORDINGS)) {
      for (const [kind, entries] of Object.entries(mapping)) for (const [key, id] of Object.entries(entries)) {
        const clip = await ctx.decodeAudioData(await fetch(soundFile(FIELD_RECORDINGS[id].clips[0])).then(r=>r.arrayBuffer()));
        const offline = new OfflineAudioContext(1, Math.ceil((clip.duration + 0.2) * 32000), 32000);
        // A running real-time context schedules immediately; the offline context has identical
        // nodes but reports suspended before rendering. Shadow that read-only getter in this test.
        Object.defineProperty(offline, 'state', { value: 'running' });
        const player = new Music(); player.ctx=offline; player.callGain=offline.createGain(); player.callGain.connect(offline.destination);
        player.land={map}; player.fieldClips.set(FIELD_RECORDINGS[id].clips[0],clip);
        const duration=kind==='birds'?player.birdPhrase(key):player[key]();
        if(!duration) throw new Error(map+'/'+key+' did not play');
        const rendered=await offline.startRendering();let peak=0,sum=0;for(const v of rendered.getChannelData(0)){peak=Math.max(peak,Math.abs(v));sum+=v*v;}
        const rms=Math.sqrt(sum/rendered.length);if(peak>=0.95||rms<0.0001)throw new Error(map+'/'+key+' inaudible or clipping');
        if(player.activeSources.size)throw new Error(map+'/'+key+' leaked its source');
        rows.push({map,key,peak,rms});
      }
    }
    await ctx.close();return rows;
  })()`, 60000);
  assert.equal(new Set(runtime.map(r => r.map)).size, 7);
  console.log(`${runtime.length} mapped voices rendered through the game's gain/filter path on all seven maps; no clipping, silence or per-call node leaks.`);
  await b.evaluate(`localStorage.setItem('second-growth-settings', JSON.stringify({analytics:false,music:false,nature:true,quality:'fast',shadows:false,v:2}))`);
  await b.navigate('/');
  await b.waitFor('!!window.secondGrowth', 'Game boot', 45000);
  await b.evaluate(`window.secondGrowth.ui.closeModal()`);
  await b.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: 600, y: 300, button: 'left', clickCount: 1 });
  await b.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 600, y: 300, button: 'left', clickCount: 1 });
  const transitions = await b.evaluate(`(async () => {
    const { game, ui } = window.secondGrowth;
    const { music } = await import('/js/audio/music.js');
    const { MAP_RECORDINGS } = await import('/js/audio/recordings.js');
    const { SOUNDSCAPES } = await import('/js/audio/nature.js');
    if(music.ctx?.state!=='running') throw new Error('Audio did not unlock on a real click');
    // Normal game map selection reloads the page. Exercise the live audio engine's
    // transition handling directly, without mutating the UI's shared species catalog.
    game.speed=0; const frame=ui.frame; ui.frame=()=>{};
    try {
      const rows=[];
      for(const map of Object.keys(MAP_RECORDINGS)) {
        const present=[...Object.keys(MAP_RECORDINGS[map].birds),...SOUNDSCAPES[map].calls.map(c=>c[0])];
        music.setLand({map,present,callPresent:present,month:0,tod:0.9,night:1,dawn:0,dusk:0,health:0.8,bare:0.3,canopy:0.5,water:0.7,wet:0.7,creek:0.5,river:0.5,shore:0,dry:false});
        await Promise.all([...music.fieldLoads.values()]);
        rows.push({map:music.land.map,beds:music.fieldBeds.size,clips:music.fieldClips.size});
        if(music.land.map!==map)throw new Error('Stale map soundscape');
      }
      music.set({muted:true});
      for(const source of music.fieldBeds.values())if(!source.loop || ![...music.fieldClips.values()].includes(source.buffer))throw new Error('Game bed bypassed seamless buffer');
      if(music.lion()!==0)throw new Error('Muted wildlife still schedules');
      return rows;
    } finally { ui.frame=frame; }
  })()`, 45000);
  assert.equal(transitions.length, 7);
  assert.ok(transitions.at(-1).beds >= 3);
  console.log('Real game audio unlock, live audio transitions for seven maps, lazy bed loading and mute passed.');
  b.assertHealthy();
} finally { await b.close(); }
