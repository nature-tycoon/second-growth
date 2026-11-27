// Before/after pictures and shading cost of one animal, for reshaping it (.claude/skills/animal-model).
// Takes the same eight views of the close-up model (side, three-quarter, the head three ways, walking,
// golden hour, the game's closest zoom) and three of the usual one, from tools/animal-closeup-review.html,
// saved as JPEGs named <key>-<model>-<view>-<tag>.jpg; then, unless --no-bench, times each model filling
// a 1440x900 frame at 2x (?bench=1) three times, beside the comparison species.
//   node tools/animal-shots.mjs <map:key> <outDir> <tag> [compare=map:key,map:key] [--no-bench]
// e.g. node tools/animal-shots.mjs pnw:cougar docs/ideas/x/s6 before pnw:bobcat,amazon:jaguar
// For true "before" pictures, run it in a detached worktree of the base commit (CLOSEUP_ROOT=<checkout>).
import { execFileSync } from 'node:child_process';
import { mkdir, writeFile, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { openBrowser, projectRoot } from './browser-session.mjs';

const args = process.argv.slice(2), bench = !args.includes('--no-bench');
const [id, out, tag = 'now', compare = ''] = args.filter(a => !a.startsWith('--'));
if (!id || !out) { console.log('usage: node tools/animal-shots.mjs <map:key> <outDir> <tag> [compare] [--no-bench]'); process.exit(1); }
const key = id.split(':')[1], species = [id, ...compare.split(',').filter(Boolean)].join(',');
const SHOTS = [
  ['side', 'view=side&framing=fit'], ['quarter', 'view=quarter&framing=fit'], ['head', 'view=quarter&framing=head'],
  ['headside', 'view=side&framing=head'], ['front', 'view=front&framing=head'], ['walk', 'view=side&pose=walk&framing=fit'],
  ['golden', 'view=quarter&framing=fit&light=golden'], ['game', 'view=game&framing=game'],
];
await mkdir(out, { recursive: true });
const browser = await openBrowser({ label: 'animal-shots', ...(process.env.CLOSEUP_ROOT ? { root: process.env.CLOSEUP_ROOT } : {}), software: false, width: 1600, height: 1200, pixelRatio: 2 });
try {
  for (const model of ['close', 'detail']) for (const [view, q] of SHOTS) {
    if (model === 'detail' && !['side', 'quarter', 'game'].includes(view)) continue;
    await browser.navigate(`/tools/animal-closeup-review.html?species=${species}&model=${model}&${q}`);
    await browser.waitFor('document.body.dataset.ready === "1"', 'Review page did not draw');
    const [title, url] = await browser.evaluate(`(() => { const a = document.querySelector('article'); return [a.querySelector('h2').textContent, a.querySelector('canvas').toDataURL('image/png')]; })()`);
    const png = join(out, `${key}-${model}-${view}-${tag}.png`), jpg = png.replace(/\.png$/, '.jpg');
    await writeFile(png, Buffer.from(url.split(',')[1], 'base64'));
    execFileSync('sips', ['-s', 'format', 'jpeg', '-s', 'formatOptions', '62', png, '--out', jpg], { stdio: 'ignore' }); // (JPEG: small enough to commit)
    await unlink(png);
    if (view === 'side') console.log(model, title);
  }
  if (bench) for (const model of ['close', 'detail']) {
    const runs = [];
    for (let i = 0; i < 3; i++) {
      await browser.navigate(`/tools/animal-closeup-review.html?species=${species}&model=${model}&bench=1`);
      await browser.waitFor('!!document.body.dataset.bench', 'no bench result', 120000);
      runs.push(JSON.parse(await browser.evaluate('document.body.dataset.bench')));
    }
    console.log('bench ms', model, runs.map(r => Object.entries(r).map(([k, v]) => `${k} ${v}`).join(', ')).join(' | '));
  }
  browser.assertHealthy?.();
} finally { await browser.close(); }
console.log('pictures in', out, `(root ${process.env.CLOSEUP_ROOT || projectRoot})`);
