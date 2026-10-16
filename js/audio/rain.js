import { seamlessLoop } from './loop.js';

// A steady rain hiss, with no distinctive splashes or periodic volume modulation.
// Generate a minute locally so a short field excerpt cannot develop a rhythm.
export function makeRainBuffer(ctx) {
  const noise = ctx.createBuffer(1, Math.round(ctx.sampleRate * 62.1), ctx.sampleRate);
  const data = noise.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * 0.5;
  return seamlessLoop(ctx, noise);
}

// The game fills noise in bounded chunks, yielding to input and rendering between
// them. The synchronous helper above remains available for offline audio reviews.
export async function prepareRainBuffer(ctx) {
  await new Promise(resolve => setTimeout(resolve, 0));
  const noise = ctx.createBuffer(1, Math.round(ctx.sampleRate * 62.1), ctx.sampleRate);
  const data = noise.getChannelData(0), chunk = 16384;
  for (let start = 0; start < data.length; start += chunk) {
    await new Promise(resolve => setTimeout(resolve, 0));
    const end = Math.min(start + chunk, data.length);
    for (let i = start; i < end; i++) data[i] = (Math.random() * 2 - 1) * 0.5;
  }
  return seamlessLoop(ctx, noise);
}

export function createRainSource(ctx, buffer, destination) {
  const source = ctx.createBufferSource(), filter = ctx.createBiquadFilter();
  source.buffer = buffer; source.loop = true;
  filter.type = 'lowpass'; filter.frequency.value = 2800; filter.Q.value = 0.7;
  source.connect(filter).connect(destination);
  source.onended = () => { source.disconnect(); filter.disconnect(); };
  return source;
}
