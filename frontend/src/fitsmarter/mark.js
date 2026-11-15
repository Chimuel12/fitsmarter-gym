// FitSmarter's mark: a minimal runner (original artwork), drawn as round strokes plus a head.
// Used by the logo lockup, the share-card canvas, printouts and the loading screen.
export const BLUE = '#4C8DFF'
export const VIEWBOX = [62, 72, 330, 320]          // x, y, w, h around the figure
export const ASPECT = VIEWBOX[2] / VIEWBOX[3]
const HEAD = [316, 116, 36]
// [path, stroke width, opacity]
const STROKES = [
  ['M298 176 L254 268', 42, 1], ['M290 196 L346 238 L384 206', 26, 1], ['M284 196 L226 214 L196 262', 26, 1],
  ['M254 268 L318 306 L300 384', 30, 1], ['M254 268 L208 326 L144 328', 30, 1],
  ['M92 212 H156 M70 268 H138 M98 324 H120', 18, 0.45],
]
/** The figure as SVG markup for a viewBox of VIEWBOX, in `color`. */
export function markInner(color = BLUE) {
  return `<circle cx="${HEAD[0]}" cy="${HEAD[1]}" r="${HEAD[2]}" fill="${color}"/>`
    + STROKES.map(([d, w, o]) => `<path d="${d}" fill="none" stroke="${color}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"${o < 1 ? ` stroke-opacity="${o}"` : ''}/>`).join('')
}
export const markSvg = (cls = '', color = BLUE) => `<svg class="${cls}" viewBox="${VIEWBOX.join(' ')}" aria-hidden="true">${markInner(color)}</svg>`
/** Draw the figure on a canvas, `h` high, its left edge at x, centred on y. */
export function drawMarkOn(ctx, x, y, h, color = BLUE) {
  const s = h / VIEWBOX[3]
  ctx.save()
  ctx.translate(x - VIEWBOX[0] * s, y - (VIEWBOX[1] + VIEWBOX[3] / 2) * s)
  ctx.scale(s, s)
  ctx.fillStyle = color; ctx.strokeStyle = color; ctx.lineCap = 'round'; ctx.lineJoin = 'round'
  ctx.beginPath(); ctx.arc(HEAD[0], HEAD[1], HEAD[2], 0, Math.PI * 2); ctx.fill()
  for (const [d, w, o] of STROKES) { ctx.globalAlpha = o; ctx.lineWidth = w; ctx.stroke(new Path2D(d)) }
  ctx.restore()
}
