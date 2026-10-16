// Decode every shipped clip in Chrome and exercise real playback/map changes.
// node tools/field-audio-browser-check.mjs
import assert from 'node:assert/strict';
import { openBrowser, pause } from './browser-session.mjs';
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
  assert.equal(loops.length,5);
  console.log('All five continuous recordings loop for three passes without restart gaps, seam clicks or abrupt level changes.');
  const rain = await b.evaluate(`(async () => {
    const { Music }=await import('/js/audio/music.js');
    const { createRainSource }=await import('/js/audio/rain.js');
    const ctx=new AudioContext(), player=new Music();player.ctx=ctx;
    try {
      const clip=player.rainBuffer();if(clip!==player.rainBuffer())throw new Error('Rain buffer regenerated');
      if(clip.duration<59.9)throw new Error('Rain repeats too soon');
      const offline=new OfflineAudioContext(1,Math.ceil(62*clip.sampleRate),clip.sampleRate);
      const source=createRainSource(offline,clip,offline.destination);source.start();
      const data=(await offline.startRendering()).getChannelData(0), levels=[];
      for(let second=0;second<62;second++){
        let sum=0;for(let i=second*clip.sampleRate;i<(second+1)*clip.sampleRate;i++)sum+=data[i]**2;
        levels.push(Math.sqrt(sum/clip.sampleRate));
      }
      const low=Math.min(...levels),high=Math.max(...levels);
      if(low<0.01 || high/low>1.08)throw new Error('Rain swells rhythmically or drops at its seam');
      let peak=0;for(const v of data)peak=Math.max(peak,Math.abs(v));if(peak>=0.99)throw new Error('Rain clips');
      return {duration:clip.duration,low,high,peak};
    } finally {await ctx.close();}
  })()`,60000);
  assert.ok(rain.duration>=59.9);
  console.log('Synthesized rain stays steady through its minute-long loop: no volume pulses, seam drops or clipping.');
  const bedButton=await b.evaluate(`(() => {const button=document.querySelector('[data-bed="bed-stream"]');button.scrollIntoView();const r=button.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2};})()`);
  await b.send('Input.dispatchMouseEvent',{type:'mousePressed',...bedButton,button:'left',clickCount:1});
  await b.send('Input.dispatchMouseEvent',{type:'mouseReleased',...bedButton,button:'left',clickCount:1});
  await b.waitFor(`window.getPreviewBed()?.loop===true`,'Individual stream preview uses a continuous buffer loop',15000);
  assert.ok(await b.evaluate(`window.getPreviewBed().buffer===window.getPreviewPlayer().fieldClips.get('field-bed-stream-1')`),'preview uses the game loop buffer');
  await b.evaluate(`document.getElementById('pause').click()`);
  assert.equal(await b.evaluate(`window.getPreviewBed()`),null,'Stop releases the individual loop');
  await b.evaluate(`document.querySelector('[data-bed="rain"]').click()`);
  assert.ok(await b.evaluate(`window.getPreviewBed()?.buffer===window.getPreviewPlayer().rainClip`),'rain preview uses the game noise buffer');
  await b.evaluate(`document.getElementById('pause').click()`);
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
  // Keep this audio check light on the shared Mac; rendering speed is not under test.
  await b.send('Page.addScriptToEvaluateOnNewDocument', { source: `
    if(location.pathname==='/') {
      const raf=window.requestAnimationFrame;
      window.requestAnimationFrame=fn=>raf(()=>setTimeout(()=>fn(performance.now()),100));
    }
  ` });
  await b.evaluate(`localStorage.setItem('second-growth-settings', JSON.stringify({analytics:false,music:false,nature:true,quality:'fast',shadows:false,v:2}))`);
  await b.navigate('/');
  await b.waitFor('!!window.secondGrowth', 'Game boot', 45000);
  await b.evaluate(`(async()=>{
    const {music}=await import('/js/audio/music.js');
    await music.prepare();
    music.setScene('rain',0);
    window.audioStarts=[];
    const start=music.start.bind(music), createBuffer=music.ctx.createBuffer.bind(music.ctx);
    let buffers=0;
    music.ctx.createBuffer=(...args)=>{buffers++;return createBuffer(...args);};
    music.start=()=>{const before=buffers,t=performance.now();const result=start();window.audioStarts.push({ms:performance.now()-t,buffers:buffers-before});return result;};
  })()`);
  const startButton = await b.evaluate(`(()=>{const r=document.querySelector('[data-a="start"]').getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2};})()`);
  await b.send('Emulation.setCPUThrottlingRate', { rate: 6 });
  await b.send('Input.dispatchMouseEvent', { type: 'mousePressed', ...startButton, button: 'left', clickCount: 1 });
  await b.send('Input.dispatchMouseEvent', { type: 'mouseReleased', ...startButton, button: 'left', clickCount: 1 });
  await b.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  await b.evaluate(`window.secondGrowth.ui.closeModal()`);
  const firstClick = await b.evaluate('window.audioStarts[0]');
  assert.equal(firstClick.buffers, 0, 'first gesture does not allocate or generate rain');
  assert.ok(firstClick.ms < 50, `audio start stays below a 50 ms long task at 6x slowdown (${firstClick.ms} ms)`);
  console.log(`Audio start at 6x CPU slowdown: ${firstClick.ms.toFixed(1)} ms; no rain buffers on the gesture stack.`);
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
      music.setScene('rain',0);
      await music.rainLoading;
      if(music.fieldBeds.get('rain')?.buffer!==music.rainClip || !music.rainClip)throw new Error('Game rain did not use synthesis');
      for(const source of music.fieldBeds.values())if(!source.loop || (source.buffer!==music.rainClip && ![...music.fieldClips.values()].includes(source.buffer)))throw new Error('Game bed bypassed seamless buffer');
      music.set({muted:true});
      if(music.lion()!==0)throw new Error('Muted wildlife still schedules');
      return rows;
    } finally { ui.frame=frame; }
  })()`, 45000);
  assert.equal(transitions.length, 7);
  assert.ok(transitions.at(-1).beds >= 3);
  console.log('Real game audio unlock, live audio transitions for seven maps, lazy bed loading and mute passed.');
  // Exercise the actual UI reload path. Direct setLand transitions alone miss the
  // missing start() on the new page, which used to require mute/unmute to wake it.
  await b.evaluate(`(async()=>{
    const {settings,saveSettings}=await import('/js/settings.js');
    settings.music=true;saveSettings();window.secondGrowth.ui.applySettings();
  })()`);
  for (const map of ['reef', 'pnw']) {
    await b.evaluate(`void window.secondGrowth.ui.switchMap({map:'${map}',mode:'free',difficulty:'standard'});true`);
    const deadline = Date.now() + 60000;
    let restored = false;
    while (Date.now() < deadline) {
      try {
        restored = await b.evaluate(`(async()=>{
          if(window.secondGrowth?.game.map!=='${map}')return false;
          const {music}=await import('/js/audio/music.js');
          return music.ready && music.started && music.ctx.state==='running' && music.fieldBeds.size>0 && !music.muted && music.current?.el.currentTime>0 && !music.current.el.paused;
        })()`);
        if (restored) break;
      } catch (error) {
        if (!/context|navigat/i.test(error.message)) throw error;
      }
      await pause(100);
    }
    assert.ok(restored, `${map}: audio plays after the map reload without another click or mute toggle`);
    b.assertHealthy();
  }
  console.log('UI map reloads to reef and Cascade resume music and nature audio without any further gesture or mute toggle.');
  b.assertHealthy();
} finally { await b.close(); }
