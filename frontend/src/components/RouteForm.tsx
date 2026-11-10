import { useState } from 'react'
import {
  ALGORITHMS,
  DEFAULT_QPSO,
  DEFAULT_WEIGHTS,
  validateQpso,
  validateWeights,
  type Algorithm,
  type ObjectiveWeights,
  type QpsoFormState,
} from '../routeConfig'

interface RouteFormProps {
  algorithm: Algorithm
  onAlgorithm: (a: Algorithm) => void
  weights: ObjectiveWeights
  onWeights: (w: ObjectiveWeights) => void
  qpso: QpsoFormState
  onQpso: (q: QpsoFormState) => void
}

const WEIGHT_LABELS: { key: keyof ObjectiveWeights; name: string; hint: string }[] = [
  { key: 'alpha', name: 'Travel time', hint: 'backend alpha' },
  { key: 'beta', name: 'Distance', hint: 'backend beta' },
  { key: 'gamma', name: 'Congestion', hint: 'backend gamma' },
]

const QPSO_FIELDS: {
  key: keyof QpsoFormState
  label: string
  hint: string
  optional?: boolean
}[] = [
  { key: 'particles', label: 'Particles', hint: 'Swarm size (default 30)' },
  { key: 'maxIterations', label: 'Max iterations', hint: 'Iteration budget (default 150)' },
  { key: 'seed', label: 'Seed', hint: 'Required — makes runs reproducible' },
  { key: 'thetaStart', label: 'Theta start', hint: 'Exploration coefficient, default 1.0' },
  { key: 'thetaEnd', label: 'Theta end', hint: 'Exploitation coefficient, default 0.5; must be ≤ start' },
  { key: 'maxSteps', label: 'Max steps', hint: 'Per-route decode budget; empty = 4×|V|', optional: true },
  { key: 'timeBudgetS', label: 'Time budget (s)', hint: 'Wall-clock cap; backend enforces timeout guard', optional: true },
  { key: 'stagnationIters', label: 'Stagnation iters', hint: 'Early stop; empty = disabled', optional: true },
]

export function RouteForm({ algorithm, onAlgorithm, weights, onWeights, qpso, onQpso }: RouteFormProps) {
  const weightErrs = validateWeights(weights)
  const qpsoErrs = algorithm === 'QPSO' ? validateQpso(qpso) : []
  const weightSum = weights.alpha + weights.beta + weights.gamma

  // Raw text for number inputs — numeric state only ever holds finite
  // numbers, so '' / 'e' / 'Infinity' can't leak NaN or silent zeros.
  const [weightText, setWeightText] = useState<Record<keyof ObjectiveWeights, string>>(() => ({
    alpha: String(weights.alpha),
    beta: String(weights.beta),
    gamma: String(weights.gamma),
  }))

  function onWeightSlider(key: keyof ObjectiveWeights, raw: string) {
    const n = Number(raw)
    setWeightText((prev) => ({ ...prev, [key]: String(n) }))
    onWeights({ ...weights, [key]: n })
  }

  function weightTextError(key: keyof ObjectiveWeights): string | null {
    const t = weightText[key].trim()
    if (t !== '' && !Number.isFinite(Number(t))) return 'Enter a valid number.'
    return null
  }

  function onWeightText(key: keyof ObjectiveWeights, raw: string) {
    setWeightText((prev) => ({ ...prev, [key]: raw }))
    const n = Number(raw)
    if (raw.trim() !== '' && Number.isFinite(n)) {
      onWeights({ ...weights, [key]: n })
    }
    // empty or non-finite text: keep last valid numeric value
  }

  return (
    <div className="route-form">
      <div className="section-title" style={{ marginTop: 'var(--space-5)' }}>
        Algorithm
      </div>
      <div className="algo-list" role="radiogroup" aria-label="Routing algorithm">
        {ALGORITHMS.map((a) => (
          <label
            key={a.id}
            className={`algo-option${algorithm === a.id ? ' active' : ''}`}
          >
            <input
              type="radio"
              name="algorithm"
              value={a.id}
              checked={algorithm === a.id}
              onChange={() => onAlgorithm(a.id)}
            />
            <span className="algo-text">
              <span className="algo-name">{a.label}</span>
              <span className="algo-blurb">{a.blurb}</span>
            </span>
          </label>
        ))}
      </div>

      <div className="section-title" style={{ marginTop: 'var(--space-5)' }}>
        Objective weights
      </div>
      <p className="field-hint" style={{ marginBottom: 'var(--space-3)' }}>
        Relative importance of each objective. Not required to sum to 1;
        at least one must be greater than zero.
      </p>
      {WEIGHT_LABELS.map(({ key, name, hint }) => (
        <div className="weight-row" key={key}>
          <label htmlFor={`w-${key}`} className="weight-label">
            {name} <span className="weight-hint">({hint})</span>
          </label>
          <input
            id={`w-${key}`}
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={weights[key]}
            onChange={(e) => onWeightSlider(key, e.target.value)}
            aria-valuetext={weights[key].toFixed(2)}
          />
          <input
            type="text"
            inputMode="decimal"
            className="weight-num"
            min={0}
            step={0.05}
            value={weightText[key]}
            onChange={(e) => onWeightText(key, e.target.value)}
            aria-label={`${name} value`}
            aria-invalid={weightTextError(key) !== null}
          />
          {weightTextError(key) && (
            <span className="field-error" role="alert">{weightTextError(key)}</span>
          )}
        </div>
      ))}
      <div className={`weight-sum${weightErrs.length ? ' invalid' : ''}`}>
        Sum: {weightSum.toFixed(2)}
        {weightErrs.length > 0 && ' — ' + weightErrs[0]}
      </div>

      {algorithm === 'QPSO' && (
        <>
          <div className="section-title" style={{ marginTop: 'var(--space-5)' }}>
            QPSO parameters
          </div>
          <p className="field-hint" style={{ marginBottom: 'var(--space-3)' }}>
            Quantum-inspired particle swarm — a classical metaheuristic, not
            quantum hardware. Identical seed + inputs give reproducible runs.
          </p>
          <div className="qpso-grid">
            {QPSO_FIELDS.map(({ key, label, hint, optional }) => (
              <div className="field" key={key}>
                <label htmlFor={`qpso-${key}`}>
                  {label}
                  {optional && <span className="field-hint"> (optional)</span>}
                </label>
                <input
                  id={`qpso-${key}`}
                  className="field-input"
                  type="number"
                  step={key === 'thetaStart' || key === 'thetaEnd' || key === 'timeBudgetS' ? 'any' : 1}
                  value={qpso[key]}
                  onChange={(e) => onQpso({ ...qpso, [key]: e.target.value })}
                />
                <span className="field-hint">{hint}</span>
              </div>
            ))}
          </div>
          {qpsoErrs.length > 0 && (
            <div className="form-error" role="alert" style={{ marginTop: 'var(--space-3)' }}>
              {qpsoErrs.map((e) => (
                <div key={e}>{e}</div>
              ))}
            </div>
          )}
        </>
      )}

      <p className="field-hint" style={{ marginTop: 'var(--space-4)' }}>
        Defaults: weights {DEFAULT_WEIGHTS.alpha}/{DEFAULT_WEIGHTS.beta}/{DEFAULT_WEIGHTS.gamma}
        {' · '}QPSO {DEFAULT_QPSO.particles} particles, {DEFAULT_QPSO.maxIterations} iterations.
        {' '}Run one algorithm or compare all three algorithms.
      </p>
    </div>
  )
}
