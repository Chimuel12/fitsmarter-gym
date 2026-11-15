// The openGym logo, as in assets/logo: the mark (five plain rectangles on a 352×174 grid, square
// corners, brand green) and the lockup (mark, then "open" plus "Gym" in brand green). Brand colours,
// not the accent: the accent is the user's, the logo is not. Never mirrored in RTL.

import { VIEWBOX, ASPECT, markInner } from '../fitsmarter/mark.js'
// FitSmarter: the runner mark replaces openGym's five-bar mark

/** The mark alone, `height` px high (width follows, 352:174). `color` only for a one-colour use. */
export function BrandMark({ height = 24, color = '#4C8DFF', className, style }) {
  return (
    <svg className={className} viewBox={VIEWBOX.join(' ')} width={height * ASPECT} height={height}
      aria-hidden="true" focusable="false" style={{ flex: 'none', ...style }} dangerouslySetInnerHTML={{ __html: markInner(color) }} />
  )
}

/**
 * The lockup at `size` px type: mark 1.07× the type high, a gap of 0.2×, the mark's middle at
 * 0.36× above the baseline (opengym-logo-dark.svg). "open" follows the theme (index.css .brand-lockup).
 */
export default function BrandLogo({ size = 34, as: Tag = 'span', className = '', style }) {
  return (
    <Tag className={('brand-lockup ' + className).trim()} dir="ltr" style={{ fontSize: size, ...style }}>
      <svg className="brand-lockup-mark" viewBox={VIEWBOX.join(' ')} aria-hidden="true" focusable="false" dangerouslySetInnerHTML={{ __html: markInner() }} />
      <span className="brand-lockup-open">Fit</span><span className="brand-lockup-gym">Smarter</span>
    </Tag>
  )
}
