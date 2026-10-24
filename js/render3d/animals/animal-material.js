// GPU animal animation; consumes geometry attributes and movement metadata.
import * as THREE from 'three';
import { SIAMANG_SWING_GLSL } from '../siamang-swing.js';
import { HOWLER_JOINT_GLSL } from '../howler-motion.js';

// How the sun and sky light an animal (in place of three's plain Lambert): fur and feathers let
// the light wrap a little past the edge of the lit side and catch it as a soft rim where they turn
// away from the eye (uFur: 1 for fur and feathers, less for scales and skin); creases see less
// of the sky and a little less of the sun (vLight); eyes, and more faintly horns, hooves and noses,
// catch a highlight of the sun and a glint of the sky above (vShine 2 and 1).
const FAUNA_LIGHT = `
  varying vec3 vViewPosition;
  struct LambertMaterial { vec3 diffuseColor; float specularStrength; };
  void RE_Direct_Lambert( const in IncidentLight directLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in LambertMaterial material, inout ReflectedLight reflectedLight ) {
    float dotNL = dot( geometryNormal, directLight.direction ), wrap = 0.3 * uFur;
    vec3 light = directLight.color * mix( 1.0, vLight, 0.6 );
    // (the rim is partly the hairs' own sheen, so even a black coat shows its outline against the light)
    float rim = pow( 1.0 - saturate( dot( geometryNormal, geometryViewDir ) ), 2.5 ) * saturate( dotNL + 0.5 ) * 0.55 * uFur;
    reflectedLight.directDiffuse += saturate( ( dotNL + wrap ) / ( 1.0 + wrap ) ) * light * BRDF_Lambert( material.diffuseColor );
    reflectedLight.directDiffuse += rim * light * BRDF_Lambert( mix( material.diffuseColor, vec3( 0.4 ), 0.3 ) );
    if ( vShine > 0.5 ) {
      float eye = step( 1.5, vShine );
      vec3 halfway = normalize( directLight.direction + geometryViewDir );
      reflectedLight.directDiffuse += light * mix( 0.12, 0.7, eye ) * pow( saturate( dot( geometryNormal, halfway ) ), mix( 18.0, 70.0, eye ) ) * saturate( dotNL * 4.0 );
    }
  }
  void RE_IndirectDiffuse_Lambert( const in vec3 irradiance, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in LambertMaterial material, inout ReflectedLight reflectedLight ) {
    reflectedLight.indirectDiffuse += irradiance * BRDF_Lambert( material.diffuseColor ) * vLight;
    if ( vShine > 1.5 ) {
      vec3 up = normalize( ( viewMatrix * vec4( 0.0, 1.0, 0.0, 0.0 ) ).xyz );
      reflectedLight.indirectDiffuse += irradiance * 0.12 * smoothstep( 0.55, 0.9, dot( reflect( -geometryViewDir, geometryNormal ), up ) );
    }
  }
  #define RE_Direct RE_Direct_Lambert
  #define RE_IndirectDiffuse RE_IndirectDiffuse_Lambert
`;

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
    uFur: { value: motion.fur ?? 1 },
  };
  // A kill's anatomy (render3d/carcass-decay.js carcassAnatomy), filled in the first time one of
  // this kind is drawn as a carcass: torso (spine height, belly height), each leg's hip and foot,
  // and the neck to the snout tip, so the flesh can be drawn pulling back onto the bones.
  const carcass = mat.userData.carcass = {
    uTorso: { value: new THREE.Vector2() }, uNeck: { value: new THREE.Vector3() }, uSnout: { value: new THREE.Vector3() },
    uHips: { value: Array.from({ length: 4 }, () => new THREE.Vector3()) }, uFeet: { value: Array.from({ length: 4 }, () => new THREE.Vector3()) },
  };
  Object.assign(u, carcass);
  if (motion.canopyWalkerMotion) Object.assign(u, {
    uHowlerRoots: { value: motion.howlerRoots }, uHowlerBends: { value: motion.howlerBends }, uHowlerTips: { value: motion.howlerTips },
  });
  mat.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, u);
    shader.vertexShader = `
      attribute float aPart; attribute vec3 aPivot; attribute vec3 aExt; attribute vec3 aExtN; attribute vec4 aAnim; varying float vMeat; varying float vDry; varying float vLight; varying float vShine;
      vec3 faunaNormal; // (the unit normal: the attribute's length carries crease shading and shine, see animal-surface.js)
      uniform vec2 uTorso; uniform vec3 uNeck, uSnout, uHips[4], uFeet[4];
      ${motion.primate === 3 ? 'attribute vec3 aSwing; attribute vec3 aSwingN;' : ''}
      ${motion.canopyFeet ? 'attribute vec4 aGripA; attribute vec4 aGripB; attribute vec4 aGripC;' : ''}
      ${motion.canopyWalkerMotion ? 'uniform vec3 uHowlerRoots[4], uHowlerBends[4], uHowlerTips[4];' : ''}
      uniform float uPrimate, uLength, uLeg, uBob, uTail, uFlap, uHead, uWave, uWaveK, uWaveHead, uWaveLen, uWaveMin, uWavePow, uWaveRest, uTongue, uVerticalWave, uBend, uBird, uWingSpan, uSlither, uSlitherLen, uSlitherNose;
      vec3 rotX(vec3 p, vec3 o, float a) { vec3 q = p - o; float c = cos(a), s = sin(a); return o + vec3(q.x, q.y * c - q.z * s, q.y * s + q.z * c); }
      vec3 rotY(vec3 p, vec3 o, float a) { vec3 q = p - o; float c = cos(a), s = sin(a); return o + vec3(q.x * c + q.z * s, q.y, -q.x * s + q.z * c); }
      vec3 rotZ(vec3 p, vec3 o, float a) { vec3 q = p - o; float c = cos(a), s = sin(a); return o + vec3(q.x * c - q.y * s, q.x * s + q.y * c, q.z); }
      ${SIAMANG_SWING_GLSL}
      ${motion.canopyWalkerMotion ? HOWLER_JOINT_GLSL : ''}
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
      // A kill being eaten and rotting. It never moves, so its animation phase carries its decay
      // instead (see carcassPhase in animal-pools.js): below -100000, strip, wither and dry in
      // 64 steps each, and its phase reads as 0. (No attribute of its own: canopy climbers already
      // use every vertex attribute some GPUs allow.) The torso's flesh draws back onto the spine,
      // from the belly up, baring the ribs (drawn separately, see carcass-decay.js), and shows as
      // meat (vMeat) where it has; then the legs, head and neck and tail wither onto their bones.
      float animPhase() { return aAnim.x < -99999.0 ? 0.0 : aAnim.x; }
      vec3 carcassDecay() { float c = -aAnim.x - 100000.0; return vec3(mod(c, 64.0), mod(floor(c / 64.0), 64.0), floor(c / 4096.0)) / 63.0; }
      vec3 toSegment(vec3 p, vec3 a, vec3 b) { vec3 d = b - a; return a + d * clamp(dot(p - a, d) / max(1e-4, dot(d, d)), 0.0, 1.0); }
      void decay(inout vec3 p, float strip, float wither) {
        if (aPart < 0.5) {
          float below = clamp((uTorso.x - p.y) / max(1e-3, uTorso.x - uTorso.y), 0.0, 1.0);
          float f = max(clamp(strip * 1.6 - (1.0 - below) * 0.6, 0.0, 1.0) * 0.9, wither);
          p = mix(p, vec3(p.x, uTorso.x, 0.0), f);
          vMeat = smoothstep(0.0, 0.35, f);
        } else if (aPart < 4.5) {
          int k = int(aPart + 0.5) - 1;
          vec3 h = k == 0 ? uHips[0] : k == 1 ? uHips[1] : k == 2 ? uHips[2] : uHips[3];
          vec3 f = k == 0 ? uFeet[0] : k == 1 ? uFeet[1] : k == 2 ? uFeet[2] : uFeet[3];
          p = mix(p, toSegment(p, h, f), wither); vMeat = wither * 0.7;
        } else if (aPart < 5.5) p = mix(p, aPivot, wither);
        else if (aPart > 7.5 && aPart < 10.5) { p = mix(p, toSegment(p, uNeck, uSnout), wither); vMeat = wither * 0.7; }
      }
      // Rotate lighting normals alongside each rigid part. Birds also flex the outer wing and
      // interpolate a compact resting tail into a modest flight fan; other fauna keep their poses.
      void animatePart(inout vec3 p, inout vec3 n) {
        if (aPart > 10.5) return; // (a snake's spine: see slither)
        float ph = animPhase(), gait = aAnim.y, fly = aAnim.z;
        vec3 zero = vec3(0.0);
        bool wing = aPart > 5.5 && aPart < 7.5;
        bool tail = aPart > 4.5 && aPart < 5.5;
        if (uPrimate > 0.5 && aPart > 9.5) {
          float bite = smoothstep(0.0, 1.0, fly);
          p = mix(position, aExt, bite); n = normalize(mix(faunaNormal, aExtN, bite));
          p = mix(mix(aPivot, aExt, bite), p, step(0.01, fly));
          return;
        }
        if (wing || (tail && uBird > 0.5)) {
          p = mix(position, aExt, fly);
          n = normalize(mix(faunaNormal, aExtN, fly));
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
                p = mix(position, aSwing, catchPose); n = normalize(mix(faunaNormal, aSwingN, catchPose));
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
                ${motion.canopyWalkerMotion ? 'howlerLimb(p,n,grip);' : `
                p = position + grip * weight;
                float t = clamp((position.y - .04 * uLength) / (aPivot.y - .04 * uLength), 0.0, 1.0);
                float derivative = -6.0 * t * (1.0 - t) / (aPivot.y - .04 * uLength);
                n.y -= derivative * dot(grip, n) / max(.2, 1.0 + grip.y * derivative);
                n = normalize(n);
                `}
              }` : ''}
            }
            if (aPart < 1.5) { float bite = smoothstep(0.0, 1.0, fly); p = mix(p, aExt, bite); n = normalize(mix(n, aExtN, bite)); }

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
        float faunaTag = length(normal);
        vShine = floor(faunaTag * 0.5); vLight = faunaTag - 2.0 * vShine;
        faunaNormal = normal / faunaTag;
        vec3 objectNormal = faunaNormal;
        vec3 faunaPosition = position;
        vMeat = 0.0; vDry = 0.0;
        if (aAnim.x < -99999.0) { vec3 d = carcassDecay(); vDry = d.z; decay(faunaPosition, d.x, d.y); }
        animatePart(faunaPosition, objectNormal);
        if (uSlither > 0.0) slither(faunaPosition, objectNormal, aAnim.z);
        if (uPrimate > 2.5) objectNormal = rotZ(objectNormal, vec3(0.0), sin(animPhase()) * .12 * aAnim.y * (1.0 - aAnim.z));
      `)
      .replace('#include <begin_vertex>', `
        float ph = animPhase(), gait = aAnim.y, fly = aAnim.z, graze = aAnim.w;
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
    // (red meat where a kill has been opened, drying to dark brown)
    shader.fragmentShader = 'varying float vMeat; varying float vDry; varying float vLight; varying float vShine; uniform float uFur;\n' + shader.fragmentShader
      .replace('#include <lights_lambert_pars_fragment>', FAUNA_LIGHT)
      .replace('#include <color_fragment>', `#include <color_fragment>
      diffuseColor.rgb *= mix(vec3(1.0), vec3(0.268, 0.218, 0.164), vDry); // (the coat dulls as it dries: 0.55, 0.5, 0.44 on screen)
      diffuseColor.rgb = mix(diffuseColor.rgb, mix(vec3(0.3, 0.035, 0.03), vec3(0.07, 0.04, 0.025), vDry), vMeat);`);
  };
  mat.customProgramCacheKey = () => `fauna:${motion.canopyWalkerMotion ? 'canopy-walker-joints' : motion.canopyHanging ? 'hanging-grips' : motion.canopyFeet ? 'grips' : motion.primate === 3 ? 'swing' : motion.primate === 2 ? 'clamber' : 'base'}${motion.billSweep ? ':bill-sweep' : ''}`;
  return mat;
}
