import { useEffect, useMemo } from 'react'
import { MapContainer, Polyline, TileLayer, CircleMarker, Marker, Tooltip, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import type { ScenarioGraph } from '../../api/types'
import { edgeArrow, edgePath, geoJSONToLatLngs, graphBounds, nodeIdsToLatLngs, toLatLng } from './mapUtils'
import '../../styles/map.css'

export type SelectionRole = 'origin' | 'destination'

interface ScenarioMapProps {
  graph: ScenarioGraph
  originId?: string | null
  destId?: string | null
  /** Called when a coord'd node marker is clicked. */
  onNodeSelect?: (nodeId: string) => void
  /** Optimized route geometry (GeoJSON); drawn as a distinct overlay. */
  routeGeometry?: Record<string, unknown> | null
  /** Route node IDs — fallback path when geometry is unavailable
   *  (e.g. a route node lacks coordinates). Only used if feasible. */
  routeNodeIds?: string[] | null
  /** Multi-route overlay (algorithm comparison). GeoJSON preferred,
   *  nodeIds fallback; infeasible/malformed entries are skipped. */
  routes?: {
    algorithm: string
    color: string
    geometry?: Record<string, unknown> | null
    nodeIds?: string[] | null
  }[]
}

function FitBounds({ graph }: { graph: ScenarioGraph }) {
  const map = useMap()
  useEffect(() => {
    const b = graphBounds(graph)
    if (b) {
      map.fitBounds(b.pad(0.15))
    } else {
      map.setView([20, 0], 2)
    }
  }, [graph, map])
  return null
}

/** Lightweight direction arrow — rotated CSS triangle via divIcon (no deps). */
const arrowIcon = (bearingDeg: number) =>
  L.divIcon({
    className: 'edge-arrow',
    html: `<div style="transform:rotate(${bearingDeg}deg)">▸</div>`,
    iconSize: [14, 14],
    iconAnchor: [7, 7],
  })

function nodeStyle(role: SelectionRole | null) {
  if (role === 'origin') {
    return { fillColor: '#2fbf71', color: '#0e6e3e' }
  }
  if (role === 'destination') {
    return { fillColor: '#f5a623', color: '#8a5a00' }
  }
  return { fillColor: '#4f6ef7', color: '#ffffff' }
}

export function ScenarioMap({ graph, originId, destId, onNodeSelect, routeGeometry, routeNodeIds, routes }: ScenarioMapProps) {
  const bounds = useMemo(() => graphBounds(graph), [graph])
  const geoPath = useMemo(() => geoJSONToLatLngs(routeGeometry), [routeGeometry])
  const nodePath = useMemo(
    () => (geoPath ? null : nodeIdsToLatLngs(graph, routeNodeIds)),
    [geoPath, graph, routeNodeIds],
  )
  const routePath = geoPath ?? nodePath
  const roleOf = useMemo(() => {
    const m = new Map<string, SelectionRole>()
    if (originId) m.set(originId, 'origin')
    if (destId) m.set(destId, 'destination')
    return m
  }, [originId, destId])

  if (!bounds) {
    return (
      <div className="map-empty" role="img" aria-label="Map unavailable">
        <div className="map-empty-icon">🗺</div>
        <div className="map-empty-title">No mappable nodes</div>
        <div className="map-empty-sub">
          None of this graph's nodes have coordinates. You can still select
          origin and destination from the lists below.
        </div>
      </div>
    )
  }

  return (
    <div className="scenario-map">
      <MapContainer
        bounds={bounds.pad(0.15)}
        style={{ height: '100%', width: '100%' }}
        scrollWheelZoom
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <FitBounds graph={graph} />
        {routePath && (
          <Polyline
            positions={routePath}
            pathOptions={{
              color: '#22c55e',
              weight: 5,
              opacity: 0.95,
            }}
          />
        )}
        {routes?.map((r) => {
          const path =
            geoJSONToLatLngs(r.geometry) ?? nodeIdsToLatLngs(graph, r.nodeIds)
          if (!path) return null
          return (
            <Polyline
              key={r.algorithm}
              positions={path}
              pathOptions={{ color: r.color, weight: 4, opacity: 0.9 }}
            />
          )
        })}
        {graph.edges.map((e, i) => {
          const path = edgePath(graph, e)
          if (!path) return null
          return (
            <Polyline
              key={e.id ?? `${e.source}-${e.target}-${i}`}
              positions={path}
              pathOptions={
                e.closed
                  ? { color: '#8a93a6', weight: 2, dashArray: '6 6', opacity: 0.6 }
                  : { color: '#4f6ef7', weight: 3, opacity: 0.85 }
              }
            />
          )
        })}
        {graph.edges.map((e, i) => {
          const arrow = edgeArrow(graph, e)
          if (!arrow) return null
          return (
            <Marker
              key={`arrow-${e.id ?? `${e.source}-${e.target}-${i}`}`}
              position={arrow.position}
              icon={arrowIcon(arrow.bearingDeg)}
              interactive={false}
              keyboard={false}
            />
          )
        })}
        {graph.nodes.map((n) => {
          const ll = toLatLng(n)
          if (!ll) return null
          const role = roleOf.get(n.id) ?? null
          const style = nodeStyle(role)
          return (
            <CircleMarker
              key={n.id}
              center={ll}
              radius={role ? 9 : 7}
              pathOptions={{
                color: style.color,
                weight: 2,
                fillColor: style.fillColor,
                fillOpacity: 0.95,
              }}
              className="node-marker"
              eventHandlers={{ click: () => onNodeSelect?.(n.id) }}
            >
              <Tooltip permanent direction="top" className="node-tooltip">
                {n.id}
              </Tooltip>
            </CircleMarker>
          )
        })}
      </MapContainer>
    </div>
  )
}
