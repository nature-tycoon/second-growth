// The ground: a heightmap mesh textured with the tile art, a water surface, flood water,
// diorama edges around the whole valley, the property line, and tile overlays.

import * as THREE from 'three';
import { T, BORDER, LEVEL, isWater, clamp } from '../config.js';
import { PLANTS, plantPhase } from '../data/plants.js';
import { extTerrain } from '../world.js';
import * as S from '../render/sprites.js';
import { snow, SNOW_RGB } from './snow.js';
import { withClouds } from './atmosphere.js';
import { biome } from '../biome.js';
import { hash2 } from '../rng.js';
import { meadowPatch, patchColor } from './patches.js';
import { Riverbanks, bankAllowed, surfaceHeight } from './riverbanks.js';
import { PALETTES, paletteLeafColor, pastureColor } from './palettes.js';

const ATLAS_TYPES = [T.PASTURE, T.FIELD, T.SOIL, T.GRAVEL, T.MUD, T.ROAD, T.DUFF, T.TRAIL, S.TURF, S.BED];
const CELL = 64, GUT = 4, SLOT = CELL + GUT * 2, COLS = 28, ATLAS_W = 2048, ATLAS_H = 512;
// grass, soil and water colours come from the active map (biome.look)

const lin = v => v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
const hexRgb = h => { const n = parseInt(h.slice(1), 16); return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]; };
const mixRgb = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

