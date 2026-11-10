import type { JobResponse, JobResultResponse } from '../api/types'
import { fmtDistance as fmtDist, fmtTime } from '../format'


interface Props {
  jobs: JobResponse[]
  results: Record<string, JobResultResponse>
  resultErrors: Record<string, string>
  graphVersion?: string | null
  visibleAlgos?: Record<string, boolean>
  onToggleAlgo?: (algorithm: string) => void
}

function AlgoCard({ job, result, error, visible, onToggle }: {
  job: JobResponse
  result?: JobResultResponse
  error?: string
  visible?: boolean
  onToggle?: () => void
}) {
  const active = job.status === 'QUEUED' || job.status === 'RUNNING'
  const m = result?.metrics
  const meta = result?.algorithmMetadata
  return (
    <div className="card comp-card" role="region" aria-label={`${job.algorithm} result`}>
      <div className="comp-card-head">
        <strong>{job.algorithm}</strong>
        <span className="comp-head-right">
          {onToggle && result?.feasible && (
            <label className="comp-toggle">
              <input
                type="checkbox"
                checked={visible !== false}
                onChange={onToggle}
                aria-label={`Toggle ${job.algorithm} route on map`}
              />
              Map
            </label>
          )}
          <span className={`comp-badge comp-${job.status.toLowerCase()}`}>
            {job.status}
          </span>
        </span>
      </div>
      {active && <div className="field-hint">Waiting for optimizer…</div>}
      {(job.status === 'FAILED' || job.status === 'TIMEOUT') && (
        <div className="form-error" role="alert">
          {job.errorMessage || `Job ${job.status.toLowerCase()}.`}
        </div>
      )}
      {error && <div className="form-error" role="alert">{error}</div>}
      {result && !result.feasible && (
        <div className="field-hint">No feasible route found.</div>
      )}
      {result?.feasible && (
        <>
          <dl className="comp-metrics">
            <div><dt>Distance</dt><dd>{fmtDist(m?.distanceMeters)}</dd></div>
            <div><dt>Time</dt><dd>{fmtTime(m?.estimatedTravelTimeSeconds)}</dd></div>
            <div><dt>Congestion</dt><dd>{m?.congestionPenalty?.toFixed(3) ?? '—'}</dd></div>
            <div><dt>Objective</dt><dd>{m?.objectiveValue?.toFixed(4) ?? '—'}</dd></div>
            <div><dt>Runtime</dt><dd>{result.runtimeMs != null ? `${result.runtimeMs} ms` : '—'}</dd></div>
          </dl>
          {job.algorithm === 'QPSO' && meta && (
            <div className="comp-qpso">
              <div className="di-label">QPSO</div>
              <dl className="comp-metrics">
                {meta.seed != null && <div><dt>Seed</dt><dd>{meta.seed}</dd></div>}
                {meta.iterationsRun != null && <div><dt>Iterations</dt><dd>{meta.iterationsRun}</dd></div>}
                {meta.usedRepair != null && <div><dt>Repair</dt><dd>{meta.usedRepair ? 'Yes' : 'No'}</dd></div>}
                {meta.repairRate != null && <div><dt>Repair rate</dt><dd>{meta.repairRate.toFixed(3)}</dd></div>}
                {meta.feasibilityRate != null && <div><dt>Feasible</dt><dd>{meta.feasibilityRate.toFixed(3)}</dd></div>}
              </dl>
            </div>
          )}
          {result.route.nodeIds && result.route.nodeIds.length > 0 && (
            <div className="comp-route">{result.route.nodeIds.join(' → ')}</div>
          )}
        </>
      )}
      {job.status === 'COMPLETED' && !result && !error && (
        <div className="field-hint">Loading result…</div>
      )}
    </div>
  )
}

export function ComparisonPanel({ jobs, results, resultErrors, graphVersion, visibleAlgos, onToggleAlgo }: Props) {
  if (jobs.length === 0) return null
  return (
    <div className="comp-panel">
      <div className="section-title" style={{ marginBottom: 4 }}>
        Algorithm comparison
      </div>
      {graphVersion && (
        <div className="field-hint" style={{ marginBottom: 'var(--space-3)' }}>
          graph {graphVersion}
        </div>
      )}
      <div className="comp-grid">
        {jobs.map((j) => (
          <AlgoCard
            key={j.id}
            job={j}
            result={results[j.id]}
            error={resultErrors[j.id]}
            visible={visibleAlgos?.[j.algorithm]}
            onToggle={onToggleAlgo ? () => onToggleAlgo(j.algorithm) : undefined}
          />
        ))}
      </div>
    </div>
  )
}
