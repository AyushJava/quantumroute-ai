import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ComparisonPanel } from './ComparisonPanel'
import type { JobResponse, JobResultResponse } from '../api/types'

const job = (id: string, algo: JobResponse['algorithm'], status: JobResponse['status'] = 'COMPLETED'): JobResponse => ({
  id, scenarioId: 's1', status, algorithm: algo,
  createdAt: '2025-01-01T00:00:00Z', finishedAt: null, errorMessage: null,
})
const res = (over: Partial<JobResultResponse> = {}): JobResultResponse => ({
  jobId: 'x', feasible: true,
  route: { nodeIds: ['A', 'B'], edgeIds: [], geometry: null },
  metrics: {
    distanceMeters: 2500, estimatedTravelTimeSeconds: 200,
    congestionPenalty: 0.2, objectiveValue: 0.55,
  },
  runtimeMs: 120, algorithmMetadata: null, ...over,
})

describe('ComparisonPanel', () => {
  it('renders three completed algorithm cards', () => {
    render(
      <ComparisonPanel
        jobs={[job('1', 'DIJKSTRA'), job('2', 'ASTAR'), job('3', 'QPSO')]}
        results={{ '1': res(), '2': res(), '3': res() }}
        resultErrors={{}}
      />,
    )
    expect(screen.getByText('DIJKSTRA')).toBeInTheDocument()
    expect(screen.getByText('ASTAR')).toBeInTheDocument()
    expect(screen.getByText('QPSO')).toBeInTheDocument()
    expect(screen.getAllByText('2.50 km')).toHaveLength(3)
  })

  it('shows per-card failure while others succeed', () => {
    render(
      <ComparisonPanel
        jobs={[job('1', 'DIJKSTRA'), job('2', 'ASTAR', 'FAILED'), job('3', 'QPSO')]}
        results={{ '1': res(), '3': res() }}
        resultErrors={{}}
      />,
    )
    expect(screen.getByText('FAILED')).toBeInTheDocument()
    expect(screen.getAllByText('2.50 km')).toHaveLength(2)
  })

  it('renders infeasible result without metrics', () => {
    render(
      <ComparisonPanel
        jobs={[job('1', 'DIJKSTRA')]}
        results={{ '1': res({ feasible: false, route: {}, metrics: null }) }}
        resultErrors={{}}
      />,
    )
    expect(screen.getByText(/No feasible route/)).toBeInTheDocument()
  })

  it('shows QPSO metadata only for QPSO card', () => {
    const qpsoMeta = {
      seed: 42, iterationsRun: 150, usedRepair: true,
      repairRate: 0.1, feasibilityRate: 0.9, parameters: {},
    }
    render(
      <ComparisonPanel
        jobs={[job('1', 'DIJKSTRA'), job('3', 'QPSO')]}
        results={{
          '1': res({ algorithmMetadata: qpsoMeta }),
          '3': res({ algorithmMetadata: qpsoMeta }),
        }}
        resultErrors={{}}
      />,
    )
    // only one QPSO metadata section rendered (on the QPSO card)
    expect(screen.getAllByText('Seed')).toHaveLength(1)
    expect(screen.getByText('42')).toBeInTheDocument()
  })

  it('handles null metrics safely', () => {
    render(
      <ComparisonPanel
        jobs={[job('1', 'DIJKSTRA')]}
        results={{ '1': res({ metrics: null, runtimeMs: null }) }}
        resultErrors={{}}
      />,
    )
    expect(screen.getAllByText('—').length).toBeGreaterThan(0)
  })

  it('shows queued/running and loading states', () => {
    render(
      <ComparisonPanel
        jobs={[job('1', 'DIJKSTRA', 'RUNNING'), job('2', 'ASTAR', 'COMPLETED')]}
        results={{}}
        resultErrors={{}}
      />,
    )
    expect(screen.getByText('RUNNING')).toBeInTheDocument()
    expect(screen.getByText(/Waiting for optimizer/)).toBeInTheDocument()
    expect(screen.getByText('Loading result…')).toBeInTheDocument()
  })
})
