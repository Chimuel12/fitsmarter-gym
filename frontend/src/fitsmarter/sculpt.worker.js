// FitSmarter: sculpts the body's grid off the main thread (sculpt.js), so the screen never stalls.
import { fillGrid } from './sculpt.js'
self.onmessage = e => {
  const { id, states, res } = e.data
  const field = fillGrid(states, res)
  self.postMessage({ id, field }, [field.buffer])
}
