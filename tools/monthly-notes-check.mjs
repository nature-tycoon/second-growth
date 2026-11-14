// Headless check of tools/monthly-notes.mjs: month handling, which commits are dropped, grouping,
// rewording, species links, and the whole file from a fake git history. No git, no network.
import assert from 'node:assert/strict';
import { parseMonth, monthRange, shouldSkip, rewrite, categorize, makeLinker, collect, render } from './monthly-notes.mjs';

assert.equal(parseMonth(undefined, new Date('2026-11-13T12:00:00Z')), '2026-10');
assert.equal(parseMonth(undefined, new Date('2027-01-05T12:00:00Z')), '2026-12');
assert.equal(parseMonth('2026-11'), '2026-11');
assert.throws(() => parseMonth('2026-13'));
assert.throws(() => parseMonth('November'));
assert.deepEqual(monthRange('2026-12').until, '2027-01-01');

for (const s of ['Merge pull request #82 from nature-tycoon/claude/x', 'Merge remote-tracking branch \'origin/main\' into y',
  'Remove canopy locomotion decision [skip ci]', 'Ideas wave3: tick s4', 'Record 0013 phase 5 results', 'Add Google Tag Manager to the homepage',
  'Website: recapture Sumatra with the orangutan on its branch', 'Traits on species: model dispatch by table', 'Update browser fixtures for selector-first startup',
  'docs: tidy', 'test merge claude/x'])
  assert.ok(shouldSkip(s), `should skip: ${s}`);
for (const s of ['Bears catch salmon at the run', 'Website: the Living Field Guide, a page for every species in the game', 'Fix primate canopy stalls'])
  assert.ok(!shouldSkip(s), `should keep: ${s}`);
assert.ok(!shouldSkip('Merge the Ecosystem Report (0031) into integration', true), 'a descriptive merge subject is kept');
assert.ok(shouldSkip('Merge pull request #5 from a/b', true));
assert.equal(rewrite('Merge the Ecosystem Report (0031) into integration', true), 'The Ecosystem Report.');
assert.equal(rewrite('Wave2 s4: cats pounce [skip ci]'), 'Cats pounce.');
assert.equal(rewrite('0022: far trees draw'), 'Far trees draw.');
assert.ok(rewrite('x'.repeat(400)).length < 160);

assert.equal(categorize('Bears catch salmon at the run.'), 'behaviours');
assert.equal(categorize('Phones: one finger moves the map.'), 'tools');
assert.equal(categorize('Fix primate canopy stalls.'), 'fixes');
assert.equal(categorize('Climbing monkeys cost far less per frame.'), 'performance');
assert.equal(categorize('Website: press kit.'), 'website');
assert.equal(categorize('Something else entirely.'), 'other');

const linker = makeLinker([{ name: 'Elk', slug: 'elk' }, { name: 'Sea otter', slug: 'sea-otter' }, { name: 'Otter', slug: 'otter' }], [{ id: 'sumatra', name: 'Sumatra' }]);
let r = linker('Elk and sea otters meet in Sumatra, and the elk leaves.');
assert.equal(r.text, '[Elk](https://secondgrowth.earth/guide/elk/) and [sea otters](https://secondgrowth.earth/guide/sea-otter/) meet in [Sumatra](https://secondgrowth.earth/play/?map=sumatra), and the elk leaves.');
assert.deepEqual([...r.slugs].sort(), ['elk', 'sea-otter']);
assert.equal(linker('Nothing to link here.').text, 'Nothing to link here.');

const log = ['aaa\tp1\tBears catch salmon at the run', 'bbb\tp1\tBears catch salmon at the run!', 'ccc\tp1\tIdeas wave3: plan', 'ddd\tp1 p2\tMerge pull request #3 from a/b', 'eee\tp1\tFix elk stuck in water [skip ci]'].join('\n');
const items = collect('2026-10', () => log);
assert.equal(items.length, 1, 'duplicates and housekeeping are dropped: ' + JSON.stringify(items));
const md = render('2026-10', items, linker, () => ({ review: ['website/review-media/a.jpg'], portraits: [] }));
for (const h of ['# Second Growth update notes: October 2026', '### Behaviours and ecology', '## Rewilding news', '## Pictures you could use', 'website/review-media/a.jpg'])
  assert.ok(md.includes(h), 'missing ' + h);
assert.ok(!md.includes('Ideas wave3'));
assert.equal(render('2026-10', items, linker, () => ({ review: [], portraits: [] })), render('2026-10', items, linker, () => ({ review: [], portraits: [] })), 'deterministic');
console.log('monthly-notes-check: ok');
