// "Look through" for the selected animal. Near the animal nothing is cut: it is drawn once more over
// everything, faintly, so what hides it (the leaves of the bush or crown it is in, the grass round
// it) stays whole and it shows through (look-through.js). Any cut there, whether a box, an ellipsoid
// fitted to the body or a jagged circle, showed as that shape round it (Cole, 2026-11-11). Only
// cover well nearer the camera parts, like a gap in the canopy, so the view reads as peering down
// into the forest:
//  - it is depth-based: foliage opens only from a quarter of the way toward the camera (of the way
//    to the eye at eye level, of four window radii from above), wider the nearer it is, with a
//    soft rim of leaf clumps thinning out, and a ragged edge that follows leaf clumps (world-space
//    noise) and stirs with the wind. The canopy layers step back one behind another down to the
//    animal, and at eye level a bush right in front of the lens parts the same way;
//  - foliage lining the funnel is shaded, darker the deeper it sits, like the inside of a crown;
//    the ground, animal and surrounding landscape keep their normal light;
//  - shrubs, groundcover and litter on the floor stay, whole, where they show below the animal's
//    feet or beside it on screen, so the floor of the gap isn't bare;
//  - tree trunks (and snags, stumps, posts) are never opened: one in front of the animal stays in
//    front of it (seen through only close by), and the forest doesn't read as cleared;
//  - the animal's support stays, for every species on every map: the trunk it clings to unless
//    it's round the back of it, and whatever lies below its feet near it and shows below it on
//    screen (the crown it sits on, the coral a fish swims over).
// It opens and closes by growing and shrinking, and follows the animal smoothly (see
// Renderer.updateFocus). Only what sits in front of the animal along the line of sight is
// affected, and only while an animal is selected. Fragments are discarded (the soft rim is
// leaf-sized specks thinning out), so there is no transparency to depth-sort.

import * as THREE from 'three';

export const focus = {
  uFocus: { value: new THREE.Vector3() },   // the selected animal, in world space
  uFocusAmt: { value: 0 },                  // 0 = off, 1 = fully see-through
  uFocusR: { value: 0.9 },                  // radius of the see-through column (scene units)
  uViewDir: { value: new THREE.Vector3(0, 1, 0) }, // from the scene toward the camera
  uCamUp: { value: new THREE.Vector3(0, 1, 0) },   // up on screen, in world space
  uFocusFoot: { value: 0 },                 // the height of the animal's feet
  uFocusHalfW: { value: 0.3 },              // half the animal's size across the screen, at most
  uFocusBottom: { value: -0.3 },            // bottom of the body in camera-up coordinates
  uFocusBack: { value: -0.08 },             // rear of the body along the view ray
  uFocusFront: { value: 0.3 },              // front of the body along the view ray
  uFocusTrunk: { value: new THREE.Vector3(0, 0, -1) }, // x, z, radius of the trunk it clings to; radius < 0: none
  uFocusBodyR: { value: 0.3 },              // half the animal's size across the screen, at its depth: the gap's core
  uLookD: { value: 0.5 },                   // how far in front of the animal cover is seen through, not opened (look-through.js)
  uFocusInvD: { value: 0 },                 // 1 / distance from the animal to the eye at eye level; 0 from above
};

const FOCUS_NOISE = `
float focusHash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float focusNoise(vec3 x) {
  vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(focusHash(i), focusHash(i + vec3(1, 0, 0)), f.x), mix(focusHash(i + vec3(0, 1, 0)), focusHash(i + vec3(1, 1, 0)), f.x), f.y),
             mix(mix(focusHash(i + vec3(0, 0, 1)), focusHash(i + vec3(1, 0, 1)), f.x), mix(focusHash(i + vec3(0, 1, 1)), focusHash(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}
// how far beside the animal on screen (left or right) something at offset d from it shows, less its
// own reach, measured at the animal's depth: at eye level what is nearer the lens shows farther out
float focusSide(vec3 d, float reach) {
  float a = dot(d, uViewDir); vec3 p = d - a * uViewDir;
  return (length(p - dot(p, uCamUp) * uCamUp) - reach) / max(1.0 - a * uFocusInvD, 0.05);
}
`;

