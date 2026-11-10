/** Shared metric formatting — identical output to previous panel-local helpers. */

export function fmtDistance(m: number | null | undefined): string {
  if (m == null) return '—'
  return m >= 1000 ? `${(m / 1000).toFixed(2)} km` : `${m.toFixed(0)} m`
}

export function fmtTime(s: number | null | undefined): string {
  if (s == null) return '—'
  if (s < 60) return `${s.toFixed(0)} s`
  const m = Math.floor(s / 60)
  const r = Math.round(s % 60)
  return `${m}m ${r}s`
}
