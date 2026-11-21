// FitSmarter: surface patterns per level, drawn by the GPU from the point's position on the body
// (no images, so they wrap any shape): Emerald's glowing circuits, Diamond's crystal facets and
// light seam, Champion's raised veins, Ruby's inner glow, Olympian's marble veins.
import * as THREE from 'three'

export const clock = { value: 0 }

const NOISE = /* glsl */`
varying vec3 vFsPos;
uniform float uFsTime;
float fsHash(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float fsNoise(vec3 x){ vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(fsHash(i), fsHash(i + vec3(1,0,0)), f.x), mix(fsHash(i + vec3(0,1,0)), fsHash(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(fsHash(i + vec3(0,0,1)), fsHash(i + vec3(1,0,1)), f.x), mix(fsHash(i + vec3(0,1,1)), fsHash(i + vec3(1,1,1)), f.x), f.y), f.z); }
float fsFbm(vec3 p){ float a = 0.5, s = 0.0; for (int i = 0; i < 4; i++) { s += a * fsNoise(p); p *= 2.03; a *= 0.5; } return s; }
// distance to the nearest cell edge (Voronoi), for facets and scales
vec2 fsCells(vec3 p){ vec3 i = floor(p), f = fract(p); float d1 = 8.0, d2 = 8.0, id = 0.0;
  for (int z = -1; z <= 1; z++) for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
    vec3 g = vec3(x, y, z), o = vec3(fsHash(i + g), fsHash(i + g + 7.1), fsHash(i + g + 13.7));
    float d = length(g + o - f); if (d < d1) { d2 = d1; d1 = d; id = fsHash(i + g + 3.3); } else if (d < d2) d2 = d; }
  return vec2(d2 - d1, id); }
`

// Each kind: what it does to the colour (diffuseColor.rgb) and the glow (totalEmissiveRadiance).
const KINDS = {
  emerald: /* glsl */`
    vec3 q = vFsPos * 38.0;
    // circuit traces: thin lines on a grid that change direction cell by cell
    vec3 c = floor(q); float r = fsHash(c);
    vec3 f = fract(q);
    float lx = smoothstep(0.06, 0.0, abs(f.x - 0.5)) * step(0.5, r);
    float ly = smoothstep(0.06, 0.0, abs(f.y - 0.5)) * step(r, 0.5);
    float pad = smoothstep(0.16, 0.08, length(f.xy - 0.5)) * step(0.82, fsHash(c + 5.0));
    float trace = max(max(lx, ly), pad) * step(0.35, fsNoise(vFsPos * 9.0));
    float pulse = 0.55 + 0.45 * sin(uFsTime * 3.0 + fsHash(c + 2.0) * 6.28 + vFsPos.y * 12.0);
    diffuseColor.rgb = mix(vec3(0.003, 0.03, 0.014), diffuseColor.rgb, 0.05) * (0.6 + 0.6 * fsNoise(vFsPos * 25.0));
    totalEmissiveRadiance += vec3(0.3, 1.0, 0.4) * trace * pulse * 2.4;
  `,
  diamond: /* glsl */`
    vec2 cl = fsCells(vFsPos * 70.0);
    float edge = smoothstep(0.06, 0.0, cl.x);
    float glint = step(0.94, cl.y) * (0.5 + 0.5 * sin(uFsTime * 4.0 + cl.y * 40.0));
    diffuseColor.rgb *= 0.7 + 0.3 * cl.y;
    // a seam of light down the middle of the body, like the reference's glowing line
    float seam = smoothstep(0.006, 0.0, abs(vFsPos.x)) * step(0.9, vFsPos.y) * step(vFsPos.y, 1.5) * step(0.0, vFsPos.z);
    totalEmissiveRadiance += vec3(0.75, 0.9, 1.0) * (edge * 0.14 + glint * 1.1) + vec3(0.6, 0.85, 1.0) * seam * 2.2;
  `,
  champion: /* glsl */`
    // raised veins like leaves: ridges of a warped noise
    vec3 w = vFsPos * 24.0 + vec3(fsFbm(vFsPos * 8.0), fsFbm(vFsPos * 8.0 + 3.1), fsFbm(vFsPos * 8.0 + 5.7)) * 3.0;
    float v = 1.0 - abs(fsNoise(w) * 2.0 - 1.0);
    float vein = smoothstep(0.93, 0.99, v);
    diffuseColor.rgb = mix(vec3(0.05, 0.018, 0.11), vec3(0.5, 0.36, 0.8), vein) * (0.8 + 0.35 * fsNoise(vFsPos * 30.0));
    totalEmissiveRadiance += vec3(0.25, 0.12, 0.45) * vein * 0.35;
  `,
  ruby: /* glsl */`
    float v = 1.0 - abs(fsFbm(vFsPos * 12.0) * 2.0 - 1.0);
    totalEmissiveRadiance += vec3(0.9, 0.05, 0.12) * smoothstep(0.85, 1.0, v) * (0.7 + 0.3 * sin(uFsTime * 2.0));
  `,
  olympian: /* glsl */`
    // marble: soft clouds and thin grey veins
    vec3 w = vFsPos * 7.0 + fsFbm(vFsPos * 5.0) * 2.5;
    float v = abs(sin(w.x * 3.0 + w.y * 2.0 + w.z * 4.0));
    diffuseColor.rgb *= mix(0.78, 1.0, smoothstep(0.0, 0.08, v)) * (0.94 + 0.06 * fsFbm(vFsPos * 18.0));
  `,
}

/** Give a material the pattern of a level (no-op for levels without one). */
export function withPattern(mat, kind) {
  const body = KINDS[kind]
  if (!body) return mat
  mat.onBeforeCompile = shader => {
    shader.uniforms.uFsTime = clock
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vFsPos;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvFsPos = (modelMatrix * vec4(transformed, 1.0)).xyz;')
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\n' + NOISE)
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n{' + body + '}')
  }
  mat.customProgramCacheKey = () => 'fs-' + kind
  return mat
}
