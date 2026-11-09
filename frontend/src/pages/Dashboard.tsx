import {
  FolderKanban,
  Map as MapIcon,
  Route,
  ArrowRight,
  Activity,
  Boxes,
  Zap,
} from 'lucide-react'
import type { PageId } from '../components/AppShell'

interface DashboardProps {
  onNavigate: (page: PageId) => void
}

const STATS = [
  {
    label: 'Workspaces',
    value: '—',
    hint: 'Connect backend to load',
    icon: FolderKanban,
    tone: 'blue' as const,
  },
  {
    label: 'Scenarios',
    value: '—',
    hint: 'Road-network graphs',
    icon: Boxes,
    tone: 'green' as const,
  },
  {
    label: 'Optimization jobs',
    value: '—',
    hint: 'Dijkstra · A* · QPSO',
    icon: Zap,
    tone: 'amber' as const,
  },
]

export function Dashboard({ onNavigate }: DashboardProps) {
  return (
    <div>
      <div style={{ marginBottom: 'var(--space-6)' }}>
        <h2 style={{ fontSize: 22, marginBottom: 4 }}>Welcome back</h2>
        <p style={{ color: 'var(--text-secondary)' }}>
          Plan and optimize routes across your road-network scenarios.
        </p>
      </div>

      <div className="stats-grid">
        {STATS.map(({ label, value, hint, icon: Icon, tone }) => (
          <div key={label} className="card stat-card">
            <div className={`stat-icon ${tone}`}>
              <Icon size={20} />
            </div>
            <div>
              <div className="stat-value">{value}</div>
              <div className="stat-label">{label}</div>
              <div className="stat-hint">{hint}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="dash-grid">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
          <button className="cta-card" onClick={() => onNavigate('planner')}>
            <Route size={28} />
            <div>
              <h3>Plan a route</h3>
              <p>
                Pick a scenario and run Dijkstra, A*, or QPSO optimization
                across your road graph.
              </p>
            </div>
            <span className="cta-arrow">
              <ArrowRight size={20} />
            </span>
          </button>

          <section className="card section-card">
            <div className="section-head">
              <div>
                <div className="section-title">Map preview</div>
                <div className="section-sub">
                  Interactive route visualization
                </div>
              </div>
            </div>
            <div className="map-placeholder">
              <div className="map-grid-overlay" />
              <div className="map-icon-wrap">
                <MapIcon size={26} />
              </div>
              <div className="map-label">Map view coming soon</div>
              <div className="map-sub">
                Leaflet-based visualization is planned for a later Phase 5
                checkpoint.
              </div>
            </div>
          </section>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
          <section className="card section-card">
            <div className="section-head">
              <div>
                <div className="section-title">Recent activity</div>
                <div className="section-sub">Optimization jobs &amp; edits</div>
              </div>
            </div>
            <div className="empty-state">
              <div className="empty-icon">
                <Activity size={22} />
              </div>
              <div className="empty-title">No activity yet</div>
              <div className="empty-sub">
                Once the backend is connected, recent optimization jobs and
                scenario changes will appear here.
              </div>
            </div>
          </section>

          <section className="card section-card">
            <div className="section-head">
              <div>
                <div className="section-title">Getting started</div>
              </div>
            </div>
            <ol style={{ margin: 0, paddingLeft: 'var(--space-5)', color: 'var(--text-secondary)', fontSize: 13, display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
              <li>Create a workspace for your network.</li>
              <li>Import a scenario with a road graph.</li>
              <li>Run an optimization job and inspect the route.</li>
            </ol>
          </section>
        </div>
      </div>
    </div>
  )
}
