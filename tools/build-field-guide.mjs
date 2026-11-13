// The website's Living Field Guide: /guide/ (every species, by landscape, with a search) and
// /guide/<species>/ (one page each), generated at build time from the game's data
// (tools/field-guide-data.mjs) and the portraits in website/guide-media/.
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fieldGuide } from './field-guide-data.mjs';

const ORIGIN = 'https://secondgrowth.earth';
const esc = text => String(text ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
// The homepage's policy, plus audio for the recordings (the game's own files under play/).
export const GUIDE_CSP = "default-src 'none'; base-uri 'none'; object-src 'none'; script-src 'self' https://www.googletagmanager.com; script-src-attr 'none'; style-src 'self' https://fonts.googleapis.com; img-src 'self' https://*.google-analytics.com https://*.googletagmanager.com; media-src 'self'; font-src 'self' https://fonts.gstatic.com; connect-src https://*.google-analytics.com https://*.analytics.google.com https://*.googletagmanager.com; form-action 'none'; frame-src https://www.googletagmanager.com; worker-src 'none'";

const weight = kg => kg >= 1000 ? `about ${+(kg / 1000).toFixed(1)} tonnes` : kg >= 1 ? `about ${+kg.toFixed(kg < 10 ? 1 : 0)} kg` : `about ${Math.round(kg * 1000)} g`;
const years = n => n >= 1.5 ? `about ${Math.round(n)} years` : n >= 0.9 ? 'about a year' : `about ${Math.round(n * 12)} months`;
const list = items => items.length < 2 ? items.join('') : items.slice(0, -1).join(', ') + ' and ' + items.at(-1);
const STATUS = { native: 'Native', invasive: 'Invasive', introduced: 'Introduced' };

function page({ title, description, path, depth, body, schema, image }) {
  const up = '../'.repeat(depth);
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta http-equiv="Content-Security-Policy" content="${GUIDE_CSP}">
  <meta name="referrer" content="strict-origin-when-cross-origin">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="index, follow, max-image-preview:large">
  <meta name="theme-color" content="#173a30">
  <title>${esc(title)}</title>
  <meta name="description" content="${esc(description)}">
  <link rel="canonical" href="${ORIGIN}${path}">
  <link rel="icon" href="${up}favicon.svg" type="image/svg+xml">
  <link rel="describedby" href="${up}llms.txt" type="text/plain">
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="Second Growth">
  <meta property="og:title" content="${esc(title)}">
  <meta property="og:description" content="${esc(description)}">
  <meta property="og:url" content="${ORIGIN}${path}">
  <meta property="og:image" content="${ORIGIN}/${image || 'share.jpg'}">
  <meta name="twitter:card" content="${image ? 'summary' : 'summary_large_image'}">
  <script src="${up}gtm.js" async></script>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600&family=Nunito:wght@400;600;700;800&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="${up}site.css?v=guide-20261112">
  <link rel="stylesheet" href="${up}guide.css?v=guide-20261112">
  <script type="application/ld+json">${JSON.stringify(schema).replace(/</g, '\\u003c')}</script>
</head>
<body class="guide">
  <a class="skip" href="#main">Skip to content</a>
  <header class="header wrap"><a class="brand" href="${up}">Second Growth</a><nav class="site-nav" aria-label="Main navigation"><a href="${up}guide/">Field guide</a><a href="${up}#places">Landscapes</a><a href="${up}#ecology">Ecology</a></nav><a class="button small" href="${up}play/">Play <span aria-hidden="true">↗</span></a></header>
  <main id="main" class="wrap">
${body}
  </main>
  <footer class="footer wrap"><a class="brand" href="${up}">Second Growth</a><nav aria-label="Footer"><a href="${up}guide/">Field guide</a><a href="${up}#about">Project &amp; credits</a><a href="${up}visuals.html">Game imagery</a></nav><span>Free browser game · In development</span><small class="copyright">© 2026 Second Growth</small></footer>
</body>
</html>
`;
}

function speciesPage(e, landscapes, portrait) {
  const where = e.maps.map(m => landscapes[m.id] || m.region);
  const animal = e.kind === 'animal';
  const lead = animal
    ? `${e.name} is one of the animals that can come back in Second Growth's ${list(where)} landscape${where.length > 1 ? 's' : ''}, when the habitat suits it.`
    : e.status === 'invasive' ? `${e.name} is an invasive plant in Second Growth's ${list(where)} landscape${where.length > 1 ? 's' : ''}: part of restoring the land is clearing it.`
    : e.status === 'introduced' ? `${e.name} is an introduced plant in Second Growth's ${list(where)} landscape${where.length > 1 ? 's' : ''}.`
    : `${e.name} is one of the native plants you can grow in Second Growth's ${list(where)} landscape${where.length > 1 ? 's' : ''}.`;
  const facts = animal ? [
    ['Group', e.group],
    e.kg && ['Size', weight(e.kg)],
    e.life && ['Lives', years(e.life) + ' in the game'],
    e.young && ['Young born', e.young],
    e.nocturnal && ['Active', 'At night'],
  ] : [
    ['Type', e.group + (e.aquatic ? ', aquatic' : '')],
    ['Status', STATUS[e.status]],
    ['Grows in', e.grows[0].toUpperCase() + e.grows.slice(1)],
    e.heightM && ['Height', `up to about ${e.heightM} m`],
    e.nitrogen && ['Soil', 'Fixes nitrogen'],
  ];
  const description = `${e.name}${e.sci ? ` (${e.sci})` : ''} in Second Growth: ${e.desc}`.slice(0, 300);
  const rec = e.recording;
  const body = `    <nav class="crumbs" aria-label="Breadcrumb"><a href="../">Field guide</a> <span aria-hidden="true">/</span> ${esc(animal ? e.group : 'Plants')}</nav>
    <article class="species">
      <figure class="species-portrait${e.status === 'invasive' ? ' invasive' : ''}"><img src="../../guide-media/${esc(portrait.file)}" alt="${esc(e.name)} as drawn in Second Growth${portrait.look === 'male' ? ' (adult male)' : ''}." width="${portrait.width}" height="${portrait.height}"><figcaption>As drawn in the game${portrait.look === 'male' ? ' · adult male' : ''}</figcaption></figure>
      <div class="species-text">
        <p class="eyebrow">${esc(animal ? e.group : e.group + ' · ' + STATUS[e.status])}</p>
        <h1>${esc(e.name)}</h1>
        ${e.sci ? `<p class="sci">${esc(e.sci)}</p>` : ''}
        <p class="species-desc">${esc(e.desc)}</p>
        <p class="species-lead">${esc(lead)}</p>
        <dl class="species-facts">${facts.filter(Boolean).map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>
        ${rec ? `<div class="species-call"><p class="eyebrow">Its call, as heard in the game</p><audio controls preload="none" src="../../play/assets/sounds/${esc(rec.clip)}.m4a"></audio><p class="credit">Recording by ${esc(rec.by)}, <a href="${esc(rec.licenseUrl)}" rel="license noopener" target="_blank">${esc(rec.license)}</a> · <a href="${esc(rec.source)}" rel="noopener" target="_blank">source</a></p></div>` : ''}
      </div>
    </article>
    <section class="species-where" aria-labelledby="where-title">
      <h2 id="where-title">Where to find it in the game</h2>
      <ul>${e.maps.map(m => `<li><div><strong>${esc(landscapes[m.id] || m.region)}</strong><span>${esc(m.farm)} · ${esc(m.region)}</span>${m.hint ? `<p>${animal ? 'What it needs: ' : ''}${esc(m.hint)}</p>` : ''}</div><a class="map-play" href="../../play/?map=${esc(m.id)}">Play ${esc(landscapes[m.id] || m.region)} <span aria-hidden="true">↗</span></a></li>`).join('')}</ul>
    </section>
    <aside class="model-note guide-note"><span class="eyebrow">About the game</span><p>Second Growth simplifies how species live and speeds up time. Sizes are real-world figures; lifespans and seasons are the game's. For real-world identification and status, check a regional field guide.</p></aside>`;
  return page({
    title: `${e.name}${e.sci ? ` (${e.sci})` : ''} · Second Growth field guide`, description, path: `/guide/${e.slug}/`, depth: 2, body,
    image: `guide-media/${portrait.file}`,
    schema: { '@context': 'https://schema.org', '@type': 'WebPage', name: `${e.name} in Second Growth`, url: `${ORIGIN}/guide/${e.slug}/`, description,
      isPartOf: { '@type': 'WebSite', name: 'Second Growth', url: ORIGIN + '/' },
      about: { '@type': 'Taxon', name: e.name, ...(e.sci ? { alternateName: e.sci } : {}) },
      primaryImageOfPage: { '@type': 'ImageObject', url: `${ORIGIN}/guide-media/${portrait.file}`, width: portrait.width, height: portrait.height } },
  });
}

function indexPage(guide, landscapes, portraits) {
  const card = e => `<li data-search="${esc((e.name + ' ' + (e.sci || '') + ' ' + e.group).toLowerCase())}"><a href="${e.slug}/"><img src="../guide-media/${esc(portraits[e.slug].file)}" alt="" width="160" height="120" loading="lazy" decoding="async"><span><strong>${esc(e.name)}</strong>${e.sci ? `<em>${esc(e.sci)}</em>` : ''}${e.status === 'invasive' ? '<b class="tag">Invasive</b>' : ''}</span></a></li>`;
  const sections = Object.entries(landscapes).map(([id, name]) => {
    const here = guide.filter(e => e.maps.some(m => m.id === id));
    const animals = here.filter(e => e.kind === 'animal'), plants = here.filter(e => e.kind === 'plant');
    return `    <section class="guide-map" id="${esc(id)}" aria-labelledby="${esc(id)}-title">
      <div class="section-head"><div><p class="eyebrow">${esc((m => m ? `${m.farm} · ${m.region}` : '')(here[0]?.maps.find(m => m.id === id)))}</p><h2 id="${esc(id)}-title">${esc(name)}</h2></div><a class="map-play" href="../play/?map=${esc(id)}">Play ${esc(name)} <span aria-hidden="true">↗</span></a></div>
      <h3>Animals <small>${animals.length}</small></h3><ul class="guide-cards">${animals.map(card).join('')}</ul>
      <h3>Plants <small>${plants.length}</small></h3><ul class="guide-cards">${plants.map(card).join('')}</ul>
    </section>`;
  }).join('\n');
  const animals = guide.filter(e => e.kind === 'animal').length, plants = guide.length - animals;
  const description = `Every animal and plant in Second Growth: ${animals} animals and ${plants} plants across seven landscapes, from Roosevelt elk to coral, with what each needs to come back.`;
  const body = `    <div class="guide-intro"><p class="eyebrow">The Second Growth field guide</p><h1>Every species<br> in the game.</h1><p>${animals} animals and ${plants} plants across seven landscapes, each drawn as it appears in the game, with what it needs to come back. Pick a landscape or search.</p></div>
    <div class="guide-tools"><label class="guide-search"><span>Search the guide</span><input type="search" placeholder="Elk, oak, Ficus…" autocomplete="off"></label><nav aria-label="Landscapes">${Object.entries(landscapes).map(([id, name]) => `<a href="#${esc(id)}">${esc(name)}</a>`).join('')}</nav></div>
    <p class="guide-empty" hidden>Nothing in the guide matches that.</p>
${sections}
    <script src="../guide.js?v=guide-20261112" defer></script>`;
  return page({ title: 'Field guide: every animal and plant in Second Growth', description, path: '/guide/', depth: 1, body,
    schema: { '@context': 'https://schema.org', '@type': 'CollectionPage', name: 'Second Growth field guide', url: `${ORIGIN}/guide/`, description,
      isPartOf: { '@type': 'WebSite', name: 'Second Growth', url: ORIGIN + '/' } } });
}

// landscapes: { mapId: name } in homepage order. portraits: guide-provenance.json's portraits.
export function guidePaths(guide = fieldGuide()) { return ['/guide/', ...guide.map(e => `/guide/${e.slug}/`)]; }
export async function buildFieldGuide(output, landscapes, portraits) {
  const guide = fieldGuide();
  const missing = guide.filter(e => !portraits[e.slug]).map(e => e.slug);
  if (missing.length) throw Error(`No field-guide portrait for ${missing.slice(0, 8).join(', ')}${missing.length > 8 ? ` and ${missing.length - 8} more` : ''}: run tools/capture-field-guide.mjs`);
  await mkdir(join(output, 'guide'), { recursive: true });
  await writeFile(join(output, 'guide/index.html'), indexPage(guide, landscapes, portraits));
  for (const e of guide) {
    await mkdir(join(output, 'guide', e.slug), { recursive: true });
    await writeFile(join(output, 'guide', e.slug, 'index.html'), speciesPage(e, landscapes, portraits[e.slug]));
  }
  return guide;
}
