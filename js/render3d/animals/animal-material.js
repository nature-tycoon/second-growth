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

// Coat markings drawn per pixel (pixelCoat in model-core.js): each takes the paint coordinate u
// (along and round the body part), the model-space point p, the unmarked coat, and its coat's
// numbers (A, B) and colours. Edges are smoothed over about a pixel, and markings too fine for the
// screen fade to the coat's average tone rather than shimmer.
const COAT_GLSL = `
  float coatHash(vec3 v) { return fract(sin(dot(v, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
  // 1 inside (d below r), 0 outside, over about a pixel
  float coatIn(float d, float r) { float w = fwidth(d) * 0.7 + 1e-5; return 1.0 - smoothstep(r - w, r + w, d); }
  // 1 while a cell of the grid g spans a few pixels, 0 once it shrinks below one
  float coatDetail(float g) { return 1.0 - smoothstep(0.25, 0.6, fwidth(g)); }
  // a jittered grid's nearest point in the cell grid: its offset, and the cell
  vec2 coatJitter(vec2 g, float jitter, out vec2 cell) { cell = floor(g); return g - cell - 0.5 - (vec2(coatHash(vec3(cell, 1.0)), coatHash(vec3(cell, 2.0))) - 0.5) * jitter; }
  // cellular pattern in 3D (cells in model-core.js): the gap between the two nearest cell points, and the nearest's hash
  vec2 coatCells(vec3 p, float size) {
    vec3 q = p / size, i = floor(q);
    float d1 = 9.0, d2 = 9.0, id = 0.0;
    for (int a = -1; a <= 1; a++) for (int b = -1; b <= 1; b++) for (int c = -1; c <= 1; c++) {
      vec3 k = i + vec3(float(a), float(b), float(c));
      float d = length(k + vec3(coatHash(k), coatHash(k.yzx), coatHash(k.zxy)) - q);
      if (d < d1) { d2 = d1; d1 = d; id = coatHash(k * vec3(1.3, 1.7, 2.1)); } else if (d < d2) d2 = d;
    }
    return vec2(d2 - d1, id);
  }
  // the cell grid round a body's axis: along it (cells of A.z) and round it (A.w per radian)
  vec2 coatAround(vec3 p, vec4 A) { return vec2(p.x / A.z, atan(p.z, p.y - A.x) * A.w); }
  // leopard and ocelot: rings broken into a few blotches round a warmer centre, under the belly line
  // (A: axis height, body depth, cell, cells per radian; B.x: ring width)
  vec3 coatRosettes(vec3 u, vec3 p, vec3 base, vec4 A, vec4 B, vec3 dark, vec3 mid) {
    vec2 g = coatAround(p, A), cell, dv = coatJitter(g, 0.3, cell);
    float id = coatHash(vec3(cell, 3.0)), angle = atan(dv.y, dv.x), d = length(dv) / (1.0 + sin(angle * 5.0 + id * 8.0) * 0.16);
    float outer = 0.3 + id * 0.06, inner = outer - B.x, broken = smoothstep(-0.35, -0.15, sin(angle * 4.0 + id * 11.0));
    float detail = coatDetail(g.x), body = smoothstep(-0.6, -0.5, (p.y - A.x) / A.y);
    float ring = mix(0.25, (coatIn(d, outer) - coatIn(d, inner)) * broken, detail) * body, core = mix(0.1, coatIn(d, inner), detail) * body;
    return mix(mix(base, mid, core), dark, ring);
  }
  // jaguar: bigger, wavier rosettes, many with a central dot (A: axis height, body depth, cell, cells per radian)
  vec3 coatJaguar(vec3 u, vec3 p, vec3 base, vec4 A, vec4 B, vec3 dark, vec3 mid) {
    vec2 g = coatAround(p, A), cell, dv = coatJitter(g, 0.35, cell);
    float id = coatHash(vec3(cell, 3.0)), angle = atan(dv.y, dv.x), d = length(dv) / (1.0 + sin(angle * 5.0 + id * 8.0) * 0.14);
    float broken = smoothstep(-0.9, -0.8, sin(angle * 3.0 + id * 8.0)), spot = coatIn(d, 0.075) * step(0.25, id);
    float detail = coatDetail(g.x), body = smoothstep(-0.53, -0.47, (p.y - A.x) / A.y);
    float ring = mix(0.33, max((coatIn(d, 0.39) - coatIn(d, 0.2)) * broken, spot), detail) * body;
    float core = mix(0.1, coatIn(d, 0.2) * (1.0 - spot), detail) * body;
    return mix(mix(base, mid, core), dark, ring);
  }
  // cheetah and leopard cat: solid round spots under the belly line (A as for rosettes; B.x: spot radius)
  vec3 coatDots(vec3 u, vec3 p, vec3 base, vec4 A, vec4 B, vec3 dark, vec3 mid) {
    vec2 g = coatAround(p, A), cell;
    float d = length(coatJitter(g, 0.55, cell)), body = smoothstep(-0.6, -0.5, (p.y - A.x) / A.y);
    return mix(base, dark, mix(3.14 * B.x * B.x, coatIn(d, B.x * (0.85 + coatHash(vec3(cell, 3.0)) * 0.3)), coatDetail(g.x)) * body);
  }
  // small solid spots scattered in 3D (heads and legs): the surface cuts spheres of varied depth (A: cell size)
  vec3 coatSpots(vec3 u, vec3 p, vec3 base, vec4 A, vec4 B, vec3 dark, vec3 mid) {
    vec3 g = p / A.x, cell = floor(g);
    float d = length(g - cell - 0.5 - (vec3(coatHash(cell), coatHash(cell.yzx + 4.0), coatHash(cell.zxy + 9.0)) - 0.5) * 0.3);
    return mix(base, dark, mix(0.12, coatIn(d, 0.36), coatDetail(g.x)));
  }
  // clouded leopard: black-rimmed blotches with darker fills between pale lanes, a few spots on the belly (A: cell size)
  vec3 coatClouds(vec3 u, vec3 p, vec3 base, vec4 A, vec4 B, vec3 dark, vec3 mid) {
    vec2 c = coatCells(p, A.x);
    float gap = c.x, id = c.y, detail = coatDetail(p.x / A.x * 4.0);
    float on = step(0.12, id) * (1.0 - coatIn(gap, 0.08)), rim = on * coatIn(gap, 0.2 + id * 0.08), fill = on - rim;
    vec3 flank = mix(mix(base, base * (0.6 + id * 0.15), fill), dark, rim);
    vec3 under = mix(base, dark, (1.0 - coatIn(gap, 0.42)) * step(0.4, id));
    return mix(mix(base, dark * 0.5 + base * 0.4, 0.5), mix(under, flank, smoothstep(-0.63, -0.57, u.y)), detail);
  }
  // zebra: bands round the body, bending into chevrons over the rump; mid is the belly (A: belly line)
  vec3 coatZebra(vec3 u, vec3 p, vec3 base, vec4 A, vec4 B, vec3 dark, vec3 mid) {
    float a = abs(atan(u.z, u.y)), rump = min(u.x + 0.35, 0.0) * a * 6.0;
    float band = sin(u.x * 24.0 + rump + a * 1.2 + sin(a * 4.0 + u.x * 7.0) * 0.35);
    float stripe = mix(0.45, 1.0 - coatIn(band, 0.15), coatDetail(u.x * 24.0 / 6.283));
    return mix(mid, mix(base, dark, stripe), smoothstep(A.x - 0.02, A.x + 0.02, u.y));
  }
  // giraffe: patches warm to dark between pale lanes, above pale lower legs; mid is the warm patch (A: leg length, body depth)
  vec3 coatGiraffe(vec3 u, vec3 p, vec3 base, vec4 A, vec4 B, vec3 dark, vec3 mid) {
    vec2 c = coatCells(p, A.y * 0.3);
    float marked = mix(0.75, 1.0 - coatIn(c.x, 0.12 + sin(p.y / A.y * 8.0) * 0.025), coatDetail(p.y / (A.y * 0.3) * 3.0));
    return mix(base, mix(mid, dark, c.y * 0.7), marked * smoothstep(A.x * 0.69, A.x * 0.71, p.y));
  }
  // 1 where v is above t, over about a pixel
  float coatOver(float v, float t) { return 1.0 - coatIn(v, t); }
  // tiger: narrow wavy stripes running down from the spine, many doubled into loops, tapering out
  // toward the belly, and a dark line along the spine (A: scale, axis height, stripe spacing, in the
  // builder's units)
  vec3 coatTiger(vec3 u, vec3 p, vec3 base, vec4 A, vec4 B, vec3 dark, vec3 mid) {
    float x = p.x / A.x, a = atan(abs(p.z / A.x) * 1.12, p.y / A.x - A.y); // (0 along the spine, pi under the belly)
    float ph = x / A.z + 0.45 * sin(a * 1.7 + x * 0.19) + 0.1 * sin(a * 5.1 + x * 0.7);
    float i = floor(ph), f = ph - i - 0.5, g = coatHash(vec3(i, 7.0, 1.0));
    float taper = 1.0 - smoothstep(1.2 + g * 0.6, 2.45 + g * 0.3, a), w = 0.19 * (0.75 + g * 0.5) * (0.4 + 0.6 * taper);
    float run = a * 1.3 + g * 5.0, cut = fract(run); // (a few broken off, tapering to the break)
    float whole = 1.0 - step(0.7, a) * step(coatHash(vec3(i, floor(run), 4.0)), 0.1) * smoothstep(0.0, 0.2, cut) * (1.0 - smoothstep(0.8, 1.0, cut));
    float gap = step(0.58, g) * 0.15 * smoothstep(0.45, 0.9, a) * (1.0 - smoothstep(1.5, 2.1, a)); // doubled: splitting into a loop below the spine
    float stripe = coatIn(abs(abs(f) - gap), w * mix(1.0, 0.55, smoothstep(0.03, 0.07, gap))) * smoothstep(0.0, 0.12, taper) * whole;
    stripe = mix(0.4 * w * taper, stripe, coatDetail(ph));
    return mix(mix(base, dark, coatIn(a, 0.14) * 0.35), dark, stripe);
  }
  // a tiger's legs: bars across the outside, none on the pale inside (A: scale, the leg's distance from the midline)
  vec3 coatTigerLegs(vec3 u, vec3 p, vec3 base, vec4 A, vec4 B, vec3 dark, vec3 mid) {
    float y = p.y / A.x, x = p.x / A.x, inner = (1.0 - smoothstep(-1.8, -0.6, abs(p.z / A.x) - A.y)) * smoothstep(3.0, 9.0, y);
    float ph = y / 2.1 + sin(x * 0.9) * 0.3 + x * 0.12, i = floor(ph);
    float bar = coatIn(abs(ph - i - 0.5), 0.14 * (0.7 + coatHash(vec3(i, A.y, 3.0)) * 0.6) * smoothstep(4.5, 8.0, y)) * step(0.2, coatHash(vec3(i, floor(x * 0.5), 5.0)));
    return mix(base, dark, mix(0.1, bar, coatDetail(ph)) * (1.0 - smoothstep(0.35, 0.55, inner)) * step(4.5, y));
  }
  // a tiger's face: bold stripes on the cheeks, marks on the forehead and down the nape (A: scale,
  // the head's enlargement, the skull's centre)
  vec3 coatTigerHead(vec3 u, vec3 p, vec3 base, vec4 A, vec4 B, vec3 dark, vec3 mid) {
    float qx = (p.x / A.x - 22.0) / A.y + 22.0 - A.z, qy = (p.y / A.x - 21.4) / A.y, az = abs(p.z / A.x) / A.y;
    if (qy < -2.3 && qx > -2.2) return base; // (the white chin and throat)
    float on = az > 2.4 && qy < 0.3 && qx > -2.6 ? coatOver(sin((qx * 0.75 - qy * 1.1) * 1.9 + 0.6), 0.42) * step(qx, 2.6) * step(-2.2, qy)
      : qy > 1.0 && qx > -1.6 && qy < 4.4 && az > 0.3 ? coatOver(sin(qy * 3.4 + az * 1.3 - qx * 0.45), 0.72)
      : qx < -1.2 ? coatOver(sin(qx * 2.9 + az * 0.9 + sin(qy) * 0.6), 0.78) : 0.0;
    return mix(base, dark, on);
  }
  // rings along a tail (or a tube, or across a sphere: u.x runs -1..1 along it) (A: rings along it,
  // their half width, its growth along it, where they start; B: where they end, where a solid
  // tip starts, and up to where along it they skip the underside below u.y = B.z)
  vec3 coatRings(vec3 u, vec3 p, vec3 base, vec4 A, vec4 B, vec3 dark, vec3 mid) {
    float t = u.x * 0.5 + 0.5, q = t * A.x, w = A.y + t * A.z;
    float ring = mix(2.0 * w, coatIn(abs(fract(q) - 0.5), w), coatDetail(q)) * coatOver(t, A.w) * coatIn(t, B.x);
    ring *= max(coatOver(u.y, B.z), step(B.w, t));
    return mix(base, dark, max(ring, coatOver(t, B.y)));
  }
  // dark stripes along the back, at angles round the body from the spine (u from a body ellipsoid or
  // loft): a chipmunk (A, B.xy: three dark stripes, centre and half width; B.zw: one pale one, in mid)
  vec3 coatLines(vec3 u, vec3 p, vec3 base, vec4 A, vec4 B, vec3 dark, vec3 mid) {
    float a = abs(atan(u.z, u.y)), back = coatOver(u.x, -0.85) * coatIn(u.x, 0.7) * coatOver(u.y, -0.1);
    float d = max(max(coatIn(abs(a - A.x), A.y), coatIn(abs(a - A.z), A.w)), coatIn(abs(a - B.x), B.y));
    return mix(mix(base, mid, coatIn(abs(a - B.z), B.w) * back), dark, d * back);
  }
  // a band along the flank, with the pale belly below it, laid out in model space round the body
  // (gazelle, impala) (A: axis height, body depth, half the body's length, how far below the belly
  // line the legs start; B: the band's lower and upper edge, as a fraction of the depth, and its
  // ends along the body)
  vec3 coatFlank(vec3 u, vec3 p, vec3 base, vec4 A, vec4 B, vec3 dark, vec3 mid) {
    float y = (p.y - A.x) / A.y, x = p.x / A.z, body = coatOver(y, A.w);
    float band = coatOver(y, B.x) * coatIn(y, B.y) * coatOver(x, B.z) * coatIn(x, B.w);
    return mix(mix(base, mid, coatIn(y, B.x) * body), dark, band);
  }
  // a monitor lizard: pale bands across the back and pale spots over the top, in model space so they
  // run on from body to neck, tail and legs, over a pale belly (u.y, each part's own up) (A: band
  // spacing, spot cell, 1 for no bands (the legs); dark: the pale marks, mid: the belly)
  vec3 coatMonitor(vec3 u, vec3 p, vec3 base, vec4 A, vec4 B, vec3 dark, vec3 mid) {
    float q = p.x / A.x + sin(p.z / A.x * 2.0) * 0.12, band = mix(0.2, coatIn(abs(fract(q) - 0.5), 0.1), coatDetail(q)) * coatOver(u.y, -0.3) * (1.0 - A.z);
    vec3 g = p / A.y, cell = floor(g);
    float d = length(g - cell - 0.5 - (vec3(coatHash(cell), coatHash(cell.yzx + 4.0), coatHash(cell.zxy + 9.0)) - 0.5) * 0.4);
    float spot = mix(0.08, coatIn(d, 0.3) * step(0.45, coatHash(cell * 1.7)), coatDetail(g.x)) * coatOver(u.y, 0.1);
    return mix(mix(base, dark, max(band, spot)), mid, coatIn(u.y, -0.5));
  }
  // snakes (A.x: which; A.yzw: the belly; B.xyz: the back; mid: the light markings): the garter
  // snake's stripes and red checks (0), the python's net (1), the boa's saddles (2), the rat snake's
  // blotches (3), the anaconda's spots and eyespots (4). Drawn from u (along the body, round it), so
  // the markings follow the curve; they fade to the vertex colours (the same markings, coarser) when
  // too small to see.
  float snakeBlotch(float t, float angle, float count, float center, float spread, float offset) {
    float q = t * count + offset, cell = floor(q), jitter = (coatHash(vec3(cell, count, 3.0)) - 0.5) * 0.14;
    float dx = (q - cell - 0.5 - jitter) / (0.32 + coatHash(vec3(cell, 5.0, count)) * 0.08);
    return dx * dx + pow((angle - center) / spread, 2.0);
  }
  vec3 coatSnake(vec3 u, vec3 p, vec3 base, vec4 A, vec4 B, vec3 dark, vec3 mid) {
    float t = u.x * 0.5 + 0.5, angle = atan(u.z, u.y), a = abs(angle), kind = A.x;
    vec3 belly = A.yzw, back = B.xyz, c = back;
    if (t < 0.092) { // the head: a stripe down the middle, a dark line back from the eye
      if (kind < 0.5) c = mix(c, mid, coatIn(a, 0.18));
      else if (kind < 2.5) c = mix(c, dark, coatIn(a, 0.13) * step(0.018, t));
      c = mix(c, dark, coatOver(a, 0.95) * coatIn(a, 1.5) * step(0.034, t));
      c = mix(c, belly, (1.0 - smoothstep(-0.58, -0.15, u.y)) * 0.45);
    } else {
      if (kind < 0.5) { // three unbroken yellow stripes over red flank checks
        float q = floor(t * 40.0 + floor(a * 4.0) * 0.5);
        c = mix(c, dark, step(0.55, a) * step(a, 1.65) * step(mod(q, 2.0), 0.5));
        c = mix(c, mid, max(coatIn(a, 0.17), coatIn(abs(a - 1.82), 0.13)));
      } else if (kind < 1.5) {
        float q = t * 15.0 + sin(t * 31.0) * 0.13;
        float net = min(abs(sin(3.14159 * (q + angle * 1.65))), abs(sin(3.14159 * (q - angle * 1.65))));
        c = mix(mix(mix(back, belly, step(1.1, a) * coatOver(net, 0.67)), mid, coatIn(net, 0.39)), dark, coatIn(net, 0.19));
      } else if (kind < 2.5) { // (the saddles turn rust toward the tail)
        float dx = abs(fract(t * 12.0) - 0.5), saddle = dx / (0.20 + 0.17 * smoothstep(0.15, 1.2, a)) + pow(a / 1.65, 4.0), side = snakeBlotch(t, a, 12.0, 1.78, 0.34, 0.5);
        c = mix(mix(back, dark, max(coatIn(saddle, 1.22), coatIn(side, 1.0))), t > 0.77 ? vec3(0.191, 0.07, 0.036) : mid, coatIn(saddle, 1.0));
      } else if (kind < 3.5) { // (dark is also the ground colour)
        float saddle = snakeBlotch(t, angle, 14.0, 0.0, 1.05, 0.0), side = snakeBlotch(t, a, 14.0, 1.55, 0.35, 0.5);
        c = mix(dark, mid, max(coatIn(saddle, 1.0), coatIn(side, 1.0)));
      } else {
        float spot = min(snakeBlotch(t, angle, 13.0, 0.72, 0.48, 0.0), snakeBlotch(t, angle, 13.0, -0.72, 0.48, 0.42));
        float eye = snakeBlotch(t, a, 13.0, 1.75, 0.27, 0.35);
        c = mix(mix(mix(back, mid, coatIn(eye, 1.3)), belly, coatIn(eye, 0.48)), mid, coatIn(spot, 1.0));
      }
      c = mix(c, belly, (1.0 - smoothstep(-0.58, -0.2, u.y)) * 0.45) * (0.97 + 0.03 * cos(t * 260.0 + floor(angle * 9.0) * 3.14159));
    }
    c = mix(c, belly * (0.95 + 0.05 * abs(sin(t * 220.0))), coatIn(u.y, -0.58)); // (pale belly scutes)
    return mix(base, c, coatDetail(t * 13.0));
  }
  // stripes across one coordinate, where a sine of it rises over a threshold: a barred owl's wings, a
  // hawk's tail bars, a bluegill's flank bars (A.x: which, 0 u.x, 1 u.y, 2 |u.z|; A.y: times 2 pi per
  // unit; A.z: phase; A.w: the threshold; B.x: how strongly they mark; B.y: none below this u.y)
  vec3 coatBars(vec3 u, vec3 p, vec3 base, vec4 A, vec4 B, vec3 dark, vec3 mid) {
    float q = (A.x < 0.5 ? u.x : A.x < 1.5 ? u.y : abs(u.z)) * A.y + A.z;
    float bar = mix(acos(A.w) / 3.14159, coatOver(sin(q), A.w), coatDetail(q / 6.283));
    return mix(base, dark, bar * B.x * coatOver(u.y, B.y));
  }
  // a barred owl's front: bars across the upper breast, streaks down the belly
  vec3 coatBarred(vec3 u, vec3 p, vec3 base, vec4 A, vec4 B, vec3 dark, vec3 mid) {
    float q = u.y > -0.12 ? u.y * 24.0 : u.z * 25.0;
    float bar = mix(0.39, coatOver(sin(q), 0.35), coatDetail(q / 6.283));
    return mix(base, dark, bar * coatOver(u.x, 0.05) * coatIn(u.y, 0.35));
  }
  // a hen's plumage: offset rows of feathers, each a little lighter or darker than the next, with a
  // dark centre and a pale tip toward the tail (A.x: 1 on a wing, where only the coverts are
  // mottled, not the flight feathers)
  vec3 coatMottled(vec3 u, vec3 p, vec3 base, vec4 A, vec4 B, vec3 dark, vec3 mid) {
    vec2 g = vec2(u.x * 12.0, atan(u.z, u.y) * 4.5);
    g.x += floor(g.y) * 0.5;
    vec2 cell = floor(g), f = g - cell - 0.5 - (vec2(coatHash(vec3(cell, 3.0)), coatHash(vec3(cell, 5.0))) - 0.5) * 0.2;
    float centre = coatIn(length(vec2(f.x * 0.8 - 0.06, f.y * 1.5)), 0.24), tip = coatOver(length(vec2(f.x - 0.1, f.y * 0.9)), 0.48) * coatIn(f.x, -0.1);
    float tone = mix(0.92, (0.93 + coatHash(vec3(cell, 4.0)) * 0.1) * mix(1.0, 0.62, centre) + 0.16 * tip, coatDetail(g.x) * coatDetail(g.y));
    // (on a body, fading out toward the breast's and the tail's points, where the rows all meet)
    float zone = A.x > 0.5 ? coatOver(u.x, -0.08 + abs(u.z) * 0.12) * coatIn(abs(u.z), 0.72) : 1.0 - smoothstep(0.82, 0.97, abs(u.x));
    return base * mix(1.0, tone, zone);
  }
  // a drake's body in blocks: the breast ahead of u.x = A.x in mid, freckled in dark unless A.z is 1
  // (cells of 1 / A.y, a fraction A.z of them plain), and the stern behind u.x = A.w in B.rgb
  vec3 coatDuck(vec3 u, vec3 p, vec3 base, vec4 A, vec4 B, vec3 dark, vec3 mid) {
    vec3 g = u * A.y, cell = floor(g);
    float d = length(g - cell - 0.5 - (vec3(coatHash(cell), coatHash(cell.yzx + 4.0), coatHash(cell.zxy + 9.0)) - 0.5) * 0.4);
    float fleck = mix(0.12 * (1.0 - A.z), coatIn(d, 0.33) * step(A.z, coatHash(cell * 1.7)), coatDetail(g.x));
    return mix(mix(base, mix(mid, dark, fleck), coatOver(u.x, A.x)), B.rgb, coatIn(u.x, A.w));
  }
  // a cellular pattern in 2D (cells of 1): the gap between the two nearest cell points, and the
  // nearest's hash; a third the work of coatCells
  vec2 coatCells2(vec2 q) {
    vec2 i = floor(q), nearest = i;
    float d1 = 9.0, d2 = 9.0;
    for (int a = -1; a <= 1; a++) for (int b = -1; b <= 1; b++) {
      vec2 k = i + vec2(float(a), float(b)), h = fract(sin(dot(k, vec2(127.1, 311.7))) * vec2(43758.5453, 22578.1459)); // (one sine for both)
      float d = length(k + h - q);
      if (d < d1) { d2 = d1; d1 = d; nearest = k; } else if (d < d2) d2 = d;
    }
    return vec2(d2 - d1, coatHash(vec3(nearest, 5.0)));
  }
  // plates: a tortoise's or turtle's shell, a sea turtle's scaly skin, cells A.x across in model
  // space with seams A.w wide in dark. A shell (A.y: its radius) lays them out flat over the dome, seen
  // from above (a stereographic projection of u, which keeps their shapes; as big as the 3D cells look
  // cut by a surface), skin in 3D (A.y 0). Each
  // plate's tone runs B.z + B.x * (its hash) toward mid; B.y: 1 streaks radiating from the shell's
  // middle (a sea turtle), 2 dark flecks near the seams (a leopard tortoise)
  vec3 coatScutes(vec3 u, vec3 p, vec3 base, vec4 A, vec4 B, vec3 dark, vec3 mid) {
    vec2 c = A.y > 0.0 ? coatCells2(normalize(u).xz / (1.0 + normalize(u).y) * 1.2 * A.y / A.x) : coatCells(p, A.x);
    float detail = coatDetail(p.x / A.x * 3.0);
    vec3 plate = mix(base, mid, B.z + c.y * B.x);
    if (B.y > 1.5) {
      vec3 g = p / (A.x * 0.1), cell = floor(g);
      float d = length(g - cell - 0.5 - (vec3(coatHash(cell), coatHash(cell.yzx + 4.0), coatHash(cell.zxy + 9.0)) - 0.5) * 0.3);
      plate = mix(plate, mix(dark, base, 0.35), mix(0.1, coatIn(d, 0.35) * step(0.45, coatHash(cell * 1.3)), coatDetail(g.x)) * coatIn(c.x, 0.3));
    } else if (B.y > 0.5) {
      float r = atan(p.z, p.x) * 18.0, ray = step(0.62, coatHash(vec3(floor(r + 0.5), c.y * 7.0, 2.0)));
      plate = mix(plate, mix(base, mid, 0.5), mix(0.38, ray, coatDetail(r)));
    }
    return mix(mix(mix(base, mid, B.z + 0.5 * B.x), dark, A.w * 1.5), mix(plate, dark, coatIn(c.x, A.w)), detail); // (too small to draw: the plates' average tone)
  }
  // fish, by u (u.x -1 tail .. 1 nose, u.yz round the body; A.x: which): 0 spots in dark (A.y: 1 for a
  // coho's, evenly spread), 2 a clownfish's bands (mid, edged in dark), 3 the humphead's squiggles on
  // its face (mid), 4 the blue tang's palette (dark), 5 a stripe along the flank (dark; A.y: 0 a bass's
  // ragged band, 1 a thin line, 2 widening toward the tail), 6 the hawkfish's checks (mid), 7 the
  // parrotfish's scales edged in mid, 8 a blacktip's pale flank band (mid). (Flank bars: coatBars.)
  vec3 coatFish(vec3 u, vec3 p, vec3 base, vec4 A, vec4 B, vec3 dark, vec3 mid) {
    float t = (1.0 - u.x) * 0.5, ang = atan(u.z, u.y), a = abs(ang), kind = A.x;
    if (kind < 0.5) {
      vec2 g = vec2(u.x * 13.0, ang * 3.2), cell = floor(g);
      float dens = A.y > 0.5 ? 0.95 : 0.96 - t * 0.1, on = step((dens - 0.86) * 7.0, coatHash(vec3(cell, 7.0)));
      vec2 d = g - cell - 0.5 - (vec2(coatHash(vec3(cell, 1.0)), coatHash(vec3(cell, 2.0))) - 0.5) * 0.5;
      return mix(base, dark, mix(0.08, coatIn(length(vec2(d.x, d.y * 0.8)), 0.2) * on, coatDetail(g.x)) * coatOver(u.y, -0.35));
    }
    if (kind < 2.5) {
      float e = min(min(abs(t - 0.2), abs(t - 0.5)) - 0.055, abs(t - 0.86) - 0.035);
      return mix(mix(base, dark, coatIn(e, 0.02)), mid, coatIn(e, 0.0));
    }
    if (kind < 3.5) {
      float q = u.x * 30.0 + ang * 2.0;
      return mix(base, mid, mix(0.26, coatOver(abs(sin(q)), 0.92), coatDetail(q / 3.1416)) * coatOver(u.y, -0.3) * coatIn(t, 0.35));
    }
    if (kind < 4.5) {
      float band = coatOver(t, 0.16) * coatIn(t, 0.92) * coatOver(a, 0.55) * coatIn(a, 1.6 - (t - 0.16) * 0.7);
      return mix(base, dark, band * (1.0 - coatOver(t, 0.38) * coatIn(t, 0.7) * coatIn(a, 1.05)));
    }
    if (kind < 5.5) {
      float w = A.y < 0.5 ? 0.12 + 0.06 * sin(u.x * 19.0) * sin(u.x * 7.0 + 1.0) : A.y < 1.5 ? 0.045 : 0.04 + t * 0.17;
      return mix(base, dark, coatIn(abs(u.y - 0.04), w) * coatOver(t, 0.12));
    }
    if (kind < 6.5) {
      vec2 g = vec2(u.x * 9.0, ang * 2.6), d = abs(fract(g + 0.4) - 0.5); // (distance from each line's middle)
      return mix(base, mid, mix(0.36, max(coatIn(d.x, 0.1), coatIn(d.y, 0.1)), coatDetail(g.x)) * coatOver(u.y, -0.75));
    }
    if (kind < 7.5) {
      float sx = u.x * 16.0, sa = ang * 7.0 + floor(sx) * 0.5; // (offset rows, like real scales)
      float d = length(vec2(fract(sx) - 0.5, (fract(sa) - 0.5) * 0.9));
      return mix(base, mid, 0.55 * mix(0.45, coatOver(d, 0.42), coatDetail(sx)) * coatOver(u.y, -0.6));
    }
    return mix(base, mid, 0.6 * coatIn(abs(u.y + 0.02 - u.x * 0.12), 0.07) * coatOver(u.x, -0.45) * coatIn(u.x, 0.1));
  }
  // the threadfin butterflyfish, in model space (A: size, body axis height, white.rg; B: white.b,
  // yellow): a black bar through the eye, chevrons of fine lines (mid) over the white flank, a yellow rear
  vec3 coatButterfly(vec3 u, vec3 p, vec3 base, vec4 A, vec4 B, vec3 dark, vec3 mid) {
    float bx = p.x / A.x, by = (p.y - A.y) / A.x;
    float q = (by > 0.02 - bx * 0.3 ? bx + by * 1.1 : bx - by * 1.1) * 32.0;
    vec3 c = mix(vec3(A.zw, B.x), mid, mix(0.29, coatOver(abs(sin(q)), 0.9), coatDetail(q / 3.1416)) * coatIn(bx, 0.19));
    c = mix(c, B.yzw, coatIn(bx - by * 0.25, -0.19));
    return mix(c, dark, coatOver(bx, 0.19) * coatIn(bx, 0.255) * coatOver(by, -0.2));
  }
  // the Moorish idol, in model space (A: size, body axis height, white.rg; B: white.b, orange): two
  // broad black bands (dark), yellow (mid) on the tail stock and low behind the first band, an orange
  // saddle over the snout
  vec3 coatIdol(vec3 u, vec3 p, vec3 base, vec4 A, vec4 B, vec3 dark, vec3 mid) {
    float bx = p.x / A.x, by = (p.y - A.y) / A.x;
    vec3 c = mix(vec3(A.zw, B.x), mid, max(coatIn(bx, -0.27), coatIn(by, -0.06 - (bx + 0.12) * 0.5) * coatIn(bx, 0.07)));
    c = mix(c, dark, max(coatOver(bx, 0.07) * coatIn(bx, 0.21), coatOver(bx, -0.27) * coatIn(bx, -0.12)));
    return mix(c, B.yzw, coatOver(bx, 0.25) * coatIn(bx, 0.32) * coatOver(by, -0.01 + (bx - 0.25) * 0.6));
  }
  // a crocodilian's armour: rows of scutes (dark) across and along the back, over a pale belly (B.rgb)
  // (A: length, body axis height, 1 for a gharial's dark crossbands (mid), 1 on the tail, ringed by
  // the model's x and its angle round the tail, where the body uses u)
  vec3 coatCaiman(vec3 u, vec3 p, vec3 base, vec4 A, vec4 B, vec3 dark, vec3 mid) {
    float along = p.x / (A.x * 0.27) * 30.0, ring = (A.w > 0.5 ? atan(p.z, p.y - A.y) : atan(u.z, u.y)) * 6.0;
    float belly = A.w > 0.5 ? 0.0 : coatIn(u.y, -0.35);
    float scute = mix(0.32, max(coatIn(abs(sin(along)), 0.3), coatIn(abs(sin(ring)), 0.25)), coatDetail(along / 3.1416)) * (1.0 - belly);
    float q = p.x * 6.2832 / (A.x * 0.075), band = mix(0.35, coatOver(sin(q), 0.45), coatDetail(q / 6.2832));
    vec3 c = mix(mix(base, dark, scute), B.rgb, belly);
    return mix(c, mid, 0.75 * A.z * band * coatIn(p.x, A.x * 0.2) * coatOver(p.y, A.y - A.x * 0.02));
  }
`;
const COAT_FN = {
  rosettes: 'coatRosettes', jaguar: 'coatJaguar', spots: 'coatSpots', dots: 'coatDots', clouds: 'coatClouds', zebra: 'coatZebra', giraffe: 'coatGiraffe',
  tiger: 'coatTiger', tigerLegs: 'coatTigerLegs', tigerHead: 'coatTigerHead', rings: 'coatRings', lines: 'coatLines', flank: 'coatFlank', snake: 'coatSnake', monitor: 'coatMonitor',
  bars: 'coatBars', barred: 'coatBarred', mottled: 'coatMottled', duck: 'coatDuck', scutes: 'coatScutes', fish: 'coatFish', butterfly: 'coatButterfly', idol: 'coatIdol', caiman: 'coatCaiman',
};

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
  const coats = motion.coats?.length ? motion.coats : null;
  if (coats) Object.assign(u, {
    uCoatA: { value: coats.map(c => new THREE.Vector4(...[0, 1, 2, 3].map(i => c.params[i] ?? 0))) },
    uCoatB: { value: coats.map(c => new THREE.Vector4(...[4, 5, 6, 7].map(i => c.params[i] ?? 0))) },
    uCoatDark: { value: coats.map(c => new THREE.Vector3(c.dark.r, c.dark.g, c.dark.b)) },
    uCoatMid: { value: coats.map(c => new THREE.Vector3(c.mid.r, c.mid.g, c.mid.b)) },
  });
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
      ${coats ? 'attribute vec4 aCoat; varying vec4 vCoat; varying vec3 vCoatP;' : ''}
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
        ${coats ? 'vCoat = aCoat; vCoatP = position; // (the resting pose, so the markings move with the skin)' : ''}
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
    const coatHead = coats ? `varying vec4 vCoat; varying vec3 vCoatP;
      uniform vec4 uCoatA[${coats.length}], uCoatB[${coats.length}]; uniform vec3 uCoatDark[${coats.length}], uCoatMid[${coats.length}];
      ${COAT_GLSL}
      vec3 faunaCoat(vec3 base) {
        int k = int(vCoat.w + 0.5) - 1;
        ${coats.map((c, k) => `if (k == ${k}) return ${COAT_FN[c.kind]}(vCoat.xyz, vCoatP, base, uCoatA[${k}], uCoatB[${k}], uCoatDark[${k}], uCoatMid[${k}]);`).join('\n        ')}
        return base;
      }\n` : '';
    shader.fragmentShader = 'varying float vMeat; varying float vDry; varying float vLight; varying float vShine; uniform float uFur;\n' + coatHead + shader.fragmentShader
      .replace('#include <lights_lambert_pars_fragment>', FAUNA_LIGHT)
      .replace('#include <color_fragment>', `#include <color_fragment>
      ${coats ? 'if (vCoat.w > 0.5) diffuseColor.rgb = mix(diffuseColor.rgb, faunaCoat(diffuseColor.rgb), clamp((vCoat.w - floor(vCoat.w + 0.5)) * 2.2 + 1.0, 0.0, 1.0)); // (a slot a little under its number fades the markings out: Model.add, coatFade)' : ''}
      diffuseColor.rgb *= mix(vec3(1.0), vec3(0.268, 0.218, 0.164), vDry); // (the coat dulls as it dries: 0.55, 0.5, 0.44 on screen)
      diffuseColor.rgb = mix(diffuseColor.rgb, mix(vec3(0.3, 0.035, 0.03), vec3(0.07, 0.04, 0.025), vDry), vMeat);`);
  };
  mat.customProgramCacheKey = () => `fauna:${motion.canopyWalkerMotion ? 'canopy-walker-joints' : motion.canopyHanging ? 'hanging-grips' : motion.canopyFeet ? 'grips' : motion.primate === 3 ? 'swing' : motion.primate === 2 ? 'clamber' : 'base'}${motion.billSweep ? ':bill-sweep' : ''}${coats ? ':coat=' + coats.map(c => c.kind).join(',') : ''}`;
  return mat;
}
