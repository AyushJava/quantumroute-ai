/** Route configuration model + validation, mirroring the backend contract.
 *  Backend: JobSubmitRequest{algorithm, sourceNodeId, targetNodeId,
 *  objectiveWeights{alpha,beta,gamma}, parameters{...camelCase QPSO fields}} */

export type Algorithm = 'DIJKSTRA' | 'ASTAR' | 'QPSO'

export const ALGORITHMS: { id: Algorithm; label: string; blurb: string }[] = [
  {
    id: 'DIJKSTRA',
    label: 'Dijkstra',
    blurb: 'Exact shortest path. Fast, deterministic, minimizes the weighted objective.',
  },
  {
    id: 'ASTAR',
    label: 'A*',
    blurb: 'Heuristic-guided shortest path. Same guarantees as Dijkstra, often faster.',
  },
  {
    id: 'QPSO',
    label: 'QPSO',
    blurb: 'Quantum-inspired particle swarm metaheuristic. Stochastic; seed makes runs reproducible. Not quantum hardware.',
  },
]

/** Backend defaults (optimizer/app/schemas/cost.py). NOTE: backend semantics —
 *  alpha = travel time, beta = distance, gamma = congestion. */
export interface ObjectiveWeights {
  alpha: number
  beta: number
  gamma: number
}

export const DEFAULT_WEIGHTS: ObjectiveWeights = {
  alpha: 0.6,
  beta: 0.25,
  gamma: 0.15,
}

/** QPSO form state — strings so partial/empty optional fields stay editable.
 *  Defaults mirror optimizer/app/schemas/qpso.py QpsoConfig. */
export interface QpsoFormState {
  particles: string
  maxIterations: string
  seed: string
  thetaStart: string
  thetaEnd: string
  maxSteps: string
  timeBudgetS: string
  stagnationIters: string
}

export const DEFAULT_QPSO: QpsoFormState = {
  particles: '30',
  maxIterations: '150',
  seed: '42',
  thetaStart: '1.0',
  thetaEnd: '0.5',
  maxSteps: '',
  timeBudgetS: '',
  stagnationIters: '',
}

export function validateWeights(w: ObjectiveWeights): string[] {
  const errs: string[] = []
  for (const [k, v] of Object.entries(w)) {
    if (!Number.isFinite(v)) errs.push(`${k} must be a finite number.`)
    else if (v < 0) errs.push(`${k} must be non-negative.`)
  }
  if (w.alpha === 0 && w.beta === 0 && w.gamma === 0) {
    errs.push('At least one weight must be greater than zero.')
  }
  return errs
}

function intField(label: string, raw: string, errs: string[]): number | null {
  if (raw.trim() === '') {
    errs.push(`${label} is required.`)
    return null
  }
  const n = Number(raw)
  if (!Number.isInteger(n)) {
    errs.push(`${label} must be an integer.`)
    return null
  }
  return n
}

function optIntField(label: string, raw: string, errs: string[]): number | null {
  if (raw.trim() === '') return null
  return intField(label, raw, errs)
}

function numField(label: string, raw: string, errs: string[]): number | null {
  if (raw.trim() === '') return null
  const n = Number(raw)
  if (!Number.isFinite(n)) {
    errs.push(`${label} must be a finite number.`)
    return null
  }
  return n
}

/** Mirrors QpsoConfig/QpsoParameters constraints. Backend owns the
 *  timeBudgetS-vs-read-timeout guard — intentionally not duplicated here. */
export function validateQpso(s: QpsoFormState): string[] {
  const errs: string[] = []
  const particles = intField('Particles', s.particles, errs)
  const maxIter = intField('Max iterations', s.maxIterations, errs)
  const seed = intField('Seed', s.seed, errs)
  const thetaStart = numField('Theta start', s.thetaStart, errs)
  const thetaEnd = numField('Theta end', s.thetaEnd, errs)
  optIntField('Max steps', s.maxSteps, errs)
  numField('Time budget (s)', s.timeBudgetS, errs)
  optIntField('Stagnation iterations', s.stagnationIters, errs)

  if (particles !== null && particles <= 0) errs.push('Particles must be > 0.')
  if (maxIter !== null && maxIter <= 0) errs.push('Max iterations must be > 0.')
  if (seed !== null && seed < 0) errs.push('Seed must be ≥ 0.')
  if (thetaStart !== null && thetaStart <= 0) errs.push('Theta start must be > 0.')
  if (thetaEnd !== null && thetaEnd <= 0) errs.push('Theta end must be > 0.')
  if (thetaStart !== null && thetaEnd !== null && thetaEnd > thetaStart) {
    errs.push('Theta end must be ≤ theta start.')
  }
  for (const [label, raw] of [
    ['Max steps', s.maxSteps],
    ['Stagnation iterations', s.stagnationIters],
  ] as const) {
    if (raw.trim() !== '' && Number.isInteger(Number(raw)) && Number(raw) <= 0) {
      errs.push(`${label} must be > 0.`)
    }
  }
  if (s.timeBudgetS.trim() !== '' && Number(s.timeBudgetS) <= 0) {
    errs.push('Time budget must be > 0.')
  }
  return errs
}

/** camelCase QPSO parameters; empty optionals omitted. Only call for QPSO. */
export function buildQpsoParams(s: QpsoFormState): Record<string, unknown> {
  const params: Record<string, unknown> = {
    particles: Number(s.particles),
    maxIterations: Number(s.maxIterations),
    seed: Number(s.seed),
    thetaStart: Number(s.thetaStart),
    thetaEnd: Number(s.thetaEnd),
  }
  if (s.maxSteps.trim() !== '') params.maxSteps = Number(s.maxSteps)
  if (s.timeBudgetS.trim() !== '') params.timeBudgetS = Number(s.timeBudgetS)
  if (s.stagnationIters.trim() !== '') {
    params.stagnationIters = Number(s.stagnationIters)
  }
  return params
}

/** parameters payload: {} for classical algorithms (backend rejects extras). */
export function buildParameters(
  algorithm: Algorithm,
  qpso: QpsoFormState,
): Record<string, unknown> {
  return algorithm === 'QPSO' ? buildQpsoParams(qpso) : {}
}
