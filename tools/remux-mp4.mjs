// Re-wraps MP4s written by tools/video-mux.mjs (muxMp4) without re-encoding: reads the samples back
// out and writes them again with the current muxMp4. Made when muxMp4 began interleaving sound with
// video (a second of each in turn), so the intro films already made could stream without re-filming
// (docs/ideas/2026-11-21-first-minutes/film-playback.md). Every sample is checked byte for byte
// against the original; the intro film's record (assets/intro/intro-film.json) gets the new sizes
// and hashes.
//
//   node tools/remux-mp4.mjs <file.mp4> [...]
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { muxMp4 } from './video-mux.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const be32 = (d, p) => ((d[p] << 24) >>> 0) + (d[p + 1] << 16) + (d[p + 2] << 8) + d[p + 3];
const be16 = (d, p) => (d[p] << 8) + d[p + 1];
function* boxes(d, start, end) {
  for (let p = start; p < end;) {
    const size = be32(d, p), type = String.fromCharCode(...d.subarray(p + 4, p + 8));
    yield { type, body: p + 8, end: p + size }; p += size;
  }
}
const child = (d, parent, path) => {
  let at = parent;
  for (const t of path) { at = [...boxes(d, at.body, at.end)].find(b => b.type === t); if (!at) return null; }
  return at;
};

// The samples of one track, in decode order, from its stsc/stco/stsz.
function samples(d, stbl) {
  const stsz = child(d, stbl, ['stsz']), stco = child(d, stbl, ['stco']), stsc = child(d, stbl, ['stsc']);
  const count = be32(d, stsz.body + 8), sizes = Array.from({ length: count }, (_, i) => be32(d, stsz.body + 12 + 4 * i));
  const offsets = Array.from({ length: be32(d, stco.body + 4) }, (_, i) => be32(d, stco.body + 8 + 4 * i));
  const runs = Array.from({ length: be32(d, stsc.body + 4) }, (_, i) => [be32(d, stsc.body + 8 + 12 * i), be32(d, stsc.body + 12 + 12 * i)]);
  const out = []; let k = 0;
  offsets.forEach((off, c) => {
    const per = runs.filter(([first]) => first <= c + 1).pop()[1];
    for (let j = 0; j < per && k < count; j++) { out.push(d.subarray(off, off + sizes[k])); off += sizes[k++]; }
  });
  if (out.length !== count) throw new Error('Sample count mismatch');
  return out;
}

export function readMp4(d) {
  const moov = [...boxes(d, 0, d.length)].find(b => b.type === 'moov');
  const traks = [...boxes(d, moov.body, moov.end)].filter(b => b.type === 'trak');
  const kind = t => String.fromCharCode(...d.subarray(child(d, t, ['mdia', 'hdlr']).body + 8, child(d, t, ['mdia', 'hdlr']).body + 12));
  const vt = traks.find(t => kind(t) === 'vide'), at = traks.find(t => kind(t) === 'soun');
  const vstbl = child(d, vt, ['mdia', 'minf', 'stbl']);
  const avc1 = child(d, vstbl, ['stsd']); const entry = [...boxes(d, avc1.body + 8, avc1.end)][0];
  const width = be16(d, entry.body + 24), height = be16(d, entry.body + 26);
  const avcC = [...boxes(d, entry.body + 78, entry.end)].find(b => b.type === 'avcC');
  const fps = be32(d, child(d, vt, ['mdia', 'mdhd']).body + 12) / 1000;
  const stss = child(d, vstbl, ['stss']);
  const keys = new Set(Array.from({ length: be32(d, stss.body + 4) }, (_, i) => be32(d, stss.body + 8 + 4 * i) - 1));
  const chunks = samples(d, vstbl).map((data, i) => ({ data: Uint8Array.from(data), timestamp: Math.round(i * 1e6 / fps), key: keys.has(i) }));
  let audio = null;
  if (at) {
    const astbl = child(d, at, ['mdia', 'minf', 'stbl']);
    const stsd = child(d, astbl, ['stsd']); const mp4a = [...boxes(d, stsd.body + 8, stsd.end)][0];
    const channels = be16(d, mp4a.body + 16), sampleRate = be32(d, mp4a.body + 24) >>> 16;
    const esds = [...boxes(d, mp4a.body + 28, mp4a.end)].find(b => b.type === 'esds');
    // esds: version/flags, then ES (3: id, flags), DecoderConfig (4: type, stream, buffer, max, avg bitrate), DecoderSpecificInfo (5)
    let p = esds.body + 4; if (d[p] !== 3) throw new Error('esds'); p += 2 + 3;
    if (d[p] !== 4) throw new Error('esds 4'); const bitrate = be32(d, p + 2 + 9); p += 2 + 13;
    if (d[p] !== 5) throw new Error('esds 5'); const description = Uint8Array.from(d.subarray(p + 2, p + 2 + d[p + 1]));
    const frame = be32(d, child(d, astbl, ['stts']).body + 12);
    audio = { sampleRate, channels, description, frame, bitrate, chunks: samples(d, astbl).map((data, k) => ({ data: Uint8Array.from(data), timestamp: Math.round(k * frame * 1e6 / sampleRate) })) };
  }
  return { width, height, fps, description: Uint8Array.from(d.subarray(avcC.body, avcC.end)), chunks, audio };
}

const same = (a, b) => a.length === b.length && a.every((x, i) => Buffer.compare(Buffer.from(x.data), Buffer.from(b[i].data)) === 0);
const recordPath = root + 'assets/intro/intro-film.json';
const record = JSON.parse(await readFile(recordPath, 'utf8'));
for (const file of process.argv.slice(2)) {
  const before = new Uint8Array(await readFile(file));
  const parts = readMp4(before);
  const after = muxMp4(parts);
  const back = readMp4(after);
  if (!same(parts.chunks, back.chunks) || (parts.audio && !same(parts.audio.chunks, back.audio.chunks))) throw new Error(`${file}: samples changed in the re-wrap`);
  await writeFile(file, after);
  const sha256 = createHash('sha256').update(after).digest('hex');
  const rel = file.startsWith(root) ? file.slice(root.length) : file.replace(/^\.\//, '');
  for (const out of record.outputs) for (const f of out.files) if (f.file === rel) Object.assign(f, { bytes: after.length, sha256 });
  console.log(`${rel}: ${before.length} -> ${after.length} bytes, ${parts.chunks.length} frames, ${parts.audio?.chunks.length ?? 0} sound packets, re-wrapped`);
}
await writeFile(recordPath, JSON.stringify(record, null, 2) + '\n');
