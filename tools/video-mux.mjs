// Minimal MP4 (H.264) and WebM (VP9) writers for the website's video loops
// (tools/capture-site-video.mjs). WebCodecs in headless Chrome encodes the frames;
// these only wrap the encoded chunks in a file a browser plays. One video track,
// constant frame rate, no B-frames, no audio. Runs in the page and in Node.
//
// chunk: { data: Uint8Array, timestamp: microseconds, key: boolean }, in decode order.

const concat = parts => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0; for (const p of parts) { out.set(p, at); at += p.length; }
  return out;
};
const u8 = (...bytes) => Uint8Array.from(bytes);
const u16 = v => u8(v >>> 8 & 255, v & 255);
const u32 = v => u8(v >>> 24 & 255, v >>> 16 & 255, v >>> 8 & 255, v & 255);
const ascii = s => Uint8Array.from(s, c => c.charCodeAt(0));

function checkChunks(chunks, fps) {
  if (!chunks.length || !chunks[0].key) throw new Error('A video must start on a keyframe');
  const step = 1e6 / fps;
  chunks.forEach((c, i) => {
    if (Math.abs(c.timestamp - i * step) > 1) throw new Error(`Frame ${i} is out of order or off the ${fps} fps grid (B-frames are not supported)`);
  });
}

// ------------------------------------------------------------------ MP4
const box = (type, ...parts) => { const body = concat(parts); return concat([u32(body.length + 8), ascii(type), body]); };
const fullBox = (type, version, flags, ...parts) => box(type, u8(version, flags >>> 16 & 255, flags >>> 8 & 255, flags & 255), ...parts);
const MATRIX = concat([0x10000, 0, 0, 0, 0x10000, 0, 0, 0, 0x40000000].map(u32));

// description: the avcC record (VideoEncoder's decoderConfig.description with avc.format 'avc')
export function muxMp4({ width, height, fps, description, chunks }) {
  checkChunks(chunks, fps);
  const timescale = fps * 1000, delta = 1000, n = chunks.length;
  const durationMs = Math.round(n * 1000 / fps);
  const moov = mdatOffset => box('moov',
    fullBox('mvhd', 0, 0, u32(0), u32(0), u32(1000), u32(durationMs), u32(0x10000), u16(0x100), new Uint8Array(10), MATRIX, new Uint8Array(24), u32(2)),
    box('trak',
      fullBox('tkhd', 0, 3, u32(0), u32(0), u32(1), u32(0), u32(durationMs), new Uint8Array(8), u16(0), u16(0), u16(0), u16(0), MATRIX, u32(width << 16), u32(height << 16)),
      box('mdia',
        fullBox('mdhd', 0, 0, u32(0), u32(0), u32(timescale), u32(n * delta), u16(0x55c4), u16(0)),
        fullBox('hdlr', 0, 0, u32(0), ascii('vide'), new Uint8Array(12), ascii('VideoHandler\0')),
        box('minf',
          fullBox('vmhd', 0, 1, new Uint8Array(8)),
          box('dinf', fullBox('dref', 0, 0, u32(1), fullBox('url ', 0, 1))),
          box('stbl',
            fullBox('stsd', 0, 0, u32(1), box('avc1',
              new Uint8Array(6), u16(1), new Uint8Array(16), u16(width), u16(height),
              u32(0x480000), u32(0x480000), u32(0), u16(1), new Uint8Array(32), u16(0x18), u16(0xffff),
              box('avcC', description))),
            fullBox('stts', 0, 0, u32(1), u32(n), u32(delta)),
            fullBox('stss', 0, 0, u32(chunks.filter(c => c.key).length), ...chunks.flatMap((c, i) => c.key ? [u32(i + 1)] : [])),
            fullBox('stsc', 0, 0, u32(1), u32(1), u32(n), u32(1)),
            fullBox('stsz', 0, 0, u32(0), u32(n), ...chunks.map(c => u32(c.data.length))),
            fullBox('stco', 0, 0, u32(1), u32(mdatOffset)))))));
  // moov goes before mdat (fast start: a browser can play before the whole file arrives)
  const ftyp = box('ftyp', ascii('isom'), u32(0x200), ascii('isomiso2avc1mp41'));
  const offset = ftyp.length + moov(0).length + 8;
  return concat([ftyp, moov(offset), u32(chunks.reduce((s, c) => s + c.data.length, 0) + 8), ascii('mdat'), ...chunks.map(c => c.data)]);
}

