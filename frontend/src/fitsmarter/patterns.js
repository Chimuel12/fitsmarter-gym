// FitSmarter: how the body looks, drawn by the GPU. Every point of the skin carries the level of
// the muscle it belongs to (aTier, or the overall level where no muscle is), so each muscle wears
// its own level's look: gold is liquid metal, Diamond chrome scales that sparkle, Emerald dark skin
// with glowing circuits and lightning, Champion purple with raised leaf veins, Ruby an inner glow,
// Olympian veined marble. Where two zones meet (aSeam) the skin dips into a groove with a line of
// light in the level's colour: the muscles look carved and the change of level glows.
// No images: the patterns come from the point's position on the body, so they wrap any shape.
import * as THREE from 'three'

export const clock = { value: 0 }
// How carved the abs and chest look, 0 to 1, from the abs' level.
export const definition = { value: 0 }
// The change of level: a band of light sweeping over the body (height in metres, far away when idle)
// and its colour, the new level's.
export const scan = { value: -10 }
export const scanColor = { value: new THREE.Color(1, 1, 1) }

const COMMON = /* glsl */`
varying vec3 vFsPos;
varying vec2 vMR;
varying float vTier;
varying float vSeam;
uniform float uFsTime;
uniform float uFsDef;
uniform float uFsScan;
uniform vec3 uFsScanCol;
float fsHash(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float fsNoise(vec3 x){ vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(fsHash(i), fsHash(i + vec3(1,0,0)), f.x), mix(fsHash(i + vec3(0,1,0)), fsHash(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(fsHash(i + vec3(0,0,1)), fsHash(i + vec3(1,0,1)), f.x), mix(fsHash(i + vec3(0,1,1)), fsHash(i + vec3(1,1,1)), f.x), f.y), f.z); }
float fsFbm(vec3 p){ float a = 0.5, s = 0.0; for (int i = 0; i < 4; i++) { s += a * fsNoise(p); p *= 2.03; a *= 0.5; } return s; }
// Voronoi: x = distance to the cell edge, y = cell id, z = distance to the cell centre
vec3 fsCells(vec3 p){ vec3 i = floor(p), f = fract(p); float d1 = 8.0, d2 = 8.0, id = 0.0;
  for (int z = -1; z <= 1; z++) for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
    vec3 g = vec3(x, y, z), o = vec3(fsHash(i + g), fsHash(i + g + 7.1), fsHash(i + g + 13.7));
    float d = length(g + o - f); if (d < d1) { d2 = d1; d1 = d; id = fsHash(i + g + 3.3); } else if (d < d2) d2 = d; }
  return vec3(d2 - d1, id, d1); }
// how much a point is of a given level (levels: 0 iron … 4 ruby, 5 emerald, 6 diamond, 7 champion, 8 symmetric, 9 olympian)
float fsIs(float lv){ return 1.0 - smoothstep(0.35, 0.65, abs(vTier - lv)); }
vec3 fsGlowCol(float t){
  return t > 8.5 ? vec3(1.0, 0.86, 0.55) : t > 7.5 ? vec3(0.55, 0.75, 1.0) : t > 6.5 ? vec3(0.72, 0.45, 1.0)
       : t > 5.5 ? vec3(0.75, 0.92, 1.0) : t > 4.5 ? vec3(0.3, 1.0, 0.45) : t > 3.5 ? vec3(1.0, 0.2, 0.3)
       : t > 2.5 ? vec3(1.0, 0.78, 0.3) : t > 1.5 ? vec3(0.85, 0.9, 1.0) : t > 0.5 ? vec3(1.0, 0.6, 0.35) : vec3(0.5, 0.65, 0.9); }
`

