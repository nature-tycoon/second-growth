// Keep the homepage separate from the game and itch.io's game-only package.
import { cp, mkdir, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { join } from 'node:path';

export const websiteOutput = fileURLToPath(new URL('../dist/website/', import.meta.url));
export async function buildWebsite() {
  const root = fileURLToPath(new URL('../', import.meta.url));
  await rm(websiteOutput, { recursive: true, force: true });
  await mkdir(join(websiteOutput, 'play'), { recursive: true });
  await cp(join(root, 'website'), websiteOutput, { recursive: true });
  await mkdir(join(websiteOutput, 'assets'), { recursive: true });
  for (const path of ['assets/logo.svg', 'assets/maps']) {
    await cp(join(root, path), join(websiteOutput, path), { recursive: true });
  }
  for (const path of ['index.html', 'styles.css', 'manifest.json', 'js', 'assets', 'vendor']) {
    await cp(join(root, path), join(websiteOutput, 'play', path), { recursive: true });
  }
  await writeFile(join(websiteOutput, '.nojekyll'), '');
  await writeFile(join(websiteOutput, 'CNAME'), 'secondgrowth.earth\n');
  await writeFile(join(websiteOutput, 'robots.txt'), 'User-agent: *\nAllow: /\nSitemap: https://secondgrowth.earth/sitemap.xml\n');
  await writeFile(join(websiteOutput, 'sitemap.xml'), '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>https://secondgrowth.earth/</loc></url><url><loc>https://secondgrowth.earth/play/</loc></url></urlset>\n');
  console.log('Website and playable game built in dist/website');
  return websiteOutput;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await buildWebsite();
