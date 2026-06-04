import type {
  Agent, AgentFormData,
  Pipeline, PipelineFormData,
  Project, ProjectFormData,
  Task, TaskFormData,
  ExecutionRun,
  AgentLog,
  HealthCheckItem,
  HealthResponse,
  RuntimeConfig,
} from '@/types'

const BASE = import.meta.env.VITE_API_URL ?? '/api'

type JsonRecord = Record<string, unknown>

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

function asRecord(value: unknown): JsonRecord {
  return typeof value === 'object' && value !== null ? value as JsonRecord : {}
}

function readString(record: JsonRecord, key: string): string | undefined {
  const value = record[key]
  return typeof value === 'string' ? value : undefined
}

function readNumber(record: JsonRecord, key: string): number | undefined {
  const value = record[key]
  return typeof value === 'number' ? value : undefined
}

function readBoolean(record: JsonRecord, key: string): boolean | undefined {
  const value = record[key]
  return typeof value === 'boolean' ? value : undefined
}

function normalizeRunPhase(phase: unknown): ExecutionRun['phase'] {
  return phase === 'step' || phase === 'fix' || phase === 'verification'
    ? phase
    : 'step'
}

function normalizeRun(run: JsonRecord): ExecutionRun {
  return {
    id: String(readString(run, 'id') ?? ''),
    taskId: String(readString(run, 'taskId') ?? readString(run, 'task_id') ?? ''),
    stepId: readString(run, 'stepId') ?? readString(run, 'step_id') ?? null,
    agentId: readString(run, 'agentId') ?? readString(run, 'agent_id') ?? null,
    agentName: readString(run, 'agentName') ?? readString(run, 'agent_name'),
    phase: normalizeRunPhase(readString(run, 'phase')),
    runIndex: Number(readNumber(run, 'runIndex') ?? readNumber(run, 'run_index') ?? 0),
    promptSent: readString(run, 'promptSent') ?? readString(run, 'prompt_sent'),
    output: String(readString(run, 'output') ?? ''),
    errorMessage: readString(run, 'errorMessage') ?? readString(run, 'error_message'),
    exitCode: readNumber(run, 'exitCode') ?? readNumber(run, 'exit_code') ?? null,
    success: readBoolean(run, 'success') ?? null,
    durationMs: readNumber(run, 'durationMs') ?? readNumber(run, 'duration_ms') ?? null,
    startedAt: String(readString(run, 'startedAt') ?? readString(run, 'started_at') ?? ''),
    completedAt: readString(run, 'completedAt') ?? readString(run, 'completed_at') ?? null,
  }
}

function normalizeLog(log: JsonRecord): AgentLog {
  return {
    id: String(readString(log, 'id') ?? ''),
    runId: String(readString(log, 'runId') ?? readString(log, 'run_id') ?? readString(log, 'executionRunId') ?? readString(log, 'execution_run_id') ?? ''),
    sequence: Number(readNumber(log, 'sequence') ?? 0),
    type: (readString(log, 'type') ?? readString(log, 'logType') ?? readString(log, 'log_type') ?? 'stdout') as AgentLog['type'],
    content: String(readString(log, 'content') ?? ''),
    createdAt: String(readString(log, 'createdAt') ?? readString(log, 'created_at') ?? readString(log, 'timestamp') ?? ''),
  }
}

function normalizeServiceStatus(status: unknown): HealthResponse['status'] {
  return status === 'ok' || status === 'warn' || status === 'error'
    ? status
    : 'unknown'
}

function normalizeHealthKey(value: string): string {
  const key = value.trim().toLowerCase()

  if (!key) return ''
  if (key === 'backend') return 'backend'
  if (key === 'claude') return 'claude'
  if (key === 'gemini') return 'gemini'
  if (key === 'redis' || key === 'queue') return 'redis'
  if (key === 'database' || key === 'storage' || key === 'postgres' || key === 'postgresql' || key === 'db') {
    return 'database'
  }

  return value.trim()
}

