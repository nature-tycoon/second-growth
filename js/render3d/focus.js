// "Look through" for the selected animal: trees, shrubs and buildings standing between the
// camera and the animal part like a gap in the canopy, so it stays visible behind cover and the
// view reads as peering down into the forest rather than through a hole punched in it:
//  - the edge is ragged, following leaf clumps (world-space noise) instead of a clean circle,
//    and the leaves along it stir with the wind;
//  - it is depth-based: foliage level with the animal opens only where it covers the animal's own
//    body, so the leaves beside it stay; foliage well nearer the camera opens wider, the more so the
//    nearer it is (as a share of the way to the eye at eye level), with a soft, thinning rim. The
//    canopy layers step back one behind another down to the animal, and at eye level a bush in
//    front of a small animal parts the same way;
//  - foliage lining the funnel is shaded, darker the deeper it sits, like the inside of a crown;
//    the ground, animal and surrounding landscape keep their normal light;
//  - shrubs, groundcover and litter on the floor stay, whole, where they show below the animal's
//    feet or beside it on screen, so the floor of the gap isn't bare;
//  - a tree trunk (or snag, stump, post) standing clear to the left or right of the animal on
//    screen stays too, so the forest around it doesn't read as cleared;
//  - the animal's support stays, for every species on every map: close to the animal only what
//    lies between the camera and its body (an ellipsoid fitted to its model's box) opens, so the trunk a
//    woodpecker clings to, the fronds round a monkey on a palm or the coral beside a fish stay;
//    the trunk it clings to stays unless it's round the back of it; the wider gap opens gradually,
//    only through cover nearer the camera; and whatever lies below
//    its feet near it and shows below it on screen (the crown it sits on, the coral a fish swims
//    over) stays whole.
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
  uFocusBoxM: { value: new THREE.Matrix4() }, // world to the animal model's own frame
  uFocusBodyC: { value: new THREE.Vector3() }, // its body, as an ellipsoid in that frame: centre
  uFocusBodyH: { value: new THREE.Vector3(.3, .3, .3) }, // and half-lengths
  uFocusTrunk: { value: new THREE.Vector3(0, 0, -1) }, // x, z, radius of the trunk it clings to; radius < 0: none
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
// side: for trunks, about their radius at scale 1. A trunk whose base stands clear to the animal's
// left or right on screen stays (a trunk is upright, so it keeps that offset all the way up). Its
// limbs, spreading off the trunk up in the crown, still open with the leaves: left standing bare in
// the gap they'd read as a dead tree.
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
    shader.fragmentShader = 'uniform vec3 uFocus; uniform float uFocusAmt; uniform float uFocusR; uniform vec3 uViewDir; uniform vec3 uCamUp; uniform float uFocusFoot; uniform float uFocusHalfW; uniform float uFocusBottom; uniform float uFocusBack; uniform float uFocusFront; uniform mat4 uFocusBoxM; uniform vec3 uFocusBodyC; uniform vec3 uFocusBodyH; uniform vec3 uFocusTrunk; uniform float uFocusInvD; varying vec3 vFocusW; varying vec3 vFocusBase; varying float vFocusS;\n' + FOCUS_NOISE +
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
        ${side ? `keep = keep || focusSide(vFocusBase - uFocus, ${side.toFixed(2)} * vFocusS) > uFocusHalfW + 0.06 && focusSide(fd, 0.0) > uFocusHalfW + 0.06
          && length((vFocusW - vFocusBase).xz) < ${(side * 1.6).toFixed(2)} * vFocusS;
        // and the stretch of a trunk that shows below the animal's feet on screen (it can't cover it;
        // its limbs still go with the leaves)
        keep = keep || dot(fd, uCamUp) / max(1.0 - dot(fd, uViewDir) * uFocusInvD, 0.05) < uFocusBottom - 0.03
          && length((vFocusW - vFocusBase).xz) < ${(side * 1.6).toFixed(2)} * vFocusS;` : ''}
        // what covers the body opens: the line from here away from the camera passes through it, as
        // an ellipsoid fitted to its model's box (long and low for a deer, round for a rabbit; a box
        // cut showed as a rectangle). Its edge is ragged by leaf clumps, so the cut follows the body
        // without reading as any shape. The trunk it clings to, the plant it is in or on, lie beside
        // or behind it and stay
        vec3 bo = ((uFocusBoxM * vec4(vFocusW, 1.0)).xyz - uFocusBodyC) / uFocusBodyH, bv = (uFocusBoxM * vec4(uViewDir, 0.0)).xyz / uFocusBodyH;
        float brad = uFocusAmt * (0.88 + 0.3 * n); // (it grows open with the lens)
        float ba = dot(bv, bv), bb = dot(bo, bv), bdisc = bb * bb - ba * (dot(bo, bo) - brad * brad);
        bool covers = bdisc >= 0.0 && bb + sqrt(max(bdisc, 0.0)) > 0.0;
        // and a wider gap only through cover well nearer the camera than the animal, growing with how
        // much nearer: leaves level with the animal open just where they cover its body. The nearness
        // is a share of the way from the animal to the eye at eye level, of four window radii from
        // above. The gap is measured as it shows on screen (at the animal's depth), so foliage right
        // at the lens opens about as wide as foliage halfway there, not a wall of it
        float near = (along - uFocusFront) / (uFocusInvD > 0.0 ? max(0.05, 1.0 / uFocusInvD - uFocusFront) : 4.0 * uFocusR);
        float open = r * smoothstep(0.05, 0.7, near);
        float acrossS = across / max(1.0 - along * uFocusInvD, 0.05);
        // its rim is soft: over the outer third the leaves thin out, fewer the nearer the middle, by
        // leaf-sized specks fixed in the world (so they hold still as the view moves, and there is
        // still nothing to depth-sort)
        float rim = (acrossS - 0.65 * open) / (0.35 * open + 1e-4);
        float dither = rim > 0.0 && rim < 1.0 ? smoothstep(0.25, 0.75, focusNoise(vFocusW * 22.0 + 5.0)) : 0.5; // (only in the rim)
        if (!keep && (covers || along > uFocusBack && rim < dither)) discard;
        // the walls of the gap: what still stands near the edge, above the animal, falls into shade,
        // deepest low down by the animal and easing off toward the open top of the funnel
        float edge = (1.0 - smoothstep(0.0, 0.8 * uFocusR, acrossS - open)) * smoothstep(0.05, 0.3, near);
        float above = smoothstep(0.2, 0.75, (vFocusW.y - uFocus.y) / uFocusR) * step(-0.3 * uFocusR, along);
        float deep = 1.0 - 0.3 * smoothstep(0.5, 3.5, up);
        focusWall = edge * above * deep * uFocusAmt;
      }`).replace('#include <dithering_fragment>', `#include <dithering_fragment>
      gl_FragColor.rgb *= mix(vec3(1.0), vec3(0.3, 0.38, 0.36), focusWall);`);
  };
  mat.customProgramCacheKey = () => baseKey + '|focus' + keep + (supportCrown ? '|support-crown' : '') + (side ? '|side' + side : '');
  return mat;
}
