// Build the loop after decoding: AAC padding and media-element restarts must not
// become part of the repeating ambience. Both the game and listening page use this.
export function seamlessLoop(ctx, clip) {
  const guard = Math.round(clip.sampleRate * 0.05);
  const end = clip.length - guard, length = end - guard;
  const overlap = Math.min(Math.round(clip.sampleRate * 2), Math.floor(length / 4));
  if (overlap < 2) return clip;
  const loop = ctx.createBuffer(clip.numberOfChannels, length - overlap, clip.sampleRate);
  for (let ch = 0; ch < clip.numberOfChannels; ch++) {
    const input = clip.getChannelData(ch), output = loop.getChannelData(ch);
    const body = length - overlap * 2;
    output.set(input.subarray(guard + overlap, end - overlap));
    for (let i = 0; i < overlap; i++) {
      const angle = i / (overlap - 1) * Math.PI / 2;
      // Equal-power fades preserve the level of unrelated water/wind/noise samples.
      output[body + i] = input[end - overlap + i] * Math.cos(angle) + input[guard + i] * Math.sin(angle);
    }
  }
  return loop;
}
