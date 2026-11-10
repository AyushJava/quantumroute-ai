import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from 'react-router-dom'
import './app.css'
import './styles/resources.css'
import { ThemeProvider } from './theme/ThemeProvider'
import { AuthProvider } from './auth/AuthProvider'
import { useAuth } from './auth/useAuth'
import { AppShell, type PageId } from './components/AppShell'
import { Dashboard } from './pages/Dashboard'
import { LoginPage } from './pages/LoginPage'
import { RegisterPage } from './pages/RegisterPage'
import { WorkspacesPage } from './pages/WorkspacesPage'
import { WorkspaceDetailPage } from './pages/WorkspaceDetailPage'
import { ScenarioDetailPage } from './pages/ScenarioDetailPage'
import { RoutePlannerPage } from './pages/RoutePlannerPage'
import {
  RoutePlannerPage as RoutePlannerPlaceholder,
  ExperimentsPage,
} from './pages/Placeholders'

const PAGE_PATH: Record<PageId, string> = {
  dashboard: '/',
  workspaces: '/workspaces',
  planner: '/planner',
  experiments: '/experiments',
}

function pageFromPath(pathname: string): PageId {
  if (pathname.startsWith('/workspaces') || pathname.startsWith('/scenarios')) {
    return 'workspaces'
  }
  if (pathname.startsWith('/planner')) return 'planner'
  if (pathname.startsWith('/experiments')) return 'experiments'
  return 'dashboard'
}

function ProtectedApp() {
  const { isAuthenticated } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const go = (p: PageId) => navigate(PAGE_PATH[p])

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }

  return (
    <AppShell page={pageFromPath(location.pathname)} onNavigate={go}>
      <Routes>
        <Route path="/" element={<Dashboard onNavigate={go} />} />
        <Route path="/workspaces" element={<WorkspacesPage />} />
        <Route path="/workspaces/:workspaceId" element={<WorkspaceDetailPage />} />
        <Route path="/scenarios/:scenarioId" element={<ScenarioDetailPage />} />
        <Route path="/scenarios/:scenarioId/plan" element={<RoutePlannerPage />} />
        <Route path="/planner" element={<RoutePlannerPlaceholder />} />
        <Route path="/experiments" element={<ExperimentsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AppShell>
  )
}

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
            <Route path="/*" element={<ProtectedApp />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </ThemeProvider>
  )
}
