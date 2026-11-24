// FitSmarter: each level's material on the body map, as SVG paint (`url(#fsl-<tier>)`). One tile
// covers the whole figure, so a material runs continuously across every muscle: brushed iron,
// bronze, chrome silver, gold with glints, a cut ruby, emerald with glowing circuits, diamond facets
// with sparkles, Champion's purple veins, a holographic Symmetric and Olympian marble.
// Drawn once from a fixed seed and never animated (a moving paint would redraw every muscle each
// frame); the shine, glow and particles on top are separate CSS layers.
import { memo } from 'react'

const W = 800, H = 1450
function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296) }
const pick = (r, a) => a[Math.floor(r() * a.length)]

// a jittered triangle mesh over the tile: the facets of a cut stone
function facets(seed, step, colors, opacity = [0.55, 1]) {
  const r = rng(seed), cols = Math.ceil(W / step) + 1, rows = Math.ceil(H / step) + 1, pt = []
  for (let j = 0; j <= rows; j++) for (let i = 0; i <= cols; i++) pt.push([i * step + (r() - 0.5) * step * 0.7, j * step + (r() - 0.5) * step * 0.7])
  const at = (i, j) => pt[j * (cols + 1) + i], out = []
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
    const a = at(i, j), b = at(i + 1, j), c = at(i, j + 1), d = at(i + 1, j + 1)
    for (const tri of r() < 0.5 ? [[a, b, d], [a, d, c]] : [[a, b, c], [b, d, c]]) {
      out.push(<polygon key={out.length} points={tri.map(p => p.map(v => v.toFixed(1)).join(',')).join(' ')} fill={pick(r, colors)} fillOpacity={(opacity[0] + r() * (opacity[1] - opacity[0])).toFixed(2)} />)
    }
  }
  return out
}
// a four-point star
const star = (x, y, s) => `M${x} ${y - s}L${x + s * 0.22} ${y - s * 0.22}L${x + s} ${y}L${x + s * 0.22} ${y + s * 0.22}L${x} ${y + s}L${x - s * 0.22} ${y + s * 0.22}L${x - s} ${y}L${x - s * 0.22} ${y - s * 0.22}Z`
function sparkles(seed, n, size, fill) {
  const r = rng(seed)
  return Array.from({ length: n }, (_, i) => <path key={i} d={star(r() * W, r() * H, size * (0.5 + r()))} fill={fill} opacity={(0.4 + r() * 0.6).toFixed(2)} />)
}
// wandering lines: marble veins, Champion's veins
function veins(seed, n, len, stroke, width, opacity, branch = 0) {
  const r = rng(seed), out = []
  const grow = (x, y, a, steps, w, depth) => {
    let d = `M${x.toFixed(1)} ${y.toFixed(1)}`
    for (let k = 0; k < steps; k++) {
      a += (r() - 0.5) * 0.9; x += Math.cos(a) * 14; y += Math.sin(a) * 14
      d += `L${x.toFixed(1)} ${y.toFixed(1)}`
      if (depth < 2 && r() < branch) grow(x, y, a + (r() < 0.5 ? 0.8 : -0.8), Math.floor(steps / 2), w * 0.6, depth + 1)
    }
    out.push(<path key={out.length} d={d} fill="none" stroke={stroke} strokeWidth={w} strokeOpacity={opacity} strokeLinecap="round" strokeLinejoin="round" />)
  }
  for (let i = 0; i < n; i++) grow(r() * W, r() * H, r() * Math.PI * 2, len, width, 0)
  return out
}
// circuit traces: straight runs with right-angle turns and a pad at the end
function circuits(seed, n, stroke) {
  const r = rng(seed), out = []
  for (let i = 0; i < n; i++) {
    let x = Math.round(r() * W / 20) * 20, y = Math.round(r() * H / 20) * 20, d = `M${x} ${y}`, horiz = r() < 0.5
    for (let k = 0; k < 3 + Math.floor(r() * 4); k++) { const L = (1 + Math.floor(r() * 4)) * 20 * (r() < 0.5 ? -1 : 1); if (horiz) x += L; else y += L; horiz = !horiz; d += `L${x} ${y}` }
    out.push(<path key={'t' + i} d={d} fill="none" stroke={stroke} strokeWidth="2.2" strokeLinejoin="round" />, <circle key={'c' + i} cx={x} cy={y} r="4" fill={stroke} />)
  }
  return out
}
// brushed metal: fine streaks
function brushed(seed, n, color, opacity) {
  const r = rng(seed)
  return Array.from({ length: n }, (_, i) => { const y = r() * H, x = r() * W
    return <line key={i} x1={x} y1={y} x2={x + 60 + r() * 220} y2={y + (r() - 0.5) * 6} stroke={color} strokeOpacity={(opacity * (0.4 + r())).toFixed(3)} strokeWidth={(0.6 + r()).toFixed(2)} /> })
}

