import { describe, expect, it } from 'vitest'
import { useState } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { RouteForm } from './RouteForm'
import {
  DEFAULT_QPSO,
  DEFAULT_WEIGHTS,
  type Algorithm,
  type ObjectiveWeights,
  type QpsoFormState,
} from '../routeConfig'

function Harness() {
  const [algorithm, setAlgorithm] = useState<Algorithm>('DIJKSTRA')
  const [weights, setWeights] = useState<ObjectiveWeights>(DEFAULT_WEIGHTS)
  const [qpso, setQpso] = useState<QpsoFormState>(DEFAULT_QPSO)
  return (
    <RouteForm
      algorithm={algorithm}
      onAlgorithm={setAlgorithm}
      weights={weights}
      onWeights={setWeights}
      qpso={qpso}
      onQpso={setQpso}
    />
  )
}

const alphaInput = () => screen.getByLabelText('Travel time value')

describe('RouteForm weight inputs', () => {
  it('keeps backend defaults', () => {
    render(<Harness />)
    expect(alphaInput()).toHaveValue('0.6')
    expect(screen.getByText(/Sum: 1\.00/)).toBeInTheDocument()
  })

  it('clearing the input does not silently zero the weight', async () => {
    render(<Harness />)
    const input = alphaInput()
    await userEvent.clear(input)
    // numeric state retains last valid value; sum unchanged
    expect(screen.getByText(/Sum: 1\.00/)).toBeInTheDocument()
  })

  it('rejects invalid intermediate text without NaN in state', async () => {
    render(<Harness />)
    const input = alphaInput()
    await userEvent.clear(input)
    await userEvent.type(input, 'e')
    expect(screen.getByText('Enter a valid number.')).toBeInTheDocument()
    // slider still bound to a finite value — sum stays valid
    expect(screen.getByText(/Sum:/)).toBeInTheDocument()
  })

  it('rejects Infinity', async () => {
    render(<Harness />)
    const input = alphaInput()
    await userEvent.clear(input)
    await userEvent.type(input, 'Infinity')
    expect(screen.getByText('Enter a valid number.')).toBeInTheDocument()
  })

  it('accepts a valid zero weight when others are nonzero', async () => {
    render(<Harness />)
    const input = alphaInput()
    await userEvent.clear(input)
    await userEvent.type(input, '0')
    // sum becomes 0.40 — no all-zero error
    expect(screen.getByText(/Sum: 0\.40/)).toBeInTheDocument()
    expect(
      screen.queryByText(/at least one weight/i),
    ).not.toBeInTheDocument()
  })

  it('slider and number input stay in sync', async () => {
    render(<Harness />)
    // slider → number input
    const slider = document.getElementById('w-alpha') as HTMLInputElement
    fireEvent.change(slider, { target: { value: '0.65' } })
    expect(alphaInput()).toHaveValue('0.65')
    // number input → slider
    await userEvent.clear(alphaInput())
    await userEvent.type(alphaInput(), '0.7')
    expect(slider).toHaveValue('0.7')
  })
})
