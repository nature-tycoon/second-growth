// Check the actual published tree: every relative HTML/CSS asset must resolve,
// and the game copy must be byte-for-byte identical to the tested source.
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { join, dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildWebsite } from './build-website.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = await buildWebsite();
async function files(directory) {
  return (await Promise.all((await readdir(directory, { withFileTypes: true })).map(entry => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? files(path) : [path];
  }))).flat();
}
const homepage = await readFile(join(output, 'index.html'), 'utf8');
assert.ok(!homepage.includes('<script'), 'Homepage must not load the game engine');
assert.equal((homepage.match(/href="play\/"/g) || []).length, 3, 'All three play buttons use the hosted game');
for (const name of ['index.html', 'site.css', 'play/index.html']) {
  const path = join(output, name), source = await readFile(path, 'utf8');
  const links = [...source.matchAll(/(?:src|href)="([^"#]+)"|url\(['"]?([^)'"\s]+)['"]?\)/g)].map(m => m[1] || m[2]);
  for (const link of links) {
    if (/^(?:https?:|data:|#)/.test(link)) continue;
    const target = resolve(dirname(path), decodeURIComponent(link.split(/[?#]/)[0]));
    assert.ok(!relative(output, target).startsWith('..'), `Asset escapes website: ${link}`);
    try { await readFile(link.endsWith('/') ? join(target, 'index.html') : target); }
    catch (error) { throw new Error(`${name}: missing asset ${link}`, { cause: error }); }
  }
}
for (const file of await files(join(output, 'play'))) {
  const original = join(root, relative(join(output, 'play'), file));
  assert.deepEqual(await readFile(file), await readFile(original), `Game package changed: ${original}`);
}
const manifest = JSON.parse(await readFile(join(output, 'play/manifest.json'), 'utf8'));
assert.equal(manifest.start_url, './');
assert.equal(manifest.scope, './');
assert.equal((await readFile(join(output, 'CNAME'), 'utf8')).trim(), 'secondgrowth.earth');
assert.ok(!(await readdir(output)).includes('tools'), 'Developer tools must not be published');
console.log('PASS homepage links, game asset paths, manifest scope, domain, and exact game package');
