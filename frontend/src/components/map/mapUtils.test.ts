import { describe, expect, it } from 'vitest'
import {
  coordedNodeCount,
  edgeArrow,
  geoJSONToLatLngs,
  nodeIdsToLatLngs,
  edgePath,
  graphBounds,
  hasCoords,
  nodeById,
  toLatLng,
} from './mapUtils'
import type { ScenarioGraph } from '../../api/types'

const GRAPH: ScenarioGraph = {
  name: 'g',
  directed: true,
  nodes: [
    { id: 'A', lat: 28.6, lon: 77.2 },
    { id: 'B', lat: 28.7, lon: 77.3 },
    { id: 'C' }, // no coords
  ],
  edges: [
    { source: 'A', target: 'B', length_m: 1, speed_kmh: 1 },
    { source: 'B', target: 'C', length_m: 1, speed_kmh: 1 },
  ],
}

describe('mapUtils', () => {
  it('hasCoords validates finite lat/lon', () => {
    expect(hasCoords(GRAPH.nodes[0])).toBe(true)
    expect(hasCoords(GRAPH.nodes[2])).toBe(false)
  })

  it('toLatLng returns [lat,lon] order', () => {
    const ll = toLatLng(GRAPH.nodes[0])!
    expect(ll.lat).toBe(28.6)
    expect(ll.lng).toBe(77.2)
  })

  it('edgePath returns null when an endpoint lacks coords', () => {
    expect(edgePath(GRAPH, GRAPH.edges[1])).toBeNull()
    const p = edgePath(GRAPH, GRAPH.edges[0])!
    expect(p).toHaveLength(2)
    expect(p[0].lat).toBe(28.6)
  })

  it('graphBounds covers coorded nodes only; null when none', () => {
    const b = graphBounds(GRAPH)!
    expect(b.getNorth()).toBeCloseTo(28.7)
    expect(b.getSouth()).toBeCloseTo(28.6)
    const noCoords: ScenarioGraph = { ...GRAPH, nodes: [{ id: 'X' }] }
    expect(graphBounds(noCoords)).toBeNull()
    expect(coordedNodeCount(noCoords)).toBe(0)
  })

  it('nodeById indexes all nodes incl. coord-less', () => {
    expect(nodeById(GRAPH).get('C')?.id).toBe('C')
  })

  it('edgePath returns null for edges referencing missing nodes', () => {
    const g: ScenarioGraph = {
      ...GRAPH,
      edges: [{ source: 'A', target: 'GHOST', length_m: 1, speed_kmh: 1 }],
    }
    expect(edgePath(g, g.edges[0])).toBeNull()
    expect(edgeArrow(g, g.edges[0])).toBeNull()
  })

  it('edgeArrow returns midpoint+bearing only for directed graphs', () => {
    const arrow = edgeArrow(GRAPH, GRAPH.edges[0])!
    expect(arrow).not.toBeNull()
    expect(arrow.position.lat).toBeCloseTo((28.6 + 28.7) / 2)
    expect(arrow.bearingDeg).toBeGreaterThanOrEqual(0)
    expect(arrow.bearingDeg).toBeLessThan(360)

    const undirected: ScenarioGraph = { ...GRAPH, directed: false }
    expect(edgeArrow(undirected, undirected.edges[0])).toBeNull()
  })

  it('hasCoords rejects out-of-range lat/lon', () => {
    expect(hasCoords({ id: 'x', lat: 91, lon: 0 })).toBe(false)
    expect(hasCoords({ id: 'x', lat: 0, lon: 181 })).toBe(false)
    expect(hasCoords({ id: 'x', lat: -90, lon: 180 })).toBe(true)
  })
})

describe('geoJSONToLatLngs', () => {
  const line = {
    type: 'LineString',
    coordinates: [
      [77.209, 28.6139],
      [77.215, 28.62],
      [77.22, 28.625],
    ],
  }

  it('converts [lon,lat] GeoJSON to Leaflet [lat,lon]', () => {
    const pts = geoJSONToLatLngs(line)!
    expect(pts).toHaveLength(3)
    expect(pts[0].lat).toBeCloseTo(28.6139)
    expect(pts[0].lng).toBeCloseTo(77.209)
    expect(pts[2].lat).toBeCloseTo(28.625)
  })

  it('returns null for null/undefined/missing coordinates', () => {
    expect(geoJSONToLatLngs(null)).toBeNull()
    expect(geoJSONToLatLngs(undefined)).toBeNull()
    expect(geoJSONToLatLngs({})).toBeNull()
    expect(geoJSONToLatLngs({ type: 'LineString' })).toBeNull()
    expect(geoJSONToLatLngs({ coordinates: [] })).toBeNull()
  })

  it('returns null for malformed coordinate pairs', () => {
    expect(geoJSONToLatLngs({ coordinates: [[1]] })).toBeNull()
    expect(geoJSONToLatLngs({ coordinates: [[1, 2, 3], 'x'] })).toBeNull()
    expect(geoJSONToLatLngs({ coordinates: 'nope' })).toBeNull()
  })

  it('rejects out-of-range and non-finite coordinates', () => {
    expect(geoJSONToLatLngs({ coordinates: [[200, 0], [0, 0]] })).toBeNull()
    expect(geoJSONToLatLngs({ coordinates: [[0, 91], [0, 0]] })).toBeNull()
    expect(geoJSONToLatLngs({ coordinates: [[NaN, 0], [0, 0]] })).toBeNull()
    expect(geoJSONToLatLngs({ coordinates: [[Infinity, 0], [0, 0]] })).toBeNull()
  })

  it('returns null for a single-point line', () => {
    expect(geoJSONToLatLngs({ coordinates: [[1, 2]] })).toBeNull()
  })
})

describe('geoJSONToLatLngs type guard', () => {
  it('rejects non-LineString geometry types', () => {
    const coords = [[77.2, 28.6], [77.3, 28.7]]
    expect(geoJSONToLatLngs({ type: 'Point', coordinates: coords[0] })).toBeNull()
    expect(geoJSONToLatLngs({ type: 'Polygon', coordinates: [coords] })).toBeNull()
    expect(geoJSONToLatLngs({ type: 'Feature', geometry: {} })).toBeNull()
    expect(geoJSONToLatLngs({ coordinates: coords })).toBeNull() // missing type
  })
})

describe('nodeIdsToLatLngs', () => {
  it('converts route node IDs in order using graph coords', () => {
    const pts = nodeIdsToLatLngs(GRAPH, ['A', 'B'])!
    expect(pts).toHaveLength(2)
    expect(pts[0].lat).toBeCloseTo(28.6)
    expect(pts[1].lng).toBeCloseTo(77.3)
  })

  it('returns null when a node ID is missing from the graph', () => {
    expect(nodeIdsToLatLngs(GRAPH, ['A', 'GHOST'])).toBeNull()
  })

  it('returns null when a route node lacks coordinates', () => {
    expect(nodeIdsToLatLngs(GRAPH, ['A', 'C'])).toBeNull() // C has no coords
    expect(nodeIdsToLatLngs(GRAPH, ['C', 'A'])).toBeNull()
  })

  it('returns null for empty/single-node routes', () => {
    expect(nodeIdsToLatLngs(GRAPH, [])).toBeNull()
    expect(nodeIdsToLatLngs(GRAPH, ['A'])).toBeNull()
    expect(nodeIdsToLatLngs(GRAPH, null)).toBeNull()
  })
})
