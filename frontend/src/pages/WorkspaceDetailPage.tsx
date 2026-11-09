import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Map as MapIcon, Plus, Trash2 } from 'lucide-react'
import { useAuth } from '../auth/useAuth'
import {
  createScenario,
  deleteScenario,
  getWorkspace,
  listScenarios,
} from '../api/resources'
import { friendlyApiMessage } from '../api/errors'
import { STARTER_GRAPH } from '../data/starterGraph'
import type { ScenarioSummary, WorkspaceResponse } from '../api/types'
import { Dialog, ConfirmDialog } from '../components/Dialog'
import '../styles/resources.css'

export function WorkspaceDetailPage() {
  const { workspaceId = '' } = useParams()
  const { token } = useAuth()
  const navigate = useNavigate()

  const [workspace, setWorkspace] = useState<WorkspaceResponse | null>(null)
  const [scenarios, setScenarios] = useState<ScenarioSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const [createOpen, setCreateOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<ScenarioSummary | null>(null)
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)

  const refresh = useCallback(async () => {
    await Promise.resolve()
    setLoading(true)
    setError(null)
    try {
      const [ws, sc] = await Promise.all([
        getWorkspace(workspaceId, token),
        listScenarios(workspaceId, token),
      ])
      setWorkspace(ws)
      setScenarios(sc.content)
    } catch (err) {
      setError(friendlyApiMessage(err))
    } finally {
      setLoading(false)
    }
  }, [workspaceId, token])

  useEffect(() => {
    queueMicrotask(() => void refresh())
  }, [refresh])

  async function handleCreate(e: FormEvent) {
    e.preventDefault()
    if (busy) return
    setBusy(true)
    try {
      const created = await createScenario(
        workspaceId,
        {
          name: name.trim() || undefined,
          graphVersion: 'v1',
          graph: STARTER_GRAPH,
          config: {},
        },
        token,
      )
      setCreateOpen(false)
      setNotice('Scenario created.')
      navigate(`/scenarios/${created.id}`)
    } catch (err) {
      setError(friendlyApiMessage(err))
      setCreateOpen(false)
    } finally {
      setBusy(false)
    }
  }

  async function handleDelete() {
    if (!deleteTarget || busy) return
    setBusy(true)
    try {
      await deleteScenario(deleteTarget.id, token)
      setDeleteTarget(null)
      setNotice('Scenario deleted.')
      await refresh()
    } catch (err) {
      setDeleteTarget(null)
      setError(friendlyApiMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <button className="back-link" onClick={() => navigate('/workspaces')}>
        <ArrowLeft size={15} /> All workspaces
      </button>

      <div className="page-head">
        <div>
          <h2>{workspace?.name ?? 'Workspace'}</h2>
          <p className="page-sub">
            {scenarios.length} scenario{scenarios.length === 1 ? '' : 's'}
          </p>
        </div>
        <button className="btn btn-primary" onClick={() => { setName(''); setCreateOpen(true); }}>
          <Plus size={15} /> New scenario
        </button>
      </div>

      {notice && (
        <div className="form-success" role="status" style={{ marginBottom: 'var(--space-4)' }}>
          {notice}
        </div>
      )}
      {error && (
        <div className="form-error" role="alert" style={{ marginBottom: 'var(--space-4)' }}>
          {error}
        </div>
      )}

      {loading ? (
        <div className="loading-row">
          <span className="spinner-dark" /> Loading scenarios…
        </div>
      ) : scenarios.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <div className="empty-icon">
              <MapIcon size={22} />
            </div>
            <div className="empty-title">No scenarios yet</div>
            <div className="empty-sub">
              Create a scenario to define a road graph for route optimization.
            </div>
            <button
              className="btn btn-primary"
              style={{ marginTop: 'var(--space-4)' }}
              onClick={() => setCreateOpen(true)}
            >
              <Plus size={15} /> Create scenario
            </button>
          </div>
        </div>
      ) : (
        <div className="card scenario-list">
          {scenarios.map((s) => (
            <div key={s.id} className="card scenario-row">
              <div className="sr-main">
                <div className="sr-name">{s.name}</div>
                <div className="sr-meta">
                  graph {s.graphVersion} · created{' '}
                  {new Date(s.createdAt).toLocaleDateString()}
                </div>
              </div>
              <span className="badge accent">{s.graphVersion}</span>
              <div className="sr-actions">
                <Link className="btn btn-secondary" to={`/scenarios/${s.id}`}>
                  Open
                </Link>
                <button
                  className="btn btn-ghost"
                  onClick={() => setDeleteTarget(s)}
                  aria-label={`Delete ${s.name}`}
                  style={{ color: 'var(--danger)' }}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog
        open={createOpen}
        title="New scenario"
        onClose={() => setCreateOpen(false)}
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setCreateOpen(false)}>
              Cancel
            </button>
            <button className="btn btn-primary" onClick={handleCreate} disabled={busy}>
              {busy ? 'Creating…' : 'Create'}
            </button>
          </>
        }
      >
        <form className="form-stack" onSubmit={handleCreate}>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
            A starter city graph (3 nodes, 3 edges) will be used. You can edit
            the graph later.
          </p>
          <div className="field">
            <label htmlFor="sc-name">Name</label>
            <input
              id="sc-name"
              className="field-input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={120}
              placeholder="Untitled scenario"
              autoFocus
            />
          </div>
        </form>
      </Dialog>

      <ConfirmDialog
        open={deleteTarget !== null}
        title="Delete scenario"
        message={`Delete "${deleteTarget?.name}"? This cannot be undone. Scenarios with optimization jobs cannot be deleted.`}
        busy={busy}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  )
}
