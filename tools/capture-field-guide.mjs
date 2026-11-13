// Field-guide portraits for the website: every species in the game, drawn by the game's own
// field-guide renderer at 2×, cropped to the subject in a 640×480 frame (WebP, transparent), with hashes in guide-provenance.json.
//   nice -n 15 node tools/capture-field-guide.mjs [--only=slug,slug]
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { openBrowser, projectRoot } from './browser-session.mjs';
import { fieldGuide } from './field-guide-data.mjs';

const out = fileURLToPath(new URL('../website/guide-media/', import.meta.url));
const only = process.argv.find(a => a.startsWith('--only='))?.slice(7).split(',');
await mkdir(out, { recursive: true });
const guide = fieldGuide().filter(e => !only || only.includes(e.slug));
let previous = {};
try { previous = JSON.parse(await readFile(out + 'guide-provenance.json', 'utf8')).portraits; } catch { /* first run */ }
const portraits = only ? { ...previous } : {};
const browser = await openBrowser({ label: 'field-guide', software: false, width: 800, height: 600 });
try {
  await browser.navigate('/tools/field-guide-portraits.html');
  await browser.waitFor('document.body.dataset.ready === "1"', 'Portrait page did not load');
  for (let i = 0; i < guide.length; i += 20) {
    const batch = guide.slice(i, i + 20).map(({ slug, kind, key, firstMap }) => ({ slug, kind, key, firstMap }));
    for (const [slug, url, width, height, male] of await browser.evaluate(`fieldGuidePortraits(${JSON.stringify(batch)}, 2)`)) {
      const bytes = Buffer.from(url.split(',')[1], 'base64');
      if (!url.startsWith('data:image/webp')) throw Error('This Chrome did not encode WebP');
      await writeFile(out + slug + '.webp', bytes);
      portraits[slug] = { file: slug + '.webp', width, height, ...(male ? { look: 'male' } : {}), sha256: createHash('sha256').update(bytes).digest('hex') };
    }
    browser.assertHealthy();
    console.log(`Portraits ${Math.min(i + 20, guide.length)} / ${guide.length}`);
  }
} finally { await browser.close(); }
const sorted = Object.fromEntries(Object.entries(portraits).sort(([a], [b]) => a.localeCompare(b)));
await writeFile(out + 'guide-provenance.json', JSON.stringify({
  sourceRevision: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: projectRoot, encoding: 'utf8' }).trim(),
  capturedAt: new Date().toISOString(),
  method: 'The game\'s field-guide portraits (js/render3d/portraits.js: renderPortrait for animals, renderPlants for one plant), at 2× under the map\'s own biome, cropped to the subject with a margin; the male look where a species has one.',
  portraits: sorted }, null, 2) + '\n');
console.log(`Saved ${guide.length} portraits to website/guide-media/`);
