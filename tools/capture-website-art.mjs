// Export real game art once; the public homepage never loads a 3D renderer.
// Run under nice -n 15. The isolated browser/profile are always cleaned up.
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { openBrowser } from './browser-session.mjs';
const out = fileURLToPath(new URL('../website/art/', import.meta.url));
await mkdir(out, { recursive: true });
const browser = await openBrowser({ label: 'website-art', width: 1600, height: 1000 });
try {
  await browser.navigate('/tools/release-scenes.html?map=pnw&quality=high');
  await browser.waitFor('window.releaseScene?.ready', 'Landscape renderer');
  const images = await browser.evaluate(`(async () => {
    const {renderer:r,game:g,error}=window.releaseScene;
    if(error) throw Error(error);
    r.zoom=.78; r.centerOn(87,38); r.updateCamera();
    r.draw(g,{clean:true,overlay:'none'},0);
    const hero=r.canvas.toDataURL('image/jpeg',.91);
    const {renderPortrait,renderPlants}=await import('/js/render3d/portraits.js');
    const {ANIMAL}=await import('/js/data/animals.js');
    const {PLANT}=await import('/js/data/plants.js');
    return { 'river.jpg':hero, 'elk.png':renderPortrait(ANIMAL.elk).toDataURL(),
      'frog.png':renderPortrait(ANIMAL.treefrog).toDataURL(),
      'native-plants.png':renderPlants([PLANT.lupine,PLANT.fireweed,PLANT.fern].filter(Boolean)).toDataURL() };
  })()`);
  for (const [name,data] of Object.entries(images)) await writeFile(out+name,Buffer.from(data.split(',')[1],'base64'));
  browser.assertHealthy();
  console.log('Exported river landscape, elk, treefrog and native plants from production models.');
} finally { await browser.close(); }