// Colour and the surface height for the relief, computed once per pixel.
const LOOK = /* glsl */`
  vec3 fsP = vFsPos;
  float fsH = 0.0;
  vec3 fsGlow = vec3(0.0);
  float kE = fsIs(5.0), kD = fsIs(6.0), kC = fsIs(7.0), kR = fsIs(4.0), kO = fsIs(9.0), kG = fsIs(3.0);
  // Diamond: chrome scales, each a little dome, some glinting
  if (kD > 0.0) {
    vec3 cl = fsCells(fsP * 150.0);
    float dome = 1.0 - smoothstep(0.0, 0.55, cl.z);
    fsH += kD * dome * 0.0016;
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.78, 0.82, 0.9) * (0.75 + 0.35 * cl.y), kD);
    float glint = step(0.965, cl.y) * (0.5 + 0.5 * sin(uFsTime * 5.0 + cl.y * 60.0));
    fsGlow += kD * (vec3(0.9, 0.95, 1.0) * glint * 1.6 + vec3(0.6, 0.8, 1.0) * smoothstep(0.08, 0.0, cl.x) * 0.12);
  }
  // Emerald: dark skin, glowing circuit traces, pads and lightning
  if (kE > 0.0) {
    vec3 q = fsP * 46.0, c = floor(q), f = fract(q); float r = fsHash(c);
    float lx = smoothstep(0.07, 0.0, abs(f.x - 0.5)) * step(0.5, r), ly = smoothstep(0.07, 0.0, abs(f.y - 0.5)) * step(r, 0.5);
    float pad = smoothstep(0.17, 0.08, length(f.xy - 0.5)) * step(0.85, fsHash(c + 5.0));
    float trace = max(max(lx, ly), pad) * step(0.38, fsNoise(fsP * 9.0));
    float bolt = smoothstep(0.012, 0.0, abs(fsFbm(fsP * vec3(14.0, 5.0, 14.0) + uFsTime * 0.12) - 0.5)) * step(0.6, fsNoise(fsP * 4.0));
    float pulse = 0.55 + 0.45 * sin(uFsTime * 3.0 + fsHash(c + 2.0) * 6.28 + fsP.y * 14.0);
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.004, 0.03, 0.014) * (0.6 + 0.8 * fsNoise(fsP * 30.0)), kE);
    fsH += kE * trace * 0.0008;
    fsGlow += kE * (vec3(0.2, 1.0, 0.3) * trace * pulse * 1.8 + vec3(0.55, 1.0, 0.25) * bolt * 2.0);
  }
  // Champion: purple skin with raised veins like leaves, flowing down the limbs
  if (kC > 0.0) {
    vec3 w = fsP * vec3(42.0, 20.0, 42.0) + vec3(fsFbm(fsP * 9.0), fsFbm(fsP * 9.0 + 3.1), fsFbm(fsP * 9.0 + 5.7)) * 3.5;
    float v = 1.0 - abs(fsNoise(w) * 2.0 - 1.0);
    float vein = smoothstep(0.955, 0.992, v), crease = smoothstep(0.9, 0.955, v) - vein;
    fsH += kC * (vein * 0.0022 - crease * 0.0008);
    vec3 base = vec3(0.1, 0.04, 0.2) * (0.75 + 0.45 * fsNoise(fsP * 40.0));
    diffuseColor.rgb = mix(diffuseColor.rgb, mix(base * (1.0 - 0.5 * crease), vec3(0.58, 0.45, 0.85), vein), kC);
  }
  // Ruby: an inner glow in thin veins
  if (kR > 0.0) {
    float v = 1.0 - abs(fsFbm(fsP * 14.0) * 2.0 - 1.0);
    fsGlow += kR * vec3(1.0, 0.08, 0.15) * smoothstep(0.86, 1.0, v) * (0.75 + 0.25 * sin(uFsTime * 2.0));
  }
  // Olympian: white marble with soft clouds and grey veins
  if (kO > 0.0) {
    vec3 w = fsP * 7.0 + fsFbm(fsP * 5.0) * 2.5;
    float v = abs(sin(w.x * 3.0 + w.y * 2.0 + w.z * 4.0));
    diffuseColor.rgb *= mix(1.0, mix(0.76, 1.0, smoothstep(0.0, 0.08, v)) * (0.94 + 0.06 * fsFbm(fsP * 18.0)), kO);
  }
  // the groove between two zones, and its line of light (brighter for higher levels)
  float seam = smoothstep(0.25, 0.9, vSeam);
  // under the chest the pec's own curved edge (RELIEF) draws the line, not a straight band
  seam *= 1.0 - 0.8 * step(0.0, fsP.z) * smoothstep(1.13, 1.17, fsP.y) * (1.0 - smoothstep(1.29, 1.33, fsP.y)) * (1.0 - smoothstep(0.17, 0.21, abs(fsP.x)));
  fsH -= seam * 0.0045 * (0.6 + 0.4 * uFsDef);
  // only the very bottom of the groove lights up: a thin line of the level's colour
  float line = smoothstep(0.86, 0.99, vSeam);
  fsGlow += fsGlowCol(vTier) * line * (0.18 + 0.07 * max(vTier, 0.0)) * (0.8 + 0.2 * sin(uFsTime * 2.5 + fsP.y * 20.0));
  diffuseColor.rgb *= 1.0 - seam * 0.35;
  // the change of level: a bright ring and a fading trail of light lines behind it
  float sd = fsP.y - uFsScan;
  float ring = exp(-sd * sd / 0.0012);
  float trail = exp(-abs(sd) / 0.18) * smoothstep(0.6, 0.95, sin(fsP.y * 260.0));
  fsGlow += uFsScanCol * (ring * 4.0 + trail * 1.1);
`

