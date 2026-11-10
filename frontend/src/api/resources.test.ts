import { describe, expect, it, vi, beforeEach } from 'vitest'
import { submitJob, getJob, getJobResult } from './resources'
import { ApiError, API_BASE_URL } from './client'

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

const JOB = {
  id: 'job-1',
  scenarioId: 'sc-1',
  status: 'QUEUED',
  algorithm: 'DIJKSTRA',
  createdAt: '2025-01-01T00:00:00Z',
  finishedAt: null,
  errorMessage: null,
}

const RESULT = {
  jobId: 'job-1',
  feasible: true,
  route: { nodeIds: ['A', 'B'], edgeIds: ['e1'], geometry: null },
  metrics: {
    distanceMeters: 1200,
    estimatedTravelTimeSeconds: 100,
    congestionPenalty: 0.1,
    objectiveValue: 0.5,
  },
  runtimeMs: 42,
  algorithmMetadata: null,
}

describe('job API', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('submitJob posts to scenario jobs endpoint', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse(202, JOB),
    )
    const body = {
      algorithm: 'QPSO' as const,
      sourceNodeId: 'A',
      targetNodeId: 'C',
      objectiveWeights: { alpha: 0.6, beta: 0.25, gamma: 0.15 },
      parameters: { seed: 42 },
    }
    const res = await submitJob('sc-1', body, 'tok')
    expect(res.status).toBe('QUEUED')
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe(`${API_BASE_URL}/api/v1/scenarios/sc-1/jobs`)
    expect(init?.method).toBe('POST')
    expect(JSON.parse(init?.body as string)).toEqual(body)
    expect((init?.headers as Record<string, string>).Authorization)
      .toBe('Bearer tok')
  })

  it('getJob fetches job status', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse(200, { ...JOB, status: 'COMPLETED' }),
    )
    const res = await getJob('job-1', 'tok')
    expect(res.status).toBe('COMPLETED')
  })

  it('getJobResult returns feasible result with metrics', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse(200, RESULT),
    )
    const res = await getJobResult('job-1', 'tok')
    expect(res.feasible).toBe(true)
    expect(res.route.nodeIds).toEqual(['A', 'B'])
    expect(res.metrics?.distanceMeters).toBe(1200)
    expect(res.runtimeMs).toBe(42)
  })

  it('preserves infeasible result shape', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse(200, {
        ...RESULT, feasible: false, route: {}, metrics: null,
        algorithmMetadata: null,
      }),
    )
    const res = await getJobResult('job-1', 'tok')
    expect(res.feasible).toBe(false)
    expect(res.route.nodeIds).toBeUndefined()
    expect(res.metrics).toBeNull()
  })

  it('propagates ApiError on 404 result-not-ready', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse(404, {
        code: 'NOT_FOUND', message: 'not found', details: {}, traceId: 't',
      }),
    )
    await expect(getJobResult('job-1', 'tok')).rejects.toBeInstanceOf(ApiError)
  })

  it('propagates ApiError on submit failure', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse(409, {
        code: 'SCENARIO_NAME_EXISTS', message: 'dup', details: {}, traceId: 't',
      }),
    )
    await expect(
      submitJob('sc-1', {
        algorithm: 'DIJKSTRA', sourceNodeId: 'A', targetNodeId: 'B',
      }, 'tok'),
    ).rejects.toMatchObject({ status: 409 })
  })
})
