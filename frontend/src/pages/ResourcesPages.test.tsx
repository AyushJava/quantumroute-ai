import { describe, expect, it, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { WorkspaceDetailPage } from './WorkspaceDetailPage'
import { ScenarioDetailPage } from './ScenarioDetailPage'
import { AuthProvider } from '../auth/AuthProvider'
import * as resources from '../api/resources'
import { STARTER_GRAPH } from '../data/starterGraph'
import { ApiError } from '../api/client'
import type { ScenarioDetail, ScenarioSummary } from '../api/types'

vi.mock('../api/resources')

const WS = { id: 'w1', name: 'City Study', createdAt: '2025-01-01T00:00:00Z' }
const SC: ScenarioSummary = {
  id: 's1', workspaceId: 'w1', name: 'Downtown',
  graphVersion: 'v1', createdAt: '2025-01-02T00:00:00Z',
}
const SC_DETAIL: ScenarioDetail = {
  ...SC, graph: STARTER_GRAPH, config: {},
}
const page = <T,>(items: T[]) => ({
  content: items, totalElements: items.length, totalPages: 1, number: 0, size: 100,
})

function renderDetail(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AuthProvider>
        <Routes>
          <Route path="/workspaces/:workspaceId" element={<WorkspaceDetailPage />} />
          <Route path="/scenarios/:scenarioId" element={<ScenarioDetailPage />} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  )
}

describe('WorkspaceDetailPage', () => {
  beforeEach(() => vi.resetAllMocks())

  it('lists scenarios in a workspace', async () => {
    vi.mocked(resources.getWorkspace).mockResolvedValue(WS)
    vi.mocked(resources.listScenarios).mockResolvedValue(page([SC]))
    renderDetail('/workspaces/w1')
    expect(await screen.findByText('Downtown')).toBeInTheDocument()
    expect(screen.getByText(/graph v1/)).toBeInTheDocument()
  })

  it('creates a scenario with the starter graph', async () => {
    vi.mocked(resources.getWorkspace).mockResolvedValue(WS)
    vi.mocked(resources.listScenarios).mockResolvedValue(page([]))
    vi.mocked(resources.createScenario).mockResolvedValue(SC_DETAIL)
    renderDetail('/workspaces/w1')
    await screen.findByText('No scenarios yet')
    await userEvent.click(
      screen.getAllByRole('button', { name: /create scenario/i })[0],
    )
    await userEvent.type(screen.getByLabelText(/name/i), 'My Scenario')
    await userEvent.click(screen.getByRole('button', { name: /^create$/i }))
    await waitFor(() =>
      expect(resources.createScenario).toHaveBeenCalledWith(
        'w1',
        expect.objectContaining({
          name: 'My Scenario',
          graphVersion: 'v1',
          graph: STARTER_GRAPH,
          config: {},
        }),
        null,
      ),
    )
  })

  it('handles scenario delete 409', async () => {
    vi.mocked(resources.getWorkspace).mockResolvedValue(WS)
    vi.mocked(resources.listScenarios).mockResolvedValue(page([SC]))
    vi.mocked(resources.deleteScenario).mockRejectedValue(
      new ApiError(409, 'SCENARIO_HAS_JOBS', 'has jobs'),
    )
    renderDetail('/workspaces/w1')
    await screen.findByText('Downtown')
    await userEvent.click(
      screen.getByRole('button', { name: /delete downtown/i }),
    )
    await userEvent.click(screen.getByRole('button', { name: /^delete$/i }))
    expect(
      await screen.findByText(/cannot be deleted/i),
    ).toBeInTheDocument()
  })
})

describe('ScenarioDetailPage', () => {
  beforeEach(() => vi.resetAllMocks())

  it('renders scenario detail', async () => {
    vi.mocked(resources.getScenario).mockResolvedValue(SC_DETAIL)
    renderDetail('/scenarios/s1')
    expect(await screen.findByText('Downtown')).toBeInTheDocument()
    expect(screen.getByText('Nodes')).toBeInTheDocument()
    expect(screen.getByText('Edges')).toBeInTheDocument()
    expect(screen.getByText(/Graph preview/)).toBeInTheDocument()
  })

  it('does not treat reordered JSON keys as a graph change', async () => {
    vi.mocked(resources.getScenario).mockResolvedValue(SC_DETAIL)
    renderDetail('/scenarios/s1')
    await screen.findByText('Downtown')
    await userEvent.click(screen.getByRole('button', { name: /edit/i }))
    const graphArea = screen.getByLabelText(/graph json/i)
    // same graph, different top-level key order + whitespace
    const reordered = `{
      "edges": ${JSON.stringify(SC_DETAIL.graph.edges)},
      "nodes": ${JSON.stringify(SC_DETAIL.graph.nodes)},
      "directed": true,
      "name": "Starter City Graph"
    }`
    fireEvent.change(graphArea, { target: { value: reordered } })
    // version field should stay locked and no bump warning shown
    expect(screen.getByLabelText(/graph version/i)).toBeDisabled()
    expect(
      screen.queryByText(/bump the version/i),
    ).not.toBeInTheDocument()
  })

  it('rejects null/primitive graph JSON with a validation message', async () => {
    vi.mocked(resources.getScenario).mockResolvedValue(SC_DETAIL)
    renderDetail('/scenarios/s1')
    await screen.findByText('Downtown')
    await userEvent.click(screen.getByRole('button', { name: /edit/i }))
    const graphArea = screen.getByLabelText(/graph json/i)
    fireEvent.change(graphArea, { target: { value: 'null' } })
    await userEvent.click(screen.getByRole('button', { name: /save changes/i }))
    expect(
      await screen.findByText(/must be a JSON object/i),
    ).toBeInTheDocument()
    expect(resources.updateScenario).not.toHaveBeenCalled()
  })

  it('saves an edit with bumped graph version', async () => {
    vi.mocked(resources.getScenario).mockResolvedValue(SC_DETAIL)
    vi.mocked(resources.updateScenario).mockResolvedValue({
      ...SC_DETAIL, graphVersion: 'v2',
    })
    renderDetail('/scenarios/s1')
    await screen.findByText('Downtown')
    await userEvent.click(screen.getByRole('button', { name: /edit/i }))
    const graphArea = screen.getByLabelText(/graph json/i)
    fireEvent.change(graphArea, {
      target: { value: '{"nodes":[],"edges":[]}' },
    })
    await userEvent.click(screen.getByRole('button', { name: /save changes/i }))
    await waitFor(() =>
      expect(resources.updateScenario).toHaveBeenCalledWith(
        's1',
        expect.objectContaining({ graphVersion: 'v1' }),
        null,
      ),
    )
  })
})
