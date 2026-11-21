// FitSmarter: the body's skin evolves with your overall level (tiers.js overall()). Each level
// unlocks something you can see; the muscles keep their own colour and size on top of it.
import { TIERS, tierIndex } from './tiers.js'

/** Per overall tier: the skin gradient (two or more stops) and what it unlocks. */
export const SKINS = {
  none: { stops: ['#4A5366', '#3A4254'], unlock: '' },
  iron: { stops: ['#6B727D', '#3E434B'], unlock: 'Matte iron silhouette.' },
  bronze: { stops: ['#C98B5B', '#6E3F1E'], unlock: 'Bronze skin and muscle definition lines.' },
  silver: { stops: ['#F1F4F8', '#8A94A3', '#C9D0DA'], unlock: 'Polished silver finish.' },
  gold: { stops: ['#FFE27A', '#D19A0E', '#8C6200'], unlock: 'Gold body with a soft aura behind you.' },
  ruby: { stops: ['#FF7A88', '#C2182F', '#7A0E1C'], unlock: 'Ruby skin and an aura that pulses.' },
  emerald: { stops: ['#7CF5B4', '#18A35C', '#0B5A33'], unlock: 'Emerald skin, and your strongest muscles glow.' },
  diamond: { stops: ['#F2FCFF', '#9FDDF7', '#4FA6DE'], unlock: 'Diamond skin with a crystal shine that sweeps across it.' },
  champion: { stops: ['#E5CCFF', '#9C6BFF', '#4B22C7'], unlock: 'Floating particles and a wider V-shape.' },
  symmetric: { stops: ['#7FE0FF', '#7F9CFF', '#C47FFF', '#FF8FD8'], unlock: 'Holographic animated skin and a halo.' },
  olympian: { stops: ['#FFFFFF', '#EEE8DE', '#C9BFAE'], unlock: 'White marble, like a Greek statue, at its most muscular. The best there is.' },
}
export const skinOf = ov => (ov ? ov.tier.id : 'none')
export const skinLevel = ov => (ov ? tierIndex(ov.tier.id) : -1)
/** The effects switched on at this level, as CSS classes on the stage. */
export function skinClasses(level) {
  return [
    level >= 1 && 'fx-def', level >= 2 && 'fx-metal', level >= 3 && 'fx-aura', level >= 4 && 'fx-pulse',
    level >= 5 && 'fx-glow', level >= 6 && 'fx-shine', level >= 7 && 'fx-particles', level === 8 && 'fx-holo', level >= 9 && 'fx-marble',
  ].filter(Boolean).join(' ')
}
/** Bigger steps than before: 78 % untrained, 84 % at Iron, +6 % a level, 132 % at Symmetric. */
export const V_TAPER = new Set(['front-delts', 'side-delts', 'rear-delts', 'lats', 'upper-back', 'trapezius'])
export function muscleScale(r, slug, level) {
  const base = !r ? 0.78 : 0.84 + tierIndex(r.tier.id) * 0.06
  return level >= 7 && V_TAPER.has(slug) ? base * 1.06 : base
}
export const nextSkin = level => TIERS[level + 1] || null
