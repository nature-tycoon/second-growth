#!/usr/bin/env python3
"""Rebuild verified clips: python3 tools/prepare-field-audio.py --ffmpeg /path/to/ffmpeg --cache /tmp/field-raw [--download] [--id lion]."""
import argparse
import array
import hashlib
import json
from pathlib import Path
import re
import subprocess
import sys
import urllib.request
import wave

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--ffmpeg', default='ffmpeg')
parser.add_argument('--cache', type=Path, required=True)
parser.add_argument('--download', action='store_true', help='Download only the verified URLs listed in the source manifest.')
parser.add_argument('--id', action='append', help='Rebuild only these recording IDs.')
args = parser.parse_args()
root = Path(__file__).resolve().parent.parent
manifest_path = root / 'assets/sounds/field-sources.json'
sources = json.loads(manifest_path.read_text())
args.cache.mkdir(parents=True, exist_ok=True)

def encode(command):
    subprocess.run([args.ffmpeg, '-v', 'error', '-y', *command], check=True)

for recording_id, source in sources.items():
    if args.id and recording_id not in args.id:
        continue
    xc = re.search(r'XC(\d+)', source['title'])
    download = 'https://xeno-canto.org/' + xc[1] + '/download' if xc else source['url']
    original = args.cache / (recording_id + Path(source['url']).suffix)
    if not original.exists():
        if not args.download:
            raise SystemExit(f'Missing source: {original}. Use --download to fetch the credited original.')
        request = urllib.request.Request(download, headers={'User-Agent': 'SecondGrowthAudioBot/1.0 (https://github.com/nature-tycoon/second-growth) Python-urllib'})
        with urllib.request.urlopen(request, timeout=60) as response:
            original.write_bytes(response.read())
    if hashlib.sha256(original.read_bytes()).hexdigest() != source['sha256']:
        raise SystemExit(f'{recording_id}: source changed; inspect it and its license before rebuilding.')
    loop_input = None
    if source.get('loopCrossfade'):
        decoded = args.cache / (recording_id + '-decoded-loop.wav')
        encode(['-i', str(original), '-t', '24', '-vn', '-ac', '1', '-ar', '32000', '-c:a', 'pcm_s16le', str(decoded)])
        with wave.open(str(decoded)) as wav:
            rate = wav.getframerate()
            samples = array.array('h', wav.readframes(wav.getnframes()))
        if sys.byteorder != 'little':
            samples.byteswap()
        overlap = round(source['loopCrossfade'] * rate)
        tail = array.array('h', (round(samples[-overlap + i] * (1 - i / (overlap - 1)) + samples[i] * i / (overlap - 1)) for i in range(overlap)))
        joined = samples[overlap:-overlap] + tail
        if sys.byteorder != 'little':
            joined.byteswap()
        loop_input = args.cache / (recording_id + '-joined.wav')
        with wave.open(str(loop_input), 'wb') as wav:
            wav.setparams((1, 2, rate, 0, 'NONE', 'not compressed'))
            wav.writeframes(joined.tobytes())
    for clip in source['clips']:
        output = root / 'assets/sounds' / (clip['name'] + '.m4a')
        filters = 'highpass=f=50,loudnorm=I=-17:TP=-3:LRA=9' if loop_input else f"highpass=f=60,loudnorm=I=-23:TP=-3:LRA=9,afade=t=in:d=0.04,afade=t=out:st={max(0, clip['duration'] - 0.08)}:d=0.08"
        command = ['-i', str(loop_input)] if loop_input else ['-ss', str(clip['offset']), '-i', str(original), '-t', str(clip['duration'])]
        encode([*command, '-af', filters, '-vn', '-ac', '1', '-ar', '32000', '-c:a', 'aac', '-b:a', '80k', '-movflags', '+faststart', str(output)])
        clip['bytes'] = output.stat().st_size
    print(recording_id)
manifest_path.write_text(json.dumps(sources, indent=2, ensure_ascii=False) + '\n')
