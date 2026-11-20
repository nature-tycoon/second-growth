#!/usr/bin/env node
// Token use by agent session, read from Claude Code's local transcripts.
//
//   node tools/agent-usage.mjs [--days=30] [--top=25] [--json] [--dir=<projects dir>]
//
// Reads every ~/.claude/projects/*Second-Growth*/**/*.jsonl (main sessions,
// worktree sessions and their subagents), counts each API call once, and
// reports per session: model, calls, tokens by kind, a cost weight, screenshots
// and the biggest tool-result sources. "Weight" is tokens priced relative to one
// fresh input token (cache read 0.1, cache write 1.25, output 5) times the
// model's price relative to Sonnet, so sessions on different models compare.
// Nothing leaves the machine; prompts are cut to 70 characters.

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const args = Object.fromEntries(process.argv.slice(2).map(a => {
  const [k, v] = a.replace(/^--/, '').split('=');
  return [k, v ?? true];
}));
const DAYS = Number(args.days ?? 30);
const TOP = Number(args.top ?? 25);
const ROOT = args.dir ?? path.join(os.homedir(), '.claude', 'projects');
const since = Date.now() - DAYS * 864e5;

// Price per token relative to Sonnet input, by model family.
const MODEL_PRICE = { fable: 5, opus: 5 / 3, sonnet: 1, haiku: 1 / 3 };
const family = m => Object.keys(MODEL_PRICE).find(f => (m || '').includes(f)) || 'other';

function* jsonlFiles(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) yield* jsonlFiles(p);
    else if (e.name.endsWith('.jsonl')) yield p;
  }
}

const projects = fs.readdirSync(ROOT).filter(d => d.includes('Second-Growth'));
const sessions = new Map();

for (const proj of projects) {
  for (const file of jsonlFiles(path.join(ROOT, proj))) {
    if (fs.statSync(file).mtimeMs < since) continue;
    const isSub = file.includes(`${path.sep}subagents${path.sep}`);
    // A subagent's file sits under <session id>/subagents/; charge it to that session.
    const sid = isSub ? file.split(path.sep).slice(-3)[0] : path.basename(file, '.jsonl');
    const s = sessions.get(sid) ?? {
      id: sid, worktree: proj.split('--claude-worktrees-')[1] || '', prompt: '', title: '',
      first: Infinity, calls: 0, input: 0, cacheWrite: 0, cacheRead: 0, output: 0, weight: 0,
      models: {}, tools: {}, screenshots: 0, imageResults: 0, resultChars: {}, subCalls: 0, subWeight: 0,
      maxContext: 0,
    };
    sessions.set(sid, s);
    const seen = new Set();
    const toolName = new Map();
    for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
      if (!line) continue;
      let r; try { r = JSON.parse(line); } catch { continue; }
      const t = Date.parse(r.timestamp);
      if (t < since) continue;
      if (t < s.first) s.first = t;
      if (r.type === 'custom-title' || r.customTitle) s.title = r.customTitle || s.title;
      if (!isSub && r.type === 'user' && !s.prompt && typeof r.message?.content === 'string')
        s.prompt = r.message.content.replace(/\s+/g, ' ').slice(0, 70);
      const m = r.message;
      if (r.type === 'assistant' && m?.usage) {
        const key = r.requestId || m.id;
        for (const c of m.content || []) if (c.type === 'tool_use') {
          toolName.set(c.id, c.name);
          const short = c.name.replace(/^mcp__[^_]+(?:_[^_]+)*?__/, '');
          s.tools[short] = (s.tools[short] || 0) + 1;
          const act = c.input?.action;
          if (act === 'screenshot' || act === 'zoom') s.screenshots++;
        }
        if (seen.has(key)) continue;
        seen.add(key);
        const u = m.usage, fam = family(m.model);
        const w = ((u.input_tokens || 0) + 1.25 * (u.cache_creation_input_tokens || 0)
          + 0.1 * (u.cache_read_input_tokens || 0) + 5 * (u.output_tokens || 0)) * (MODEL_PRICE[fam] ?? 1);
        s.calls++; s.input += u.input_tokens || 0; s.cacheWrite += u.cache_creation_input_tokens || 0;
        s.cacheRead += u.cache_read_input_tokens || 0; s.output += u.output_tokens || 0; s.weight += w;
        s.maxContext = Math.max(s.maxContext, (u.input_tokens || 0) + (u.cache_creation_input_tokens || 0) + (u.cache_read_input_tokens || 0));
        s.models[fam] = (s.models[fam] || 0) + w;
        if (isSub) { s.subCalls++; s.subWeight += w; }
      }
      if (r.type === 'user' && Array.isArray(m?.content)) {
        for (const c of m.content) if (c.type === 'tool_result') {
          const name = (toolName.get(c.tool_use_id) || '?').replace(/^mcp__[^_]+(?:_[^_]+)*?__/, '');
          const parts = Array.isArray(c.content) ? c.content : [{ type: 'text', text: String(c.content ?? '') }];
          for (const p of parts) {
            if (p.type === 'image') s.imageResults++;
            const n = p.type === 'text' ? (p.text || '').length : 0;
            s.resultChars[name] = (s.resultChars[name] || 0) + n;
          }
        }
      }
    }
  }
}

