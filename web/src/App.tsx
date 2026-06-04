import { Routes, Route, Navigate } from 'react-router-dom'
import { Layout } from '@/components/layout/Layout'
import { ToastProvider } from '@/components/ui/ToastProvider'
import { ProjectsPage }       from '@/pages/ProjectsPage'
import { TasksPage }          from '@/pages/TasksPage'
import { TaskDetailPage }     from '@/pages/TaskDetailPage'
import { AdminAgentsPage }    from '@/pages/AdminAgentsPage'
import { AdminPipelinesPage } from '@/pages/AdminPipelinesPage'
import { AdminSettingsPage }  from '@/pages/AdminSettingsPage'

export default function App() {
  return (
    <ToastProvider>
      <Routes>
        <Route element={<Layout />}>
          <Route index                       element={<ProjectsPage />} />
          <Route path="projects/:id/tasks"   element={<TasksPage />} />
          <Route path="tasks/:id"            element={<TaskDetailPage />} />
          <Route path="admin/agents"         element={<AdminAgentsPage />} />
          <Route path="admin/pipelines"      element={<AdminPipelinesPage />} />
          <Route path="admin/settings"       element={<AdminSettingsPage />} />
          <Route path="*"                    element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </ToastProvider>
  )
}
