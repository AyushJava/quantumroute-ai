import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { RouteResultPanel } from './RouteResultPanel'
import type { JobResultResponse } from '../api/types'

const FEASIBLE: JobResultResponse = {
  jobId: 'j1', feasible: true,
  route: {
    nodeIds: ['A', 'B', 'C'],
    edgeIds: ['e1', 'e2'],
    geometry: { type: 'LineString', coordinates: [[77.2, 28.6], [77.3, 28.7]] },
  },
  metrics: {
    distanceMeters: 3200,
    estimatedTravelTimeSeconds: 245,
    congestionPenalty: 0.35,
    objectiveValue: 0.6123,
  },
  runtimeMs: 87,
  algorithmMetadata: {
    seed: 42, iterationsRun: 150, usedRepair: true,
    repairRate: 0.12, feasibilityRate: 0.98,
    convergenceTrace: [0.9, 0.5, 0.3],
    parameters: {},
  },
}

describe('RouteResultPanel', () => {
  it('renders feasible metrics and route', () => {
    render(<RouteResultPanel result={FEASIBLE} />)
    expect(screen.getByText('3.20 km')).toBeInTheDocument()
    expect(screen.getByText('4m 5s')).toBeInTheDocument()
    expect(screen.getByText('A → B → C')).toBeInTheDocument()
    expect(screen.getByText('87 ms')).toBeInTheDocument()
    expect(screen.getByText('Seed')).toBeInTheDocument()
    expect(screen.getByText('42')).toBeInTheDocument()
    expect(screen.getByText(/Convergence trace/)).toBeInTheDocument()
  })

  it('renders infeasible message without metrics', () => {
    render(
      <RouteResultPanel
        result={{ ...FEASIBLE, feasible: false, route: {}, metrics: null, algorithmMetadata: null }}
      />,
    )
    expect(screen.getByText('No feasible route')).toBeInTheDocument()
    expect(screen.queryByText('QPSO metadata')).not.toBeInTheDocument()
  })

  it('handles null metrics safely', () => {
    render(
      <RouteResultPanel
        result={{ ...FEASIBLE, metrics: null, runtimeMs: null }}
      />,
    )
    expect(screen.getAllByText('—').length).toBeGreaterThan(0)
  })

  it('omits QPSO metadata for classical algorithms', () => {
    render(
      <RouteResultPanel result={{ ...FEASIBLE, algorithmMetadata: null }} />,
    )
    expect(screen.queryByText('QPSO metadata')).not.toBeInTheDocument()
  })
})
