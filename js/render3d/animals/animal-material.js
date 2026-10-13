// GPU animal animation; consumes geometry attributes and movement metadata.
import * as THREE from 'three';
import { SIAMANG_SWING_GLSL } from '../siamang-swing.js';

// ---------------------------------------------------------------- material with the animation shader
export function faunaMaterial(motion) {
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
  mat.defaultAttributeValues = { aSwing: [0, 0, 0], aSwingN: [0, 1, 0] };
  const u = {
    uPrimate: { value: motion.primate ?? 0 }, uLength: { value: motion.len || 1 },
    uBird: { value: motion.bird ?? 0 }, uWingSpan: { value: motion.wingSpan ?? 1 },
    uLeg: { value: motion.leg }, uBob: { value: motion.bob }, uTail: { value: motion.tail }, uFlap: { value: motion.flap },
    uHead: { value: motion.head ?? 0.9 }, uWave: { value: motion.wave }, uWaveK: { value: motion.waveK }, uWaveHead: { value: motion.waveHead }, uWaveLen: { value: motion.waveLen },
    uVerticalWave: { value: motion.verticalWave ?? 0 }, uWaveMin: { value: motion.waveMin ?? 0.25 }, uWavePow: { value: motion.wavePow ?? 1 }, uWaveRest: { value: motion.waveRest ?? .35 }, uTongue: { value: motion.tongue ?? 0 }, uBend: { value: motion.bend ?? 0 },
    uSlither: { value: motion.slither?.amp ?? 0 }, uSlitherLen: { value: motion.slither?.len ?? 1 }, uSlitherNose: { value: motion.slither?.nose ?? 0 },
  };
  mat.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, u);
    shader.vertexShader = `
      attribute float aPart; attribute vec3 aPivot; attribute vec3 aExt; attribute vec3 aExtN; attribute vec4 aAnim;
      ${motion.primate === 3 || motion.primate === 2 ? 'attribute vec3 aSwing; attribute vec3 aSwingN;' : ''}
      ${motion.canopyFeet ? 'attribute vec4 aGripA; attribute vec4 aGripB; attribute vec4 aGripC;' : ''}
      uniform float uPrimate, uLength, uLeg, uBob, uTail, uFlap, uHead, uWave, uWaveK, uWaveHead, uWaveLen, uWaveMin, uWavePow, uWaveRest, uTongue, uVerticalWave, uBend, uBird, uWingSpan, uSlither, uSlitherLen, uSlitherNose;
      vec3 rotX(vec3 p, vec3 o, float a) { vec3 q = p - o; float c = cos(a), s = sin(a); return o + vec3(q.x, q.y * c - q.z * s, q.y * s + q.z * c); }
      vec3 rotY(vec3 p, vec3 o, float a) { vec3 q = p - o; float c = cos(a), s = sin(a); return o + vec3(q.x * c + q.z * s, q.y, -q.x * s + q.z * c); }
      vec3 rotZ(vec3 p, vec3 o, float a) { vec3 q = p - o; float c = cos(a), s = sin(a); return o + vec3(q.x * c - q.y * s, q.x * s + q.y * c, q.z); }
      ${SIAMANG_SWING_GLSL}
      // Serpentine crawl: the model's resting S travels tailward as fast as the snake moves forward
      // (the actor advances the phase by distance, in the fly slot), so each bend stays put on the
      // ground while the body flows through it. A stopped snake holds its shape. Each slice of the
      // body turns with the curve, so steep bends keep their girth.
      float slitherRest(float x) { float t = (uSlitherNose - x) / uSlitherLen; return uSlither * smoothstep(.09, .22, t) * sin(t * 6.283185); }
      // (the neck eases into the bends over a longer stretch than the resting pose, so the head leads smoothly)
      float slitherCrawl(float x, float ph) { float t = (uSlitherNose - x) / uSlitherLen; return uSlither * smoothstep(-.02, .32, t) * sin(t * 6.283185 - ph); }
      void slither(inout vec3 p, inout vec3 n, float ph) {
        if (aPart < 10.5) { p.z += slitherCrawl(p.x, ph) - slitherRest(p.x); return; } // (eyes, jaw, tongue: carried along with the head)
        float x = aPivot.x, e = uSlitherLen * .01;
        float turn = atan((slitherCrawl(x + e, ph) - slitherCrawl(x - e, ph)) / (2.0 * e)) - atan((slitherRest(x + e) - slitherRest(x - e)) / (2.0 * e));
        vec3 q = rotY(p, aPivot, -turn);
        p = vec3(q.x, q.y, q.z - aPivot.z + slitherCrawl(x, ph));
        n = rotY(n, vec3(0.0), -turn);
      }
      // Rotate lighting normals alongside each rigid part. Birds also flex the outer wing and
      // interpolate a compact resting tail into a modest flight fan; other fauna keep their poses.
      void animatePart(inout vec3 p, inout vec3 n) {
        if (aPart > 10.5) return; // (a snake's spine: see slither)
        float ph = aAnim.x, gait = aAnim.y, fly = aAnim.z;
        vec3 zero = vec3(0.0);
        bool wing = aPart > 5.5 && aPart < 7.5;
        bool tail = aPart > 4.5 && aPart < 5.5;
        if (uPrimate > 0.5 && aPart > 9.5) {
          float bite = smoothstep(0.0, 1.0, fly);
          p = mix(position, aExt, bite); n = normalize(mix(normal, aExtN, bite));
          p = mix(mix(aPivot, aExt, bite), p, step(0.01, fly));
          return;
        }
        if (wing || (tail && uBird > 0.5)) {
          p = mix(position, aExt, fly);
          n = normalize(mix(normal, aExtN, fly));
        }
        if (wing) {
          float side = aPart < 6.5 ? 1.0 : -1.0;
          float tip = smoothstep(0.58, 1.0, abs(aExt.z - aPivot.z) / uWingSpan);
          float flex = -side * uBird * fly * tip * sin(ph * uFlap - 0.65) * 0.22;
          vec3 wrist = aPivot + vec3(0.0, 0.0, side * uWingSpan * 0.58);
          p = rotX(p, wrist, flex); n = rotX(n, zero, flex);
          float beat = -side * fly * sin(ph * uFlap) * 0.75;
          p = rotX(p, aPivot, beat); n = rotX(n, zero, beat);
        } else if (aPart > 0.5 && aPart < 4.5) {
          if (uPrimate > 0.5) {
            ${motion.primate === 3 ? `if (uPrimate > 2.5) {
              if (aPart < 2.5) {
                vec3 catches = siamangWeights(ph, gait, fly);
                float catchPose = aPart < 1.5 ? catches.x : catches.y;
                p = mix(position, aSwing, catchPose); n = normalize(mix(normal, aSwingN, catchPose));
              } else {
                float swing = sin(ph + aPart) * .12 * gait;
                p = rotZ(p, aPivot, swing); n = rotZ(n, zero, swing);
              }
            } else` : ''} {
              // Long stance, short placement: one hand or foot advances at a time.
              float offset = aPart < 1.5 ? 0.0 : aPart < 2.5 ? .5 : aPart < 3.5 ? .25 : .75;
              float cycle = fract(ph / 6.283185 + offset);
              float stepT = clamp((cycle - .75) * 4.0, 0.0, 1.0);
              float stride = cycle < .75 ? .5 - cycle / .75 : -.5 + stepT;
              float weight = 1.0 - smoothstep(.04 * uLength, aPivot.y, p.y);
              p.x += stride * uLength * (uPrimate > 1.5 ? .13 : .2) * gait * weight;
              p.y += sin(stepT * 3.14159) * uLength * .06 * gait * weight;
              ${motion.canopyFeet ? `
              vec3 grip = aPart < 1.5 ? aGripA.xyz : aPart < 2.5 ? vec3(aGripA.w, aGripB.xy) : aPart < 3.5 ? vec3(aGripB.zw, aGripC.x) : aGripC.yzw;
              if (aAnim.w < -.5) {
                p = position + grip * weight;
                float t = clamp((position.y - .04 * uLength) / (aPivot.y - .04 * uLength), 0.0, 1.0);
                float derivative = -6.0 * t * (1.0 - t) / (aPivot.y - .04 * uLength);
                n.y -= derivative * dot(grip, n) / max(.2, 1.0 + grip.y * derivative);
                n = normalize(n);
              }` : ''}
            }
            if (aPart < 1.5) { float bite = smoothstep(0.0, 1.0, fly); p = mix(p, aExt, bite); n = normalize(mix(n, aExtN, bite)); }
            ${motion.primate === 2 ? `
            float crossing = clamp(aAnim.w, 0.0, 1.0);
            if (crossing > 0.0) {
              if (aPart < 2.5) {
                vec3 catches = siamangWeights(ph, 1.0, 0.0);
                float catchPose = aPart < 1.5 ? catches.x : 1.0 - catches.y;
                float reach = -.9 * (1.0 - catchPose);
                vec3 arm = rotZ(aSwing, aPivot, reach);
                vec3 armN = rotZ(aSwingN, zero, reach);
                p = mix(p, arm, crossing); n = normalize(mix(n, armN, crossing));
              } else {
                vec3 tucked = rotZ(position, aPivot, .55);
                p = mix(p, tucked, crossing);
                n = normalize(mix(n, rotZ(normal, zero, .55), crossing));
              }
            }` : ''}
          } else {
          ${motion.canopyHanging ? `if (aAnim.w < -.5) {
            vec3 grip = aPart < 1.5 ? aGripA.xyz : aPart < 2.5 ? vec3(aGripA.w, aGripB.xy) : aPart < 3.5 ? vec3(aGripB.zw, aGripC.x) : aGripC.yzw;
            float span = .94 * uLength - aPivot.y;
            float t = clamp((position.y - aPivot.y) / span, 0.0, 1.0);
            float weight = t * t * (3.0 - 2.0 * t);
            p = position + grip * weight;
            float derivative = 6.0 * t * (1.0 - t) / span;
            n.y -= derivative * dot(grip, n) / max(.2, 1.0 + grip.y * derivative);
            n = normalize(n);
          } else` : ''} {
          float off = (aPart < 1.5 || aPart > 3.5) ? 0.0 : 3.14159;
          float swing = sin(ph + off) * uLeg * gait * (1.0 - fly) - fly * 1.35;
          p = rotZ(p, aPivot, swing); n = rotZ(n, zero, swing);
          }
          }
        } else if (tail) {
          float sway = sin(ph * 0.5 + 1.3) * uTail * (0.35 + gait);
          if (uVerticalWave > 0.5) { p = rotZ(p, aPivot, sway); n = rotZ(n, zero, sway); }
          else { p = rotY(p, aPivot, sway); n = rotY(n, zero, sway); }
          float pitch = uBird * fly * sin(ph * uFlap - 0.4) * 0.045;
          p = rotZ(p, aPivot, pitch); n = rotZ(n, zero, pitch);
        } else if (aPart > 8.5 && uTongue > 0.5) {
          float flick = smoothstep(0.91, 0.99, sin(ph * 0.31));
          p = aPivot + (p - aPivot) * flick;
        } else if (aPart > 7.5) {
          ${motion.billSweep ? 'float sweep = sin(ph * 1.6) * max(0.0, aAnim.w) * .45; p = rotY(p, aPivot, sweep); n = rotY(n, zero, sweep);' : ''}
          p = rotZ(p, aPivot, -${motion.canopyFeet ? 'max(0.0, aAnim.w)' : 'aAnim.w'} * uHead); n = rotZ(n, zero, -${motion.canopyFeet ? 'max(0.0, aAnim.w)' : 'aAnim.w'} * uHead);
        }
      }
    ` + shader.vertexShader
      .replace('#include <beginnormal_vertex>', `
        vec3 objectNormal = normal;
        vec3 faunaPosition = position;
        animatePart(faunaPosition, objectNormal);
        if (uSlither > 0.0) slither(faunaPosition, objectNormal, aAnim.z);
        if (uPrimate > 2.5) objectNormal = rotZ(objectNormal, vec3(0.0), sin(aAnim.x) * .12 * aAnim.y * (1.0 - aAnim.z));
      `)
      .replace('#include <begin_vertex>', `
        float ph = aAnim.x, gait = aAnim.y, fly = aAnim.z, graze = aAnim.w;
        vec3 transformed = faunaPosition;
        if (uPrimate > 2.5) {
          transformed -= (siamangHold(siamangWeights(ph, gait, fly)) - vec3(.14, 1.38, .02)) * uLength;
          transformed = rotZ(transformed, vec3(.14, 1.38, .02) * uLength, sin(ph) * .12 * gait * (1.0 - fly));
        }
        transformed.y += abs(sin(ph)) * uBob * gait * (1.0 - fly);
        if (uWave > 0.0) {
          float t = clamp((uWaveHead - transformed.x) / uWaveLen, 0.0, 1.0);
          float wave = sin(transformed.x * uWaveK - ph * 1.4) * uWave * mix(uWaveMin, 1.0, pow(t, uWavePow)) * (uWaveRest + gait);
          transformed.y += wave * uVerticalWave;
          transformed.z += wave * (1.0 - uVerticalWave);
          // a swimmer turning curves its body into the turn (the anim's last slot carries how hard)
          if (uBend > 0.0) transformed.z += graze * uBend * t * t;
        }
      `);
  };
  mat.customProgramCacheKey = () => `fauna:${motion.canopyHanging ? 'hanging-grips' : motion.canopyFeet ? 'grips' : motion.primate === 3 ? 'swing' : motion.primate === 2 ? 'orangutan-swing' : 'base'}${motion.billSweep ? ':bill-sweep' : ''}`;
  return mat;
}
