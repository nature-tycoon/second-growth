// Render-only light balance. Clear days have a stronger key; overcast light is more diffuse.
// high: how high the sun stands, 0 (low: dawn, golden hour, night) to 1 (midday)
export function lightingBalance(weather, high, underwater = false) {
  if (underwater) return { key: 1, fill: 1, cool: 0, trim: 0, haze: 0 };
  const overcast = weather === 'rain' || weather === 'snow' || weather === 'cloud';
  const key = weather === 'rain' ? .78 : weather === 'snow' ? .84 : weather === 'cloud' ? .9 : 1.08;
  // Trim the flat ambient wash and cool the shade only under a high sun, for midday contrast;
  // golden hour and moonlight keep their full, warm fill.
  const h = high * high;
  const fill = overcast ? 1.08 : 1 - .16 * h;
  return { key, fill, cool: overcast ? .08 : .16 * h, trim: overcast ? 0 : .12 * h, haze: overcast ? .16 : .095 };
}
