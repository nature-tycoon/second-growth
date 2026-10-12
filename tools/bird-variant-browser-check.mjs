// Inspect the six bird splits and exercise calendar changes through the production renderer.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { openBrowser } from './browser-session.mjs';
const browser = await openBrowser({ label: 'bird-variants', width: 960, height: 600 });
const rows = [];
try {
  for (const [map, keys] of Object.entries({ pnw: ['hummingbird'], atlanta: ['cardinal', 'hummingbird', 'goldfinch'], serengeti: ['ostrich'], sumatra: ['sunbird'] })) {
    await browser.navigate('/tools/release-scenes.html?' + new URLSearchParams({ map, scene: 'animals', quality: 'high' }));
    await browser.waitFor('!!window.releaseScene?.ready', 'Bird gallery not ready');
    const result = await browser.evaluate(`(async () => {
      if (window.releaseScene.error) throw Error(window.releaseScene.error);
      const { ANIMAL, ANIMALS, drawDef, isMale } = await import('/js/data/animals.js');
      const { DAYS_PER_MONTH, DAYS_PER_YEAR } = await import('/js/config.js');
      const { renderPortrait } = await import('/js/render3d/portraits.js');
      const { game, renderer } = window.releaseScene;
      const result = [];
      for (const key of ${JSON.stringify(keys)}) {
        const def = ANIMAL[key];
        const adults = Array.from({length: 100}, (_, id) => ({id: id + 1, age: def.mature * DAYS_PER_YEAR + 1}));
        const female = adults.find(a => !isMale(def, a)), male = adults.find(a => isMale(def, a));
        result.push({map: ${JSON.stringify(map)}, key, name: def.name,
          female: renderPortrait(drawDef(def, female)).toDataURL(), male: renderPortrait(drawDef(def, male)).toDataURL()});
      }
      if (${JSON.stringify(map)} === 'atlanta') {
        renderer.actors.cullOffscreen = false;
        const identities = game.wildlife.agents.map(a => [a.id, a.sp, isMale(ANIMALS[a.sp], a)]);
        const originalDay = game.day;
        for (const month of [0, 6, 11, 6]) {
          game.day = month * DAYS_PER_MONTH;
          renderer.draw(game, {clean: true, overlay: 'none'}, 0);
          const winter = month === 0 || month === 11;
          const key = 'goldfinch:male' + (winter ? ':winter' : '');
          if (!(renderer.actors.fauna.species.get(key)?.count > 0)) throw Error('Production renderer missed ' + key);
          const inactive = 'goldfinch:male' + (winter ? '' : ':winter');
          if (renderer.actors.fauna.species.get(inactive)?.count > 0) throw Error('Old seasonal plumage remains active');
        }
        game.day = originalDay;
        const after = game.wildlife.agents.map(a => [a.id, a.sp, isMale(ANIMALS[a.sp], a)]);
        if (JSON.stringify(identities) !== JSON.stringify(after)) throw Error('Rendering changed population or sex');
      }
      if (renderer.gl.getContext().getError() !== 0) throw Error('Bird shader failed');
      return result;
    })()`);
    rows.push(...result);
    browser.assertHealthy();
  }
  assert.equal(rows.length, 6);
  const preview = await browser.evaluate(`(async () => {
    const rows = ${JSON.stringify(rows)}, canvas = document.createElement('canvas');
    canvas.width = 640; canvas.height = rows.length * 265;
    const ctx = canvas.getContext('2d'); ctx.fillStyle = '#edf0e8'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]; ctx.fillStyle = '#23392c'; ctx.font = '16px system-ui';
      ctx.fillText(row.name + ' — female / adult male', 12, i * 265 + 22);
      for (const [sex, x] of [['female', 0], ['male', 320]]) {
        const image = new Image(); image.src = row[sex]; await image.decode(); ctx.drawImage(image, x, i * 265 + 25);
      }
    }
    return canvas.toDataURL();
  })()`);
  await mkdir(new URL('./release-output/', import.meta.url), { recursive: true });
  await writeFile(new URL('./release-output/bird-variants.png', import.meta.url), Buffer.from(preview.split(',')[1], 'base64'));
  console.log('Six bird pairs rendered; goldfinches switch summer/winter pools without changing population or sex.');
} finally { await browser.close(); }
