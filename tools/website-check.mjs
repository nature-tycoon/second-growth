// Check the actual published tree: every relative HTML/CSS asset must resolve,
// and the game copy must be byte-for-byte identical to the tested source.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
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
// Video loops (tools/capture-site-video.mjs): every file hashed, a size cap, both formats and a poster.
const videoProvenance = JSON.parse(await readFile(join(root, 'website/review-media/video/video-provenance.json'), 'utf8'));
for (const id of ['hollis-creek-flyover', 'map-to-forest-floor']) assert.ok(videoProvenance.clips.some(clip => clip.id === id), `Missing the ${id} clip`);
assert.ok(videoProvenance.clips.filter(clip => clip.moment?.key).length >= 2, 'At least two keystone moment clips');
// The hero and the descent fill the screen, so they are filmed bigger and sharper (10 MB); every other clip 5 MB.
const fullScreenClips = new Set(['hollis-creek-flyover', 'hollis-creek-flyover-vertical', 'map-to-forest-floor']);
for (const clip of videoProvenance.clips) {
  const videoCap = fullScreenClips.has(clip.id) ? 10_000_000 : 5_000_000;
  assert.match(clip.sourceRevision, /^[0-9a-f]{40}$/, `${clip.id}: record the game revision it was filmed from`);
  assert.ok(clip.seconds >= 6 && clip.seconds <= 12 && clip.frames === clip.seconds * clip.fps, `${clip.id}: 6–12 s at a fixed frame rate`);
  assert.ok(Math.max(clip.width, clip.height) >= 1600, `${clip.id}: at least 1600 px on the long side`);
  assert.ok(clip.camera?.shots?.length, `${clip.id}: record the camera path`);
  assert.deepEqual(clip.files.map(file => file.file.split('.').pop()).sort(), ['jpg', 'mp4', 'webm'], `${clip.id}: an MP4, a WebM and a poster`);
  for (const file of clip.files) {
    const bytes = await readFile(join(root, 'website/review-media/video', file.file));
    assert.equal(createHash('sha256').update(bytes).digest('hex'), file.sha256, `${file.file} must match its capture provenance`);
    if (file.role === 'video') {
      assert.ok(bytes.length <= videoCap, `${file.file}: keep it at ${videoCap / 1e6} MB or less`);
      assert.ok(file.checked?.duration, `${file.file}: the capture must have played it back`);
    } else assert.ok(bytes.length < 1_500_000, `${file.file}: keep posters below 1.5 MB`);
    freshFiles.add('video/' + file.file);
  }
}
const mediaAttribute = /(?:src|srcset|data-image|poster|data-(?:wide-|tall-)?(?:mp4|webm))="review-media\/([^"?]+)"/g;
for (const match of homepage.matchAll(mediaAttribute)) assert.ok(freshFiles.has(match[1]), 'Homepage imagery and footage must have recorded fresh provenance');
// The landing page's footage: the hero flyover (wide and upright), the descent, and the keystone reel.
for (const id of ['hollis-creek-flyover', 'hollis-creek-flyover-vertical', 'map-to-forest-floor']) assert.ok(homepage.includes(`review-media/video/${id}.mp4`) && homepage.includes(`review-media/video/${id}.webm`), `Homepage plays ${id} in both formats`);
assert.ok(homepage.match(/class="moment-clip"/g)?.length >= 2, 'At least two keystone clips on the homepage');
assert.ok(!/<video\b[^>]*\bautoplay\b/.test(homepage), 'site.js starts footage after load and never with reduced motion or Save-Data, so no autoplay attribute');
assert.ok([...homepage.matchAll(/<video\b[^>]*>/g)].every(([tag]) => /\bmuted\b/.test(tag) && /\bplaysinline\b/.test(tag) && /preload="none"/.test(tag)), 'Every homepage video is muted, inline and downloads nothing up front');
// Media captured from a much older game: a warning, not a failure (recapturing is a manual step on a
// Mac with a GPU). The game's date is its release stamp (js/release.js, set at deploy) or the
// checkout's last commit; the media's is the date of the revision it was captured from.
{
  const { RELEASE } = await import('../js/release.js');
  const git = (...args) => { try { return execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch { return null; } };
  const gameDate = RELEASE.match(/^\d{4}-\d{2}-\d{2}/)?.[0] || git('show', '-s', '--format=%cs', 'HEAD');
  const stale = [];
  for (const [name, path] of [['header stills', 'header-provenance.json'], ['content stills', 'content-provenance.json'], ['video loops', 'video/video-provenance.json']]) {
    const provenance = JSON.parse(await readFile(join(root, 'website/review-media', path), 'utf8'));
    const revisions = [...new Set([provenance.sourceRevision, ...(provenance.clips || []).map(clip => clip.sourceRevision)].filter(Boolean))];
    for (const revision of revisions) {
      // (CI checks out one commit, so an older revision may be missing: then the capture date stands in)
      const capturedDate = git('show', '-s', '--format=%cs', revision) || provenance.capturedAt.slice(0, 10);
      const days = Math.round((Date.parse(gameDate) - Date.parse(capturedDate)) / 864e5);
      const gameCommits = git('rev-list', '--count', `${revision}..HEAD`, '--', 'js', 'vendor', 'index.html', 'styles.css');
      if (days > 30 || Number(gameCommits) > 80) stale.push(`${name} (${path}) were captured from ${revision.slice(0, 7)} on ${capturedDate}, ${days} days${gameCommits ? ` and ${gameCommits} game commits` : ''} before this game (${gameDate})`);
    }
  }
  for (const line of stale) console.warn('WARNING: ' + line + '. Recapture: see the Website paragraph in AGENTS.md.');
}
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
assert.deepEqual([...homepage.matchAll(/<script[^>]+src="([^"]+)"/g)].map(m => m[1].split('?')[0]), ['gtm.js', 'site.js'], 'Homepage may load only Tag Manager and its static image selectors, never the game engine');
assert.ok(!(await readFile(join(output, 'play/index.html'), 'utf8')).includes('googletagmanager'), 'Tag Manager stays off the game');
assert.equal((homepage.match(/href="play\/"/g) || []).length, 3, 'All three play buttons use the hosted game');
// Each landscape's "Play" link opens the game's start screen on that map (main.js reads ?map=).
const { BIOMES } = await import('../js/biome.js');
for (const map of facts.maps) {
  assert.ok(Object.hasOwn(BIOMES, map.map), `${map.name}: unknown game map ${map.map}`);
  assert.equal(map.play, `play/?map=${map.map}`, `${map.name} needs its own play link`);
}
assert.ok(homepage.includes(`id="map-play" href="${facts.maps[0].play}"`), 'The play link starts on the first landscape shown');
for (const name of ['index.html', 'visuals.html', 'site.css', 'play/index.html']) {
  const path = join(output, name), source = await readFile(path, 'utf8');
  const links = [...source.matchAll(/(?:src|srcset|href|data-image|poster|data-(?:wide-|tall-)?(?:mp4|webm))="([^"#]+)"|url\(['"]?([^)'"\s]+)['"]?\)/g)].map(m => m[1] || m[2]);
  for (const link of links) {
    if (/^(?:https?:|data:|#)/.test(link)) continue;
    const file = link.split(/[?#]/)[0], target = resolve(dirname(path), decodeURIComponent(file));
    assert.ok(!relative(output, target).startsWith('..'), `Asset escapes website: ${link}`);
    try { await readFile(file.endsWith('/') ? join(target, 'index.html') : target); }
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
