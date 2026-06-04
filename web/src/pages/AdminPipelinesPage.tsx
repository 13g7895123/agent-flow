import { useState } from 'react'
import { Plus, GitBranch, Pencil, Trash2, Star, GripVertical, X } from 'lucide-react'
import {
  DndContext, closestCenter, PointerSensor, useSensor, useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext, verticalListSortingStrategy,
  useSortable, arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import {
  usePipelines, useCreatePipeline, useUpdatePipeline,
  useSetDefaultPipeline, useDeletePipeline,
} from '@/hooks/usePipelines'
import { useAgents } from '@/hooks/useAgents'
import { useToast } from '@/components/ui/ToastProvider'
import { AccessibleDndInstructions } from '@/components/pipelines/AccessibleDndInstructions'
import { Button } from '@/components/ui/Button'
import { Input, Select } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { ProviderBadge } from '@/components/ui/Badge'
import { EmptyState } from '@/components/ui/EmptyState'
import { cn } from '@/lib/utils'
import type { Pipeline, PipelineFormData, Agent } from '@/types'

interface StepItem {
  _key: string   // local dnd id
  agentId: string
  label: string
}

// ── Sortable Step Row ─────────────────────────────────────────────────────

function SortableStep({
  step, index, agents, onChange, onRemove,
}: {
  step: StepItem
  index: number
  agents: Agent[]
  onChange: (key: string, field: 'agentId' | 'label', val: string) => void
  onRemove: (key: string) => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: step._key })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  const selectedAgent = agents.find(a => a.id === step.agentId)

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'flex items-center gap-3 p-3 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius-md)]',
        'transition-shadow duration-150',
        isDragging && 'shadow-[var(--shadow-lg)] opacity-90 z-10',
      )}
    >
      {/* Drag handle */}
      <button
        {...attributes}
        {...listeners}
        className="text-[var(--color-muted)] cursor-grab active:cursor-grabbing p-1 hover:text-[var(--color-foreground)] transition-colors"
        aria-label={`拖曳步驟 ${index + 1}`}
        type="button"
      >
        <GripVertical size={16} />
      </button>

      <span className="w-6 h-6 rounded-full bg-[var(--color-accent)] text-white text-xs flex items-center justify-center shrink-0 font-semibold">
        {index + 1}
      </span>

      <div className="flex-1 grid grid-cols-2 gap-2">
        <div>
          <select
            value={step.agentId}
            onChange={e => onChange(step._key, 'agentId', e.target.value)}
            className="w-full h-8 text-sm px-2 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-foreground)] focus:outline-none focus:border-[var(--color-accent)] cursor-pointer"
          >
            <option value="">選擇 Agent...</option>
            {agents.filter(a => a.isActive).map(a => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
        </div>
        <input
          value={step.label}
          onChange={e => onChange(step._key, 'label', e.target.value)}
          placeholder="步驟標籤（選填）"
          className="h-8 text-sm px-2 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-foreground)] placeholder:text-[var(--color-muted)] focus:outline-none focus:border-[var(--color-accent)]"
        />
      </div>

      {/* Provider badge */}
      {selectedAgent && (
        <ProviderBadge provider={selectedAgent.modelProvider} />
      )}

      <button
        type="button"
        onClick={() => onRemove(step._key)}
        className="p-1 text-[var(--color-muted)] hover:text-[var(--color-destructive)] transition-colors cursor-pointer"
        aria-label="移除步驟"
      >
        <X size={15} />
      </button>
    </div>
  )
}

// ── Pipeline Form ─────────────────────────────────────────────────────────

let _keyCounter = 0
const newKey = () => `step-${++_keyCounter}`

