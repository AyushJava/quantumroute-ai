import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { WorkspacesPage } from './WorkspacesPage'
import { AuthProvider } from '../auth/AuthProvider'
import * as resources from '../api/resources'
import { ApiError } from '../api/client'

vi.mock('../api/resources')

const WS = { id: 'w1', name: 'City Study', createdAt: '2025-01-01T00:00:00Z' }
const page = <T,>(items: T[]) => ({
  content: items, totalElements: items.length, totalPages: 1, number: 0, size: 100,
})

function renderPage() {
  return render(
    <MemoryRouter>
      <AuthProvider>
        <WorkspacesPage />
      </AuthProvider>
    </MemoryRouter>,
  )
}

describe('WorkspacesPage', () => {
  beforeEach(() => vi.resetAllMocks())

  it('renders workspace list', async () => {
    vi.mocked(resources.listWorkspaces).mockResolvedValue(page([WS]))
    renderPage()
    expect(await screen.findByText('City Study')).toBeInTheDocument()
  })

  it('shows empty state', async () => {
    vi.mocked(resources.listWorkspaces).mockResolvedValue(page([]))
    renderPage()
    expect(await screen.findByText('No workspaces yet')).toBeInTheDocument()
  })

  it('creates a workspace', async () => {
    vi.mocked(resources.listWorkspaces).mockResolvedValue(page([]))
    vi.mocked(resources.createWorkspace).mockResolvedValue(WS)
    renderPage()
    await screen.findByText('No workspaces yet')
    await userEvent.click(
      screen.getAllByRole('button', { name: /create/i })[0],
    )
    await userEvent.type(screen.getByLabelText(/name/i), 'New WS')
    await userEvent.click(screen.getByRole('button', { name: /^create$/i }))
    await waitFor(() =>
      expect(resources.createWorkspace).toHaveBeenCalledWith('New WS', null),
    )
  })

  it('validates empty name', async () => {
    vi.mocked(resources.listWorkspaces).mockResolvedValue(page([]))
    renderPage()
    await screen.findByText('No workspaces yet')
    await userEvent.click(
      screen.getAllByRole('button', { name: /create/i })[0],
    )
    await userEvent.click(screen.getByRole('button', { name: /^create$/i }))
    expect(screen.getByText('Name is required.')).toBeInTheDocument()
    expect(resources.createWorkspace).not.toHaveBeenCalled()
  })

  it('renames a workspace', async () => {
    vi.mocked(resources.listWorkspaces).mockResolvedValue(page([WS]))
    vi.mocked(resources.updateWorkspace).mockResolvedValue({ ...WS, name: 'Renamed' })
    renderPage()
    await screen.findByText('City Study')
    await userEvent.click(screen.getByRole('button', { name: /rename city study/i }))
    const input = screen.getByLabelText('Name')
    await userEvent.clear(input)
    await userEvent.type(input, 'Renamed')
    await userEvent.click(screen.getByRole('button', { name: /^save$/i }))
    await waitFor(() =>
      expect(resources.updateWorkspace).toHaveBeenCalledWith('w1', 'Renamed', null),
    )
  })

  it('deletes a workspace after confirmation', async () => {
    vi.mocked(resources.listWorkspaces).mockResolvedValue(page([WS]))
    vi.mocked(resources.deleteWorkspace).mockResolvedValue(undefined)
    renderPage()
    await screen.findByText('City Study')
    await userEvent.click(screen.getByRole('button', { name: /delete city study/i }))
    await userEvent.click(screen.getByRole('button', { name: /^delete$/i }))
    await waitFor(() =>
      expect(resources.deleteWorkspace).toHaveBeenCalledWith('w1', null),
    )
  })

  it('shows non-empty error on 409 delete', async () => {
    vi.mocked(resources.listWorkspaces).mockResolvedValue(page([WS]))
    vi.mocked(resources.deleteWorkspace).mockRejectedValue(
      new ApiError(409, 'WORKSPACE_NOT_EMPTY', 'not empty'),
    )
    renderPage()
    await screen.findByText('City Study')
    await userEvent.click(screen.getByRole('button', { name: /delete city study/i }))
    await userEvent.click(screen.getByRole('button', { name: /^delete$/i }))
    expect(
      await screen.findByText(/still contains scenarios/i),
    ).toBeInTheDocument()
  })
})
