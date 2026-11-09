import { FolderKanban, Route, FlaskConical, type LucideIcon } from 'lucide-react'

interface PlaceholderProps {
  icon: LucideIcon
  title: string
  description: string}

export function Placeholder({ icon: Icon, title, description }: PlaceholderProps) {
  return (
    <div className="placeholder-page">
      <div className="ph-icon">
        <Icon size={30} />
      </div>
      <h2>{title}</h2>
      <p>{description}</p>
    </div>
  )
}

export function WorkspacesPage() {
  return (
    <Placeholder
      icon={FolderKanban}
      title="Workspaces"
      description="Workspace management — create, rename and organize your road-network workspaces — will be wired to the backend in a later Phase 5 checkpoint."
    />
  )
}

export function RoutePlannerPage() {
  return (
    <Placeholder
      icon={Route}
      title="Route Planner"
      description="Scenario selection, source/target picking and algorithm choice (Dijkstra, A*, QPSO) will be implemented once map and scenario APIs are connected."
    />
  )
}

export function ExperimentsPage() {
  return (
    <Placeholder
      icon={FlaskConical}
      title="Experiments"
      description="Benchmark runs comparing optimization algorithms will arrive with Phase 7 experiment tracking."
    />
  )
}
