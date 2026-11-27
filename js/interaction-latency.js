// Interaction to Next Paint, named by what was touched. PostHog's own $web_vitals gives one INP per
// page and nothing about which click it was; this keeps the same measure (the browser's Event
// Timing: from the input to the next paint) per interaction and says which control or tool it was.
//
// Labels come only from the game's own markup (an element id, or a data-a/-cat/-v/-b/-speed/-tab
// attribute) or the game's tool category, never from text on the page or keys typed: a key in a
// text box is just "key:text". (analytics-privacy-check covers this.)
//
// Split as web.dev does: input delay (the input waited for the frame in progress), processing (our
// handlers) and presentation (from the handlers to the paint: the next frame's work).

const DATA = ['a', 'cat', 'tool', 'key', 'v', 'b', 'speed', 'tab', 'm', 'map', 'seg', 'guide'];
const GAME_KEYS = new Set([' ', 'escape', 'tab', 'enter', '0', '1', '2', '3', '[', ']', 't', 'q', 'e', 'h', 'g', 'm', 'p', 'c', 'z',
  'w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', '-', '=', '+']);
const clean = s => String(s).replace(/[^\w-]/g, '').slice(0, 40);

// What an input touched, as a short label: "btn-goals", "toolbar:plant", "map:plant", "key:space".
export function labelFor(e, mapCategory = () => null) {
  const t = e.target;
  if (e.type === 'keydown' || e.type === 'keyup') {
    const tag = t?.tagName;
    if (tag === 'TEXTAREA' || (tag === 'INPUT' && !['checkbox', 'radio', 'range', 'button'].includes(t.type)) || t?.isContentEditable) return 'key:text';
    const k = String(e.key || '').toLowerCase();
    return GAME_KEYS.has(k) ? 'key:' + (k === ' ' ? 'space' : k) : 'key:other';
  }
  if (!t || !t.closest) return 'page';
  if (t.tagName === 'CANVAS') return 'map:' + clean(mapCategory() || 'none');
  for (let n = t, depth = 0; n && n.nodeType === 1 && depth < 8; n = n.parentElement, depth++) {
    for (const d of DATA) if (n.dataset?.[d] != null) {
      const box = n.closest('[id]');
      return (box ? clean(box.id) + ':' : '') + d + '=' + clean(n.dataset[d]);
    }
    if (n.id) return clean(n.id);
  }
  return t.closest('.modal') ? 'modal' : clean(t.tagName.toLowerCase());
}

export function createInteractionLatency({ onSlow = null, slowMs = 300, maxSlow = 6 } = {}) {
  const labels = new Map(); // event timeStamp -> label (an Event Timing entry's startTime is its event's timeStamp)
  const worst = new Map();  // interactionId -> { ms, label, ... } for this window
  const all = [];           // every interaction's latency this session (capped), for INP
  let sent = 0, windowMax = null, count = 0; // (count: every press and key, fast or slow; entries come only for slow ones)
  const S = {
    // call from a capture-phase listener on the inputs, before any handler changes the page
    note(e, label) { if (e.type === 'pointerdown' || e.type === 'keydown') count++; labels.set(Math.round(e.timeStamp), label); if (labels.size > 64) labels.delete(labels.keys().next().value); },
    entry(en) {
      if (!en.interactionId) return;
      const label = labels.get(Math.round(en.startTime)) ?? labels.get(Math.round(en.startTime) - 1) ?? labels.get(Math.round(en.startTime) + 1) ?? 'unknown';
      const ms = Math.round(en.duration);
      const cur = worst.get(en.interactionId);
      const rec = { ms, label, type: en.name, delay: Math.round(en.processingStart - en.startTime),
        processing: Math.round(en.processingEnd - en.processingStart), presentation: Math.max(0, Math.round(en.startTime + en.duration - en.processingEnd)) };
      if (cur && cur.ms >= ms) return;
      if (!cur) { if (all.length < 2000) all.push(rec); } else Object.assign(cur, rec);
      worst.set(en.interactionId, cur ?? rec);
      if (worst.size > 200) worst.delete(worst.keys().next().value);
      const r = cur ?? rec;
      if (!windowMax || r.ms > windowMax.ms) windowMax = r;
      if (onSlow && r.ms >= slowMs && !r.sent && sent < maxSlow) { r.sent = true; sent++; onSlow(r); }
    },
    // INP as the browser defines it: the worst interaction, ignoring one per 50
    inp() {
      if (!all.length) return null;
      const s = all.map(r => r.ms).sort((a, b) => b - a), skip = Math.floor(Math.max(count, all.length) / 50);
      return skip < s.length ? s[skip] : null; // (null: under the 40 ms the browser reports from)
    },
    // the fields perf_sample carries: INP so far, how many interactions, and the slowest since the last sample
    sample() {
      const w = windowMax; windowMax = null;
      return { inp_ms: S.inp(), interactions: Math.max(count, all.length),
        ...(w && { slowest_interaction_ms: w.ms, slowest_interaction: w.label, slowest_interaction_delay_ms: w.delay,
          slowest_interaction_processing_ms: w.processing, slowest_interaction_presentation_ms: w.presentation }) };
    },
  };
  return S;
}

// Wire it to the page: label inputs as they arrive, read the browser's Event Timing entries.
export function watchInteractions(options, mapCategory) {
  const S = createInteractionLatency(options);
  if (typeof PerformanceObserver === 'undefined' || !PerformanceObserver.supportedEntryTypes?.includes('event')) return S;
  for (const type of ['pointerdown', 'pointerup', 'click', 'keydown', 'keyup']) {
    window.addEventListener(type, e => S.note(e, labelFor(e, mapCategory)), { capture: true, passive: true });
  }
  try { new PerformanceObserver(list => { for (const en of list.getEntries()) S.entry(en); }).observe({ type: 'event', durationThreshold: 40 }); } catch (e) { /* older browsers */ }
  return S;
}
