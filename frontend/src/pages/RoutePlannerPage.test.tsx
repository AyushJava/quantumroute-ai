import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { RoutePlannerPage } from './RoutePlannerPage'
import { AuthProvider } from '../auth/AuthProvider'
import * as resources from '../api/resources'
import type { ScenarioDetail } from '../api/types'
import { ApiError } from '../api/client'

vi.mock('../api/resources')

// Stub the Leaflet map: render a button per mappable node that fires onNodeSelect.
vi.mock('../components/map/ScenarioMap', () => ({
  ScenarioMap: ({
    graph,
    originId,
    destId,
    onNodeSelect,
    routes,
  }: {
    graph: ScenarioDetail['graph']
    originId?: string | null
    destId?: string | null
    onNodeSelect?: (id: string) => void
    routes?: unknown[]
  }) => (
    <div data-testid="map-stub" data-routes={routes?.length ?? 0}>
      {graph.nodes
        .filter((n) => typeof n.lat === 'number' && typeof n.lon === 'number')
        .map((n) => (
          <button key={n.id} onClick={() => onNodeSelect?.(n.id)}>
            node-{n.id}
            {originId === n.id ? ' [origin]' : ''}
            {destId === n.id ? ' [dest]' : ''}
          </button>
        ))}
    </div>
  ),
}))

const SC: ScenarioDetail = {
  id: 's1', workspaceId: 'w1', name: 'City', graphVersion: 'v1',
  createdAt: '2025-01-01T00:00:00Z',
  graph: {
    name: 'g', directed: true,
    nodes: [
      { id: 'A', lat: 1, lon: 1 },
      { id: 'B', lat: 2, lon: 2 },
      { id: 'C' }, // no coords — dropdown only
    ],
    edges: [{ source: 'A', target: 'B', length_m: 1, speed_kmh: 1 }],
  },
  config: {},
}

function renderPlan() {
  return render(
    <MemoryRouter initialEntries={['/scenarios/s1/plan']}>
      <AuthProvider>
        <Routes>
          <Route path="/scenarios/:scenarioId/plan" element={<RoutePlannerPage />} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  )
}

