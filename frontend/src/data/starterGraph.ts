import type { ScenarioGraph } from '../api/types'

/** Valid starter graph for first-time scenario creation (Phase 5.4 adds editing). */
export const STARTER_GRAPH: ScenarioGraph = {
  name: 'Starter City Graph',
  directed: true,
  nodes: [
    { id: 'A', lat: 28.6139, lon: 77.209 },
    { id: 'B', lat: 28.62, lon: 77.215 },
    { id: 'C', lat: 28.625, lon: 77.22 },
  ],
  edges: [
    { source: 'A', target: 'B', length_m: 1200, speed_kmh: 40, congestion: 0.2, closed: false },
    { source: 'B', target: 'C', length_m: 1500, speed_kmh: 35, congestion: 0.3, closed: false },
    { source: 'A', target: 'C', length_m: 3000, speed_kmh: 50, congestion: 0.1, closed: false },
  ],
}
