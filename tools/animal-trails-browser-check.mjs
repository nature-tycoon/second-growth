// Isolated, single-frame shader/visual check; no running animation or player profile.
import assert from 'node:assert/strict';
import { writeFile,mkdir } from 'node:fs/promises';
import { openBrowser } from './browser-session.mjs';
const browser=await openBrowser({label:'game-trails',width:1120,height:760});
try{
 await browser.navigate('/tools/animal-trails-review.html');await browser.waitFor('window.trailReady','Trail review ready');
 const result=await browser.evaluate(`(()=>{const r=window.trailReview,rows=[];for(const fast of [true,false]){r.setFast(fast);const a=r.pixels();r.toggle();const b=r.pixels();let changed=0;for(let i=0;i<a.length;i+=4)if(Math.abs(a[i]-b[i])+Math.abs(a[i+1]-b[i+1])+Math.abs(a[i+2]-b[i+2])>8)changed++;r.toggle();rows.push({quality:fast?'Fast':'High',changedPixels:changed,error:r.gl.getContext().getError()});}r.setFast(true);return rows;})()`);
 console.log(JSON.stringify(result));
 const directory=process.env.TRAIL_SCREENSHOT_DIR;if(directory){await mkdir(directory,{recursive:true});const shot=await browser.send('Page.captureScreenshot',{format:'png'});await writeFile(directory+'/game-trails.png',Buffer.from(shot.data,'base64'));}
 for(const row of result){assert.equal(row.error,0);assert.ok(row.changedPixels>100,'visible ground tracks in '+row.quality);}
 await browser.evaluate('window.trailReview.setSnow(1)');browser.assertHealthy();console.log('PASS visible game trails, groundcover openings, Fast/High shaders and snow in an isolated browser');
}finally{await browser.close();}