describe('RoutePlannerPage selection', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.mocked(resources.getScenario).mockResolvedValue(SC)
  })

  it('map click assigns origin then auto-advances to destination mode', async () => {
    renderPlan()
    await screen.findByTestId('map-stub')
    await userEvent.click(screen.getByRole('button', { name: /^node-A/ }))
    // origin dropdown reflects it; mode advanced to destination
    expect(screen.getByLabelText('Origin')).toHaveValue('A')
    await userEvent.click(screen.getByRole('button', { name: /^node-B/ }))
    expect(screen.getByLabelText('Destination')).toHaveValue('B')
    expect(screen.getByRole('button', { name: /select destination/i }))
      .toHaveAttribute('aria-pressed', 'true')
  })

  it('dropdown and map stay in sync', async () => {
    renderPlan()
    await screen.findByTestId('map-stub')
    await userEvent.selectOptions(screen.getByLabelText('Origin'), 'A')
    expect(await screen.findByRole('button', { name: /node-A \[origin\]/ }))
      .toBeInTheDocument()
  })

  it('coord-less node C is selectable via dropdown only', async () => {
    renderPlan()
    await screen.findByTestId('map-stub')
    // C has no map button
    expect(screen.queryByRole('button', { name: 'node-C' })).not.toBeInTheDocument()
    await userEvent.selectOptions(screen.getByLabelText('Origin'), 'C')
    expect(screen.getByLabelText('Origin')).toHaveValue('C')
    expect(screen.getAllByText(/no map coordinates/).length).toBeGreaterThan(0)
  })

  it('blocks same node for origin and destination', async () => {
    renderPlan()
    await screen.findByTestId('map-stub')
    await userEvent.click(screen.getByRole('button', { name: /^node-A/ }))
    await userEvent.click(screen.getByRole('button', { name: /^node-A/ }))
    expect(
      screen.getByText('Origin and destination must be different nodes.'),
    ).toBeInTheDocument()
    expect(screen.getByLabelText('Destination')).toHaveValue('')
  })

  it('clear buttons reset selections', async () => {
    renderPlan()
    await screen.findByTestId('map-stub')
    await userEvent.selectOptions(screen.getByLabelText('Origin'), 'A')
    await userEvent.click(screen.getByRole('button', { name: /clear origin/i }))
    expect(screen.getByLabelText('Origin')).toHaveValue('')
  })

  it('handles empty graph gracefully', async () => {
    vi.mocked(resources.getScenario).mockResolvedValue({
      ...SC,
      graph: { name: 'empty', directed: false, nodes: [], edges: [] },
    })
    renderPlan()
    expect(
      await screen.findByText(/no nodes/i),
    ).toBeInTheDocument()
  })

  it('shows QPSO fields only when QPSO is selected', async () => {
    renderPlan()
    await screen.findByTestId('map-stub')
    expect(screen.queryByLabelText(/particles/i)).not.toBeInTheDocument()
    await userEvent.click(screen.getByLabelText(/^QPSO/))
    expect(await screen.findByLabelText(/particles/i)).toBeInTheDocument()
    expect(screen.getByLabelText('Seed')).toBeInTheDocument()
    await userEvent.click(screen.getByLabelText(/^Dijkstra/))
    expect(screen.queryByLabelText(/particles/i)).not.toBeInTheDocument()
  })

  it('preserves origin/destination when switching algorithms', async () => {
    renderPlan()
    await screen.findByTestId('map-stub')
    await userEvent.selectOptions(screen.getByLabelText('Origin'), 'A')
    await userEvent.click(screen.getByLabelText(/^QPSO/))
    expect(screen.getByLabelText('Origin')).toHaveValue('A')
  })

  it('shows endpoint readiness status', async () => {
    renderPlan()
    await screen.findByTestId('map-stub')
    expect(
      screen.getByText('Select both an origin and a destination to continue.'),
    ).toBeInTheDocument()
    await userEvent.selectOptions(screen.getByLabelText('Origin'), 'A')
    await userEvent.selectOptions(screen.getByLabelText('Destination'), 'B')
    expect(
      screen.getByText('Origin and destination selected.'),
    ).toBeInTheDocument()
  })

  it('preserves QPSO config when switching algorithms', async () => {
    renderPlan()
    await screen.findByTestId('map-stub')
    await userEvent.click(screen.getByLabelText(/^QPSO/))
    const seed = await screen.findByLabelText('Seed')
    await userEvent.clear(seed)
    await userEvent.type(seed, '7')
    await userEvent.click(screen.getByLabelText(/^Dijkstra/))
    expect(screen.queryByLabelText('Seed')).not.toBeInTheDocument()
    await userEvent.click(screen.getByLabelText(/^QPSO/))
    expect(screen.getByLabelText('Seed')).toHaveValue(7)
  })

  it('clearing an endpoint clears the stale selection error', async () => {
    renderPlan()
    await screen.findByTestId('map-stub')
    await userEvent.click(screen.getByRole('button', { name: /^node-A/ }))
    await userEvent.click(screen.getByRole('button', { name: /^node-A/ }))
    expect(
      screen.getByText('Origin and destination must be different nodes.'),
    ).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /clear origin/i }))
    expect(
      screen.queryByText('Origin and destination must be different nodes.'),
    ).not.toBeInTheDocument()
  })
})

