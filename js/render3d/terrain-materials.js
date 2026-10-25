// Ground texture blending, water animation and water-quality lighting.
import * as THREE from 'three';
import { snow, SNOW_RGB } from './snow.js';
import { hash2 } from '../rng.js';
import { ATLAS_LAYOUT } from './terrain-atlas.js';
import { TRAIL_THRESHOLD, TRAIL_FULL } from '../data/animal-trails.js';

// Soft, tileable noise used to vary the ground's color across the valley. Red is what everything
// reads; green is a second, unrelated field of the same size and blue a field four times finer, so
// the close-up soil gets three patterns from one lookup.
export function noiseTexture() {
  const N = 128, c = document.createElement('canvas');
  c.width = c.height = N;
  const ctx = c.getContext('2d'), img = ctx.createImageData(N, N);
  const field = (G, seed) => {
    const grid = [];
    for (let k = 0; k < G * G; k++) grid.push(hash2(k % G, Math.floor(k / G), seed));
    const at = (x, y) => grid[((y + G) % G) * G + ((x + G) % G)];
    return (x, y) => {
      const fx = x / N * G, fy = y / N * G, x0 = Math.floor(fx), y0 = Math.floor(fy);
      let tx = fx - x0, ty = fy - y0; tx = tx * tx * (3 - 2 * tx); ty = ty * ty * (3 - 2 * ty);
      const a = at(x0, y0), b = at(x0 + 1, y0), cc = at(x0, y0 + 1), d = at(x0 + 1, y0 + 1);
      return (a + (b - a) * tx) * (1 - ty) + (cc + (d - cc) * tx) * ty;
    };
  };
  const fields = [field(8, 77), field(8, 78), field(32, 79)];
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const o = (y * N + x) * 4;
    for (let ch = 0; ch < 3; ch++) img.data[o + ch] = Math.round(fields[ch](x, y) * 255);
    img.data[o + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

// Bare earth up close, painted per pixel like the animals' coats (0018): small rounded clods, the
// odd pebble and fine grit, raised a little in the light. Each layer fades to its average tone once
// it's finer than a pixel, so the usual view (where a tile's texture already shows every pixel)
// never pays for it and nothing shimmers. p: world position; fp: the pixel's width in world units;
// mud: bigger, flatter clods and fewer stones; wet: rain softening it (flatter clods, no pale specks,
// but the same size: resizing them as the rain comes and goes slid the whole pattern across the
// ground); stony: mostly stones (gravel); sand: grit only.
// h is the height of the surface there, for the bump in the lighting.
const SOIL_GLSL = `
// three hashes of a cell at once (no sine: cheap on any graphics chip)
vec3 soilHash(vec2 p) {
  vec3 q = fract(vec3(p.xyx) * vec3(0.1031, 0.103, 0.0973));
  q += dot(q, q.yxz + 33.33);
  return fract((q.xxy + q.yzz) * q.zyx);
}
// 1 while features of this size span a few pixels, 0 once they shrink below one
float soilDetail(float fp, float size) { return 1.0 - smoothstep(0.2, 0.5, fp / size); }
vec3 bareEarth(vec3 col, vec2 p, float fp, float mud, float wet, float stony, float sand, out float h) {
  float soft = max(mud, wet);
  // crumbs: small rounded clods, each its own shade, darker down between them
  float size = mix(0.04, 0.065, mud), detail = soilDetail(fp, size);
  vec3 c = col;
  h = 0.0;
  // (the Fast setting keeps just the grit below: no clods, stones or bump)
  #ifndef GROUND_FAST
  if (detail > 0.0) { // (only near enough to see them)
    // (pushed around by noise, so their edges wander instead of tiling like paving)
    vec2 warp = texture2D(uNoise, p * 2.1 + 0.4).rg - 0.5;
    // (each cell's point stays near its middle, so the four nearest cells are enough)
    vec2 q = p / size + warp * 0.9, i = floor(q - 0.5);
    float d1 = 9.0, d2 = 9.0, id = 0.0;
    for (int a = 0; a <= 1; a++) for (int b = 0; b <= 1; b++) {
      vec2 k = i + vec2(float(a), float(b));
      vec3 hk = soilHash(k);
      float d = length(k + 0.25 + hk.xy * 0.5 - q);
      if (d < d1) { d2 = d1; d1 = d; id = hk.z; } else if (d < d2) d2 = d;
    }
    float aa = fp / size * 0.7 + 1e-4;
    float lump = smoothstep(0.0, 0.7, d2 - d1) * (1.0 - sand);
    c *= (1.0 + (fract(id * 3.1) - 0.5) * 0.18 * (1.0 - sand)) * (0.93 + 0.11 * lump + 0.07 * sand);
    h = lump * size * (0.04 + 0.05 * fract(id * 5.3)) * (1.0 - 0.6 * soft);
    // one clod in many is a pebble (most of them, on gravel; none in sand): a rounded stone, greyer
    // and paler than the soil, darker round its rim
    float pebOn = step(mix(0.95 + mud * 0.03, 0.3, stony) + sand, id), r = 0.2 + 0.12 * fract(id * 13.7) + 0.12 * stony;
    float peb = pebOn * (1.0 - smoothstep(r - aa, r + aa, d1));
    float dome = max(0.0, 1.0 - d1 * d1 / (r * r));
    float lum = dot(col, vec3(0.3, 0.59, 0.11));
    vec3 stone = mix(col, vec3(lum), 0.35 + 0.3 * fract(id * 2.9)) * (1.2 + 0.4 * fract(id * 7.3)) * (0.7 + 0.35 * sqrt(dome));
    c = mix(c, stone, peb);
    h += peb * size * 0.1 * dome;
    h *= detail;
    c = mix(col, c, detail);
  }
  #endif
  // fine grit: crumbs and pale specks of sand far smaller than the clods
  vec3 grit = texture2D(uNoise, p * 7.5 + 0.31).rgb;
  float g1 = grit.r, g2 = grit.b;
  c *= 1.0 + (g1 - 0.5) * 0.22 * soilDetail(fp, 0.014);
  c = mix(c, col * 1.4, smoothstep(0.72 - sand * 0.12, 0.8, g2) * 0.45 * soilDetail(fp, 0.006) * (1.0 - soft));
  h += (g1 - 0.5) * 0.0012 * soilDetail(fp, 0.014);
  return c;
}
`;

// Break up the tile grid: modulate the ground by large, soft world-space noise.
// The ground texture isn't chosen per tile: each pixel looks up the tile at a position pushed
// around by noise, so the edge between grass and hardpan, or soil and mud, wanders in soft
// organic curves instead of following the grid (roads, trails and fields keep straighter edges).
// Two differently warped picks are averaged, which feathers the seam.
export function groundDetail(mat, noise, tiles, layout = ATLAS_LAYOUT) {
  const { CELL, GUT, SLOT, COLS, ATLAS_W, ATLAS_H } = layout;
  mat.onBeforeCompile = shader => {
    shader.uniforms.uNoise = { value: noise };
    shader.uniforms.uSnow = snow.uSnow;
    shader.uniforms.uTrailDensity = tiles.density;
    shader.uniforms.uTrailVisible = tiles.trailVisible;
    shader.uniforms.uTrailSoil = tiles.soil;
    shader.uniforms.uTiles = tiles.tex;
    shader.uniforms.uTint = tiles.tint;
    shader.uniforms.uTileOrigin = tiles.origin;
    shader.uniforms.uTileSize = tiles.size;
    shader.uniforms.uWet = tiles.wet;
    shader.uniforms.uHRange = tiles.hRange;
    shader.vertexShader = 'attribute vec2 aShore;\nvarying vec2 vShore;\nattribute float aSnow;\nvarying float vSnowAff;\nvarying vec2 vWorldXZ;\nvarying float vWorldY;\nvarying float vSlopeY;\n' + shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n  vShore = aShore;\n  vWorldXZ = (modelMatrix * vec4(transformed, 1.0)).xz;\n  vWorldY = (modelMatrix * vec4(transformed, 1.0)).y;\n  vSlopeY = objectNormal.y;\n  vSnowAff = aSnow;');
    shader.fragmentShader = `uniform sampler2D uNoise;
uniform float uSnow;
uniform float uWet;
uniform sampler2D uTiles;
uniform sampler2D uTint;
uniform sampler2D uTrailDensity;
uniform float uTrailVisible;
uniform vec3 uTrailSoil;
uniform vec2 uTileOrigin;
uniform vec2 uTileSize;
varying float vSnowAff;
varying vec2 vWorldXZ;
varying float vWorldY;
varying float vSlopeY;
uniform vec2 uHRange;
varying vec2 vShore;
vec4 tileAt(vec2 p) {
  ivec2 c = ivec2(clamp(floor(p) - uTileOrigin, vec2(0.0), uTileSize - 1.0));
  return texelFetch(uTiles, c, 0);
}
// Actual continuous foot traffic, sampled across tile boundaries. No tile-center
// arms or reconstructed right-angle junctions are drawn.
float gameTrail(vec2 p) {
  // fine noise nibbles at the edges, so a worn track frays into the grass instead of having a smooth rim
  float raw = texture2D(uTrailDensity, (p - uTileOrigin) / uTileSize).r - (texture2D(uNoise, p * 2.3 + 0.61).r - 0.5) * 0.05;
  float use = clamp((raw - ${TRAIL_THRESHOLD}) / (${TRAIL_FULL - TRAIL_THRESHOLD}), 0.0, 1.0); // (in proportion: only the beaten middle draws)
  return use * step(0.5, tileAt(p).a) * uTrailVisible;
}
// Smoothly blended where neighbouring tiles are alike (no patchwork inside a meadow), but the
// tile's own colour right where it changes sharply, so colour and texture always agree at an edge.
vec3 tintAt(vec2 p) {
  vec3 s = texture2D(uTint, (p - uTileOrigin) / uTileSize).rgb;
  vec3 n = texelFetch(uTint, ivec2(clamp(floor(p) - uTileOrigin, vec2(0.0), uTileSize - 1.0)), 0).rgb;
  vec3 c = mix(s, n, smoothstep(0.03, 0.1, length(s - n)));
  return c * c * 1.5; // stored as sqrt(v / 1.5)
}
// how much bare earth a tile shows (the low bits of its green channel), and whether it's mud
float tileBare(vec4 t) { return mod(floor(t.g * 255.0 + 0.5), 32.0) / 31.0; }
float tileMud(vec4 t) { return step(32.0, mod(floor(t.g * 255.0 + 0.5), 64.0)); }
// what kind of bare ground a soft-edged tile is (its blue channel): stones, or sand
float tileStony(vec4 t) { return 1.0 - step(25.0, abs(t.b * 255.0 - 200.0)); }
float tileSand(vec4 t) { return 1.0 - step(25.0, abs(t.b * 255.0 - 150.0)); }
${SOIL_GLSL}
// a tile texture's average colour: a coarse mip read at the cell's middle, clear of its neighbours
vec3 tileMean(sampler2D atlas, vec4 t) {
  float slot = floor(t.r * 255.0 + 0.5);
  vec2 px = vec2(mod(slot, ${COLS}.0), floor(slot / ${COLS}.0)) * ${SLOT}.0 + ${GUT + CELL / 2}.0;
  return textureLod(atlas, vec2(px.x / ${ATLAS_W}.0, 1.0 - px.y / ${ATLAS_H}.0), 4.0).rgb;
}
vec4 tileTex(sampler2D atlas, vec4 t, vec2 p, vec2 gx, vec2 gy) {
  float slot = floor(t.r * 255.0 + 0.5), rot = floor(floor(t.g * 255.0 + 0.5) / 64.0);
  vec2 f = fract(p);
  if (rot > 2.5) f = vec2(f.y, 1.0 - f.x); else if (rot > 1.5) f = 1.0 - f; else if (rot > 0.5) f = vec2(1.0 - f.y, f.x);
  vec2 cell = vec2(mod(slot, ${COLS}.0), floor(slot / ${COLS}.0));
  vec2 px = cell * ${SLOT}.0 + ${GUT}.0 + 0.5 + f * ${CELL - 1}.0;
  vec2 k = vec2(${CELL - 1}.0 / ${ATLAS_W}.0, -${CELL - 1}.0 / ${ATLAS_H}.0);
  return textureGrad(atlas, vec2(px.x / ${ATLAS_W}.0, 1.0 - px.y / ${ATLAS_H}.0), gx * k, gy * k);
}
` + shader.fragmentShader.replace('#include <map_fragment>', `
      vec2 gp = vWorldXZ, gdx = dFdx(gp), gdy = dFdy(gp);
      vec2 wv;
      // the ground close enough that a tile's texture (64 texels a tile) is stretched over more pixels
      // than it has (eye level, or zoomed right in); farther off the texture itself is sharp enough
      float soilFp = max(length(gdx), length(gdy));
      float soilNear = 1.0 - smoothstep(0.006, 0.016, soilFp);
      float soilBare = 0.0, soilMud = 0.0, soilStony = 0.0, soilSand = 0.0, soilH = 0.0;
      float wk = 1.0; // how far colour wanders across tile edges (barely, on roads and trails)
      #ifdef USE_MAP
        wv = vec2(texture2D(uNoise, gp * 0.17).r, texture2D(uNoise, gp * 0.17 + vec2(0.43, 0.71)).r) - 0.5;
        wv += (vec2(texture2D(uNoise, gp * 0.47 + 0.2).r, texture2D(uNoise, gp * 0.47 + vec2(0.8, 0.3)).r) - 0.5) * 0.38;
        vec4 own = tileAt(gp);
        vec4 ta = tileAt(gp + wv * 1.25), tb = tileAt(gp + wv.yx * vec2(-0.9, 0.9) + 0.12);
        // crisp surfaces (roads, trails, plowed fields) keep near-straight edges
        if (own.b < 0.5 || ta.b < 0.5 || tb.b < 0.5) { ta = tileAt(gp + wv * 0.14); tb = tileAt(gp + wv.yx * 0.1); wk = 0.11; }
        #ifdef GROUND_FAST
          vec4 sampledDiffuseColor = tileTex(map, ta, gp, gdx, gdy); // one pick: crisper seams, half the work
        #else
          vec4 sampledDiffuseColor = tb == ta ? tileTex(map, ta, gp, gdx, gdy) : (tileTex(map, ta, gp, gdx, gdy) + tileTex(map, tb, gp, gdx, gdy)) * 0.5;
        #endif
        #ifdef GROUND_FAST
          soilBare = tileBare(ta); soilMud = tileMud(ta); soilStony = tileStony(ta); soilSand = tileSand(ta);
        #else
          soilBare = (tileBare(ta) + tileBare(tb)) * 0.5; soilMud = (tileMud(ta) + tileMud(tb)) * 0.5;
          soilStony = (tileStony(ta) + tileStony(tb)) * 0.5; soilSand = (tileSand(ta) + tileSand(tb)) * 0.5;
        #endif
        // up close, bare ground trades its texture, stretched into blurry blades and blobs, for its
        // average colour, which the painted clods and stones below take over;
        // plowed furrows (crisp tiles) are real shapes and stay
        float soilFlat = soilBare * soilNear * step(0.5, own.b);
        if (soilFlat > 0.004) sampledDiffuseColor.rgb = mix(sampledDiffuseColor.rgb, tileMean(map, ta), soilFlat);
        diffuseColor *= sampledDiffuseColor;
      #endif
      // the tile's colour (what grows there, the season), read smoothly at the same wandering
      // position, so colour follows the organic edges too instead of the tile grid
      {
        #ifdef GROUND_FAST
          diffuseColor.rgb *= tintAt(gp + wv * 1.25 * wk);
        #else
          diffuseColor.rgb *= (tintAt(gp + wv * 1.25 * wk) + tintAt(gp + (wv.yx * vec2(-0.9, 0.9) + 0.12) * wk)) * 0.5;
        #endif
      }
      float gn1 = texture2D(uNoise, vWorldXZ * 0.035).r;
      float gn2 = texture2D(uNoise, vWorldXZ * 0.16 + 0.37).r;
      diffuseColor.rgb *= 0.84 + 0.24 * gn1 + 0.12 * (gn2 - 0.5);
      float traffic = gameTrail(gp);
      if (traffic > 0.0) {
        float grit = texture2D(uNoise, gp * 7.0).r;
        diffuseColor.rgb = mix(diffuseColor.rgb, uTrailSoil * (0.88 + grit * 0.24), traffic * 0.92);
      }
      // bare earth (and worn trails) up close; after rain it softens toward mud
      float soilK = max(soilBare, traffic * 0.8) * soilNear;
      if (soilK > 0.004) {
        diffuseColor.rgb = mix(diffuseColor.rgb, bareEarth(diffuseColor.rgb, gp, soilFp, soilMud, uWet * 0.4, soilStony, soilSand, soilH), soilK);
        soilH *= soilK;
      }
      // A broken waterline fringe: dark damp silt, pale gravel pockets, then grass.
      // Heights interpolate on the same triangles as the water, so the fringe hugs its contours.
      if (vShore.y > 0.01) {
        float rise = vWorldY - vShore.x / max(vShore.y, 0.001);
        float fringe = smoothstep(-0.16, -0.06, rise)
          * (1.0 - smoothstep(0.025, 0.2 + gn2 * 0.12, rise + (gn2 - 0.5) * 0.055))
          * smoothstep(0.05, 0.6, vShore.y);
        float bars = texture2D(uNoise, gp * 0.36 + 0.63).r;
        float grit = texture2D(uNoise, gp * 5.5).r;
        // in patches along the bank, not an unbroken ring: grass runs down to the water in between
        float reach = texture2D(uNoise, gp * 0.11 + 0.21).r;
        fringe *= smoothstep(0.3, 0.62, reach) * (1.0 - 0.45 * smoothstep(0.0, 0.12, rise));
        float gravel = smoothstep(0.43, 0.72, bars) * smoothstep(-0.02, 0.07, rise);
        vec3 mud = vec3(0.25, 0.205, 0.145) * (0.85 + grit * 0.25);
        vec3 stones = vec3(0.4, 0.375, 0.32) * (0.82 + grit * 0.35);
        diffuseColor.rgb = mix(diffuseColor.rgb, mix(mud, stones, gravel), fringe * 0.62);
      }
      // the lie of the land: steep slopes a little darker, hollows cooler, rises warmer
      diffuseColor.rgb *= 1.0 - 0.16 * smoothstep(0.06, 0.45, 1.0 - vSlopeY);
      diffuseColor.rgb *= mix(vec3(0.93, 0.955, 0.99), vec3(1.035, 1.02, 0.965), clamp((vWorldY - uHRange.x) / max(0.01, uHRange.y - uHRange.x), 0.0, 1.0));
      // after rain the ground is darker and a little richer, drying out patchily
      float wetK = uWet * smoothstep(0.25, 0.75, gn2 + uWet * 0.5);
      diffuseColor.rgb *= 1.0 - 0.1 * wetK;`).replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
      #ifndef GROUND_FAST
      {
        // the soil's clods and pebbles tilt the light (a bump from the height's change across the pixel;
        // derivatives taken outside any branch)
        vec3 sx = dFdx(-vViewPosition), sy = dFdy(-vViewPosition);
        vec2 dh = vec2(dFdx(soilH), dFdy(soilH));
        if (soilK > 0.004) {
          vec3 r1 = cross(sy, normal), r2 = cross(normal, sx);
          float det = dot(sx, r1);
          normal = normalize(abs(det) * normal - sign(det) * (dh.x * r1 + dh.y * r2));
        }
      }
      #endif`).replace('#include <color_fragment>', `
      // snow: soft noisy patches that grow with the snowpack, first on high open ground
      if (uSnow > 0.01) {
        float sn = uSnow * vSnowAff + (texture2D(uNoise, vWorldXZ * 0.09 + 0.61).r - 0.5) * 0.45;
        float cover = smoothstep(0.22, 0.5, sn);
        diffuseColor.rgb = mix(diffuseColor.rgb, ${SNOW_RGB} * (0.92 + 0.1 * gn2), cover * 0.95);
      }`);
  };
  mat.customProgramCacheKey = () => 'ground-splat-continuous-trails-soil';
  return mat;
}

// Gentle waves: the surface bobs and its normals ripple so highlights move.
export function waves(mat, time, amp) {
  mat.onBeforeCompile = shader => {
    shader.uniforms.uTime = time;
    const wave = `
      float wa = uTime * 1.3 + position.x * 2.1 + position.z * 1.7;
      float wb = uTime * 0.9 - position.x * 1.3 + position.z * 2.6;
      float wc = uTime * 1.7 + position.x * 3.7 - position.z * 0.9;`;
    shader.vertexShader = 'uniform float uTime;\n' + shader.vertexShader
      .replace('#include <beginnormal_vertex>', `${wave}
      float wdx = (cos(wa) * 2.1 * 0.012 - cos(wb) * 1.3 * 0.008 + cos(wc) * 3.7 * 0.004) * ${amp.toFixed(2)};
      float wdz = (cos(wa) * 1.7 * 0.012 + cos(wb) * 2.6 * 0.008 - cos(wc) * 0.9 * 0.004) * ${amp.toFixed(2)};
      vec3 objectNormal = normalize(vec3(-wdx * 6.0, 1.0, -wdz * 6.0));
      #ifdef USE_TANGENT
        vec3 objectTangent = vec3(tangent.xyz);
      #endif`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
      transformed.y += (sin(wa) * 0.012 + sin(wb) * 0.008 + sin(wc) * 0.004) * ${amp.toFixed(2)};`);
  };
  mat.customProgramCacheKey = () => 'waves' + amp;
  return mat;
}

// Living water: deeper water darker and more opaque, shallows clear; a broken line of foam
// where it laps the bank; drifting ripples that catch the light; slow streaks moving downstream
// on creeks and rivers; and rain rings when it's raining.
export function waterLook(mat, time, noise, rain, sky) {
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = shader => {
    prev(shader);
    Object.assign(shader.uniforms, { uNoiseW: { value: noise }, uRain: rain, uSky: sky });
    shader.vertexShader = 'attribute float aDepth;\nattribute vec2 aFlow;\nattribute vec2 aCurrent;\nvarying vec2 vCurrent;\nattribute float aBend;\nattribute float aQual;\nvarying float vQual;\nvarying float vBend;\nvarying float vDepth;\nvarying vec2 vFlow;\nvarying vec2 vWXZ;\n' + shader.vertexShader
      // Fade wave displacement at the bank, while retaining signed bed depth for shading.
      .replace('#include <begin_vertex>', `#include <begin_vertex>
      vDepth = aDepth; vFlow = aFlow; vCurrent = aCurrent; vBend = aBend; vQual = aQual; vWXZ = position.xz;`).replace('transformed.y +=', 'transformed.y += smoothstep(0.0, 0.16, aDepth) *');
    shader.fragmentShader = 'uniform float uTime;\nuniform sampler2D uNoiseW;\nuniform float uRain;\nuniform vec3 uSky;\nvarying float vQual;\nvarying float vBend;\nvarying float vDepth;\nvarying vec2 vFlow;\nvarying vec2 vCurrent;\nvarying vec2 vWXZ;\n' + shader.fragmentShader
      .replace('#include <normal_fragment_begin>', `#include <normal_fragment_begin>
      {
        // drifting ripples: two layers of noise sliding past each other tilt the normal
        vec2 r1 = vWXZ * 0.9 + vec2(uTime * 0.016, uTime * 0.01) + vFlow * uTime * 0.12;
        vec2 r2 = vWXZ * 1.7 - vec2(uTime * 0.012, -uTime * 0.018) + vFlow * uTime * 0.18;
        float n1 = texture2D(uNoiseW, r1).r, n2 = texture2D(uNoiseW, r2).r;
        float n1x = texture2D(uNoiseW, r1 + vec2(0.02, 0.0)).r, n1z = texture2D(uNoiseW, r1 + vec2(0.0, 0.02)).r;
        vec3 tilt = vec3(n1x - n1 + (n2 - 0.5) * 0.05, 0.0, n1z - n1 - (n2 - 0.5) * 0.05) * 0.9;
        normal = normalize(normal + (viewMatrix * vec4(tilt, 0.0)).xyz);
      }`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
      {
        // the sky catches on ripples tilted away from the viewer, more toward a glancing angle
        float flatZ = (viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).z;               // how calm water faces the camera
        float tiltAway = flatZ - normal.z;
        float reflection = texture2D(uNoiseW, vWXZ * 0.075 + vec2(uTime * 0.003, -uTime * 0.002)).r;
        float facing = 1.0 - abs(dot(normal, isOrthographic ? vec3(0.0, 0.0, 1.0) : normalize(vViewPosition))); // (the game's camera is orthographic: one view direction everywhere)
        diffuseColor.rgb = mix(diffuseColor.rgb, uSky, (0.035 + facing * facing * 0.12)
          * smoothstep(0.28, 0.72, reflection) + smoothstep(0.02, 0.18, tiltAway) * 0.08);
      }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
      {
        float deep = smoothstep(0.015, 0.42, vDepth);
        // water quality (the simulation's waterQ): bare, sunbaked banks leave it murky with silt;
        // shaded, planted banks run it clear, so a creek visibly clears as its banks are restored
        float murk = 1.0 - smoothstep(0.25, 0.66, vQual), clear = smoothstep(0.6, 0.95, vQual);
        // clear, greener shallows; deep water a richer blue-green
        diffuseColor.rgb = mix(diffuseColor.rgb * vec3(1.12, 1.22, 1.13) + vec3(0.035, 0.075, 0.055), diffuseColor.rgb * vec3(0.65, 0.79, 0.88), deep);
        // sunlight dancing on the bottom of the shallows
        {
          float ca = texture2D(uNoiseW, vWXZ * 2.3 + vec2(uTime * 0.03, uTime * 0.021)).r * texture2D(uNoiseW, vWXZ * 1.9 - vec2(uTime * 0.024, -uTime * 0.017)).r;
          diffuseColor.rgb += vec3(0.05, 0.06, 0.045) * smoothstep(0.2, 0.45, ca) * (1.0 - deep) * smoothstep(0.01, 0.08, vDepth) * (1.0 - murk) * (1.0 + clear * 0.6);
        }
        diffuseColor.a *= mix(0.93, 1.0, deep);
        {
          // cloudy, warm silt drifting with the current, hiding the bed...
          float plume = texture2D(uNoiseW, vWXZ * 0.35 - vFlow * uTime * 0.05 + vec2(uTime * 0.004, 0.0)).r;
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.25, 0.25, 0.09) * (0.9 + 0.22 * plume), murk * (0.6 + 0.14 * plume));
          diffuseColor.a = min(1.0, diffuseColor.a * (1.0 + murk * 0.12));
          // ...or clear, cool water whose shallows show more of the bed
          diffuseColor.rgb *= mix(vec3(1.0), vec3(0.96, 1.03, 1.06), clear);
          diffuseColor.a *= 1.0 - clear * 0.2 * (1.0 - deep);
        }
        // downstream streaks on moving water
        float fl = length(vFlow);
        if (fl > 0.01) {
          vec2 d = vFlow / fl, p = vCurrent; // (downstream and across, laid along the channel: see flowCoords)
          float st = texture2D(uNoiseW, vec2(p.x * 0.18 - uTime * 0.025, p.y * 1.1)).r;
          diffuseColor.rgb += vec3(0.035, 0.04, 0.04) * smoothstep(0.5, 0.85, st) * fl;
          // Short, bowed wavelets collect at bends; quieter stretches keep faint streaks.
          float phase = p.x * 13.0 + sin(p.y * 3.2 + uTime * 0.45) * 1.3 - uTime * 1.6;
          float width = max(fwidth(phase) * 0.65, 0.16);
          float ripple = 1.0 - smoothstep(0.12, 0.12 + width, abs(sin(phase)));
          float broken = smoothstep(0.45, 0.7, texture2D(uNoiseW, vWXZ * 0.7 + d * uTime * 0.015).r);
          diffuseColor.rgb += vec3(0.085, 0.11, 0.115) * ripple * broken
            * (0.15 + vBend * 0.85) * fl * smoothstep(0.008, 0.09, vDepth);
        }
        // foam where the water laps the bank
        // Signed depth crosses zero at the actual ground/water intersection.
        float edge = (1.0 - smoothstep(0.0, 0.075, abs(vDepth)));
        float fn = texture2D(uNoiseW, vWXZ * 1.4 + vec2(uTime * 0.012, -uTime * 0.008)).r;
        float foam = edge * (0.35 + 0.65 * smoothstep(0.32, 0.7, fn + 0.08 * sin(uTime * 0.5 + vWXZ.x * 3.0 + vWXZ.y * 2.0)));
        // ...and soft lines of it lapping in toward the bank
        float lap = smoothstep(0.0, 0.025, vDepth) * (1.0 - smoothstep(0.04, 0.16, vDepth)) * smoothstep(0.62, 0.9, fract(vDepth * 9.0 - uTime * 0.22 + fn * 0.6)) * smoothstep(0.3, 0.6, fn);
        foam = max(foam, lap * 0.8);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.65, 0.79, 0.76), foam * 0.5);
        diffuseColor.a = max(diffuseColor.a, foam * 0.45 * step(0.001, diffuseColor.a));
        // rain rings: expanding circles in a grid of cells, each on its own clock
        if (uRain > 0.01) {
          vec2 c = vWXZ * 2.2, ci = floor(c), cf = fract(c) - 0.5;
          float h = fract(sin(dot(ci, vec2(12.9898, 78.233))) * 43758.5453);
          float ph = fract(uTime * 0.9 + h);
          vec2 o = (vec2(fract(h * 7.1), fract(h * 3.7)) - 0.5) * 0.5;
          float rr = length(cf - o), ring = smoothstep(0.035, 0.0, abs(rr - ph * 0.42)) * (1.0 - ph);
          diffuseColor.rgb += vec3(0.12) * ring * uRain * step(0.45, h); // only some cells ring at a time
        }
      }`);
  };
  const key = mat.customProgramCacheKey();
  mat.customProgramCacheKey = () => key + '-living-water-quality';
  return mat;
}
