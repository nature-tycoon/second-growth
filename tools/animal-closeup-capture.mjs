// Saves tools/animal-closeup-review.html's frames as PNGs, for before and after comparisons of how
// animals look up close.
//   node tools/animal-closeup-capture.mjs [out=tools/release-output/closeups] [query, e.g. "pose=walk&light=golden"]
// CLOSEUP_ROOT=<checkout> renders another checkout's models (copy this page into it first).
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { openBrowser, projectRoot } from './browser-session.mjs';

const [out = join(projectRoot, 'tools/release-output/closeups'), query = ''] = process.argv.slice(2);
const browser = await openBrowser({ label: 'closeups', ...(process.env.CLOSEUP_ROOT ? { root: process.env.CLOSEUP_ROOT } : {}), software: false, width: 1600, height: 1200, pixelRatio: 2 });
try {
  await browser.navigate('/tools/animal-closeup-review.html?' + query);
  await browser.waitFor('document.body.dataset.ready === "1"', 'Review page did not draw');
  // (and every frame on one sheet, at half size, labelled)
  const frames = await browser.evaluate(`(() => {
    const all = [...document.querySelectorAll('article')].map(a => [a.querySelector('h2').textContent, a.querySelector('canvas')]);
    const w = all[0][1].width / 2, h = all[0][1].height / 2, cols = 3, sheet = document.createElement('canvas');
    sheet.width = w * cols; sheet.height = h * Math.ceil(all.length / cols);
    const ctx = sheet.getContext('2d'); ctx.font = '20px system-ui'; ctx.fillStyle = '#fff';
    all.forEach(([title, c], i) => { ctx.drawImage(c, (i % cols) * w, Math.floor(i / cols) * h, w, h); ctx.fillText(title.split(' · ')[0], (i % cols) * w + 10, Math.floor(i / cols) * h + 26); });
    return [...all.map(([title, c]) => [title, c.toDataURL('image/png')]), ['sheet', sheet.toDataURL('image/png')]];
  })()`);
  browser.assertHealthy();
  await mkdir(out, { recursive: true });
  for (const [title, url] of frames) {
    const name = title.split(' · ')[0].toLowerCase().replace(/[^a-z0-9]+/g, '-') + (query ? '-' + query.replace(/[^a-z0-9]+/gi, '-').slice(0, 60) : '') + '.png';
    await writeFile(join(out, name), Buffer.from(url.split(',')[1], 'base64'));
    console.log(title, '→', join(out, name));
  }
} finally { await browser.close(); }
