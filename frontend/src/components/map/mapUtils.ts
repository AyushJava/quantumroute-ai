import L from 'leaflet'
import type { ScenarioGraph } from '../../api/types'

type Node = ScenarioGraph['nodes'][number]
type Edge = ScenarioGraph['edges'][number]

/** Matches backend geo constraints: finite lat in [-90,90], lon in [-180,180]. */
export function hasCoords(node: Node): node is Node & { lat: number; lon: number } {
  return (
    typeof node.lat === 'number' &&
    typeof node.lon === 'number' &&
    Number.isFinite(node.lat) &&
    Number.isFinite(node.lon) &&
    Math.abs(node.lat) <= 90 &&
    Math.abs(node.lon) <= 180
  )
}

/** Graph nodes use {lat, lon}; Leaflet expects [lat, lon]. */
export function toLatLng(node: Node): L.LatLng | null {
  return hasCoords(node) ? L.latLng(node.lat, node.lon) : null
}

export function nodeById(graph: ScenarioGraph): Map<string, Node> {
  return new Map(graph.nodes.map((n) => [n.id, n]))
}

/** Ordered [lat,lon] pairs source→target; null if either endpoint is
 *  missing from the node map or lacks coordinates. */
export function edgePath(graph: ScenarioGraph, edge: Edge): L.LatLng[] | null {
  const byId = nodeById(graph)
  const src = byId.get(edge.source)
  const dst = byId.get(edge.target)
  if (!src || !dst) return null
  const a = toLatLng(src)
  const b = toLatLng(dst)
  if (!a || !b) return null
  return [a, b]
}

export interface EdgeArrow {
  position: L.LatLng
  /** Compass bearing source→target in degrees (0 = north, clockwise). */
  bearingDeg: number
}

/** Midpoint + bearing for a direction arrow; null when the edge can't be drawn. */
export function edgeArrow(graph: ScenarioGraph, edge: Edge): EdgeArrow | null {
  if (!graph.directed) return null
  const path = edgePath(graph, edge)
  if (!path) return null
  const [a, b] = path
  const mid = L.latLng((a.lat + b.lat) / 2, (a.lng + b.lng) / 2)
  // Leaflet LatLng: lat=y, lng=x. Bearing = atan2(Δeast, Δnorth).
  const dLat = (b.lat - a.lat) * Math.PI / 180
  const dLng = (b.lng - a.lng) * Math.PI / 180
  const meanLat = ((a.lat + b.lat) / 2) * Math.PI / 180
  const x = dLng * Math.cos(meanLat)
  const y = dLat
  const bearingDeg = (Math.atan2(x, y) * 180) / Math.PI
  return { position: mid, bearingDeg: (bearingDeg + 360) % 360 }
}

/** Bounds over all coord'd nodes; null when none exist. */
export function graphBounds(graph: ScenarioGraph): L.LatLngBounds | null {
  const pts = graph.nodes.map(toLatLng).filter((p): p is L.LatLng => p !== null)
  if (pts.length === 0) return null
  return L.latLngBounds(pts)
}

export function coordedNodeCount(graph: ScenarioGraph): number {
  return graph.nodes.filter(hasCoords).length
}

/** Convert optimizer GeoJSON geometry to Leaflet [lat, lon] positions.
 *  Backend emits {"type":"LineString","coordinates":[[lon,lat],...]} or null.
 *  Returns null for missing/malformed/out-of-range geometry — never throws. */
export function geoJSONToLatLngs(
  geometry: Record<string, unknown> | null | undefined,
): L.LatLng[] | null {
  if (!geometry || typeof geometry !== 'object') return null
  // Backend emits LineString only; reject anything else defensively.
  if (geometry.type !== 'LineString') return null
  const coords = geometry.coordinates
  if (!Array.isArray(coords) || coords.length === 0) return null

  const pts: L.LatLng[] = []
  for (const c of coords) {
    if (!Array.isArray(c) || c.length < 2) return null
    const lon = Number(c[0])
    const lat = Number(c[1])
    if (
      !Number.isFinite(lon) || !Number.isFinite(lat) ||
      Math.abs(lat) > 90 || Math.abs(lon) > 180
    ) {
      return null
    }
    pts.push(L.latLng(lat, lon))
  }
  return pts.length >= 2 ? pts : null
}

/** Fallback route path from optimizer nodeIds + scenario graph.
 *  All IDs must exist and have valid coords, in route order; else null. */
export function nodeIdsToLatLngs(
  graph: ScenarioGraph,
  nodeIds: string[] | undefined | null,
): L.LatLng[] | null {
  if (!nodeIds || nodeIds.length < 2) return null
  const byId = nodeById(graph)
  const pts: L.LatLng[] = []
  for (const id of nodeIds) {
    const node = byId.get(id)
    const ll = node ? toLatLng(node) : null
    if (!ll) return null
    pts.push(ll)
  }
  return pts
}