describe('RoutePlannerPage job submission & polling', () => {
  const JOB = {
    id: 'job-1', scenarioId: 's1', status: 'QUEUED' as const, algorithm: 'DIJKSTRA' as const,
    createdAt: '2025-01-01T00:00:00Z', finishedAt: null, errorMessage: null,
  }

  async function setupWithEndpoints() {
    renderPlan()
    await screen.findByTestId('map-stub')
    await userEvent.selectOptions(screen.getByLabelText('Origin'), 'A')
    await userEvent.selectOptions(screen.getByLabelText('Destination'), 'B')
  }

  beforeEach(() => {
    vi.resetAllMocks()
    vi.mocked(resources.getScenario).mockResolvedValue(SC)
  })

  it('submits a job and shows QUEUED status', async () => {
    vi.mocked(resources.submitJob).mockResolvedValue(JOB)
    vi.mocked(resources.getJob).mockResolvedValue(JOB)
    await setupWithEndpoints()
    await userEvent.click(screen.getByRole('button', { name: /run optimization/i }))
    await waitFor(() =>
      expect(resources.submitJob).toHaveBeenCalledWith(
        's1',
        expect.objectContaining({
          algorithm: 'DIJKSTRA',
          sourceNodeId: 'A',
          targetNodeId: 'B',
          parameters: {},
        }),
        null,
      ),
    )
    expect(await screen.findByText(/QUEUED/)).toBeInTheDocument()
  })

  it('polls through QUEUED→RUNNING→COMPLETED', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    try {
      vi.mocked(resources.submitJob).mockResolvedValue(JOB)
      vi.mocked(resources.getJobResult).mockResolvedValue({
        jobId: 'job-1', feasible: true, route: {}, metrics: null,
        runtimeMs: null, algorithmMetadata: null,
      })
      vi.mocked(resources.getJob)
        .mockResolvedValueOnce({ ...JOB, status: 'RUNNING' })
        .mockResolvedValue({ ...JOB, status: 'COMPLETED' })
      await setupWithEndpoints()
      await userEvent.click(screen.getByRole('button', { name: /run optimization/i }))
      await vi.advanceTimersByTimeAsync(2100)
      expect(await screen.findByText(/RUNNING/)).toBeInTheDocument()
      await vi.advanceTimersByTimeAsync(2100)
      expect(await screen.findByText(/COMPLETED/)).toBeInTheDocument()
    } finally {
      vi.useRealTimers()
    }
  })

  it('stops polling on FAILED and shows error', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    try {
      vi.mocked(resources.submitJob).mockResolvedValue(JOB)
      vi.mocked(resources.getJob).mockResolvedValue({
        ...JOB, status: 'FAILED', errorMessage: 'optimizer exploded',
      })
      await setupWithEndpoints()
      await userEvent.click(screen.getByRole('button', { name: /run optimization/i }))
      await vi.advanceTimersByTimeAsync(2100)
      expect(await screen.findByText('optimizer exploded')).toBeInTheDocument()
      const calls = vi.mocked(resources.getJob).mock.calls.length
      await vi.advanceTimersByTimeAsync(10000)
      expect(vi.mocked(resources.getJob).mock.calls.length).toBe(calls)
    } finally {
      vi.useRealTimers()
    }
  })

  it('blocks submission without endpoints', async () => {
    renderPlan()
    await screen.findByTestId('map-stub')
    const btn = screen.getByRole('button', { name: /run optimization/i })
    expect(btn).toBeDisabled()
    expect(resources.submitJob).not.toHaveBeenCalled()
  })

  it('shows API error on submit failure', async () => {
    vi.mocked(resources.submitJob).mockRejectedValue(
      new ApiError(503, 'STARTUP_RECOVERY_IN_PROGRESS', 'recovering'),
    )
    await setupWithEndpoints()
    await userEvent.click(screen.getByRole('button', { name: /run optimization/i }))
    expect(await screen.findByRole('alert')).toBeInTheDocument()
  })
})

describe('RoutePlannerPage result retrieval', () => {
  const JOB = {
    id: 'job-1', scenarioId: 's1', status: 'QUEUED' as const,
    algorithm: 'DIJKSTRA' as const,
    createdAt: '2025-01-01T00:00:00Z', finishedAt: null, errorMessage: null,
  }
  const RESULT = {
    jobId: 'job-1', feasible: true,
    route: { nodeIds: ['A', 'B'], edgeIds: ['e1'], geometry: null },
    metrics: {
      distanceMeters: 1000, estimatedTravelTimeSeconds: 60,
      congestionPenalty: 0.1, objectiveValue: 0.4,
    },
    runtimeMs: 10, algorithmMetadata: null,
  }

  beforeEach(() => {
    vi.resetAllMocks()
    vi.mocked(resources.getScenario).mockResolvedValue(SC)
  })

  async function completeJob() {
    vi.mocked(resources.submitJob).mockResolvedValue(JOB)
    vi.mocked(resources.getJob).mockResolvedValue({ ...JOB, status: 'COMPLETED' })
    renderPlan()
    await screen.findByTestId('map-stub')
    await userEvent.selectOptions(screen.getByLabelText('Origin'), 'A')
    await userEvent.selectOptions(screen.getByLabelText('Destination'), 'B')
    await userEvent.click(screen.getByRole('button', { name: /run optimization/i }))
  }

  it('fetches and displays result on COMPLETED', async () => {
    vi.mocked(resources.getJobResult).mockResolvedValue(RESULT)
    await completeJob()
    expect(await screen.findByText('Optimized route')).toBeInTheDocument()
    expect(screen.getByText('A → B')).toBeInTheDocument()
    expect(vi.mocked(resources.getJobResult)).toHaveBeenCalledWith('job-1', null)
  })

  it('shows infeasible result without route data', async () => {
    vi.mocked(resources.getJobResult).mockResolvedValue({
      ...RESULT, feasible: false, route: {}, metrics: null,
    })
    await completeJob()
    expect(await screen.findByText('No feasible route')).toBeInTheDocument()
  })

  it('handles result 404 as error, not success', async () => {
    vi.mocked(resources.getJobResult).mockRejectedValue(
      new ApiError(404, 'NOT_FOUND', 'no result'),
    )
    await completeJob()
    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(screen.queryByText('Optimized route')).not.toBeInTheDocument()
  })
})

