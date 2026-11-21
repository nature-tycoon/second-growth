// Keep the homepage separate from the game and itch.io's game-only package.
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { websiteDiscovery, websiteFacts } from './website-discovery.mjs';
import { buildFieldGuide, guidePaths } from './build-field-guide.mjs';
import { buildHelp, helpPaths } from './build-help.mjs';
import { execFileSync } from 'node:child_process';

// The sitemap's lastmod: the last commit touching a page's sources. None from a shallow clone
// (every file would date to HEAD), so pages.yml checks out the full history without blobs.
const git = args => { try { return execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch { return ''; } };
const fullHistory = git(['rev-parse', '--is-shallow-repository']) === 'false';
const lastChanged = files => fullHistory ? git(['log', '-1', '--format=%cs', '--', ...files]) || null : null;
const GUIDE_SOURCES = ['tools/build-field-guide.mjs', 'tools/field-guide-data.mjs', 'website/guide.css'];
function sitemapDates(guide) {
  const dates = {
    '/': lastChanged(['website/index.html']), '/play/': lastChanged(['index.html', 'styles.css', 'js']),
    '/visuals.html': lastChanged(['website/visuals.html']), '/privacy/': lastChanged(['website/privacy']),
    '/guide/': lastChanged([...GUIDE_SOURCES, 'js/data']),
  };
  dates['/help/flooding/'] = lastChanged(['tools/build-help.mjs']);
  for (const e of guide) dates[`/guide/${e.slug}/`] = lastChanged([...GUIDE_SOURCES, ...e.maps.flatMap(m => [`js/data/animals-${m.id}.js`, `js/data/plants-${m.id}.js`])]);
  return dates;
}

export const websiteOutput = fileURLToPath(new URL('../dist/website/', import.meta.url));
export async function buildWebsite() {
  const root = fileURLToPath(new URL('../', import.meta.url));
  await rm(websiteOutput, { recursive: true, force: true });
  await mkdir(join(websiteOutput, 'play'), { recursive: true });
  await cp(join(root, 'website'), websiteOutput, { recursive: true });
  // Retain legacy source artwork in Git, but do not publish it with the homepage. Generated art
  // (key art, capsules, logo lockups) is published only with a line in art/art-provenance.json.
  await rm(join(websiteOutput, 'art'), { recursive: true, force: true });
  const { art } = JSON.parse(await readFile(join(root, 'website/art/art-provenance.json'), 'utf8'));
  if (art.length) {
    await mkdir(join(websiteOutput, 'art'));
    for (const name of ['art-provenance.json', ...art.map(entry => entry.file)]) await cp(join(root, 'website/art', name), join(websiteOutput, 'art', name));
  }
  for (const path of ['index.html', 'styles.css', 'manifest.json', 'version.json', 'js', 'assets', 'vendor']) {
    await cp(join(root, path), join(websiteOutput, 'play', path), { recursive: true });
  }
  await writeFile(join(websiteOutput, '.nojekyll'), '');
  await writeFile(join(websiteOutput, 'CNAME'), 'secondgrowth.earth\n');
  const homepage = await readFile(join(websiteOutput, 'index.html'), 'utf8');
  // The field guide: a page per species, named for the landscapes as the homepage names them.
  const landscapes = Object.fromEntries(websiteFacts(homepage).maps.map(map => [map.map, map.name]));
  const { portraits } = JSON.parse(await readFile(join(root, 'website/guide-media/guide-provenance.json'), 'utf8'));
  const guide = await buildFieldGuide(websiteOutput, landscapes, portraits);
  await buildHelp(websiteOutput, landscapes);
  const discovery = websiteDiscovery(homepage, [...guidePaths(guide), ...helpPaths], sitemapDates(guide));
  const schema = JSON.stringify(discovery.schema, null, 2).replace(/</g, '\\u003c');
  await writeFile(join(websiteOutput, 'index.html'), homepage.replace('</head>', `  <script type="application/ld+json" id="site-schema">\n${schema}\n  </script>\n</head>`));
  await writeFile(join(websiteOutput, 'index.md'), discovery.markdown);
  await writeFile(join(websiteOutput, 'sitemap.xml'), discovery.sitemap);
  console.log('Website and playable game built in dist/website');
  return websiteOutput;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await buildWebsite();