export function PipelineForm({
  initial, onSubmit, loading,
}: {
  initial?: { form: PipelineFormData; steps: StepItem[] }
  onSubmit: (data: PipelineFormData) => void
  loading?: boolean
}) {
  const { data: agents = [] } = useAgents()
  const activeAgents = agents.filter(a => a.isActive)

  const [name,          setName]         = useState(initial?.form.name ?? '')
  const [description,   setDescription]  = useState(initial?.form.description ?? '')
  const [fixerAgentId,  setFixerAgentId] = useState(initial?.form.fixerAgentId ?? '')
  const [steps,         setSteps]        = useState<StepItem[]>(
    initial?.steps ?? [{ _key: newKey(), agentId: '', label: '' }],
  )
  const [errors, setErrors]              = useState<Record<string, string>>({})

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))

  const handleDragEnd = (e: DragEndEvent) => {
    const { active, over } = e
    if (!over || active.id === over.id) return
    setSteps(s => {
      const from = s.findIndex(x => x._key === active.id)
      const to   = s.findIndex(x => x._key === over.id)
      return arrayMove(s, from, to)
    })
  }

  const addStep = () =>
    setSteps(s => [...s, { _key: newKey(), agentId: '', label: '' }])

  const removeStep = (key: string) =>
    setSteps(s => s.filter(x => x._key !== key))

  const changeStep = (key: string, field: 'agentId' | 'label', val: string) =>
    setSteps(s => s.map(x => x._key === key ? { ...x, [field]: val } : x))

  const validate = () => {
    const e: Record<string, string> = {}
    if (!name.trim())       e.name        = '請輸入 Pipeline 名稱'
    if (!fixerAgentId)      e.fixerAgent  = '請選擇修正 Agent'
    if (steps.length === 0) e.steps       = '至少需要一個步驟'
    steps.forEach((s, i) => {
      if (!s.agentId) e[`step-${i}`] = `步驟 ${i + 1} 尚未選擇 Agent`
    })
    setErrors(e)
    return Object.keys(e).length === 0
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!validate()) return
    onSubmit({
      name,
      description,
      fixerAgentId,
      steps: steps.map((s, i) => ({ agentId: s.agentId, order: i + 1, label: s.label })),
    })
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Input
          label="Pipeline 名稱" required
          value={name} onChange={e => setName(e.target.value)}
          placeholder="標準開發流程"
          error={errors.name}
        />
        <Input
          label="描述"
          value={description} onChange={e => setDescription(e.target.value)}
          placeholder="分析需求後執行，失敗由執行者修正"
        />
      </div>

      <Select
        label="修正 Agent（fixerAgent）" required
        value={fixerAgentId} onChange={e => setFixerAgentId(e.target.value)}
        helper="驗收失敗時，由此 Agent 負責修正"
        error={errors.fixerAgent}
      >
        <option value="">請選擇...</option>
        {activeAgents.map(a => (
          <option key={a.id} value={a.id}>{a.name} [{a.modelProvider}]</option>
        ))}
      </Select>

      {/* Accessible DnD Instructions */}
      <AccessibleDndInstructions className="mb-4" />

      {/* Steps */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <p className="text-sm font-medium">
            執行步驟
            <span className="ml-1 text-[var(--color-muted)] font-normal">（拖曳排序）</span>
          </p>
          <button
            type="button"
            onClick={addStep}
            className="text-xs flex items-center gap-1 text-[var(--color-accent)] hover:text-[var(--color-accent-hover)] transition-colors cursor-pointer"
          >
            <Plus size={13} /> 新增步驟
          </button>
        </div>

        {errors.steps && (
          <p className="text-xs text-[var(--color-destructive)] mb-2">{errors.steps}</p>
        )}

        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={steps.map(s => s._key)} strategy={verticalListSortingStrategy}>
            <div className="flex flex-col gap-2">
              {steps.map((step, i) => (
                <div key={step._key}>
                  <SortableStep
                    step={step}
                    index={i}
                    agents={activeAgents}
                    onChange={changeStep}
                    onRemove={removeStep}
                  />
                  {errors[`step-${i}`] && (
                    <p className="text-xs text-[var(--color-destructive)] mt-1 ml-2">
                      {errors[`step-${i}`]}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </SortableContext>
        </DndContext>
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <Button type="submit" loading={loading}>
          {initial ? '儲存變更' : '建立 Pipeline'}
        </Button>
      </div>
    </form>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────

export function AdminPipelinesPage() {
  const toast = useToast()
  const { data: pipelines = [], isLoading } = usePipelines()
  const create     = useCreatePipeline()
  const update     = useUpdatePipeline()
  const setDefault = useSetDefaultPipeline()
  const del        = useDeletePipeline()

  const [createOpen,    setCreateOpen]    = useState(false)
  const [editTarget,    setEditTarget]    = useState<Pipeline | null>(null)
  const [deleteTarget,  setDeleteTarget]  = useState<Pipeline | null>(null)

  const handleCreate = (data: PipelineFormData) => {
    create.mutate(data, {
      onSuccess: () => {
        setCreateOpen(false)
        toast.addToast('Pipeline 已建立', 'success')
      },
      onError: (error: any) => {
        const message = error?.message || '無法建立 Pipeline'
        toast.addToast(message, 'error')
      }
    })
  }

  const handleUpdate = (data: PipelineFormData) => {
    if (!editTarget) return
    update.mutate({ id: editTarget.id, data }, {
      onSuccess: () => {
        setEditTarget(null)
        toast.addToast('Pipeline 已更新', 'success')
      },
      onError: (error: any) => {
        const message = error?.message || '無法更新 Pipeline'
        toast.addToast(message, 'error')
      }
    })
  }

  const handleDelete = () => {
    if (!deleteTarget) return
    del.mutate(deleteTarget.id, {
      onSuccess: () => {
        setDeleteTarget(null)
        toast.addToast('Pipeline 已刪除', 'success')
      },
      onError: (error: any) => {
        const message = error?.message || '無法刪除 Pipeline'
        toast.addToast(message, 'error')
      }
    })
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-48">
        <span className="w-6 h-6 border-2 border-[var(--color-accent)] border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="animate-fade-in">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-xl font-semibold">Pipeline 編輯器</h1>
          <p className="text-sm text-[var(--color-muted)] mt-1">定義 AI 執行流程與步驟順序</p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus size={16} /> 新增 Pipeline
        </Button>
      </div>

      {pipelines.length === 0 ? (
        <EmptyState
          icon={GitBranch}
          title="還沒有 Pipeline"
          description="建立 Pipeline，定義 Agent 執行順序"
          action={<Button onClick={() => setCreateOpen(true)}><Plus size={16} /> 新增 Pipeline</Button>}
        />
      ) : (
        <div className="flex flex-col gap-4">
          {pipelines.map(pipeline => (
            <div
              key={pipeline.id}
              className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius-lg)] p-5"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2 className="text-sm font-semibold">{pipeline.name}</h2>
                    {pipeline.isDefault && (
                      <span className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-[var(--color-accent)]/15 text-[var(--color-accent)]">
                        <Star size={10} fill="currentColor" /> 預設
                      </span>
                    )}
                  </div>
                  {pipeline.description && (
                    <p className="text-sm text-[var(--color-muted)] mt-1">{pipeline.description}</p>
                  )}

                  {/* Step list */}
                  <div className="flex items-center gap-2 flex-wrap mt-3">
                    {pipeline.steps.map((step, i) => (
                      <span key={step.id} className="flex items-center gap-1.5">
                        <span className="text-xs flex items-center gap-1 px-2 py-1 bg-[var(--color-surface-2)] rounded-[var(--radius-sm)]">
                          <span className="w-4 h-4 rounded-full bg-[var(--color-accent)] text-white text-[10px] flex items-center justify-center font-semibold">
                            {i + 1}
                          </span>
                          {step.agent.name}
                          <ProviderBadge provider={step.agent.modelProvider} />
                        </span>
                        {i < pipeline.steps.length - 1 && (
                          <span className="text-[var(--color-border)]">→</span>
                        )}
                      </span>
                    ))}
                  </div>

                  <p className="text-xs text-[var(--color-muted)] mt-2">
                    修正 Agent：{pipeline.fixerAgent.name}
                  </p>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1 shrink-0">
                  {!pipeline.isDefault && (
                    <button
                      onClick={() => setDefault.mutate(pipeline.id)}
                      className="p-2 rounded-[var(--radius-md)] text-[var(--color-muted)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-accent)] transition-colors cursor-pointer"
                      aria-label="設為預設 Pipeline"
                      title="設為預設"
                    >
                      <Star size={15} />
                    </button>
                  )}
                  <button
                    onClick={() => setEditTarget(pipeline)}
                    className="p-2 rounded-[var(--radius-md)] text-[var(--color-muted)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-foreground)] transition-colors cursor-pointer"
                    aria-label="編輯 Pipeline"
                  >
                    <Pencil size={15} />
                  </button>
                  <button
                    onClick={() => setDeleteTarget(pipeline)}
                    className="p-2 rounded-[var(--radius-md)] text-[var(--color-muted)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-destructive)] transition-colors cursor-pointer"
                    aria-label="刪除 Pipeline"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create modal */}
      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="新增 Pipeline" size="xl">
        <PipelineForm onSubmit={handleCreate} loading={create.isPending} />
      </Modal>

      {/* Edit modal */}
      <Modal open={!!editTarget} onClose={() => setEditTarget(null)} title="編輯 Pipeline" size="xl">
        {editTarget && (
          <PipelineForm
            initial={{
              form: {
                name: editTarget.name,
                description: editTarget.description,
                fixerAgentId: editTarget.fixerAgentId,
                steps: editTarget.steps.map(s => ({ agentId: s.agentId, order: s.order, label: s.label })),
              },
              steps: editTarget.steps.map(s => ({
                _key: newKey(),
                agentId: s.agentId,
                label: s.label,
              })),
            }}
            onSubmit={handleUpdate}
            loading={update.isPending}
          />
        )}
      </Modal>

      {/* Delete confirm */}
      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="刪除 Pipeline"
        message={`確定要刪除「${deleteTarget?.name}」嗎？已建立的任務不受影響（使用快照）。`}
        loading={del.isPending}
      />
    </div>
  )
}
