// Real models and simulation across seasonal bull elk fixtures.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { openBrowser, projectRoot } from './browser-session.mjs';
const out = join(projectRoot, 'tools/release-output');
await mkdir(out, { recursive: true });
const b = await openBrowser({ label: 'elk-groups', width: 1100, height: 820 });
try {
  await b.navigate('/tools/cervid-behavior-review.html');
  await b.waitFor('!!window.cervidReview', 'Cervid fixture boot');
  await b.evaluate(`document.querySelector('#pause').click(); window.cervidReview.activity.value='elk-bachelor'`);
  for (const [name, month] of [['spring', 1], ['summer', 4], ['rut', 7], ['winter', 10]]) {
    const result = await b.evaluate(`(async()=>{
      const {game:g,renderer:r,season,setup}=window.cervidReview;
      season.value=${month};setup();
      const {isMaleVariant,ANIMAL}=await import('/js/data/animals.js');
      for(let i=0;i<800;i++){g.wildlife.update(.05);for(const a of g.wildlife.agents)a.thirst=0;if(i%20===0)g.wildlife.daily();}
      g.speed=0;r.draw(g,{clean:false},.05);
      const bulls=g.wildlife.agents.filter(a=>isMaleVariant(ANIMAL.elk,a)), groups={};
      for(const a of bulls)if(a.herdOf!=null)groups[a.herdOf]=(groups[a.herdOf]||0)+1;
      return {groups:Object.values(groups),bulls:bulls.length,solitary:bulls.filter(a=>a.herdOf==null).length};
    })()`);
    assert.equal(result.bulls, 8, `${name}: all bulls remain`);
    if (month === 7) assert.equal(result.solitary, 8, 'rut releases every bachelor group');
    else assert.ok(result.groups.every(n => n <= 3), `${name}: bounded groups ${result.groups}`);
    if (month === 1 || month === 4) assert.ok(result.solitary >= 1, `${name}: older bull feeds independently`);
    const { data } = await b.send('Page.captureScreenshot', { format: 'png' });
    await writeFile(join(out, `elk-groups-${name}.png`), Buffer.from(data, 'base64'));
    if (b.errors.length) console.error(await b.evaluate(`performance.getEntriesByType('resource').filter(e=>e.responseStatus>=400).map(e=>({url:e.name,status:e.responseStatus}))`));
    b.assertHealthy();
    console.log(`PASS ${name}: ${result.bulls} bulls, groups ${result.groups.join('/') || 'none'}, ${result.solitary} independent`);
  }
} finally { await b.close(); }
