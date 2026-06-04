import { useEffect, useState, type ComponentType, type ReactNode } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, ChevronDown, ChevronUp, FileText, GitBranch, History, Terminal } from 'lucide-react'
import { useRunLogs, useTask, useTaskRuns } from '@/hooks/useTasks'
import { useTaskStream } from '@/hooks/useTaskStream'
import { StatusBadge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { cn, formatRelative } from '@/lib/utils'
import type { ExecutionRun, Task, TaskStatus } from '@/types'

function ExpandablePanel({
  title,
  icon: Icon,
  children,
  defaultExpanded = true,
}: {
  title: ReactNode
  icon?: ComponentType<{ size: number }>
  children: ReactNode
  defaultExpanded?: boolean
}) {
  const [expanded, setExpanded] = useState(defaultExpanded)

  return (
    <div className="overflow-hidden rounded-[var(--radius-md)] border border-[var(--color-border)]">
      <button
        onClick={() => setExpanded(current => !current)}
        className="flex w-full items-center justify-between bg-[var(--color-surface-2)] px-4 py-3 text-sm font-medium transition-colors hover:bg-[var(--color-surface-3)]"
      >
        <span className="flex items-center gap-2">
          {Icon ? <Icon size={16} /> : null}
          {title}
        </span>
        {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
      </button>
      {expanded ? <div className="bg-[var(--color-background)] p-4">{children}</div> : null}
    </div>
  )
}

function TaskHeader({ task }: { task: Task }) {
  const navigate = useNavigate()

  return (
    <div className="border-b border-[var(--color-border)] pb-6">
      <div className="mb-4 flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => navigate(-1)}>
          <ArrowLeft size={16} />
        </Button>
        <h1 className="text-2xl font-bold">任務詳情</h1>
      </div>

      <div className="grid gap-3 md:grid-cols-[auto,1fr] md:items-start">
        <div className="flex items-center gap-3">
          <StatusBadge status={task.status} />
          <span className="text-sm text-[var(--color-muted)]">
            重試次數：{task.currentRetry} / {task.maxRetries}
          </span>
        </div>
        <div className="grid gap-1 text-sm text-[var(--color-muted)] md:justify-items-end">
          <span>建立：{formatRelative(task.createdAt)}</span>
          <span>更新：{formatRelative(task.updatedAt)}</span>
          {task.completedAt ? <span>完成：{formatRelative(task.completedAt)}</span> : null}
        </div>
      </div>
    </div>
  )
}

function TaskPromptPanel({ task }: { task: Task }) {
  return (
    <ExpandablePanel title="提示詞" icon={FileText}>
      <pre className="whitespace-pre-wrap rounded bg-[var(--color-surface)] p-3 font-mono text-sm text-[var(--color-foreground)]">
        {task.prompt}
      </pre>
    </ExpandablePanel>
  )
}

function PipelineSnapshotPanel({ task }: { task: Task }) {
  const steps = [...task.pipelineSnapshot.steps].sort((a, b) => a.order - b.order)

  return (
    <ExpandablePanel title="Pipeline 快照" icon={GitBranch}>
      <div className="space-y-3">
        <div>
          <div className="text-sm font-medium">Pipeline：{task.pipelineSnapshot.name}</div>
          <div className="mt-1 text-xs text-[var(--color-muted)]">
            Fixer：{task.pipelineSnapshot.fixerAgent.name}
          </div>
        </div>
        {steps.length === 0 ? (
          <EmptyState icon={Terminal} title="無步驟" description="此 Pipeline 沒有定義步驟" />
        ) : (
          <div className="space-y-2">
            {steps.map(step => (
              <div
                key={step.id}
                className="flex items-center gap-3 rounded bg-[var(--color-surface)] p-3 text-sm"
              >
                <span className="rounded bg-[var(--color-surface-2)] px-2 py-1 font-mono text-xs">
                  {step.order}
                </span>
                <div className="flex-1">
                  <div>{step.label}</div>
                  <div className="text-xs text-[var(--color-muted)]">{step.agent.name}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </ExpandablePanel>
  )
}

function StepOutputPanel({ task }: { task: Task }) {
  const entries = Object.entries(task.stepOutputs ?? {})
  if (entries.length === 0) return null

  return (
    <ExpandablePanel title="步驟輸出" icon={Terminal} defaultExpanded={false}>
      <div className="space-y-3">
        {entries.map(([stepId, output]) => (
          <div key={stepId} className="rounded bg-[var(--color-surface)] p-3">
            <div className="mb-2 text-sm font-medium">{stepId}</div>
            <pre className="max-h-48 overflow-y-auto whitespace-pre-wrap rounded bg-[var(--color-background)] p-2 font-mono text-xs text-[var(--color-muted)]">
              {output}
            </pre>
          </div>
        ))}
      </div>
    </ExpandablePanel>
  )
}

function ExecutionRunsPanel({
  runs,
  selectedRunId,
  onSelectRun,
}: {
  runs: ExecutionRun[]
  selectedRunId: string | null
  onSelectRun: (runId: string) => void
}) {
  return (
    <ExpandablePanel title="執行紀錄" icon={History} defaultExpanded={false}>
      {runs.length === 0 ? (
        <EmptyState icon={Terminal} title="無執行紀錄" description="此任務還沒有執行記錄" />
      ) : (
        <div className="space-y-2">
          {runs.map(run => {
            const isSelected = run.id === selectedRunId
            return (
              <button
                key={run.id}
                onClick={() => onSelectRun(run.id)}
                className={cn(
                  'w-full rounded border p-3 text-left text-sm transition-colors',
                  isSelected
                    ? 'border-[var(--color-accent)] bg-[var(--color-surface)]'
                    : 'border-[var(--color-border)] bg-[var(--color-surface)] hover:border-[var(--color-accent)]',
                )}
              >
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="font-medium">
                      Run {run.runIndex} · {run.phase}
                    </div>
                    <div className="mt-1 text-xs text-[var(--color-muted)]">
                      {run.agentName ?? 'system'}
                      {run.stepId ? ` · ${run.stepId}` : ''}
                    </div>
                  </div>
                  <div className="text-right text-xs text-[var(--color-muted)]">
                    <div>{formatRelative(run.startedAt)}</div>
                    <div>
                      {run.completedAt ? formatRelative(run.completedAt) : '執行中'}
                    </div>
                  </div>
                </div>
                <div className="mt-2 flex flex-wrap gap-2 text-xs text-[var(--color-muted)]">
                  <span>exit: {run.exitCode ?? '-'}</span>
                  <span>success: {run.success == null ? '-' : run.success ? 'yes' : 'no'}</span>
                  {run.durationMs != null ? <span>{run.durationMs} ms</span> : null}
                </div>
              </button>
            )
          })}
        </div>
      )}
    </ExpandablePanel>
  )
}

function LogViewerPanel({
  taskId,
  status,
  selectedRun,
}: {
  taskId: string
  status: TaskStatus
  selectedRun: ExecutionRun | null
}) {
  const isActive = ['running', 'verifying', 'fixing'].includes(status)
  const { logs: liveLogs, isConnected } = useTaskStream(taskId, isActive)
  const { data: historyLogs = [] } = useRunLogs(isActive ? null : selectedRun?.id ?? null)
  const lines = isActive
    ? liveLogs
    : historyLogs.map(log => ({
        sequence: log.sequence,
        type: log.type,
        content: log.content,
      }))

  return (
    <ExpandablePanel
      title={
        <span className="flex items-center gap-2">
          {isActive ? '即時日誌' : '歷史日誌'}
          {isActive && isConnected ? (
            <span className="h-2 w-2 rounded-full bg-[var(--color-accent)] animate-pulse-dot" />
          ) : null}
        </span>
      }
      icon={Terminal}
    >
      {!isActive && !selectedRun ? (
        <EmptyState icon={Terminal} title="尚未選擇執行紀錄" description="先在上方選擇一筆 run 來查看輸出" />
      ) : (
        <div className="space-y-3">
          {selectedRun ? (
            <div className="rounded bg-[var(--color-surface)] p-3 text-xs text-[var(--color-muted)]">
              <div>Phase：{selectedRun.phase}</div>
              {selectedRun.promptSent ? (
                <pre className="mt-2 whitespace-pre-wrap font-mono text-[11px] text-[var(--color-foreground)]">
                  {selectedRun.promptSent}
                </pre>
              ) : null}
              {!isActive && selectedRun.output ? (
                <pre className="mt-2 whitespace-pre-wrap font-mono text-[11px] text-[var(--color-foreground)]">
                  {selectedRun.output}
                </pre>
              ) : null}
            </div>
          ) : null}

          <div className="log-terminal max-h-96 overflow-y-auto rounded bg-[var(--color-background)] p-3 font-mono text-sm">
            {lines.length === 0 ? (
              <span className="text-[var(--color-muted)]">
                {isActive ? '等待輸出...' : '此 run 沒有歷史 logs'}
              </span>
            ) : (
              lines.map(line => (
                <div
                  key={`${line.sequence}-${line.content}`}
                  className={cn(
                    line.type === 'stderr' && 'text-[var(--color-destructive)]',
                    line.type === 'stdout' && 'text-[var(--color-foreground)]',
                    line.type === 'system' && 'font-medium text-[var(--color-accent)]',
                  )}
                >
                  {line.content}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </ExpandablePanel>
  )
}

export function TaskDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { data: task, isLoading: taskLoading } = useTask(id ?? '')
  const { data: runs = [], isLoading: runsLoading } = useTaskRuns(id ?? '')
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null)

  useEffect(() => {
    if (!runs.length) {
      setSelectedRunId(null)
      return
    }

    setSelectedRunId(current => {
      if (current && runs.some(run => run.id === current)) return current
      return runs[runs.length - 1]?.id ?? null
    })
  }, [runs])

  if (!id) {
    return <EmptyState icon={Terminal} title="無效的任務 ID" description="找不到指定的任務" />
  }

  if (taskLoading || runsLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-[var(--color-muted)]">載入中...</div>
      </div>
    )
  }

  if (!task) {
    return <EmptyState icon={Terminal} title="任務未找到" description="此任務不存在或已被刪除" />
  }

  const selectedRun = runs.find(run => run.id === selectedRunId) ?? null

  return (
    <div className="mx-auto max-w-5xl space-y-6 py-8">
      <TaskHeader task={task} />
      <TaskPromptPanel task={task} />
      <PipelineSnapshotPanel task={task} />
      <StepOutputPanel task={task} />
      <ExecutionRunsPanel
        runs={runs}
        selectedRunId={selectedRunId}
        onSelectRun={setSelectedRunId}
      />
      <LogViewerPanel taskId={task.id} status={task.status} selectedRun={selectedRun} />
    </div>
  )
}
