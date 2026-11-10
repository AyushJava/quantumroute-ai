import { useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useAuth } from '../auth/useAuth'
import { getJob, getJobResult, getScenario, submitJob } from '../api/resources'
import type { JobAlgorithm } from '../api/types'
import { ApiError } from '../api/client'
import { friendlyApiMessage } from '../api/errors'
import type { JobResponse, JobResultResponse, ScenarioDetail } from '../api/types'
import { ScenarioMap, type SelectionRole } from '../components/map/ScenarioMap'
import { coordedNodeCount, hasCoords } from '../components/map/mapUtils'
import { RouteForm } from '../components/RouteForm'
import { RouteResultPanel } from '../components/RouteResultPanel'
import { ComparisonPanel } from '../components/ComparisonPanel'
import {
  buildParameters,
  DEFAULT_QPSO,
  DEFAULT_WEIGHTS,
  validateQpso,
  validateWeights,
  type Algorithm,
  type ObjectiveWeights,
  type QpsoFormState,
} from '../routeConfig'
import '../styles/map.css'

export function RoutePlannerPage() {
  const { scenarioId = '' } = useParams()
  const { token } = useAuth()
  const [scenario, setScenario] = useState<ScenarioDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [originId, setOriginId] = useState<string | null>(null)
  const [destId, setDestId] = useState<string | null>(null)
  const [mode, setMode] = useState<SelectionRole>('origin')
  const [selectionError, setSelectionError] = useState<string | null>(null)
  const [algorithm, setAlgorithm] = useState<Algorithm>('DIJKSTRA')
  const [weights, setWeights] = useState<ObjectiveWeights>(DEFAULT_WEIGHTS)
  const [qpso, setQpso] = useState<QpsoFormState>(DEFAULT_QPSO)

  const [job, setJob] = useState<JobResponse | null>(null)
  const [jobError, setJobError] = useState<string | null>(null)
  const [pollTimedOut, setPollTimedOut] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState<JobResultResponse | null>(null)
  const [resultLoading, setResultLoading] = useState(false)
  const [resultError, setResultError] = useState<string | null>(null)
  // Ref (not state): this flag must not trigger a re-render, which would
  // re-run the result effect and cancel its own in-flight request.
  const resultAttemptedRef = useRef(false)
  const [pollDeadline, setPollDeadline] = useState(() => Date.now() + 90_000)

  // Phase 5.6: algorithm comparison
  const [compJobs, setCompJobs] = useState<JobResponse[]>([])
  const [compSubmitting, setCompSubmitting] = useState(false)
  const [compError, setCompError] = useState<string | null>(null)
  const [compVersionDrift, setCompVersionDrift] = useState(false)
  const [compGraphVersion, setCompGraphVersion] = useState<string | null>(null)
  const [compTimedOut, setCompTimedOut] = useState(false)
  const [compDeadline, setCompDeadline] = useState(() => Date.now() + 90_000)
  const [compResults, setCompResults] = useState<Record<string, JobResultResponse>>({})
  const [compResultErrors, setCompResultErrors] = useState<Record<string, string>>({})
  const [visibleAlgos, setVisibleAlgos] = useState<Record<string, boolean>>({
    DIJKSTRA: true, ASTAR: true, QPSO: true,
  })
  const jobActive =
    job !== null &&
    (job.status === 'QUEUED' || job.status === 'RUNNING')

  useEffect(() => {
    let active = true
    queueMicrotask(() => {
      if (!active) return
      setScenario(null)
      setError(null)
      setOriginId(null)
      setDestId(null)
      setSelectionError(null)
      setJob(null)
      setJobError(null)
      setPollTimedOut(false)
      setSubmitting(false)
      setResult(null)
      setResultLoading(false)
      setResultError(null)
      resultAttemptedRef.current = false
      setPollDeadline(Date.now() + 90_000)
      setCompJobs([])
      setCompSubmitting(false)
      setCompError(null)
      setCompVersionDrift(false)
      setCompGraphVersion(null)
      setCompTimedOut(false)
      setCompDeadline(Date.now() + 90_000)
      setCompResults({})
      setCompResultErrors({})
      setVisibleAlgos({ DIJKSTRA: true, ASTAR: true, QPSO: true })
      setLoading(true)
      getScenario(scenarioId, token)
        .then((s) => active && setScenario(s))
        .catch((e) => active && setError(friendlyApiMessage(e)))
        .finally(() => active && setLoading(false))
    })
    return () => {
      active = false
    }
  }, [scenarioId, token])

  function assign(id: string, role: SelectionRole) {
    const other = role === 'origin' ? destId : originId
    if (id === other) {
      setSelectionError(
        'Origin and destination must be different nodes.',
      )
      return
    }
    setSelectionError(null)
    if (role === 'origin') setOriginId(id)
    else setDestId(id)
  }

  function handleNodeSelect(id: string) {
    assign(id, mode)
    // advance to destination after origin is set, for faster flow
    if (mode === 'origin' && id !== destId) setMode('destination')
  }

  // Poll job status every ~2s until terminal state or 90s client deadline.
  useEffect(() => {
    if (!job || !jobActive) return
    const jobId = job.id
    let cancelled = false
    let inFlight = false
    const deadline = pollDeadline

    const tick = async () => {
      if (cancelled || inFlight) return
      if (Date.now() > deadline) {
        cancelled = true
        clearInterval(interval)
        setPollTimedOut(true)
        return
      }
      inFlight = true
      try {
        const j = await getJob(jobId, token)
        if (cancelled) return
        setJob((prev) => (prev && prev.id === j.id ? j : prev))
        if (j.status === 'FAILED' || j.status === 'TIMEOUT') {
          setJobError(j.errorMessage || `Job ${j.status.toLowerCase()}.`)
        }
      } catch (e) {
        if (cancelled) return
        setJobError(friendlyApiMessage(e))
        // 401 = session expired; further polls are pointless — stop now.
        if (e instanceof ApiError && e.status === 401) {
          cancelled = true
          clearInterval(interval)
        }
      } finally {
        inFlight = false
      }
    }

    const interval = setInterval(() => void tick(), 2000)
    void tick()
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  // Deps intentionally omit the `job` object: adding it would re-subscribe
  // the interval on every status update and cancel in-flight ticks (same
  // churn fixed for comparison polling via compActiveKey). `job?.id` +
  // `jobActive` capture everything the effect actually reads.
  }, [job?.id, jobActive, token, pollDeadline]) // eslint-disable-line react-hooks/exhaustive-deps

  async function handleOptimize() {
    if (!originId || !destId || originId === destId || submitting || jobActive) {
      return
    }
    const wErrs = validateWeights(weights)
    const qErrs = algorithm === 'QPSO' ? validateQpso(qpso) : []
    if (wErrs.length || qErrs.length) {
      setJobError([...wErrs, ...qErrs][0])
      return
    }
    setSubmitting(true)
    setJobError(null)
    setPollTimedOut(false)
    setResult(null)
    setResultError(null)
    resultAttemptedRef.current = false
    try {
      const created = await submitJob(
        scenarioId,
        {
          algorithm,
          sourceNodeId: originId,
          targetNodeId: destId,
          objectiveWeights: weights,
          parameters: buildParameters(algorithm, qpso),
        },
        token,
      )
      setJob(created)
    } catch (e) {
      setJobError(friendlyApiMessage(e))
    } finally {
      setSubmitting(false)
    }
  }

  // Fetch result once when the job reaches COMPLETED.
  // Deps exclude result/resultLoading/resultAttemptedRef: those are outputs
  // of this effect, and including them would cancel the in-flight request
  // via cleanup. job?.id + job?.status identify the job; token covers auth.
  useEffect(() => {
    if (!job || job.status !== 'COMPLETED' || result || resultLoading || resultAttemptedRef.current) return
    resultAttemptedRef.current = true
    const jobId = job.id
    let cancelled = false
    setResultLoading(true)
    setResultError(null)
    getJobResult(jobId, token)
      .then((r) => {
        if (!cancelled) setResult(r)
      })
      .catch((e) => {
        if (!cancelled) setResultError(friendlyApiMessage(e))
      })
      .finally(() => {
        if (!cancelled) setResultLoading(false)
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job?.id, job?.status, token])

  // ---- Phase 5.6: comparison orchestration ----
  const COMPARISON_ALGOS: JobAlgorithm[] = ['DIJKSTRA', 'ASTAR', 'QPSO']

  async function handleCompare() {
    if (!originId || !destId || originId === destId || compSubmitting ||
        compJobs.some((j) => j.status === 'QUEUED' || j.status === 'RUNNING')) {
      return
    }
    const wErrs = validateWeights(weights)
    const qErrs = algorithm === 'QPSO' ? validateQpso(qpso) : []
    if (wErrs.length || qErrs.length) {
      setCompError([...wErrs, ...qErrs][0])
      return
    }
    setCompSubmitting(true)
    setCompError(null)
    setCompVersionDrift(false)
    setCompTimedOut(false)
    setCompDeadline(Date.now() + 90_000)
    setCompResults({})
    setCompResultErrors({})
    setVisibleAlgos({ DIJKSTRA: true, ASTAR: true, QPSO: true })
    setCompJobs([])
    const capturedVersion = scenario?.graphVersion ?? null
    setCompGraphVersion(capturedVersion)
    const submitted: JobResponse[] = []
    try {
      for (const algo of COMPARISON_ALGOS) {
        const created = await submitJob(
          scenarioId,
          {
            algorithm: algo,
            sourceNodeId: originId,
            targetNodeId: destId,
            objectiveWeights: weights,
            parameters: algo === 'QPSO' ? buildParameters('QPSO', qpso) : {},
          },
          token,
        )
        submitted.push(created)
        setCompJobs([...submitted])
      }
      // verify graph snapshot consistency
      try {
        const fresh = await getScenario(scenarioId, token)
        if (capturedVersion && fresh.graphVersion !== capturedVersion) {
          setCompVersionDrift(true)
        }
      } catch {
        // version check is best-effort; don't fail the comparison
      }
    } catch (e) {
      setCompError(friendlyApiMessage(e))
      if (submitted.length) setCompJobs(submitted)
    } finally {
      setCompSubmitting(false)
    }
  }

  // Keep a ref so the polling effect doesn't re-subscribe on every
  // compJobs status update (which would cancel in-flight ticks).
  const compJobsRef = useRef(compJobs)
  useEffect(() => {
    compJobsRef.current = compJobs
  }, [compJobs])
  const compActiveKey = compJobs
    .filter((j) => j.status === 'QUEUED' || j.status === 'RUNNING')
    .map((j) => j.id)
    .sort()
    .join(',')

  // Poll all active comparison jobs every ~2s until terminal.
  useEffect(() => {
    if (!compActiveKey) return
    const active = compJobsRef.current.filter(
      (j) => j.status === 'QUEUED' || j.status === 'RUNNING',
    )
    let cancelled = false
    let inFlight = false
    const tick = async () => {
      if (cancelled || inFlight) return
      if (Date.now() > compDeadline) {
        cancelled = true
        clearInterval(interval)
        setCompTimedOut(true)
        return
      }
      inFlight = true
      try {
        const updates = await Promise.all(
          active.map((j) => getJob(j.id, token).catch(() => null)),
        )
        if (cancelled) return
        setCompJobs((prev) =>
          prev.map((j) => {
            const u = updates[active.findIndex((a) => a.id === j.id)]
            return u && u.id === j.id ? u : j
          }),
        )
      } finally {
        inFlight = false
      }
    }
    const interval = setInterval(() => void tick(), 2000)
    void tick()
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [compActiveKey, token, compDeadline])

  // Fetch results for COMPLETED comparison jobs (once each).
  useEffect(() => {
    const pending = compJobs.filter(
      (j) => j.status === 'COMPLETED' && !compResults[j.id] && !compResultErrors[j.id],
    )
    if (pending.length === 0) return
    let cancelled = false
    queueMicrotask(() => {
      for (const j of pending) {
        getJobResult(j.id, token)
          .then((r) => {
            if (!cancelled) setCompResults((prev) => ({ ...prev, [j.id]: r }))
          })
          .catch((e) => {
            if (!cancelled) {
              setCompResultErrors((prev) => ({ ...prev, [j.id]: friendlyApiMessage(e) }))
            }
          })
      }
    })
    return () => {
      cancelled = true
    }
  }, [compJobs, compResults, compResultErrors, token])

  const nodes = scenario?.graph.nodes ?? []
  const coordedCount = scenario ? coordedNodeCount(scenario.graph) : 0

  const COMP_COLORS: Record<string, string> = {
    DIJKSTRA: '#4f6ef7', ASTAR: '#f59e0b', QPSO: '#8b5cf6',
  }
  const compRoutes = compJobs
    .filter((j) => visibleAlgos[j.algorithm] !== false)
    .map((j) => {
      const r = compResults[j.id]
      if (!r?.feasible) return null
      return {
        algorithm: j.algorithm,
        color: COMP_COLORS[j.algorithm] ?? '#22c55e',
        geometry: r.route.geometry ?? null,
        nodeIds: r.route.nodeIds ?? null,
      }
    })
    .filter((r): r is NonNullable<typeof r> => r !== null)

  return (
    <div>
      <div className="page-head">
        <div>
          <h2>Route planner</h2>
          <p className="page-sub">
            {scenario ? `${scenario.name} · graph ${scenario.graphVersion}` : ''}
          </p>
        </div>
      </div>

      {loading ? (
        <div className="loading-row">
          <span className="spinner-dark" /> Loading scenario…
        </div>
      ) : error ? (
        <div className="card">
          <div className="empty-state">
            <div className="empty-title">Could not load scenario</div>
            <div className="empty-sub">{error}</div>
          </div>
        </div>
      ) : scenario ? (
        <div className="plan-layout">
          <div className="plan-map">
            <ScenarioMap
              graph={scenario.graph}
              originId={originId}
              destId={destId}
              onNodeSelect={handleNodeSelect}
              routeGeometry={result?.feasible ? result.route.geometry ?? null : null}
              routeNodeIds={result?.feasible ? result.route.nodeIds ?? null : null}
              routes={compRoutes.length ? compRoutes : undefined}
            />
          </div>
          <aside className="plan-panel card section-card">
            <div className="section-title">Select route endpoints</div>
            <div className="section-sub" style={{ marginTop: 4 }}>
              {nodes.length} nodes · {scenario.graph.edges.length} edges ·{' '}
              {coordedCount} mappable
            </div>

            <div
              className="mode-toggle"
              role="group"
              aria-label="Selection mode"
            >
              <button
                className={`mode-btn${mode === 'origin' ? ' active' : ''}`}
                onClick={() => setMode('origin')}
                aria-pressed={mode === 'origin'}
              >
                Select Origin
              </button>
              <button
                className={`mode-btn${mode === 'destination' ? ' active' : ''}`}
                onClick={() => setMode('destination')}
                aria-pressed={mode === 'destination'}
              >
                Select Destination
              </button>
            </div>
            <p className="mode-hint">
              {mode === 'origin'
                ? 'Click a node on the map or pick from the list to set the origin.'
                : 'Click a node on the map or pick from the list to set the destination.'}
            </p>

            {(['origin', 'destination'] as const).map((role) => {
              const value = role === 'origin' ? originId : destId
              const label = role === 'origin' ? 'Origin' : 'Destination'
              return (
                <div className="field" key={role} style={{ marginTop: 'var(--space-3)' }}>
                  <label htmlFor={`sel-${role}`}>{label}</label>
                  <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
                    <select
                      id={`sel-${role}`}
                      className="field-input"
                      value={value ?? ''}
                      onChange={(e) =>
                        e.target.value && assign(e.target.value, role)
                      }
                    >
                      <option value="">— choose node —</option>
                      {nodes.map((n) => (
                        <option key={n.id} value={n.id}>
                          {n.id}
                          {hasCoords(n) ? '' : ' (no map coordinates)'}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      className="btn btn-ghost"
                      onClick={() => {
                        setSelectionError(null)
                        if (role === 'origin') setOriginId(null)
                        else setDestId(null)
                      }}
                      disabled={!value}
                      aria-label={`Clear ${label.toLowerCase()}`}
                    >
                      ✕
                    </button>
                  </div>
                </div>
              )
            })}

            <div
              className={originId && destId ? 'form-success' : 'field-hint'}
              role="status"
              style={{ marginTop: 'var(--space-3)' }}
            >
              {originId && destId
                ? 'Origin and destination selected.'
                : 'Select both an origin and a destination to continue.'}
            </div>

            {selectionError && (
              <div className="form-error" role="alert" style={{ marginTop: 'var(--space-3)' }}>
                {selectionError}
              </div>
            )}

            {nodes.length === 0 && (
              <div className="form-error" role="alert" style={{ marginTop: 'var(--space-3)' }}>
                This graph has no nodes — add nodes before planning a route.
              </div>
            )}

            <RouteForm
              algorithm={algorithm}
              onAlgorithm={setAlgorithm}
              weights={weights}
              onWeights={setWeights}
              qpso={qpso}
              onQpso={setQpso}
            />

            <button
              className="btn btn-primary"
              style={{ marginTop: 'var(--space-5)', width: '100%', justifyContent: 'center' }}
              onClick={handleOptimize}
              disabled={
                !originId ||
                !destId ||
                originId === destId ||
                submitting ||
                jobActive
              }
            >
              {submitting
                ? 'Submitting…'
                : jobActive
                  ? `Job ${job?.status.toLowerCase()}…`
                  : 'Run optimization'}
            </button>

            <button
              className="btn btn-secondary"
              style={{ marginTop: 'var(--space-2)', width: '100%', justifyContent: 'center' }}
              onClick={handleCompare}
              disabled={
                !originId || !destId || originId === destId ||
                compSubmitting ||
                compJobs.some((j) => j.status === 'QUEUED' || j.status === 'RUNNING')
              }
            >
              {compSubmitting ? 'Submitting comparison…' : 'Compare algorithms'}
            </button>

            {compVersionDrift && (
              <div className="form-error" role="alert" style={{ marginTop: 'var(--space-2)' }}>
                Scenario graph changed during submission — comparison results
                may not be consistent.
              </div>
            )}
            {compTimedOut && (
              <div className="form-error" role="alert" style={{ marginTop: 'var(--space-2)' }}>
                Comparison is taking longer than expected — jobs may still be
                processing.
                <button
                  type="button"
                  className="btn btn-secondary"
                  style={{ marginLeft: 'var(--space-3)' }}
                  onClick={() => {
                    setCompTimedOut(false)
                    setCompDeadline(Date.now() + 90_000)
                  }}
                >
                  Check again
                </button>
              </div>
            )}
            {compError && (
              <div className="form-error" role="alert" style={{ marginTop: 'var(--space-2)' }}>
                {compError}
              </div>
            )}
            {compJobs.length > 0 && (
              <ComparisonPanel
                jobs={compJobs}
                results={compResults}
                resultErrors={compResultErrors}
                graphVersion={compGraphVersion}
                visibleAlgos={visibleAlgos}
                onToggleAlgo={(a) =>
                  setVisibleAlgos((v) => ({ ...v, [a]: !v[a] }))
                }
              />
            )}

            {job && (
              <div
                className="job-status"
                role="status"
                style={{ marginTop: 'var(--space-3)' }}
              >
                {jobActive && <span className="spinner-dark" />}
                <span>
                  Job <strong>{job.status}</strong>
                  {job.status === 'COMPLETED' && ' — fetching results next'}
                </span>
              </div>
            )}
            {pollTimedOut && (
              <div className="form-error" role="alert" style={{ marginTop: 'var(--space-2)' }}>
                This job is taking longer than expected. It may still be
                processing — check back shortly.
                <button
                  type="button"
                  className="btn btn-secondary"
                  style={{ marginLeft: 'var(--space-3)' }}
                  onClick={() => {
                    setPollTimedOut(false)
                    setJobError(null)
                    setPollDeadline(Date.now() + 90_000)
                  }}
                >
                  Check again
                </button>
              </div>
            )}
            {jobError && (
              <div className="form-error" role="alert" style={{ marginTop: 'var(--space-3)' }}>
                {jobError}
              </div>
            )}

            {resultLoading && (
              <div className="job-status" role="status" style={{ marginTop: 'var(--space-3)' }}>
                <span className="spinner-dark" /> Loading result…
              </div>
            )}
            {resultError && (
              <div className="form-error" role="alert" style={{ marginTop: 'var(--space-3)' }}>
                {resultError}
              </div>
            )}
            {result && <RouteResultPanel result={result} />}
          </aside>
        </div>
      ) : null}
    </div>
  )
}
