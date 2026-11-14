// Drafts the month's newsletter notes from git history: node tools/monthly-notes.mjs [YYYY-MM] [--stdout]
// Reads `git log main` for the month, drops housekeeping commits, groups what players would notice,
// rewords each subject into one plain sentence, and links species to their field guide pages.
// Writes docs/newsletter/<YYYY-MM>.md. No network, deterministic for a given history. See docs/newsletter/README.md.
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SITE = 'https://secondgrowth.earth';

export function parseMonth(arg, now = new Date()) {
  if (!arg) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
  }
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(arg)) throw new Error(`Month must look like 2026-10, got "${arg}"`);
  return arg;
}
export function monthRange(month) {
  const [y, m] = month.split('-').map(Number);
  const next = new Date(Date.UTC(y, m, 1));
  return { since: `${month}-01`, until: `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, '0')}-01`, label: new Date(Date.UTC(y, m - 1, 1)).toLocaleString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' }) };
}

// A merge subject names something only when it isn't a plain branch or pull-request merge.
const PLAIN_MERGE = /^Merge (pull request|branch|remote-tracking|origin|main|refs|wave|test)/i;
const HOUSEKEEPING = [
  /\[skip ci\]/i, /^(chore|ci|docs?|test|build|refactor)(\(.*\))?:/i, /^test merge/i, /^revert/i,
  /^Ideas batch/i, /^Record /i, /^Performance review/i, /^Document /i, /^AGENTS/i, /\bdecision\b/i, /\bbaselines?\b/i,
  /\b[\w-]+-check\b/i, /\bchecks?\b.*\b(pass|again|fixtures?)\b/i, /\bfixtures?\b/i, /\bbrowser checks?\b/i, /\bsuite\b/i,
  /\b(recapture|stills?|review-media|capture[sd]?)\b/i, /\bPostHog\b/i, /\bTag Manager\b/i, /\bporkbun\b/i, /\bDNS\b/i,
  /\brenumber/i, /\bgitignore\b/i, /\bREADME\b/i, /\bprovenance\b/i, /\bCI\b/, /\bpull requests?\b/i,
  // internal work: idea batches and their notes, refactors, measurements, analytics, tooling
  /^Ideas? (batch|wave)/i, /^Ideas? /i, /^Model sheets/i, /^(The )?succession stack/i, /^Animal behaviours\b/i, /^Switch off\b/i, /^Add device-local/i, /\bnotes?\b.*\b(answers?|done|open)\b|\bopen questions?\b/i, /^Traits on species/i, /^Fix \d/i, /\bfix \d\b/i, /\brefactor/i,
  /^Motion sweep/i, /^Calibrate/i, /^Sim RNG/i, /-probe\b|\bprobe\b/i, /^Timings\b|^Final before|\bbefore\/after numbers\b/i,
  /^Simulation back under/i, /^Cole's (answers|call)/i, /\bdecided\b/i, /^Analytics\b/i, /\bQuick wins \d+: .*\bcheck\b/i, /\bseed noise\b/i, /\bpure move\b/i, /\bdocs?\b,/i, /\bplan\.?$/i, /\btick\b/i, /Cole's (answers|call)/i, /\bTimings\b|\bquiet (machine|Mac)\b/i, /sim-random|wildRng|Math\.random|\brandom stream\b|\bResizeObserver\b|\bmerge fixes\b/i, /\bopen\.md\b/i,
];
// Pure housekeeping is dropped; a descriptive merge subject ("Merge the Ecosystem Report into integration") is kept, reworded.
export function shouldSkip(subject, isMerge = false) {
  let s = subject.trim();
  if (!s) return true;
  if (isMerge) {
    if (PLAIN_MERGE.test(s)) return true;
    s = s.replace(/^Merge\s+/i, '').replace(/\s+(in)?to (integration|main|today's main|current main)\b.*$/i, '').replace(/^onto /i, '');
    if (!s || /^(branch|origin)/i.test(s)) return true;
  }
  if (!isMerge && /^Merge /.test(s)) return true;
  return HOUSEKEEPING.some(rx => rx.test(s));
}

// One plain sentence: no decision numbers or tags, capitalised, ends with a full stop, cut at a clause if long.
export function rewrite(subject, isMerge = false) {
  let s = subject.trim();
  if (isMerge) s = s.replace(/^Merge\s+/i, '').replace(/\s+(in)?to (integration|main|today's main|current main)\b.*$/i, '').replace(/^onto /i, '');
  s = s.replace(/\[skip ci\]/ig, '')
    .replace(/^0\d{3}( phase \d+)?:\s*/, '')
    .replace(/^(wave ?\d+ s\d+[a-z]?|quick wins \d+[a-z]?|wildlife polish \d+[a-z]?( follow-ups)?|wave3 s\d+|s\d+)\s*:\s*/i, '')
    .replace(/\s*\((?:\d{4}[^)]*|0\d{3}[^)]*)\)/g, '')   // (0013 phase 4), (0017 there, now 0028)
    .replace(/[;,]?\s*renumber.*$/i, '')
    .replace(/\s+/g, ' ').trim();
  if (s.length > 150) {
    const cut = s.slice(0, 150).search(/[;:](?=[^;:]*$)|,\s(?=[^,]*$)/);
    s = cut > 50 ? s.slice(0, cut) : s.slice(0, 150).replace(/\s+\S*$/, '');
  }
  s = s.replace(/[.;:,\s]+$/, '');
  if (!s) return '';
  return s[0].toUpperCase() + s.slice(1) + '.';
}

const re = body => new RegExp(body, 'i');
const RULES = [
  ['fixes', re(String.raw`^(fix|stop|correct|repair)|\bfix(es|ed)?\b|no longer|\bcrash|\bstranded\b|\bbug\b|\bstuck\b|\bglitch|instead of (flat|pacing)`)],
  ['performance', re(String.raw`\b(perf|performance|faster|lighter|hitch(es)?|stalls?|per frame|frame rate|fps|cheaper|far less|memory|loading|loads? )\b`)],
  ['landscapes', re(String.raw`\b(new map|map:|landscape|estate|terrain|relief|coastline)\b`)],
  ['species', re(String.raw`^(add|adds|new)\b.*\b(species|model|models|variants?|animals?|birds?|plants?)\b|\bnew (species|animals?|birds?|plants?)\b|\bjoins? the\b|\barrives?\b|\bbig four\b|\bvariants?\b|\bmodels?\b`)],
  ['tools', re(String.raw`\b(watch mode|lens|overlay|ecosystem report|menu|button|camera|zoom|phones?|screen|save|speed|selector|field guide|feedback|newsletter|tool|thumbstick|pinch|click|UI|panel|picker|picking|HUD|eye level|follow|sky|weather)\b`)],
  ['behaviours', re(String.raw`\b(hunts?|graz\w+|eat\w*|forag\w+|flocks?|herds?|drink\w*|fish\w*|soar\w*|climb\w*|migrat\w+|breed\w*|rut|fires?|burns?|succession|seed|grow\w*|water|river|pond|beavers?|salmon|carcass\w*|scaveng\w+|territor\w+|trails?|home ranges?|stalks?|pounce\w*|dive[sd]?|swim\w*|flee\w*|vigilan\w+|elk|wolves|wolf|bears?|deer|monkeys?|hawks?|owls?|vultures?|storms?|drought|plants?|trees?|animals?|birds?|wildlife)\b`)],
];
export const CATEGORIES = [
  ['species', 'New species and how they look'],
  ['landscapes', 'Landscapes'],
  ['behaviours', 'Behaviours and ecology'],
  ['tools', 'Tools and ways to watch'],
  ['fixes', 'Fixes you would notice'],
  ['performance', 'Faster and smoother'],
  ['website', 'On the website'],
  ['other', 'Other changes (prune freely)'],
];
export function categorize(subject) {
  if (/^website\b|\bfield guide\b.*\b(page|portrait|redesign)|\bpress kit\b|\bgallery\b|\bhomepage\b/i.test(subject)) return 'website';
  for (const [name, rx] of RULES) if (rx.test(subject)) return name;
  return 'other';
}

// Species and landscape names, longest first, linked once per sentence.
export function makeLinker(guide, maps) {
  const items = [
    ...guide.map(e => ({ name: e.name, url: `${SITE}/guide/${e.slug}/`, slug: e.slug })),
    ...maps.map(m => ({ name: m.name, url: `${SITE}/play/?map=${m.id}`, slug: null })),
  ].filter(i => i.name.length >= 3).sort((a, b) => b.name.length - a.name.length);
  return function link(sentence) {
    const used = [];
    for (const it of items) {
      const esc = it.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const rx = new RegExp(`(?<![\\w/\\[-])(${esc}s?)(?![\\w\\]-])`, 'i');
      const m = sentence.match(rx);
      if (!m) continue;
      // don't link inside an already inserted link
      const before = sentence.slice(0, m.index);
      if ((before.match(/\[/g) || []).length !== (before.match(/\]/g) || []).length) continue;
      sentence = before + `[${m[1]}](${it.url})` + sentence.slice(m.index + m[1].length);
      if (it.slug) used.push(it.slug);
    }
    return { text: sentence, slugs: used };
  };
}

export function collect(month, git = defaultGit) {
  const { since, until } = monthRange(month);
  const raw = git(['log', 'main', `--since=${since}`, `--until=${until}`, '--date-order', '--format=%H%x09%P%x09%s']);
  const seen = new Set();
  const out = [];
  for (const line of raw.split('\n')) {
    if (!line) continue;
    const [hash, parents, ...rest] = line.split('\t');
    const subject = rest.join('\t');
    const isMerge = parents.trim().split(' ').length > 1;
    if (shouldSkip(subject, isMerge)) continue;
    const sentence = rewrite(subject, isMerge);
    if (!sentence) continue;
    const key = sentence.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ hash: hash.slice(0, 7), sentence, category: categorize(sentence) });
  }
  return out;
}

function defaultGit(args) { return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 << 20 }); }