// Muscle definition as relief on the front of the torso: six abs, the chest line, the obliques.
const RELIEF = /* glsl */`
{
  vec3 q = vFsPos; float ax = abs(q.x);
  if (q.z > -0.06 && q.y > 0.95 && q.y < 1.34) {
    float halfW = 0.064 - (1.21 - q.y) * 0.05;
    float col = smoothstep(0.0, 0.03, halfW - ax) * smoothstep(0.0, 0.016, ax - 0.002);
    float g1 = smoothstep(0.0, 0.022, abs(q.y - 1.212)), g2 = smoothstep(0.0, 0.02, abs(q.y - 1.14));
    float g3 = smoothstep(0.0, 0.02, abs(q.y - 1.07)), g4 = smoothstep(0.0, 0.03, abs(q.y - 0.99));
    float absH = col * g1 * g2 * g3 * g4 * smoothstep(0.96, 0.99, q.y) * (1.0 - smoothstep(1.21, 1.23, q.y));
    float pecLine = 1.0 - smoothstep(0.0, 0.016, abs(q.y - (1.245 + 0.9 * q.x * q.x)));
    float obl = 1.0 - smoothstep(0.0, 0.012, abs(ax - (0.085 + 0.06 * (1.18 - q.y))));
    fsH += (absH * 0.008 - pecLine * 0.005 * step(ax, 0.17) - obl * 0.0035 * step(q.y, 1.2) * step(0.98, q.y)) * uFsDef;
  }
  // Greek-statue anatomy: Apollo's belt (the V from the hips to the groin) and the serratus fingers
  if (q.z > -0.02 && q.y > 0.84 && q.y < 1.26) {
    float belt = 1.0 - smoothstep(0.0, 0.014, abs(ax - 0.03 - (q.y - 0.86) * 0.9));
    belt *= smoothstep(0.86, 0.9, q.y) * (1.0 - smoothstep(0.98, 1.01, q.y));
    float serr = smoothstep(0.55, 0.95, sin((q.y + ax * 0.7) * 120.0)) * smoothstep(0.115, 0.13, ax) * (1.0 - smoothstep(0.155, 0.17, ax))
               * smoothstep(1.1, 1.13, q.y) * (1.0 - smoothstep(1.22, 1.25, q.y));
    fsH += (-belt * 0.006 + serr * 0.0025) * uFsDef;
  }
  vec3 sx = dFdx(-vViewPosition), sy = dFdy(-vViewPosition);
  vec3 r1 = cross(sy, normal), r2 = cross(normal, sx);
  float det = dot(sx, r1);
  vec3 grad = sign(det) * (dFdx(fsH) * r1 + dFdy(fsH) * r2);
  normal = normalize(abs(det) * normal - grad);
}
`

/** The body's material: per-point level look, relief, grooves and glow. */
export function withPattern(mat) {
  mat.onBeforeCompile = shader => {
    shader.uniforms.uFsTime = clock
    shader.uniforms.uFsDef = definition
    shader.uniforms.uFsScan = scan
    shader.uniforms.uFsScanCol = scanColor
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vFsPos;\nattribute vec2 aMR;\nvarying vec2 vMR;\nattribute float aTier;\nvarying float vTier;\nattribute float aSeam;\nvarying float vSeam;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvMR = aMR; vTier = aTier; vSeam = aSeam;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvFsPos = (modelMatrix * vec4(transformed, 1.0)).xyz;')
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\n' + COMMON)
      .replace('#include <color_fragment>', '#include <color_fragment>\n' + LOOK)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = vMR.y;')
      .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nmetalnessFactor = vMR.x;')
      .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\n' + RELIEF)
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += fsGlow;')
  }
  mat.customProgramCacheKey = () => 'fs-body-v5'
  return mat
}
