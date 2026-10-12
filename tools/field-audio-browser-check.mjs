// Decode every shipped clip in Chrome and exercise real playback/map changes.
// node tools/field-audio-browser-check.mjs
import assert from 'node:assert/strict';
import { openBrowser } from './browser-session.mjs';
const b = await openBrowser({ label: 'field-audio', width: 1280, height: 800 });
try {
  await b.navigate('/tools/nature-audit.html');
  await b.waitFor('window.audioReviewReady', 'Sound review loaded', 30000);
  const decoded = await b.evaluate('window.auditFieldFiles()', 60000);
  assert.ok(decoded.files >= 60);
  assert.ok(decoded.bytes < 6_000_000);
  console.log(`${decoded.files} AAC clips decoded; peaks, RMS, mono channels and download budget passed.`);
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
      if(music.lion()!==0)throw new Error('Muted wildlife still schedules');
      return rows;
    } finally { ui.frame=frame; }
  })()`, 45000);
  assert.equal(transitions.length, 7);
  assert.ok(transitions.at(-1).beds >= 3);
  console.log('Real game audio unlock, live audio transitions for seven maps, lazy bed loading and mute passed.');
  b.assertHealthy();
} finally { await b.close(); }
