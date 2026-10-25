// Model sheets: every animal on every map, three-quarter head on, labelled and numbered so notes
// can point at one ("pnw 7"). Close-up models, filling their frames (sizes are not comparable).
//   node tools/animal-sheets.mjs [out=tools/release-output/model-sheets] [model=close|detail]
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { openBrowser, projectRoot } from './browser-session.mjs';
import { loadAnimals, ANIMALS } from '../js/data/animals.js';

const [out = join(projectRoot, 'tools/release-output/model-sheets'), model = 'close'] = process.argv.slice(2);
const maps = ['pnw', 'atlanta', 'amazon', 'reef', 'sumatra', 'chinandega', 'serengeti'], PER_SHEET = 12;
await mkdir(out, { recursive: true });
const browser = await openBrowser({ label: 'sheets', software: false, width: 1600, height: 1200, pixelRatio: 1 });
const written = [];
try {
  for (const map of maps) {
    loadAnimals((await import(`../js/data/animals-${map}.js`)).default);
    const species = ANIMALS.flatMap(d => [`${map}:${d.key}`, ...(d.sprite.male ? [`${map}:${d.key}:male`] : [])]);
    for (let start = 0; start < species.length; start += PER_SHEET) {
      const part = species.slice(start, start + PER_SHEET), sheet = Math.floor(start / PER_SHEET) + 1;
      await browser.navigate(`/tools/animal-closeup-review.html?view=quarter&model=${model}&species=${part.join(',')}`);
      await browser.waitFor('document.body.dataset.ready === "1"', `${map} sheet ${sheet} did not draw`);
      const png = await browser.evaluate(`(() => {
        const all = [...document.querySelectorAll('article')].map(a => [a.querySelector('h2').textContent.split(' · ')[0], a.querySelector('canvas')]);
        const w = all[0][1].width, h = all[0][1].height, cols = 4, top = 56, sheet = document.createElement('canvas');
        sheet.width = w * cols; sheet.height = top + h * Math.ceil(all.length / cols);
        const ctx = sheet.getContext('2d'); ctx.fillStyle = '#1d2a22'; ctx.fillRect(0, 0, sheet.width, sheet.height);
        ctx.fillStyle = '#fff'; ctx.font = 'bold 30px system-ui'; ctx.fillText(${JSON.stringify(`${map} · sheet ${sheet} · three-quarter, head on`)}, 16, 38);
        all.forEach(([title, c], i) => {
          const x = (i % cols) * w, y = top + Math.floor(i / cols) * h, n = ${start} + i + 1;
          ctx.drawImage(c, x, y); ctx.strokeStyle = '#1d2a22'; ctx.lineWidth = 4; ctx.strokeRect(x, y, w, h);
          ctx.font = 'bold 26px system-ui'; const label = n + '  ' + title, tw = ctx.measureText(label).width;
          ctx.fillStyle = 'rgba(0,0,0,.6)'; ctx.fillRect(x + 8, y + 8, tw + 20, 38); ctx.fillStyle = '#fff'; ctx.fillText(label, x + 18, y + 36);
        });
        return sheet.toDataURL('image/png');
      })()`);
      browser.assertHealthy();
      const file = join(out, `${map}-${sheet}.png`);
      await writeFile(file, Buffer.from(png.split(',')[1], 'base64'));
      written.push(file); console.log(file);
    }
  }
} finally { await browser.close(); }
console.log(written.length, 'sheets');
