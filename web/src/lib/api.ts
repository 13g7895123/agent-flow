import type {
  Agent, AgentFormData,
  Pipeline, PipelineFormData,
  Project, ProjectFormData,
  Task, TaskFormData,
  ExecutionRun,
} from '@/types'

const BASE = import.meta.env.VITE_API_URL ?? '/api'

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...init?.headers },
    ...init,
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: res.statusText }))
    throw new Error(err.message ?? 'Request failed')
  }
  if (res.status === 204) return undefined as T
  return res.json()
}

// ── Agents ─────────────────────────────────────────────────────────────────
export const agentsApi = {
  list:   ()                        => request<Agent[]>('/agents'),
  get:    (id: string)              => request<Agent>(`/agents/${id}`),
  create: (data: AgentFormData)     => request<Agent>('/agents', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: string, data: AgentFormData) =>
    request<Agent>(`/agents/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  toggle: (id: string)              => request<Agent>(`/agents/${id}/toggle`, { method: 'PUT' }),
  delete: (id: string)              => request<void>(`/agents/${id}`, { method: 'DELETE' }),
}

// ── Pipelines ──────────────────────────────────────────────────────────────
export const pipelinesApi = {
  list:       ()                           => request<Pipeline[]>('/pipelines'),
  get:        (id: string)                 => request<Pipeline>(`/pipelines/${id}`),
  create:     (data: PipelineFormData)     => request<Pipeline>('/pipelines', { method: 'POST', body: JSON.stringify(data) }),
  update:     (id: string, data: PipelineFormData) =>
    request<Pipeline>(`/pipelines/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  setDefault: (id: string)                => request<Pipeline>(`/pipelines/${id}/default`, { method: 'PUT' }),
  delete:     (id: string)                => request<void>(`/pipelines/${id}`, { method: 'DELETE' }),
}

// ── Projects ───────────────────────────────────────────────────────────────
export const projectsApi = {
  list:   ()                         => request<Project[]>('/projects'),
  get:    (id: string)               => request<Project>(`/projects/${id}`),
  create: (data: ProjectFormData)    => request<Project>('/projects', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: string, data: ProjectFormData) =>
    request<Project>(`/projects/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id: string)               => request<void>(`/projects/${id}`, { method: 'DELETE' }),
}

// ── Tasks ──────────────────────────────────────────────────────────────────
export const tasksApi = {
  list:   (projectId: string)        => request<Task[]>(`/projects/${projectId}/tasks`),
  get:    (id: string)               => request<Task>(`/tasks/${id}`),
  create: (projectId: string, data: TaskFormData) =>
    request<Task>(`/projects/${projectId}/tasks`, { method: 'POST', body: JSON.stringify(data) }),
  cancel: (id: string)               => request<void>(`/tasks/${id}/cancel`, { method: 'PUT' }),
  retry:  (id: string)               => request<void>(`/tasks/${id}/retry`, { method: 'PUT' }),
  runs:   (id: string)               => request<ExecutionRun[]>(`/tasks/${id}/runs`),
}

// ── SSE stream ─────────────────────────────────────────────────────────────
export function createTaskStream(taskId: string): EventSource {
  return new EventSource(`${BASE}/tasks/${taskId}/stream`)
}