const grad = (id, stops, x2 = 0.35, y2 = 1) => <linearGradient id={id} gradientUnits="userSpaceOnUse" x1="0" y1="0" x2={W * x2} y2={H * y2}>
  {stops.map((c, i) => <stop key={i} offset={(i / (stops.length - 1)).toFixed(3)} stopColor={c} />)}</linearGradient>
const tile = (id, children) => <pattern id={id} patternUnits="userSpaceOnUse" x="0" y="0" width={W} height={H}>{children}</pattern>
const fill = g => <rect width={W} height={H} fill={`url(#${g})`} />

export const LookDefs = memo(function LookDefs() {
  return <svg className="fs-defs" width="0" height="0" aria-hidden="true" focusable="false"><defs>
    {grad('fslg-iron', ['#B4BBC4', '#7B828C', '#9EA5AE', '#5E646D', '#8A919B'])}
    {grad('fslg-bronze', ['#F0B67E', '#A8642F', '#D9935C', '#6E3F1E', '#C47F48', '#5A3216'], 0.5, 1)}
    {grad('fslg-silver', ['#FFFFFF', '#8B95A3', '#F4F6F9', '#5F6876', '#E6EAF0', '#7D8796', '#FFFFFF', '#6B7584', '#DDE2E9'], 0.6, 1)}
    {grad('fslg-gold', ['#FFF4B8', '#E0A90E', '#FFE27A', '#8C6200', '#F7CF4A', '#A87A06', '#FFF0A0', '#B8860B'], 0.6, 1)}
    {grad('fslg-champion', ['#5B2FB8', '#2E1466', '#7B4DFF', '#3A1F70', '#6A3FE0'])}
    {grad('fslg-olympian', ['#FFFFFF', '#F1ECE3', '#E4DCCD', '#F7F3EC', '#D8CFBF'])}
    <linearGradient id="fslg-symmetric" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2={W} y2={H * 0.6} spreadMethod="reflect">
      {['#7FE0FF', '#7F9CFF', '#C47FFF', '#FF8FD8', '#FFE08F', '#7FFFD0'].map((c, i) => <stop key={i} offset={(i / 5).toFixed(2)} stopColor={c} />)}
    </linearGradient>
    <radialGradient id="fslg-glow" gradientUnits="userSpaceOnUse" cx={W / 2} cy={H * 0.4} r={W * 0.7}><stop offset="0" stopColor="#fff" stopOpacity=".35" /><stop offset="1" stopColor="#fff" stopOpacity="0" /></radialGradient>

    {tile('fsl-iron', <>{fill('fslg-iron')}{brushed(11, 260, '#ffffff', 0.09)}{brushed(12, 160, '#000000', 0.07)}</>)}
    {tile('fsl-bronze', <>{fill('fslg-bronze')}{brushed(21, 140, '#FFE0B0', 0.08)}{veins(22, 14, 10, '#3F6B4A', 6, 0.12)}</>)}
    {tile('fsl-silver', <>{fill('fslg-silver')}{brushed(31, 120, '#ffffff', 0.12)}{sparkles(32, 18, 9, '#fff')}</>)}
    {tile('fsl-gold', <>{fill('fslg-gold')}<rect width={W} height={H} fill="url(#fslg-glow)" />{sparkles(41, 30, 11, '#FFFBEA')}</>)}
    {tile('fsl-ruby', <><rect width={W} height={H} fill="#7A0E1C" />{facets(51, 46, ['#A3162B', '#C2182F', '#E8364C', '#FF5C70', '#5E0A16', '#8E1024'])}<rect width={W} height={H} fill="url(#fslg-glow)" />{sparkles(52, 12, 8, '#FFD0D6')}</>)}
    {tile('fsl-emerald', <><rect width={W} height={H} fill="#06210F" />{facets(61, 60, ['#0B3A1E', '#0E4A26', '#082C16', '#12572D'], [0.6, 1])}
      {circuits(62, 70, '#43FF8F')}</>)}
    {tile('fsl-diamond', <><rect width={W} height={H} fill="#BFEFFF" />{facets(71, 46, ['#FFFFFF', '#E6F8FF', '#BFEFFF', '#9FDDF7', '#7CC8EE', '#4FA6DE', '#F2FCFF'], [0.75, 1])}
      <g stroke="#fff" strokeOpacity=".5" strokeWidth=".8" fill="none">{facets(71, 46, ['none'], [1, 1])}</g>{sparkles(72, 46, 12, '#fff')}</>)}
    {tile('fsl-champion', <>{fill('fslg-champion')}{veins(81, 40, 22, '#C9A6FF', 2.4, 0.75, 0.25)}{veins(82, 30, 14, '#1A0B3D', 3, 0.5, 0.2)}</>)}
    {tile('fsl-symmetric', <>{fill('fslg-symmetric')}{brushed(91, 120, '#ffffff', 0.12)}{sparkles(92, 20, 9, '#fff')}</>)}
    {tile('fsl-olympian', <>{fill('fslg-olympian')}{veins(101, 22, 26, '#9E968A', 1.6, 0.45, 0.3)}{veins(102, 30, 12, '#B8AF9F', 0.9, 0.35, 0.2)}</>)}
  </defs></svg>
})
