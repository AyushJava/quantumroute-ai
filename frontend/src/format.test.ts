import { describe, expect, it } from 'vitest'
import { fmtDistance, fmtTime } from './format'

describe('fmtDistance', () => {
  it('formats metres and kilometres', () => {
    expect(fmtDistance(500)).toBe('500 m')
    expect(fmtDistance(2500)).toBe('2.50 km')
    expect(fmtDistance(0)).toBe('0 m')
  })
  it('handles null/undefined', () => {
    expect(fmtDistance(null)).toBe('—')
    expect(fmtDistance(undefined)).toBe('—')
  })
})

describe('fmtTime', () => {
  it('formats seconds and minutes', () => {
    expect(fmtTime(45)).toBe('45 s')
    expect(fmtTime(245)).toBe('4m 5s')
    expect(fmtTime(60)).toBe('1m 0s')
  })
  it('handles null/undefined', () => {
    expect(fmtTime(null)).toBe('—')
    expect(fmtTime(undefined)).toBe('—')
  })
})
