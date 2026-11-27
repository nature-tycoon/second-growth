// INP by interaction (js/interaction-latency.js): labels name only the game's own controls, never
// text on the page or keys typed; one interaction's events count once, at their slowest; INP skips
// one per 50; slow ones are reported at most maxSlow times.
import assert from 'node:assert/strict';
import { labelFor, createInteractionLatency } from '../js/interaction-latency.js';

// a tiny stand-in for DOM elements: tag, id, dataset, parent
const node = (tagName, { id = '', dataset = {}, parent = null, type, cls = '' } = {}) => {
  const n = { nodeType: 1, tagName, id, dataset, parentElement: parent, type, cls };
  n.closest = sel => {
    for (let x = n; x; x = x.parentElement) {
      if (sel === '[id]' && x.id) return x;
      if (sel === '.modal' && x.cls === 'modal') return x;
    }
    return null;
  };
  return n;
};
const press = target => ({ type: 'pointerdown', target, timeStamp: 100 });
const typed = (target, key) => ({ type: 'keydown', target, key, timeStamp: 100 });

const bar = node('NAV', { id: 'toolbar' });
assert.equal(labelFor(press(node('BUTTON', { dataset: { cat: 'plant' }, parent: bar }))), 'toolbar:cat=plant');
assert.equal(labelFor(press(node('SPAN', { parent: node('BUTTON', { id: 'btn-goals' }) }))), 'btn-goals');
assert.equal(labelFor(press(node('CANVAS')), () => 'plant'), 'map:plant');
const modal = node('DIV', { cls: 'modal' });
assert.equal(labelFor(press(node('P', { parent: modal }))), 'modal', 'a modal\'s text is never a label');
assert.equal(labelFor(press(node('BUTTON', { dataset: { a: 'lapse' }, parent: node('DIV', { id: 'modal-root' }) }))), 'modal-root:a=lapse');
// data values and ids are cut to word characters, so markup can't smuggle text in
assert.equal(labelFor(press(node('BUTTON', { dataset: { tab: 'Hello there, friend!' } }))), 'tab=Hellotherefriend');
// keys: game keys by name, anything else "other", and nothing typed in a text box
assert.equal(labelFor(typed(node('BODY'), ' ')), 'key:space');
assert.equal(labelFor(typed(node('BODY'), 'Escape')), 'key:escape');
assert.equal(labelFor(typed(node('BODY'), 'x')), 'key:other');
assert.equal(labelFor(typed(node('TEXTAREA'), 'q')), 'key:text');
assert.equal(labelFor(typed(node('INPUT', { type: 'email' }), 'a')), 'key:text');

// one interaction (pointerdown, pointerup, click) counts once, at its slowest event
const slow = [];
const L = createInteractionLatency({ onSlow: r => slow.push(r), slowMs: 300, maxSlow: 2 });
const ev = (id, start, dur, name = 'click') => ({ interactionId: id, startTime: start, duration: dur, processingStart: start + 10, processingEnd: start + 30, name });
L.note({ type: 'pointerdown', timeStamp: 1000 }, 'btn-goals');
L.note({ type: 'click', timeStamp: 1050 }, 'btn-goals');
L.entry(ev(1, 1000, 120, 'pointerdown'));
L.entry(ev(1, 1050, 320));
assert.equal(slow.length, 1); assert.equal(slow[0].label, 'btn-goals'); assert.equal(slow[0].ms, 320);
assert.equal(slow[0].delay, 10); assert.equal(slow[0].processing, 20); assert.equal(slow[0].presentation, 290);
L.entry({ ...ev(0, 2000, 900), interactionId: 0 }); // (not an interaction: hover moves)
let s = L.sample();
assert.equal(s.inp_ms, 320); assert.equal(s.interactions, 1); assert.equal(s.slowest_interaction, 'btn-goals');
assert.equal(L.sample().slowest_interaction, undefined, 'the slowest resets each sample');
// INP ignores one in 50: with 100 presses, the third slowest
for (let i = 0; i < 99; i++) L.note({ type: 'pointerdown', timeStamp: 5000 + i * 100 }, 'map:plant');
for (let i = 0; i < 5; i++) L.entry(ev(10 + i, 5000 + i * 100, 400 + i * 100));
s = L.sample();
assert.equal(s.interactions, 100);
assert.equal(s.inp_ms, 600, 'INP skips the worst two of 100');
assert.equal(slow.length, 2, 'slow interactions are capped per session');
assert.ok(Object.values(s).every(v => typeof v !== 'string' || /^[\w:=-]+$/.test(v)), 'labels are markup names only');
console.log('interaction-latency-check passed');