describe('RoutePlannerPage polling reliability', () => {
  const JOB = {
    id: 'job-1', scenarioId: 's1', status: 'QUEUED' as const,
    algorithm: 'DIJKSTRA' as const,
    createdAt: '2025-01-01T00:00:00Z', finishedAt: null, errorMessage: null,
  }

  async function submitJob_() {
    vi.mocked(resources.submitJob).mockResolvedValue(JOB)
    renderPlan()
    await screen.findByTestId('map-stub')
    await userEvent.selectOptions(screen.getByLabelText('Origin'), 'A')
    await userEvent.selectOptions(screen.getByLabelText('Destination'), 'B')
    await userEvent.click(screen.getByRole('button', { name: /run optimization/i }))
  }

  beforeEach(() => {
    vi.resetAllMocks()
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.mocked(resources.getScenario).mockResolvedValue(SC)
  })

  it('stops polling immediately on 401', async () => {
    try {
      vi.mocked(resources.getJob).mockRejectedValue(
        new ApiError(401, 'INVALID_CREDENTIALS', 'expired'),
      )
      await submitJob_()
      await vi.advanceTimersByTimeAsync(2100)
      expect(await screen.findByText(/session has expired/i)).toBeInTheDocument()
      const calls = vi.mocked(resources.getJob).mock.calls.length
      await vi.advanceTimersByTimeAsync(10000)
      expect(vi.mocked(resources.getJob).mock.calls.length).toBe(calls)
    } finally {
      vi.useRealTimers()
    }
  })

  it('keeps polling through transient 503s', async () => {
    try {
      vi.mocked(resources.getJob)
        .mockRejectedValueOnce(new ApiError(503, 'X', 'unavailable'))
        .mockResolvedValue({ ...JOB, status: 'COMPLETED' })
      vi.mocked(resources.getJobResult).mockResolvedValue({
        jobId: 'job-1', feasible: true, route: {}, metrics: null,
        runtimeMs: null, algorithmMetadata: null,
      })
      await submitJob_()
      await vi.advanceTimersByTimeAsync(2100) // first tick: 503
      await vi.advanceTimersByTimeAsync(2100) // second tick: COMPLETED
      expect(await screen.findByText(/COMPLETED/)).toBeInTheDocument()
    } finally {
      vi.useRealTimers()
    }
  })

  it('keeps polling through network errors', async () => {
    try {
      vi.mocked(resources.getJob)
        .mockRejectedValueOnce(new TypeError('fetch failed'))
        .mockResolvedValue({ ...JOB, status: 'RUNNING' })
      await submitJob_()
      await vi.advanceTimersByTimeAsync(2100)
      await vi.advanceTimersByTimeAsync(2100)
      expect(vi.mocked(resources.getJob).mock.calls.length).toBeGreaterThanOrEqual(2)
    } finally {
      vi.useRealTimers()
    }
  })

  it('Check again resumes polling the same job without resubmitting', async () => {
    try {
      vi.mocked(resources.getJob).mockResolvedValue({ ...JOB, status: 'RUNNING' })
      await submitJob_()
      // force deadline expiry
      await vi.advanceTimersByTimeAsync(95_000)
      expect(await screen.findByText(/taking longer than expected/i)).toBeInTheDocument()
      const submitCalls = vi.mocked(resources.submitJob).mock.calls.length
      vi.mocked(resources.getJob).mockResolvedValue({ ...JOB, status: 'COMPLETED' })
      vi.mocked(resources.getJobResult).mockResolvedValue({
        jobId: 'job-1', feasible: true, route: {}, metrics: null,
        runtimeMs: null, algorithmMetadata: null,
      })
      await userEvent.click(screen.getByRole('button', { name: /check again/i }))
      await vi.advanceTimersByTimeAsync(2100)
      expect(await screen.findByText(/COMPLETED/)).toBeInTheDocument()
      expect(vi.mocked(resources.submitJob).mock.calls.length).toBe(submitCalls)
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('RoutePlannerPage algorithm comparison', () => {
  const mkJob = (id: string, algo: string) => ({
    id, scenarioId: 's1', status: 'QUEUED' as const,
    algorithm: algo as 'DIJKSTRA',
    createdAt: '2025-01-01T00:00:00Z', finishedAt: null, errorMessage: null,
  })

  beforeEach(() => {
    vi.resetAllMocks()
    vi.mocked(resources.getScenario).mockResolvedValue(SC)
    vi.mocked(resources.getJob).mockImplementation(async (id) => mkJob(id, 'DIJKSTRA'))
    vi.mocked(resources.getJobResult).mockResolvedValue({
      jobId: 'x', feasible: true, route: {}, metrics: null,
      runtimeMs: null, algorithmMetadata: null,
    })
  })

  async function setupCompare() {
    renderPlan()
    await screen.findByTestId('map-stub')
    await userEvent.selectOptions(screen.getByLabelText('Origin'), 'A')
    await userEvent.selectOptions(screen.getByLabelText('Destination'), 'B')
  }

  it('submits three jobs in order with shared config', async () => {
    vi.mocked(resources.submitJob)
      .mockResolvedValueOnce(mkJob('j1', 'DIJKSTRA'))
      .mockResolvedValueOnce(mkJob('j2', 'ASTAR'))
      .mockResolvedValueOnce(mkJob('j3', 'QPSO'))
    vi.mocked(resources.getJob).mockImplementation(async (id) =>
      mkJob(id, 'DIJKSTRA'))
    await setupCompare()
    await userEvent.click(screen.getByRole('button', { name: /compare algorithms/i }))
    await waitFor(() =>
      expect(resources.submitJob).toHaveBeenCalledTimes(3))
    const algos = vi.mocked(resources.submitJob).mock.calls.map(
      (c) => (c[1] as { algorithm: string }).algorithm)
    expect(algos).toEqual(['DIJKSTRA', 'ASTAR', 'QPSO'])
    for (const c of vi.mocked(resources.submitJob).mock.calls) {
      expect(c[1]).toMatchObject({ sourceNodeId: 'A', targetNodeId: 'B' })
    }
    expect(
      (vi.mocked(resources.submitJob).mock.calls[0][1] as { parameters: unknown }).parameters,
    ).toEqual({})
  })

  it('retains submitted jobs when a later submission fails', async () => {
    vi.mocked(resources.submitJob)
      .mockResolvedValueOnce(mkJob('j1', 'DIJKSTRA'))
      .mockRejectedValueOnce(new ApiError(500, 'X', 'boom'))
    await setupCompare()
    await userEvent.click(screen.getByRole('button', { name: /compare algorithms/i }))
    expect(await screen.findByText(/boom/i)).toBeInTheDocument()
    // retained job renders as its own card
    expect(screen.getByLabelText('DIJKSTRA result')).toBeInTheDocument()
  })

  it('flags graph version drift', async () => {
    vi.mocked(resources.submitJob)
      .mockResolvedValueOnce(mkJob('j1', 'DIJKSTRA'))
      .mockResolvedValueOnce(mkJob('j2', 'ASTAR'))
      .mockResolvedValueOnce(mkJob('j3', 'QPSO'))
    vi.mocked(resources.getJob).mockResolvedValue(mkJob('j1', 'DIJKSTRA'))
    // getScenario called twice: initial load (v1) then post-submit check (v2)
    vi.mocked(resources.getScenario)
      .mockResolvedValueOnce(SC)
      .mockResolvedValue({ ...SC, graphVersion: 'v2' })
    await setupCompare()
    await userEvent.click(screen.getByRole('button', { name: /compare algorithms/i }))
    expect(
      await screen.findByText(/may not be consistent/i),
    ).toBeInTheDocument()
  })

  it('prevents duplicate comparison submissions', async () => {
    let resolveSubmit: (v: unknown) => void = () => {}
    vi.mocked(resources.submitJob)
      .mockImplementationOnce(
        () => new Promise((r) => { resolveSubmit = r }) as never)
      .mockResolvedValueOnce(mkJob('jx', 'ASTAR'))
      .mockResolvedValueOnce(mkJob('jy', 'QPSO'))
    await setupCompare()
    const btn = screen.getByRole('button', { name: /compare algorithms/i })
    await userEvent.click(btn)
    await userEvent.click(btn)
    expect(resources.submitJob).toHaveBeenCalledTimes(1)
    // resolve pending submission so no async work outlives the test
    resolveSubmit(mkJob('j1', 'DIJKSTRA'))
    await vi.waitFor(() =>
      expect(screen.queryByText(/submitting comparison/i)).not.toBeInTheDocument())
  })
})

describe('RoutePlannerPage comparison deadline', () => {
  const mkJob = (id: string, algo: string) => ({
    id, scenarioId: 's1', status: 'QUEUED' as const,
    algorithm: algo as 'DIJKSTRA',
    createdAt: '2025-01-01T00:00:00Z', finishedAt: null, errorMessage: null,
  })

  beforeEach(() => {
    vi.resetAllMocks()
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.mocked(resources.getScenario).mockResolvedValue(SC)
    vi.mocked(resources.getJob).mockImplementation(async (id) => mkJob(id, 'DIJKSTRA'))
    vi.mocked(resources.getJobResult).mockResolvedValue({
      jobId: 'x', feasible: true, route: {}, metrics: null,
      runtimeMs: null, algorithmMetadata: null,
    })
  })

  it('times out after 90s and Check again resumes same jobs', async () => {
    try {
      vi.mocked(resources.submitJob)
        .mockResolvedValueOnce(mkJob('j1', 'DIJKSTRA'))
        .mockResolvedValueOnce(mkJob('j2', 'ASTAR'))
        .mockResolvedValueOnce(mkJob('j3', 'QPSO'))
      vi.mocked(resources.getJob).mockImplementation(async (id) =>
        mkJob(id, 'DIJKSTRA'))
      renderPlan()
      await screen.findByTestId('map-stub')
      await userEvent.selectOptions(screen.getByLabelText('Origin'), 'A')
      await userEvent.selectOptions(screen.getByLabelText('Destination'), 'B')
      await userEvent.click(screen.getByRole('button', { name: /compare algorithms/i }))
      await vi.advanceTimersByTimeAsync(95_000)
      expect(await screen.findByText(/taking longer than expected/i)).toBeInTheDocument()
      const getJobCalls = vi.mocked(resources.getJob).mock.calls.length
      await vi.advanceTimersByTimeAsync(10_000)
      expect(vi.mocked(resources.getJob).mock.calls.length).toBe(getJobCalls)
      // resume
      vi.mocked(resources.getJob).mockImplementation(async (id) =>
        ({ ...mkJob(id, 'DIJKSTRA'), status: 'COMPLETED' as const }))
      await userEvent.click(screen.getByRole('button', { name: /check again/i }))
      await vi.advanceTimersByTimeAsync(2100)
      expect(
        (await screen.findAllByText('COMPLETED')).length,
      ).toBeGreaterThanOrEqual(3)
      expect(resources.submitJob).toHaveBeenCalledTimes(3) // no resubmission
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('RoutePlannerPage multi-route overlay', () => {
  const mkJob = (id: string, algo: string) => ({
    id, scenarioId: 's1', status: 'COMPLETED' as const,
    algorithm: algo as 'DIJKSTRA',
    createdAt: '2025-01-01T00:00:00Z', finishedAt: null, errorMessage: null,
  })
  const mkRes = (jobId: string) => ({
    jobId, feasible: true,
    route: { nodeIds: ['A', 'B'], edgeIds: [], geometry: null },
    metrics: null, runtimeMs: null, algorithmMetadata: null,
  })

  beforeEach(() => {
    vi.resetAllMocks()
    vi.mocked(resources.getScenario).mockResolvedValue(SC)
    vi.mocked(resources.submitJob)
      .mockResolvedValueOnce(mkJob('j1', 'DIJKSTRA'))
      .mockResolvedValueOnce(mkJob('j2', 'ASTAR'))
      .mockResolvedValueOnce(mkJob('j3', 'QPSO'))
    vi.mocked(resources.getJob).mockImplementation(async (id) => mkJob(id, 'DIJKSTRA'))
    vi.mocked(resources.getJobResult).mockImplementation(async (id) => mkRes(id))
  })

  it('passes all three feasible routes to the map', async () => {
    renderPlan()
    await screen.findByTestId('map-stub')
    await userEvent.selectOptions(screen.getByLabelText('Origin'), 'A')
    await userEvent.selectOptions(screen.getByLabelText('Destination'), 'B')
    await userEvent.click(screen.getByRole('button', { name: /compare algorithms/i }))
    await waitFor(() =>
      expect(screen.getByTestId('map-stub')).toHaveAttribute('data-routes', '3'))
  })

  it('toggling a route removes it from the map', async () => {
    renderPlan()
    await screen.findByTestId('map-stub')
    await userEvent.selectOptions(screen.getByLabelText('Origin'), 'A')
    await userEvent.selectOptions(screen.getByLabelText('Destination'), 'B')
    await userEvent.click(screen.getByRole('button', { name: /compare algorithms/i }))
    await waitFor(() =>
      expect(screen.getByTestId('map-stub')).toHaveAttribute('data-routes', '3'))
    await userEvent.click(
      screen.getByLabelText('Toggle QPSO route on map'))
    await waitFor(() =>
      expect(screen.getByTestId('map-stub')).toHaveAttribute('data-routes', '2'))
  })

  it('infeasible results are not drawn', async () => {
    vi.mocked(resources.getJobResult).mockImplementation(async (id) => ({
      ...mkRes(id),
      feasible: id !== 'j3',
      route: id === 'j3' ? {} : { nodeIds: ['A', 'B'], edgeIds: [] },
      metrics: null,
    }))
    renderPlan()
    await screen.findByTestId('map-stub')
    await userEvent.selectOptions(screen.getByLabelText('Origin'), 'A')
    await userEvent.selectOptions(screen.getByLabelText('Destination'), 'B')
    await userEvent.click(screen.getByRole('button', { name: /compare algorithms/i }))
    await waitFor(() =>
      expect(screen.getByTestId('map-stub')).toHaveAttribute('data-routes', '2'))
  })
})

describe('RoutePlannerPage result loading regression', () => {
  const JOB = {
    id: 'job-1', scenarioId: 's1', status: 'QUEUED' as const,
    algorithm: 'DIJKSTRA' as const,
    createdAt: '2025-01-01T00:00:00Z', finishedAt: null, errorMessage: null,
  }
  const RESULT = {
    jobId: 'job-1', feasible: true,
    route: { nodeIds: ['A', 'B'], edgeIds: ['e1'], geometry: null },
    metrics: {
      distanceMeters: 1000, estimatedTravelTimeSeconds: 60,
      congestionPenalty: 0.1, objectiveValue: 0.4,
    },
    runtimeMs: 10, algorithmMetadata: null,
  }

  beforeEach(() => {
    vi.resetAllMocks()
    vi.mocked(resources.getScenario).mockResolvedValue(SC)
  })

  async function runToCompleted() {
    vi.mocked(resources.submitJob).mockResolvedValue(JOB)
    vi.mocked(resources.getJob).mockResolvedValue({ ...JOB, status: 'COMPLETED' })
    renderPlan()
    await screen.findByTestId('map-stub')
    await userEvent.selectOptions(screen.getByLabelText('Origin'), 'A')
    await userEvent.selectOptions(screen.getByLabelText('Destination'), 'B')
    await userEvent.click(screen.getByRole('button', { name: /run optimization/i }))
  }

  it('renders result after a delayed network response and clears loading', async () => {
    // real async delay — reproduces the cancelled-in-flight bug
    vi.mocked(resources.getJobResult).mockImplementation(
      () => new Promise((r) => setTimeout(() => r(RESULT), 50)),
    )
    await runToCompleted()
    expect(await screen.findByText('Loading result…')).toBeInTheDocument()
    expect(await screen.findByText('Optimized route')).toBeInTheDocument()
    expect(screen.queryByText('Loading result…')).not.toBeInTheDocument()
    expect(vi.mocked(resources.getJobResult)).toHaveBeenCalledTimes(1)
  })

  it('clears loading and shows error on result-fetch failure', async () => {
    vi.mocked(resources.getJobResult).mockImplementation(
      () => new Promise((_, rej) => setTimeout(
        () => rej(new ApiError(500, 'X', 'boom')), 20)),
    )
    await runToCompleted()
    expect(await screen.findByText('Loading result…')).toBeInTheDocument()
    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(screen.queryByText('Loading result…')).not.toBeInTheDocument()
  })
})
