import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Terminal, ChevronDown, ChevronUp } from 'lucide-react'
import { useTask } from '@/hooks/useTasks'
import { useTaskStream } from '@/hooks/useTaskStream'
import { Button } from '@/components/ui/Button'
import { StatusBadge } from '@/components/ui/Badge'
import { EmptyState } from '@/components/ui/EmptyState'
import { cn, formatRelative } from '@/lib/utils'
import type { TaskStatus } from '@/types'

// ── Task Header ───────────────────────────────────────────────────────────

function TaskHeader({ taskId }: { taskId: string }) {
  const { data: task } = useTask(taskId)
  const navigate = useNavigate()

  if (!task) {
    return (
      <div className="flex items-center gap-3 pb-4 border-b border-[var(--color-border)]">
        <Button variant="ghost" size="sm" onClick={() => navigate(-1)}>
          <ArrowLeft size={16} />
        </Button>
        <span className="text-[var(--color-muted)]">任務未找到</span>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4 pb-6 border-b border-[var(--color-border)]">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => navigate(-1)}>
          <ArrowLeft size={16} />
        </Button>
        <h1 className="text-2xl font-bold">任務詳情</h1>
      </div>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <StatusBadge status={task.status} />
          <span className="text-sm text-[var(--color-muted)]">
            重試次數：{task.currentRetry} / {task.maxRetries}
          </span>
        </div>
        <div className="text-sm text-[var(--color-muted)]">
          {task.createdAt && <span>建立：{formatRelative(task.createdAt as string)}</span>}
        </div>
      </div>
    </div>
  )
}

// ── Expandable Panel ──────────────────────────────────────────────────────

function ExpandablePanel({
  title,
  icon: Icon,
  children,
  defaultExpanded = true,
}: {
  title: string | React.ReactNode
  icon?: React.ComponentType<{ size: number }>
  children: React.ReactNode
  defaultExpanded?: boolean
}) {
  const [expanded, setExpanded] = useState(defaultExpanded)
  const IconComponent = Icon

  return (
    <div className="border border-[var(--color-border)] rounded-[var(--radius-md)] overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center justify-between w-full px-4 py-3 bg-[var(--color-surface-2)] text-sm font-medium cursor-pointer hover:bg-[var(--color-surface-3)] transition-colors"
      >
        <span className="flex items-center gap-2">
          {IconComponent && <IconComponent size={16} />}
          {title}
        </span>
        {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
      </button>
      {expanded && (
        <div className="bg-[var(--color-background)] p-4">
          {children}
        </div>
      )}
    </div>
  )
}

// ── Task Prompt Panel ─────────────────────────────────────────────────────

function TaskPromptPanel({ taskId }: { taskId: string }) {
  const { data: task } = useTask(taskId)

  if (!task) return null

  return (
    <ExpandablePanel title="提示詞" defaultExpanded>
      <div className="bg-[var(--color-surface)] rounded p-3 text-sm whitespace-pre-wrap font-mono text-[var(--color-foreground)]">
        {task.prompt}
      </div>
    </ExpandablePanel>
  )
}

// ── Pipeline Snapshot Panel ───────────────────────────────────────────────

function PipelineSnapshotPanel({ taskId }: { taskId: string }) {
  const { data: task } = useTask(taskId)

  if (!task || !task.pipelineSnapshot) return null

  const snapshot = task.pipelineSnapshot

  return (
    <ExpandablePanel title="Pipeline 快照" defaultExpanded>
      <div className="space-y-3">
        <div>
          <h3 className="text-sm font-medium mb-2">Pipeline：{snapshot.name}</h3>
          {snapshot.steps && snapshot.steps.length > 0 ? (
            <div className="space-y-2">
              {snapshot.steps.map((step: any) => (
                <div
                  key={step.id}
                  className="flex items-center gap-2 p-2 bg-[var(--color-surface)] rounded text-sm"
                >
                  <span className="font-mono text-xs bg-[var(--color-surface-2)] px-2 py-1 rounded">
                    {step.order}
                  </span>
                  <span>{step.label}</span>
                  <span className="text-[var(--color-muted)] ml-auto">{step.agent?.name}</span>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState
              icon={Terminal}
              title="無步驟"
              description="此 Pipeline 沒有定義步驟"
            />
          )}
        </div>
      </div>
    </ExpandablePanel>
  )
}

// ── Step Output Panel ─────────────────────────────────────────────────────

function StepOutputPanel({ taskId }: { taskId: string }) {
  const { data: task } = useTask(taskId)

  if (!task || !task.stepOutputs || Object.keys(task.stepOutputs).length === 0) {
    return null
  }

  return (
    <ExpandablePanel title="步驟輸出" defaultExpanded={false}>
      <div className="space-y-3">
        {Object.entries(task.stepOutputs).map(([stepId, output]: [string, any]) => (
          <div key={stepId} className="bg-[var(--color-surface)] rounded p-3">
            <h4 className="text-sm font-medium mb-2">{stepId}</h4>
            <div className="bg-[var(--color-background)] rounded p-2 max-h-32 overflow-y-auto">
              <pre className="text-xs whitespace-pre-wrap font-mono text-[var(--color-muted)]">
                {typeof output === 'string' ? output : JSON.stringify(output, null, 2)}
              </pre>
            </div>
          </div>
        ))}
      </div>
    </ExpandablePanel>
  )
}

// ── Execution Runs Panel ──────────────────────────────────────────────────

function ExecutionRunsPanel({ taskId }: { taskId: string }) {
  const { data: task } = useTask(taskId)

  if (!task || !task.runs || task.runs.length === 0) {
    return (
      <ExpandablePanel title="執行紀錄" defaultExpanded={false}>
        <EmptyState
          icon={Terminal}
          title="無執行紀錄"
          description="此任務還沒有執行記錄"
        />
      </ExpandablePanel>
    )
  }

  return (
    <ExpandablePanel title="執行紀錄" defaultExpanded={false}>
      <div className="space-y-2">
        {task.runs.map((run: any) => (
          <div
            key={run.id}
            className="flex items-center justify-between p-3 bg-[var(--color-surface)] rounded text-sm"
          >
            <div className="flex flex-col gap-1 flex-1">
              <span className="font-mono text-xs text-[var(--color-muted)]">Run {run.runIndex}</span>
              <span className="text-[var(--color-foreground)]">
                Phase: <span className="font-mono">{run.phase}</span>
              </span>
            </div>
            <div className="text-right text-xs text-[var(--color-muted)]">
              {run.completedAt ? (
                <span>{formatRelative(run.completedAt as string)}</span>
              ) : (
                <span>執行中...</span>
              )}
            </div>
          </div>
        ))}
      </div>
    </ExpandablePanel>
  )
}

// ── Live Log Panel ────────────────────────────────────────────────────────

function LiveLogPanel({ taskId, status }: { taskId: string; status: TaskStatus }) {
  const isActive = ['running', 'verifying', 'fixing'].includes(status)
  const { logs, isConnected } = useTaskStream(taskId, isActive)

  if (!isActive && logs.length === 0) return null

  return (
    <ExpandablePanel
      title={
        <span className="flex items-center gap-2">
          即時日誌
          {isConnected && (
            <span className="w-2 h-2 rounded-full bg-[var(--color-accent)] animate-pulse-dot" />
          )}
        </span>
      }
      icon={Terminal}
      defaultExpanded
    >
      <div className="bg-[var(--color-background)] p-3 max-h-96 overflow-y-auto rounded font-mono text-sm log-terminal">
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
    </ExpandablePanel>
  )
}

// ── Main Component ────────────────────────────────────────────────────────

export function TaskDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { data: task, isLoading } = useTask(id!)

  if (!id) {
    return (
      <EmptyState
        icon={Terminal}
        title="無效的任務 ID"
        description="找不到指定的任務"
      />
    )
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-[var(--color-muted)]">載入中...</div>
      </div>
    )
  }

  if (!task) {
    return (
      <EmptyState
        icon={Terminal}
        title="任務未找到"
        description="此任務不存在或已被刪除"
      />
    )
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6 py-8">
      <TaskHeader taskId={id} />
      <div className="space-y-4">
        <TaskPromptPanel taskId={id} />
        <PipelineSnapshotPanel taskId={id} />
        <StepOutputPanel taskId={id} />
        <ExecutionRunsPanel taskId={id} />
        <LiveLogPanel taskId={id} status={task.status} />
      </div>
    </div>
  )
}
