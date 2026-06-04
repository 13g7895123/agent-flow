// ── Enums ──────────────────────────────────────────────────────────────────

export type ModelProvider = 'claude' | 'gemini'

export type TaskStatus =
  | 'pending'
  | 'running'
  | 'verifying'
  | 'fixing'
  | 'done'
  | 'failed'
  | 'cancelled'

export type RunPhase = 'step' | 'fix' | 'verification'
export type LogType  = 'stdout' | 'stderr'

// ── Agents ─────────────────────────────────────────────────────────────────

export interface Agent {
  id: string
  name: string
  description: string
  modelProvider: ModelProvider
  modelId: string
  systemPrompt: string
  stepPrompt: string
  isActive: boolean
  usedInPipelines: number
  createdAt: string
  updatedAt: string
}

export interface AgentFormData {
  name: string
  description: string
  modelProvider: ModelProvider
  modelId: string
  systemPrompt: string
  stepPrompt: string
}

// ── Pipelines ──────────────────────────────────────────────────────────────

export interface PipelineStep {
  id: string
  agentId: string
  agent: Pick<Agent, 'id' | 'name' | 'modelProvider' | 'modelId'>
  order: number
  label: string
}

export interface Pipeline {
  id: string
  name: string
  description: string
  fixerAgentId: string
  fixerAgent: Pick<Agent, 'id' | 'name' | 'modelProvider'>
  steps: PipelineStep[]
  isDefault: boolean
  isActive: boolean
  createdAt: string
  updatedAt: string
}

export interface PipelineFormData {
  name: string
  description: string
  fixerAgentId: string
  steps: { agentId: string; order: number; label: string }[]
}

// ── Projects ───────────────────────────────────────────────────────────────

export interface Project {
  id: string
  name: string
  path: string
  testCommand: string
  pipelineId: string
  pipeline: Pick<Pipeline, 'id' | 'name'>
  createdAt: string
  updatedAt: string
}

export interface ProjectFormData {
  name: string
  path: string
  testCommand: string
  pipelineId: string
}

// ── Tasks ──────────────────────────────────────────────────────────────────

export interface AgentSnapshot {
  id: string
  name: string
  modelProvider: ModelProvider
  modelId: string
  systemPrompt: string
  stepPrompt: string
}

export interface StepSnapshot {
  id: string
  agentId: string
  agent: AgentSnapshot
  order: number
  label: string
}

export interface PipelineSnapshot {
  id: string
  name: string
  fixerAgent: AgentSnapshot
  steps: StepSnapshot[]
}

export interface ExecutionRun {
  id: string
  taskId: string
  stepId: string | null
  agentId?: string | null
  agentName?: string
  phase: RunPhase
  runIndex: number
  promptSent?: string
  output: string
  errorMessage?: string
  exitCode: number | null
  success?: boolean | null
  durationMs?: number | null
  startedAt: string
  completedAt: string | null
}

export interface AgentLog {
  id: string
  runId: string
  sequence: number
  type: LogType
  content: string
  createdAt: string
}

export interface Task {
  id: string
  projectId: string
  prompt: string
  status: TaskStatus
  currentRetry: number
  maxRetries: number
  pipelineSnapshot: PipelineSnapshot
  stepOutputs: Record<string, string>
  createdAt: string
  updatedAt: string
  completedAt: string | null
}

export interface TaskFormData {
  prompt: string
  maxRetries: number
}

// ── SSE Events ─────────────────────────────────────────────────────────────

export interface SseStepStartEvent {
  stepOrder: number
  agentName: string
  label: string
}

export interface SseLogEvent {
  type: LogType
  content: string
  sequence: number
}

export interface SseStepDoneEvent {
  stepOrder: number
  agentName: string
  success: boolean
}

export interface SseStatusEvent {
  taskId: string
  status: TaskStatus
  currentRetry: number
}

export interface SseDoneEvent {
  taskId: string
  status: TaskStatus
}

// ── API Response wrappers ──────────────────────────────────────────────────

export interface ApiError {
  message: string
  code?: string
}

export interface Paginated<T> {
  data: T[]
  total: number
  page: number
  pageSize: number
}