// keep: for shrubs, groundcover and floor litter, about how far one plant reaches (scene units at
// scale 1). Each one stays whole in the window when all of it shows below the animal's feet or
// off to its side on screen (see above). Trees and buildings (no keep) open fully: keeping part of
// one would leave a sliced-off skirt behind.
// side: for trunks, about their radius at scale 1. The trunk itself is never opened (see below).
// Its limbs, spreading off the trunk up in the crown, still open with the leaves: left standing
// bare in the gap they'd read as a dead tree.
export function withFocusFade(mat, keep = 0, { supportCrown = false, side = 0 } = {}) {
  const prev = mat.onBeforeCompile;
  const baseKey = mat.customProgramCacheKey();
  mat.onBeforeCompile = (shader, renderer) => {
    if (prev) prev.call(mat, shader, renderer);
    Object.assign(shader.uniforms, focus);
    shader.vertexShader = 'varying vec3 vFocusW; varying vec3 vFocusBase; varying float vFocusS;\n' + shader.vertexShader.replace('#include <project_vertex>', `#include <project_vertex>
      vec4 fcW = vec4(transformed, 1.0);
      #ifdef USE_INSTANCING
        fcW = instanceMatrix * fcW;
      #endif
      vFocusW = (modelMatrix * fcW).xyz;
      #ifdef USE_INSTANCING
        vFocusBase = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz; vFocusS = length(instanceMatrix[0].xyz);
      #else
        vFocusBase = (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz; vFocusS = 1.0;
      #endif`);
    shader.fragmentShader = 'uniform vec3 uFocus; uniform float uFocusAmt; uniform float uFocusR; uniform vec3 uViewDir; uniform vec3 uCamUp; uniform float uFocusFoot; uniform float uFocusHalfW; uniform float uFocusBottom; uniform float uFocusBack; uniform float uFocusFront; uniform vec3 uFocusTrunk; uniform float uFocusInvD; uniform float uFocusBodyR; uniform float uLookD; varying vec3 vFocusW; varying vec3 vFocusBase; varying float vFocusS;\n' + FOCUS_NOISE +
      shader.fragmentShader.replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
      float focusWall = 0.0;
      if (uFocusAmt > 0.001) {
        vec3 fd = vFocusW - uFocus;
        float along = dot(fd, uViewDir);                 // > 0: between the animal and the camera
        float across = length(fd - along * uViewDir);    // distance from the line of sight
        float up = along / uFocusR;
        // a funnel: narrow at the animal, wider toward the camera
        float r = uFocusR * uFocusAmt * (1.0 + 0.1 * clamp(up, 0.0, 3.0)); // (the window irises open)
        // a ragged edge that follows leaf clumps, at two scales
        float n = focusNoise(vFocusW * 2.6) * 0.62 + focusNoise(vFocusW * 6.3 + 11.0) * 0.38;
        r *= 0.8 + 0.4 * n;
        // the animal's support (whatever is below its feet near it and shows below its body on
        // screen: the crown, branch, coral or rock it is on) stays, so it never stands on nothing
        bool keep = vFocusW.y <= uFocusFoot + 0.02 && dot(fd, uCamUp) < uFocusBottom${supportCrown ? '' : ' && length(fd.xz) < 1.5 * uFocusR'};
        // and the trunk it clings to stays, unless it stands wholly in front of it (it's round the back)
        keep = keep || length(vFocusW.xz - uFocusTrunk.xy) < uFocusTrunk.z * 1.3 + 0.02 && along < uFocusFront;
        // a plant on the floor stays whole wherever all of it shows below the animal's feet or off to
        // its side on screen: there it can't cover the animal, and the floor of the gap stays alive
        ${keep ? `{
          float ext = ${keep.toFixed(2)} * vFocusS;
          vec3 bd = vFocusBase - uFocus; vec3 bp = bd - dot(bd, uViewDir) * uViewDir;
          float bu = dot(bp, uCamUp);
          bool low = vFocusBase.y - uFocusFoot < 0.4;
          keep = keep || low && (bu + ext * (uCamUp.y + 0.5) < (uFocusFoot - uFocus.y) * uCamUp.y - 0.03 || focusSide(bd, ext * 0.6) > uFocusHalfW + 0.06);
        }` : ''}
        // a trunk is never opened (near its axis): one standing in front of the animal stays in front
        // of it, close by the animal shows through it (look-through.js), and a straight cut across a
        // trunk showed as a line. Its limbs, up in the crown, still go with the leaves
        ${side ? `keep = keep || length((vFocusW - vFocusBase).xz) < ${(side * 1.1).toFixed(2)} * vFocusS;` : ''}
        // a gap only through cover farther in front of the animal than look-through.js sees through
        // (uLookD, about its size): close cover stays and the animal shows through it, farther cover
        // opens. The gap's core is the animal's outline (uFocusBodyR), so nothing farther in front
        // hides it; it widens a little more the nearer the cover is to the camera (a share of the way
        // to the eye at eye level, of four window radii from above). It is measured as it shows on
        // screen (at the animal's depth), so foliage right at the lens opens about as wide as foliage
        // halfway there, not a wall of it
        float past = smoothstep(0.6 * uLookD, uLookD, along - uFocusFront);
        float near = (along - uFocusFront) / (uFocusInvD > 0.0 ? max(0.05, 1.0 / uFocusInvD - uFocusFront) : 4.0 * uFocusR);
        float open = past * (uFocusBodyR * uFocusAmt + r * smoothstep(0.0, 0.7, near));
        float acrossS = across / max(1.0 - along * uFocusInvD, 0.05);
        // its rim is soft: just past the open core the leaves thin out, fewer the nearer the middle, by
        // leaf-sized specks fixed in the world (so they hold still as the view moves, and there is
        // still nothing to depth-sort)
        float rim = (acrossS - open) / (0.3 * open + 1e-4);
        float dither = rim > 0.0 && rim < 1.0 ? smoothstep(0.25, 0.75, focusNoise(vFocusW * 22.0 + 5.0)) : 0.5; // (only in the rim)
        if (!keep && along > uFocusBack && rim < dither) discard;
        // the walls of the gap: what still stands near the edge, above the animal, falls into shade,
        // deepest low down by the animal and easing off toward the open top of the funnel
        float edge = (1.0 - smoothstep(0.0, 0.8 * uFocusR, acrossS - open)) * past;
        float above = smoothstep(0.2, 0.75, (vFocusW.y - uFocus.y) / uFocusR) * step(-0.3 * uFocusR, along);
        float deep = 1.0 - 0.3 * smoothstep(0.5, 3.5, up);
        focusWall = edge * above * deep * uFocusAmt;
      }`).replace('#include <dithering_fragment>', `#include <dithering_fragment>
      gl_FragColor.rgb *= mix(vec3(1.0), vec3(0.3, 0.38, 0.36), focusWall);`);
  };
  mat.customProgramCacheKey = () => baseKey + '|focus' + keep + (supportCrown ? '|support-crown' : '') + (side ? '|side' + side : '');
  return mat;
}
