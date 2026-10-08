// Render-only light balance. Clear days have a stronger key; overcast light is more diffuse.
export function lightingBalance(weather, sun, underwater = false) {
  if (underwater) return { key: 1, fill: 1, cool: 0, haze: 0 };
  const overcast = weather === 'rain' || weather === 'snow' || weather === 'cloud';
  const key = weather === 'rain' ? .78 : weather === 'snow' ? .84 : weather === 'cloud' ? .9 : 1.08;
  // Preserve the readable moonlight; reduce the flat ambient wash most in full daylight.
  const fill = overcast ? 1.08 : 1 - .16 * sun;
  return { key, fill, cool: overcast ? .08 : .16 * sun, haze: overcast ? .16 : .095 };
}