// ------------------------------------------------------------------ WebM
function vint(n) { // an EBML data size
  for (let len = 1; len <= 8; len++) if (n < 2 ** (7 * len) - 1) {
    const out = new Uint8Array(len);
    for (let i = len - 1, v = n; i >= 0; i--, v = Math.floor(v / 256)) out[i] = v & 255;
    out[0] |= 1 << (8 - len); return out;
  }
  throw new Error('EBML size too large');
}
const idBytes = id => { const b = []; for (let v = id; v > 0; v = Math.floor(v / 256)) b.unshift(v & 255); return Uint8Array.from(b); };
const el = (id, ...parts) => { const body = concat(parts); return concat([idBytes(id), vint(body.length), body]); };
const uint = (id, v, width = 0) => {
  const b = []; for (let x = v; x > 0 || !b.length; x = Math.floor(x / 256)) b.unshift(x & 255);
  while (b.length < width) b.unshift(0);
  return el(id, Uint8Array.from(b));
};
const float = (id, v) => { const b = new Uint8Array(8); new DataView(b.buffer).setFloat64(0, v); return el(id, b); };
const str = (id, s) => el(id, ascii(s));

export function muxWebm({ width, height, fps, codec = 'V_VP9', chunks }) {
  checkChunks(chunks, fps);
  const frameMs = 1000 / fps;
  const info = el(0x1549A966, uint(0x2AD7B1, 1e6), str(0x4D80, 'second-growth video-mux'), str(0x5741, 'second-growth video-mux'), float(0x4489, chunks.length * frameMs));
  const tracks = el(0x1654AE6B, el(0xAE, uint(0xD7, 1), uint(0x73C5, 1), uint(0x83, 1), uint(0x9C, 0), str(0x86, codec),
    uint(0x23E383, Math.round(1e9 / fps)), el(0xE0, uint(0xB0, width), uint(0xBA, height))));
  // a cluster per keyframe, each with its own cue, so a page can seek (scrub) as well as loop
  const clusters = [], cues = [];
  for (let i = 0; i < chunks.length;) {
    const start = Math.round(i * frameMs), blocks = [];
    do {
      const c = chunks[i], rel = Math.round(i * frameMs) - start;
      if (rel > 32767) throw new Error('Keyframes too far apart for one WebM cluster');
      blocks.push(el(0xA3, u8(0x81), u16(rel & 0xffff), u8(c.key ? 0x80 : 0), c.data));
      i++;
    } while (i < chunks.length && !chunks[i].key);
    clusters.push({ start, bytes: el(0x1F43B675, uint(0xE7, start), ...blocks) });
  }
  // The seek head points at Info, Tracks and the Cues (after the clusters); positions are
  // fixed-width so its size doesn't depend on them.
  const seek = (id, pos) => el(0x4DBB, el(0x53AB, idBytes(id)), uint(0x53AC, pos, 8));
  const seekHead = positions => el(0x114D9B74, seek(0x1549A966, positions[0]), seek(0x1654AE6B, positions[1]), seek(0x1C53BB6B, positions[2]));
  const headLength = seekHead([0, 0, 0]).length;
  let at = headLength + info.length + tracks.length;
  for (const c of clusters) { cues.push(el(0xBB, uint(0xB3, c.start), el(0xB7, uint(0xF7, 1), uint(0xF1, at)))); at += c.bytes.length; }
  const body = concat([seekHead([headLength, headLength + info.length, at]), info, tracks, ...clusters.map(c => c.bytes), el(0x1C53BB6B, ...cues)]);
  const header = el(0x1A45DFA3, uint(0x4286, 1), uint(0x42F7, 1), uint(0x42F2, 4), uint(0x42F3, 8), str(0x4282, 'webm'), uint(0x4287, 4), uint(0x4285, 2));
  return concat([header, idBytes(0x18538067), vint(body.length), body]);
}
