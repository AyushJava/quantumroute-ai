import { describe, expect, it } from 'vitest'
import {
  DEFAULT_QPSO,
  DEFAULT_WEIGHTS,
  buildParameters,
  buildQpsoParams,
  validateQpso,
  validateWeights,
} from './routeConfig'

describe('validateWeights', () => {
  it('accepts backend defaults', () => {
    expect(validateWeights(DEFAULT_WEIGHTS)).toEqual([])
  })
  it('rejects all-zero weights', () => {
    expect(validateWeights({ alpha: 0, beta: 0, gamma: 0 }).length).toBeGreaterThan(0)
  })
  it('rejects negative and non-finite values', () => {
    expect(validateWeights({ alpha: -0.1, beta: 0.5, gamma: 0.5 }).length).toBe(1)
    expect(validateWeights({ alpha: NaN, beta: 0.5, gamma: 0.5 }).length).toBe(1)
  })
  it('does not require sum == 1', () => {
    expect(validateWeights({ alpha: 2, beta: 2, gamma: 2 })).toEqual([])
  })
})

describe('validateQpso', () => {
  it('accepts defaults', () => {
    expect(validateQpso(DEFAULT_QPSO)).toEqual([])
  })
  it('requires seed', () => {
    expect(validateQpso({ ...DEFAULT_QPSO, seed: '' }).join()).toMatch(/seed/i)
  })
  it('rejects non-integer and non-positive numerics', () => {
    expect(validateQpso({ ...DEFAULT_QPSO, particles: '1.5' }).length).toBeGreaterThan(0)
    expect(validateQpso({ ...DEFAULT_QPSO, particles: '0' }).length).toBeGreaterThan(0)
    expect(validateQpso({ ...DEFAULT_QPSO, seed: '-1' }).length).toBeGreaterThan(0)
  })
  it('enforces theta_end <= theta_start', () => {
    expect(
      validateQpso({ ...DEFAULT_QPSO, thetaStart: '0.5', thetaEnd: '1.0' }).join(),
    ).toMatch(/theta end/i)
  })
  it('rejects non-positive optional values when provided', () => {
    expect(validateQpso({ ...DEFAULT_QPSO, maxSteps: '0' }).length).toBeGreaterThan(0)
    expect(validateQpso({ ...DEFAULT_QPSO, timeBudgetS: '-2' }).length).toBeGreaterThan(0)
  })
})

describe('buildParameters', () => {
  it('returns {} for DIJKSTRA and ASTAR', () => {
    expect(buildParameters('DIJKSTRA', DEFAULT_QPSO)).toEqual({})
    expect(buildParameters('ASTAR', DEFAULT_QPSO)).toEqual({})
  })
  it('returns camelCase QPSO params for QPSO', () => {
    const p = buildParameters('QPSO', DEFAULT_QPSO)
    expect(p).toMatchObject({
      particles: 30, maxIterations: 150, seed: 42,
      thetaStart: 1.0, thetaEnd: 0.5,
    })
    expect(p).not.toHaveProperty('timeBudgetS')
  })
  it('includes optional params only when set', () => {
    const p = buildQpsoParams({
      ...DEFAULT_QPSO,
      maxSteps: '50',
      timeBudgetS: '30',
      stagnationIters: '20',
    })
    expect(p).toMatchObject({ maxSteps: 50, timeBudgetS: 30, stagnationIters: 20 })
  })
})
