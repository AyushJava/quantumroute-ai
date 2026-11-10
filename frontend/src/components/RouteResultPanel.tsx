import type { JobResultResponse } from '../api/types'
import { fmtDistance, fmtTime } from '../format'


export function RouteResultPanel({ result }: { result: JobResultResponse }) {
  const m = result.metrics
  const meta = result.algorithmMetadata

  if (!result.feasible) {
    return (
      <div className="card section-card" role="status">
        <div className="section-title">No feasible route</div>
        <p className="field-hint" style={{ marginTop: 4 }}>
          The optimizer could not find a route between the selected nodes
          (e.g. disconnected graph or closed edges). Try different endpoints.
        </p>
      </div>
    )
  }

  return (
    <div className="card section-card">
      <div className="section-title">Optimized route</div>
      <div className="detail-grid" style={{ marginTop: 'var(--space-4)', marginBottom: 0 }}>
        <div className="detail-item">
          <div className="di-label">Distance</div>
          <div className="di-value">{fmtDistance(m?.distanceMeters ?? null)}</div>
        </div>
        <div className="detail-item">
          <div className="di-label">Travel time</div>
          <div className="di-value">{fmtTime(m?.estimatedTravelTimeSeconds ?? null)}</div>
        </div>
        <div className="detail-item">
          <div className="di-label">Congestion</div>
          <div className="di-value">{m?.congestionPenalty?.toFixed(3) ?? '—'}</div>
        </div>
        <div className="detail-item">
          <div className="di-label">Objective</div>
          <div className="di-value">{m?.objectiveValue?.toFixed(4) ?? '—'}</div>
        </div>
        <div className="detail-item">
          <div className="di-label">Runtime</div>
          <div className="di-value">{result.runtimeMs != null ? `${result.runtimeMs} ms` : '—'}</div>
        </div>
      </div>

      {result.route.nodeIds && result.route.nodeIds.length > 0 && (
        <div style={{ marginTop: 'var(--space-4)' }}>
          <div className="di-label">Route</div>
          <div style={{ fontSize: 13, fontFamily: 'var(--font-mono)', marginTop: 4 }}>
            {result.route.nodeIds.join(' → ')}
          </div>
        </div>
      )}

      {meta && (
        <div style={{ marginTop: 'var(--space-4)', borderTop: '1px solid var(--border)', paddingTop: 'var(--space-3)' }}>
          <div className="di-label">QPSO metadata</div>
          <div className="detail-grid" style={{ marginTop: 'var(--space-2)', marginBottom: 0 }}>
            {meta.seed != null && (
              <div className="detail-item"><div className="di-label">Seed</div><div className="di-value">{meta.seed}</div></div>
            )}
            {meta.iterationsRun != null && (
              <div className="detail-item"><div className="di-label">Iterations</div><div className="di-value">{meta.iterationsRun}</div></div>
            )}
            {meta.usedRepair != null && (
              <div className="detail-item"><div className="di-label">Repair used</div><div className="di-value">{meta.usedRepair ? 'Yes' : 'No'}</div></div>
            )}
            {meta.repairRate != null && (
              <div className="detail-item"><div className="di-label">Repair rate</div><div className="di-value">{meta.repairRate.toFixed(3)}</div></div>
            )}
            {meta.feasibilityRate != null && (
              <div className="detail-item"><div className="di-label">Feasibility</div><div className="di-value">{meta.feasibilityRate.toFixed(3)}</div></div>
            )}
          </div>
          {meta.convergenceTrace && meta.convergenceTrace.length > 0 && (
            <div className="field-hint" style={{ marginTop: 'var(--space-2)' }}>
              Convergence trace: {meta.convergenceTrace.length} points
              {' '}({meta.convergenceTrace[0]?.toFixed(3)} → {meta.convergenceTrace[meta.convergenceTrace.length - 1]?.toFixed(3)})
            </div>
          )}
        </div>
      )}
    </div>
  )
}