const list = [...sessions.values()].filter(s => s.calls > 0).sort((a, b) => b.weight - a.weight);
if (args.json) { console.log(JSON.stringify(list, null, 1)); process.exit(0); }

const k = n => n >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : n >= 1e3 ? (n / 1e3).toFixed(0) + 'k' : String(Math.round(n));
const total = list.reduce((a, s) => {
  for (const f of ['calls', 'input', 'cacheWrite', 'cacheRead', 'output', 'weight', 'screenshots', 'imageResults', 'subWeight']) a[f] += s[f];
  for (const [m, w] of Object.entries(s.models)) a.models[m] = (a.models[m] || 0) + w;
  for (const [t, n] of Object.entries(s.tools)) a.tools[t] = (a.tools[t] || 0) + n;
  for (const [t, n] of Object.entries(s.resultChars)) a.resultChars[t] = (a.resultChars[t] || 0) + n;
  return a;
}, { calls: 0, input: 0, cacheWrite: 0, cacheRead: 0, output: 0, weight: 0, screenshots: 0, imageResults: 0, subWeight: 0, models: {}, tools: {}, resultChars: {} });

console.log(`Last ${DAYS} days: ${list.length} sessions, ${k(total.calls)} API calls, weight ${k(total.weight)}`);
console.log(`  tokens: input ${k(total.input)}, cache write ${k(total.cacheWrite)}, cache read ${k(total.cacheRead)}, output ${k(total.output)}`);
console.log(`  by model (share of weight): ${Object.entries(total.models).sort((a, b) => b[1] - a[1]).map(([m, w]) => `${m} ${(100 * w / total.weight).toFixed(0)}%`).join(', ')}`);
console.log(`  subagents: ${(100 * total.subWeight / total.weight).toFixed(0)}% of weight; screenshots/zooms ${total.screenshots}, image results ${total.imageResults}`);
console.log(`  top tools by calls: ${Object.entries(total.tools).sort((a, b) => b[1] - a[1]).slice(0, 12).map(([t, n]) => `${t} ${n}`).join(', ')}`);
console.log(`  top tool-result text (chars, ~4 per token): ${Object.entries(total.resultChars).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([t, n]) => `${t} ${k(n)}`).join(', ')}`);
const third = Math.ceil(list.length / 3);
const topShare = list.slice(0, third).reduce((a, s) => a + s.weight, 0) / total.weight;
console.log(`  the costliest third of sessions use ${(100 * topShare).toFixed(0)}% of the weight\n`);
console.log('weight  share calls maxCtx  shots sub%  model   date        session');
for (const s of list.slice(0, TOP)) {
  const main = Object.entries(s.models).sort((a, b) => b[1] - a[1])[0]?.[0] ?? '';
  const name = s.title || s.prompt || s.id.slice(0, 8);
  console.log(`${k(s.weight).padStart(6)} ${(100 * s.weight / total.weight).toFixed(1).padStart(5)}% ${String(s.calls).padStart(5)} ${k(s.maxContext).padStart(6)} ${String(s.screenshots).padStart(6)} ${(100 * s.subWeight / s.weight).toFixed(0).padStart(4)}  ${main.padEnd(7)} ${new Date(s.first).toISOString().slice(0, 10)}  ${(s.worktree ? `[${s.worktree}] ` : '') + name}`);
}