const HEALTH_LABELS: Record<string, string> = {
  backend: 'Backend',
  database: 'PostgreSQL',
  redis: 'Redis',
  claude: 'Claude CLI',
  gemini: 'Gemini API',
}

function normalizeHealthCheck(record: JsonRecord, fallbackKey = ''): HealthCheckItem {
  const key = normalizeHealthKey(
    String(readString(record, 'key') ?? readString(record, 'name') ?? readString(record, 'label') ?? fallbackKey),
  )

  return {
    key,
    label: String(
      readString(record, 'label')
        ?? readString(record, 'name')
        ?? readString(record, 'key')
        ?? HEALTH_LABELS[key]
        ?? fallbackKey,
    ),
    status: normalizeServiceStatus(readString(record, 'status')),
    detail: readString(record, 'detail'),
    configured: readBoolean(record, 'configured'),
  }
}

function normalizeHealthChecks(value: unknown): HealthCheckItem[] {
  if (Array.isArray(value)) {
    return value.map(check => normalizeHealthCheck(asRecord(check)))
  }

  if (!value || typeof value !== 'object') {
    return []
  }

  const record = asRecord(value)
  const orderedKeys = ['backend', 'database', 'redis', 'claude', 'gemini']
  const remainingKeys = Object.keys(record).filter(key => !orderedKeys.includes(key))

  return [...orderedKeys, ...remainingKeys].flatMap(key => {
    const item = record[key]
    if (!item || typeof item !== 'object') return []
    return [normalizeHealthCheck(asRecord(item), key)]
  })
}

function normalizeHealth(raw: JsonRecord): HealthResponse {
  const checks = normalizeHealthChecks(raw.checks)

  return {
    status: normalizeServiceStatus(readString(raw, 'status')),
    checks,
    updatedAt: readString(raw, 'updatedAt') ?? readString(raw, 'updated_at'),
  }
}

function normalizeRuntimeConfig(raw: JsonRecord): RuntimeConfig {
  const allowOriginsValue = raw.allowOrigins ?? raw.allow_origins
  return {
    port: Number(readNumber(raw, 'port') ?? 0),
    claudeTimeoutSecs: Number(readNumber(raw, 'claudeTimeoutSecs') ?? readNumber(raw, 'claude_timeout_secs') ?? 0),
    defaultMaxRetries: Number(readNumber(raw, 'defaultMaxRetries') ?? readNumber(raw, 'default_max_retries') ?? 0),
    taskConcurrency: Number(readNumber(raw, 'taskConcurrency') ?? readNumber(raw, 'task_concurrency') ?? 0),
    allowOrigins: Array.isArray(allowOriginsValue)
      ? allowOriginsValue.map(value => String(value))
      : [],
    geminiApiKeyConfigured: Boolean(
      readBoolean(raw, 'geminiApiKeyConfigured')
      ?? readBoolean(raw, 'gemini_api_key_configured')
      ?? readBoolean(raw, 'geminiApiKey')
      ?? readBoolean(raw, 'gemini_api_key')
      ?? readString(raw, 'geminiApiKey')
      ?? readString(raw, 'gemini_api_key'),
    ),
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
  runs:   async (id: string)         => (await request<unknown[]>(`/tasks/${id}/runs`)).map(item => normalizeRun(asRecord(item))),
}

export const runsApi = {
  logs:   async (runId: string)      => (await request<unknown[]>(`/runs/${runId}/logs`)).map(item => normalizeLog(asRecord(item))),
}

export const settingsApi = {
  health: async () => normalizeHealth(asRecord(await request<unknown>('/health'))),
  runtimeConfig: async () => normalizeRuntimeConfig(asRecord(await request<unknown>('/runtime-config'))),
}

// ── SSE stream ─────────────────────────────────────────────────────────────
export function createTaskStream(taskId: string): EventSource {
  return new EventSource(`${BASE}/tasks/${taskId}/stream`)
}
