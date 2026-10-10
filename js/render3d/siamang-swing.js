// Two overlapping catches: the receiving hand reaches the branch before the
// supporting hand releases it. Keep the CPU body anchor and shader in agreement.
const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
export function siamangSwing(phase, gait, eat = 0) {
  const cycle = ((phase / (2 * Math.PI)) % 1 + 1) % 1;
  const travel = smooth(.05, .3, gait) * (1 - smooth(0, .1, eat));
  const left = smooth(.08, .22, cycle) * (1 - smooth(.72, .86, cycle)) * travel;
  const right = smooth(.30, .44, cycle) * (1 - smooth(.55, .69, cycle)) * travel;
  const support = smooth(.23, .30, cycle) * (1 - smooth(.69, .72, cycle)) * travel;
  const r = [.14 + (.53 - .14) * right, 1.38 + (1.045 - 1.38) * right, .02 + (.1 - .02) * right];
  const l = [.6 + (.14 - .6) * left, 1.045 + (1.38 - 1.045) * left, -.1 + (-.02 + .1) * left];
  return { left, right, support, grip: r.map((v, i) => v + (l[i] - v) * support), sway: Math.sin(phase) * .12 * gait * (1 - eat) };
}
export const SIAMANG_SWING_GLSL = `
  vec3 siamangWeights(float ph, float gait, float eat) {
    float cycle = fract(ph / 6.28318530718);
    float travel = smoothstep(.05, .3, gait) * (1.0 - smoothstep(0.0, .1, eat));
    return vec3(
      smoothstep(.08, .22, cycle) * (1.0 - smoothstep(.72, .86, cycle)),
      smoothstep(.30, .44, cycle) * (1.0 - smoothstep(.55, .69, cycle)),
      smoothstep(.23, .30, cycle) * (1.0 - smoothstep(.69, .72, cycle))) * travel;
  }
  vec3 siamangHold(vec3 weights) {
    vec3 right = mix(vec3(.14, 1.38, .02), vec3(.53, 1.045, .1), weights.y);
    vec3 left = mix(vec3(.6, 1.045, -.1), vec3(.14, 1.38, -.02), weights.x);
    return mix(right, left, weights.z);
  }
`;
