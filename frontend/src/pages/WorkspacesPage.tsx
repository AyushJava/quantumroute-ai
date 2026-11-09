import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { FolderKanban, Pencil, Plus, Trash2 } from 'lucide-react'
import { useAuth } from '../auth/useAuth'
import {
  createWorkspace,
  deleteWorkspace,
  listWorkspaces,
  updateWorkspace,
} from '../api/resources'
import { friendlyApiMessage } from '../api/errors'
import type { WorkspaceResponse } from '../api/types'
import { Dialog, ConfirmDialog } from '../components/Dialog'
import '../styles/resources.css'

export function WorkspacesPage() {
  const { token } = useAuth()
  const navigate = useNavigate()

  const [workspaces, setWorkspaces] = useState<WorkspaceResponse[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const [createOpen, setCreateOpen] = useState(false)
  const [renameTarget, setRenameTarget] = useState<WorkspaceResponse | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<WorkspaceResponse | null>(null)
  const [name, setName] = useState('')
  const [nameError, setNameError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const refresh = useCallback(async () => {
    await Promise.resolve()
    setLoading(true)
    setError(null)
    try {
      const page = await listWorkspaces(token)
      setWorkspaces(page.content)
    } catch (err) {
      setError(friendlyApiMessage(err))
    } finally {
      setLoading(false)
    }
  }, [token])

  useEffect(() => {
    queueMicrotask(() => void refresh())
  }, [refresh])

  function openCreate() {
    setName('')
    setNameError(null)
    setCreateOpen(true)
  }

  function openRename(ws: WorkspaceResponse) {
    setRenameTarget(ws)
    setName(ws.name)
    setNameError(null)
  }

  function validateName(): boolean {
    const trimmed = name.trim()
    if (!trimmed) {
      setNameError('Name is required.')
      return false
    }
    if (trimmed.length > 120) {
      setNameError('Name must be at most 120 characters.')
      return false
    }
    setNameError(null)
    return true
  }

  async function handleCreate(e: FormEvent) {
    e.preventDefault()
    if (!validateName() || busy) return
    setBusy(true)
    try {
      await createWorkspace(name.trim(), token)
      setCreateOpen(false)
      setNotice('Workspace created.')
      await refresh()
    } catch (err) {
      setNameError(friendlyApiMessage(err))
    } finally {
      setBusy(false)
    }
  }

  async function handleRename(e: FormEvent) {
    e.preventDefault()
    if (!renameTarget || !validateName() || busy) return
    setBusy(true)
    try {
      await updateWorkspace(renameTarget.id, name.trim(), token)
      setRenameTarget(null)
      setNotice('Workspace renamed.')
      await refresh()
    } catch (err) {
      setNameError(friendlyApiMessage(err))
    } finally {
      setBusy(false)
    }
  }

  async function handleDelete() {
    if (!deleteTarget || busy) return
    setBusy(true)
    try {
      await deleteWorkspace(deleteTarget.id, token)
      setDeleteTarget(null)
      setNotice('Workspace deleted.')
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
      <div className="page-head">
        <div>
          <h2>Workspaces</h2>
          <p className="page-sub">
            Organize road-network scenarios into workspaces.
          </p>
        </div>
        <button className="btn btn-primary" onClick={openCreate}>
          <Plus size={15} /> New workspace
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
          <span className="spinner-dark" /> Loading workspaces…
        </div>
      ) : workspaces.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <div className="empty-icon">
              <FolderKanban size={22} />
            </div>
            <div className="empty-title">No workspaces yet</div>
            <div className="empty-sub">
              Create a workspace to start building road-network scenarios.
            </div>
            <button
              className="btn btn-primary"
              style={{ marginTop: 'var(--space-4)' }}
              onClick={openCreate}
            >
              <Plus size={15} /> Create your first workspace
            </button>
          </div>
        </div>
      ) : (
        <div className="card-grid">
          {workspaces.map((ws) => (
            <div key={ws.id} className="card resource-card">
              <div className="rc-name">
                <FolderKanban size={17} style={{ color: 'var(--accent)' }} />
                {ws.name}
              </div>
              <div className="rc-meta">
                Created {new Date(ws.createdAt).toLocaleDateString()}
              </div>
              <div className="rc-actions">
                <button
                  className="btn btn-primary"
                  onClick={() => navigate(`/workspaces/${ws.id}`)}
                >
                  Open
                </button>
                <button
                  className="btn btn-ghost"
                  onClick={() => openRename(ws)}
                  aria-label={`Rename ${ws.name}`}
                >
                  <Pencil size={14} />
                </button>
                <button
                  className="btn btn-ghost"
                  onClick={() => setDeleteTarget(ws)}
                  aria-label={`Delete ${ws.name}`}
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
        title="New workspace"
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
          <div className="field">
            <label htmlFor="ws-name">Name</label>
            <input
              id="ws-name"
              className="field-input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={120}
              placeholder="e.g. City traffic study"
              autoFocus
            />
            {nameError && <span className="field-error">{nameError}</span>}
          </div>
        </form>
      </Dialog>

      <Dialog
        open={renameTarget !== null}
        title="Rename workspace"
        onClose={() => setRenameTarget(null)}
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setRenameTarget(null)}>
              Cancel
            </button>
            <button className="btn btn-primary" onClick={handleRename} disabled={busy}>
              {busy ? 'Saving…' : 'Save'}
            </button>
          </>
        }
      >
        <form className="form-stack" onSubmit={handleRename}>
          <div className="field">
            <label htmlFor="ws-rename">Name</label>
            <input
              id="ws-rename"
              className="field-input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={120}
              autoFocus
            />
            {nameError && <span className="field-error">{nameError}</span>}
          </div>
        </form>
      </Dialog>

      <ConfirmDialog
        open={deleteTarget !== null}
        title="Delete workspace"
        message={`Delete "${deleteTarget?.name}"? This cannot be undone. Workspaces containing scenarios cannot be deleted.`}
        busy={busy}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  )
}