// Soft, tileable noise used to vary the ground's color across the valley.
function noiseTexture() {
  const N = 128, G = 8, c = document.createElement('canvas');
  c.width = c.height = N;
  const ctx = c.getContext('2d'), img = ctx.createImageData(N, N);
  const grid = [];
  for (let k = 0; k < G * G; k++) grid.push(hash2(k % G, Math.floor(k / G), 77));
  const at = (x, y) => grid[((y + G) % G) * G + ((x + G) % G)];
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const fx = x / N * G, fy = y / N * G, x0 = Math.floor(fx), y0 = Math.floor(fy);
    let tx = fx - x0, ty = fy - y0; tx = tx * tx * (3 - 2 * tx); ty = ty * ty * (3 - 2 * ty);
    const a = at(x0, y0), b = at(x0 + 1, y0), cc = at(x0, y0 + 1), d = at(x0 + 1, y0 + 1);
    const v = (a + (b - a) * tx) * (1 - ty) + (cc + (d - cc) * tx) * ty;
    const o = (y * N + x) * 4;
    img.data[o] = img.data[o + 1] = img.data[o + 2] = Math.round(v * 255); img.data[o + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

// Break up the tile grid: modulate the ground by large, soft world-space noise.
// The ground texture isn't chosen per tile: each pixel looks up the tile at a position pushed
// around by noise, so the edge between grass and hardpan, or soil and mud, wanders in soft
// organic curves instead of following the grid (roads, trails and fields keep straighter edges).
// Two differently warped picks are averaged, which feathers the seam.
function groundDetail(mat, noise, tiles) {
  mat.onBeforeCompile = shader => {
    shader.uniforms.uNoise = { value: noise };
    shader.uniforms.uSnow = snow.uSnow;
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
// Smoothly blended where neighbouring tiles are alike (no patchwork inside a meadow), but the
// tile's own colour right where it changes sharply, so colour and texture always agree at an edge.
vec3 tintAt(vec2 p) {
  vec3 s = texture2D(uTint, (p - uTileOrigin) / uTileSize).rgb;
  vec3 n = texelFetch(uTint, ivec2(clamp(floor(p) - uTileOrigin, vec2(0.0), uTileSize - 1.0)), 0).rgb;
  vec3 c = mix(s, n, smoothstep(0.03, 0.1, length(s - n)));
  return c * c * 1.5; // stored as sqrt(v / 1.5)
}
vec4 tileTex(sampler2D atlas, vec4 t, vec2 p, vec2 gx, vec2 gy) {
  float slot = floor(t.r * 255.0 + 0.5), rot = floor(t.g * 255.0 / 64.0 + 0.5);
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
      diffuseColor.rgb *= 1.0 - 0.1 * wetK;`).replace('#include <color_fragment>', `
      // snow: soft noisy patches that grow with the snowpack, first on high open ground
      if (uSnow > 0.01) {
        float sn = uSnow * vSnowAff + (texture2D(uNoise, vWorldXZ * 0.09 + 0.61).r - 0.5) * 0.45;
        float cover = smoothstep(0.22, 0.5, sn);
        diffuseColor.rgb = mix(diffuseColor.rgb, ${SNOW_RGB} * (0.92 + 0.1 * gn2), cover * 0.95);
      }`);
  };
  mat.customProgramCacheKey = () => 'ground-splat-shore';
  return mat;
}

// Gentle waves: the surface bobs and its normals ripple so highlights move.
function waves(mat, time, amp) {
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
function waterLook(mat, time, noise, rain, sky) {
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = shader => {
    prev(shader);
    Object.assign(shader.uniforms, { uNoiseW: { value: noise }, uRain: rain, uSky: sky });
    shader.vertexShader = 'attribute float aDepth;\nattribute vec2 aFlow;\nattribute float aBend;\nattribute float aQual;\nvarying float vQual;\nvarying float vBend;\nvarying float vDepth;\nvarying vec2 vFlow;\nvarying vec2 vWXZ;\n' + shader.vertexShader
      // Fade wave displacement at the bank, while retaining signed bed depth for shading.
      .replace('#include <begin_vertex>', `#include <begin_vertex>
      vDepth = aDepth; vFlow = aFlow; vBend = aBend; vQual = aQual; vWXZ = position.xz;`).replace('transformed.y +=', 'transformed.y += smoothstep(0.0, 0.16, aDepth) *');
    shader.fragmentShader = 'uniform float uTime;\nuniform sampler2D uNoiseW;\nuniform float uRain;\nuniform vec3 uSky;\nvarying float vQual;\nvarying float vBend;\nvarying float vDepth;\nvarying vec2 vFlow;\nvarying vec2 vWXZ;\n' + shader.fragmentShader
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
          vec2 d = vFlow / fl, p = vec2(dot(vWXZ, d), dot(vWXZ, vec2(-d.y, d.x)));
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

export function buildAtlas() {
  const W = ATLAS_W, H = ATLAS_H;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const ctx = c.getContext('2d');
  const uv = {}, slot = {};
  let k = 0;
  for (const t of ATLAS_TYPES) for (let season = 0; season < 4; season++) for (let v = 0; v < 4; v++) {
    const sx = (k % COLS) * SLOT, sy = Math.floor(k / COLS) * SLOT;
    const img = S.terrainSprite(t, season, v);
    ctx.drawImage(img, sx + GUT, sy + GUT);
    // copy edges into the gutter so mipmaps don't bleed between tiles
    ctx.drawImage(img, 0, 0, 1, CELL, sx, sy + GUT, GUT, CELL);
    ctx.drawImage(img, CELL - 1, 0, 1, CELL, sx + GUT + CELL, sy + GUT, GUT, CELL);
    ctx.drawImage(c, sx, sy + GUT, SLOT, 1, sx, sy, SLOT, GUT);
    ctx.drawImage(c, sx, sy + GUT + CELL - 1, SLOT, 1, sx, sy + GUT + CELL, SLOT, GUT);
    uv[`${t}|${season}|${v}`] = [(sx + GUT + 0.5) / W, 1 - (sy + GUT + 0.5) / H, (sx + GUT + CELL - 0.5) / W, 1 - (sy + GUT + CELL - 0.5) / H];
    slot[`${t}|${season}|${v}`] = k;
    k++;
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  return { tex, uv, slot, W, H };
}

// Tint for groundcover: a meadow's color comes from what's growing in it.
function turfColor(p, month, season) {
  const pasture = pastureColor(biome.id, season, biome.look.pasture[season]);
  // The ground and blades share the same seasonal palette, with quieter ground contrast.
  if (!PALETTES[biome.id]) {
    // Preserve reef substrate colouring, where the registry includes corals and animals.
    const phase = plantPhase(p, month);
    let base = mixRgb(pasture, hexRgb(p.look.leaf), .55);
    if (p.look.type === 'tallgrass' || p.look.type === 'grass') {
      if (phase === 'late' || phase === 'fall') base = mixRgb(base, hexRgb(p.look.dry || '#c9b77e'), .3);
      if (phase === 'winter') base = mixRgb(base, [.62, .58, .44], .4);
    }
    if (phase === 'spring') base = mixRgb(base, [.72, .84, .48], .3);
    base = mixRgb(base, pasture, .25);
    return base.map((v, k) => v / [.86, .88, .8][k]);
  }
  const base = mixRgb(pasture, paletteLeafColor(p, plantPhase(p, month), biome.id), .42);
  // divide out the turf texture's own brightness
  return [base[0] / 0.86, base[1] / 0.88, base[2] / 0.8];
}

// How far water fills each kind of basin above its lowest corner, in height levels.
const FILL = { [T.POND]: 0.4, [T.CREEK]: 0.32, [T.RIVER]: 0.35, [T.MARSH]: 0.16 };

// Height of the water surface on a tile, in scene units (null on dry land).
export function waterSurfaceY(w, x, y) {
  const xi = Math.floor(x), yi = Math.floor(y);
  if (!w.inb(xi, yi)) return null;
  const t = w.terrain[w.idx(xi, yi)];
  if (!isWater(t)) return null;
  return (Math.min(...w.corners(xi, yi)) + FILL[t]) * LEVEL;
}

export class Terrain {
  constructor(scene, atlas) {
    this.scene = scene;
    this.atlas = atlas;
    this.time = { value: 0 };
    // which texture each tile shows, for the ground shader: slot, rotation, crisp-edged or not
    this.noise = noiseTexture();
    this.tiles = { tint: { value: null }, tex: { value: null }, origin: { value: new THREE.Vector2() }, size: { value: new THREE.Vector2(1, 1) }, wet: { value: 0 }, hRange: { value: new THREE.Vector2(0, 1) } };
    this.material = withClouds(groundDetail(new THREE.MeshLambertMaterial({ map: atlas.tex, vertexColors: true }), this.noise, this.tiles));
    this.rain = { value: 0 }; this.sky = { value: new THREE.Color(0.8, 0.86, 0.9) };
    this.waterMat = withClouds(waterLook(waves(new THREE.MeshPhongMaterial({ vertexColors: true, transparent: true, opacity: 1, shininess: 140, specular: 0xb4ccd8, depthWrite: false }), this.time, 1), this.time, this.noise, this.rain, this.sky));
    this.floodMat = withClouds(waves(new THREE.MeshPhongMaterial({ color: 0x8a9a86, transparent: true, opacity: 0.72, shininess: 60, specular: 0x556677, depthWrite: false }), this.time, 0.6));
    this.skirtMat = withClouds(new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }));
    this.overlayMat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    this.previewMat = this.overlayMat.clone();
    this.banks = new Riverbanks(scene);
    this.bankTerrainAt = (x, y) => this.terrainAt(x, y);
  }

  // The Fast graphics setting draws the ground with one texture pick per pixel instead of two.
  setFast(on) {
    this.banks.setFast(on);
    const d = this.material.defines || (this.material.defines = {});
    if (!!d.GROUND_FAST === on) return;
    if (on) d.GROUND_FAST = 1; else delete d.GROUND_FAST;
    this.material.needsUpdate = true;
  }

  // (Re)build everything for a world.
  setWorld(world, border) {
    this.world = world; this.border = border; this.snowT = null;
    this.X0 = -BORDER; this.Y0 = -BORDER;
    this.TW = world.w + BORDER * 2; this.TH = world.h + BORDER * 2;
    const n = this.TW * this.TH;
    for (const m of [this.mesh, this.water, this.flood, this.skirt, this.line, this.overlay, this.preview]) if (m) { this.scene.remove(m); m.geometry.dispose(); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 18), 3));
    g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(n * 18), 3));
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 18), 3));
    g.setAttribute('aSnow', new THREE.BufferAttribute(new Float32Array(n * 6), 1));
    g.setAttribute('aShore', new THREE.BufferAttribute(new Float32Array(n * 12), 2));
    g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 12), 2));
    this.mesh = new THREE.Mesh(g, this.material);
    this.mesh.receiveShadow = true;
    this.scene.add(this.mesh);
    this.tint = new Float32Array(n * 3);
    this.tileData = new Uint8Array(n * 4);
    this.tiles.tex.value?.dispose();
    const dt = new THREE.DataTexture(this.tileData, this.TW, this.TH, THREE.RGBAFormat, THREE.UnsignedByteType);
    dt.magFilter = dt.minFilter = THREE.NearestFilter; dt.generateMipmaps = false; dt.flipY = false; dt.needsUpdate = true;
    this.tiles.tex.value = dt;
    this.tintData = new Uint8Array(n * 4);
    this.tiles.tint.value?.dispose();
    const tt = new THREE.DataTexture(this.tintData, this.TW, this.TH, THREE.RGBAFormat, THREE.UnsignedByteType);
    tt.magFilter = tt.minFilter = THREE.LinearFilter; tt.generateMipmaps = false; tt.flipY = false; tt.needsUpdate = true;
    this.tiles.tint.value = tt;
    this.tiles.origin.value.set(this.X0, this.Y0); this.tiles.size.value.set(this.TW, this.TH);
    this.water = null; this.flood = null; this.overlay = null; this.preview = null;
    this.updateHeights();
  }

  h(x, y) { return this.world.vert(x, y) * LEVEL; }

  terrainAt(x, y) {
    const w = this.world;
    if (w.inb(x, y)) return w.terrain[w.idx(x, y)];
    const bi = this.border.bi(x, y);
    return bi < 0 ? extTerrain(w, x, y) : this.border.terrain[bi];
  }

  updateHeights() {
    const w = this.world, g = this.mesh.geometry;
    const pos = g.attributes.position.array, nor = g.attributes.normal.array;
    const vn = (x, y) => {
      const dx = (this.h(x + 1, y) - this.h(x - 1, y)) / 2, dy = (this.h(x, y + 1) - this.h(x, y - 1)) / 2;
      const l = Math.hypot(dx, 1, dy);
      return [-dx / l, 1 / l, -dy / l];
    };
    let o = 0;
    for (let ty = 0; ty < this.TH; ty++) for (let tx = 0; tx < this.TW; tx++) {
      const x = tx + this.X0, y = ty + this.Y0;
      const A = [x, y], B = [x + 1, y], C = [x + 1, y + 1], D = [x, y + 1];
      for (const [vx, vy] of [A, C, B, A, D, C]) {
        pos[o] = vx; pos[o + 1] = this.h(vx, vy); pos[o + 2] = vy;
        const nn = vn(vx, vy);
        nor[o] = nn[0]; nor[o + 1] = nn[1]; nor[o + 2] = nn[2];
        o += 3;
      }
    }
    g.attributes.position.needsUpdate = true;
    g.attributes.normal.needsUpdate = true;
    g.computeBoundingSphere();
    // the map's own height range, for shading hollows and rises (5th to 95th percentile, so one
    // tall peak or a deep river doesn't flatten everything else)
    { const hs = []; for (let y = 0; y <= w.h; y += 2) for (let x = 0; x <= w.w; x += 2) hs.push(this.h(x, y)); hs.sort((a, b) => a - b);
      this.tiles.hRange.value.set(hs[Math.floor(hs.length * 0.05)], hs[Math.floor(hs.length * 0.95)] + 0.01); }
    this.hv = w.hv;
    this.buildSkirt();
    this.buildLine();
    this.buildWater();
    if (this.overlay) { this.scene.remove(this.overlay); this.overlay.geometry.dispose(); this.overlay = null; }
  }

  // Textures and colors: what's on each tile this season.
  updateSurface(game) {
    this.refreshWaterQuality();
    const w = this.world, B = this.border, g = this.mesh.geometry;
    const uv = g.attributes.uv.array, col = g.attributes.color.array;
    const month = game.month, season = game.season;
    const tint = this.tint;
    // how readily each tile holds snow: open high ground most, under trees less, water not at all
    const snowT = this.snowT || (this.snowT = new Float32Array(this.TW * this.TH));
    // each tile's highest corner, kept until the land is reshaped
    if (this.topHv !== this.hv || !this.top) {
      const top = this.top = new Float32Array(this.TW * this.TH);
      let lo = Infinity, hi = -Infinity;
      for (let ty = 0; ty < this.TH; ty++) for (let tx = 0; tx < this.TW; tx++) {
        const x = tx + this.X0, y = ty + this.Y0;
        const h = Math.max(w.vert(x, y), w.vert(x + 1, y), w.vert(x + 1, y + 1), w.vert(x, y + 1));
        top[ty * this.TW + tx] = h; if (h < lo) lo = h; if (h > hi) hi = h;
      }
      this.topLo = lo; this.topHi = hi; this.topHv = this.hv;
    }
    const top = this.top, hLo = this.topLo, hHi = this.topHi;
    const turfCache = new Map(), atlasKeys = new Map();
    // grassland of any kind shares one texture, tinted by what grows there
    const pasture = pastureColor(biome.id, season, biome.look.pasture[season]).map((v, q) => v / [0.86, 0.88, 0.8][q]);
    for (let ty = 0; ty < this.TH; ty++) for (let tx = 0; tx < this.TW; tx++) {
      const x = tx + this.X0, y = ty + this.Y0, k = ty * this.TW + tx;
      const inside = w.inb(x, y);
      const i = inside ? w.idx(x, y) : -1;
      const bi = inside ? -1 : B.bi(x, y);
      const t = inside ? w.terrain[i] : (bi >= 0 ? B.terrain[bi] : extTerrain(w, x, y));
      const v = inside ? w.variant[i] : ((x * 7 + y * 13) & 3);
      let tex = t, c = [1, 1, 1];
      if (t === T.MARSH) { tex = S.TURF; c = [0.52, 0.58, 0.42]; }
      else if (t === T.TRAIL && biome.sandBed) { tex = S.TURF; c = pastureColor(biome.id, season, biome.look.pasture[season]).map(v => v * 1.04); } // (a snorkel trail is just marked with buoys over the sand)
      // pond beds share the marsh's soft texture (just darker), so the two blend at their edges
      else if (t === T.POND) { tex = S.TURF; c = [0.4, 0.44, 0.34]; }
      else if (isWater(t)) { tex = S.BED; c = [0.7, 0.66, 0.58]; }
      else {
        const canopy = inside ? w.canopy[i] : 0;
        const gid = inside ? w.ground[i] : (bi >= 0 ? B.ground[bi] : 0);
        const gg = inside ? w.groundG[i] : 1;
        if (tex === T.PASTURE) { tex = S.TURF; c = pasture; }
        else if (tex === T.SOIL) { tex = S.TURF; c = biome.look.soil; }
        else if (tex === T.MUD) { tex = S.TURF; c = biome.look.mud; }
        if (gid && gg > 0.12 && t !== T.TRAIL) {
          const p = PLANTS[gid];
          if (p.look.type === 'fern' || p.look.type === 'skunk') tex = T.DUFF;
          else if (tex !== T.DUFF) {
            let tc = turfCache.get(gid);
            if (!tc) { tc = turfColor(p, month, season); turfCache.set(gid, tc); }
            const f = clamp((gg - 0.12) * 2, 0, 1);
            if (p.layer === 0 && !p.aquatic) tc = patchColor(tc, meadowPatch(x + 0.5, y + 0.5), 1); // (the same patches as the tufts on it)
            if (tex === S.TURF) c = mixRgb(pasture, tc, f);
            else if (gg > 0.35) { tex = S.TURF; c = mixRgb(pasture, tc, f); }
            else c = mixRgb([1, 1, 1], [0.85, 1, 0.8], f);
          }
        }
        // under a closing canopy the ground fades into shaded forest floor
        if (canopy > 0.3 && t !== T.ROAD && t !== T.GRAVEL && t !== T.TRAIL) {
          if (canopy > 0.6 && (tex === T.FIELD || tex === T.SOIL)) tex = S.TURF;
          c = mixRgb(c, [0.5, 0.45, 0.33], clamp((canopy - 0.3) * 1.2, 0, 0.7));
        }
        // a little soft shade where trunks and shrubs meet the ground, so they sit in the land
        const tid2 = inside ? w.tree[i] : (bi >= 0 ? B.tree[bi] : 0), sid2 = inside ? w.shrub[i] : (bi >= 0 ? B.shrub[bi] : 0);
        const tg = inside ? w.treeG[i] : 0.9, sg = inside ? w.shrubG[i] : 0.9;
        if (tid2 && tg > 0.25) c = c.map(q => q * (1 - 0.14 * Math.min(1, tg)));
        else if (sid2 && sg > 0.3) c = c.map(q => q * (1 - 0.08 * Math.min(1, sg)));
        // game trails worn in by the herds
        if (inside && w.trod && w.trod[i] > 0.12 && t !== T.ROAD) c = mixRgb(c, biome.look.soil, Math.min(0.45, (w.trod[i] - 0.12) * 0.7));
        // ground the player can't work yet (the suburb's other yards) is washed out toward grey
        if (inside && biome.locked?.(game, i)) { const l = (c[0] * 0.3 + c[1] * 0.59 + c[2] * 0.11) * 1.08; c = mixRgb(c, [l, l, l * 0.96], 0.55); }
        if (inside && (w.marks[i] & 1)) c = mixRgb(c, [1, 1, 0.96], 0.24); // (a snorkel trail: just a faint line on the seabed under the buoys)
        if (inside && biome.look.groundTint) c = biome.look.groundTint(w, i, c) || c; // (Sumatra: dark peat showing through)
        if (inside && w.scorch[i] > 0) { const f = clamp(w.scorch[i] / 160, 0, 1) * 0.7; c = mixRgb(c, [0.22, 0.2, 0.18], f); }
      }
      {
        const canopyS = inside ? w.canopy[i] : (bi >= 0 && B.tree?.[bi] ? 0.7 : 0.2);
        const elev = (top[k] - hLo) / Math.max(0.01, hHi - hLo);
        snowT[k] = isWater(t) ? 0 : (1 - canopyS * 0.55) * (0.75 + elev * 0.55);
      }
      // a map can colour the land beyond its edge itself (Chinandega's volcano: ash, not grass)
      const own = !inside && !isWater(t) ? biome.look.borderTint?.(x, y, c) : null;
      if (own) c = own;
      const b = 0.95 + hash2(x, y, 5) * 0.1;
      const dim = inside || own ? 1 : 0.8;
      tint[k * 3] = lin(c[0] * b * dim); tint[k * 3 + 1] = lin(c[1] * b * dim); tint[k * 3 + 2] = lin(c[2] * b * dim);
      // UVs, rotated per tile so repeats don't line up
      const ak = tex * 64 + v; // (season is fixed for the whole pass)
      let at = atlasKeys.get(ak);
      if (!at) {
        const key = this.atlas.uv[`${tex}|${season}|${v}`] ? `${tex}|${season}|${v}` : `${T.PASTURE}|${season}|0`;
        at = { r: this.atlas.uv[key], slot: this.atlas.slot[key] };
        atlasKeys.set(ak, at);
      }
      const r = at.r;
      const td = this.tileData, crisp = t === T.ROAD || t === T.TRAIL || t === T.FIELD;
      td[k * 4] = at.slot; td[k * 4 + 1] = t === T.FIELD ? 0 : (v & 3) * 64; // plowed furrows all run the same way
      td[k * 4 + 2] = crisp ? 0 : 255; td[k * 4 + 3] = 255;
      const corners = [[r[0], r[1]], [r[2], r[1]], [r[2], r[3]], [r[0], r[3]]];
      const rot = v & 3;
      const cA = corners[rot % 4], cB = corners[(rot + 1) % 4], cC = corners[(rot + 2) % 4], cD = corners[(rot + 3) % 4];
      const o = k * 12;
      const put = (j, q) => { uv[o + j * 2] = q[0]; uv[o + j * 2 + 1] = q[1]; };
      put(0, cA); put(1, cC); put(2, cB); put(3, cA); put(4, cD); put(5, cC);
    }
    // blend colors at shared corners so neighbouring tiles fade into each other: each corner
    // averages the (up to four) tiles that meet there, worked out once for the whole map
    const TW = this.TW, TH = this.TH, VW = TW + 1;
    const vc = this.vCol && this.vCol.length === VW * (TH + 1) * 3 ? this.vCol : (this.vCol = new Float32Array(VW * (TH + 1) * 3));
    const vs = this.vSnow && this.vSnow.length === VW * (TH + 1) ? this.vSnow : (this.vSnow = new Float32Array(VW * (TH + 1)));
    for (let cy = 0; cy <= TH; cy++) for (let cx = 0; cx <= TW; cx++) {
      let r = 0, gg = 0, bb = 0, n = 0, sv = 0, dry = true;
      for (let dy = -1; dy <= 0; dy++) for (let dx = -1; dx <= 0; dx++) {
        const tx = cx + dx, ty = cy + dy;
        if (tx < 0 || ty < 0 || tx >= TW || ty >= TH) continue;
        const k = ty * TW + tx;
        r += tint[k * 3]; gg += tint[k * 3 + 1]; bb += tint[k * 3 + 2]; n++;
        sv += snowT[k]; if (snowT[k] === 0) dry = false;
      }
      const o = (cy * VW + cx) * 3;
      vc[o] = r / n; vc[o + 1] = gg / n; vc[o + 2] = bb / n;
      vs[cy * VW + cx] = dry ? sv / n : sv / n * 0.5; // (snow thins out where it meets water)
    }
    const sa = g.attributes.aSnow.array, shore = g.attributes.aShore.array;
    for (let ty = 0; ty < TH; ty++) for (let tx = 0; tx < TW; tx++) {
      const k = ty * TW + tx;
      const a = ty * VW + tx, b = a + 1, c = a + VW + 1, d = a + VW;
      // keep a little of the tile's own color so edges stay readable
      const r0 = tint[k * 3], g0 = tint[k * 3 + 1], b0 = tint[k * 3 + 2];
      // crisp surfaces (a one-tile driveway, a trail) keep their own colour instead of taking on the lawn's
      const crisp = this.tileData[k * 4 + 2] === 0;
      const o = k * 18;
      const put = (j, v) => {
        if (crisp) { col[o + j * 3] = r0; col[o + j * 3 + 1] = g0; col[o + j * 3 + 2] = b0; return; }
        col[o + j * 3] = vc[v * 3] * 0.92 + r0 * 0.08; col[o + j * 3 + 1] = vc[v * 3 + 1] * 0.92 + g0 * 0.08; col[o + j * 3 + 2] = vc[v * 3 + 2] * 0.92 + b0 * 0.08;
      };
      put(0, a); put(1, c); put(2, b); put(3, a); put(4, d); put(5, c);
      // snow affinity, blended at corners like the colours so its edges fade too
      const so = k * 6;
      sa[so] = vs[a]; sa[so + 1] = vs[c]; sa[so + 2] = vs[b]; sa[so + 3] = vs[a]; sa[so + 4] = vs[d]; sa[so + 5] = vs[c];
      const eligible = !biome.look.underwater && bankAllowed(w, B, this.bankTerrainAt, tx + this.X0, ty + this.Y0);
      for (const [j, v] of [a, c, b, a, d, c].entries()) {
        shore[k * 12 + j * 2] = eligible ? this.shoreVertices[v * 2] : 0;
        shore[k * 12 + j * 2 + 1] = eligible ? this.shoreVertices[v * 2 + 1] : 0;
      }
    }
    g.attributes.aShore.needsUpdate = true;
    this.banks.refresh(game.month);
    g.attributes.aSnow.needsUpdate = true;
    this.tiles.tex.value.needsUpdate = true;
    { const td = this.tintData, enc = v => Math.round(Math.sqrt(clamp(v / 1.5, 0, 1)) * 255);
      for (let k = 0; k < TW * TH; k++) { td[k * 4] = enc(tint[k * 3]); td[k * 4 + 1] = enc(tint[k * 3 + 1]); td[k * 4 + 2] = enc(tint[k * 3 + 2]); td[k * 4 + 3] = 255; }
      this.tiles.tint.value.needsUpdate = true; }
    g.attributes.uv.needsUpdate = true;
    g.attributes.color.needsUpdate = true;
  }

  quadMesh(tiles, lift, material, colorFn, alpha = false) {
    const n = tiles.length;
    const pos = new Float32Array(n * 18), col = new Float32Array(n * 6 * (alpha ? 4 : 3)), nor = new Float32Array(n * 18);
    let o = 0, oc = 0;
    const cs = alpha ? 4 : 3;
    for (const [x, y, hTop] of tiles) {
      const c0 = colorFn(x, y);
      const c = [lin(c0[0]), lin(c0[1]), lin(c0[2]), c0[3]];
      for (const [vx, vy] of [[x, y], [x + 1, y + 1], [x + 1, y], [x, y], [x, y + 1], [x + 1, y + 1]]) {
        pos[o] = vx; pos[o + 1] = (hTop != null ? hTop : this.h(vx, vy)) + lift; pos[o + 2] = vy;
        nor[o + 1] = 1;
        o += 3;
        for (let q = 0; q < cs; q++) col[oc + q] = c[q];
        oc += cs;
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, cs));
    return new THREE.Mesh(g, material);
  }

  // Water lies level in its basin and spills a tile onto the banks; wherever the ground rises
  // above it, the ground hides it. So shorelines follow the land's contours instead of tile edges.
  // The water and flood meshes only change when the water does (dug ponds, a beaver dam, a flood,
  // reshaped ground), so each new day checks a cheap fingerprint before rebuilding them.
  waterKey() {
    const w = this.world, t = w.terrain;
    let h = (w.hv | 0) >>> 0;
    for (let i = 0; i < w.n; i++) if (isWater(t[i])) h = Math.imul(h ^ (i * 16 + t[i]), 16777619) >>> 0;
    return h;
  }
  floodKey() {
    const w = this.world, f = w.flood;
    let h = 2166136261;
    for (let i = 0; i < w.n; i++) if (f[i]) h = Math.imul(h ^ i, 16777619) >>> 0;
    return h;
  }
  refreshWater() { if (this.waterKey() !== this.waterK) this.buildWater(); }
  refreshFlood() { if (this.floodKey() !== this.floodK) this.buildFlood(); }

  buildWater() {
    this.waterK = this.waterKey();
    if (this.water) { this.scene.remove(this.water); this.water.geometry.dispose(); }
    const w = this.world, TW = this.TW, TH = this.TH, X0 = this.X0, Y0 = this.Y0;
    const wc = biome.look.water;
    const COL = { [T.POND]: wc.pond, [T.CREEK]: wc.creek, [T.RIVER]: wc.river, [T.MARSH]: wc.marsh };
    const level = new Float32Array(TW * TH).fill(NaN), kind = new Uint8Array(TW * TH), wet = new Uint8Array(TW * TH);
    for (let ty = 0; ty < TH; ty++) for (let tx = 0; tx < TW; tx++) {
      const t = this.terrainAt(tx + X0, ty + Y0);
      if (!isWater(t)) continue;
      const k = ty * TW + tx;
      level[k] = Math.min(...w.corners(tx + X0, ty + Y0)) + FILL[t]; kind[k] = t; wet[k] = 1;
    }
    // Ponds and marshes that touch are one body of standing water: give it one surface, so a
    // deeper pond reads as darker water under a continuous sheet instead of a sunken square.
    // (Capped a little above its lowest tile so water never climbs a slope.)
    const body = new Int32Array(TW * TH).fill(-1);
    for (let k0 = 0; k0 < TW * TH; k0++) {
      if (!wet[k0] || body[k0] >= 0 || (kind[k0] !== T.POND && kind[k0] !== T.MARSH)) continue;
      const q = [k0]; body[k0] = k0;
      let lo = Infinity, hi = -Infinity;
      for (let h = 0; h < q.length; h++) {
        const k = q[h], tx = k % TW, ty = (k / TW) | 0;
        lo = Math.min(lo, level[k]); hi = Math.max(hi, level[k]);
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const xx = tx + dx, yy = ty + dy;
          if (xx < 0 || yy < 0 || xx >= TW || yy >= TH) continue;
          const j = yy * TW + xx;
          if (wet[j] && body[j] < 0 && (kind[j] === T.POND || kind[j] === T.MARSH)) { body[j] = k0; q.push(j); }
        }
      }
      const L = Math.min(hi, lo + 0.3);
      for (const k of q) level[k] = Math.max(level[k], L);
    }
    // one ring of bank tiles carries the neighbouring water level
    const ring = [];
    for (let ty = 0; ty < TH; ty++) for (let tx = 0; tx < TW; tx++) {
      const k = ty * TW + tx;
      if (wet[k]) continue;
      let L = -Infinity, kd = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const xx = tx + dx, yy = ty + dy;
        if (xx < 0 || yy < 0 || xx >= TW || yy >= TH) continue;
        const j = yy * TW + xx;
        if (wet[j] && level[j] > L) { L = level[j]; kd = kind[j]; }
      }
      if (L > -Infinity && Math.min(...w.corners(tx + X0, ty + Y0)) < L) ring.push([k, L, kd]);
    }
    for (const [k, L, kd] of ring) { level[k] = L; kind[k] = kd; }
    const vLevel = (vx, vy) => {
      let L = -Infinity;
      for (const [dx, dy] of [[-1, -1], [0, -1], [-1, 0], [0, 0]]) {
        const tx = vx - X0 + dx, ty = vy - Y0 + dy;
        if (tx < 0 || ty < 0 || tx >= TW || ty >= TH) continue;
        const l = level[ty * TW + tx];
        if (l === l && l > L) L = l;
      }
      return L;
    };
    // fully clear at the outer edge of the bank ring, so shallows fade out instead of ending in a line
    const vWet = (vx, vy) => {
      for (const [dx, dy] of [[-1, -1], [0, -1], [-1, 0], [0, 0]]) {
        const tx = vx - X0 + dx, ty = vy - Y0 + dy;
        if (tx >= 0 && ty >= 0 && tx < TW && ty < TH && wet[ty * TW + tx]) return true;
      }
      return false;
    };
    const shoreVertices = this.shoreVertices = new Float32Array((TW + 1) * (TH + 1) * 2);
    for (let vy = 0; vy <= TH; vy++) for (let vx = 0; vx <= TW; vx++) {
      const L = vLevel(vx + X0, vy + Y0), k = (vy * (TW + 1) + vx) * 2;
      if (Number.isFinite(L)) { shoreVertices[k] = L * LEVEL; shoreVertices[k + 1] = 1; }
    }
    // Only scatter where all four corners share a water sheet. This avoids stray objects
    // on the outer ring where the water mesh ends and its opacity falls to zero.
    const cells = [];
    for (let ty = 0; ty < TH; ty++) for (let tx = 0; tx < TW; tx++) {
      if (Number.isFinite(level[ty * TW + tx])) cells.push([tx + X0, ty + Y0]);
    }
    const waterAt = (x, z) => {
      const xx = Math.floor(x), zz = Math.floor(z);
      if ([vLevel(xx, zz), vLevel(xx + 1, zz), vLevel(xx + 1, zz + 1), vLevel(xx, zz + 1)].some(v => !Number.isFinite(v))) return NaN;
      return surfaceHeight(vLevel, x, z) * LEVEL;
    };
    this.banks.bind(w, this.border, cells, waterAt, this.bankTerrainAt, !!biome.look.underwater);
    // blend the water's colour across tile corners, so pond, marsh and creek shade into each other
    const vColor = (vx, vy) => {
      const out = [0, 0, 0, 0]; let n = 0;
      for (const [dx, dy] of [[-1, -1], [0, -1], [-1, 0], [0, 0]]) {
        const tx = vx - X0 + dx, ty = vy - Y0 + dy;
        if (tx < 0 || ty < 0 || tx >= TW || ty >= TH) continue;
        const k = ty * TW + tx;
        if (level[k] !== level[k]) continue;
        const c = COL[kind[k]];
        for (let e = 0; e < 4; e++) out[e] += c[e];
        n++;
      }
      return n ? out.map(v => v / n) : COL[T.POND];
    };
    const tiles = [];
    for (let k = 0; k < TW * TH; k++) if (level[k] === level[k]) tiles.push(k);
    const pos = new Float32Array(tiles.length * 18), col = new Float32Array(tiles.length * 24), nor = new Float32Array(tiles.length * 18);
    const dep = new Float32Array(tiles.length * 6), flow = new Float32Array(tiles.length * 12), bend = new Float32Array(tiles.length * 6);
    const moving = k => kind[k] === T.CREEK || kind[k] === T.RIVER;
    const wetAt = (tx, ty) => tx >= 0 && ty >= 0 && tx < TW && ty < TH && wet[ty * TW + tx] && moving(ty * TW + tx);
    const tileFlow = new Float32Array(TW * TH * 2), tileBend = new Float32Array(TW * TH);
    for (const k of tiles) {
      const x = (k % TW) + X0, y = Math.floor(k / TW) + Y0, tx = k % TW, ty = (k / TW) | 0;
      if (!moving(k)) continue;
      // Find the channel's axis, rather than flowing down a steep bank across it.
      let xx = 0, yy = 0, xy = 0;
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) if (wetAt(tx + dx, ty + dy)) {
        xx += dx * dx; yy += dy * dy; xy += dx * dy;
      }
      const angle = 0.5 * Math.atan2(2 * xy, xx - yy);
      let fx = Math.cos(angle), fy = Math.sin(angle);
      const downhill = fx * (w.vert(x - 1, y) - w.vert(x + 2, y)) + fy * (w.vert(x, y - 1) - w.vert(x, y + 2));
      if (downhill < -0.05 || (Math.abs(downhill) <= 0.05 && fy < -0.01)) { fx = -fx; fy = -fy; }
      const speed = kind[k] === T.CREEK ? 0.7 : 1;
      tileFlow[k * 2] = fx * speed; tileFlow[k * 2 + 1] = fy * speed;
      const h = Number(wetAt(tx - 1, ty)) + Number(wetAt(tx + 1, ty));
      const v = Number(wetAt(tx, ty - 1)) + Number(wetAt(tx, ty + 1));
      tileBend[k] = h && v && h + v <= 3 ? 1 : 0;
    }
    // Shared corner samples avoid visible seams in flow and bend highlights.
    const vertexFlow = new Float32Array((TW + 1) * (TH + 1) * 3);
    for (let vy = 0; vy <= TH; vy++) for (let vx = 0; vx <= TW; vx++) {
      let fx = 0, fy = 0, b = 0, n = 0;
      for (const [dx, dy] of [[-1, -1], [0, -1], [-1, 0], [0, 0]]) {
        const tx = vx + dx, ty = vy + dy;
        if (tx < 0 || ty < 0 || tx >= TW || ty >= TH) continue;
        const k = ty * TW + tx;
        if (!Number.isFinite(level[k])) continue;
        fx += tileFlow[k * 2]; fy += tileFlow[k * 2 + 1]; b += tileBend[k]; n++;
      }
      const vi = (vy * (TW + 1) + vx) * 3;
      if (n) { vertexFlow[vi] = fx / n; vertexFlow[vi + 1] = fy / n; vertexFlow[vi + 2] = b / n; }
    }
    let o = 0, oc = 0, od = 0;
    for (const k of tiles) {
      const x = (k % TW) + X0, y = Math.floor(k / TW) + Y0;
      for (const [vx, vy] of [[x, y], [x + 1, y + 1], [x + 1, y], [x, y], [x, y + 1], [x + 1, y + 1]]) {
        const c = vColor(vx, vy), lv = vLevel(vx, vy);
        pos[o] = vx; pos[o + 1] = lv * LEVEL; pos[o + 2] = vy; nor[o + 1] = 1; o += 3;
        dep[od] = lv - w.vert(vx, vy);
        const vi = ((vy - Y0) * (TW + 1) + vx - X0) * 3;
        flow[od * 2] = vertexFlow[vi]; flow[od * 2 + 1] = vertexFlow[vi + 1]; bend[od] = vertexFlow[vi + 2]; od++;
        col[oc] = lin(c[0]); col[oc + 1] = lin(c[1]); col[oc + 2] = lin(c[2]); col[oc + 3] = vWet(vx, vy) ? c[3] : 0; oc += 4;
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 4));
    g.setAttribute('aDepth', new THREE.BufferAttribute(dep, 1));
    g.setAttribute('aFlow', new THREE.BufferAttribute(flow, 2));
    g.setAttribute('aBend', new THREE.BufferAttribute(bend, 1));
    g.setAttribute('aQual', new THREE.BufferAttribute(new Float32Array(od), 1));
    this.water = new THREE.Mesh(g, this.waterMat);
    this.water.renderOrder = 2;
    this.scene.add(this.water);
    this.refreshWaterQuality();
  }

  // How clean the water is at each corner: the simulation's water quality on the tiles around it.
  // Water beyond the property runs moderately clean; the reef's sea is always clear.
  refreshWaterQuality() {
    const a = this.water?.geometry.attributes.aQual;
    if (!a) return;
    const w = this.world, p = this.water.geometry.attributes.position, sea = !!biome.look.underwater;
    for (let v = 0; v < a.count; v++) {
      const vx = Math.round(p.getX(v)), vy = Math.round(p.getZ(v));
      let s = 0, n = 0;
      for (let dy = -1; dy <= 0; dy++) for (let dx = -1; dx <= 0; dx++) {
        const x = vx + dx, y = vy + dy;
        if (!isWater(this.terrainAt(x, y))) continue;
        s += sea ? 1 : w.inb(x, y) ? w.waterQ[w.idx(x, y)] : 0.6; n++;
      }
      a.array[v] = n ? s / n : 0.6;
    }
    a.needsUpdate = true;
  }

  buildFlood() {
    this.floodK = this.floodKey();
    const w = this.world;
    if (this.flood) { this.scene.remove(this.flood); this.flood.geometry.dispose(); this.flood = null; }
    const tiles = [];
    for (let i = 0; i < w.n; i++) if (w.flood[i]) {
      const x = i % w.w, y = (i / w.w) | 0;
      tiles.push([x, y]);
    }
    if (!tiles.length) return;
    this.flood = this.quadMesh(tiles, 0.09, this.floodMat, () => [1, 1, 1]);
    this.flood.renderOrder = 3;
    this.scene.add(this.flood);
  }

  // Soil walls around the whole valley, like a diorama.
  buildSkirt() {
    if (this.skirt) { this.scene.remove(this.skirt); this.skirt.geometry.dispose(); }
    const base = -3 * LEVEL;
    const pos = [], col = [];
    const L = c => c.map(lin);
    const grass = L([0.42, 0.5, 0.28]), soil = L([0.46, 0.34, 0.22]), deep = L([0.26, 0.2, 0.16]), blue = L([0.2, 0.4, 0.5]);
    const seg = (x1, y1, x2, y2, water) => {
      const h1 = this.h(x1, y1), h2 = this.h(x2, y2);
      const lip = water ? 0.35 : 0.08;
      const bands = [[0, lip, water ? blue : grass, soil], [lip, null, soil, deep]];
      for (const [a, b, c1, c2] of bands) {
        const t1 = h1 - a, t2 = h2 - a;
        const b1 = b == null ? base : h1 - b, b2 = b == null ? base : h2 - b;
        pos.push(x1, t1, y1, x2, t2, y2, x2, b2, y2, x1, t1, y1, x2, b2, y2, x1, b1, y1);
        col.push(...c1, ...c1, ...c2, ...c1, ...c2, ...c2);
      }
    };
    const x0 = this.X0, y0 = this.Y0, x1 = this.X0 + this.TW, y1 = this.Y0 + this.TH;
    for (let x = x0; x < x1; x++) { seg(x, y0, x + 1, y0, isWater(this.terrainAt(x, y0))); seg(x, y1, x + 1, y1, isWater(this.terrainAt(x, y1 - 1))); }
    for (let y = y0; y < y1; y++) { seg(x0, y, x0, y + 1, isWater(this.terrainAt(x0, y))); seg(x1, y, x1, y + 1, isWater(this.terrainAt(x1 - 1, y))); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.computeVertexNormals();
    this.skirt = new THREE.Mesh(g, this.skirtMat);
    this.scene.add(this.skirt);
  }

  buildLine() {
    if (this.line) { this.scene.remove(this.line); this.line.geometry.dispose(); }
    const w = this.world, pts = [];
    const add = (x, y) => pts.push(new THREE.Vector3(x, Math.max(this.h(x, y), -0.2) + 0.05, y));
    for (let x = 0; x <= w.w; x++) add(x, 0);
    for (let y = 1; y <= w.h; y++) add(w.w, y);
    for (let x = w.w - 1; x >= 0; x--) add(x, w.h);
    for (let y = w.h - 1; y >= 0; y--) add(0, y);
    const g = new THREE.BufferGeometry().setFromPoints(pts);
    this.line = new THREE.Line(g, new THREE.LineDashedMaterial({ color: 0xfff2cc, dashSize: 0.45, gapSize: 0.3, transparent: true, opacity: 0.8 }));
    this.line.computeLineDistances();
    this.scene.add(this.line);
  }

  // Colored tile overlay for the whole map (colors: Float32Array of rgba per map tile).
  setOverlay(colors) {
    const w = this.world;
    if (!colors) { if (this.overlay) this.overlay.visible = false; return; }
    if (!this.overlay) {
      const tiles = [];
      for (let y = 0; y < w.h; y++) for (let x = 0; x < w.w; x++) tiles.push([x, y]);
      this.overlay = this.quadMesh(tiles, 0.03, this.overlayMat, () => [0, 0, 0, 0], true);
      this.overlay.renderOrder = 4;
      this.scene.add(this.overlay);
    }
    this.overlay.visible = true;
    const col = this.overlay.geometry.attributes.color.array;
    for (let i = 0; i < w.n; i++) {
      const r = lin(colors[i * 4]), g = lin(colors[i * 4 + 1]), b = lin(colors[i * 4 + 2]), a = colors[i * 4 + 3];
      for (let v = 0; v < 6; v++) { const o = (i * 6 + v) * 4; col[o] = r; col[o + 1] = g; col[o + 2] = b; col[o + 3] = a; }
    }
    this.overlay.geometry.attributes.color.needsUpdate = true;
  }

  setPreview(list) {
    if (this.preview) { this.scene.remove(this.preview); this.preview.geometry.dispose(); this.preview = null; }
    if (!list || !list.length) return;
    const w = this.world;
    this.preview = this.quadMesh(list.map(p => [p.i % w.w, (p.i / w.w) | 0]), 0.045, this.previewMat, (x, y) => list.find(p => p.i === w.idx(x, y)).rgba, true);
    this.preview.renderOrder = 5;
    this.scene.add(this.preview);
  }
}
