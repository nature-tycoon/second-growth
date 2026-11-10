// "Look through" for the selected animal: trees, shrubs and buildings standing between the
// camera and the animal part like a gap in the canopy, so it stays visible behind cover and the
// view reads as peering down into the forest rather than through a hole punched in it:
//  - the edge is ragged, following leaf clumps (world-space noise) instead of a clean circle,
//    and the leaves along it stir with the wind;
//  - it is sized from the animal's outline on screen (its model's box, projected): a vole or a wren
//    gets a small gap, an elephant a wide one, so grass round a small animal and the crown round a
//    perched bird aren't cleared away;
//  - the opening flares toward the camera, a funnel, so the canopy layers step back one behind
//    another down to the animal (not at eye level, where the cover is right in front of the lens);
//  - foliage lining the funnel is shaded, darker the deeper it sits, like the inside of a crown;
//    the ground, animal and surrounding landscape keep their normal light;
//  - shrubs, groundcover and litter on the floor stay, whole, where they show below the animal's
//    feet or beside it on screen, so the floor of the gap isn't bare;
//  - a tree trunk (or snag, stump, post) standing clear to the left or right of the animal on
//    screen stays too, so the forest around it doesn't read as cleared;
//  - the animal's support stays, for every species on every map: near the animal only what covers
//    its body (an ellipsoid fitted to its model's box) opens, so the fronds round a monkey on a
//    palm or the coral beside a fish stay; the gap opens only through cover in front of it; the trunk it clings to stays unless it's round the back of it; and whatever lies below
//    its feet near it and shows below it on screen (the crown it sits on, the coral a fish swims
//    over) stays whole.
// It opens and closes by growing and shrinking, and follows the animal smoothly (see
// Renderer.updateFocus). Only what sits in front of the animal along the line of sight is
// affected, and only while an animal is selected. Fragments are discarded (a crisp edge, no
// dithering), so there is no transparency to depth-sort.

import * as THREE from 'three';

export const focus = {
  uFocus: { value: new THREE.Vector3() },   // the selected animal, in world space
  uFocusAmt: { value: 0 },                  // 0 = off, 1 = fully see-through
  uFocusR: { value: 0.9 },                  // radius of the gap at the animal: its outline on screen (scene units)
  uFocusC: { value: new THREE.Vector3() },  // the outline's centre, offset from uFocus across the screen
  uFocusBoxM: { value: new THREE.Matrix4() }, // world to the animal model's own frame
  uFocusBodyC: { value: new THREE.Vector3() }, // its body, as an ellipsoid in that frame: centre
  uFocusBodyH: { value: new THREE.Vector3(.3, .3, .3) }, // and half-lengths
  uFocusFlare: { value: 0.12 },             // how much wider the gap gets per unit toward the camera
  uViewDir: { value: new THREE.Vector3(0, 1, 0) }, // from the scene toward the camera
  uCamUp: { value: new THREE.Vector3(0, 1, 0) },   // up on screen, in world space
  uFocusFoot: { value: 0 },                 // the height of the animal's feet
  uFocusHalfW: { value: 0.3 },              // half the animal's size across the screen, at most
  uFocusBottom: { value: -0.3 },            // bottom of the body in camera-up coordinates
  uFocusBack: { value: -0.08 },             // rear of the body along the view ray
  uFocusFront: { value: 0.3 },              // front of the body along the view ray
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
    shader.fragmentShader = 'uniform vec3 uFocus; uniform float uFocusAmt; uniform float uFocusR; uniform vec3 uViewDir; uniform vec3 uCamUp; uniform float uFocusFoot; uniform float uFocusHalfW; uniform float uFocusBottom; uniform float uFocusBack; uniform float uFocusFront; uniform vec3 uFocusC; uniform mat4 uFocusBoxM; uniform vec3 uFocusBodyC; uniform vec3 uFocusBodyH; uniform float uFocusFlare; uniform vec3 uFocusTrunk; uniform float uFocusInvD; varying vec3 vFocusW; varying vec3 vFocusBase; varying float vFocusS;\n' + FOCUS_NOISE +
      shader.fragmentShader.replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
      float focusWall = 0.0;
      if (uFocusAmt > 0.001) {
        vec3 fd = vFocusW - uFocus;
        float along = dot(fd, uViewDir);                 // > 0: between the animal and the camera
        // distance from the line of sight, as it shows on screen at the animal's depth (at eye level
        // what is nearer the lens shows farther out)
        vec3 sp = (fd - along * uViewDir) / max(1.0 - along * uFocusInvD, 0.05) - uFocusC;
        float across = length(sp);
        float wall = max(uFocusR, 0.6);                  // (the scale of the gap's shaded walls)
        float up = along / wall;
        // a funnel: the animal's outline at its depth, narrower beside it, wider toward the camera
        float r = uFocusAmt * (uFocusR + uFocusFlare * max(along, 0.0)); // (the window irises open)
        // a ragged edge that follows leaf clumps, at two scales
        float n = focusNoise(vFocusW * 2.6) * 0.62 + focusNoise(vFocusW * 6.3 + 11.0) * 0.38;
        r *= 0.8 + 0.4 * n;
        // the animal's support (whatever is below its feet near it and shows below its body on
        // screen: the crown, branch, coral or rock it is on) stays, so it never stands on nothing
        bool keep = vFocusW.y <= uFocusFoot + 0.02 && dot(fd, uCamUp) < uFocusBottom${supportCrown ? '' : ' && length(fd.xz) < 1.5 * wall'};
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
          && length((vFocusW - vFocusBase).xz) < ${(side * 1.6).toFixed(2)} * vFocusS;` : ''}
        // what covers the body opens: the line from here away from the camera passes through it, as
        // an ellipsoid in its model's frame (round on screen: a box would cut a box-shaped hole in the
        // grass round a small animal). Around it a gap like a clearing that widens slowly, over two
        // wall widths past its front, so it opens wide only through cover nearer the camera and what
        // stands beside the animal (its support, the grass round its feet) stays
        vec3 bo = ((uFocusBoxM * vec4(vFocusW, 1.0)).xyz - uFocusBodyC) / uFocusBodyH, bv = (uFocusBoxM * vec4(uViewDir, 0.0)).xyz / uFocusBodyH;
        float ba = dot(bv, bv), bb = dot(bo, bv), bdisc = bb * bb - ba * (dot(bo, bo) - uFocusAmt * uFocusAmt);
        bool covers = bdisc >= 0.0 && bb + sqrt(max(bdisc, 0.0)) > 0.0;
        float open = r * smoothstep(uFocusFront * 0.5, uFocusFront + 2.0 * wall, along);
        if (!keep && (covers || across < open)) discard;
        // the walls of the gap: what still stands near the edge, above the animal, falls into shade,
        // deepest low down by the animal and easing off toward the open top of the funnel
        float edge = 1.0 - smoothstep(0.0, 0.8 * wall, across - r);
        float above = smoothstep(0.2, 0.75, (vFocusW.y - uFocus.y) / wall) * step(-0.3 * wall, along);
        float deep = 1.0 - 0.3 * smoothstep(0.5, 3.5, up);
        focusWall = edge * above * deep * uFocusAmt;
      }`).replace('#include <dithering_fragment>', `#include <dithering_fragment>
      gl_FragColor.rgb *= mix(vec3(1.0), vec3(0.3, 0.38, 0.36), focusWall);`);
  };
  mat.customProgramCacheKey = () => baseKey + '|focus' + keep + (supportCrown ? '|support-crown' : '') + (side ? '|side' + side : '');
  return mat;
}
