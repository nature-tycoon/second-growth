// Rebuild field-recording clips without ffmpeg (tools/prepare-field-audio.py needs it): Chrome decodes
// the original (Ogg, MP3, ...) and trims, high-passes, levels and fades it, the same recipe as the
// Python tool (60 Hz high-pass; about -23 dB loudness over the loud frames, peaks under -3 dBFS;
// 40 ms fade in, 80 ms out; 32 kHz mono), then macOS's afconvert encodes 80 kbps AAC (.m4a).
// Offsets, durations and the source's hash come from assets/sounds/field-sources.json; the original
// must already be in the cache as <id><its url's extension> (download it only with Cole's OK, decision
// 0002). Writes assets/sounds/<clip>.m4a and each clip's bytes back to field-sources.json.
//
//   node tools/prepare-field-audio-chrome.mjs --cache <dir> --id raven [--id hooves ...]
import { readFile, writeFile, stat, mkdtemp } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { extname, join } from 'node:path';
import { openBrowser, projectRoot } from './browser-session.mjs';

const argv = process.argv.slice(2), opt = k => argv.flatMap((a, i) => a === '--' + k ? [argv[i + 1]] : []);
const [cache] = opt('cache'), ids = opt('id');
if (!cache || !ids.length) throw Error('usage: --cache <dir> --id <recording> [--id ...]');
const manifest = join(projectRoot, 'assets/sounds/field-sources.json'), sources = JSON.parse(await readFile(manifest, 'utf8'));
const work = await mkdtemp(join(tmpdir(), 'field-audio-'));
const b = await openBrowser({ label: 'field-audio', root: cache, width: 320, height: 200 });
try {
  await b.navigate('/__check-blank');
  for (const id of ids) {
    const s = sources[id]; if (!s) throw Error('No source ' + id);
    const file = id + extname(new URL(s.url).pathname);
    if (createHash('sha256').update(await readFile(join(cache, file))).digest('hex') !== s.sha256) throw Error(`${id}: source changed; inspect it and its license before rebuilding`);
    for (const clip of s.clips) {
      const b64 = await b.evaluate(`(async()=>{
        const R=32000,src=await new OfflineAudioContext(1,R,R).decodeAudioData(await (await fetch(${JSON.stringify('/' + file)})).arrayBuffer());
        const ctx=new OfflineAudioContext(1,Math.round(R*${clip.duration}),R),n0=ctx.createBufferSource();n0.buffer=src;
        const hp=ctx.createBiquadFilter();hp.type='highpass';hp.frequency.value=${s.highpass ?? 60};n0.connect(hp);hp.connect(ctx.destination);n0.start(0,${clip.offset},${clip.duration});
        const d=(await ctx.startRendering()).getChannelData(0);
        const n=3200,fr=[];for(let i=0;i+n<=d.length;i+=n){let e=0;for(let j=i;j<i+n;j++)e+=d[j]*d[j];fr.push(e/n)}
        const top=Math.max(...fr),gated=fr.filter(e=>e>top/100),rms=Math.sqrt(gated.reduce((a,b)=>a+b,0)/gated.length);
        let g=Math.pow(10,-23/20)/rms,peak=0;for(const v of d)peak=Math.max(peak,Math.abs(v));g=Math.min(g,Math.pow(10,-3/20)/peak);
        const fin=Math.round(.04*R),fout=Math.round(.08*R),pcm=new Int16Array(d.length);
        for(let i=0;i<d.length;i++){const f=Math.min(1,i/fin,(d.length-1-i)/fout);pcm[i]=Math.max(-32767,Math.min(32767,Math.round(d[i]*g*f*32767)))}
        const bytes=new Uint8Array(pcm.buffer);let t='';for(let i=0;i<bytes.length;i+=32768)t+=String.fromCharCode(...bytes.subarray(i,i+32768));return btoa(t);})()`);
      const pcm = Buffer.from(b64, 'base64'), h = Buffer.alloc(44);
      h.write('RIFF', 0); h.writeUInt32LE(36 + pcm.length, 4); h.write('WAVEfmt ', 8); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22);
      h.writeUInt32LE(32000, 24); h.writeUInt32LE(64000, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34); h.write('data', 36); h.writeUInt32LE(pcm.length, 40);
      const wav = join(work, clip.name + '.wav'), out = join(projectRoot, 'assets/sounds', clip.name + '.m4a');
      await writeFile(wav, Buffer.concat([h, pcm]));
      execFileSync('afconvert', ['-f', 'm4af', '-d', 'aac', '-b', '80000', '-c', '1', wav, out]);
      clip.bytes = (await stat(out)).size;
      console.log(`${clip.name}: ${clip.bytes} bytes`);
    }
  }
} finally { await b.close(); }
await writeFile(manifest, JSON.stringify(sources, null, 2) + '\n');
