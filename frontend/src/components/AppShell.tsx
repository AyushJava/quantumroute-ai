import { useState } from 'react'
import {
  LayoutDashboard,
  FolderKanban,
  Route,
  FlaskConical,
  Menu,
  X,
  MapPin,
  LogOut,
} from 'lucide-react'
import { ThemeToggle } from './ThemeToggle'
import { useAuth } from '../auth/useAuth'

export type PageId = 'dashboard' | 'workspaces' | 'planner' | 'experiments'

interface AppShellProps {
  page: PageId
  onNavigate: (page: PageId) => void
  children: React.ReactNode
}

const NAV_ITEMS: { id: PageId; label: string; icon: typeof LayoutDashboard }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'workspaces', label: 'Workspaces', icon: FolderKanban },
  { id: 'planner', label: 'Route Planner', icon: Route },
  { id: 'experiments', label: 'Experiments', icon: FlaskConical },
]

const PAGE_TITLES: Record<PageId, string> = {
  dashboard: 'Dashboard',
  workspaces: 'Workspaces',
  planner: 'Route Planner',
  experiments: 'Experiments',
}

export function AppShell({ page, onNavigate, children }: AppShellProps) {
  const { user, logout } = useAuth()
  const [navOpen, setNavOpen] = useState(false)

  const navigate = (id: PageId) => {
    onNavigate(id)
    setNavOpen(false)
  }

  return (
    <div className="app-shell">
      {navOpen && (
        <div
          className="sidebar-backdrop show"
          onClick={() => setNavOpen(false)}
          aria-hidden="true"
        />
      )}

      <aside className={`sidebar${navOpen ? ' open' : ''}`}>
        <div className="sidebar-brand">
          <div className="brand-mark">
            <MapPin size={20} />
          </div>
          <div>
            <div className="brand-name">QuantumRoute AI</div>
            <div className="brand-sub">Route Optimization</div>
          </div>
        </div>

        <nav className="sidebar-nav" aria-label="Main navigation">
          {NAV_ITEMS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              className={`nav-item${page === id ? ' active' : ''}`}
              onClick={() => navigate(id)}
              aria-current={page === id ? 'page' : undefined}
            >
              <Icon size={18} />
              {label}
            </button>
          ))}
        </nav>

        <div className="sidebar-footer">
          Quantum-inspired route optimization
        </div>
      </aside>

      <div className="main-col">
        <header className="topbar">
          <button
            className="icon-btn"
            onClick={() => setNavOpen((o) => !o)}
            aria-label={navOpen ? 'Close navigation' : 'Open navigation'}
            aria-expanded={navOpen}
          >
            {navOpen ? <X size={18} /> : <Menu size={18} />}
          </button>

          <h1 className="topbar-title">{PAGE_TITLES[page]}</h1>

          <div className="topbar-search">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none"
                 stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.3-4.3" />
            </svg>
            <input
              type="search"
              placeholder="Search workspaces, scenarios, jobs…"
              aria-label="Search"
              disabled
              title="Search will be available once the backend is connected"
            />
          </div>

          <div className="topbar-actions">
            <ThemeToggle />
            <div className="user-chip" title={user?.email ?? ''}>
              <div className="avatar">
                {(user?.displayName ?? user?.email ?? 'U')
                  .slice(0, 1)
                  .toUpperCase()}
              </div>
              <span className="user-name">
                {user?.displayName ?? user?.email ?? 'User'}
              </span>
            </div>
            <button
              className="icon-btn"
              onClick={logout}
              aria-label="Sign out"
              title="Sign out"
            >
              <LogOut size={17} />
            </button>
          </div>
        </header>

        <main className="content">{children}</main>
      </div>
    </div>
  )
}