function pictures(month, slugs, git = defaultGit) {
  const { since, until } = monthRange(month);
  const files = dir => git(['log', 'main', `--since=${since}`, `--until=${until}`, '--diff-filter=AM', '--name-only', '--format=', '--', dir])
    .split('\n').filter(f => /\.(jpe?g|png|webp|mp4|webm)$/i.test(f) && !/-card\.|vertical|-poster/.test(f));
  const uniq = list => [...new Set(list)].filter(f => existsSync(resolve(ROOT, f)));
  const review = uniq(files('website/review-media')).slice(0, 24);
  const portraits = slugs.map(s => `website/guide-media/${s}.webp`).filter(f => existsSync(resolve(ROOT, f)));
  return { review, portraits: [...new Set(portraits)].slice(0, 12) };
}

export function render(month, items, linker, pics) {
  const { label } = monthRange(month);
  const slugs = new Set();
  const lines = [`# Second Growth update notes: ${label}`, '',
    `Draft for Cole to rewrite in Kit. Generated from git history by \`tools/monthly-notes.mjs ${month}\`; sentences are reworded from commit subjects, so trim, merge and fix freely. Nothing here is sent anywhere.`, '',
    `${items.length} items found: a good newsletter keeps the five to eight players would care about most (a new animal, a new place, something they can try).`, '',
    '## What is new in the game', ''];
  let any = false;
  for (const [key, title] of CATEGORIES) {
    const group = items.filter(i => i.category === key);
    if (!group.length) continue;
    any = true;
    lines.push(`### ${title}`, '');
    for (const i of group) {
      const { text, slugs: s } = linker(i.sentence);
      s.forEach(x => slugs.add(x));
      lines.push(`- ${text}`);
    }
    lines.push('');
  }
  if (!any) lines.push('_No player-facing changes found for this month._', '');
  lines.push('## Rewilding news', '',
    'Add two or three short stories from this month (a sentence of what happened, a link, and one line on why it matters to the game\'s ecosystems). The tool does not fetch the web.', '',
    '- Story 1: ', '  - Link: ', '  - Why it fits Second Growth: ',
    '- Story 2: ', '  - Link: ', '  - Why it fits Second Growth: ',
    '- Story 3 (optional): ', '  - Link: ', '  - Why it fits Second Growth: ', '');
  lines.push('## A line from you', '', '_A personal opening or sign-off, a sentence or two. What are you most pleased with this month?_', '');
  lines.push('## Pictures you could use', '');
  const p = pics(slugs);
  if (p.portraits.length) { lines.push('Field guide portraits for the species named above (`website/guide-media/`):', ''); p.portraits.forEach(f => lines.push(`- ${f}`)); lines.push(''); }
  if (p.review.length) { lines.push(`Stills and clips from \`website/review-media/\` added or changed in ${label}:`, ''); p.review.forEach(f => lines.push(`- ${f}`)); lines.push(''); }
  if (!p.portraits.length && !p.review.length) lines.push('_Nothing new in the media folders this month; record a new still or clip (see AGENTS.md, website section)._', '');
  return lines.join('\n');
}

async function main() {
  const args = process.argv.slice(2);
  const stdout = args.includes('--stdout');
  const month = parseMonth(args.find(a => !a.startsWith('--')));
  const { fieldGuide } = await import('./field-guide-data.mjs');
  const { BIOME_LIST } = await import('../js/biome.js');
  const linker = makeLinker(fieldGuide(), BIOME_LIST);
  const items = collect(month);
  const md = render(month, items, linker, slugs => pictures(month, [...slugs]));
  if (stdout) { process.stdout.write(md + '\n'); return; }
  const file = resolve(ROOT, 'docs/newsletter', `${month}.md`);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, md + '\n');
  console.log(`Wrote docs/newsletter/${month}.md (${items.length} items)`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) main().catch(e => { console.error(e.message); process.exit(1); });
