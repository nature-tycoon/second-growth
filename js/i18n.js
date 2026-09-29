// Language. The game is written in English; a map can offer another language (the Chinandega map
// offers Spanish, for students in Nicaragua). The choice is made in the map picker and takes effect
// when the page loads into that map.
//
// How the translation reaches the screen:
//   - A map's own content (its plants, animals, goals, chapters and story) is translated at the
//     data level by the language pack (js/lang/), replacing the English fields when the map loads.
//   - Everything else on screen is translated as it's drawn: tr() for a string, and a watcher that
//     translates text nodes and tooltips as the interface puts them up. Whole strings are looked up
//     in the dictionary, and sentences with numbers or names in them are matched by patterns.
// Anything not in the pack stays in English rather than breaking.

const KEY = 'second-growth-lang';
export const LANG_MAPS = { chinandega: ['en', 'es'] }; // maps that offer a choice of language
export let lang = 'en';

export const storedLang = () => { try { return localStorage.getItem(KEY) || 'en'; } catch { return 'en'; } };
export function saveLang(l) { try { localStorage.setItem(KEY, l); } catch { /* ignore */ } }
// the language to play a map in: the saved choice, if that map offers it
export const langFor = map => (LANG_MAPS[map]?.includes(storedLang()) ? storedLang() : 'en');
export function initLang(map) {
  lang = langFor(map);
  document.documentElement.lang = lang;
  if (lang !== 'en') watch();
}
// Show one part of the page in a language of its own (the map picker, the moment someone taps
// Español, before the page reloads into it). Everything added inside it later follows along.
export function langWithin(el, l) {
  el.dataset.lang = l; el.lang = l;
  watch();
  translateNode(el, l);
}

const WORDS = new Map(), PATTERNS = [];
// dict: { 'English string': 'Traducción' }; patterns: [[/regex/, 'replacement' | fn]]
export function addStrings(dict) { for (const [k, v] of Object.entries(dict)) WORDS.set(k, v); }
export function addPatterns(list) { for (const [k, v] of list) { if (typeof k === 'string') WORDS.set(k, v); else PATTERNS.push([k, v]); } }

// Translate one string (whole-string lookup, then patterns). Leading/trailing space is kept.
let active = null; // the language of the string being translated, for the patterns that translate parts of it
export function tr(s, l = active || lang) {
  if (l === 'en' || s == null || typeof s !== 'string') return s;
  const m = /^(\s*)([\s\S]*?)(\s*)$/.exec(s), core = m[2];
  if (!core || !/[A-Za-z]/.test(core)) return s;
  const hit = WORDS.get(core);
  if (hit != null) return m[1] + hit + m[3];
  // a pattern that goes wrong leaves the English in place rather than stopping the game
  const prev = active; active = l;
  try {
    for (const [re, to] of PATTERNS) {
      re.lastIndex = 0;
      if (re.test(core)) { re.lastIndex = 0; return m[1] + core.replace(re, to) + m[3]; }
    }
  } catch (e) { console.warn('translation failed', core, e); } finally { active = prev; }
  return s;
}

// ------------------------------------------------------------------ translating the page
const ATTRS = ['title', 'placeholder', 'aria-label', 'alt'];
const SKIP = new Set(['SCRIPT', 'STYLE', 'TEXTAREA', 'CODE']);
// the language for a node: its own part of the page's, or the page's
const langOf = n => { const e = n.nodeType === 1 ? n : n.parentNode; return e?.closest?.('[data-lang]')?.dataset.lang || lang; };
function translateNode(n, l = langOf(n)) {
  if (n.nodeType === 3) {
    if (l === 'en' || (n.parentNode && SKIP.has(n.parentNode.nodeName))) return;
    const t = tr(n.nodeValue, l);
    if (t !== n.nodeValue) n.nodeValue = t;
    return;
  }
  if (n.nodeType !== 1 || SKIP.has(n.nodeName)) return;
  if (n.dataset?.lang) l = n.dataset.lang;
  if (l !== 'en') {
    for (const a of ATTRS) if (n.hasAttribute(a)) { const v = n.getAttribute(a), t = tr(v, l); if (t !== v) n.setAttribute(a, t); }
    if (n.nodeName === 'INPUT' && (n.type === 'button' || n.type === 'submit')) { const t = tr(n.value, l); if (t !== n.value) n.value = t; }
  }
  for (let c = n.firstChild; c; c = c.nextSibling) translateNode(c, l);
}
export function translatePage(root = document.body) { if (root) translateNode(root); }
let observer = null;
function watch() {
  if (observer) return;
  const start = () => {
    translatePage(document.body);
    if (lang !== 'en') document.title = tr(document.title);
    observer = new MutationObserver(list => {
      for (const m of list) {
        if (m.type === 'characterData') translateNode(m.target);
        else if (m.type === 'attributes') translateNode(m.target);
        else for (const n of m.addedNodes) translateNode(n);
      }
    });
    observer.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRS });
  };
  if (document.body) start(); else document.addEventListener('DOMContentLoaded', start);
}

// For the coverage check: every piece of visible English text still on the page.
export function untranslated(root = document.body) {
  const out = new Set();
  const walk = n => {
    if (n.nodeType === 3) { const s = n.nodeValue.trim(); if (s && /[A-Za-z]{2}/.test(s) && tr(s) === s && !(n.parentNode && SKIP.has(n.parentNode.nodeName))) out.add(s); return; }
    if (n.nodeType !== 1 || SKIP.has(n.nodeName)) return;
    for (const a of ATTRS) if (n.hasAttribute(a)) { const v = n.getAttribute(a).trim(); if (v && /[A-Za-z]{2}/.test(v) && tr(v) === v) out.add('@' + v); }
    for (let c = n.firstChild; c; c = c.nextSibling) walk(c);
  };
  walk(root);
  return [...out];
}
