// Check the actual published tree: every relative HTML/CSS asset must resolve,
// and the game copy must be byte-for-byte identical to the tested source.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { join, dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildWebsite } from './build-website.mjs';
import { publicWebsitePaths, websiteFacts, websiteOrigin, websiteText } from './website-discovery.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
async function files(directory) {
  return (await Promise.all((await readdir(directory, { withFileTypes: true })).map(entry => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? files(path) : [path];
  }))).flat();
}
const homepage = await readFile(join(root, 'website/index.html'), 'utf8');
const review = process.argv.includes('--review');
assert.ok(review || !homepage.includes('data-review="true"'), 'This is an artwork review, not a release. Use --review for local checks. Approve fresh visuals before publishing.');
assert.ok(!/(?:src|poster)="(?:assets\/|art\/)/.test(homepage), 'Do not reuse outdated game artwork in this revision');
const freshFiles = new Set();
for (const name of ['header-provenance.json', 'content-provenance.json']) {
  const provenance = JSON.parse(await readFile(join(root, 'website/review-media', name), 'utf8'));
  if (name === 'header-provenance.json') assert.equal(provenance.map, 'pnw');
  else {
    assert.equal(provenance.captures.length, 13, 'Three creek stages, seven regional views and three details');
    const regions = provenance.captures.filter(capture => capture.file.startsWith('landscape-'));
    assert.equal(regions.length, 7, 'One fresh image per landscape');
    assert.ok(regions.every(capture => capture.moment?.key), 'Regional images must use recorded keystone moments');
    assert.equal(provenance.sequence.stages.before.fishAccess, 0);
    assert.equal(provenance.sequence.stages.planted.fishAccess, 1);
    assert.equal(provenance.sequence.stages.later.day - provenance.sequence.stages.before.day, 240);
    assert.equal(provenance.sequence.stages.later.planted, provenance.sequence.stages.planted.planted, 'No extra planting during the creek comparison');
  }
  for (const capture of provenance.captures) {
    const bytes = await readFile(join(root, 'website/review-media', capture.file));
    assert.equal(createHash('sha256').update(bytes).digest('hex'), capture.sha256, 'Image must match its fresh capture provenance');
    assert.ok(bytes.length < 1_500_000, 'Keep individual website images below 1.5 MB');
    freshFiles.add(capture.file);
  }
}
for (const match of homepage.matchAll(/(?:src|srcset|data-image)="review-media\/([^"?]+)"/g)) assert.ok(freshFiles.has(match[1]), 'Homepage imagery must have recorded fresh provenance');
assert.ok(!/Fresh captures? needed|This sequence is planned|visual-slot/.test(homepage), 'Finished homepage must not contain image placeholders');
const output = await buildWebsite();
const publishedHome = await readFile(join(output, 'index.html'), 'utf8');
const gallery = await readFile(join(output, 'visuals.html'), 'utf8');
const facts = websiteFacts(homepage);
assert.equal(facts.maps.length, 7);
assert.ok(facts.questions.length >= 6, 'Keep clear player questions in crawlable HTML');
for (const map of facts.maps) assert.ok(websiteText(gallery).includes(map.copy), `${map.name} must have a readable description without JavaScript`);
for (const [path, page] of [['/', publishedHome], ['/visuals.html', gallery]]) {
  assert.ok(page.includes(`<link rel="canonical" href="${websiteOrigin}${path}">`), 'Each content page needs its own canonical URL');
  assert.ok(page.includes('rel="describedby" href="llms.txt"'), 'Publish a discovery link for the AI guide');
  if (!review) assert.ok(!/data-review="true"|noindex|nofollow|class="review-bar"|Homepage preview|Website review/.test(page), 'Remove all preview notices and indexing restrictions before release');
}
const robots = await readFile(join(output, 'robots.txt'), 'utf8');
assert.match(robots, /^User-agent: \*\s*\nAllow: \/\s*$/m, 'Search and AI bots inherit the public wildcard rule');
assert.ok(!/^Disallow:\s*\S/m.test(robots), 'Do not accidentally block public assets or crawlers');
assert.ok(robots.includes('Sitemap: ' + websiteOrigin + '/sitemap.xml'));
const sitemap = await readFile(join(output, 'sitemap.xml'), 'utf8');
const locations = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(([, url]) => url);
assert.deepEqual(locations, publicWebsitePaths.map(path => websiteOrigin + path));
for (const url of locations) {
  const path = new URL(url).pathname;
  await readFile(join(output, path.endsWith('/') ? path + 'index.html' : path));
}
const llms = await readFile(join(output, 'llms.txt'), 'utf8');
assert.ok(llms.startsWith('# Second Growth\n\n> '), 'Keep the llms.txt proposal format');
const markdown = await readFile(join(output, 'index.md'), 'utf8');
assert.ok(markdown.includes(facts.description) && markdown.includes(facts.modelNote));
for (const map of facts.maps) assert.ok(markdown.includes(map.copy) && markdown.includes(map['moment-description']), 'Markdown landscape facts must follow the homepage');
for (const {question, answer} of facts.questions) assert.ok(markdown.includes(question) && markdown.includes(answer), 'Markdown answers must follow visible player information');
for (const [, url] of (llms + '\n' + markdown).matchAll(/\]\((https:\/\/secondgrowth\.earth\/[^)]*)\)/g)) {
  const path = new URL(url).pathname;
  await readFile(join(output, path.endsWith('/') ? path + 'index.html' : path));
}
const schema = JSON.parse(publishedHome.match(/<script type="application\/ld\+json" id="site-schema">([\s\S]*?)<\/script>/)[1]);
const graph = schema['@graph'];
assert.equal(schema['@context'], 'https://schema.org');
assert.equal(new Set(graph.map(node => node['@id'])).size, graph.length, 'Use stable distinct entity IDs');
const game = graph.find(node => node['@type'].includes('VideoGame'));
assert.equal(game.name, 'Second Growth');
assert.equal(game.description, facts.description);
assert.equal(game.url, websiteOrigin + '/play/');
assert.equal(game.isAccessibleForFree, true);
assert.equal(game.offers.price, '0');
assert.equal(game.featureList.length, 7);
assert.ok(!graph.some(node => node.aggregateRating || node.review), 'Never invent reviews or ratings for search markup');
assert.deepEqual(graph.find(node => node['@type'] === 'FAQPage').mainEntity.map(node => ({question: node.name, answer: node.acceptedAnswer.text})), facts.questions, 'Structured answers must match visible answers exactly');
for (const [attribute, property] of [['property', 'og:image'], ['name', 'twitter:image']]) {
  assert.ok(publishedHome.includes(`<meta ${attribute}="${property}" content="${websiteOrigin}/share.jpg">`), `${property} uses the 1200×630 crop of the approved hero`);
}
assert.deepEqual([...homepage.matchAll(/<script[^>]+src="([^"]+)"/g)].map(m => m[1].split('?')[0]), ['site.js'], 'Homepage may load only its static image selectors, never the game engine');
assert.equal((homepage.match(/href="play\/"/g) || []).length, 3, 'All three play buttons use the hosted game');
for (const name of ['index.html', 'visuals.html', 'site.css', 'play/index.html']) {
  const path = join(output, name), source = await readFile(path, 'utf8');
  const links = [...source.matchAll(/(?:src|srcset|href|data-image)="([^"#]+)"|url\(['"]?([^)'"\s]+)['"]?\)/g)].map(m => m[1] || m[2]);
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
for (const name of ['favicon.ico', 'favicon.svg', 'apple-touch-icon.png', 'share.jpg']) await readFile(join(output, name));
assert.ok(!(await readdir(output)).includes('art'), 'Legacy homepage artwork must not be published');
console.log('PASS public indexing, robots, sitemap, llms.txt, Markdown facts, matching structured data, homepage links, fresh imagery, and exact game package');
