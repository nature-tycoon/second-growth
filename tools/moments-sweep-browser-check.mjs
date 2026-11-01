// node tools/moments-sweep-browser-check.mjs [maps]
// Every keystone moment on every map, played through the real cinematic in a browser: the card
// shows, a few seconds of frames draw without an error, and Continue cleans up. Moments a map sets
// off from its own daily code (Atlanta's monarchs, with the wave of butterflies it adds) go through
// that code, so whatever it adds to the world is drawn too. A new moment must be listed here.
import assert from 'node:assert/strict';
import { openBrowser, pause } from './browser-session.mjs';
import { MOMENTS } from '../js/sim/moments.js';
import { BIOMES } from '../js/biome.js';

// Each map's keystone moments: the shared ones it can reach, then its own (definition.moments).
const CORE = { pnw: ['salmon', 'dam', 'elkRut'], serengeti: ['crossing', 'elephant', 'lionHunt'], amazon: ['jaguar', 'howler'], atlanta: ['monarchs', 'fireflies'] };
const plan = Object.fromEntries(Object.entries(BIOMES).map(([id, m]) => [id, [...(CORE[id] || []), ...Object.keys(m.moments || {})]]));
const listed = new Set(Object.values(plan).flat());
for (const key of Object.keys(MOMENTS)) assert.ok(listed.has(key), `${key}: a shared moment no map lists (add it to CORE)`);
const only = process.argv[2]?.split(',');

const b = await openBrowser({ label: 'moments-sweep', width: 844, height: 390 });
let played = 0;
try {
  for (const [map, keys] of Object.entries(plan)) {
    if (only && !only.includes(map) || !keys.length) continue;
    await b.evaluate(`localStorage.setItem('second-growth-settings', JSON.stringify({analytics:false,autosave:false,music:false,nature:false,quality:'fast',qualityChosen:true,v:2})); sessionStorage.setItem('second-growth-pending', JSON.stringify({map:'${map}',mode:'free',difficulty:'standard'}));`);
    await b.navigate('/');
    await b.waitFor(`window.secondGrowth?.game.map === '${map}' && (!document.getElementById("loading-screen") || document.getElementById("loading-screen").classList.contains("done"))`, `${map} boot`);
    for (const key of keys) {
      const fired = await b.evaluate(`(async () => {
        const {game:g,ui}=window.secondGrowth; if(ui.modalOpen) ui.closeModal(); g.speed=0;
        const {moment}=await import('/js/sim/moments.js');
        ui.momentEnded=-1e9; g.flags.lastMomentDay=-1e9; g.flags.momentQueue=[]; (g.flags.moments ||= {}); delete g.flags.moments['${key}'];
        const w=g.world, c={x:w.w/2, y:w.h/2};
        if ('${key}' === 'monarchs') {
          // through the map's own trigger: monarchs over a garden in the fall
          while(g.month!==6) g.day++;
          const M=g.catalog.animal.monarch;
          for(let y=28;y<34;y++) for(let x=38;x<46;x++) w.habitat[w.idx(x,y)]=3;
          for(let k=0;k<10;k++) g.wildlife.spawn(M,40+k%4,30+(k>>2),{silent:true});
          g.mapDefinition.daily(g);
          return g.flags.moments.monarchs != null;
        }
        const a = g.wildlife.agents.find(a => !a.leaving);
        return moment(g,'${key}', a && ${JSON.stringify(['salmon', 'jaguar', 'howler', 'elephant', 'orangutans', 'gajah', 'harimau', 'congos', 'manta', 'humphead'])}.includes('${key}') ? a : c);
      })()`);
      assert.ok(fired, `${map}/${key}: the moment fired`);
      await b.waitFor(`window.secondGrowth.ui.moment?.key === '${key}'`, `${map}/${key}: cinematic starts`, 40000);
      await b.evaluate(`window.secondGrowth.game.speed=1`);
      await pause(3500); // (fly-in, the card, and a few seconds of the game running under it)
      b.assertHealthy();
      assert.ok(await b.evaluate(`!!document.querySelector('#moment.card') && window.secondGrowth.ui.moment?.key === '${key}'`), `${map}/${key}: card shown`);
      const residentsPassing = await b.evaluate(`window.secondGrowth.game.wildlife.agents.filter(a => a.passing).length`);
      assert.equal(residentsPassing, 0, `${map}/${key}: no resident marked as a flyover`);
      await b.evaluate(`document.querySelector('[data-a=go]').click(); window.secondGrowth.game.speed=0`);
      await b.waitFor(`!window.secondGrowth.ui.moment && !document.getElementById('moment')`, `${map}/${key}: Continue cleans up`, 10000);
      b.assertHealthy();
      console.log(`PASS ${map}/${key}`);
      played++;
    }
  }
} finally { await b.close(); }
console.log(`${played} keystone moments played without an error.`);
