#!/usr/bin/env node
// Counts code that names a species instead of asking a trait (refactor audit fix 4):
//   comparisons  `=== 'elk'`, `!== 'deer'`, `'elk' ===` against a species key or sprite kind
//   lists        lines that branch on 3 or more distinct species keys or sprite kinds
//                (a `new Set([...])`, `[...].includes(`, or `case 'a': case 'b':` line)
// outside the species data (js/data/animals-*.js, js/data/bird-passage.js). Tables keyed by
// species (start wildlife, sounds, reference apexes) are data, not branches, and aren't counted;
// nor are comparisons of a field that only shares a species' spelling (`a.state === 'fish'`,
// `s.antlers === 'elk'`, `mode === 'fish'`).
// A ratchet: fails when either count rises above tools/species-name-count.json.
//   node tools/species-name-count.mjs            check against the stored numbers
//   node tools/species-name-count.mjs --list     print every counted line
//   node tools/species-name-count.mjs --update   store today's numbers (only after they fell)

import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createAnimals } from '../js/data/animals.js';
import { PASSAGE_SPECIES } from '../js/data/bird-passage.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const baselinePath = join(root, 'tools/species-name-count.json');
const args = new Set(process.argv.slice(2));

const names = new Set();
for (const f of readdirSync(join(root, 'js/data')).filter(f => /^animals-.+\.js$/.test(f))) {
  const build = (await import(join(root, 'js/data', f))).default;
  for (const a of createAnimals(build, f.slice(8, -3)).animals) { names.add(a.key); names.add(a.sprite.kind); }
}
for (const a of Object.values(PASSAGE_SPECIES)) { names.add(a.key); names.add(a.sprite.kind); }

const isData = rel => /^js\/data\/animals(-.+)?\.js$/.test(rel) || rel === 'js/data/bird-passage.js';
const files = [];
(function walk(dir) {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) walk(p);
    else if (f.endsWith('.js')) files.push(p);
  }
})(join(root, 'js'));

const quoted = /'([a-z][a-zA-Z0-9]*)'/g;
const compare = /(?:([\w$]+)\)?\s*[!=]==\s*'([a-z][a-zA-Z0-9]*)')|(?:'([a-z][a-zA-Z0-9]*)'\s*[!=]==)/g;
const notSpecies = new Set(['state', 'mode', 'phase', 'food', 'antlers', 'lizard', 'batType', 'host']);
const branch = /new Set\(\[|\]\.includes\(|case '[a-z]/;
const count = { comparisons: 0, lists: 0 }, perFile = {}, lines = [];
for (const p of files) {
  const rel = relative(root, p);
  if (isData(rel)) continue;
  readFileSync(p, 'utf8').split('\n').forEach((line, i) => {
    const code = line.replace(/\/\/.*$/, '');
    let cmp = 0;
    for (const m of code.matchAll(compare)) if (names.has(m[2] || m[3]) && !notSpecies.has(m[1])) cmp++;
    const listed = new Set([...code.matchAll(quoted)].map(m => m[1]).filter(n => names.has(n)));
    const list = listed.size >= 3 && branch.test(code) ? 1 : 0;
    if (!cmp && !list) return;
    count.comparisons += cmp; count.lists += list;
    const f = perFile[rel] ||= { comparisons: 0, lists: 0 };
    f.comparisons += cmp; f.lists += list;
    lines.push(`${rel}:${i + 1}  ${line.trim().slice(0, 140)}`);
  });
}

if (args.has('--list')) console.log(lines.join('\n'));
const top = Object.entries(perFile).sort((a, b) => b[1].comparisons + b[1].lists - a[1].comparisons - a[1].lists).slice(0, 12);
console.log(`species-name-count: ${count.comparisons} comparisons, ${count.lists} lines listing 3+ species`);
for (const [f, c] of top) console.log(`  ${String(c.comparisons).padStart(3)} ${String(c.lists).padStart(3)}  ${f}`);

if (args.has('--update')) {
  writeFileSync(baselinePath, JSON.stringify(count, null, 2) + '\n');
  console.log(`stored ${relative(root, baselinePath)}`);
} else {
  const base = JSON.parse(readFileSync(baselinePath, 'utf8'));
  const rose = Object.keys(count).filter(k => count[k] > base[k]);
  if (rose.length) {
    console.error(`FAIL: ${rose.map(k => `${k} ${base[k]} -> ${count[k]}`).join(', ')}. Ask a trait on the species definition, not a species name (AGENTS.md).`);
    process.exit(1);
  }
  const fell = Object.keys(count).filter(k => count[k] < base[k]);
  console.log(fell.length ? `ok, below the stored ${base.comparisons}/${base.lists}: run with --update to lock it in` : 'ok');
}
