import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Navigation, Pencil, Save, Trash2, X } from 'lucide-react'
import { useAuth } from '../auth/useAuth'
import { deleteScenario, getScenario, updateScenario } from '../api/resources'
import { friendlyApiMessage } from '../api/errors'
import type { ScenarioDetail as ScenarioDetailT, ScenarioGraph } from '../api/types'
import { ConfirmDialog } from '../components/Dialog'
import '../styles/resources.css'

function nextVersion(v: string): string {
  const m = /^(.*?)(\d+)$/.exec(v)
  if (m) return `${m[1]}${parseInt(m[2], 10) + 1}`
  return `${v}-2`
}

/** Canonical JSON: object keys sorted recursively so comparison is
 *  insensitive to property order and formatting. */
function canonical(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(canonical).join(',')}]`
  }
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`)
    return `{${entries.join(',')}}`
  }
  return JSON.stringify(value) ?? 'null'
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

export function ScenarioDetailPage() {
  const { scenarioId = '' } = useParams()
  const { token } = useAuth()
  const navigate = useNavigate()

  const [scenario, setScenario] = useState<ScenarioDetailT | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const [editing, setEditing] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [busy, setBusy] = useState(false)

  const [name, setName] = useState('')
  const [graphVersion, setGraphVersion] = useState('')
  const [graphText, setGraphText] = useState('')
  const [configText, setConfigText] = useState('{}')
  const [formError, setFormError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    await Promise.resolve()
    setLoading(true)
    setError(null)
    try {
      const s = await getScenario(scenarioId, token)
      setScenario(s)
    } catch (err) {
      setError(friendlyApiMessage(err))
    } finally {
      setLoading(false)
    }
  }, [scenarioId, token])

  useEffect(() => {
    queueMicrotask(() => void refresh())
  }, [refresh])

  function startEdit() {
    if (!scenario) return
    setName(scenario.name)
    setGraphVersion(scenario.graphVersion)
    setGraphText(JSON.stringify(scenario.graph, null, 2))
    setConfigText(JSON.stringify(scenario.config ?? {}, null, 2))
    setFormError(null)
    setEditing(true)
  }

  async function handleSave(e: FormEvent) {
    e.preventDefault()
    if (!scenario || busy) return
    setFormError(null)

    let graph: ScenarioGraph
    let config: Record<string, unknown>
    try {
      graph = JSON.parse(graphText) as ScenarioGraph
    } catch {
      setFormError('Graph JSON is malformed.')
      return
    }
    if (!isPlainObject(graph) || !Array.isArray(graph.nodes) || !Array.isArray(graph.edges)) {
      setFormError('Graph must be a JSON object with "nodes" and "edges" arrays.')
      return
    }
    try {
      config = JSON.parse(configText) as Record<string, unknown>
    } catch {
      setFormError('Config JSON is malformed.')
      return
    }
    if (!isPlainObject(config)) {
      setFormError('Config must be a JSON object.')
      return
    }

    const graphChanged = canonical(graph) !== canonical(scenario.graph)
    const version = graphChanged ? graphVersion.trim() : scenario.graphVersion

    setBusy(true)
    try {
      const updated = await updateScenario(
        scenario.id,
        {
          name: name.trim() || undefined,
          graphVersion: version,
          graph,
          config,
        },
        token,
      )
      setScenario(updated)
      setEditing(false)
      setNotice('Scenario saved.')
    } catch (err) {
      setFormError(friendlyApiMessage(err))
    } finally {
      setBusy(false)
    }
  }

  async function handleDelete() {
    if (!scenario || busy) return
    setBusy(true)
    try {
      await deleteScenario(scenario.id, token)
      navigate(`/workspaces/${scenario.workspaceId}`)
    } catch (err) {
      setDeleteOpen(false)
      setError(friendlyApiMessage(err))
    } finally {
      setBusy(false)
    }
  }

  // parsed comparison — immune to whitespace/property-order-only edits
  const graphChangedPreview = (() => {
    if (!editing || !scenario) return false
    try {
      return canonical(JSON.parse(graphText)) !== canonical(scenario.graph)
    } catch {
      return false // malformed JSON handled on save
    }
  })()

  return (
    <div>
      <button
        className="back-link"
        onClick={() =>
          scenario
            ? navigate(`/workspaces/${scenario.workspaceId}`)
            : navigate('/workspaces')
        }
      >
        <ArrowLeft size={15} /> Back to workspace
      </button>

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
          <span className="spinner-dark" /> Loading scenario…
        </div>
      ) : !scenario ? (
        <div className="card">
          <div className="empty-state">
            <div className="empty-title">Scenario not found</div>
            <div className="empty-sub">It may have been deleted.</div>
          </div>
        </div>
      ) : editing ? (
        <form onSubmit={handleSave}>
          <div className="page-head">
            <h2>Edit scenario</h2>
            <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setEditing(false)}
              >
                <X size={15} /> Cancel
              </button>
              <button type="submit" className="btn btn-primary" disabled={busy}>
                <Save size={15} /> {busy ? 'Saving…' : 'Save changes'}
              </button>
            </div>
          </div>

          {formError && (
            <div className="form-error" role="alert" style={{ marginBottom: 'var(--space-4)' }}>
              {formError}
            </div>
          )}

          <div className="card section-card" style={{ marginBottom: 'var(--space-5)' }}>
            <div className="form-stack">
              <div className="field">
                <label htmlFor="sc-edit-name">Name</label>
                <input
                  id="sc-edit-name"
                  className="field-input"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={120}
                />
              </div>
              <div className="field">
                <label htmlFor="sc-edit-version">Graph version</label>
                <input
                  id="sc-edit-version"
                  className="field-input"
                  value={graphVersion}
                  onChange={(e) => setGraphVersion(e.target.value)}
                  maxLength={80}
                  disabled={!graphChangedPreview}
                />
                <span className="field-hint">
                  {graphChangedPreview
                    ? 'Graph content changed — a new version is required.'
                    : 'Locked unless the graph changes.'}
                </span>
              </div>
              {graphChangedPreview && graphVersion.trim() === scenario.graphVersion && (
                <div className="form-error" role="alert">
                  Bump the version (e.g. {nextVersion(scenario.graphVersion)}).
                </div>
              )}
            </div>
          </div>

          <div className="card section-card" style={{ marginBottom: 'var(--space-5)' }}>
            <div className="section-head">
              <div>
                <div className="section-title">Graph (JSON)</div>
                <div className="section-sub">
                  nodes + edges; every edge needs length_m and speed_kmh
                </div>
              </div>
            </div>
            <textarea
              className="field-input"
              style={{ minHeight: 260 }}
              value={graphText}
              onChange={(e) => setGraphText(e.target.value)}
              spellCheck={false}
              aria-label="Graph JSON"
            />
          </div>

          <div className="card section-card">
            <div className="section-head">
              <div>
                <div className="section-title">Config (JSON)</div>
              </div>
            </div>
            <textarea
              className="field-input"
              style={{ minHeight: 100 }}
              value={configText}
              onChange={(e) => setConfigText(e.target.value)}
              spellCheck={false}
              aria-label="Config JSON"
            />
          </div>
        </form>
      ) : (
        <>
          <div className="page-head">
            <div>
              <h2>{scenario.name}</h2>
              <p className="page-sub">
                Created {new Date(scenario.createdAt).toLocaleString()}
              </p>
            </div>
            <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
              <button
                className="btn btn-primary"
                onClick={() => navigate(`/scenarios/${scenario.id}/plan`)}
              >
                <Navigation size={15} /> Plan Route
              </button>
              <button className="btn btn-secondary" onClick={startEdit}>
                <Pencil size={15} /> Edit
              </button>
              <button
                className="btn btn-danger"
                onClick={() => setDeleteOpen(true)}
              >
                <Trash2 size={15} /> Delete
              </button>
            </div>
          </div>

          <div className="detail-grid">
            <div className="card section-card detail-item">
              <div className="di-label">Graph version</div>
              <div className="di-value">
                <span className="badge accent">{scenario.graphVersion}</span>
              </div>
            </div>
            <div className="card section-card detail-item">
              <div className="di-label">Nodes</div>
              <div className="di-value">{scenario.graph.nodes.length}</div>
            </div>
            <div className="card section-card detail-item">
              <div className="di-label">Edges</div>
              <div className="di-value">{scenario.graph.edges.length}</div>
            </div>
            <div className="card section-card detail-item">
              <div className="di-label">Directed</div>
              <div className="di-value">
                {scenario.graph.directed ? 'Yes' : 'No'}
              </div>
            </div>
          </div>

          <div className="card section-card">
            <div className="section-head">
              <div className="section-title">Graph preview</div>
            </div>
            <pre
              style={{
                fontSize: 12,
                fontFamily: 'var(--font-mono)',
                color: 'var(--text-secondary)',
                overflowX: 'auto',
                margin: 0,
              }}
            >
              {JSON.stringify(scenario.graph, null, 2)}
            </pre>
          </div>
        </>
      )}

      <ConfirmDialog
        open={deleteOpen}
        title="Delete scenario"
        message={`Delete "${scenario?.name}"? This cannot be undone. Scenarios with optimization jobs cannot be deleted.`}
        busy={busy}
        onConfirm={handleDelete}
        onCancel={() => setDeleteOpen(false)}
      />
    </div>
  )
}
