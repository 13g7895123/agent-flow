import type {
  Agent, AgentFormData,
  Pipeline, PipelineFormData,
  Project, ProjectFormData,
  Task, TaskFormData,
  ExecutionRun,
  AgentLog,
} from '@/types'

const BASE = import.meta.env.VITE_API_URL ?? '/api'

function resolveErrorMessage(body: unknown, fallback: string): string {
  if (!body || typeof body !== 'object') {
    return fallback
  }

  const record = body as Record<string, unknown>
  const message = record.message
  if (typeof message === 'string' && message.trim()) return message

  const error = record.error
  if (typeof error === 'string' && error.trim()) return error

  return fallback
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...init?.headers },
    ...init,
  })
  if (!res.ok) {
    const raw = await res.text().catch(() => '')
    let body: unknown = raw
    if (raw) {
      try {
        body = JSON.parse(raw)
      } catch {
        body = raw
      }
    }
    throw new Error(resolveErrorMessage(body, raw || res.statusText || 'Request failed'))
  }
  if (res.status === 204) return undefined as T
  return res.json()
}

function normalizeRun(run: any): ExecutionRun {
  return {
    id: String(run.id),
    taskId: String(run.taskId ?? run.task_id ?? ''),
    stepId: run.stepId ?? run.step_id ?? null,
    agentId: run.agentId ?? run.agent_id ?? null,
    agentName: run.agentName ?? run.agent_name ?? undefined,
    phase: run.phase,
    runIndex: Number(run.runIndex ?? run.run_index ?? 0),
    promptSent: run.promptSent ?? run.prompt_sent ?? undefined,
    output: String(run.output ?? ''),
    errorMessage: run.errorMessage ?? run.error_message ?? undefined,
    exitCode: run.exitCode ?? run.exit_code ?? null,
    success: run.success ?? null,
    durationMs: run.durationMs ?? run.duration_ms ?? null,
    startedAt: String(run.startedAt ?? run.started_at ?? ''),
    completedAt: run.completedAt ?? run.completed_at ?? null,
  }
}

function normalizeLog(log: any): AgentLog {
  return {
    id: String(log.id),
    runId: String(log.runId ?? log.run_id ?? log.executionRunId ?? log.execution_run_id ?? ''),
    sequence: Number(log.sequence ?? 0),
    type: (log.type ?? log.logType ?? log.log_type) as AgentLog['type'],
    content: String(log.content ?? ''),
    createdAt: String(log.createdAt ?? log.created_at ?? log.timestamp ?? ''),
  }
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
  runs:   async (id: string)         => (await request<any[]>(`/tasks/${id}/runs`)).map(normalizeRun),
}

export const runsApi = {
  logs:   async (runId: string)      => (await request<any[]>(`/runs/${runId}/logs`)).map(normalizeLog),
}

// ── SSE stream ─────────────────────────────────────────────────────────────
export function createTaskStream(taskId: string): EventSource {
  return new EventSource(`${BASE}/tasks/${taskId}/stream`)
}
