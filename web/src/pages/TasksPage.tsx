import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Plus, RotateCcw, X, Terminal, ChevronDown, ChevronUp } from 'lucide-react'
import { useProject } from '@/hooks/useProjects'
import { useTasks, useCreateTask, useCancelTask, useRetryTask } from '@/hooks/useTasks'
import { useTaskStream } from '@/hooks/useTaskStream'
import { Button } from '@/components/ui/Button'
import { Input, Textarea } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { StatusBadge } from '@/components/ui/Badge'
import { EmptyState } from '@/components/ui/EmptyState'
import { cn, formatRelative } from '@/lib/utils'
import type { Task, TaskFormData, TaskStatus } from '@/types'

const COLUMNS: { status: TaskStatus; label: string }[] = [
  { status: 'pending',   label: '待執行' },
  { status: 'running',   label: '執行中' },
  { status: 'verifying', label: '驗收中' },
  { status: 'fixing',    label: '修正中' },
  { status: 'done',      label: '完成' },
  { status: 'failed',    label: '失敗' },
]

// ── Task Log Viewer ───────────────────────────────────────────────────────

function TaskLogViewer({ taskId, status }: { taskId: string; status: TaskStatus }) {
  const isActive = ['running', 'verifying', 'fixing'].includes(status)
  const { logs, isConnected } = useTaskStream(taskId, isActive)
  const [expanded, setExpanded] = useState(true)

  if (!isActive && logs.length === 0) return null

  return (
    <div className="border border-[var(--color-border)] rounded-[var(--radius-md)] overflow-hidden">
      <button
        onClick={() => setExpanded(e => !e)}
        className="flex items-center justify-between w-full px-4 py-2.5 bg-[var(--color-surface-2)] text-sm font-medium cursor-pointer"
      >
        <span className="flex items-center gap-2">
          <Terminal size={14} className="text-[var(--color-muted)]" />
          即時日誌
          {isConnected && (
            <span className="w-2 h-2 rounded-full bg-[var(--color-accent)] animate-pulse-dot" />
          )}
        </span>
        {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
      </button>
      {expanded && (
        <div className="bg-[var(--color-background)] p-4 max-h-64 overflow-y-auto log-terminal">
          {logs.length === 0 ? (
            <span className="text-[var(--color-muted)]">等待輸出...</span>
          ) : (
            logs.map((l, i) => (
              <div
                key={i}
                className={cn(
                  l.type === 'system' && 'text-[var(--color-accent)] font-medium',
                  l.type === 'stderr' && 'text-[var(--color-destructive)]',
                  l.type === 'stdout' && 'text-[var(--color-foreground)]',
                )}
              >
                {l.content}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}

// ── Task Card ─────────────────────────────────────────────────────────────

function TaskCard({
  task, onDetail,
}: {
  task: Task
  onDetail: (t: Task) => void
}) {
  const cancel = useCancelTask()
  const retry  = useRetryTask()
  const canCancel = ['pending', 'running', 'verifying', 'fixing'].includes(task.status)
  const canRetry  = task.status === 'failed'

  return (
    <div
      className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius-md)] p-4 flex flex-col gap-3 hover:border-[var(--color-accent)] transition-colors duration-150 cursor-pointer animate-fade-in"
      onClick={() => onDetail(task)}
      role="button"
      tabIndex={0}
      onKeyDown={e => e.key === 'Enter' && onDetail(task)}
      aria-label={`查看任務詳情：${task.prompt.slice(0, 40)}`}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm text-[var(--color-foreground)] line-clamp-2 flex-1">{task.prompt}</p>
        <StatusBadge status={task.status} />
      </div>

      {/* Retry progress */}
      {task.maxRetries > 0 && (
        <div className="flex items-center gap-2">
          <div className="flex-1 bg-[var(--color-surface-2)] rounded-full h-1">
            <div
              className="h-1 rounded-full bg-[var(--color-accent)] transition-all duration-300"
              style={{ width: `${(task.currentRetry / task.maxRetries) * 100}%` }}
            />
          </div>
          <span className="text-xs text-[var(--color-muted)] shrink-0">
            {task.currentRetry}/{task.maxRetries}
          </span>
        </div>
      )}

      <TaskLogViewer taskId={task.id} status={task.status} />

      <div className="flex items-center justify-between">
        <span className="text-xs text-[var(--color-muted)]">{formatRelative(task.createdAt)}</span>
        <div className="flex gap-1" onClick={e => e.stopPropagation()}>
          {canRetry && (
            <button
              onClick={() => retry.mutate(task.id)}
              className="p-1.5 rounded-[var(--radius-sm)] text-[var(--color-muted)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-foreground)] transition-colors cursor-pointer"
              aria-label="重試任務"
            >
              <RotateCcw size={13} />
            </button>
          )}
          {canCancel && (
            <button
              onClick={() => cancel.mutate(task.id)}
              className="p-1.5 rounded-[var(--radius-sm)] text-[var(--color-muted)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-destructive)] transition-colors cursor-pointer"
              aria-label="取消任務"
            >
              <X size={13} />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Task Detail Modal ────────────────────────────────────────────────────

function TaskDetailModal({ task, onClose }: { task: Task | null; onClose: () => void }) {
  if (!task) return null
  const snapshot = task.pipelineSnapshot

  return (
    <Modal open={!!task} onClose={onClose} title="任務詳情" size="lg">
      <div className="flex flex-col gap-5">
        {/* Status + retry */}
        <div className="flex items-center gap-3">
          <StatusBadge status={task.status} />
          <span className="text-sm text-[var(--color-muted)]">
            重試 {task.currentRetry} / {task.maxRetries} 次
          </span>
        </div>

        {/* Prompt */}
        <div>
          <p className="text-xs font-medium text-[var(--color-muted)] mb-1.5">任務提示詞</p>
          <p className="text-sm bg-[var(--color-surface-2)] rounded-[var(--radius-md)] p-3 leading-relaxed">
            {task.prompt}
          </p>
        </div>

        {/* Pipeline steps */}
        <div>
          <p className="text-xs font-medium text-[var(--color-muted)] mb-2">
            Pipeline：{snapshot.name}
          </p>
          <div className="flex flex-col gap-2">
            {snapshot.steps.map((step, i) => {
              const output = task.stepOutputs?.[step.id]
              return (
                <div key={step.id} className="border border-[var(--color-border)] rounded-[var(--radius-md)] overflow-hidden">
                  <div className="flex items-center gap-2 px-3 py-2 bg-[var(--color-surface-2)]">
                    <span className="w-5 h-5 rounded-full bg-[var(--color-accent)] text-white text-xs flex items-center justify-center shrink-0">
                      {i + 1}
                    </span>
                    <span className="text-sm font-medium">{step.agent.name}</span>
                    {step.label && (
                      <span className="text-xs text-[var(--color-muted)]">({step.label})</span>
                    )}
                    {output && (
                      <span className="ml-auto text-xs text-[var(--color-accent)]">✓ 完成</span>
                    )}
                  </div>
                  {output && (
                    <div className="px-3 py-2 bg-[var(--color-background)] log-terminal text-xs max-h-32 overflow-y-auto">
                      {output}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {/* Live log */}
        <TaskLogViewer taskId={task.id} status={task.status} />

        <p className="text-xs text-[var(--color-muted)]">建立於 {formatRelative(task.createdAt)}</p>
      </div>
    </Modal>
  )
}

// ── Create Task Form ──────────────────────────────────────────────────────

function CreateTaskForm({ onSubmit, loading }: { onSubmit: (d: TaskFormData) => void; loading?: boolean }) {
  const [form, setForm] = useState<TaskFormData>({ prompt: '', maxRetries: 5 })
  const [error, setError] = useState('')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.prompt.trim()) { setError('請輸入任務描述'); return }
    onSubmit(form)
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <Textarea
        label="任務描述" required
        value={form.prompt}
        onChange={e => { setForm(f => ({ ...f, prompt: e.target.value })); setError('') }}
        placeholder="新增一個使用者登入功能，支援 email + 密碼驗證..."
        rows={4}
        error={error}
      />
      <Input
        label="最大重試次數"
        type="number" min={0} max={20}
        value={form.maxRetries}
        onChange={e => setForm(f => ({ ...f, maxRetries: Number(e.target.value) }))}
        helper="驗收失敗時，最多重試幾次（0 = 不重試）"
      />
      <div className="flex justify-end pt-2">
        <Button type="submit" loading={loading}>建立任務</Button>
      </div>
    </form>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────

export function TasksPage() {
  const { id: projectId = '' } = useParams()
  const navigate = useNavigate()
  const { data: project, isLoading: loadingProject } = useProject(projectId)
  const { data: tasks = [], isLoading: loadingTasks }  = useTasks(projectId)
  const create = useCreateTask()

  const [createOpen, setCreateOpen] = useState(false)
  const [detailTask, setDetailTask] = useState<Task | null>(null)

  const handleCreate = (data: TaskFormData) => {
    create.mutate({ projectId, data }, { onSuccess: () => setCreateOpen(false) })
  }

  const tasksByStatus = (status: TaskStatus) => tasks.filter(t => t.status === status)
  const activeStatuses: TaskStatus[] = ['running', 'verifying', 'fixing']
  const hasActive = tasks.some(t => activeStatuses.includes(t.status))

  if (loadingProject || loadingTasks) {
    return (
      <div className="flex items-center justify-center h-48">
        <span className="w-6 h-6 border-2 border-[var(--color-accent)] border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/')}
            className="p-2 rounded-[var(--radius-md)] text-[var(--color-muted)] hover:bg-[var(--color-surface-2)] transition-colors cursor-pointer"
            aria-label="返回專案列表"
          >
            <ArrowLeft size={16} />
          </button>
          <div>
            <h1 className="text-xl font-semibold">{project?.name}</h1>
            <p className="text-xs text-[var(--color-muted)] font-mono mt-0.5">{project?.path}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {hasActive && (
            <span className="flex items-center gap-1.5 text-xs text-[var(--color-status-running)]">
              <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-status-running)] animate-pulse-dot" />
              執行中
            </span>
          )}
          <Button onClick={() => setCreateOpen(true)}>
            <Plus size={16} /> 新增任務
          </Button>
        </div>
      </div>

      {/* Kanban */}
      {tasks.length === 0 ? (
        <EmptyState
          icon={Plus}
          title="還沒有任務"
          description="輸入任務描述，讓 AI 自動執行"
          action={<Button onClick={() => setCreateOpen(true)}><Plus size={16} /> 新增任務</Button>}
        />
      ) : (
        <div className="flex gap-4 overflow-x-auto pb-4">
          {COLUMNS.map(col => {
            const colTasks = tasksByStatus(col.status)
            return (
              <div key={col.status} className="flex-shrink-0 w-72">
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-sm font-medium">{col.label}</span>
                  {colTasks.length > 0 && (
                    <span className="text-xs px-1.5 py-0.5 rounded-full bg-[var(--color-surface-2)] text-[var(--color-muted)]">
                      {colTasks.length}
                    </span>
                  )}
                </div>
                <div className="flex flex-col gap-3 min-h-24">
                  {colTasks.map(task => (
                    <TaskCard key={task.id} task={task} onDetail={setDetailTask} />
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Modals */}
      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="新增任務">
        <CreateTaskForm onSubmit={handleCreate} loading={create.isPending} />
      </Modal>

      <TaskDetailModal task={detailTask} onClose={() => setDetailTask(null)} />
    </div>
  )
}
