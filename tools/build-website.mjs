// Keep the homepage separate from the game and itch.io's game-only package.
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { websiteDiscovery } from './website-discovery.mjs';

export const websiteOutput = fileURLToPath(new URL('../dist/website/', import.meta.url));
export async function buildWebsite() {
  const root = fileURLToPath(new URL('../', import.meta.url));
  await rm(websiteOutput, { recursive: true, force: true });
  await mkdir(join(websiteOutput, 'play'), { recursive: true });
  await cp(join(root, 'website'), websiteOutput, { recursive: true });
  // Retain legacy source artwork in Git, but do not publish it with the homepage.
  await rm(join(websiteOutput, 'art'), { recursive: true, force: true });
  for (const path of ['index.html', 'styles.css', 'manifest.json', 'js', 'assets', 'vendor']) {
    await cp(join(root, path), join(websiteOutput, 'play', path), { recursive: true });
  }
  await writeFile(join(websiteOutput, '.nojekyll'), '');
  await writeFile(join(websiteOutput, 'CNAME'), 'secondgrowth.earth\n');
  const homepage = await readFile(join(websiteOutput, 'index.html'), 'utf8');
  const discovery = websiteDiscovery(homepage);
  const schema = JSON.stringify(discovery.schema, null, 2).replace(/</g, '\\u003c');
  await writeFile(join(websiteOutput, 'index.html'), homepage.replace('</head>', `  <script type="application/ld+json" id="site-schema">\n${schema}\n  </script>\n</head>`));
  await writeFile(join(websiteOutput, 'index.md'), discovery.markdown);
  await writeFile(join(websiteOutput, 'sitemap.xml'), discovery.sitemap);
  console.log('Website and playable game built in dist/website');
  return websiteOutput;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await buildWebsite();
